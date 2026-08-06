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
  default_installation_commission?: number;
  created_at: string;
  updated_at?: string;
}

export type BillingCycle = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';

/** Etichetta e durata in mesi di ogni ciclo di fatturazione, usate sia in UI che per normalizzare il canone a un equivalente mensile (es. per l'MRR in Dashboard). */
export const BILLING_CYCLE_INFO: Record<BillingCycle, { label: string; months: number }> = {
  MONTHLY: { label: 'Mensile', months: 1 },
  BIMONTHLY: { label: 'Bimestrale (ogni 2 mesi)', months: 2 },
  QUARTERLY: { label: 'Trimestrale (ogni 3 mesi)', months: 3 },
  SEMIANNUAL: { label: 'Semestrale (ogni 6 mesi)', months: 6 },
  ANNUAL: { label: 'Annuale', months: 12 },
  CUSTOM: { label: 'Personalizzato', months: 1 },
};
export type ClientStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'PROSPECT';

export interface Client {
  id: number;
  uuid?: string;
  collaborator_id?: number | null;
  plan_id?: number | null;
  network_node_id?: number | null;
  first_name: string;
  last_name: string;
  tax_code?: string;
  address?: string;
  phone?: string;
  email?: string;
  status: ClientStatus;
  cancelled_at?: string;
  cancellation_reason?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  contract_notes?: string;
  contract_document_path?: string;
  latitude?: number | null;
  longitude?: number | null;
  billing_cycle: BillingCycle;
  monthly_fee: number;
  installation_fee: number;
  collaborator_commission_fee?: number;
  collaborator_installation_commission?: number;
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
  network_node_name?: string | null;
}

export interface ClientPlanHistoryEntry {
  id: number;
  client_id: number;
  old_plan_id: number | null;
  new_plan_id: number | null;
  old_plan_name: string | null;
  new_plan_name: string | null;
  old_monthly_fee: number | null;
  new_monthly_fee: number | null;
  changed_at: string;
  changed_by: string | null;
}

export interface NetworkNode {
  id: number;
  uuid?: string;
  name: string;
  ip_address?: string | null;
  username?: string | null;
  password?: string | null;
  hasPassword?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  max_clients?: number | null;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
  // Calcolati lato backend
  active_clients?: number;
  saturation_pct?: number | null;
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
  deleted?: boolean | number;
  // Joined fields
  client_name?: string;
}

export type PayoutStatus = 'PENDING' | 'PAID';

export interface Commission {
  id: number;
  uuid?: string;
  collaborator_id: number;
  client_id: number;
  payment_id?: number | null;
  amount: number;
  payout_status: PayoutStatus;
  created_at: string;
  // Joined fields
  collaborator_name?: string;
  client_name?: string;
}

export interface ClientInstallationSplit {
  id: number;
  client_id: number;
  collaborator_id: number;
  amount: number;
  collaborator_name?: string;
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

export interface CsvImportResult {
  imported: number;
  total: number;
  errors: string[];
}

export interface SecondaryBackupSettings {
  enabled: boolean;
  directory: string | null;
  lastBackupAt: string | null;
  lastError: string | null;
}

export interface LockoutState {
  isLocked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  remainingAttempts: number;
}

export type AdminRole = 'SUPER_ADMIN' | 'TECNICO' | 'COMMERCIALE' | 'COLLABORATORE';

/** Restituita da verifyPin: chi si è autenticato in questa sessione, per il gating dei permessi in UI. */
export interface Session {
  username: string;
  role: AdminRole;
  linkedCollaboratorId: number | null;
}

export interface StaffAdmin {
  id: number;
  username: string;
  role: AdminRole;
  linked_collaborator_id: number | null;
  created_at: string;
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

/** Evento push del ciclo di auto-update, inoltrato dal main process durante il controllo/download in background. */
export interface UpdateEvent {
  type: 'downloading' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  releaseUrl?: string | null;
  message?: string;
}

export interface MonthlyAnalyticsPoint {
  month: string; // YYYY-MM
  revenue: number;
  newClients: number;
  overdue: number;
  commissions: number;
}

export interface TopClient {
  id: number;
  first_name: string;
  last_name: string;
  total_paid: number;
}

export interface ChurnMonthPoint {
  month: string; // YYYY-MM
  startingBase: number;
  cancelled: number;
  churnRatePct: number;
}

export interface CancellationReason {
  reason: string;
  count: number;
}

export interface BiMetrics {
  activeCount: number;
  mrr: number;
  arpu: number;
  ltv: number;
  ltvMethod: string;
  avgMonthlyChurnPct: number;
  churnSeries: ChurnMonthPoint[];
  cancellationReasons: CancellationReason[];
  nodeSaturation: NetworkNode[];
}

export interface CommissionByCollaborator {
  id: number;
  first_name: string;
  last_name: string;
  pending_amount: number;
  total_amount: number;
}

/**
 * Payload di salvataggio cliente: i campi extra sono istruzioni valide solo
 * in fase di creazione (ripartizione installazione, flag "già pagato"), non
 * fanno parte dell'entità Client persistita così come restituita dalle liste.
 */
export interface ClientSavePayload extends Partial<Client> {
  installation_splits?: { collaborator_id: number; amount: number }[];
  already_paid_this_period?: boolean;
  already_paid_installation?: boolean;
}

export interface ClientDetail {
  client: Client;
  payments: Payment[];
  commissions: Commission[];
  planHistory: ClientPlanHistoryEntry[];
  installationSplits: ClientInstallationSplit[];
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

// --- BETA ENTERPRISE TYPES ---

export interface BetaNasRouter {
  id: number;
  uuid?: string;
  name: string;
  ip_address: string;
  api_port: number;
  username: string;
  hasPassword?: boolean;
  password?: string; // Solo per payload, in DB cifrata
  radius_secret?: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface BetaIpamSubnet {
  id: number;
  uuid?: string;
  name: string;
  cidr: string; // es. 10.10.10.0/24
  gateway?: string | null;
  vlan_id?: number | null;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface BetaRadiusSettings {
  enabled: boolean;
  secret: string;
  coa_port: number;
  disconnect_on_overdue: boolean;
}

export interface BetaCpeCredentials {
  username: string;
  password?: string;
  hasPassword?: boolean;
  uisp_key?: string;
}

export interface BetaInventoryItem {
  id: number;
  uuid?: string;
  device_type: string; // 'ANTENNA_CPE', 'ROUTER_WIFI', 'SWITCH', 'OTHER'
  brand?: string;
  model?: string;
  mac_address?: string;
  serial_number?: string;
  status: string; // 'IN_STOCK', 'INSTALLED', 'BROKEN', 'RETURNED'
  client_id?: number;
  first_name?: string; // from join
  last_name?: string; // from join
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface BetaMonitoringNode {
  id: number;
  uuid?: string;
  name: string;
  ip_address: string;
  type: string; // 'BTS', 'ROUTER', 'SWITCH'
  status: string; // 'ONLINE', 'OFFLINE', 'UNKNOWN'
  last_check?: string;
  uptime_percentage: number;
  created_at: string;
  updated_at?: string;
}

export interface IpamHeatmapClient {
  id: number;
  first_name: string;
  last_name: string;
  assigned_ip: string;
  mac_address?: string;
  status: 'ACTIVE' | 'SUSPENDED';
}
