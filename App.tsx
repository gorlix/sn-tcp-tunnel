/**
 * @file App.tsx
 * @description Plugin view for sn-TCP-Tunnel. Renders one of two screens:
 *
 *  - 'control': tunnel status, start/stop button, ADB command, link to settings.
 *  - 'settings': host/port form (accessible from gear icon in plugin settings panel).
 *
 * The screen is determined by getViewMode() which index.js sets before showPluginView().
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Image,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {isValidPort} from './src/validation';
import {getViewMode, setViewMode} from './src/viewMode';

const {TcpTunnelModule} = NativeModules;

const LISTEN_PORT = 8888;

const iconOff = Image.resolveAssetSource(require('./assets/icon/icon_off.png')).uri;
const iconOn = Image.resolveAssetSource(require('./assets/icon/icon_on.png')).uri;

function log(tag: string, msg: string) {
  TcpTunnelModule.writeLog(`[${new Date().toISOString()}] [App/${tag}] ${msg}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Banner (replaces ToastAndroid — Android 30+ ignores toast gravity)
// ---------------------------------------------------------------------------

function useBanner() {
  const [text, setText] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(msg: string, onDone?: () => void) {
    if (timer.current) {clearTimeout(timer.current);}
    setText(msg);
    opacity.setValue(1);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, {toValue: 0, duration: 300, useNativeDriver: true}).start(() => {
        onDone?.();
      });
    }, 1200);
  }

  return {text, opacity, show};
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const initialScreen = getViewMode();
  const [screen, setScreen] = useState<'control' | 'settings'>(initialScreen);

  // Control screen state
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);

  // Settings screen state
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');

  const banner = useBanner();

  useEffect(() => {
    log('mount', `Panel opened — screen=${initialScreen}`);
    Promise.all([
      TcpTunnelModule.isRunning(),
      TcpTunnelModule.loadConfig(),
    ]).then(([r, cfg]: [boolean, {host: string; port: number}]) => {
      log('mount', `isRunning=${r} host=${cfg.host} port=${cfg.port}`);
      setRunning(r);
      setHost(cfg.host);
      setPort(String(cfg.port));
    }).catch((e: unknown) => {
      log('mount', `init failed: ${String(e)}`);
    });
  }, [initialScreen]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleToggle() {
    setLoading(true);
    try {
      if (running) {
        log('toggle', 'Calling stopTunnel...');
        await TcpTunnelModule.stopTunnel();
        setRunning(false);
        PluginManager.unregisterButton(100);
        PluginManager.registerButton(1, ['NOTE', 'DOC'], {
          id: 100, name: 'TCP Tunnel', icon: iconOff, enable: true, expandButton: 0,
        });
        log('toggle', 'stopTunnel SUCCESS');
        banner.show('Tunnel spento', () => PluginManager.closePluginView());
      } else {
        log('toggle', `Calling startTunnel: host=${host} port=${port} listenPort=${LISTEN_PORT}`);
        const portNum = parseInt(port, 10);
        await TcpTunnelModule.startTunnel(host.trim(), portNum, LISTEN_PORT);
        setRunning(true);
        PluginManager.unregisterButton(100);
        PluginManager.registerButton(1, ['NOTE', 'DOC'], {
          id: 100, name: 'TCP Tunnel', icon: iconOn, enable: true, expandButton: 0,
        });
        log('toggle', 'startTunnel SUCCESS');
        banner.show('Tunnel acceso ✓', () => PluginManager.closePluginView());
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('toggle', `FAILED: ${msg}`);
      Alert.alert('Errore', msg);
    } finally {
      setLoading(false);
    }
  }

  function openSettings() {
    setViewMode('settings');
    setScreen('settings');
  }

  function backToControl() {
    setViewMode('control');
    setScreen('control');
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
    try {
      await TcpTunnelModule.saveConfig(trimmedHost, portNum);
      log('save', 'saveConfig SUCCESS');
      banner.show('Impostazioni salvate', backToControl);
    } catch (e: unknown) {
      log('save', `saveConfig FAILED: ${String(e)}`);
      Alert.alert('Errore', 'Impossibile salvare la configurazione.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* Top notification banner (replaces ToastAndroid — Android 30+ ignores gravity) */}
      {banner.text ? (
        <Animated.View style={[styles.banner, {opacity: banner.opacity}]}>
          <Text style={styles.bannerText}>{banner.text}</Text>
        </Animated.View>
      ) : null}

      {screen === 'control' ? (
        <ControlScreen
          running={running}
          loading={loading}
          onToggle={handleToggle}
          onSettings={openSettings}
          onClose={() => PluginManager.closePluginView()}
        />

      ) : (
        <SettingsScreen
          host={host}
          port={port}
          onHostChange={setHost}
          onPortChange={setPort}
          onSave={handleSave}
          onBack={backToControl}
          onClose={() => PluginManager.closePluginView()}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Control screen
// ---------------------------------------------------------------------------

function ControlScreen({running, loading, onToggle, onSettings, onClose}: {
  running: boolean;
  loading: boolean;
  onToggle: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TCP Tunnel</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.dot, running ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.statusText}>{running ? 'ATTIVO' : 'INATTIVO'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.toggleBtn, loading && styles.toggleBtnDisabled]}
        onPress={onToggle}
        disabled={loading}>
        <Text style={styles.toggleBtnText}>
          {loading ? '...' : running ? 'SPEGNI TUNNEL' : 'AVVIA TUNNEL'}
        </Text>
      </TouchableOpacity>

      {running && (
        <View style={styles.adbBox}>
          <Text style={styles.adbLabel}>Comando PC:</Text>
          <Text style={styles.adbCommand}>
            {'adb forward tcp:8080 tcp:' + LISTEN_PORT}
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.settingsLink} onPress={onSettings}>
        <Text style={styles.settingsLinkText}>⚙ Impostazioni</Text>
      </TouchableOpacity>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

function SettingsScreen({host, port, onHostChange, onPortChange, onSave, onBack, onClose}: {
  host: string;
  port: string;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onSave: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Indietro</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.settingsTitle}>Impostazioni tunnel</Text>

      <Text style={styles.label}>Host destinazione</Text>
      <TextInput
        style={styles.input}
        value={host}
        onChangeText={onHostChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="100.113.43.44"
        placeholderTextColor="#888"
      />

      <Text style={styles.label}>Porta destinazione</Text>
      <TextInput
        style={styles.input}
        value={port}
        onChangeText={onPortChange}
        keyboardType="numeric"
        placeholder="8080"
        placeholderTextColor="#888"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
        <Text style={styles.saveBtnText}>Salva</Text>
      </TouchableOpacity>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    zIndex: 10,
    alignItems: 'center',
  },
  bannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  backBtn: {padding: 6},
  backBtnText: {fontSize: 14, color: '#000'},
  closeBtn: {padding: 6},
  closeBtnText: {fontSize: 18, color: '#000', fontWeight: '700'},
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    marginRight: 8, borderWidth: 2, borderColor: '#000',
  },
  dotOn: {backgroundColor: '#000'},
  dotOff: {backgroundColor: '#fff'},
  statusText: {fontSize: 16, fontWeight: '700', color: '#000'},

  toggleBtn: {
    backgroundColor: '#000', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginBottom: 20,
  },
  toggleBtnDisabled: {backgroundColor: '#888'},
  toggleBtnText: {color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5},
  adbBox: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 6,
    padding: 12, marginBottom: 20, backgroundColor: '#f8f8f8',
  },
  adbLabel: {fontSize: 11, color: '#888', marginBottom: 4},
  adbCommand: {fontFamily: 'monospace', fontSize: 13, color: '#000'},
  settingsLink: {
    paddingVertical: 10, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  settingsLinkText: {fontSize: 14, color: '#555'},
  settingsTitle: {
    fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 16,
  },
  label: {
    fontSize: 12, fontWeight: '600', color: '#333',
    marginBottom: 4, marginTop: 12,
  },
  input: {
    fontSize: 14, color: '#000', borderWidth: 1,
    borderColor: '#ccc', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  saveBtn: {
    marginTop: 20, backgroundColor: '#000',
    borderRadius: 6, paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
});
