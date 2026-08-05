export interface Admin {
  id: number;
  username: string;
  pin_hash: string;
  created_at: string;
}

export interface Collaborator {
  id: number;
  uuid?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  created_at: string;
  updated_at?: string;
}

export type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'CUSTOM';

export interface Client {
  id: number;
  uuid?: string;
  collaborator_id?: number | null;
  first_name: string;
  last_name: string;
  tax_code?: string;
  address?: string;
  phone?: string;
  email?: string;
  billing_cycle: BillingCycle;
  monthly_fee: number;
  installation_fee: number;
  pppoe_username?: string;
  pppoe_password?: string;
  mac_address?: string;
  assigned_ip?: string;
  device_model?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  // Joined field for convenience
  collaborator_name?: string;
}

export type PaymentType = 'INSTALLATION' | 'RECURRING' | 'EXTRA';
export type PaymentStatus = 'PAID' | 'PENDING' | 'OVERDUE';

export interface Payment {
  id: number;
  uuid?: string;
  client_id: number;
  amount: number;
  payment_type: PaymentType;
  payment_date: string;
  due_date: string;
  status: PaymentStatus;
  // Joined fields
  client_name?: string;
}

export type PayoutStatus = 'PENDING' | 'PAID';

export interface Commission {
  id: number;
  uuid?: string;
  collaborator_id: number;
  client_id: number;
  amount: number;
  payout_status: PayoutStatus;
  created_at: string;
  // Joined fields
  collaborator_name?: string;
  client_name?: string;
}

export interface AppConfig {
  isSetupComplete: boolean;
  version: string;
  appDir: string;
  dbPath: string;
  repoUrl: string;
}

export interface AppPaths {
  rootDir: string;
  dbPath: string;
  dbDir: string;
  configPath: string;
  configDir: string;
  logsDir: string;
  logFile: string;
  backupsDir: string;
  oneDriveDetected: boolean;
}

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  checksumOk: boolean | null;
}

export interface LockoutState {
  isLocked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  remainingAttempts: number;
}

export interface SyncSettings {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
  ssl: boolean;
  autoSyncMinutes: number;
  lastSyncAt: string | null;
  siteId: string | null;
  hasOrgKey: boolean;
}

export interface SyncSummary {
  pulled: { collaborators: number; clients: number; payments: number; commissions: number };
  pushed: number;
}

export interface AuditLogEntry {
  id: number;
  ts: string;
  actor: string | null;
  action: string;
  entity: string;
  entity_id: number | null;
  details: string | null;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  isLatest: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
}
