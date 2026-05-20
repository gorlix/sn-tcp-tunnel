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
        /** Android notification channel identifier for the persistent tunnel notification. */
        private const val CHANNEL_ID = "tcp_tunnel"

        /** Stable notification ID; using a fixed ID ensures only one notification exists at a time. */
        private const val NOTIF_ID = 1

        /** Filename for the JSON configuration stored in [android.content.Context.getFilesDir]. */
        private const val CONFIG_FILE = "tunnel_config.json"

        /** Fallback remote host when no saved configuration is present. */
        private const val DEFAULT_HOST = "100.113.43.44"

        /** Fallback remote port when no saved configuration is present. */
        private const val DEFAULT_PORT = 8080
    }

    /**
     * Indicates whether the TCP relay is currently accepting connections.
     * Written from the JS thread; read from both the JS thread and the accept-loop thread.
     */
    private val running = AtomicBoolean(false)

    /** Server socket bound to [listenPort]. Null when the relay is stopped. */
    private var serverSocket: ServerSocket? = null

    /**
     * Thread pool managing the accept-loop and all per-connection pipe threads.
     * Uses a cached pool so that threads are reused across short-lived connections.
     */
    private var executor: ExecutorService? = null

    /**
     * Receiver that listens for [android.hardware.usb.action.USB_STATE] broadcasts.
     * Registered on tunnel start; unregistered on tunnel stop. Null when unregistered.
     */
    private var usbReceiver: BroadcastReceiver? = null

    /**
     * Returns the module name exposed to the JavaScript layer via [NativeModules].
     *
     * @return The string "TcpTunnelModule".
     */
    override fun getName() = "TcpTunnelModule"

    // -------------------------------------------------------------------------
    // Public API — React Native @ReactMethod surface
    // -------------------------------------------------------------------------

    /**
     * Resolves the device's current IPv4 address on the active WiFi interface.
     *
     * The address is formatted as a dotted-decimal string (e.g. "192.168.1.42").
     * The raw integer returned by [WifiManager] is stored in little-endian byte order,
     * hence the explicit byte extraction rather than [java.net.InetAddress.getByAddress].
     *
     * @param promise Resolved with the IP string, or rejected with code "WIFI_ERROR"
     *                if WiFi is unavailable or an exception occurs.
     */
    @ReactMethod
    fun getWifiIP(promise: Promise) {
        try {
            val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ip = wm.connectionInfo.ipAddress
            val formatted = "%d.%d.%d.%d".format(
                ip and 0xff,
                ip shr 8 and 0xff,
                ip shr 16 and 0xff,
                ip shr 24 and 0xff,
            )
            promise.resolve(formatted)
        } catch (e: Exception) {
            promise.reject("WIFI_ERROR", e.message)
        }
    }

    /**
     * Starts the TCP relay.
     *
     * Binds a [ServerSocket] on [listenPort] and spawns an accept-loop on the thread pool.
     * Each accepted connection is handled by [handleConnection] on a separate pool thread.
     * If the relay is already running this method is a no-op and resolves immediately.
     *
     * Side effects:
     * - Posts an ongoing status notification (see [showNotification]).
     * - Registers the USB disconnect receiver (see [registerUsbReceiver]).
     *
     * @param host       Remote hostname or IP to forward connections to.
     * @param port       Remote port to connect to for each accepted client.
     * @param listenPort Local port on which the [ServerSocket] will bind.
     * @param promise    Resolved with null on success, or rejected with code "START_ERROR"
     *                   if the socket cannot be bound (e.g. port already in use).
     */
    @ReactMethod
    fun startTunnel(host: String, port: Int, listenPort: Int, promise: Promise) {
        if (running.get()) {
            promise.resolve(null)
            return
        }
        try {
            val ss = ServerSocket(listenPort)
            serverSocket = ss
            running.set(true)
            executor = Executors.newCachedThreadPool()
            executor!!.submit {
                while (running.get()) {
                    try {
                        val client = ss.accept()
                        executor!!.submit { handleConnection(client, host, port) }
                    } catch (_: Exception) {
                        // ServerSocket.close() throws here when stopTunnel() is called;
                        // exit the loop cleanly.
                        break
                    }
                }
            }
            showNotification(host, port, listenPort)
            registerUsbReceiver()
            promise.resolve(null)
        } catch (e: Exception) {
            running.set(false)
            promise.reject("START_ERROR", e.message)
        }
    }

    /**
     * Stops the TCP relay.
     *
     * Closes the [ServerSocket] (which interrupts the accept-loop), shuts down the
     * thread pool (in-flight pipe threads are interrupted), dismisses the notification,
     * and unregisters the USB receiver. This method is idempotent.
     *
     * @param promise Always resolved with null; never rejected.
     */
    @ReactMethod
    fun stopTunnel(promise: Promise) {
        running.set(false)
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
        executor?.shutdownNow()
        executor = null
        dismissNotification()
        unregisterUsbReceiver()
        promise.resolve(null)
    }

    /**
     * Returns whether the TCP relay is currently active.
     *
     * @param promise Resolved with [Boolean] true if running, false otherwise.
     */
    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(running.get())
    }

    /**
     * Persists the tunnel target configuration to internal storage.
     *
     * Configuration is written as JSON to [CONFIG_FILE] inside [android.content.Context.getFilesDir].
     * The file is not world-readable; no additional encryption is applied because the
     * stored values (host and port) are not credentials.
     *
     * @param host    Remote hostname or IP to store.
     * @param port    Remote port number to store.
     * @param promise Resolved with null on success, or rejected with code "SAVE_ERROR".
     */
    @ReactMethod
    fun saveConfig(host: String, port: Int, promise: Promise) {
        try {
            val json = JSONObject().apply {
                put("host", host)
                put("port", port)
            }
            File(ctx.filesDir, CONFIG_FILE).writeText(json.toString())
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message)
        }
    }

    /**
     * Reads the tunnel target configuration from internal storage.
     *
     * If no configuration file exists, the returned map contains the compile-time
     * defaults ([DEFAULT_HOST] and [DEFAULT_PORT]).
     *
     * @param promise Resolved with a ReadableMap containing keys "host" (String)
     *                and "port" (Int), or rejected with code "LOAD_ERROR".
     */
    @ReactMethod
    fun loadConfig(promise: Promise) {
        try {
            val file = File(ctx.filesDir, CONFIG_FILE)
            val json = if (file.exists()) JSONObject(file.readText()) else JSONObject()
            val map = Arguments.createMap().apply {
                putString("host", json.optString("host", DEFAULT_HOST))
                putInt("port", json.optInt("port", DEFAULT_PORT))
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message)
        }
    }

    /**
     * Required stub for [com.facebook.react.modules.core.RCTNativeAppEventEmitter] contract.
     * React Native calls this when the JS side adds a listener via [NativeEventEmitter].
     *
     * @param eventName Name of the event being subscribed to (e.g. "onUsbDisconnect").
     */
    @ReactMethod
    fun addListener(eventName: String) {}

    /**
     * Required stub for [com.facebook.react.modules.core.RCTNativeAppEventEmitter] contract.
     * React Native calls this when all JS listeners for an event are removed.
     *
     * @param count Number of listeners being removed.
     */
    @ReactMethod
    fun removeListeners(count: Int) {}

    // -------------------------------------------------------------------------
    // Private implementation
    // -------------------------------------------------------------------------

    /**
     * Handles a single accepted client connection.
     *
     * Opens an outbound [Socket] to [host]:[port] and starts two threads — one for
     * each direction — that copy bytes until the connection is closed or an error
     * occurs. Both threads are joined before the method returns, ensuring the sockets
     * are released promptly.
     *
     * Exceptions (connection refused, peer reset, etc.) are silently swallowed because
     * individual connection failures should not affect the overall relay lifecycle.
     *
     * @param client The inbound [Socket] accepted from the [ServerSocket].
     * @param host   Remote hostname or IP to connect to.
     * @param port   Remote port to connect to.
     */
    private fun handleConnection(client: Socket, host: String, port: Int) {
        try {
            Socket(host, port).use { target ->
                client.use {
                    val t1 = Thread { pipe(client.inputStream, target.outputStream) }
                    val t2 = Thread { pipe(target.inputStream, client.outputStream) }
                    t1.start(); t2.start()
                    t1.join(); t2.join()
                }
            }
        } catch (_: Exception) {}
    }

    /**
     * Copies bytes from [input] to [output] until end-of-stream or an I/O error.
     *
     * Uses an 8 KiB heap buffer, which balances per-read syscall overhead against
     * heap pressure. Output is flushed after every write to avoid stalling the
     * remote peer behind a partially-filled buffer.
     *
     * Exceptions (peer closed the connection, socket interrupted by [stopTunnel], etc.)
     * are silently swallowed; the caller detects termination via thread join.
     *
     * @param input  Source stream to read from.
     * @param output Destination stream to write to.
     */
    private fun pipe(input: InputStream, output: OutputStream) {
        try {
            val buf = ByteArray(8192)
            var n: Int
            while (input.read(buf).also { n = it } != -1) {
                output.write(buf, 0, n)
                output.flush()
            }
        } catch (_: Exception) {}
    }

    /**
     * Posts or updates the persistent foreground-style notification that indicates the
     * relay is active.
     *
     * On API 26+ a low-importance notification channel is created if it does not already
     * exist (the call is idempotent). The notification is marked [ongoing][android.app.Notification.FLAG_ONGOING_EVENT]
     * so the user cannot swipe it away while the relay is running.
     *
     * @param host       Remote hostname displayed in the notification body.
     * @param port       Remote port displayed in the notification body.
     * @param listenPort Local listen port displayed in the notification body.
     */
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

    /**
     * Cancels the persistent tunnel notification posted by [showNotification].
     */
    private fun dismissNotification() {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_ID)
    }

    /**
     * Registers a [BroadcastReceiver] for [android.hardware.usb.action.USB_STATE].
     *
     * When the USB cable is disconnected ([connected] extra is false) and the relay is
     * active, the receiver emits the "onUsbDisconnect" event to the JS layer, which is
     * responsible for calling [stopTunnel]. This decoupling ensures the teardown sequence
     * remains in JavaScript and is testable without a physical device.
     */
    private fun registerUsbReceiver() {
        usbReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val connected = intent.getBooleanExtra("connected", false)
                if (!connected && running.get()) {
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onUsbDisconnect", null)
                }
            }
        }
        ctx.registerReceiver(usbReceiver, IntentFilter("android.hardware.usb.action.USB_STATE"))
    }

    /**
     * Unregisters the USB state [BroadcastReceiver] previously registered by [registerUsbReceiver].
     *
     * Exceptions from [Context.unregisterReceiver] (e.g. receiver was never registered due to
     * an earlier failure) are suppressed to keep [stopTunnel] unconditionally safe to call.
     */
    private fun unregisterUsbReceiver() {
        usbReceiver?.let {
            try { ctx.unregisterReceiver(it) } catch (_: Exception) {}
            usbReceiver = null
        }
    }
}
