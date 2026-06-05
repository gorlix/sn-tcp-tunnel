package com.sntcptunnel

import android.content.Context
import android.os.Environment
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Singleton file logger for sn-TCP-Tunnel.
 *
 * Writes timestamped entries to MYSTYLE/plugins/snTCPTunnel.log on external
 * storage. Falls back to app internal storage if the SD path is not writable.
 * Rotates the log file (rename to .bak, start fresh) when it exceeds 512 KB
 * so the file stays readable on the Supernote.
 *
 * All writes are serialised via [lock] — safe to call from any thread.
 */
object TunnelLogger {

    private const val LOGCAT_TAG = "snTCPTunnel"
    private const val LOG_FILE_NAME = "snTCPTunnel.log"
    private const val MAX_BYTES = 512L * 1024

    private val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val lock = Any()

    @Volatile private var logFile: File? = null

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    /**
     * Must be called once from [TcpTunnelModule] constructor.
     * Resolves the log file path and writes an opening banner.
     */
    fun init(ctx: Context) {
        val f = resolveFile(ctx)
        logFile = f
        write("INFO", "TunnelLogger", "=== snTCPTunnel plugin started ===")
        write("INFO", "TunnelLogger", "Log file: ${f.absolutePath}")
        write("INFO", "TunnelLogger", "Android SDK: ${android.os.Build.VERSION.SDK_INT} | Device: ${android.os.Build.MODEL}")
    }

    // -------------------------------------------------------------------------
    // Logging helpers
    // -------------------------------------------------------------------------

    fun i(tag: String, msg: String) = write("INFO ", tag, msg)

    fun e(tag: String, msg: String, ex: Throwable? = null) {
        val detail = if (ex != null) "$msg — ${ex::class.java.simpleName}: ${ex.message}" else msg
        write("ERROR", tag, detail)
    }

    fun d(tag: String, msg: String) = write("DEBUG", tag, msg)

    /** Called from JS via the writeLog ReactMethod. */
    fun js(msg: String) = write("JS   ", "JS", msg)

    fun getLogPath(): String = logFile?.absolutePath ?: "(not initialised)"

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    private fun write(level: String, tag: String, msg: String) {
        val line = "${fmt.format(Date())} [$level] [$tag] $msg"
        Log.d(LOGCAT_TAG, "[$tag] $msg")
        val f = logFile ?: return
        synchronized(lock) {
            try {
                if (f.length() > MAX_BYTES) rotate(f)
                f.appendText(line + "\n")
            } catch (_: Exception) {
                // If file write fails, logcat is the fallback — nothing more to do.
            }
        }
    }

    private fun rotate(f: File) {
        try {
            val bak = File(f.parent, "${f.name}.bak")
            f.copyTo(bak, overwrite = true)
            f.writeText("=== log rotated — previous entries in ${bak.name} ===\n")
        } catch (_: Exception) {}
    }

    private fun resolveFile(ctx: Context): File {
        // Primary: /sdcard/MYSTYLE/plugins/
        try {
            @Suppress("DEPRECATION")
            val ext = Environment.getExternalStorageDirectory()
            val dir = File(ext, "MYSTYLE/plugins")
            dir.mkdirs()
            if (dir.isDirectory && dir.canWrite()) return File(dir, LOG_FILE_NAME)
        } catch (_: Exception) {}
        // Fallback: internal app storage (not visible to user without ADB)
        Log.w(LOGCAT_TAG, "External storage not writable — logging to internal storage")
        return File(ctx.filesDir, LOG_FILE_NAME)
    }
}
