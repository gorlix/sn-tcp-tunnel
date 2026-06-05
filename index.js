/**
 * @file index.js
 * @description Plugin entry point for sn-TCP-Tunnel.
 *
 * Responsibilities:
 *  - Register the main toggle button (id=100) in the sidebar.
 *  - On button press: open the App.tsx control panel via showPluginView().
 *    The panel handles start/stop and updates the icon itself.
 *  - On USB disconnect: stop the tunnel automatically.
 *
 * All tunnel logic (start/stop, icon swap, Toast) lives in App.tsx so
 * the user has a single place to interact with the plugin.
 */

import {AppRegistry, Image, NativeModules, NativeEventEmitter} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const {TcpTunnelModule} = NativeModules;

function log(tag, msg) {
  TcpTunnelModule.writeLog(`[${new Date().toISOString()}] [${tag}] ${msg}`).catch(() => {});
}

const emitter = new NativeEventEmitter(TcpTunnelModule);

log('init', 'index.js loaded');

const iconOff = Image.resolveAssetSource(require('./assets/icon/icon_off.png')).uri;

// ---------------------------------------------------------------------------
// Button registration
// ---------------------------------------------------------------------------

function registerMainButton(icon) {
  PluginManager.registerButton(1, ['NOTE', 'DOC'], {
    id: 100,
    name: 'TCP Tunnel',
    icon,
    enable: true,
    expandButton: 0,
  });
}

// ---------------------------------------------------------------------------
// Button click — open control panel
// ---------------------------------------------------------------------------

PluginManager.registerButtonListener({
  onButtonPress: event => {
    log('button', `Button pressed: id=${event.id}`);
    if (event.id === 100) {
      PluginManager.showPluginView();
    }
  },
});

// ---------------------------------------------------------------------------
// USB disconnect — stop tunnel without user interaction
// ---------------------------------------------------------------------------

emitter.addListener('onUsbDisconnect', () => {
  log('USB', 'USB disconnected — stopping tunnel');
  TcpTunnelModule.stopTunnel()
    .then(() => log('USB', 'stopTunnel SUCCESS after USB disconnect'))
    .catch(e => log('USB', `stopTunnel error: ${e?.message ?? e}`));
});

// ---------------------------------------------------------------------------
// Initial registration
// ---------------------------------------------------------------------------

log('init', 'Registering main button...');
registerMainButton(iconOff);
log('init', 'Plugin ready');
