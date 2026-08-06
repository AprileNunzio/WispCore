import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Resolves the WispCore root data directory.
 *
 * Priority: OneDrive-synced Documents folder (so the database and backups
 * are automatically replicated to the cloud and to every device signed into
 * the same OneDrive account) -> plain local Documents folder as fallback.
 *
 * The result is cached for the lifetime of the process since it should not
 * change while the app is running.
 */
let cachedPaths = null;

function detectDocumentsRoot() {
  const home = os.homedir();

  const candidates = [
    path.join(home, 'OneDrive', 'Documenti'), // Italian OneDrive client
    path.join(home, 'OneDrive', 'Documents'), // English OneDrive client
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { dir: candidate, oneDrive: true };
    }
  }

  return { dir: path.join(home, 'Documents'), oneDrive: false };
}

export function getAppPaths() {
  if (cachedPaths) return cachedPaths;

  const { dir: docsRoot, oneDrive } = detectDocumentsRoot();
  const rootDir = path.join(docsRoot, 'NunzioTech', 'WispCore');

  cachedPaths = {
    rootDir,
    dbPath: path.join(rootDir, 'database', 'wisp_data.db'),
    dbDir: path.join(rootDir, 'database'),
    configPath: path.join(rootDir, 'config', 'app_config.json'),
    configDir: path.join(rootDir, 'config'),
    logsDir: path.join(rootDir, 'logs'),
    logFile: path.join(rootDir, 'logs', 'app.log'),
    backupsDir: path.join(rootDir, 'backups'),
    updatesDir: path.join(rootDir, 'updates'),
    contractsDir: path.join(rootDir, 'contracts'),
    exportsDir: path.join(rootDir, 'exports'),
    oneDriveDetected: oneDrive,
  };

  return cachedPaths;
}

export function ensureDirectories() {
  const p = getAppPaths();
  for (const dir of [p.rootDir, p.dbDir, p.configDir, p.logsDir, p.backupsDir, p.updatesDir, p.contractsDir, p.exportsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return p;
}

export function appendLog(line) {
  const p = getAppPaths();
  try {
    fs.appendFileSync(p.logFile, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // Logging must never crash the app.
  }
}
