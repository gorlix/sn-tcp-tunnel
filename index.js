/**
 * @file index.js
 * @description Plugin entry point for sn-TCP-Tunnel.
 *
 * - Sidebar button (id=100): open App.tsx in control mode (start/stop panel).
 * - Config button (gear in plugin settings): open App.tsx in settings mode (host/port form).
 * - USB disconnect: stop tunnel without user interaction.
 */

import {AppRegistry, DeviceEventEmitter, Image, NativeModules, NativeEventEmitter} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {setViewMode} from './src/viewMode';

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
// Button listeners
// ---------------------------------------------------------------------------

PluginManager.registerButtonListener({
  onButtonPress: event => {
    log('button', `Button pressed: id=${event.id}`);
    if (event.id === 100) {
      setViewMode('control');
      PluginManager.showPluginView();
      DeviceEventEmitter.emit('tunnelViewMode', 'control');
    }
  },
});

/** Config button (gear icon in Supernote plugin settings panel). */
PluginManager.registerConfigButtonListener({
  onClick: () => {
    log('button', 'Config button pressed — opening settings view');
    setViewMode('settings');
    PluginManager.showPluginView();
    DeviceEventEmitter.emit('tunnelViewMode', 'settings');
  },
});

// ---------------------------------------------------------------------------
// USB disconnect — stop tunnel without UI
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

log('init', 'Registering buttons...');
registerMainButton(iconOff);
PluginManager.registerConfigButton();
log('init', 'Plugin ready');
