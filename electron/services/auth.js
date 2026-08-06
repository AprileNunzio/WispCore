import crypto from 'crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import { readConfig, updateConfig } from './config.js';

const ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 4,
  memorySize: 65536, // 64 MB - strong for a desktop app, still fast enough for a login screen
  hashLength: 32,
  outputType: 'encoded',
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

export async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  return argon2id({ password: pin, salt, ...ARGON2_PARAMS });
}

export async function verifyPinHash(pin, hash) {
  try {
    return await argon2Verify({ password: pin, hash });
  } catch {
    return false;
  }
}

export function getLockoutState() {
  const config = readConfig();
  const lockedUntil = config.lockedUntil ? new Date(config.lockedUntil) : null;
  const isLocked = !!lockedUntil && lockedUntil.getTime() > Date.now();
  return {
    isLocked,
    lockedUntil: isLocked ? lockedUntil.toISOString() : null,
    failedAttempts: config.failedPinAttempts || 0,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - (config.failedPinAttempts || 0)),
  };
}

export function registerFailedAttempt() {
  return updateConfig((c) => {
    c.failedPinAttempts = (c.failedPinAttempts || 0) + 1;
    if (c.failedPinAttempts >= MAX_ATTEMPTS) {
      c.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
      c.failedPinAttempts = 0;
    }
  });
}

export function resetFailedAttempts() {
  return updateConfig((c) => {
    c.failedPinAttempts = 0;
    c.lockedUntil = null;
  });
}

// ---------------------------------------------------------------------------
// Sessione utente corrente (multi-utente): tenuta solo in memoria nel main
// process, mai persistita. Determina chi è "l'attore" per audit log e
// registrazioni, e viene restituita al renderer per il gating dei permessi
// in UI in base al ruolo.
// ---------------------------------------------------------------------------
let currentSession = null;

export function setCurrentSession(admin) {
  currentSession = admin
    ? { id: admin.id, username: admin.username, role: admin.role, linkedCollaboratorId: admin.linked_collaborator_id || null }
    : null;
}

export function getCurrentSession() {
  return currentSession;
}

export function clearCurrentSession() {
  currentSession = null;
}
