/**
 * @file index.js
 * @description Plugin entry point for the sn-TCP-Tunnel Supernote plugin.
 *
 * Responsibilities:
 *  - Register the main toggle button (id=100) in the sidebar via registerButton(type=1).
 *  - Register the config button via registerConfigButton() so it appears in the
 *    plugin settings panel.
 *  - Implement the activate/deactivate state machine that starts and stops
 *    the native TCP relay via TcpTunnelModule.
 *  - Swap the toolbar icon between icon_off and icon_on to reflect relay state.
 *  - Listen for the "onUsbDisconnect" native event and automatically deactivate
 *    the relay when the USB cable is removed.
 *
 * State machine:
 *  INACTIVE ──[button press]──► ACTIVE ──[button press / USB disconnect]──► INACTIVE
 *
 * Button API notes (sn-plugin-lib):
 *  - registerButton(type, appTypes, button): type 1=sidebar, 2=lasso, 3=doc selection
 *  - registerConfigButton(): registers the settings/gear button in the plugin panel
 *  - Button clicks arrive via registerButtonListener({ onButtonPress(event) })
 *  - Config button clicks via registerConfigButtonListener({ onClick() })
 *  - Icon swap = unregisterButton(id) + registerButton(...) with new icon
 *  - PluginButton.enable must be true for the button to be interactive
 */

import {AppRegistry, Image, NativeModules, NativeEventEmitter} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const {TcpTunnelModule} = NativeModules;

/**
 * Fire-and-forget logger. Writes to the native log file + logcat tag snTCPTunnel.
 * @param {string} tag  Short category label.
 * @param {string} msg  Human-readable message.
 */
function log(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}`;
  TcpTunnelModule.writeLog(line).catch(() => {});
}

/**
 * NativeEventEmitter bound to TcpTunnelModule.
 * Receives "onUsbDisconnect" from the Kotlin BroadcastReceiver.
 */
const emitter = new NativeEventEmitter(TcpTunnelModule);

/** Local port on which the TCP relay listens. PC-side: adb forward tcp:8080 tcp:8888. */
const LISTEN_PORT = 8888;

log('init', `index.js loaded — LISTEN_PORT=${LISTEN_PORT}`);

const iconOff = Image.resolveAssetSource(require('./assets/icon/icon_off.png')).uri;
const iconOn = Image.resolveAssetSource(require('./assets/icon/icon_on.png')).uri;

/**
 * Whether the TCP relay is currently active.
 * Set optimistically before any await to prevent double-tap re-entry.
 */
let active = false;

/**
 * Registers (or re-registers) the main sidebar toggle button.
 * enable:true is required — default is false (disabled/greyed out).
 * Re-registration requires a preceding unregisterButton(100) call.
 *
 * @param {string} icon - Resolved asset URI for the button icon.
 */
function registerMainButton(icon) {
  PluginManager.registerButton(1, ['NOTE', 'DOC'], {
    id: 100,
    name: 'TCP Tunnel',
    icon,
    enable: true,
    expandButton: 0,
  });
}

/**
 * Starts the TCP relay and transitions the UI to the active state.
 *
 * Sequence:
 *  1. Set active=true immediately to block re-entry on rapid double-tap.
 *  2. Load persisted host/port configuration from native storage.
 *  3. Call TcpTunnelModule.startTunnel.
 *  4. Swap the toolbar icon to iconOn.
 *
 * On error: active is reverted to false.
 *
 * @returns {Promise<void>}
 */
async function activate() {
  log('activate', 'activate() called — setting active=true');
  active = true;
  try {
    log('activate', 'Loading config from native...');
    const config = await TcpTunnelModule.loadConfig();
    log('activate', `Config loaded: host=${config.host} port=${config.port}`);
    log('activate', `Calling startTunnel: host=${config.host} port=${config.port} listenPort=${LISTEN_PORT}`);
    await TcpTunnelModule.startTunnel(config.host, config.port, LISTEN_PORT);
    log('activate', 'startTunnel succeeded — swapping icon to ON');
    PluginManager.unregisterButton(100);
    registerMainButton(iconOn);
    log('activate', 'activate() SUCCESS — tunnel active');
  } catch (e) {
    active = false;
    log('activate', `activate() FAILED — reverting active=false — error: ${e?.message ?? e}`);
    console.error('activate failed', e);
  }
}

/**
 * Stops the TCP relay and transitions the UI to the inactive state.
 *
 * Sequence:
 *  1. Set active=false immediately to block re-entry on rapid double-tap.
 *  2. Call TcpTunnelModule.stopTunnel.
 *  3. Swap the toolbar icon back to iconOff.
 *
 * On error: active is reverted to true.
 *
 * @returns {Promise<void>}
 */
async function deactivate() {
  log('deactivate', 'deactivate() called — setting active=false');
  active = false;
  try {
    log('deactivate', 'Calling stopTunnel...');
    await TcpTunnelModule.stopTunnel();
    log('deactivate', 'stopTunnel succeeded — swapping icon to OFF');
    PluginManager.unregisterButton(100);
    registerMainButton(iconOff);
    log('deactivate', 'deactivate() SUCCESS — tunnel stopped');
  } catch (e) {
    active = true;
    log('deactivate', `deactivate() FAILED — reverting active=true — error: ${e?.message ?? e}`);
    console.error('deactivate failed', e);
  }
}

// ---------------------------------------------------------------------------
// Button click handlers
// ---------------------------------------------------------------------------

/**
 * Main sidebar button (id=100): toggle relay on/off.
 * Clicks arrive via onButtonPress(event) where event.id identifies the button.
 */
PluginManager.registerButtonListener({
  onButtonPress: event => {
    log('button', `Button pressed: id=${event.id} name=${event.name}`);
    if (event.id === 100) {
      if (active) {
        deactivate();
      } else {
        activate();
      }
    }
  },
});

/**
 * Config button (gear icon in plugin settings panel): opens the App.tsx
 * configuration view. Registered separately via registerConfigButton().
 */
PluginManager.registerConfigButtonListener({
  onClick: () => {
    log('button', 'Config button pressed — showing plugin view');
    PluginManager.showPluginView();
  },
});

// ---------------------------------------------------------------------------
// USB disconnect auto-stop
// ---------------------------------------------------------------------------

/**
 * When the USB cable is removed while the relay is active, the Kotlin BroadcastReceiver
 * emits "onUsbDisconnect". The relay is stopped here (not in Kotlin) so the teardown
 * path is identical to a manual button press and testable without a physical device.
 */
emitter.addListener('onUsbDisconnect', () => {
  log('USB', `onUsbDisconnect event received — active=${active}`);
  if (active) {
    log('USB', 'Tunnel active on USB disconnect — calling deactivate()');
    deactivate();
  } else {
    log('USB', 'Tunnel already inactive — no-op');
  }
});

// ---------------------------------------------------------------------------
// Initial registration
// ---------------------------------------------------------------------------

log('init', 'Registering buttons...');
registerMainButton(iconOff);
PluginManager.registerConfigButton();
log('init', 'Buttons registered — plugin ready');
