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
  sync: {
    enabled: false,
    host: '',
    port: 3306,
    database: '',
    user: '',
    passwordEncrypted: null,
    ssl: false,
    autoSyncMinutes: 0,
    lastSyncAt: null,
    siteId: null,
  },
};

export function readConfig() {
  const paths = ensureDirectories();
  if (!fs.existsSync(paths.configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(paths.configPath, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw), sync: { ...DEFAULT_CONFIG.sync, ...(JSON.parse(raw).sync || {}) } };
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
