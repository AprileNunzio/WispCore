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
  default_commission_fee?: number;
  created_at: string;
  updated_at?: string;
}

export type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'CUSTOM';

export interface Client {
  id: number;
  uuid?: string;
  collaborator_id?: number | null;
  plan_id?: number | null;
  first_name: string;
  last_name: string;
  tax_code?: string;
  address?: string;
  phone?: string;
  email?: string;
  billing_cycle: BillingCycle;
  monthly_fee: number;
  installation_fee: number;
  collaborator_commission_fee?: number;
  last_payment_date?: string;
  next_due_date?: string;
  pppoe_username?: string;
  pppoe_password?: string;
  mac_address?: string;
  assigned_ip?: string;
  device_model?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  // Joined fields for convenience
  collaborator_name?: string;
  plan_name?: string | null;
}

export interface ClientLite {
  id: number;
  first_name: string;
  last_name: string;
  assigned_ip?: string;
  mac_address?: string;
  pppoe_username?: string;
}

export interface Plan {
  id: number;
  uuid?: string;
  name: string;
  monthly_fee: number;
  installation_fee: number;
  download_mbps?: number | null;
  upload_mbps?: number | null;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
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

export interface MonthlyAnalyticsPoint {
  month: string; // YYYY-MM
  revenue: number;
  newClients: number;
  overdue: number;
}

export interface TopClient {
  id: number;
  first_name: string;
  last_name: string;
  total_paid: number;
}

export interface CommissionByCollaborator {
  id: number;
  first_name: string;
  last_name: string;
  pending_amount: number;
  total_amount: number;
}

export interface ClientDetail {
  client: Client;
  payments: Payment[];
  commissions: Commission[];
  stats: { totalPaid: number; totalOverdue: number; overdueCount: number; paymentsCount: number };
}

export interface EmailTemplate {
  id: number;
  uuid?: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at?: string;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
}
