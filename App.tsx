/**
 * @file App.tsx
 * @description Main control panel for sn-TCP-Tunnel.
 *
 * Shown when the user taps the sidebar toggle button.
 * Displays current tunnel state and lets the user start/stop the relay,
 * copy the adb forward command, and open inline settings.
 */

import React, {useEffect, useState} from 'react';
import {
  Alert,
  Image,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {isValidPort} from './src/validation';

const {TcpTunnelModule} = NativeModules;

const LISTEN_PORT = 8888;

const iconOff = Image.resolveAssetSource(require('./assets/icon/icon_off.png')).uri;
const iconOn = Image.resolveAssetSource(require('./assets/icon/icon_on.png')).uri;

function toast(msg: string) {
  ToastAndroid.showWithGravity(msg, ToastAndroid.SHORT, ToastAndroid.TOP);
  TcpTunnelModule.writeLog(`[${new Date().toISOString()}] [App/toast] ${msg}`).catch(
    () => {},
  );
}

function log(tag: string, msg: string) {
  const line = `[${new Date().toISOString()}] [App/${tag}] ${msg}`;
  TcpTunnelModule.writeLog(line).catch(() => {});
}

export default function App(): React.JSX.Element {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [wifiIP, setWifiIP] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    log('mount', 'Panel opened — reading state');
    Promise.all([
      TcpTunnelModule.isRunning(),
      TcpTunnelModule.loadConfig(),
      TcpTunnelModule.getWifiIP().catch(() => ''),
    ]).then(([r, cfg, ip]: [boolean, {host: string; port: number}, string]) => {
      log('mount', `isRunning=${r} host=${cfg.host} port=${cfg.port} wifiIP=${ip}`);
      setRunning(r);
      setHost(cfg.host);
      setPort(String(cfg.port));
      setWifiIP(ip);
    }).catch((e: unknown) => {
      log('mount', `init failed: ${String(e)}`);
      Alert.alert('Errore', 'Impossibile leggere lo stato del tunnel.');
    });
  }, []);

  async function handleToggle() {
    setLoading(true);
    try {
      if (running) {
        log('toggle', 'Calling stopTunnel...');
        await TcpTunnelModule.stopTunnel();
        setRunning(false);
        PluginManager.unregisterButton(100);
        PluginManager.registerButton(1, ['NOTE', 'DOC'], {
          id: 100,
          name: 'TCP Tunnel',
          icon: iconOff,
          enable: true,
          expandButton: 0,
        });
        toast('Tunnel spento');
        log('toggle', 'stopTunnel SUCCESS');
        PluginManager.closePluginView();
      } else {
        log('toggle', `Calling startTunnel: host=${host} port=${port} listenPort=${LISTEN_PORT}`);
        const portNum = parseInt(port, 10);
        await TcpTunnelModule.startTunnel(host.trim(), portNum, LISTEN_PORT);
        setRunning(true);
        PluginManager.unregisterButton(100);
        PluginManager.registerButton(1, ['NOTE', 'DOC'], {
          id: 100,
          name: 'TCP Tunnel',
          icon: iconOn,
          enable: true,
          expandButton: 0,
        });
        toast('Tunnel acceso ✓');
        log('toggle', 'startTunnel SUCCESS');
        PluginManager.closePluginView();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('toggle', `FAILED: ${msg}`);
      Alert.alert('Errore', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const trimmedHost = host.trim();
    if (!trimmedHost) {
      Alert.alert('Host non valido', 'Il campo host non può essere vuoto.');
      return;
    }
    const portNum = parseInt(port, 10);
    if (!isValidPort(portNum)) {
      Alert.alert('Porta non valida', 'La porta deve essere tra 1 e 65535.');
      return;
    }
    log('save', `Saving: host=${trimmedHost} port=${portNum}`);
    TcpTunnelModule.saveConfig(trimmedHost, portNum)
      .then(() => {
        log('save', 'saveConfig SUCCESS');
        toast('Impostazioni salvate');
        setShowSettings(false);
      })
      .catch((e: unknown) => {
        log('save', `saveConfig FAILED: ${String(e)}`);
        Alert.alert('Errore', 'Impossibile salvare la configurazione.');
      });
  }

  const adbCommand = `adb forward tcp:8080 tcp:${LISTEN_PORT}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TCP Tunnel</Text>
        <TouchableOpacity onPress={() => PluginManager.closePluginView()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        <View style={[styles.dot, running ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.statusText}>{running ? 'ATTIVO' : 'INATTIVO'}</Text>
        {wifiIP ? <Text style={styles.wifiText}>  WiFi: {wifiIP}</Text> : null}
      </View>

      {/* Toggle button */}
      <TouchableOpacity
        style={[styles.toggleBtn, loading && styles.toggleBtnDisabled]}
        onPress={handleToggle}
        disabled={loading}>
        <Text style={styles.toggleBtnText}>
          {loading ? '...' : running ? 'SPEGNI TUNNEL' : 'AVVIA TUNNEL'}
        </Text>
      </TouchableOpacity>

      {/* ADB command — shown only when active */}
      {running && (
        <View style={styles.adbBox}>
          <Text style={styles.adbLabel}>Comando PC:</Text>
          <Text style={styles.adbCommand}>{adbCommand}</Text>
        </View>
      )}

      {/* Settings toggle */}
      <TouchableOpacity
        style={styles.settingsBtn}
        onPress={() => setShowSettings(s => !s)}>
        <Text style={styles.settingsBtnText}>
          {showSettings ? '▲ Chiudi impostazioni' : '⚙ Impostazioni'}
        </Text>
      </TouchableOpacity>

      {/* Inline settings panel */}
      {showSettings && (
        <View style={styles.settingsPanel}>
          <Text style={styles.label}>Host destinazione</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="100.113.43.44"
            placeholderTextColor="#888"
          />
          <Text style={styles.label}>Porta destinazione</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            keyboardType="numeric"
            placeholder="8080"
            placeholderTextColor="#888"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Salva</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#000',
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 8,
    borderWidth: 2,
    borderColor: '#000',
  },
  dotOn: {
    backgroundColor: '#000',
  },
  dotOff: {
    backgroundColor: '#fff',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  wifiText: {
    fontSize: 13,
    color: '#555',
  },
  toggleBtn: {
    backgroundColor: '#000',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  toggleBtnDisabled: {
    backgroundColor: '#888',
  },
  toggleBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  adbBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
    backgroundColor: '#f8f8f8',
  },
  adbLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  adbCommand: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#000',
  },
  settingsBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  settingsBtnText: {
    fontSize: 14,
    color: '#555',
  },
  settingsPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    fontSize: 14,
    color: '#000',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  saveBtn: {
    marginTop: 14,
    backgroundColor: '#000',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
