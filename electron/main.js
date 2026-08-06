import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectories } from './services/paths.js';
import * as database from './services/database.js';
import * as backup from './services/backup.js';
import * as syncScheduler from './services/sync/scheduler.js';
import * as updater from './services/updater.js';
import { registerIpcHandlers } from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    // Avviata massimizzata (occupa tutto lo schermo) ma NON in vero fullscreen:
    // la finestra resta visibile con la barra del titolo e i pulsanti
    // riduci a icona / ingrandisci / chiudi, come richiesto. `fullscreen: true`
    // nasconderebbe quei controlli (comportamento kiosk), quindi si usa
    // `show: false` + `.maximize()` su 'ready-to-show' per evitare il flash
    // di una finestra piccola prima della massimizzazione.
    show: false,
    fullscreen: false,
    title: 'WispCore - Software Gestionale WISP (Alynet)',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.maximize();
    mainWindow.show();
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

/** Inoltra un evento del ciclo di auto-update al renderer, se la finestra esiste ancora. */
function sendUpdateEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:event', payload);
  }
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
  // check - it only actually copies the file once per calendar day, and
  // replicates on the secondary destination too when configured).
  backup.runDailyBackupIfNeeded();
  setInterval(() => backup.runDailyBackupIfNeeded(), 60 * 60 * 1000);

  // Pagamenti scaduti: flag automatico PENDING -> OVERDUE, controllato
  // all'avvio e poi ogni ora (non serve più frequente: la data cambia una
  // volta al giorno, ma un intervallo breve tiene la Dashboard sempre corretta
  // anche se l'app resta aperta a cavallo di mezzanotte).
  database.autoFlagOverduePayments();
  setInterval(() => database.autoFlagOverduePayments(), 60 * 60 * 1000);

  // Sync MariaDB multi-sede: quando attiva, sincronizza ad ogni modifica
  // (event-driven, con un breve debounce) e comunque almeno ogni 1 minuto
  // come fallback di sicurezza. Vedi services/sync/scheduler.js.
  syncScheduler.initAutoSync(() => database.getAdmin()?.username || 'admin');
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

  // Controllo aggiornamenti automatico all'avvio: cerca su GitHub Releases,
  // scarica l'installer in background se trova una versione più recente e
  // chiede all'utente (via renderer) se installarla non appena il download
  // è completo. Fire-and-forget: non deve mai bloccare l'avvio dell'app né
  // farla crashare se manca la connessione.
  mainWindow.webContents.once('did-finish-load', () => {
    updater.checkAndDownloadUpdateInBackground(sendUpdateEvent);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  syncScheduler.stopAutoSync();
  database.persist();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  database.persist();
});
