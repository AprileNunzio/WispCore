import { ipcMain, app } from 'electron';
import { getAppPaths } from '../services/paths.js';
import * as database from '../services/database.js';
import * as auth from '../services/auth.js';
import * as backup from '../services/backup.js';
import * as mariadbSync from '../services/sync/mariadb.js';

const CURRENT_ACTOR = () => database.getAdmin()?.username || 'admin';

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

export function registerIpcHandlers(getWindow) {
  // ---- System ----
  handle('system:getPaths', () => getAppPaths());
  handle('system:getVersion', () => app.getVersion());

  // ---- Auth ----
  handle('auth:isFirstRun', () => database.isFirstRun());

  handle('auth:registerSuperAdmin', async (username, pin) => {
    const pinHash = await auth.hashPin(pin);
    database.createSuperAdmin(username, pinHash);
    return true;
  });

  handle('auth:verifyPin', async (pin) => {
    const lockout = auth.getLockoutState();
    if (lockout.isLocked) {
      throw new Error(`Troppi tentativi falliti. Riprova dopo le ${new Date(lockout.lockedUntil).toLocaleTimeString('it-IT')}.`);
    }
    const admin = database.getAdmin();
    if (!admin) return false;
    const valid = await auth.verifyPinHash(pin, admin.pin_hash);
    if (valid) {
      auth.resetFailedAttempts();
      database.recordAudit(admin.username, 'LOGIN', 'session', null, null);
      database.persist();
    } else {
      auth.registerFailedAttempt();
    }
    return valid;
  });

  handle('auth:getAdminUsername', () => database.getAdmin()?.username || 'Super Admin');
  handle('auth:getLockoutState', () => auth.getLockoutState());

  // ---- Clients ----
  handle('clients:list', () => database.listClients());
  handle('clients:save', (data) => database.saveClient(data, CURRENT_ACTOR()));
  handle('clients:delete', (id) => database.deleteClient(id, CURRENT_ACTOR()));

  // ---- Collaborators ----
  handle('collaborators:list', () => database.listCollaborators());
  handle('collaborators:save', (data) => database.saveCollaborator(data, CURRENT_ACTOR()));

  // ---- Payments ----
  handle('payments:list', () => database.listPayments());
  handle('payments:add', (data) => database.addPayment(data, CURRENT_ACTOR()));
  handle('payments:updateStatus', (id, status) => database.updatePaymentStatus(id, status, CURRENT_ACTOR()));

  // ---- Commissions ----
  handle('commissions:list', () => database.listCommissions());
  handle('commissions:add', (data) => database.addCommission(data, CURRENT_ACTOR()));
  handle('commissions:updateStatus', (id, status) => database.updateCommissionStatus(id, status, CURRENT_ACTOR()));

  // ---- Backup / restore ----
  handle('backup:list', () => backup.listBackups());
  handle('backup:run', () => backup.runBackup({ reason: 'manual' }));
  handle('backup:restore', (fileName) => backup.restoreBackup(fileName));
  handle('backup:exportToFile', () => backup.exportToFile(getWindow()));
  handle('backup:importFromFile', () => backup.importFromFile(getWindow(), CURRENT_ACTOR()));

  // ---- MariaDB multi-site sync ----
  handle('sync:getSettings', () => mariadbSync.getSyncSettings());
  handle('sync:setSettings', (settings) => mariadbSync.setSyncSettings(settings));
  handle('sync:test', (settings) => mariadbSync.testConnection(settings));
  handle('sync:run', () => mariadbSync.runSync(CURRENT_ACTOR()));
  handle('sync:generateOrgKey', () => mariadbSync.generateAndStoreOrgKey());
  handle('sync:importOrgKey', (key) => mariadbSync.importAndStoreOrgKey(key));

  // ---- Audit log ----
  handle('audit:list', (limit) => database.listAuditLog(limit));

  // ---- Auto-update (real GitHub Releases check, honestly reported) ----
  handle('update:check', async () => {
    const res = await fetch('https://api.github.com/repos/AprileNunzio/WispCore/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WispCore-App' },
    });
    if (!res.ok) {
      throw new Error(res.status === 404 ? 'Nessuna release pubblicata su GitHub.' : `GitHub API: ${res.status}`);
    }
    const json = await res.json();
    const latestTag = (json.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    return {
      currentVersion: current,
      latestVersion: latestTag || null,
      isLatest: !latestTag || latestTag === current,
      releaseUrl: json.html_url || null,
      publishedAt: json.published_at || null,
    };
  });

  // ---- One-time migration from the old localStorage-only prototype ----
  // Called by the renderer right after a fresh Super Admin is created, only
  // when it detected leftover data in the browser's localStorage from the
  // previous (pre-enterprise) version of the app. Guarded so it can never
  // silently duplicate data if invoked more than once.
  handle('migrate:legacyLocalStorage', (payload) => {
    if (database.hasAnyBusinessData()) return { migrated: false, reason: 'already-has-data' };
    if (!payload || (!payload.clients?.length && !payload.collaborators?.length)) {
      return { migrated: false, reason: 'no-legacy-data' };
    }
    const result = database.importLegacyData(payload, CURRENT_ACTOR());
    return { migrated: true, ...result };
  });
}
