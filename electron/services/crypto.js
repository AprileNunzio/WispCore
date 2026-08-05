import crypto from 'crypto';
import { safeStorage } from 'electron';
import { readConfig, updateConfig } from './config.js';
import { appendLog } from './paths.js';

const ALGO = 'aes-256-gcm';

/**
 * Data-at-rest encryption strategy
 * ---------------------------------
 * A random 256-bit Data Encryption Key (DEK) is generated once per
 * installation and used to encrypt the whole SQLite database file (and any
 * sensitive field we choose to double-protect, e.g. PPPoE passwords).
 *
 * The DEK itself is protected using Electron's `safeStorage`, which on
 * Windows delegates to DPAPI (tied to the OS user account) - no native
 * compilation required, no key ever touches disk in plain form when the OS
 * keychain is available.
 *
 * Deliberately NOT derived from the unlock PIN: the PIN is only an
 * application-lock gate. If it were also the encryption key, a forgotten
 * PIN would mean permanently and irrecoverably lost customer data - not an
 * acceptable trade-off for a business-critical database.
 */

function getOrCreateDataKey() {
  const config = readConfig();

  if (config.dataKeyEncrypted) {
    const buf = Buffer.from(config.dataKeyEncrypted, 'base64');
    if (config.dataKeyProtection === 'os' && safeStorage.isEncryptionAvailable()) {
      return Buffer.from(safeStorage.decryptString(buf), 'base64');
    }
    // Fallback path: key was stored unprotected because the OS keychain
    // was unavailable at first run.
    return buf;
  }

  const dek = crypto.randomBytes(32);
  const osProtected = safeStorage.isEncryptionAvailable();

  updateConfig((c) => {
    if (osProtected) {
      c.dataKeyEncrypted = safeStorage.encryptString(dek.toString('base64')).toString('base64');
      c.dataKeyProtection = 'os';
    } else {
      appendLog('ATTENZIONE: OS keychain non disponibile, la chiave dati è protetta solo su disco (fallback).');
      c.dataKeyEncrypted = dek.toString('base64');
      c.dataKeyProtection = 'plain';
    }
  });

  return dek;
}

let cachedKey = null;
export function getDataKey() {
  if (!cachedKey) cachedKey = getOrCreateDataKey();
  return cachedKey;
}

export function encryptBuffer(plainBuffer, key = getDataKey()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [4 bytes magic 'WC01'][12 bytes iv][16 bytes tag][ciphertext]
  return Buffer.concat([Buffer.from('WC01'), iv, tag, encrypted]);
}

export function decryptBuffer(payload, key = getDataKey()) {
  const magic = payload.subarray(0, 4).toString();
  if (magic !== 'WC01') {
    throw new Error('Formato file non riconosciuto o non cifrato da WispCore.');
  }
  const iv = payload.subarray(4, 16);
  const tag = payload.subarray(16, 32);
  const ciphertext = payload.subarray(32);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Field-level helpers for defense-in-depth on individual sensitive columns. */
export function encryptField(plainText, key = getDataKey()) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  return encryptBuffer(Buffer.from(String(plainText), 'utf-8'), key).toString('base64');
}

export function decryptField(blob, key = getDataKey()) {
  if (!blob) return '';
  try {
    return decryptBuffer(Buffer.from(blob, 'base64'), key).toString('utf-8');
  } catch {
    return '';
  }
}

export function encryptSecret(plainText) {
  if (!plainText) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return { protection: 'os', value: safeStorage.encryptString(plainText).toString('base64') };
  }
  return { protection: 'plain', value: Buffer.from(plainText, 'utf-8').toString('base64') };
}

export function decryptSecret(secret) {
  if (!secret || !secret.value) return '';
  if (secret.protection === 'os' && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(secret.value, 'base64'));
  }
  return Buffer.from(secret.value, 'base64').toString('utf-8');
}

export function sha256File(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Organization Data Key (ODK)
 * ----------------------------
 * The per-machine DEK above protects the local DB file at rest, but it is
 * unique per installation - a field encrypted with it cannot be decrypted on
 * another site's PC. For values that must travel through the central
 * MariaDB server and remain readable at every site (currently: PPPoE
 * passwords), we use a second key that is shared across every station of
 * the same organization: generated once on the first site that enables
 * sync, then copied (as a passphrase-like string) into the Settings screen
 * of every other station. It is stored locally the same way as the DEK
 * (OS-protected via safeStorage where available).
 */
export function getOrgKey() {
  const config = readConfig();
  const stored = config.sync?.orgKeyEncrypted;
  if (!stored) return null;
  const buf = Buffer.from(stored, 'base64');
  if (config.sync?.orgKeyProtection === 'os' && safeStorage.isEncryptionAvailable()) {
    return Buffer.from(safeStorage.decryptString(buf), 'base64');
  }
  return buf;
}

export function generateOrgKey() {
  const key = crypto.randomBytes(32);
  storeOrgKey(key);
  return key.toString('base64'); // shown once to the admin to copy to other stations
}

export function importOrgKey(base64Key) {
  const key = Buffer.from(base64Key.trim(), 'base64');
  if (key.length !== 32) throw new Error('Chiave di organizzazione non valida (formato errato).');
  storeOrgKey(key);
  return true;
}

function storeOrgKey(keyBuffer) {
  const osProtected = safeStorage.isEncryptionAvailable();
  updateConfig((c) => {
    c.sync = c.sync || {};
    if (osProtected) {
      c.sync.orgKeyEncrypted = safeStorage.encryptString(keyBuffer.toString('base64')).toString('base64');
      c.sync.orgKeyProtection = 'os';
    } else {
      c.sync.orgKeyEncrypted = keyBuffer.toString('base64');
      c.sync.orgKeyProtection = 'plain';
    }
  });
}

/** The key to use for fields that must remain decryptable across sync'd stations. */
export function getFieldKey() {
  return getOrgKey() || getDataKey();
}
