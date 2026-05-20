package com.sntcptunnel

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext

/**
 * ReactPackage registration entry point for the TCP Tunnel native module.
 *
 * Registered in [MainApplication.getPackages]. React Native's autolinking does not
 * apply here because this module is bundled directly inside the app rather than
 * published as a standalone library.
 *
 * @see TcpTunnelModule
 */
class TcpTunnelPackage : ReactPackage {

    /**
     * Returns the list of native modules exposed to the JavaScript layer.
     *
     * @param ctx Application-scoped React context provided by the React Native runtime.
     * @return A singleton list containing [TcpTunnelModule].
     */
    override fun createNativeModules(ctx: ReactApplicationContext) = listOf(TcpTunnelModule(ctx))

    /**
     * No custom view managers are required by this package.
     *
     * @param ctx Application-scoped React context (unused).
     * @return An empty list.
     */
    override fun createViewManagers(ctx: ReactApplicationContext) =
        emptyList<com.facebook.react.uimanager.ViewManager<*, *>>()
}
