import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectories, appendLog } from './services/paths.js';
import * as database from './services/database.js';
import * as backup from './services/backup.js';
import * as mariadbSync from './services/sync/mariadb.js';
import { registerIpcHandlers } from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let autoSyncTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'WispCore - Software Gestionale WISP (Alynet)',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://localhost:5173' : null);
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.github.com;",
        ],
      },
    });
  });
}

function scheduleBackgroundJobs() {
  // Daily backup: checked once at startup, then every hour (cheap, idempotent
  // check - it only actually copies the file once per calendar day).
  backup.runDailyBackupIfNeeded();
  setInterval(() => backup.runDailyBackupIfNeeded(), 60 * 60 * 1000);

  // Optional MariaDB auto-sync on the interval configured in Settings.
  const settings = mariadbSync.getSyncSettings();
  if (settings.enabled && settings.autoSyncMinutes > 0) {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    autoSyncTimer = setInterval(() => {
      mariadbSync.runSync('auto-sync').catch((err) => appendLog(`Auto-sync fallita: ${err.message}`));
    }, settings.autoSyncMinutes * 60 * 1000);
  }
}

app.whenReady().then(async () => {
  ensureDirectories();
  // Skip the strict CSP in dev mode: Vite's dev server needs inline module
  // scripts and a websocket connection for HMR that the production CSP
  // deliberately disallows.
  if (app.isPackaged) applyContentSecurityPolicy();
  await database.init();
  registerIpcHandlers(() => mainWindow);
  createWindow();
  scheduleBackgroundJobs();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  database.persist();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  database.persist();
});
