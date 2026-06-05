package com.sntcptunnel

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native native module that implements a bidirectional TCP relay.
 *
 * <h2>Architecture</h2>
 * The module binds a [ServerSocket] on [listenPort] (default 8888) and, for each
 * incoming connection, opens a corresponding outbound [Socket] to the configured
 * [host]:[port]. Two threads per connection shuttle bytes in opposite directions
 * (full-duplex). All I/O threads are managed by a single [java.util.concurrent.CachedThreadPool]
 * so that connection concurrency is unbounded but idle threads are reclaimed promptly.
 *
 * <h2>Primary use-case</h2>
 * Supernote's native screen-sharing endpoint is only reachable over WiFi. When the
 * device is connected to a PC via USB, [adb forward] can map a PC-side port to
 * [listenPort] on the device, making the screen stream accessible at localhost on
 * the PC without any WiFi dependency.
 *
 * <h2>Lifecycle</h2>
 * <pre>
 * JS: startTunnel(host, port, listenPort)
 *   → binds ServerSocket
 *   → spawns accept-loop thread
 *   → posts ongoing notification
 *   → registers USB state BroadcastReceiver
 *
 * On USB disconnect (connected=false broadcast):
 *   → emits "onUsbDisconnect" event to JS
 *   → JS calls stopTunnel()
 *
 * JS: stopTunnel()
 *   → closes ServerSocket (interrupts accept-loop)
 *   → shuts down thread pool
 *   → cancels notification
 *   → unregisters BroadcastReceiver
 * </pre>
 *
 * <h2>Thread safety</h2>
 * [running] is an [AtomicBoolean] and is the single source of truth for relay state.
 * [serverSocket] and [executor] are only written from the React Native JS thread
 * (via [@ReactMethod] calls), so no additional locking is required for those fields.
 *
 * @param ctx Application-scoped React context injected by [TcpTunnelPackage].
 */
class TcpTunnelModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    companion object {
        private const val CHANNEL_ID = "tcp_tunnel"
        private const val NOTIF_ID = 1
        private const val CONFIG_FILE = "tunnel_config.json"
        private const val DEFAULT_HOST = "100.113.43.44"
        private const val DEFAULT_PORT = 8080
        private const val TAG = "TcpTunnelModule"
    }

    private val running = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private var executor: ExecutorService? = null
    private var usbReceiver: BroadcastReceiver? = null

    init {
        TunnelLogger.init()
        TunnelLogger.i(TAG, "TcpTunnelModule instantiated")
        TunnelLogger.i(TAG, "Config file: ${File(ctx.filesDir, CONFIG_FILE).absolutePath}")
    }

    override fun getName() = "TcpTunnelModule"

    // -------------------------------------------------------------------------
    // Public API — React Native @ReactMethod surface
    // -------------------------------------------------------------------------

    /**
     * Resolves the device's current IPv4 address on the active WiFi interface.
     */
    @ReactMethod
    @Suppress("DEPRECATION") // WifiManager.connectionInfo deprecated in API 31; Supernote targets API 30.
    fun getWifiIP(promise: Promise) {
        TunnelLogger.i(TAG, "getWifiIP called")
        try {
            val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ip = wm.connectionInfo.ipAddress
            val formatted = "%d.%d.%d.%d".format(
                ip and 0xff,
                ip shr 8 and 0xff,
                ip shr 16 and 0xff,
                ip shr 24 and 0xff,
            )
            TunnelLogger.i(TAG, "getWifiIP result: $formatted")
            promise.resolve(formatted)
        } catch (e: Exception) {
            TunnelLogger.e(TAG, "getWifiIP failed", e)
            promise.reject("WIFI_ERROR", e.message)
        }
    }

    /**
     * Starts the TCP relay.
     */
    @ReactMethod
    fun startTunnel(host: String, port: Int, listenPort: Int, promise: Promise) {
        TunnelLogger.i(TAG, "startTunnel called: host=$host port=$port listenPort=$listenPort")
        if (running.get()) {
            TunnelLogger.i(TAG, "startTunnel no-op: already running")
            promise.resolve(null)
            return
        }
        // Close any stale socket left from a previous session (e.g. after a crash or
        // PluginHost reload without stopTunnel being called).
        serverSocket?.let {
            TunnelLogger.i(TAG, "Closing stale serverSocket before new bind")
            try { it.close() } catch (_: Exception) {}
        }
        serverSocket = null
        executor?.shutdownNow()
        executor = null
        try {
            TunnelLogger.i(TAG, "Binding ServerSocket on port $listenPort...")
            val ss = ServerSocket(listenPort)
            serverSocket = ss
            TunnelLogger.i(TAG, "ServerSocket bound on port $listenPort — local address: ${ss.localSocketAddress}")
            running.set(true)
            // Capture executor in a local val so the accept-loop closure holds a
            // stable non-null reference. stopTunnel() nulls out the field from the
            // JS thread; without this capture, executor!! in the loop body could
            // race with that write and throw KotlinNullPointerException.
            val localExec = Executors.newCachedThreadPool()
            executor = localExec
            TunnelLogger.i(TAG, "Thread pool created")
            localExec.submit {
                TunnelLogger.i(TAG, "Accept-loop started — waiting for connections on port $listenPort")
                while (running.get()) {
                    try {
                        val client = ss.accept()
                        val remote = client.remoteSocketAddress
                        TunnelLogger.i(TAG, "Connection accepted from $remote")
                        localExec.submit { handleConnection(client, host, port) }
                    } catch (e: Exception) {
                        if (running.get()) {
                            TunnelLogger.e(TAG, "Accept-loop error (unexpected)", e)
                        } else {
                            TunnelLogger.i(TAG, "Accept-loop terminated (stopTunnel called)")
                        }
                        break
                    }
                }
                TunnelLogger.i(TAG, "Accept-loop exited")
            }
            showNotification(host, port, listenPort)
            TunnelLogger.i(TAG, "Notification posted")
            registerUsbReceiver()
            TunnelLogger.i(TAG, "USB receiver registered")
            TunnelLogger.i(TAG, "startTunnel SUCCESS — relay active on *:$listenPort → $host:$port")
            promise.resolve(null)
        } catch (e: Exception) {
            running.set(false)
            TunnelLogger.e(TAG, "startTunnel FAILED", e)
            promise.reject("START_ERROR", e.message)
        }
    }

    /**
     * Stops the TCP relay. Idempotent.
     */
    @ReactMethod
    fun stopTunnel(promise: Promise) {
        TunnelLogger.i(TAG, "stopTunnel called — running=${running.get()}")
        running.set(false)
        try { serverSocket?.close(); TunnelLogger.i(TAG, "ServerSocket closed") } catch (e: Exception) { TunnelLogger.e(TAG, "ServerSocket close error", e) }
        serverSocket = null
        executor?.shutdownNow()
        TunnelLogger.i(TAG, "Thread pool shut down")
        executor = null
        dismissNotification()
        TunnelLogger.i(TAG, "Notification dismissed")
        unregisterUsbReceiver()
        TunnelLogger.i(TAG, "USB receiver unregistered")
        TunnelLogger.i(TAG, "stopTunnel SUCCESS")
        promise.resolve(null)
    }

    /**
     * Returns whether the TCP relay is currently active.
     */
    @ReactMethod
    fun isRunning(promise: Promise) {
        val state = running.get()
        TunnelLogger.d(TAG, "isRunning → $state")
        promise.resolve(state)
    }

    /**
     * Persists the tunnel target configuration to internal storage.
     */
    @ReactMethod
    fun saveConfig(host: String, port: Int, promise: Promise) {
        TunnelLogger.i(TAG, "saveConfig called: host=$host port=$port")
        try {
            val json = JSONObject().apply {
                put("host", host)
                put("port", port)
            }
            val f = File(ctx.filesDir, CONFIG_FILE)
            f.writeText(json.toString())
            TunnelLogger.i(TAG, "saveConfig SUCCESS — written to ${f.absolutePath}")
            promise.resolve(null)
        } catch (e: Exception) {
            TunnelLogger.e(TAG, "saveConfig FAILED", e)
            promise.reject("SAVE_ERROR", e.message)
        }
    }

    /**
     * Reads the tunnel target configuration from internal storage.
     */
    @ReactMethod
    fun loadConfig(promise: Promise) {
        TunnelLogger.i(TAG, "loadConfig called")
        try {
            val file = File(ctx.filesDir, CONFIG_FILE)
            TunnelLogger.i(TAG, "Config file exists: ${file.exists()} — path: ${file.absolutePath}")
            val json = if (file.exists()) {
                val text = file.readText()
                TunnelLogger.d(TAG, "Config file content: $text")
                JSONObject(text)
            } else {
                TunnelLogger.i(TAG, "No config file — using defaults (host=$DEFAULT_HOST port=$DEFAULT_PORT)")
                JSONObject()
            }
            val host = json.optString("host", DEFAULT_HOST)
            val port = json.optInt("port", DEFAULT_PORT)
            TunnelLogger.i(TAG, "loadConfig result: host=$host port=$port")
            val map = Arguments.createMap().apply {
                putString("host", host)
                putInt("port", port)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            TunnelLogger.e(TAG, "loadConfig FAILED", e)
            promise.reject("LOAD_ERROR", e.message)
        }
    }

    /**
     * Writes a log entry from the JS layer to the same log file.
     * Called via TcpTunnelModule.writeLog(message) from index.js / App.tsx.
     */
    @ReactMethod
    fun writeLog(message: String, promise: Promise) {
        TunnelLogger.js(message)
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        TunnelLogger.d(TAG, "addListener: $eventName")
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        TunnelLogger.d(TAG, "removeListeners: count=$count")
    }

    // -------------------------------------------------------------------------
    // Private implementation
    // -------------------------------------------------------------------------

    private fun handleConnection(client: Socket, host: String, port: Int) {
        val remote = client.remoteSocketAddress
        TunnelLogger.i(TAG, "handleConnection start: $remote → $host:$port")
        try {
            Socket(host, port).use { target ->
                TunnelLogger.i(TAG, "Target socket connected to $host:$port for client $remote")
                client.use {
                    val t1 = Thread { pipe(client.inputStream, target.outputStream, "client→target [$remote]") }
                    val t2 = Thread { pipe(target.inputStream, client.outputStream, "target→client [$remote]") }
                    t1.start(); t2.start()
                    TunnelLogger.d(TAG, "Pipe threads started for $remote")
                    t1.join(); t2.join()
                    TunnelLogger.i(TAG, "handleConnection done: $remote — both pipe threads finished")
                }
            }
        } catch (e: Exception) {
            TunnelLogger.e(TAG, "handleConnection error for $remote", e)
        }
    }

    private fun pipe(input: InputStream, output: OutputStream, direction: String) {
        TunnelLogger.d(TAG, "pipe start: $direction")
        var totalBytes = 0L
        try {
            val buf = ByteArray(8192)
            var n: Int
            while (input.read(buf).also { n = it } != -1) {
                output.write(buf, 0, n)
                output.flush()
                totalBytes += n
            }
            TunnelLogger.d(TAG, "pipe end-of-stream: $direction — total ${totalBytes}B")
        } catch (e: Exception) {
            TunnelLogger.d(TAG, "pipe closed: $direction — total ${totalBytes}B — ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun showNotification(host: String, port: Int, listenPort: Int) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "TCP Tunnel", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setContentTitle("Tunnel active")
            .setContentText("IP:$listenPort → $host:$port")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setOngoing(true)
            .build()
        nm.notify(NOTIF_ID, notif)
    }

    private fun dismissNotification() {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_ID)
    }

    private fun registerUsbReceiver() {
        usbReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val connected = intent.getBooleanExtra("connected", false)
                TunnelLogger.i(TAG, "USB_STATE broadcast received: connected=$connected running=${running.get()}")
                if (!connected && running.get()) {
                    TunnelLogger.i(TAG, "USB disconnected while tunnel active — emitting onUsbDisconnect to JS")
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onUsbDisconnect", null)
                }
            }
        }
        ctx.registerReceiver(usbReceiver, IntentFilter("android.hardware.usb.action.USB_STATE"))
    }

    private fun unregisterUsbReceiver() {
        usbReceiver?.let {
            try { ctx.unregisterReceiver(it) } catch (e: Exception) { TunnelLogger.e(TAG, "unregisterReceiver error", e) }
            usbReceiver = null
        }
    }
}
