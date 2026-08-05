import type {
  Client,
  ClientLite,
  ClientDetail,
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
  Plan,
  MonthlyAnalyticsPoint,
  TopClient,
  CommissionByCollaborator,
  EmailTemplate,
  SmtpSettings,
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
    getDetail: (id: number) => Promise<ClientDetail | null>;
    search: (query: string, limit?: number) => Promise<ClientLite[]>;
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
    byCollaborator: () => Promise<CommissionByCollaborator[]>;
  };
  plans: {
    list: () => Promise<Plan[]>;
    save: (data: Partial<Plan>) => Promise<Plan>;
    delete: (id: number) => Promise<void>;
  };
  analytics: {
    monthly: (months?: number) => Promise<MonthlyAnalyticsPoint[]>;
    topClients: (limit?: number) => Promise<TopClient[]>;
  };
  emailTemplates: {
    list: () => Promise<EmailTemplate[]>;
    save: (data: Partial<EmailTemplate>) => Promise<EmailTemplate>;
    delete: (id: number) => Promise<void>;
  };
  smtp: {
    getSettings: () => Promise<SmtpSettings>;
    setSettings: (settings: Partial<SmtpSettings> & { password?: string }) => Promise<SmtpSettings>;
    test: (settings?: Partial<SmtpSettings> & { password?: string }) => Promise<{ ok: boolean; error?: string }>;
  };
  email: {
    sendPaymentReminder: (paymentId: number, templateId: number) => Promise<{ messageId: string }>;
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
