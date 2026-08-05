import type {
  Client,
  Collaborator,
  Payment,
  Commission,
  PaymentStatus,
  PayoutStatus,
  SyncSettings,
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

  // ---- Auth / setup ----
  isFirstRun: () => bridge().auth.isFirstRun(),
  hasLegacyLocalStorageData,
  migrateLegacyDataIfPresent,

  async registerSuperAdmin(username: string, pin: string): Promise<void> {
    await bridge().auth.registerSuperAdmin(username, pin);
    await migrateLegacyDataIfPresent();
  },

  verifyPin: (pin: string): Promise<boolean> => bridge().auth.verifyPin(pin),
  getAdminUsername: (): Promise<string> => bridge().auth.getAdminUsername(),
  getLockoutState: () => bridge().auth.getLockoutState(),

  // ---- Clients ----
  getClients: (): Promise<Client[]> => bridge().clients.list(),
  saveClient: (data: Partial<Client>): Promise<Client> => bridge().clients.save(data),
  deleteClient: (id: number): Promise<void> => bridge().clients.delete(id),

  // ---- Collaborators ----
  getCollaborators: (): Promise<Collaborator[]> => bridge().collaborators.list(),
  saveCollaborator: (data: Partial<Collaborator>): Promise<Collaborator> => bridge().collaborators.save(data),

  // ---- Payments ----
  getPayments: (): Promise<Payment[]> => bridge().payments.list(),
  addPayment: (data: Omit<Payment, 'id'>): Promise<Payment> => bridge().payments.add(data),
  updatePaymentStatus: (id: number, status: PaymentStatus): Promise<void> => bridge().payments.updateStatus(id, status),

  // ---- Commissions ----
  getCommissions: (): Promise<Commission[]> => bridge().commissions.list(),
  addCommission: (data: Omit<Commission, 'id' | 'created_at'>): Promise<Commission> => bridge().commissions.add(data),
  updateCommissionStatus: (id: number, status: PayoutStatus): Promise<void> => bridge().commissions.updateStatus(id, status),

  // ---- Backup & restore ----
  getBackupsList: () => bridge().backup.list(),
  runBackupNow: () => bridge().backup.run(),
  restoreBackup: (fileName: string) => bridge().backup.restore(fileName),
  exportFullBackup: () => bridge().backup.exportToFile(),
  importFullBackup: () => bridge().backup.importFromFile(),

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
};
