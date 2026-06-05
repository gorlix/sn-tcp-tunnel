package com.sntcptunnel

import android.util.Log

/**
 * Singleton logger for sn-TCP-Tunnel.
 *
 * All output goes to Android logcat under the tag "snTCPTunnel".
 * Read live on the PC with: adb logcat -v time -s snTCPTunnel
 *
 * The JS layer writes through the writeLog ReactMethod in TcpTunnelModule,
 * which calls [js], so native and JS events appear under the same tag.
 */
object TunnelLogger {

    private const val TAG = "snTCPTunnel"

    fun init() {
        i("TunnelLogger", "=== snTCPTunnel plugin started ===")
        i("TunnelLogger", "Android SDK: ${android.os.Build.VERSION.SDK_INT} | Device: ${android.os.Build.MODEL}")
    }

    fun i(tag: String, msg: String) = Log.d(TAG, "[$tag] $msg")

    fun e(tag: String, msg: String, ex: Throwable? = null) {
        val detail = if (ex != null) "$msg — ${ex::class.java.simpleName}: ${ex.message}" else msg
        Log.e(TAG, "[$tag] $detail")
    }

    fun d(tag: String, msg: String) = Log.d(TAG, "[$tag] $msg")

    fun js(msg: String) = Log.d(TAG, "[JS] $msg")
}
