import type {
  Client,
  Collaborator,
  Payment,
  Commission,
  PaymentStatus,
  PayoutStatus,
  AppPaths,
  BackupInfo,
  LockoutState,
  SyncSettings,
  SyncSummary,
  AuditLogEntry,
  UpdateCheckResult,
} from './types';

export interface WispCoreBridge {
  system: {
    getPaths: () => Promise<AppPaths>;
    getVersion: () => Promise<string>;
  };
  auth: {
    isFirstRun: () => Promise<boolean>;
    registerSuperAdmin: (username: string, pin: string) => Promise<boolean>;
    verifyPin: (pin: string) => Promise<boolean>;
    getAdminUsername: () => Promise<string>;
    getLockoutState: () => Promise<LockoutState>;
  };
  clients: {
    list: () => Promise<Client[]>;
    save: (data: Partial<Client>) => Promise<Client>;
    delete: (id: number) => Promise<void>;
  };
  collaborators: {
    list: () => Promise<Collaborator[]>;
    save: (data: Partial<Collaborator>) => Promise<Collaborator>;
  };
  payments: {
    list: () => Promise<Payment[]>;
    add: (data: Omit<Payment, 'id'>) => Promise<Payment>;
    updateStatus: (id: number, status: PaymentStatus) => Promise<void>;
  };
  commissions: {
    list: () => Promise<Commission[]>;
    add: (data: Omit<Commission, 'id' | 'created_at'>) => Promise<Commission>;
    updateStatus: (id: number, status: PayoutStatus) => Promise<void>;
  };
  backup: {
    list: () => Promise<BackupInfo[]>;
    run: () => Promise<BackupInfo>;
    restore: (fileName: string) => Promise<boolean>;
    exportToFile: () => Promise<string | null>;
    importFromFile: () => Promise<boolean>;
  };
  sync: {
    getSettings: () => Promise<SyncSettings>;
    setSettings: (settings: Partial<SyncSettings> & { password?: string }) => Promise<SyncSettings>;
    test: (settings?: Partial<SyncSettings> & { password?: string }) => Promise<{ ok: boolean; error?: string }>;
    run: () => Promise<SyncSummary>;
    generateOrgKey: () => Promise<string>;
    importOrgKey: (key: string) => Promise<boolean>;
  };
  audit: {
    list: (limit?: number) => Promise<AuditLogEntry[]>;
  };
  update: {
    check: () => Promise<UpdateCheckResult>;
  };
  migrate: {
    legacyLocalStorage: (payload: unknown) => Promise<{ migrated: boolean; clients?: number; collaborators?: number; reason?: string }>;
  };
}

declare global {
  interface Window {
    wispcore: WispCoreBridge;
  }
}
