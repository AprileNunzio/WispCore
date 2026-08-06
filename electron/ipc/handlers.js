import { ipcMain, app } from 'electron';
import { getAppPaths } from '../services/paths.js';
import * as database from '../services/database.js';
import * as auth from '../services/auth.js';
import * as backup from '../services/backup.js';
import * as mariadbSync from '../services/sync/mariadb.js';
import * as syncScheduler from '../services/sync/scheduler.js';
import * as email from '../services/email.js';
import * as updater from '../services/updater.js';

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
  handle('clients:getDetail', (id) => database.getClientDetail(id));
  handle('clients:search', (query, limit) => database.searchClientsLite(query, limit));

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
  handle('commissions:byCollaborator', () => database.getCommissionsByCollaborator());

  // ---- Plans (catalogo offerte) ----
  handle('plans:list', () => database.listPlans());
  handle('plans:save', (data) => database.savePlan(data, CURRENT_ACTOR()));
  handle('plans:delete', (id) => database.deletePlan(id, CURRENT_ACTOR()));

  // ---- Analytics ----
  handle('analytics:monthly', (months) => database.getMonthlyAnalytics(months));
  handle('analytics:topClients', (limit) => database.getTopClientsByRevenue(limit));

  // ---- Email templates ----
  handle('emailTemplates:list', () => database.listEmailTemplates());
  handle('emailTemplates:save', (data) => database.saveEmailTemplate(data, CURRENT_ACTOR()));
  handle('emailTemplates:delete', (id) => database.deleteEmailTemplate(id, CURRENT_ACTOR()));

  // ---- SMTP / email sending ----
  handle('smtp:getSettings', () => email.getSmtpSettings());
  handle('smtp:setSettings', (settings) => email.setSmtpSettings(settings));
  handle('smtp:test', (settings) => email.testSmtpConnection(settings));
  handle('email:sendPaymentReminder', async ({ paymentId, templateId }) => {
    const payments = database.listPayments();
    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Pagamento non trovato.');
    const client = database.listClients().find((c) => c.id === payment.client_id);
    if (!client?.email) throw new Error('Il cliente non ha un indirizzo email registrato.');

    const templates = database.listEmailTemplates();
    const template = templates.find((t) => t.id === templateId) || templates[0];
    if (!template) throw new Error('Nessun template email disponibile. Creane uno nelle Impostazioni.');

    const variables = {
      nome_cliente: `${client.first_name} ${client.last_name}`,
      importo: payment.amount.toFixed(2),
      scadenza: payment.due_date,
      tipo_pagamento: payment.payment_type,
    };
    const subject = email.renderTemplate(template.subject, variables);
    const html = email.renderTemplate(template.body, variables).replace(/\n/g, '<br/>');
    const result = await email.sendEmail({ to: client.email, subject, html });
    database.recordAudit(CURRENT_ACTOR(), 'EMAIL_SENT', 'payment', paymentId, { to: client.email });
    database.persist();
    return result;
  });

  // ---- Backup / restore ----
  handle('backup:list', () => backup.listBackups());
  handle('backup:run', () => backup.runBackup({ reason: 'manual' }));
  handle('backup:restore', (fileName) => backup.restoreBackup(fileName));
  handle('backup:exportToFile', () => backup.exportToFile(getWindow()));
  handle('backup:importFromFile', () => backup.importFromFile(getWindow(), CURRENT_ACTOR()));

  // ---- Backup secondario (cartella esterna, NAS, unità di rete...) ----
  handle('backup:getSecondarySettings', () => backup.getSecondaryBackupSettings());
  handle('backup:pickSecondaryDir', () => backup.pickSecondaryBackupDirectory(getWindow()));
  handle('backup:setSecondarySettings', (settings) => backup.setSecondaryBackupSettings(settings));

  // ---- MariaDB multi-site sync ----
  handle('sync:getSettings', () => mariadbSync.getSyncSettings());
  handle('sync:setSettings', (settings) => {
    const saved = mariadbSync.setSyncSettings(settings);
    // Applica subito il nuovo intervallo/stato senza richiedere il riavvio dell'app.
    syncScheduler.rescheduleAutoSync();
    return saved;
  });
  handle('sync:test', (settings) => mariadbSync.testConnection(settings));
  handle('sync:run', () => mariadbSync.runSync(CURRENT_ACTOR()));
  handle('sync:generateOrgKey', () => mariadbSync.generateAndStoreOrgKey());
  handle('sync:importOrgKey', (key) => mariadbSync.importAndStoreOrgKey(key));

  // ---- Audit log ----
  handle('audit:list', (limit) => database.listAuditLog(limit));

  // ---- Auto-update (real GitHub Releases check, honestly reported) ----
  const sendUpdateEvent = (payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update:event', payload);
  };

  handle('update:check', () => updater.checkForUpdate());
  // Trigger manuale (es. bottone in Impostazioni): scarica in background
  // esattamente come il controllo automatico all'avvio, riusando la stessa
  // logica e gli stessi eventi verso il renderer.
  handle('update:downloadNow', () => updater.checkAndDownloadUpdateInBackground(sendUpdateEvent));
  handle('update:install', () => updater.installDownloadedUpdate());

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
