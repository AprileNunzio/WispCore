import { ipcMain, app, shell } from 'electron';
import { getAppPaths } from '../services/paths.js';
import * as database from '../services/database.js';
import * as auth from '../services/auth.js';
import * as backup from '../services/backup.js';
import * as mariadbSync from '../services/sync/mariadb.js';
import * as syncScheduler from '../services/sync/scheduler.js';
import * as email from '../services/email.js';
import * as updater from '../services/updater.js';
import * as csv from '../services/csv.js';
import * as report from '../services/report.js';
import * as mikrotikSync from '../services/mikrotikSync.js';

// Con più utenti, l'attore da registrare in audit/outbox è chi ha
// effettivamente sbloccato la sessione corrente (auth.getCurrentSession),
// non più genericamente "il primo admin creato".
const CURRENT_ACTOR = () => auth.getCurrentSession()?.username || database.getAdmin()?.username || 'admin';

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
  // Apre link esterni (WhatsApp, Google Maps...) nel browser di sistema,
  // mai dentro la finestra dell'app. Limitato a http/https per sicurezza:
  // niente file://, javascript: o altri schemi potenzialmente pericolosi.
  handle('system:openExternal', (url) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      throw new Error('URL non valido: consentiti solo link https.');
    }
    return shell.openExternal(url);
  });

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
    // Un solo campo PIN per tutti gli utenti (nessun selettore di username):
    // proviamo l'hash su ogni account finché uno combacia. Con poche decine
    // di account staff il costo (Argon2id sequenziale) resta accettabile per
    // una schermata di sblocco.
    const admins = database.listAdminsForAuth();
    let matched = null;
    for (const admin of admins) {
      const valid = await auth.verifyPinHash(pin, admin.pin_hash);
      if (valid) { matched = admin; break; }
    }

    if (matched) {
      auth.resetFailedAttempts();
      auth.setCurrentSession(matched);
      database.recordAudit(matched.username, 'LOGIN', 'session', null, { role: matched.role });
      database.persist();
      return {
        username: matched.username,
        role: matched.role,
        linkedCollaboratorId: matched.linked_collaborator_id || null,
      };
    }

    auth.registerFailedAttempt();
    return null;
  });

  handle('auth:lockSession', () => {
    const session = auth.getCurrentSession();
    if (session) database.recordAudit(session.username, 'LOGOUT', 'session', null, null);
    auth.clearCurrentSession();
    return true;
  });

  handle('auth:getAdminUsername', () => auth.getCurrentSession()?.username || database.getAdmin()?.username || 'Super Admin');
  handle('auth:getLockoutState', () => auth.getLockoutState());

  // ---- Gestione utenti staff (Impostazioni -> Utenti & Ruoli) ----
  handle('admins:list', () => database.listAdmins());
  handle('admins:create', async ({ username, pin, role, linkedCollaboratorId }) => {
    const pinHash = await auth.hashPin(pin);
    return database.createStaffAdmin({ username, pinHash, role, linkedCollaboratorId }, CURRENT_ACTOR());
  });
  handle('admins:update', async ({ id, username, role, linkedCollaboratorId, pin }) => {
    const pinHash = pin ? await auth.hashPin(pin) : undefined;
    return database.updateAdmin(id, { username, role, linkedCollaboratorId, pinHash }, CURRENT_ACTOR());
  });
  handle('admins:delete', (id) => database.deleteAdmin(id, CURRENT_ACTOR()));

  // ---- Clients ----
  handle('clients:list', () => database.listClients());
  handle('clients:save', (data) => database.saveClient(data, CURRENT_ACTOR()));
  handle('clients:delete', (id) => database.deleteClient(id, CURRENT_ACTOR()));
  handle('clients:getDetail', (id) => database.getClientDetail(id));
  handle('clients:search', (query, limit) => database.searchClientsLite(query, limit));
  handle('clients:attachContractDocument', (id) => database.pickAndAttachContractDocument(id, getWindow(), CURRENT_ACTOR()));
  handle('clients:openContractDocument', (id) => database.openContractDocument(id));
  handle('clients:getInstallationSplits', (id) => database.listClientInstallationSplits(id));

  // ---- Collaborators ----
  handle('collaborators:list', () => database.listCollaborators());
  handle('collaborators:save', (data) => database.saveCollaborator(data, CURRENT_ACTOR()));

  // ---- Payments ----
  handle('payments:list', () => database.listPayments());
  handle('payments:add', (data) => database.addPayment(data, CURRENT_ACTOR()));
  handle('payments:updateStatus', (id, status, paymentDate) => database.updatePaymentStatus(id, status, CURRENT_ACTOR(), paymentDate));

  // ---- Commissions ----
  handle('commissions:list', () => database.listCommissions());
  handle('commissions:add', (data) => database.addCommission(data, CURRENT_ACTOR()));
  handle('commissions:updateStatus', (id, status) => database.updateCommissionStatus(id, status, CURRENT_ACTOR()));
  handle('commissions:delete', (id) => database.deleteCommission(id, CURRENT_ACTOR()));
  handle('commissions:byCollaborator', () => database.getCommissionsByCollaborator());

  // ---- Plans (catalogo offerte) ----
  handle('plans:list', () => database.listPlans());
  handle('plans:save', (data) => database.savePlan(data, CURRENT_ACTOR()));
  handle('plans:delete', (id) => database.deletePlan(id, CURRENT_ACTOR()));

  // ---- Network nodes (ripetitori/BTS) ----
  handle('networkNodes:list', () => database.listNetworkNodes());
  handle('networkNodes:save', (data) => database.saveNetworkNode(data, CURRENT_ACTOR()));
  handle('networkNodes:delete', (id) => database.deleteNetworkNode(id, CURRENT_ACTOR()));

  // ---- Analytics ----
  handle('analytics:monthly', (months) => database.getMonthlyAnalytics(months));
  handle('analytics:topClients', (limit) => database.getTopClientsByRevenue(limit));
  handle('analytics:bi', (months) => database.getBiMetrics(months));

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

  // ---- Export CSV / import massivo / report PDF ----
  handle('csv:exportClients', () => csv.exportClientsCsv(getWindow()));
  handle('csv:exportPayments', () => csv.exportPaymentsCsv(getWindow()));
  handle('csv:exportCommissions', () => csv.exportCommissionsCsv(getWindow()));
  handle('csv:importClients', () => csv.importClientsCsv(getWindow(), CURRENT_ACTOR()));
  handle('report:generatePeriodPdf', (months) => report.generatePeriodReportPdf(getWindow(), { months }));

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

  // ---- Beta Enterprise Modules ----
  handle('beta:nasRouters:list', () => database.listBetaNasRouters());
  handle('beta:nasRouters:save', (data) => database.saveBetaNasRouter(data, CURRENT_ACTOR()));
  handle('beta:nasRouters:delete', (id) => database.deleteBetaNasRouter(id, CURRENT_ACTOR()));
  
  handle('beta:ipamSubnets:list', () => database.listBetaIpamSubnets());
  handle('beta:ipamSubnets:save', (data) => database.saveBetaIpamSubnet(data, CURRENT_ACTOR()));
  
  handle('beta:radiusSettings:get', () => database.getBetaRadiusSettings());
  handle('beta:radiusSettings:save', (settings) => database.saveBetaRadiusSettings(settings, CURRENT_ACTOR()));
  
  handle('beta:cpeCredentials:get', () => database.getBetaCpeCredentials());
  handle('beta:cpeCredentials:save', (settings) => database.saveBetaCpeCredentials(settings, CURRENT_ACTOR()));

  handle('beta:nms:fetchAccounts', (nasId) => mikrotikSync.fetchMikrotikAccounts(nasId));

  // Nuovi handler Inventory & Monitoring
  handle('beta:inventory:list', () => database.getBetaInventoryItems());
  handle('beta:inventory:save', (data) => database.saveBetaInventoryItem(data, CURRENT_ACTOR()));
  handle('beta:inventory:delete', (id) => database.deleteBetaInventoryItem(id, CURRENT_ACTOR()));

  handle('beta:monitoringNodes:list', () => database.getBetaMonitoringNodes());
  handle('beta:monitoringNodes:save', (data) => database.saveBetaMonitoringNode(data, CURRENT_ACTOR()));
  handle('beta:monitoringNodes:delete', (id) => database.deleteBetaMonitoringNode(id, CURRENT_ACTOR()));

  handle('beta:ipam:heatmap', () => database.getIpamHeatmapData());

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
