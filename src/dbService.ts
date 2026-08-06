import type {
  Client,
  ClientLite,
  ClientDetail,
  ClientSavePayload,
  Collaborator,
  Payment,
  Commission,
  PaymentStatus,
  PayoutStatus,
  SyncSettings,
  Plan,
  EmailTemplate,
  SmtpSettings,
  UpdateEvent,
  AdminRole,
  NetworkNode,
  BetaNasRouter,
  BetaIpamSubnet,
  BetaRadiusSettings,
  BetaCpeCredentials,
} from './types';

/**
 * Thin async wrapper around the `window.wispcore` bridge exposed by
 * electron/preload.cjs. All real logic (persistence, encryption, backups,
 * MariaDB sync) lives in the main process - this module exists so the React
 * components keep a small, stable, promise-based API instead of talking to
 * `ipcRenderer` directly everywhere.
 */
const bridge = () => {
  if (!window.wispcore) {
    throw new Error(
      'Bridge nativo non disponibile: l\'app non è in esecuzione dentro Electron (o il preload non è stato caricato).'
    );
  }
  return window.wispcore;
};

// ---------------------------------------------------------------------------
// Legacy localStorage migration (one-time, from the pre-enterprise prototype)
// ---------------------------------------------------------------------------

const LEGACY_KEYS = {
  adminUser: 'wispcore_admin_username',
  adminPin: 'wispcore_admin_pin_hash',
  clients: 'wispcore_clients_db',
  collaborators: 'wispcore_collaborators_db',
  payments: 'wispcore_payments_db',
  commissions: 'wispcore_commissions_db',
};

function readLegacyLocalStorageData() {
  const clients = JSON.parse(localStorage.getItem(LEGACY_KEYS.clients) || '[]');
  const collaborators = JSON.parse(localStorage.getItem(LEGACY_KEYS.collaborators) || '[]');
  const payments = JSON.parse(localStorage.getItem(LEGACY_KEYS.payments) || '[]');
  const commissions = JSON.parse(localStorage.getItem(LEGACY_KEYS.commissions) || '[]');
  return { clients, collaborators, payments, commissions };
}

export function hasLegacyLocalStorageData(): boolean {
  return !!localStorage.getItem(LEGACY_KEYS.clients) || !!localStorage.getItem(LEGACY_KEYS.collaborators);
}

function clearLegacyLocalStorageData() {
  Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
}

async function migrateLegacyDataIfPresent(): Promise<{ migrated: boolean; clients?: number; collaborators?: number }> {
  if (!hasLegacyLocalStorageData()) return { migrated: false };
  const payload = readLegacyLocalStorageData();
  const result = await bridge().migrate.legacyLocalStorage(payload);
  if (result.migrated) clearLegacyLocalStorageData();
  return result;
}

export const dbService = {
  // ---- System ----
  getAppPaths: () => bridge().system.getPaths(),
  getAppVersion: () => bridge().system.getVersion(),
  openExternal: (url: string) => bridge().system.openExternal(url),

  // ---- Auth / setup ----
  isFirstRun: () => bridge().auth.isFirstRun(),
  hasLegacyLocalStorageData,
  migrateLegacyDataIfPresent,

  async registerSuperAdmin(username: string, pin: string): Promise<void> {
    await bridge().auth.registerSuperAdmin(username, pin);
    await migrateLegacyDataIfPresent();
  },

  verifyPin: (pin: string) => bridge().auth.verifyPin(pin),
  lockSession: () => bridge().auth.lockSession(),
  getAdminUsername: (): Promise<string> => bridge().auth.getAdminUsername(),
  getLockoutState: () => bridge().auth.getLockoutState(),

  // ---- Utenti staff & ruoli ----
  getAdmins: () => bridge().admins.list(),
  createAdmin: (data: { username: string; pin: string; role: AdminRole; linkedCollaboratorId?: number | null }) => bridge().admins.create(data),
  updateAdmin: (data: { id: number; username?: string; role?: AdminRole; linkedCollaboratorId?: number | null; pin?: string }) => bridge().admins.update(data),
  deleteAdmin: (id: number) => bridge().admins.delete(id),

  // ---- Clients ----
  getClients: (): Promise<Client[]> => bridge().clients.list(),
  saveClient: (data: ClientSavePayload): Promise<Client> => bridge().clients.save(data),
  deleteClient: (id: number): Promise<void> => bridge().clients.delete(id),
  getClientDetail: (id: number): Promise<ClientDetail | null> => bridge().clients.getDetail(id),
  searchClients: (query: string, limit?: number): Promise<ClientLite[]> => bridge().clients.search(query, limit),
  attachContractDocument: (id: number) => bridge().clients.attachContractDocument(id),
  openContractDocument: (id: number) => bridge().clients.openContractDocument(id),
  getClientInstallationSplits: (id: number) => bridge().clients.getInstallationSplits(id),

  // ---- Network nodes (ripetitori/BTS) ----
  getNetworkNodes: () => bridge().networkNodes.list(),
  saveNetworkNode: (data: Partial<NetworkNode>) => bridge().networkNodes.save(data),
  deleteNetworkNode: (id: number) => bridge().networkNodes.delete(id),

  // ---- Collaborators ----
  getCollaborators: (): Promise<Collaborator[]> => bridge().collaborators.list(),
  saveCollaborator: (data: Partial<Collaborator>): Promise<Collaborator> => bridge().collaborators.save(data),

  // ---- Payments ----
  getPayments: (): Promise<Payment[]> => bridge().payments.list(),
  addPayment: (data: Omit<Payment, 'id'>): Promise<Payment> => bridge().payments.add(data),
  updatePaymentStatus: (id: number, status: PaymentStatus, paymentDate?: string) => bridge().payments.updateStatus(id, status, paymentDate),

  // ---- Commissions ----
  getCommissions: (): Promise<Commission[]> => bridge().commissions.list(),
  addCommission: (data: Omit<Commission, 'id' | 'created_at'>): Promise<Commission> => bridge().commissions.add(data),
  updateCommissionStatus: (id: number, status: PayoutStatus): Promise<void> => bridge().commissions.updateStatus(id, status),
  deleteCommission: (id: number): Promise<void> => bridge().commissions.delete(id),
  getCommissionsByCollaborator: () => bridge().commissions.byCollaborator(),

  // ---- Plans ----
  getPlans: (): Promise<Plan[]> => bridge().plans.list(),
  savePlan: (data: Partial<Plan>): Promise<Plan> => bridge().plans.save(data),
  deletePlan: (id: number): Promise<void> => bridge().plans.delete(id),

  // ---- Analytics ----
  getMonthlyAnalytics: (months?: number) => bridge().analytics.monthly(months),
  getTopClients: (limit?: number) => bridge().analytics.topClients(limit),
  getBiMetrics: (months?: number) => bridge().analytics.bi(months),

  // ---- Email templates ----
  getEmailTemplates: (): Promise<EmailTemplate[]> => bridge().emailTemplates.list(),
  saveEmailTemplate: (data: Partial<EmailTemplate>): Promise<EmailTemplate> => bridge().emailTemplates.save(data),
  deleteEmailTemplate: (id: number): Promise<void> => bridge().emailTemplates.delete(id),

  // ---- SMTP / email ----
  getSmtpSettings: (): Promise<SmtpSettings> => bridge().smtp.getSettings(),
  setSmtpSettings: (settings: Partial<SmtpSettings> & { password?: string }) => bridge().smtp.setSettings(settings),
  testSmtpConnection: (settings?: Partial<SmtpSettings> & { password?: string }) => bridge().smtp.test(settings),
  sendPaymentReminder: (paymentId: number, templateId: number) => bridge().email.sendPaymentReminder(paymentId, templateId),

  // ---- Backup & restore ----
  getBackupsList: () => bridge().backup.list(),
  runBackupNow: () => bridge().backup.run(),
  restoreBackup: (fileName: string) => bridge().backup.restore(fileName),
  exportFullBackup: () => bridge().backup.exportToFile(),
  importFullBackup: () => bridge().backup.importFromFile(),
  getSecondaryBackupSettings: () => bridge().backup.getSecondarySettings(),
  pickSecondaryBackupDir: () => bridge().backup.pickSecondaryDir(),
  setSecondaryBackupSettings: (settings: { enabled: boolean; directory?: string | null }) => bridge().backup.setSecondarySettings(settings),

  // ---- Export CSV / import massivo / report PDF ----
  exportClientsCsv: () => bridge().csv.exportClients(),
  exportPaymentsCsv: () => bridge().csv.exportPayments(),
  exportCommissionsCsv: () => bridge().csv.exportCommissions(),
  importClientsCsv: () => bridge().csv.importClients(),
  generatePeriodReportPdf: (months?: number) => bridge().report.generatePeriodPdf(months),

  // ---- MariaDB multi-site sync ----
  getSyncSettings: (): Promise<SyncSettings> => bridge().sync.getSettings(),
  setSyncSettings: (settings: Partial<SyncSettings> & { password?: string }) => bridge().sync.setSettings(settings),
  testSyncConnection: (settings?: Partial<SyncSettings> & { password?: string }) => bridge().sync.test(settings),
  runSync: () => bridge().sync.run(),
  generateOrgKey: () => bridge().sync.generateOrgKey(),
  importOrgKey: (key: string) => bridge().sync.importOrgKey(key),

  // ---- Audit log ----
  getAuditLog: (limit?: number) => bridge().audit.list(limit),

  // ---- Updates ----
  checkForUpdate: () => bridge().update.check(),
  downloadUpdateNow: () => bridge().update.downloadNow(),
  installUpdate: () => bridge().update.install(),
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => bridge().update.onEvent(callback),

  // ---- Beta Enterprise Modules ----
  getBetaNasRouters: (): Promise<BetaNasRouter[]> => bridge().beta.nasRouters.list(),
  saveBetaNasRouter: (data: Partial<BetaNasRouter>): Promise<BetaNasRouter> => bridge().beta.nasRouters.save(data),
  deleteBetaNasRouter: (id: number): Promise<void> => bridge().beta.nasRouters.delete(id),
  
  getBetaIpamSubnets: (): Promise<BetaIpamSubnet[]> => bridge().beta.ipamSubnets.list(),
  saveBetaIpamSubnet: (data: Partial<BetaIpamSubnet>): Promise<BetaIpamSubnet> => bridge().beta.ipamSubnets.save(data),
  
  getBetaRadiusSettings: (): Promise<BetaRadiusSettings> => bridge().beta.radiusSettings.get(),
  saveBetaRadiusSettings: (settings: BetaRadiusSettings): Promise<void> => bridge().beta.radiusSettings.save(settings),

  getBetaCpeCredentials: (): Promise<BetaCpeCredentials> => bridge().beta.cpeCredentials.get(),
  saveBetaCpeCredentials: (settings: BetaCpeCredentials): Promise<void> => bridge().beta.cpeCredentials.save(settings),
};
