/**
 * @file App.tsx
 * @description Plugin view for sn-TCP-Tunnel.
 * UI follows Supernote design language: black header, square corners,
 * thin separator lines, black primary buttons with white text.
 *
 * Screens:
 *  - 'control': status, start/stop, ADB command, link to settings.
 *  - 'settings': port presets + host/port form.
 *
 * Language: resolved from Intl on mount, updated live via registerLangListener.
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Image,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {isValidPort} from './src/validation';
import {getViewMode, setViewMode} from './src/viewMode';
import {
  type Locale,
  type Strings,
  getCurrentLocale,
  getStrings,
  normaliseLocale,
} from './src/i18n';

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
// Shared header — black bar, X left, centered title, optional back right
// ---------------------------------------------------------------------------

function Header({title, onClose, backLabel, onBack}: {
  title: string;
  onClose: () => void;
  backLabel?: string;
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
          <Text style={styles.backBoxText}>{backLabel ?? 'Back'}</Text>
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
  console.log('[sn-tcp-tunnel] App component rendering');
  const initialScreen = getViewMode();
  const [screen, setScreen] = useState<'control' | 'settings'>(initialScreen);
  const [locale, setLocale] = useState<Locale>(getCurrentLocale);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [listenPort, setListenPort] = useState(DEFAULT_LISTEN_PORT);
  const [autoHost, setAutoHost] = useState(true);
  const [wifiIP, setWifiIP] = useState('');
  const banner = useBanner();

  const s: Strings = getStrings(locale);

  function loadState() {
    TcpTunnelModule.getWifiIP()
      .then((ip: string) => {
        log('state', `wifiIP=${ip}`);
        setWifiIP(ip && ip !== '0.0.0.0' ? ip : '');
      })
      .catch(() => setWifiIP(''));
    Promise.all([
      TcpTunnelModule.isRunning(),
      TcpTunnelModule.loadConfig(),
    ]).then(([r, cfg]: [boolean, {host: string; port: number; listenPort: number; autoHost: boolean}]) => {
      log('state', `isRunning=${r} host=${cfg.host} port=${cfg.port} listenPort=${cfg.listenPort} autoHost=${cfg.autoHost}`);
      setRunning(r);
      setHost(cfg.host);
      setPort(String(cfg.port));
      setListenPort(String(cfg.listenPort ?? 8888));
      setAutoHost(cfg.autoHost ?? true);
    }).catch((e: unknown) => log('state', `load failed: ${String(e)}`));
  }

  // Load state on first mount.
  useEffect(() => {
    log('mount', `screen=${initialScreen} locale=${locale}`);
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset screen each time index.js calls showPluginView().
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

  // Tunnel stopped externally (e.g. USB disconnect) — sync UI state.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('tunnelStopped', () => {
      log('event', 'tunnelStopped → setRunning(false)');
      setRunning(false);
    });
    return () => sub.remove();
  }, []);

  // Update locale when Supernote system language changes.
  useEffect(() => {
    const sub = PluginManager.registerLangListener({
      onMsg: (msg: unknown) => {
        const next = normaliseLocale(msg);
        log('i18n', `lang changed: ${String(msg)} → ${next}`);
        setLocale(next);
      },
    });
    return () => sub.remove();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function resolveTargetHost(): Promise<string> {
    if (!autoHost) {return host.trim();}
    try {
      const wifiIP: string = await TcpTunnelModule.getWifiIP();
      if (wifiIP && wifiIP !== '0.0.0.0') {
        log('host', `Auto-host resolved: ${wifiIP}`);
        return wifiIP;
      }
    } catch (_) {}
    log('host', 'Auto-host fallback: 127.0.0.1');
    return '127.0.0.1';
  }

  async function startTunnel(portNum: number) {
    const lp = parseInt(listenPort, 10) || 8888;
    const targetHost = await resolveTargetHost();
    await TcpTunnelModule.startTunnel(targetHost, portNum, lp);
    setRunning(true);
    PluginManager.unregisterButton(100);
    PluginManager.registerButton(1, ['NOTE', 'DOC'], {
      id: 100, name: s.title, icon: iconOn, enable: true, expandButton: 0,
    });
    log('toggle', 'startTunnel OK');
    banner.show(s.bannerOn);
  }

  async function handleToggle() {
    setLoading(true);
    try {
      if (running) {
        await TcpTunnelModule.stopTunnel();
        setRunning(false);
        PluginManager.unregisterButton(100);
        PluginManager.registerButton(1, ['NOTE', 'DOC'], {
          id: 100, name: s.title, icon: iconOff, enable: true, expandButton: 0,
        });
        log('toggle', 'stopTunnel OK');
        banner.show(s.bannerOff);
      } else {
        const portNum = parseInt(port, 10);
        try {
          await startTunnel(portNum);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('EADDRINUSE')) {
            log('toggle', 'EADDRINUSE — force-stopping stale socket and retrying...');
            try {
              await TcpTunnelModule.stopTunnel();
              await startTunnel(portNum);
            } catch (e2: unknown) {
              const msg2 = e2 instanceof Error ? e2.message : String(e2);
              log('toggle', `retry FAILED: ${msg2}`);
              const lp2 = parseInt(listenPort, 10) || 8888;
              Alert.alert(s.errPortBusy, s.errPortBusyMsg(lp2));
            }
          } else {
            log('toggle', `FAILED: ${msg}`);
            Alert.alert(s.errStart, msg);
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('toggle', `FAILED: ${msg}`);
      Alert.alert(s.errGeneric, msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const trimmedHost = host.trim();
    if (!autoHost && !trimmedHost) {
      Alert.alert(s.errHostEmpty, s.errHostEmptyMsg);
      return;
    }
    const portNum = parseInt(port, 10);
    if (!isValidPort(portNum)) {
      Alert.alert(s.errPort, s.errPortMsg);
      return;
    }
    const listenPortNum = parseInt(listenPort, 10);
    if (!isValidPort(listenPortNum)) {
      Alert.alert(s.errListenPort, s.errListenPortMsg);
      return;
    }
    if (running) {
      Alert.alert(s.errTunnelActive, s.errTunnelActiveMsg);
    }
    try {
      await TcpTunnelModule.saveConfig(trimmedHost, portNum, listenPortNum, autoHost);
      log('save', `OK host=${trimmedHost} port=${portNum} autoHost=${autoHost}`);
      banner.show(s.bannerSaved, () => {
        setViewMode('control');
        setScreen('control');
      });
    } catch (e: unknown) {
      log('save', `FAILED: ${String(e)}`);
      Alert.alert(s.errGeneric, s.errHostEmptyMsg);
    }
  }

  const close = () => PluginManager.closePluginView();

  return (
    <View style={styles.root}>
      {banner.text ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner.text}</Text>
        </View>
      ) : null}

      {screen === 'control' ? (
        <ControlScreen
          s={s}
          running={running}
          loading={loading}
          targetPort={port}
          listenPort={listenPort}
          autoHost={autoHost}
          wifiIP={wifiIP}
          onToggle={handleToggle}
          onSettings={() => { setViewMode('settings'); setScreen('settings'); }}
          onClose={close}
        />
      ) : (
        <SettingsScreen
          s={s}
          host={host}
          port={port}
          listenPort={listenPort}
          autoHost={autoHost}
          wifiIP={wifiIP}
          onHostChange={setHost}
          onPortChange={setPort}
          onListenPortChange={setListenPort}
          onAutoHostChange={setAutoHost}
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

function ControlScreen({s, running, loading, targetPort, listenPort, autoHost, wifiIP, onToggle, onSettings, onClose}: {
  s: Strings;
  running: boolean;
  loading: boolean;
  targetPort: string;
  listenPort: string;
  autoHost: boolean;
  wifiIP: string;
  onToggle: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title={s.title} onClose={onClose} />

      <View style={styles.bodyContent}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, running ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.statusText}>{running ? s.active : s.inactive}</Text>
        </View>

        {/* Detected IP — shown when auto-host is on */}
        {autoHost && wifiIP ? (
          <View style={styles.ipBox}>
            <Text style={styles.ipLabel}>{s.detectedIP}</Text>
            <Text style={styles.ipValue}>{wifiIP}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={onToggle}
          disabled={loading}>
          <Text style={styles.primaryBtnIcon}>{loading ? '…' : running ? '◼' : '▶'}</Text>
          <Text style={styles.primaryBtnText}>
            {loading ? s.loading : running ? s.stop : s.start}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.listRow} onPress={onSettings}>
          <Text style={styles.listRowText}>{s.settings}</Text>
          <Text style={styles.listRowArrow}>›</Text>
        </TouchableOpacity>

        {running && (
          <View style={styles.adbBox}>
            <Text style={styles.adbLabel}>{s.pcCommand}</Text>
            <Text style={styles.adbCommand}>
              {'adb forward tcp:' + targetPort + ' tcp:' + listenPort}
            </Text>
          </View>
        )}

        {!running && (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              {s.hintPre}{'\n'}
              <Text style={styles.hintBold}>Screen Mirroring</Text>
              {' '}{s.hintOr}{' '}
              <Text style={styles.hintBold}>File Access</Text>
              {'\n'}{s.hintSuf}
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
  {p: '8089', label: 'File Transfer'},
] as const;

function SettingsScreen({s, host, port, listenPort, autoHost, wifiIP, onHostChange, onPortChange, onListenPortChange, onAutoHostChange, onSave, onBack, onClose}: {
  s: Strings;
  host: string;
  port: string;
  listenPort: string;
  autoHost: boolean;
  wifiIP: string;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onListenPortChange: (v: string) => void;
  onAutoHostChange: (v: boolean) => void;
  onSave: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title={s.settingsTitle} onClose={onClose} backLabel={s.back} onBack={onBack} />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Auto-host toggle — at top for visibility */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelCol}>
            <Text style={styles.fieldLabel}>{s.autoHostLabel}</Text>
            <Text style={styles.fieldHint}>{s.autoHostHint}</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, autoHost && styles.toggleBtnOn]}
            onPress={() => onAutoHostChange(!autoHost)}>
            <Text style={[styles.toggleBtnText, autoHost && styles.toggleBtnTextOn]}>
              {autoHost ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Detected IP — shown when auto-host is on */}
        {autoHost && wifiIP ? (
          <View style={styles.ipBox}>
            <Text style={styles.ipLabel}>{s.detectedIP}</Text>
            <Text style={styles.ipValue}>{wifiIP}</Text>
          </View>
        ) : null}

        {/* Manual host — visible only when auto-host is OFF */}
        {!autoHost && (
          <>
            <Text style={styles.fieldLabel}>{s.hostLabel}</Text>
            <TextInput
              style={styles.input}
              value={host}
              onChangeText={onHostChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="100.113.43.44"
              placeholderTextColor="#888"
            />
          </>
        )}

        <View style={styles.divider} />

        <Text style={styles.fieldLabel}>{s.presetLabel}</Text>
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

        <Text style={styles.fieldLabel}>{s.targetPortLabel}</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={onPortChange}
          keyboardType="numeric"
          placeholder="8080"
          placeholderTextColor="#888"
        />

        <View style={styles.divider} />

        <Text style={styles.fieldLabel}>{s.listenPortLabel}</Text>
        <Text style={styles.fieldHint}>{s.listenPortHint}{listenPort}</Text>
        <TextInput
          style={styles.input}
          value={listenPort}
          onChangeText={onListenPortChange}
          keyboardType="numeric"
          placeholder="8888"
          placeholderTextColor="#888"
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={onSave}>
          <Text style={styles.primaryBtnText}>{s.save}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},

  banner: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  bannerText: {color: '#fff', fontSize: 14, fontWeight: '600'},

  screen: {flex: 1, backgroundColor: '#fff'},

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

  body: {flex: 1},
  bodyContent: {paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40},

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

  adbBox: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 14,
    marginBottom: 20,
  },
  adbLabel: {fontSize: 11, color: '#555', marginBottom: 6, fontWeight: '600'},
  adbCommand: {fontFamily: 'monospace', fontSize: 13, color: '#000'},

  ipBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  ipLabel: {fontSize: 12, color: '#555', fontWeight: '600'},
  ipValue: {fontFamily: 'monospace', fontSize: 15, fontWeight: '700', color: '#000'},

  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 20,
  },
  listRowText: {fontSize: 15, color: '#000'},
  listRowArrow: {fontSize: 20, color: '#000'},

  hintBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 14,
  },
  hintText: {fontSize: 13, color: '#555', lineHeight: 20},
  hintBold: {fontWeight: '700', color: '#000'},

  divider: {height: 1, backgroundColor: '#ddd', marginVertical: 16},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 12,
  },
  toggleLabelCol: {flex: 1, marginRight: 12},
  toggleBtn: {
    width: 64,
    height: 32,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnOn: {backgroundColor: '#000'},
  toggleBtnText: {fontSize: 12, fontWeight: '700', color: '#000'},
  toggleBtnTextOn: {color: '#fff'},
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
