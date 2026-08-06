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
  SecondaryBackupSettings,
  LockoutState,
  Session,
  StaffAdmin,
  AdminRole,
  SyncSettings,
  SyncSummary,
  AuditLogEntry,
  UpdateCheckResult,
  UpdateEvent,
  Plan,
  MonthlyAnalyticsPoint,
  TopClient,
  CommissionByCollaborator,
  EmailTemplate,
  SmtpSettings,
  NetworkNode,
  BiMetrics,
  CsvImportResult,
} from './types';

export interface WispCoreBridge {
  system: {
    getPaths: () => Promise<AppPaths>;
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  };
  auth: {
    isFirstRun: () => Promise<boolean>;
    registerSuperAdmin: (username: string, pin: string) => Promise<boolean>;
    verifyPin: (pin: string) => Promise<Session | null>;
    lockSession: () => Promise<boolean>;
    getAdminUsername: () => Promise<string>;
    getLockoutState: () => Promise<LockoutState>;
  };
  admins: {
    list: () => Promise<StaffAdmin[]>;
    create: (data: { username: string; pin: string; role: AdminRole; linkedCollaboratorId?: number | null }) => Promise<StaffAdmin>;
    update: (data: { id: number; username?: string; role?: AdminRole; linkedCollaboratorId?: number | null; pin?: string }) => Promise<StaffAdmin>;
    delete: (id: number) => Promise<boolean>;
  };
  clients: {
    list: () => Promise<Client[]>;
    save: (data: Partial<Client>) => Promise<Client>;
    delete: (id: number) => Promise<void>;
    getDetail: (id: number) => Promise<ClientDetail | null>;
    search: (query: string, limit?: number) => Promise<ClientLite[]>;
    attachContractDocument: (id: number) => Promise<string | null>;
    openContractDocument: (id: number) => Promise<boolean>;
  };
  networkNodes: {
    list: () => Promise<NetworkNode[]>;
    save: (data: Partial<NetworkNode>) => Promise<NetworkNode>;
    delete: (id: number) => Promise<void>;
  };
  collaborators: {
    list: () => Promise<Collaborator[]>;
    save: (data: Partial<Collaborator>) => Promise<Collaborator>;
  };
  payments: {
    list: () => Promise<Payment[]>;
    add: (data: Omit<Payment, 'id'>) => Promise<Payment>;
    updateStatus: (id: number, status: PaymentStatus) => Promise<{ nextDueDate: string | null }>;
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
    bi: (months?: number) => Promise<BiMetrics>;
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
    getSecondarySettings: () => Promise<SecondaryBackupSettings>;
    pickSecondaryDir: () => Promise<string | null>;
    setSecondarySettings: (settings: { enabled: boolean; directory?: string | null }) => Promise<SecondaryBackupSettings>;
  };
  csv: {
    exportClients: () => Promise<string | null>;
    exportPayments: () => Promise<string | null>;
    exportCommissions: () => Promise<string | null>;
    importClients: () => Promise<CsvImportResult | null>;
  };
  report: {
    generatePeriodPdf: (months?: number) => Promise<string | null>;
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
    downloadNow: () => Promise<void>;
    install: () => Promise<void>;
    onEvent: (callback: (event: UpdateEvent) => void) => () => void;
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
