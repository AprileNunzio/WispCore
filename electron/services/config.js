import fs from 'fs';
import { ensureDirectories } from './paths.js';

const DEFAULT_CONFIG = {
  appName: 'WispCore',
  initializedAt: null,
  version: null,
  dataKeyEncrypted: null, // base64 DEK, encrypted via Electron safeStorage (or a plain fallback, flagged below)
  dataKeyProtection: null, // 'os' (safeStorage/DPAPI) | 'plain' (fallback, no OS keychain available)
  failedPinAttempts: 0,
  lockedUntil: null,
  lastBackupAt: null,
  emailTemplatesSeeded: false,
  whatsappTemplatesSeeded: false,
  // Anagrafica della società: oggi usata solo per firmare email/WhatsApp con
  // il nome reale invece del generico "Team Tecnico WISP", ma pensata per
  // essere riusata in futuro nella generazione di fatture/documenti.
  company: {
    name: '',
    vatNumber: '', // P.IVA
    taxCode: '', // Codice Fiscale, se diverso dalla P.IVA
    address: '',
    phone: '',
    email: '',
    website: '',
    iban: '',
  },
  sync: {
    enabled: false,
    host: '',
    port: 3306,
    database: '',
    user: '',
    passwordEncrypted: null,
    ssl: false,
    // Default enterprise: sync ad ogni modifica (event-driven, vedi sync/scheduler.js)
    // con un fallback di sicurezza almeno ogni 1 minuto quando la sync è attiva.
    autoSyncMinutes: 1,
    lastSyncAt: null,
    siteId: null,
  },
  smtp: {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    passwordEncrypted: null,
    passwordProtection: null,
    fromName: 'WispCore',
    fromEmail: '',
  },
  whatsapp: {
    enabled: false,
    phoneNumberId: '', // ID numero WhatsApp Business (Meta Developer Console)
    wabaId: '', // WhatsApp Business Account ID, necessario per creare/leggere i template
    accessTokenEncrypted: null,
    accessTokenProtection: null,
    displayName: '', // solo informativo: il nome verificato è quello impostato su Meta Business Manager
    apiVersion: 'v20.0',
    defaultCountryCode: '39', // usato per normalizzare i numeri italiani senza prefisso internazionale
  },
  updater: {
    downloadedVersion: null, // ultima versione già scaricata (per non riscaricarla ad ogni avvio)
    installerPath: null,
  },
  secondaryBackup: {
    enabled: false,
    directory: null, // cartella scelta dall'utente (es. NAS, disco esterno, altra unità di rete)
    lastBackupAt: null,
    lastError: null,
  },
};

export function readConfig() {
  const paths = ensureDirectories();
  if (!fs.existsSync(paths.configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(paths.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      sync: { ...DEFAULT_CONFIG.sync, ...(parsed.sync || {}) },
      smtp: { ...DEFAULT_CONFIG.smtp, ...(parsed.smtp || {}) },
      whatsapp: { ...DEFAULT_CONFIG.whatsapp, ...(parsed.whatsapp || {}) },
      company: { ...DEFAULT_CONFIG.company, ...(parsed.company || {}) },
      updater: { ...DEFAULT_CONFIG.updater, ...(parsed.updater || {}) },
      secondaryBackup: { ...DEFAULT_CONFIG.secondaryBackup, ...(parsed.secondaryBackup || {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config) {
  const paths = ensureDirectories();
  fs.writeFileSync(paths.configPath, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

export function updateConfig(mutator) {
  const config = readConfig();
  mutator(config);
  writeConfig(config);
  return config;
}
