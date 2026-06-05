/**
 * @file App.tsx
 * @description Plugin view for sn-TCP-Tunnel.
 * UI follows Supernote design language: black header, square corners,
 * thin separator lines, black primary buttons with white text.
 *
 * Screens:
 *  - 'control': status, start/stop, ADB command, link to settings.
 *  - 'settings': port presets + host/port form.
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  DeviceEventEmitter,
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

const DEFAULT_LISTEN_PORT = '8888';

const iconOff = Image.resolveAssetSource(require('./assets/icon/icon_off.png')).uri;
const iconOn = Image.resolveAssetSource(require('./assets/icon/icon_on.png')).uri;

function log(tag: string, msg: string) {
  TcpTunnelModule.writeLog(`[${new Date().toISOString()}] [App/${tag}] ${msg}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Banner — shows at top for 1.5 s then clears
// ---------------------------------------------------------------------------

function useBanner() {
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(msg: string, onDone?: () => void) {
    if (timer.current) {clearTimeout(timer.current);}
    setText(msg);
    timer.current = setTimeout(() => {
      setText('');
      onDone?.();
    }, 1500);
  }

  return {text, show};
}

// ---------------------------------------------------------------------------
// Shared header — black bar, boxed X left, centered title
// ---------------------------------------------------------------------------

function Header({title, onClose, onBack}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.closeBox} onPress={onClose}>
        <Text style={styles.closeBoxText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      {onBack ? (
        <TouchableOpacity style={styles.backBox} onPress={onBack}>
          <Text style={styles.backBoxText}>Indietro</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const initialScreen = getViewMode();
  const [screen, setScreen] = useState<'control' | 'settings'>(initialScreen);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [listenPort, setListenPort] = useState(DEFAULT_LISTEN_PORT);
  const banner = useBanner();

  function loadState() {
    Promise.all([
      TcpTunnelModule.isRunning(),
      TcpTunnelModule.loadConfig(),
    ]).then(([r, cfg]: [boolean, {host: string; port: number; listenPort: number}]) => {
      log('state', `isRunning=${r} host=${cfg.host} port=${cfg.port} listenPort=${cfg.listenPort}`);
      setRunning(r);
      setHost(cfg.host);
      setPort(String(cfg.port));
      setListenPort(String(cfg.listenPort ?? 8888));
    }).catch((e: unknown) => log('state', `load failed: ${String(e)}`));
  }

  // Load state once on first mount.
  useEffect(() => {
    log('mount', `initial screen=${initialScreen}`);
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset screen every time index.js calls showPluginView().
  // index.js emits 'tunnelViewMode' just after showPluginView() — both run in the
  // same JS runtime so this event arrives while the component is still mounted.
  // PluginLifeListener.onStart() does NOT fire on each showPluginView() call,
  // only on plugin JS initialisation, so DeviceEventEmitter is used instead.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'tunnelViewMode',
      (mode: 'control' | 'settings') => {
        log('event', `tunnelViewMode → ${mode}`);
        setScreen(mode);
        loadState();
      },
    );
    return () => sub.remove();
  }, []);

  async function startTunnel(portNum: number) {
    const lp = parseInt(listenPort, 10) || 8888;
    await TcpTunnelModule.startTunnel(host.trim(), portNum, lp);
    setRunning(true);
    PluginManager.unregisterButton(100);
    PluginManager.registerButton(1, ['NOTE', 'DOC'], {
      id: 100, name: 'TCP Tunnel', icon: iconOn, enable: true, expandButton: 0,
    });
    log('toggle', 'startTunnel OK');
    banner.show('Tunnel acceso ✓');
  }

  async function handleToggle() {
    setLoading(true);
    try {
      if (running) {
        await TcpTunnelModule.stopTunnel();
        setRunning(false);
        PluginManager.unregisterButton(100);
        PluginManager.registerButton(1, ['NOTE', 'DOC'], {
          id: 100, name: 'TCP Tunnel', icon: iconOff, enable: true, expandButton: 0,
        });
        log('toggle', 'stopTunnel OK');
        banner.show('Tunnel spento');
      } else {
        const portNum = parseInt(port, 10);
        try {
          await startTunnel(portNum);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('EADDRINUSE')) {
            // Stale socket from a previous session — force-stop then retry once.
            log('toggle', 'EADDRINUSE — force-stopping stale socket and retrying...');
            try {
              await TcpTunnelModule.stopTunnel();
              await startTunnel(portNum);
            } catch (e2: unknown) {
              const msg2 = e2 instanceof Error ? e2.message : String(e2);
              log('toggle', `retry FAILED: ${msg2}`);
              const lp2 = parseInt(listenPort, 10) || 8888;
              Alert.alert(
                'Porta occupata',
                `La porta ${lp2} è occupata da un altro processo.\n\nProva a riavviare il Supernote per liberarla, poi ripremi AVVIA.\n\nIn alternativa cambia la "Porta ascolto" nelle Impostazioni.`,
              );
            }
          } else {
            log('toggle', `FAILED: ${msg}`);
            Alert.alert('Errore avvio', msg);
          }
        }
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
    const listenPortNum = parseInt(listenPort, 10);
    if (!isValidPort(listenPortNum)) {
      Alert.alert('Porta ascolto non valida', 'La porta ascolto deve essere tra 1 e 65535.');
      return;
    }
    if (running) {
      Alert.alert(
        'Tunnel attivo',
        'Le nuove impostazioni verranno usate al prossimo avvio.',
      );
    }
    try {
      await TcpTunnelModule.saveConfig(trimmedHost, portNum, listenPortNum);
      log('save', `OK host=${trimmedHost} port=${portNum}`);
      banner.show('Impostazioni salvate', () => {
        setViewMode('control');
        setScreen('control');
      });
    } catch (e: unknown) {
      log('save', `FAILED: ${String(e)}`);
      Alert.alert('Errore', 'Impossibile salvare la configurazione.');
    }
  }

  const close = () => PluginManager.closePluginView();

  return (
    <View style={styles.root}>
      {/* Banner */}
      {banner.text ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner.text}</Text>
        </View>
      ) : null}

      {screen === 'control' ? (
        <ControlScreen
          running={running}
          loading={loading}
          targetPort={port}
          listenPort={listenPort}
          onToggle={handleToggle}
          onSettings={() => { setViewMode('settings'); setScreen('settings'); }}
          onClose={close}
        />
      ) : (
        <SettingsScreen
          host={host}
          port={port}
          listenPort={listenPort}
          onHostChange={setHost}
          onPortChange={setPort}
          onListenPortChange={setListenPort}
          onSave={handleSave}
          onBack={() => { setViewMode('control'); setScreen('control'); }}
          onClose={close}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Control screen
// ---------------------------------------------------------------------------

function ControlScreen({running, loading, targetPort, listenPort, onToggle, onSettings, onClose}: {
  running: boolean;
  loading: boolean;
  targetPort: string;
  listenPort: string;
  onToggle: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title="TCP Tunnel" onClose={onClose} />

      <View style={styles.body}>
        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.dot, running ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.statusText}>{running ? 'ATTIVO' : 'INATTIVO'}</Text>
        </View>

        {/* Toggle button */}
        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={onToggle}
          disabled={loading}>
          <Text style={styles.primaryBtnIcon}>{loading ? '…' : running ? '◼' : '▶'}</Text>
          <Text style={styles.primaryBtnText}>
            {loading ? 'Attendi...' : running ? 'SPEGNI TUNNEL' : 'AVVIA TUNNEL'}
          </Text>
        </TouchableOpacity>

        {/* Settings row — immediately below toggle, list-style like Supernote */}
        <TouchableOpacity style={styles.listRow} onPress={onSettings}>
          <Text style={styles.listRowText}>Impostazioni</Text>
          <Text style={styles.listRowArrow}>›</Text>
        </TouchableOpacity>

        {/* ADB command — only when active */}
        {running && (
          <View style={styles.adbBox}>
            <Text style={styles.adbLabel}>Comando PC</Text>
            <Text style={styles.adbCommand}>
              {'adb forward tcp:' + targetPort + ' tcp:' + listenPort}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

const PRESETS = [
  {p: '8080', label: 'Screen Mirroring'},
  {p: '8081', label: 'Browse & Access'},
] as const;

function SettingsScreen({host, port, listenPort, onHostChange, onPortChange, onListenPortChange, onSave, onBack, onClose}: {
  host: string;
  port: string;
  listenPort: string;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onListenPortChange: (v: string) => void;
  onSave: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title="Impostazioni" onClose={onClose} onBack={onBack} />

      <View style={styles.body}>
        {/* Presets */}
        <Text style={styles.fieldLabel}>Preset porta</Text>
        <View style={styles.presetRow}>
          {PRESETS.map(({p, label}) => (
            <TouchableOpacity
              key={p}
              style={[styles.presetBtn, port === p && styles.presetBtnActive]}
              onPress={() => onPortChange(p)}>
              <Text style={[styles.presetPort, port === p && styles.presetPortActive]}>{p}</Text>
              <Text style={[styles.presetLabel, port === p && styles.presetLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Host */}
        <Text style={styles.fieldLabel}>Host destinazione</Text>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={onHostChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="100.113.43.44"
          placeholderTextColor="#888"
        />

        {/* Target port */}
        <Text style={styles.fieldLabel}>Porta destinazione (target)</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={onPortChange}
          keyboardType="numeric"
          placeholder="8080"
          placeholderTextColor="#888"
        />

        <View style={styles.divider} />

        {/* Listen port */}
        <Text style={styles.fieldLabel}>Porta ascolto (device)</Text>
        <Text style={styles.fieldHint}>Usata in: adb forward tcp:… tcp:{listenPort}</Text>
        <TextInput
          style={styles.input}
          value={listenPort}
          onChangeText={onListenPortChange}
          keyboardType="numeric"
          placeholder="7890"
          placeholderTextColor="#888"
        />

        {/* Save */}
        <TouchableOpacity style={styles.primaryBtn} onPress={onSave}>
          <Text style={styles.primaryBtnText}>SALVA</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — Supernote language: square, black/white, thin separators
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},

  // Banner
  banner: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  bannerText: {color: '#fff', fontSize: 14, fontWeight: '600'},

  screen: {flex: 1},

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    height: 72,
    paddingHorizontal: 16,
  },
  closeBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBoxText: {color: '#fff', fontSize: 22, fontWeight: '900'},
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSpacer: {width: 48},
  backBox: {
    height: 48,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBoxText: {color: '#fff', fontSize: 14, fontWeight: '600'},

  // Body
  body: {flex: 1, paddingHorizontal: 20, paddingTop: 20},

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 20,
  },
  dot: {width: 12, height: 12, borderWidth: 2, borderColor: '#000', marginRight: 10},
  dotOn: {backgroundColor: '#000'},
  dotOff: {backgroundColor: '#fff'},
  statusText: {fontSize: 16, fontWeight: '700', color: '#000'},

  // Primary button — black, square, white text
  primaryBtn: {
    backgroundColor: '#000',
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  primaryBtnDisabled: {backgroundColor: '#555'},
  primaryBtnIcon: {color: '#fff', fontSize: 14, marginRight: 10},
  primaryBtnText: {color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5},

  // ADB box
  adbBox: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 14,
    marginBottom: 20,
  },
  adbLabel: {fontSize: 11, color: '#555', marginBottom: 6, fontWeight: '600'},
  adbCommand: {fontFamily: 'monospace', fontSize: 13, color: '#000'},

  // List row (settings link) — full width, bottom border
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  listRowText: {fontSize: 15, color: '#000'},
  listRowArrow: {fontSize: 20, color: '#000'},

  // Settings fields
  divider: {height: 1, backgroundColor: '#ddd', marginVertical: 16},
  fieldLabel: {fontSize: 13, color: '#555', marginBottom: 4, fontWeight: '600'},
  fieldHint: {fontSize: 11, color: '#888', marginBottom: 8, fontFamily: 'monospace'},
  input: {
    fontSize: 15,
    color: '#000',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },

  // Presets — square buttons
  presetRow: {flexDirection: 'row', gap: 12, marginBottom: 8},
  presetBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    alignItems: 'center',
  },
  presetBtnActive: {backgroundColor: '#000'},
  presetPort: {fontSize: 14, fontWeight: '700', color: '#000'},
  presetPortActive: {color: '#fff'},
  presetLabel: {fontSize: 10, color: '#555', marginTop: 3},
  presetLabelActive: {color: '#ccc'},
});
