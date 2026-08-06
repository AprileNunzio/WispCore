import fs from 'fs';
import path from 'path';
import { dialog } from 'electron';
import { ensureDirectories, appendLog } from './paths.js';
import { sha256File, decryptBuffer } from './crypto.js';
import { readConfig, updateConfig } from './config.js';
import * as database from './database.js';

const DAILY_RETENTION = 30; // keep the last 30 daily backups
const MONTHLY_RETENTION = 12; // plus the first backup of each of the last 12 months

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/** Copies the current (already-encrypted) DB file into backups/, with a sha256 sidecar. */
export function runBackup({ reason = 'manual' } = {}) {
  const paths = ensureDirectories();
  if (!fs.existsSync(paths.dbPath)) return null;

  const stamp = timestampForFilename();
  const fileName = `wispcore_${stamp}.db.bak`;
  const destPath = path.join(paths.backupsDir, fileName);

  const dbBytes = fs.readFileSync(paths.dbPath);
  fs.writeFileSync(destPath, dbBytes);
  fs.writeFileSync(`${destPath}.sha256`, sha256File(dbBytes));

  updateConfig((c) => {
    c.lastBackupAt = new Date().toISOString();
  });

  appendLog(`Backup creato (${reason}): ${fileName}`);
  pruneBackupsInDir(paths.backupsDir);

  // Replica enterprise su una seconda destinazione (NAS, disco esterno, unità
  // di rete...), se l'utente l'ha configurata. Best-effort: se la cartella
  // non è raggiungibile (es. disco esterno scollegato) il backup primario,
  // già completato sopra, non deve essere compromesso in alcun modo.
  copyToSecondaryDestination(fileName, dbBytes);

  return { fileName, path: destPath, createdAt: new Date().toISOString(), size: dbBytes.length };
}

function copyToSecondaryDestination(fileName, dbBytes) {
  const config = readConfig();
  const secondary = config.secondaryBackup;
  if (!secondary?.enabled || !secondary.directory) return;

  try {
    if (!fs.existsSync(secondary.directory)) {
      fs.mkdirSync(secondary.directory, { recursive: true });
    }
    const destPath = path.join(secondary.directory, fileName);
    fs.writeFileSync(destPath, dbBytes);
    fs.writeFileSync(`${destPath}.sha256`, sha256File(dbBytes));
    pruneBackupsInDir(secondary.directory);

    updateConfig((c) => {
      c.secondaryBackup.lastBackupAt = new Date().toISOString();
      c.secondaryBackup.lastError = null;
    });
    appendLog(`Backup secondario replicato in: ${destPath}`);
  } catch (err) {
    updateConfig((c) => {
      c.secondaryBackup.lastError = err.message;
    });
    appendLog(`Backup secondario fallito (${secondary.directory}): ${err.message}`);
  }
}

export function runDailyBackupIfNeeded() {
  const config = readConfig();
  const last = config.lastBackupAt ? new Date(config.lastBackupAt) : null;
  const today = new Date().toISOString().split('T')[0];
  const lastDay = last ? last.toISOString().split('T')[0] : null;
  if (lastDay === today) return null;
  return runBackup({ reason: 'daily-auto' });
}

function listBackupsInDir(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db.bak'))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      const checksumPath = `${full}.sha256`;
      let checksumOk = null;
      if (fs.existsSync(checksumPath)) {
        const expected = fs.readFileSync(checksumPath, 'utf-8').trim();
        checksumOk = expected === sha256File(fs.readFileSync(full));
      }
      return { fileName: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), checksumOk };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listBackups() {
  const paths = ensureDirectories();
  return listBackupsInDir(paths.backupsDir);
}

/** Stessa politica di retention (30 giornalieri + 1 al mese per 12 mesi) applicata a qualunque cartella di backup, primaria o secondaria. */
function pruneBackupsInDir(dir) {
  const backups = listBackupsInDir(dir); // newest first

  const keep = new Set(backups.slice(0, DAILY_RETENTION).map((b) => b.fileName));

  // Keep the oldest backup of each of the last MONTHLY_RETENTION months too.
  const byMonth = new Map();
  for (const b of backups) {
    const monthKey = b.createdAt.slice(0, 7);
    byMonth.set(monthKey, b.fileName); // overwritten as we iterate newest->oldest, ends up = oldest of the month
  }
  [...byMonth.values()].slice(0, MONTHLY_RETENTION).forEach((f) => keep.add(f));

  for (const b of backups) {
    if (!keep.has(b.fileName)) {
      try {
        fs.unlinkSync(path.join(dir, b.fileName));
        const sidecar = path.join(dir, `${b.fileName}.sha256`);
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
      } catch {
        // best-effort pruning
      }
    }
  }
}

/** Restores a chosen backup file over the live database, after safety-copying the current one. */
export async function restoreBackup(fileName) {
  const paths = ensureDirectories();
  const backupPath = path.join(paths.backupsDir, fileName);
  if (!fs.existsSync(backupPath)) throw new Error('File di backup non trovato.');

  const checksumPath = `${backupPath}.sha256`;
  if (fs.existsSync(checksumPath)) {
    const expected = fs.readFileSync(checksumPath, 'utf-8').trim();
    const actual = sha256File(fs.readFileSync(backupPath));
    if (expected !== actual) throw new Error('Checksum del backup non valido: file potenzialmente corrotto.');
  }

  // Verify it actually decrypts with our key before committing to the restore.
  const candidateBytes = fs.readFileSync(backupPath);
  decryptBuffer(candidateBytes); // throws if invalid

  // Safety net: snapshot the current DB before overwriting it.
  if (fs.existsSync(paths.dbPath)) {
    const safetyName = `pre-restore_${timestampForFilename()}.db.bak`;
    fs.copyFileSync(paths.dbPath, path.join(paths.backupsDir, safetyName));
  }

  fs.writeFileSync(paths.dbPath, candidateBytes);
  await database.init(); // reload in-memory DB from the restored file
  appendLog(`Database ripristinato dal backup: ${fileName}`);
  return true;
}

/** Human-readable JSON export (for migrating machines / manual archiving), via native save dialog. */
export async function exportToFile(browserWindow) {
  const payload = {
    appName: 'WispCore',
    exportedAt: new Date().toISOString(),
    admin: database.getAdmin()?.username,
    clients: database.listClients(),
    collaborators: database.listCollaborators(),
    payments: database.listPayments(),
    commissions: database.listCommissions(),
  };

  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title: 'Esporta backup WispCore',
    defaultPath: `wispcore_export_${new Date().toISOString().split('T')[0]}.json`,
    filters: [{ name: 'WispCore Backup', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  appendLog(`Export manuale creato: ${filePath}`);
  return filePath;
}

export async function importFromFile(browserWindow, actor) {
  const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
    title: 'Ripristina da file di backup WispCore',
    filters: [{ name: 'WispCore Backup', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return false;

  const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
  if (!Array.isArray(parsed.clients)) throw new Error('File di backup non valido o danneggiato.');

  for (const c of parsed.collaborators || []) {
    database.saveCollaborator(c, actor);
  }
  for (const c of parsed.clients || []) {
    database.saveClient(c, actor);
  }
  appendLog(`Import manuale eseguito da: ${filePaths[0]}`);
  return true;
}

// ---------------------------------------------------------------------------
// Backup secondario enterprise: replica in tempo reale (ad ogni backup
// primario) su una seconda cartella a scelta dell'utente - tipicamente un
// NAS, un disco esterno o un'unità di rete condivisa aziendale.
// ---------------------------------------------------------------------------

export function getSecondaryBackupSettings() {
  const config = readConfig();
  const secondary = config.secondaryBackup || {};
  return {
    enabled: !!secondary.enabled,
    directory: secondary.directory || null,
    lastBackupAt: secondary.lastBackupAt || null,
    lastError: secondary.lastError || null,
  };
}

/** Apre il selettore di cartelle nativo. Non salva nulla: la conferma avviene con setSecondaryBackupSettings. */
export async function pickSecondaryBackupDirectory(browserWindow) {
  const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
    title: 'Scegli la cartella per il backup secondario',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
}

export function setSecondaryBackupSettings({ enabled, directory }) {
  if (enabled && !directory) {
    throw new Error('Seleziona prima una cartella di destinazione per il backup secondario.');
  }
  if (directory) {
    // Verifica subito che la cartella sia scrivibile, per non scoprirlo solo
    // al prossimo backup notturno.
    try {
      if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
      fs.accessSync(directory, fs.constants.W_OK);
    } catch (err) {
      throw new Error(`Cartella non scrivibile: ${err.message}`);
    }
  }

  updateConfig((c) => {
    c.secondaryBackup = c.secondaryBackup || {};
    c.secondaryBackup.enabled = !!enabled;
    c.secondaryBackup.directory = directory ?? c.secondaryBackup.directory;
    c.secondaryBackup.lastError = null;
  });

  appendLog(`Backup secondario ${enabled ? 'attivato' : 'disattivato'}${directory ? ` su ${directory}` : ''}.`);
  return getSecondaryBackupSettings();
}
