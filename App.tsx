/**
 * @file App.tsx
 * @description Configuration view for the sn-TCP-Tunnel plugin.
 *
 * This component is rendered inside the Supernote PluginHost plugin pane when the
 * user taps the Tunnel Config toolbar button. It allows the user to inspect the
 * device's current WiFi IP and to change the TCP relay's target host and port.
 *
 * Lifecycle:
 *  - On mount: loads persisted configuration and current WiFi IP from native layer.
 *  - On save: validates port range, persists via TcpTunnelModule.saveConfig, then
 *    closes the plugin view.
 *  - On cancel: closes the plugin view without writing any changes.
 *
 * Note: changes to host/port take effect on the next tunnel activation. If the
 * tunnel is already running when the user saves, the new configuration will be
 * used on the next start (a restart is not triggered automatically).
 */

import React, {useEffect, useState} from 'react';
import {
  Alert,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {isValidPort} from './src/validation';

const {TcpTunnelModule} = NativeModules;

function log(tag: string, msg: string) {
  const line = `[${new Date().toISOString()}] [App/${tag}] ${msg}`;
  TcpTunnelModule.writeLog(line).catch(() => {});
}

/**
 * Root component for the plugin configuration view.
 *
 * Renders a form with:
 *  - A read-only field showing the device's current WiFi IP address.
 *  - An editable field for the relay target host.
 *  - An editable field for the relay target port (validated: 1–65535).
 *  - Save and Cancel actions.
 *
 * @returns {React.JSX.Element} The rendered configuration form.
 */
export default function App(): React.JSX.Element {
  /** Target host, bound to the TextInput for editing. */
  const [host, setHost] = useState('');

  /** Target port as a string to allow free-form input before numeric validation on save. */
  const [port, setPort] = useState('');

  /** Device WiFi IP, read-only, fetched from TcpTunnelModule.getWifiIP on mount. */
  const [wifiIP, setWifiIP] = useState('');

  /**
   * On mount: load persisted config and WiFi IP concurrently.
   * WiFi IP errors are silently ignored because the device may not be on WiFi
   * (the tunnel still works over USB regardless of WiFi state).
   */
  useEffect(() => {
    log('mount', 'Config view mounted — loading config and WiFi IP');
    TcpTunnelModule.loadConfig()
      .then((cfg: {host: string; port: number}) => {
        log('mount', `Config loaded: host=${cfg.host} port=${cfg.port}`);
        setHost(cfg.host);
        setPort(String(cfg.port));
      })
      .catch((e: unknown) => {
        log('mount', `loadConfig FAILED: ${String(e)}`);
        Alert.alert('Error', 'Failed to load configuration.');
      });
    TcpTunnelModule.getWifiIP()
      .then((ip: string) => {
        log('mount', `WiFi IP: ${ip}`);
        setWifiIP(ip);
      })
      .catch(() => {
        log('mount', 'getWifiIP failed (device may not be on WiFi)');
      });
  }, []);

  /**
   * Validates the port field and, if valid, persists the configuration and closes
   * the plugin view.
   *
   * Port validation rejects NaN, 0, negative values, and values above 65535.
   * Host validation is intentionally lenient — the user is responsible for
   * providing a reachable address (hostname or dotted-decimal IP).
   */
  function handleSave() {
    const trimmedHost = host.trim();
    log('save', `handleSave called: host="${trimmedHost}" port="${port}"`);
    if (!trimmedHost) {
      log('save', 'Validation FAILED: host is empty');
      Alert.alert('Invalid host', 'Host cannot be empty.');
      return;
    }
    const portNum = parseInt(port, 10);
    if (!isValidPort(portNum)) {
      log('save', `Validation FAILED: port "${port}" → ${portNum} is not in 1–65535`);
      Alert.alert('Invalid port', 'Port must be 1–65535.');
      return;
    }
    log('save', `Validation OK — calling saveConfig: host=${trimmedHost} port=${portNum}`);
    TcpTunnelModule.saveConfig(trimmedHost, portNum)
      .then(() => {
        log('save', 'saveConfig SUCCESS — closing config view');
        PluginManager.closePluginView();
      })
      .catch((e: unknown) => {
        log('save', `saveConfig FAILED: ${String(e)}`);
        Alert.alert('Error', 'Failed to save configuration.');
      });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TCP Tunnel Config</Text>

      {/* Device WiFi IP — informational only, helps the user identify the device
          on the network without leaving the plugin view. */}
      <Text style={styles.label}>Device WiFi IP</Text>
      <Text style={styles.readonly}>{wifiIP || '—'}</Text>

      <Text style={styles.label}>Target Host</Text>
      <TextInput
        style={styles.input}
        value={host}
        onChangeText={setHost}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        placeholder="100.113.43.44"
        placeholderTextColor="#888"
      />

      <Text style={styles.label}>Target Port</Text>
      <TextInput
        style={styles.input}
        value={port}
        onChangeText={setPort}
        keyboardType="numeric"
        placeholder="8080"
        placeholderTextColor="#888"
      />

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>Save</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => PluginManager.closePluginView()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    color: '#000',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginTop: 16,
  },
  readonly: {
    fontSize: 15,
    color: '#555',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  input: {
    fontSize: 15,
    color: '#000',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveButton: {
    marginTop: 32,
    backgroundColor: '#000',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#555',
    fontSize: 15,
  },
});
