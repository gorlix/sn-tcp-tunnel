/**
 * @file index.js
 * @description Plugin entry point for the sn-TCP-Tunnel Supernote plugin.
 *
 * Responsibilities:
 *  - Register the main toggle button (id=100) and the config button (id=200)
 *    with PluginManager on startup.
 *  - Implement the activate/deactivate state machine that starts and stops
 *    the native TCP relay via TcpTunnelModule.
 *  - Swap the toolbar icon between icon_off and icon_on to reflect relay state.
 *  - Listen for the "onUsbDisconnect" native event and automatically deactivate
 *    the relay when the USB cable is removed.
 *
 * State machine:
 *  INACTIVE ──[button press]──► ACTIVE ──[button press / USB disconnect]──► INACTIVE
 *
 * Note: button re-registration (unregister + register with new icon) is the
 * mechanism provided by sn-plugin-lib to update a toolbar button's icon at runtime.
 * There is no separate "update icon" API.
 */

import {AppRegistry, Image, NativeModules, NativeEventEmitter} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const {TcpTunnelModule} = NativeModules;

/**
 * NativeEventEmitter instance bound to TcpTunnelModule.
 * Used to receive the "onUsbDisconnect" event emitted by the Kotlin BroadcastReceiver
 * when android.hardware.usb.action.USB_STATE reports connected=false.
 */
const emitter = new NativeEventEmitter(TcpTunnelModule);

/** Local port on which the TCP relay listens. PC-side: adb forward tcp:8080 tcp:8888. */
const LISTEN_PORT = 8888;

const iconOff = Image.resolveAssetSource(require('./assets/icon/icon_off.png')).uri;
const iconOn = Image.resolveAssetSource(require('./assets/icon/icon_on.png')).uri;

/**
 * Whether the TCP relay is currently active.
 * Kept as module-level state because PluginManager has no query API for button state.
 */
let active = false;

/**
 * Registers (or re-registers) the main toggle button with the given icon URI.
 *
 * Called on startup with iconOff and after each state transition to swap the icon.
 * Re-registration requires a preceding unregisterButton(100) call to avoid duplicates.
 *
 * @param {string} icon - Resolved asset URI for the button icon.
 */
function registerMainButton(icon) {
  PluginManager.registerButton(1, ['NOTE', 'DOC'], {
    id: 100,
    name: 'TCP Tunnel',
    icon,
    showType: 0,
  });
}

/**
 * Registers the config button that opens the App.tsx configuration view.
 * Called once on startup; the icon is static (always iconOff).
 */
function registerConfigButton() {
  PluginManager.registerButton(2, ['NOTE', 'DOC'], {
    id: 200,
    name: 'Tunnel Config',
    icon: iconOff,
    showType: 1,
  });
}

/**
 * Starts the TCP relay and transitions the UI to the active state.
 *
 * Sequence:
 *  1. Load persisted host/port configuration from native storage.
 *  2. Call TcpTunnelModule.startTunnel — binds the ServerSocket and posts notification.
 *  3. Set active=true.
 *  4. Swap the toolbar icon to iconOn.
 *
 * Errors are logged to the console but do not propagate; the button state remains
 * unchanged if activation fails, so the user can retry.
 *
 * @returns {Promise<void>}
 */
async function activate() {
  try {
    const config = await TcpTunnelModule.loadConfig();
    await TcpTunnelModule.startTunnel(config.host, config.port, LISTEN_PORT);
    active = true;
    PluginManager.unregisterButton(100);
    registerMainButton(iconOn);
  } catch (e) {
    console.error('activate failed', e);
  }
}

/**
 * Stops the TCP relay and transitions the UI to the inactive state.
 *
 * Sequence:
 *  1. Call TcpTunnelModule.stopTunnel — closes the ServerSocket, shuts down threads,
 *     dismisses the notification, and unregisters the USB BroadcastReceiver.
 *  2. Set active=false.
 *  3. Swap the toolbar icon back to iconOff.
 *
 * Errors are logged but do not propagate. In the unlikely event that stopTunnel
 * throws, the UI is still updated to iconOff to avoid a permanently stuck state.
 *
 * @returns {Promise<void>}
 */
async function deactivate() {
  try {
    await TcpTunnelModule.stopTunnel();
    active = false;
    PluginManager.unregisterButton(100);
    registerMainButton(iconOff);
  } catch (e) {
    console.error('deactivate failed', e);
  }
}

// ---------------------------------------------------------------------------
// Button click handlers
// ---------------------------------------------------------------------------

/**
 * Main toggle button (id=100): activates or deactivates the relay based on current state.
 */
PluginManager.onButtonClick(100, () => {
  if (active) {
    deactivate();
  } else {
    activate();
  }
});

/**
 * Config button (id=200): opens the App.tsx configuration view inside the plugin pane.
 */
PluginManager.onButtonClick(200, () => {
  PluginManager.openPluginView();
});

// ---------------------------------------------------------------------------
// USB disconnect auto-stop
// ---------------------------------------------------------------------------

/**
 * When the USB cable is removed while the relay is active, the Kotlin BroadcastReceiver
 * emits "onUsbDisconnect". The relay is stopped here rather than in Kotlin to keep
 * the teardown path identical to a manual button press and to allow JS-level tests
 * to cover this code path without a physical device.
 */
emitter.addListener('onUsbDisconnect', () => {
  if (active) {
    deactivate();
  }
});

// ---------------------------------------------------------------------------
// Initial registration
// ---------------------------------------------------------------------------

registerMainButton(iconOff);
registerConfigButton();
