/**
 * Minimal i18n module for sn-TCP-Tunnel.
 *
 * Supported locales: 'it' (Italian) and 'en' (English/fallback).
 * Add more locales by extending the `translations` object and the `Locale` type.
 *
 * Initial locale: resolved via Intl.DateTimeFormat() (Hermes supports it).
 * Live updates: caller registers PluginManager.registerLangListener and calls
 * setLocale / re-calls getStrings() when the Supernote language changes.
 */

export type Locale = 'it' | 'en';

export interface Strings {
  // Header / status
  title: string;
  active: string;
  inactive: string;
  loading: string;
  // Control buttons
  start: string;
  stop: string;
  // Navigation
  settings: string;
  settingsTitle: string;
  back: string;
  save: string;
  // ADB command
  pcCommand: string;
  // Prerequisite hint (split for inline bold)
  hintPre: string;
  hintOr: string;
  hintSuf: string;
  // Settings fields
  autoHostLabel: string;
  autoHostHint: string;
  presetLabel: string;
  hostLabel: string;
  targetPortLabel: string;
  listenPortLabel: string;
  listenPortHint: string;
  // Banners
  bannerOn: string;
  bannerOff: string;
  bannerSaved: string;
  // Alert titles and messages
  errHostEmpty: string;
  errHostEmptyMsg: string;
  errPort: string;
  errPortMsg: string;
  errListenPort: string;
  errListenPortMsg: string;
  errTunnelActive: string;
  errTunnelActiveMsg: string;
  errPortBusy: string;
  errPortBusyMsg: (port: number) => string;
  errStart: string;
  errGeneric: string;
}

const translations: Record<Locale, Strings> = {
  it: {
    title: 'TCP Tunnel',
    active: 'ATTIVO',
    inactive: 'INATTIVO',
    loading: 'Attendi...',
    start: 'AVVIA TUNNEL',
    stop: 'SPEGNI TUNNEL',
    settings: 'Impostazioni',
    settingsTitle: 'Impostazioni tunnel',
    back: 'Indietro',
    save: 'SALVA',
    pcCommand: 'Comando PC',
    hintPre: 'Prima di avviare, attiva',
    hintOr: 'o',
    hintSuf: 'dalla barra toggle in alto.',
    autoHostLabel: 'IP automatico',
    autoHostHint: 'Usa l\'IP WiFi del dispositivo rilevato automaticamente',
    presetLabel: 'Preset porta',
    hostLabel: 'Host destinazione',
    targetPortLabel: 'Porta destinazione (target)',
    listenPortLabel: 'Porta ascolto (device)',
    listenPortHint: 'Usata in: adb forward tcp:… tcp:',
    bannerOn: 'Tunnel acceso ✓',
    bannerOff: 'Tunnel spento',
    bannerSaved: 'Impostazioni salvate',
    errHostEmpty: 'Host non valido',
    errHostEmptyMsg: 'Il campo host non può essere vuoto.',
    errPort: 'Porta non valida',
    errPortMsg: 'La porta deve essere tra 1 e 65535.',
    errListenPort: 'Porta ascolto non valida',
    errListenPortMsg: 'La porta ascolto deve essere tra 1 e 65535.',
    errTunnelActive: 'Tunnel attivo',
    errTunnelActiveMsg: 'Le nuove impostazioni verranno usate al prossimo avvio.',
    errPortBusy: 'Porta occupata',
    errPortBusyMsg: (port: number) =>
      `La porta ${port} è occupata da un altro processo.\n\nProva a riavviare il Supernote per liberarla, poi ripremi AVVIA.\n\nIn alternativa cambia la "Porta ascolto" nelle Impostazioni.`,
    errStart: 'Errore avvio',
    errGeneric: 'Errore',
  },
  en: {
    title: 'TCP Tunnel',
    active: 'ACTIVE',
    inactive: 'INACTIVE',
    loading: 'Please wait...',
    start: 'START TUNNEL',
    stop: 'STOP TUNNEL',
    settings: 'Settings',
    settingsTitle: 'Tunnel Settings',
    back: 'Back',
    save: 'SAVE',
    pcCommand: 'PC Command',
    hintPre: 'Before starting, enable',
    hintOr: 'or',
    hintSuf: 'from the toggle bar at the top.',
    autoHostLabel: 'Auto IP',
    autoHostHint: 'Use the device WiFi IP detected automatically',
    presetLabel: 'Port preset',
    hostLabel: 'Target host',
    targetPortLabel: 'Target port',
    listenPortLabel: 'Listen port (device)',
    listenPortHint: 'Used in: adb forward tcp:… tcp:',
    bannerOn: 'Tunnel started ✓',
    bannerOff: 'Tunnel stopped',
    bannerSaved: 'Settings saved',
    errHostEmpty: 'Invalid host',
    errHostEmptyMsg: 'Host field cannot be empty.',
    errPort: 'Invalid port',
    errPortMsg: 'Port must be between 1 and 65535.',
    errListenPort: 'Invalid listen port',
    errListenPortMsg: 'Listen port must be between 1 and 65535.',
    errTunnelActive: 'Tunnel active',
    errTunnelActiveMsg: 'New settings will take effect on next start.',
    errPortBusy: 'Port in use',
    errPortBusyMsg: (port: number) =>
      `Port ${port} is occupied by another process.\n\nTry rebooting the Supernote, then press START again.\n\nAlternatively, change the Listen Port in Settings.`,
    errStart: 'Start error',
    errGeneric: 'Error',
  },
};

/**
 * Returns the Strings bundle for the given locale.
 * Falls back to English for any unsupported locale code.
 */
export function getStrings(locale: Locale): Strings {
  return translations[locale] ?? translations.en;
}

/**
 * Resolves the current device locale from the JS Intl API (available in Hermes).
 * Returns a supported Locale, defaulting to 'en' for unknown locales.
 */
export function getCurrentLocale(): Locale {
  try {
    const raw = Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "it-IT"
    const code = raw.split(/[-_]/)[0].toLowerCase();
    return (code in translations ? code : 'en') as Locale;
  } catch {
    return 'en';
  }
}

/**
 * Normalises a raw locale string received from PluginManager.registerLangListener.
 * The Supernote may send "it", "it_IT", "Italian", etc.
 */
export function normaliseLocale(raw: unknown): Locale {
  const code = String(raw).split(/[-_]/)[0].toLowerCase();
  return (code in translations ? code : 'en') as Locale;
}
