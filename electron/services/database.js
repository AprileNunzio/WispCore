import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { dialog, shell } from 'electron';
import initSqlJs from 'sql.js';
import { ensureDirectories, appendLog, getAppPaths } from './paths.js';
import { encryptBuffer, decryptBuffer, encryptField, decryptField, getFieldKey } from './crypto.js';
import { readConfig, updateConfig } from './config.js';
import { normalizeMonthlyFee, calculateNextDueDate, getTodayRomeString } from './financialEngine.js';

let SQL = null;
let db = null;

/**
 * Emette 'change' ad ogni scrittura che genera una riga in outbox (cioè ogni
 * modifica sincronizzabile: clienti, collaboratori, pagamenti, provvigioni).
 * Usato da sync/scheduler.js per innescare la sincronizzazione MariaDB subito
 * dopo una modifica, invece di aspettare il prossimo giro dell'intervallo.
 */
export const dbEvents = new EventEmitter();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
  linked_collaborator_id INTEGER,
  created_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collaborators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  default_commission_fee REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_fee REAL NOT NULL DEFAULT 0,
  installation_fee REAL NOT NULL DEFAULT 0,
  download_mbps INTEGER,
  upload_mbps INTEGER,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS network_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  max_clients INTEGER,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  collaborator_id INTEGER,
  plan_id INTEGER,
  network_node_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  tax_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  cancelled_at TEXT,
  cancellation_reason TEXT,
  contract_start_date TEXT,
  contract_end_date TEXT,
  contract_notes TEXT,
  contract_document_path TEXT,
  latitude REAL,
  longitude REAL,
  billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
  monthly_fee REAL NOT NULL DEFAULT 0,
  installation_fee REAL NOT NULL DEFAULT 0,
  collaborator_commission_fee REAL NOT NULL DEFAULT 0,
  last_payment_date TEXT,
  next_due_date TEXT,
  pppoe_username TEXT,
  pppoe_password_enc TEXT,
  mac_address TEXT,
  assigned_ip TEXT,
  device_model TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  FOREIGN KEY (network_node_id) REFERENCES network_nodes(id)
);

CREATE TABLE IF NOT EXISTS client_plan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  old_plan_id INTEGER,
  new_plan_id INTEGER,
  old_plan_name TEXT,
  new_plan_name TEXT,
  old_monthly_fee REAL,
  new_monthly_fee REAL,
  changed_at TEXT NOT NULL,
  changed_by TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_type TEXT NOT NULL,
  payment_date TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  collaborator_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  payment_id INTEGER,
  amount REAL NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

CREATE TABLE IF NOT EXISTS client_installation_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  collaborator_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (collaborator_id) REFERENCES collaborators(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  uuid TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

-- BETA ENTERPRISE TABLES --
CREATE TABLE IF NOT EXISTS beta_nas_routers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  api_port INTEGER NOT NULL,
  username TEXT NOT NULL,
  password TEXT,
  radius_secret TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS beta_ipam_subnets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  cidr TEXT NOT NULL,
  gateway TEXT,
  vlan_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
`;

/** Adds columns that may be missing on a database created by an older version of the app. */
function runDefensiveMigrations() {
  const clientColumns = all("PRAGMA table_info(clients)").map((c) => c.name);
  if (!clientColumns.includes('collaborator_commission_fee')) {
    run('ALTER TABLE clients ADD COLUMN collaborator_commission_fee REAL NOT NULL DEFAULT 0');
  }
  if (!clientColumns.includes('plan_id')) {
    run('ALTER TABLE clients ADD COLUMN plan_id INTEGER');
  }
  if (!clientColumns.includes('last_payment_date')) {
    run('ALTER TABLE clients ADD COLUMN last_payment_date TEXT');
  }
  if (!clientColumns.includes('next_due_date')) {
    run('ALTER TABLE clients ADD COLUMN next_due_date TEXT');
  }
  if (!clientColumns.includes('network_node_id')) {
    run('ALTER TABLE clients ADD COLUMN network_node_id INTEGER');
  }
  if (!clientColumns.includes('status')) {
    run("ALTER TABLE clients ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'");
  }
  if (!clientColumns.includes('cancelled_at')) {
    run('ALTER TABLE clients ADD COLUMN cancelled_at TEXT');
  }
  if (!clientColumns.includes('cancellation_reason')) {
    run('ALTER TABLE clients ADD COLUMN cancellation_reason TEXT');
  }
  if (!clientColumns.includes('contract_start_date')) {
    run('ALTER TABLE clients ADD COLUMN contract_start_date TEXT');
  }
  if (!clientColumns.includes('contract_end_date')) {
    run('ALTER TABLE clients ADD COLUMN contract_end_date TEXT');
  }
  if (!clientColumns.includes('contract_notes')) {
    run('ALTER TABLE clients ADD COLUMN contract_notes TEXT');
  }
  if (!clientColumns.includes('contract_document_path')) {
    run('ALTER TABLE clients ADD COLUMN contract_document_path TEXT');
  }
  if (!clientColumns.includes('latitude')) {
    run('ALTER TABLE clients ADD COLUMN latitude REAL');
  }
  if (!clientColumns.includes('longitude')) {
    run('ALTER TABLE clients ADD COLUMN longitude REAL');
  }

  if (!clientColumns.includes('collaborator_installation_commission')) {
    run('ALTER TABLE clients ADD COLUMN collaborator_installation_commission REAL NOT NULL DEFAULT 0');
  }

  const collabColumns = all('PRAGMA table_info(collaborators)').map((c) => c.name);
  if (!collabColumns.includes('default_commission_fee')) {
    run('ALTER TABLE collaborators ADD COLUMN default_commission_fee REAL NOT NULL DEFAULT 0');
  }
  if (!collabColumns.includes('default_installation_commission')) {
    run('ALTER TABLE collaborators ADD COLUMN default_installation_commission REAL NOT NULL DEFAULT 0');
  }

  const adminColumns = all('PRAGMA table_info(admins)').map((c) => c.name);
  if (!adminColumns.includes('linked_collaborator_id')) {
    run('ALTER TABLE admins ADD COLUMN linked_collaborator_id INTEGER');
  }
  if (!adminColumns.includes('deleted')) {
    run('ALTER TABLE admins ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
  }

  const commissionColumns = all('PRAGMA table_info(commissions)').map((c) => c.name);
  if (!commissionColumns.includes('payment_id')) {
    run('ALTER TABLE commissions ADD COLUMN payment_id INTEGER');
  }
}

// Placeholder disponibili nel motore di rendering (electron/services/email.js):
// {{nome_cliente}}, {{importo}}, {{scadenza}}, {{tipo_pagamento}}.
const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: 'Promemoria Pagamento Canone',
    subject: 'Promemoria: canone {{tipo_pagamento}} in scadenza il {{scadenza}}',
    body: `Gentile {{nome_cliente}},

con la presente Le ricordiamo cortesemente che il canone di servizio ({{tipo_pagamento}}) di importo pari a € {{importo}} risulta in scadenza il giorno {{scadenza}}.

Per garantire la continuità operativa del collegamento e la stabilità della banda assegnata, La invitiamo a regolarizzare la posizione entro tale data.

Per qualsiasi chiarimento relativo alla fatturazione o all'apparato installato presso la Sua sede, il nostro Ufficio Tecnico rimane a disposizione.

Cordiali saluti,
Il Team Tecnico WISP`,
  },
  {
    name: 'Secondo Sollecito di Pagamento (Urgente)',
    subject: 'Secondo sollecito: pagamento scaduto il {{scadenza}} - Azione richiesta',
    body: `Gentile {{nome_cliente}},

a seguito del nostro precedente promemoria, risulta che il pagamento di € {{importo}} relativo a {{tipo_pagamento}}, con scadenza il {{scadenza}}, non è ancora pervenuto ai nostri sistemi di fatturazione.

La invitiamo a provvedere alla regolarizzazione entro 5 (cinque) giorni lavorativi, al fine di evitare l'applicazione delle procedure contrattuali previste per la morosità, incluso l'eventuale rallentamento del profilo di banda (traffic shaping) o la sospensione del servizio.

Qualora il pagamento sia già stato effettuato, Le chiediamo di ignorare la presente comunicazione e di inviarci la relativa contabile.

Cordiali saluti,
Il Team Tecnico WISP`,
  },
  {
    name: 'Preavviso di Sospensione Servizio',
    subject: 'Preavviso di sospensione del servizio di connettività',
    body: `Gentile {{nome_cliente}},

Le comunichiamo che, a fronte del mancato pagamento del canone {{tipo_pagamento}} di € {{importo}}, scaduto il {{scadenza}}, il Suo collegamento è stato inserito in stato di preavviso tecnico.

In assenza di regolarizzazione entro le prossime 48 (quarantotto) ore, il Network Operations Center (NOC) procederà, come da condizioni contrattuali, alla sospensione temporanea dell'erogazione del servizio sull'apparato CPE installato presso la Sua sede, fino al ripristino della posizione amministrativa.

Per evitare l'interruzione, La invitiamo a contattare tempestivamente il nostro ufficio amministrativo.

Cordiali saluti,
Il Team Tecnico WISP`,
  },
  {
    name: 'Conferma Attivazione Collegamento',
    subject: 'Il Suo collegamento WISP è attivo - Benvenuto/a {{nome_cliente}}',
    body: `Gentile {{nome_cliente}},

confermiamo con la presente l'avvenuta attivazione del Suo collegamento in tecnologia wireless punto-multipunto. L'apparato CPE è stato installato, configurato e collaudato dal nostro tecnico, con verifica del livello di segnale e della saturazione del canale radio.

Il canone concordato è pari a € {{importo}} ({{tipo_pagamento}}), con prima scadenza il {{scadenza}}.

In caso di anomalie di connessione, cali di banda o necessità di assistenza tecnica sull'apparato, il nostro supporto è raggiungibile ai recapiti indicati nel contratto.

Le auguriamo un buon utilizzo del servizio.

Cordiali saluti,
Il Team Tecnico WISP`,
  },
  {
    name: 'Avviso Manutenzione Programmata Rete',
    subject: 'Avviso di manutenzione programmata sulla rete - Possibili disservizi',
    body: `Gentile {{nome_cliente}},

La informiamo che è stata pianificata un'attività di manutenzione straordinaria sull'infrastruttura di rete (apparati di backhaul e/o stazioni radio base) che serve la Sua zona.

Durante la finestra di manutenzione potrebbero verificarsi brevi microinterruzioni del servizio o fluttuazioni temporanee della banda disponibile, necessarie per il completamento in sicurezza degli interventi tecnici.

Il nostro Network Operations Center monitorerà l'attività end-to-end per ripristinare la piena operatività nel minor tempo possibile.

Ci scusiamo per il disagio e La ringraziamo per la comprensione.

Cordiali saluti,
Il Team Tecnico WISP`,
  },
];

/**
 * Crea un set di template email professionali (gergo tecnico WISP: CPE, NOC,
 * banda, traffic shaping...) alla primissima esecuzione dell'app, così che
 * l'operatore trovi già del materiale pronto all'uso nel modulo Email invece
 * di una schermata vuota. Idempotente: il flag in config garantisce che non
 * vengano ricreati se l'utente li cancella o modifica in seguito.
 */
function seedDefaultEmailTemplatesIfNeeded() {
  const config = readConfig();
  if (config.emailTemplatesSeeded) return;

  const existing = get('SELECT COUNT(*) as n FROM email_templates')?.n || 0;
  if (existing === 0) {
    for (const t of DEFAULT_EMAIL_TEMPLATES) {
      const rowUuid = uuid();
      const ts = now();
      run('INSERT INTO email_templates (uuid, name, subject, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)', [
        rowUuid, t.name, t.subject, t.body, ts, ts,
      ]);
    }
    appendLog(`Creati ${DEFAULT_EMAIL_TEMPLATES.length} template email di default.`);
  }

  updateConfig((c) => {
    c.emailTemplatesSeeded = true;
  });
}

function now() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

// WispCore è un gestionale per un'attività italiana: scadenze, bucket
// mensili delle analytics e flag automatici (insoluti, rinnovi) devono
// ragionare sul calendario di Roma esplicitamente, non su quello - magari
// diverso o mal configurato - della macchina che esegue l'app. Mai usare
// `toISOString()` per estrarre una data di calendario: converte in UTC e
// per un fuso avanti su UTC (Italia, UTC+1/+2) sposta il giorno indietro.
const APP_TIMEZONE = 'Europe/Rome';
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const ROME_MONTH_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit' });

/** Data di calendario "YYYY-MM-DD" nel fuso orario di Roma di un dato istante. */
function localDateString(date = new Date()) {
  return ROME_DATE_FORMATTER.format(date); // 'en-CA' formatta già come YYYY-MM-DD
}

/** "YYYY-MM" del mese `monthOffset` mesi prima/dopo `baseDate`, calcolato nel fuso orario di Roma. */
function localYearMonth(baseDate, monthOffset = 0) {
  const parts = ROME_MONTH_FORMATTER.formatToParts(baseDate);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value) - 1; // 0-indexed
  const totalMonths = year * 12 + month + monthOffset;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

async function getSQL() {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

export async function init() {
  const paths = ensureDirectories();
  const sqlLib = await getSQL();

  if (fs.existsSync(paths.dbPath)) {
    const encrypted = fs.readFileSync(paths.dbPath);
    const plain = decryptBuffer(encrypted);
    db = new sqlLib.Database(plain);
  } else {
    db = new sqlLib.Database();
  }

  db.run(SCHEMA);
  runDefensiveMigrations();
  seedDefaultEmailTemplatesIfNeeded();
  persist();
  appendLog('Database inizializzato correttamente.');
  return db;
}

export function persist() {
  if (!db) return;
  const paths = ensureDirectories();
  const bytes = Buffer.from(db.export());
  const encrypted = encryptBuffer(bytes);
  fs.writeFileSync(paths.dbPath, encrypted);
}

function run(sql, params = []) {
  db.run(sql, params);
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function recordOutbox(entity, rowUuid, op, payload) {
  run('INSERT INTO outbox (entity, uuid, op, payload, created_at, synced) VALUES (?, ?, ?, ?, ?, 0)', [
    entity,
    rowUuid,
    op,
    JSON.stringify(payload),
    now(),
  ]);
  dbEvents.emit('change', { entity, op });
}

export function recordAudit(actor, action, entity, entityId, details) {
  run('INSERT INTO audit_log (ts, actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)', [
    now(),
    actor || 'system',
    action,
    entity,
    entityId ?? null,
    details ? JSON.stringify(details) : null,
  ]);
}

export function listAuditLog(limit = 200) {
  return all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]);
}

// ---------------------------------------------------------------------------
// Admin / auth
// ---------------------------------------------------------------------------

export function isFirstRun() {
  return !get('SELECT id FROM admins LIMIT 1');
}

export function createSuperAdmin(username, pinHash) {
  run('INSERT INTO admins (username, pin_hash, role, created_at) VALUES (?, ?, ?, ?)', [
    username,
    pinHash,
    'SUPER_ADMIN',
    now(),
  ]);
  persist();
}

export function getAdmin() {
  return get('SELECT * FROM admins ORDER BY id ASC LIMIT 1');
}

/** Righe complete (incluso pin_hash) usate solo internamente dal flusso di login: mai esposte via IPC. */
export function listAdminsForAuth() {
  return all('SELECT * FROM admins WHERE deleted=0 ORDER BY id ASC');
}

function mapAdmin(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    linked_collaborator_id: row.linked_collaborator_id || null,
    created_at: row.created_at,
  };
}

/** Elenco utenti staff (senza pin_hash) per il pannello Impostazioni → Utenti & Ruoli. */
export function listAdmins() {
  return all('SELECT * FROM admins WHERE deleted=0 ORDER BY id ASC').map(mapAdmin);
}

export function createStaffAdmin({ username, pinHash, role, linkedCollaboratorId }, actor) {
  run(
    'INSERT INTO admins (username, pin_hash, role, linked_collaborator_id, created_at, deleted) VALUES (?, ?, ?, ?, ?, 0)',
    [username, pinHash, role || 'TECNICO', linkedCollaboratorId || null, now()]
  );
  const created = get('SELECT * FROM admins WHERE username=? ORDER BY id DESC LIMIT 1', [username]);
  recordAudit(actor, 'CREATE', 'admin', created.id, { username, role });
  persist();
  return mapAdmin(created);
}

export function updateAdmin(id, { username, role, linkedCollaboratorId, pinHash }, actor) {
  const existing = get('SELECT * FROM admins WHERE id=?', [id]);
  if (!existing) throw new Error('Utente non trovato.');
  if (existing.role === 'SUPER_ADMIN' && role && role !== 'SUPER_ADMIN') {
    const otherSuperAdmins = get(
      "SELECT COUNT(*) as n FROM admins WHERE role='SUPER_ADMIN' AND deleted=0 AND id != ?",
      [id]
    );
    if ((otherSuperAdmins?.n || 0) === 0) {
      throw new Error('Deve rimanere almeno un Super Admin: cambia prima ruolo a un altro utente.');
    }
  }

  if (pinHash) {
    run('UPDATE admins SET username=?, role=?, linked_collaborator_id=?, pin_hash=? WHERE id=?', [
      username ?? existing.username, role ?? existing.role, linkedCollaboratorId ?? existing.linked_collaborator_id, pinHash, id,
    ]);
  } else {
    run('UPDATE admins SET username=?, role=?, linked_collaborator_id=? WHERE id=?', [
      username ?? existing.username, role ?? existing.role, linkedCollaboratorId ?? existing.linked_collaborator_id, id,
    ]);
  }
  const updated = get('SELECT * FROM admins WHERE id=?', [id]);
  recordAudit(actor, 'UPDATE', 'admin', id, { username: updated.username, role: updated.role });
  persist();
  return mapAdmin(updated);
}

export function deleteAdmin(id, actor) {
  const existing = get('SELECT * FROM admins WHERE id=?', [id]);
  if (!existing) return false;
  if (existing.role === 'SUPER_ADMIN') {
    const otherSuperAdmins = get(
      "SELECT COUNT(*) as n FROM admins WHERE role='SUPER_ADMIN' AND deleted=0 AND id != ?",
      [id]
    );
    if ((otherSuperAdmins?.n || 0) === 0) {
      throw new Error('Non puoi eliminare l\'ultimo Super Admin rimasto.');
    }
  }
  run('UPDATE admins SET deleted=1 WHERE id=?', [id]);
  recordAudit(actor, 'DELETE', 'admin', id, { username: existing.username });
  persist();
  return true;
}

// ---------------------------------------------------------------------------
// Collaborators
// ---------------------------------------------------------------------------

function mapCollaborator(row) {
  if (!row) return row;
  return {
    ...row,
    default_commission_fee: Number(row.default_commission_fee) || 0,
    default_installation_commission: Number(row.default_installation_commission) || 0,
    deleted: !!row.deleted,
  };
}

export function listCollaborators() {
  return all('SELECT * FROM collaborators WHERE deleted = 0 ORDER BY id ASC').map(mapCollaborator);
}

export function saveCollaborator(data, actor) {
  if (data.id) {
    run(
      `UPDATE collaborators SET first_name=?, last_name=?, phone=?, email=?, default_commission_fee=?, default_installation_commission=?, updated_at=? WHERE id=?`,
      [
        data.first_name,
        data.last_name,
        data.phone || '',
        data.email || '',
        Number(data.default_commission_fee) || 0,
        Number(data.default_installation_commission) || 0,
        now(),
        data.id,
      ]
    );
    const updated = get('SELECT * FROM collaborators WHERE id=?', [data.id]);
    recordOutbox('collaborators', updated.uuid, 'upsert', updated);
    recordAudit(actor, 'UPDATE', 'collaborator', data.id, { first_name: data.first_name, last_name: data.last_name });
    persist();
    return mapCollaborator(updated);
  }

  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO collaborators (uuid, first_name, last_name, phone, email, default_commission_fee, default_installation_commission, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      rowUuid,
      data.first_name,
      data.last_name,
      data.phone || '',
      data.email || '',
      Number(data.default_commission_fee) || 0,
      Number(data.default_installation_commission) || 0,
      ts,
      ts,
    ]
  );
  const created = get('SELECT * FROM collaborators WHERE uuid=?', [rowUuid]);
  recordOutbox('collaborators', rowUuid, 'upsert', created);
  recordAudit(actor, 'CREATE', 'collaborator', created.id, { first_name: data.first_name, last_name: data.last_name });
  persist();
  return mapCollaborator(created);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function mapClient(row, collaboratorsById, plansById, nodesById) {
  if (!row) return row;
  const coll = collaboratorsById?.get(row.collaborator_id);
  const plan = plansById?.get(row.plan_id);
  const node = nodesById?.get(row.network_node_id);
  return {
    id: row.id,
    uuid: row.uuid,
    collaborator_id: row.collaborator_id,
    plan_id: row.plan_id,
    network_node_id: row.network_node_id,
    first_name: row.first_name,
    last_name: row.last_name,
    tax_code: row.tax_code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    status: row.status || 'ACTIVE',
    cancelled_at: row.cancelled_at || '',
    cancellation_reason: row.cancellation_reason || '',
    contract_start_date: row.contract_start_date || '',
    contract_end_date: row.contract_end_date || '',
    contract_notes: row.contract_notes || '',
    contract_document_path: row.contract_document_path || '',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    billing_cycle: row.billing_cycle,
    monthly_fee: row.monthly_fee,
    installation_fee: row.installation_fee,
    collaborator_commission_fee: row.collaborator_commission_fee || 0,
    collaborator_installation_commission: row.collaborator_installation_commission || 0,
    last_payment_date: row.last_payment_date || '',
    next_due_date: row.next_due_date || '',
    pppoe_username: row.pppoe_username,
    pppoe_password: decryptField(row.pppoe_password_enc, getFieldKey()),
    mac_address: row.mac_address,
    assigned_ip: row.assigned_ip,
    device_model: row.device_model,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    collaborator_name: coll ? `${coll.first_name} ${coll.last_name}` : 'Nessuno',
    plan_name: plan ? plan.name : null,
    network_node_name: node ? node.name : null,
  };
}

function collaboratorsMap() {
  return new Map(all('SELECT id, first_name, last_name FROM collaborators').map((c) => [c.id, c]));
}
function plansMap() {
  return new Map(all('SELECT id, name FROM plans').map((p) => [p.id, p]));
}
function networkNodesMap() {
  return new Map(all('SELECT id, name FROM network_nodes').map((n) => [n.id, n]));
}

export function listClients() {
  return all('SELECT * FROM clients WHERE deleted = 0 ORDER BY id DESC').map((row) => mapClient(row, collaboratorsMap(), plansMap(), networkNodesMap()));
}

/**
 * Lightweight server-side search used by pickers/dropdowns (e.g. "select a
 * client" when registering a payment) so the renderer never has to hold or
 * render thousands of options at once. Matches name, IP, MAC or PPPoE
 * username directly in SQL instead of filtering an in-memory array.
 */
export function searchClientsLite(query, limit = 25) {
  const q = `%${(query || '').trim()}%`;
  return all(
    `SELECT id, first_name, last_name, assigned_ip, mac_address, pppoe_username FROM clients
     WHERE deleted = 0 AND (first_name LIKE ? OR last_name LIKE ? OR assigned_ip LIKE ? OR mac_address LIKE ? OR pppoe_username LIKE ?)
     ORDER BY first_name ASC LIMIT ?`,
    [q, q, q, q, q, limit]
  );
}

export function getClientDetail(id) {
  const row = get('SELECT * FROM clients WHERE id=?', [id]);
  if (!row) return null;
  const client = mapClient(row, collaboratorsMap(), plansMap(), networkNodesMap());
  const payments = all('SELECT * FROM payments WHERE client_id=? AND deleted=0 ORDER BY due_date DESC, id DESC', [id]);
  const commissions = all('SELECT * FROM commissions WHERE client_id=? AND deleted=0 ORDER BY id DESC', [id]).map((c) =>
    mapCommission(c, new Map([[id, row]]), collaboratorsMap())
  );
  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((a, b) => a + b.amount, 0);
  const totalOverdue = payments.filter((p) => p.status === 'OVERDUE').reduce((a, b) => a + b.amount, 0);
  const overdueCount = payments.filter((p) => p.status === 'OVERDUE').length;
  const planHistory = listClientPlanHistory(id);
  const installationSplits = listClientInstallationSplits(id);
  return { client, payments, commissions, planHistory, installationSplits, stats: { totalPaid, totalOverdue, overdueCount, paymentsCount: payments.length } };
}

/** Registra un cambio piano/canone nello storico, se qualcosa è davvero cambiato rispetto alla riga precedente. */
function recordPlanHistoryIfChanged(before, after, actor) {
  const planChanged = (before.plan_id || null) !== (after.plan_id || null);
  const feeChanged = Number(before.monthly_fee || 0) !== Number(after.monthly_fee || 0);
  if (!planChanged && !feeChanged) return;

  const plans = plansMap();
  run(
    `INSERT INTO client_plan_history (uuid, client_id, old_plan_id, new_plan_id, old_plan_name, new_plan_name, old_monthly_fee, new_monthly_fee, changed_at, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      after.id,
      before.plan_id || null,
      after.plan_id || null,
      before.plan_id ? plans.get(before.plan_id)?.name || null : null,
      after.plan_id ? plans.get(after.plan_id)?.name || null : null,
      Number(before.monthly_fee || 0),
      Number(after.monthly_fee || 0),
      now(),
      actor || 'system',
    ]
  );
}

export function saveClient(data, actor) {
  const encPass = encryptField(data.pppoe_password || '', getFieldKey());
  const status = data.status || 'ACTIVE';

  if (data.id) {
    const before = get('SELECT * FROM clients WHERE id=?', [data.id]);
    // La cancellazione è "una tantum": una volta valorizzata cancelled_at non
    // la si sovrascrive più finché il cliente resta CANCELLED, cosi lo
    // storico riporta la prima data reale di disdetta.
    const cancelledAt = status === 'CANCELLED' ? (before?.cancelled_at || now()) : null;

    run(
      `UPDATE clients SET collaborator_id=?, plan_id=?, network_node_id=?, first_name=?, last_name=?, tax_code=?, address=?, phone=?, email=?,
       status=?, cancelled_at=?, cancellation_reason=?, contract_start_date=?, contract_end_date=?, contract_notes=?, contract_document_path=?,
       latitude=?, longitude=?,
       billing_cycle=?, monthly_fee=?, installation_fee=?, collaborator_commission_fee=?, collaborator_installation_commission=?, last_payment_date=?, next_due_date=?,
       pppoe_username=?, pppoe_password_enc=?, mac_address=?,
       assigned_ip=?, device_model=?, notes=?, updated_at=? WHERE id=?`,
      [
        data.collaborator_id || null,
        data.plan_id || null,
        data.network_node_id || null,
        data.first_name,
        data.last_name,
        data.tax_code || '',
        data.address || '',
        data.phone || '',
        data.email || '',
        status,
        cancelledAt,
        status === 'CANCELLED' ? (data.cancellation_reason || '') : null,
        data.contract_start_date || '',
        data.contract_end_date || '',
        data.contract_notes || '',
        data.contract_document_path ?? before?.contract_document_path ?? '',
        data.latitude === '' || data.latitude === undefined ? null : Number(data.latitude),
        data.longitude === '' || data.longitude === undefined ? null : Number(data.longitude),
        data.billing_cycle || 'MONTHLY',
        Number(data.monthly_fee) || 0,
        Number(data.installation_fee) || 0,
        Number(data.collaborator_commission_fee) || 0,
        Number(data.collaborator_installation_commission) || 0,
        data.last_payment_date || '',
        data.next_due_date || '',
        data.pppoe_username || '',
        encPass,
        data.mac_address || '',
        data.assigned_ip || '',
        data.device_model || '',
        data.notes || '',
        now(),
        data.id,
      ]
    );
    const updated = get('SELECT * FROM clients WHERE id=?', [data.id]);
    if (before) recordPlanHistoryIfChanged(before, updated, actor);
    // Solo se il payload la include esplicitamente: un salvataggio parziale
    // (es. import CSV) non deve azzerare una ripartizione già configurata.
    if (data.installation_splits !== undefined) {
      replaceClientInstallationSplits(data.id, data.installation_splits);
    }
    recordOutbox('clients', updated.uuid, 'upsert', { ...updated, pppoe_password_enc: undefined });
    recordAudit(actor, 'UPDATE', 'client', data.id, { first_name: data.first_name, last_name: data.last_name });
    persist();
    return mapClient(updated, collaboratorsMap(), plansMap(), networkNodesMap());
  }

  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO clients (uuid, collaborator_id, plan_id, network_node_id, first_name, last_name, tax_code, address, phone, email,
     status, contract_start_date, contract_end_date, contract_notes, latitude, longitude,
     billing_cycle, monthly_fee, installation_fee, collaborator_commission_fee, collaborator_installation_commission, last_payment_date, next_due_date,
     pppoe_username, pppoe_password_enc, mac_address, assigned_ip,
     device_model, notes, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      rowUuid,
      data.collaborator_id || null,
      data.plan_id || null,
      data.network_node_id || null,
      data.first_name,
      data.last_name,
      data.tax_code || '',
      data.address || '',
      data.phone || '',
      data.email || '',
      status,
      data.contract_start_date || '',
      data.contract_end_date || '',
      data.contract_notes || '',
      data.latitude === '' || data.latitude === undefined ? null : Number(data.latitude),
      data.longitude === '' || data.longitude === undefined ? null : Number(data.longitude),
      data.billing_cycle || 'MONTHLY',
      Number(data.monthly_fee) || 0,
      Number(data.installation_fee) || 0,
      Number(data.collaborator_commission_fee) || 0,
      Number(data.collaborator_installation_commission) || 0,
      data.last_payment_date || '',
      data.next_due_date || '',
      data.pppoe_username || '',
      encPass,
      data.mac_address || '',
      data.assigned_ip || '',
      data.device_model || '',
      data.notes || '',
      ts,
      ts,
    ]
  );
  const created = get('SELECT * FROM clients WHERE uuid=?', [rowUuid]);
  recordOutbox('clients', rowUuid, 'upsert', { ...created, pppoe_password_enc: undefined });
  recordAudit(actor, 'CREATE', 'client', created.id, { first_name: data.first_name, last_name: data.last_name });

  // Ripartizione dell'una tantum di installazione tra i collaboratori scelti
  // (se presente): salvata subito, così è pronta per generare le rispettive
  // provvigioni non appena quel pagamento risulterà saldato.
  replaceClientInstallationSplits(created.id, data.installation_splits || []);

  const todayStr = localDateString();

  // Primo canone ricorrente: nasce "In Attesa" se il piano prevede un
  // importo. Il flag "il cliente ha già pagato" in fase di attivazione lo
  // salda subito riusando updatePaymentStatus (stessa logica di rinnovo
  // automatico e generazione provvigioni degli altri incassi), invece di
  // duplicarla qui.
  if (created.monthly_fee > 0) {
    const firstPayment = addPayment(
      { client_id: created.id, amount: created.monthly_fee, payment_type: 'RECURRING', payment_date: '', due_date: created.next_due_date || todayStr, status: 'PENDING' },
      actor
    );
    if (data.already_paid_this_period) {
      updatePaymentStatus(firstPayment.id, 'PAID', actor);
    }
  }

  // Una tantum di installazione: stesso schema del canone.
  if (created.installation_fee > 0) {
    const installPayment = addPayment(
      { client_id: created.id, amount: created.installation_fee, payment_type: 'INSTALLATION', payment_date: '', due_date: todayStr, status: 'PENDING' },
      actor
    );
    if (data.already_paid_installation) {
      updatePaymentStatus(installPayment.id, 'PAID', actor);
    }
  }

  persist();
  return mapClient(get('SELECT * FROM clients WHERE id=?', [created.id]), collaboratorsMap(), plansMap(), networkNodesMap());
}

export function deleteClient(id, actor) {
  const row = get('SELECT uuid FROM clients WHERE id=?', [id]);
  run('UPDATE clients SET deleted=1, updated_at=? WHERE id=?', [now(), id]);
  if (row) recordOutbox('clients', row.uuid, 'delete', { uuid: row.uuid });
  recordAudit(actor, 'DELETE', 'client', id, null);
  persist();
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function mapPayment(row, clientsById) {
  const cl = clientsById?.get(row.client_id);
  return { ...row, client_name: cl ? `${cl.first_name} ${cl.last_name}` : 'Cliente sconosciuto' };
}

export function listPayments() {
  const clients = new Map(all('SELECT id, first_name, last_name FROM clients').map((c) => [c.id, c]));
  return all('SELECT * FROM payments WHERE deleted = 0 ORDER BY due_date DESC, id DESC').map((r) => mapPayment(r, clients));
}

export function addPayment(data, actor) {
  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO payments (uuid, client_id, amount, payment_type, payment_date, due_date, status, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [rowUuid, data.client_id, data.amount, data.payment_type, data.payment_date || '', data.due_date || '', data.status || 'PENDING', ts, ts]
  );
  const created = get('SELECT * FROM payments WHERE uuid=?', [rowUuid]);
  recordOutbox('payments', rowUuid, 'upsert', created);
  recordAudit(actor, 'CREATE', 'payment', created.id, { amount: data.amount, payment_type: data.payment_type });

  // Le provvigioni (ricorrente o installazione, in base al tipo di pagamento)
  // scattano SOLO se il pagamento nasce già Saldato - mai su un semplice
  // "In Attesa": altrimenti si genererebbe un debito verso il collaboratore
  // prima ancora che il cliente abbia davvero pagato.
  generateRecurringCommissionIfNeeded(created, actor);
  generateInstallationCommissionsIfNeeded(created, actor);

  persist();
  const clients = new Map(all('SELECT id, first_name, last_name FROM clients').map((c) => [c.id, c]));
  return mapPayment(created, clients);
}

/**
 * Transizione automatica PENDING -> OVERDUE per i pagamenti la cui scadenza
 * è passata. Va chiamata all'avvio e periodicamente (main.js): senza questo
 * job un pagamento scaduto resterebbe "in attesa" finché qualcuno non lo
 * segna manualmente, falsando Dashboard e Scadenzario.
 */
export function autoFlagOverduePayments(actor = 'system') {
  const today = localDateString();
  const toFlag = all(
    "SELECT id FROM payments WHERE status='PENDING' AND due_date IS NOT NULL AND due_date != '' AND due_date < ? AND deleted=0",
    [today]
  );
  for (const row of toFlag) {
    run('UPDATE payments SET status=?, updated_at=? WHERE id=?', ['OVERDUE', now(), row.id]);
    const updated = get('SELECT * FROM payments WHERE id=?', [row.id]);
    if (updated) recordOutbox('payments', updated.uuid, 'upsert', updated);
  }
  if (toFlag.length > 0) {
    recordAudit(actor, 'AUTO_OVERDUE', 'payment', null, { count: toFlag.length });
    persist();
  }
  return toFlag.length;
}

export function updatePaymentStatus(id, status, actor, customPaymentDate) {
  const payment = get('SELECT * FROM payments WHERE id=?', [id]);
  const paymentDate = status === 'PAID' ? (customPaymentDate || getTodayRomeString()) : undefined;
  if (paymentDate) {
    run('UPDATE payments SET status=?, payment_date=?, updated_at=? WHERE id=?', [status, paymentDate, now(), id]);
  } else {
    run('UPDATE payments SET status=?, updated_at=? WHERE id=?', [status, now(), id]);
  }
  const updated = get('SELECT * FROM payments WHERE id=?', [id]);
  if (updated) recordOutbox('payments', updated.uuid, 'upsert', updated);
  recordAudit(actor, 'UPDATE', 'payment', id, { status, payment_date: paymentDate });

  // Provvigioni: se questo pagamento (creato magari come "In Attesa") passa
  // ora a Saldato, genera la provvigione collegata - ricorrente o di
  // installazione a seconda del tipo - solo adesso, mai prima.
  if (updated && status === 'PAID') {
    generateRecurringCommissionIfNeeded(updated, actor);
    generateInstallationCommissionsIfNeeded(updated, actor);
  }

  // Rinnovo automatico: quando un canone RICORRENTE viene segnato come
  // saldato, la prossima scadenza si calcola dalla VECCHIA SCADENZA in base
  // al ciclo di fatturazione del cliente (mensile, ogni 2/3/6 mesi, annuale...)
  // evitando di regalare giorni di servizio per pagamenti tardivi.
  let nextDueDate = null;
  if (status === 'PAID' && payment && payment.payment_type === 'RECURRING') {
    const client = get('SELECT id, uuid, billing_cycle, monthly_fee FROM clients WHERE id=?', [payment.client_id]);
    if (client) {
      nextDueDate = calculateNextDueDate(payment.due_date || paymentDate, client.billing_cycle);

      run('UPDATE clients SET last_payment_date=?, next_due_date=?, updated_at=? WHERE id=?', [paymentDate, nextDueDate, now(), client.id]);
      const updatedClient = get('SELECT * FROM clients WHERE id=?', [client.id]);
      recordOutbox('clients', client.uuid, 'upsert', { ...updatedClient, pppoe_password_enc: undefined });

      // Evita doppioni se esiste già un pendente per quella stessa scadenza.
      const alreadyExists = get(
        "SELECT id FROM payments WHERE client_id=? AND payment_type='RECURRING' AND due_date=? AND status='PENDING' AND deleted=0",
        [client.id, nextDueDate]
      );
      if (!alreadyExists) {
        addPayment(
          { client_id: client.id, amount: client.monthly_fee, payment_type: 'RECURRING', payment_date: '', due_date: nextDueDate, status: 'PENDING' },
          actor
        );
      }
    }
  }

  persist();
  return { nextDueDate };
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

function mapCommission(row, clientsById, collaboratorsById) {
  const cl = clientsById?.get(row.client_id);
  const col = collaboratorsById?.get(row.collaborator_id);
  return {
    ...row,
    client_name: cl ? `${cl.first_name} ${cl.last_name}` : 'Cliente sconosciuto',
    collaborator_name: col ? `${col.first_name} ${col.last_name}` : 'Collaboratore sconosciuto',
  };
}

export function listCommissions() {
  const clients = new Map(all('SELECT id, first_name, last_name FROM clients').map((c) => [c.id, c]));
  const collaborators = new Map(all('SELECT id, first_name, last_name FROM collaborators').map((c) => [c.id, c]));
  return all('SELECT * FROM commissions WHERE deleted = 0 ORDER BY id DESC').map((r) => mapCommission(r, clients, collaborators));
}

export function addCommission(data, actor) {
  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO commissions (uuid, collaborator_id, client_id, payment_id, amount, payout_status, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [rowUuid, data.collaborator_id, data.client_id, data.payment_id || null, data.amount, data.payout_status || 'PENDING', ts, ts]
  );
  const created = get('SELECT * FROM commissions WHERE uuid=?', [rowUuid]);
  recordOutbox('commissions', rowUuid, 'upsert', created);
  recordAudit(actor, 'CREATE', 'commission', created.id, { amount: data.amount });
  persist();
  const clients = new Map(all('SELECT id, first_name, last_name FROM clients').map((c) => [c.id, c]));
  const collaborators = new Map(all('SELECT id, first_name, last_name FROM collaborators').map((c) => [c.id, c]));
  return mapCommission(created, clients, collaborators);
}

/** true se esiste già una provvigione (non cancellata) generata per quello specifico pagamento — evita doppioni se lo stato viene alternato PAID/PENDING più volte. */
function hasCommissionForPayment(paymentId) {
  return !!get('SELECT id FROM commissions WHERE payment_id=? AND deleted=0', [paymentId]);
}

export function updateCommissionStatus(id, status, actor) {
  run('UPDATE commissions SET payout_status=?, updated_at=? WHERE id=?', [status, now(), id]);
  const updated = get('SELECT * FROM commissions WHERE id=?', [id]);
  if (updated) recordOutbox('commissions', updated.uuid, 'upsert', updated);
  recordAudit(actor, 'UPDATE', 'commission', id, { status });
  persist();
}

/** Elimina (soft) una provvigione generata per errore. */
export function deleteCommission(id, actor) {
  const row = get('SELECT uuid FROM commissions WHERE id=?', [id]);
  run('UPDATE commissions SET deleted=1, updated_at=? WHERE id=?', [now(), id]);
  if (row) recordOutbox('commissions', row.uuid, 'delete', { uuid: row.uuid });
  recordAudit(actor, 'DELETE', 'commission', id, null);
  persist();
}

// ---------------------------------------------------------------------------
// Ripartizione provvigione installazione (client_installation_splits)
// ---------------------------------------------------------------------------

/** Ripartizione configurata (chi prende quanto dell'una tantum di installazione), indipendentemente dal fatto che sia già stata pagata. */
export function listClientInstallationSplits(clientId) {
  const collaborators = new Map(all('SELECT id, first_name, last_name FROM collaborators').map((c) => [c.id, c]));
  return all('SELECT * FROM client_installation_splits WHERE client_id=? AND deleted=0 ORDER BY id ASC', [clientId]).map((row) => ({
    ...row,
    collaborator_name: collaborators.get(row.collaborator_id)
      ? `${collaborators.get(row.collaborator_id).first_name} ${collaborators.get(row.collaborator_id).last_name}`
      : 'Collaboratore sconosciuto',
  }));
}

/** Sostituisce interamente la ripartizione di un cliente (cancella le righe precedenti e reinserisce quelle correnti). */
function replaceClientInstallationSplits(clientId, splits) {
  run('UPDATE client_installation_splits SET deleted=1, updated_at=? WHERE client_id=? AND deleted=0', [now(), clientId]);
  for (const split of splits || []) {
    if (!split.collaborator_id || !(Number(split.amount) > 0)) continue;
    const ts = now();
    run(
      `INSERT INTO client_installation_splits (uuid, client_id, collaborator_id, amount, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [uuid(), clientId, split.collaborator_id, Number(split.amount), ts, ts]
    );
  }
}

/**
 * Genera le provvigioni di installazione dalla ripartizione configurata,
 * quando il relativo pagamento INSTALLATION risulta saldato. Idempotente:
 * se per questo pagamento sono già state generate, non duplica.
 */
function generateInstallationCommissionsIfNeeded(payment, actor) {
  if (payment.payment_type !== 'INSTALLATION' || payment.status !== 'PAID') return;
  if (hasCommissionForPayment(payment.id)) return;
  const splits = all('SELECT * FROM client_installation_splits WHERE client_id=? AND deleted=0', [payment.client_id]);
  for (const split of splits) {
    addCommission(
      { collaborator_id: split.collaborator_id, client_id: payment.client_id, payment_id: payment.id, amount: split.amount, payout_status: 'PENDING' },
      actor
    );
  }
}

/**
 * Genera la provvigione ricorrente dal compenso per-cliente configurato,
 * quando il relativo pagamento RECURRING risulta saldato. Idempotente:
 * se per questo pagamento è già stata generata, non duplica.
 */
function generateRecurringCommissionIfNeeded(payment, actor) {
  if (payment.payment_type !== 'RECURRING' || payment.status !== 'PAID') return;
  if (hasCommissionForPayment(payment.id)) return;
  const client = get('SELECT collaborator_id, collaborator_commission_fee FROM clients WHERE id=?', [payment.client_id]);
  if (client?.collaborator_id && Number(client.collaborator_commission_fee) > 0) {
    addCommission(
      { collaborator_id: client.collaborator_id, client_id: payment.client_id, payment_id: payment.id, amount: Number(client.collaborator_commission_fee), payout_status: 'PENDING' },
      actor
    );
  }
}

// ---------------------------------------------------------------------------
// Plans (catalogo offerte internet)
// ---------------------------------------------------------------------------

function mapPlan(row) {
  if (!row) return row;
  return { ...row, active: !!row.active };
}

export function listPlans() {
  return all('SELECT * FROM plans WHERE deleted = 0 ORDER BY monthly_fee ASC').map(mapPlan);
}

export function savePlan(data, actor) {
  if (data.id) {
    run(
      `UPDATE plans SET name=?, monthly_fee=?, installation_fee=?, download_mbps=?, upload_mbps=?, description=?, active=?, updated_at=? WHERE id=?`,
      [data.name, Number(data.monthly_fee) || 0, Number(data.installation_fee) || 0, data.download_mbps || null, data.upload_mbps || null, data.description || '', data.active === false ? 0 : 1, now(), data.id]
    );
    const updated = get('SELECT * FROM plans WHERE id=?', [data.id]);
    recordAudit(actor, 'UPDATE', 'plan', data.id, { name: data.name });
    persist();
    return mapPlan(updated);
  }

  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO plans (uuid, name, monthly_fee, installation_fee, download_mbps, upload_mbps, description, active, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [rowUuid, data.name, Number(data.monthly_fee) || 0, Number(data.installation_fee) || 0, data.download_mbps || null, data.upload_mbps || null, data.description || '', data.active === false ? 0 : 1, ts, ts]
  );
  const created = get('SELECT * FROM plans WHERE uuid=?', [rowUuid]);
  recordAudit(actor, 'CREATE', 'plan', created.id, { name: data.name });
  persist();
  return mapPlan(created);
}

export function deletePlan(id, actor) {
  run('UPDATE plans SET deleted=1, updated_at=? WHERE id=?', [now(), id]);
  recordAudit(actor, 'DELETE', 'plan', id, null);
  persist();
}

// ---------------------------------------------------------------------------
// Network nodes (ripetitori / stazioni base / BTS) e storico piano cliente
// ---------------------------------------------------------------------------

function mapNetworkNode(row) {
  if (!row) return row;
  return { ...row, active: !!row.active };
}

export function listNetworkNodes() {
  const nodes = all('SELECT * FROM network_nodes WHERE deleted = 0 ORDER BY name ASC').map(mapNetworkNode);
  const counts = all(
    "SELECT network_node_id, COUNT(*) as n FROM clients WHERE deleted=0 AND status != 'CANCELLED' AND network_node_id IS NOT NULL GROUP BY network_node_id"
  );
  const countByNode = new Map(counts.map((c) => [c.network_node_id, c.n]));
  return nodes.map((n) => ({
    ...n,
    active_clients: countByNode.get(n.id) || 0,
    saturation_pct: n.max_clients ? Math.round(((countByNode.get(n.id) || 0) / n.max_clients) * 100) : null,
  }));
}

export function saveNetworkNode(data, actor) {
  if (data.id) {
    run(
      `UPDATE network_nodes SET name=?, latitude=?, longitude=?, max_clients=?, notes=?, active=?, updated_at=? WHERE id=?`,
      [
        data.name,
        data.latitude === '' || data.latitude === undefined ? null : Number(data.latitude),
        data.longitude === '' || data.longitude === undefined ? null : Number(data.longitude),
        data.max_clients || null,
        data.notes || '',
        data.active === false ? 0 : 1,
        now(),
        data.id,
      ]
    );
    const updated = get('SELECT * FROM network_nodes WHERE id=?', [data.id]);
    recordAudit(actor, 'UPDATE', 'network_node', data.id, { name: data.name });
    persist();
    return mapNetworkNode(updated);
  }

  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO network_nodes (uuid, name, latitude, longitude, max_clients, notes, active, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      rowUuid,
      data.name,
      data.latitude === '' || data.latitude === undefined ? null : Number(data.latitude),
      data.longitude === '' || data.longitude === undefined ? null : Number(data.longitude),
      data.max_clients || null,
      data.notes || '',
      data.active === false ? 0 : 1,
      ts,
      ts,
    ]
  );
  const created = get('SELECT * FROM network_nodes WHERE uuid=?', [rowUuid]);
  recordAudit(actor, 'CREATE', 'network_node', created.id, { name: data.name });
  persist();
  return mapNetworkNode(created);
}

export function deleteNetworkNode(id, actor) {
  run('UPDATE network_nodes SET deleted=1, updated_at=? WHERE id=?', [now(), id]);
  recordAudit(actor, 'DELETE', 'network_node', id, null);
  persist();
}

/** Storico completo dei cambi piano/canone di un cliente, più recente prima. */
export function listClientPlanHistory(clientId) {
  return all('SELECT * FROM client_plan_history WHERE client_id=? ORDER BY id DESC', [clientId]);
}

/** Apre il selettore file nativo e copia il documento scelto (contratto, allegato) nella cartella dati del cliente. */
export async function pickAndAttachContractDocument(clientId, browserWindow, actor) {
  const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
    title: 'Allega documento di contratto',
    filters: [{ name: 'Documenti', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'doc'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;

  const client = get('SELECT uuid FROM clients WHERE id=?', [clientId]);
  if (!client) throw new Error('Cliente non trovato.');

  const destDir = path.join(getAppPaths().contractsDir, client.uuid);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const srcPath = filePaths[0];
  const destPath = path.join(destDir, path.basename(srcPath));
  fs.copyFileSync(srcPath, destPath);

  run('UPDATE clients SET contract_document_path=?, updated_at=? WHERE id=?', [destPath, now(), clientId]);
  recordAudit(actor, 'UPDATE', 'client', clientId, { contract_document: path.basename(destPath) });
  persist();
  return destPath;
}

/** Apre il documento di contratto allegato con l'applicazione predefinita del sistema. */
export function openContractDocument(clientId) {
  const client = get('SELECT contract_document_path FROM clients WHERE id=?', [clientId]);
  if (!client?.contract_document_path || !fs.existsSync(client.contract_document_path)) {
    throw new Error('Nessun documento allegato, o il file non è più presente sul disco.');
  }
  shell.openPath(client.contract_document_path);
  return true;
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export function listEmailTemplates() {
  return all('SELECT * FROM email_templates WHERE deleted = 0 ORDER BY name ASC');
}

export function saveEmailTemplate(data, actor) {
  if (data.id) {
    run('UPDATE email_templates SET name=?, subject=?, body=?, updated_at=? WHERE id=?', [data.name, data.subject, data.body, now(), data.id]);
    const updated = get('SELECT * FROM email_templates WHERE id=?', [data.id]);
    recordAudit(actor, 'UPDATE', 'email_template', data.id, { name: data.name });
    persist();
    return updated;
  }
  const rowUuid = uuid();
  const ts = now();
  run('INSERT INTO email_templates (uuid, name, subject, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)', [rowUuid, data.name, data.subject, data.body, ts, ts]);
  const created = get('SELECT * FROM email_templates WHERE uuid=?', [rowUuid]);
  recordAudit(actor, 'CREATE', 'email_template', created.id, { name: data.name });
  persist();
  return created;
}

export function deleteEmailTemplate(id, actor) {
  run('UPDATE email_templates SET deleted=1, updated_at=? WHERE id=?', [now(), id]);
  recordAudit(actor, 'DELETE', 'email_template', id, null);
  persist();
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** Real monthly revenue/MRR/new-clients series computed from actual data, for the dashboard chart. */
export function getMonthlyAnalytics(months = 12) {
  const series = [];
  const today = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = localYearMonth(today, -i); // YYYY-MM
    const nextMonth = localYearMonth(today, -i + 1);

    const revenueRow = get(
      "SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='PAID' AND payment_date >= ? AND payment_date < ? AND deleted=0",
      [monthStart, nextMonth]
    );
    const newClientsRow = get(
      'SELECT COUNT(*) as count FROM clients WHERE created_at >= ? AND created_at < ? AND deleted=0',
      [monthStart, nextMonth]
    );
    const overdueRow = get(
      "SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='OVERDUE' AND due_date >= ? AND due_date < ? AND deleted=0",
      [monthStart, nextMonth]
    );
    const commissionsRow = get(
      "SELECT COALESCE(SUM(amount),0) as total FROM commissions WHERE created_at >= ? AND created_at < ? AND deleted=0",
      [monthStart, nextMonth]
    );

    series.push({
      month: monthStart,
      revenue: revenueRow?.total || 0,
      newClients: newClientsRow?.count || 0,
      overdue: overdueRow?.total || 0,
      commissions: commissionsRow?.total || 0,
    });
  }
  return series;
}

/**
 * Metriche di Business Intelligence per la crescita/gestione del WISP:
 * Churn Rate mensile (con motivazioni di disdetta), ARPU, LTV stimato e
 * saturazione per nodo di rete (BTS/ripetitore).
 */
export function getBiMetrics(months = 12) {
  const activeClients = all("SELECT id, monthly_fee, billing_cycle, created_at FROM clients WHERE deleted=0 AND status='ACTIVE'");
  const activeCount = activeClients.length;
  const mrr = activeClients.reduce((a, b) => a + normalizeMonthlyFee(b.monthly_fee, b.billing_cycle), 0);
  const arpu = activeCount ? mrr / activeCount : 0;

  const today = new Date();
  const churnSeries = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = localYearMonth(today, -i);
    const nextMonth = localYearMonth(today, -i + 1);

    // Base clienti "attivi a inizio mese": creati prima dell'inizio del mese
    // e non ancora disdetti a quella data (o mai disdetti).
    const startingBase = get(
      "SELECT COUNT(*) as n FROM clients WHERE deleted=0 AND created_at < ? AND (cancelled_at IS NULL OR cancelled_at = '' OR cancelled_at >= ?)",
      [monthStart, monthStart]
    )?.n || 0;
    const cancelledInMonth = get(
      "SELECT COUNT(*) as n FROM clients WHERE deleted=0 AND cancelled_at >= ? AND cancelled_at < ?",
      [monthStart, nextMonth]
    )?.n || 0;

    churnSeries.push({
      month: monthStart,
      startingBase,
      cancelled: cancelledInMonth,
      churnRatePct: startingBase > 0 ? Number(((cancelledInMonth / startingBase) * 100).toFixed(2)) : 0,
    });
  }

  const avgMonthlyChurnPct = churnSeries.length
    ? churnSeries.reduce((a, b) => a + b.churnRatePct, 0) / churnSeries.length
    : 0;

  // LTV stimato con la formula SaaS semplificata LTV = ARPU / tasso di
  // abbandono mensile. Senza disdette nel periodo (tasso 0) si userebbe una
  // divisione per zero: come fallback si stima con ARPU * durata media (in
  // mesi) dei clienti attivi, un proxy ragionevole della "vita" del cliente.
  let ltv;
  let ltvMethod;
  if (avgMonthlyChurnPct > 0) {
    ltv = arpu / (avgMonthlyChurnPct / 100);
    ltvMethod = 'ARPU / churn rate mensile';
  } else {
    const avgTenureMonths = activeClients.length
      ? activeClients.reduce((sum, c) => {
          const created = new Date(c.created_at);
          const tenureMonths = Math.max(0, (today.getFullYear() - created.getFullYear()) * 12 + (today.getMonth() - created.getMonth()));
          return sum + tenureMonths;
        }, 0) / activeClients.length
      : 0;
    ltv = arpu * Math.max(avgTenureMonths, 1);
    ltvMethod = 'ARPU × anzianità media clienti (nessuna disdetta nel periodo)';
  }

  const cancellationReasons = all(
    `SELECT COALESCE(NULLIF(cancellation_reason, ''), 'Non specificato') as reason, COUNT(*) as count
     FROM clients WHERE deleted=0 AND status='CANCELLED' GROUP BY reason ORDER BY count DESC`
  );

  return {
    activeCount,
    mrr,
    arpu,
    ltv,
    ltvMethod,
    avgMonthlyChurnPct: Number(avgMonthlyChurnPct.toFixed(2)),
    churnSeries,
    cancellationReasons,
    nodeSaturation: listNetworkNodes(),
  };
}

export function getTopClientsByRevenue(limit = 5) {
  return all(
    `SELECT c.id, c.first_name, c.last_name, COALESCE(SUM(p.amount),0) as total_paid
     FROM clients c LEFT JOIN payments p ON p.client_id = c.id AND p.status='PAID' AND p.deleted=0
     WHERE c.deleted=0 GROUP BY c.id ORDER BY total_paid DESC LIMIT ?`,
    [limit]
  );
}

export function getCommissionsByCollaborator() {
  return all(
    `SELECT col.id, col.first_name, col.last_name,
       COALESCE(SUM(CASE WHEN comm.payout_status='PENDING' THEN comm.amount ELSE 0 END),0) as pending_amount,
       COALESCE(SUM(comm.amount),0) as total_amount
     FROM collaborators col LEFT JOIN commissions comm ON comm.collaborator_id = col.id AND comm.deleted=0
     WHERE col.deleted=0 GROUP BY col.id ORDER BY total_amount DESC`
  );
}

export function getRawDb() {
  return db;
}

// ---------------------------------------------------------------------------
// One-time import of data coming from the old localStorage-only prototype
// ---------------------------------------------------------------------------

export function hasAnyBusinessData() {
  return !!get('SELECT id FROM clients LIMIT 1') || !!get('SELECT id FROM collaborators LIMIT 1');
}

export function importLegacyData(payload, actor) {
  const collabIdMap = new Map();
  for (const c of payload.collaborators || []) {
    const created = saveCollaborator({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email }, actor);
    collabIdMap.set(c.id, created.id);
  }

  const clientIdMap = new Map();
  for (const c of payload.clients || []) {
    const rowUuid = uuid();
    const ts = c.created_at ? `${c.created_at}T00:00:00.000Z` : now();
    run(
      `INSERT INTO clients (uuid, collaborator_id, first_name, last_name, tax_code, address, phone, email, billing_cycle,
       monthly_fee, installation_fee, pppoe_username, pppoe_password_enc, mac_address, assigned_ip, device_model, notes,
       created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        rowUuid,
        collabIdMap.get(c.collaborator_id) || null,
        c.first_name, c.last_name, c.tax_code || '', c.address || '', c.phone || '', c.email || '',
        c.billing_cycle || 'MONTHLY', Number(c.monthly_fee) || 0, Number(c.installation_fee) || 0,
        c.pppoe_username || '', encryptField(c.pppoe_password || '', getFieldKey()), c.mac_address || '',
        c.assigned_ip || '', c.device_model || '', c.notes || '', ts, ts,
      ]
    );
    const created = get('SELECT id, uuid FROM clients WHERE uuid=?', [rowUuid]);
    clientIdMap.set(c.id, created.id);
    recordOutbox('clients', rowUuid, 'upsert', { ...get('SELECT * FROM clients WHERE id=?', [created.id]), pppoe_password_enc: undefined });
  }

  for (const p of payload.payments || []) {
    const clientId = clientIdMap.get(p.client_id);
    if (!clientId) continue;
    const rowUuid = uuid();
    const ts = now();
    run(
      `INSERT INTO payments (uuid, client_id, amount, payment_type, payment_date, due_date, status, created_at, updated_at, deleted)
       VALUES (?,?,?,?,?,?,?,?,?,0)`,
      [rowUuid, clientId, p.amount, p.payment_type, p.payment_date || '', p.due_date || '', p.status, ts, ts]
    );
    recordOutbox('payments', rowUuid, 'upsert', get('SELECT * FROM payments WHERE uuid=?', [rowUuid]));
  }

  for (const c of payload.commissions || []) {
    const clientId = clientIdMap.get(c.client_id);
    const collaboratorId = collabIdMap.get(c.collaborator_id);
    if (!clientId || !collaboratorId) continue;
    const rowUuid = uuid();
    const ts = now();
    run(
      `INSERT INTO commissions (uuid, collaborator_id, client_id, amount, payout_status, created_at, updated_at, deleted)
       VALUES (?,?,?,?,?,?,?,0)`,
      [rowUuid, collaboratorId, clientId, c.amount, c.payout_status, ts, ts]
    );
    recordOutbox('commissions', rowUuid, 'upsert', get('SELECT * FROM commissions WHERE uuid=?', [rowUuid]));
  }

  recordAudit(actor, 'IMPORT', 'legacy-localStorage', null, {
    clients: (payload.clients || []).length,
    collaborators: (payload.collaborators || []).length,
    payments: (payload.payments || []).length,
    commissions: (payload.commissions || []).length,
  });
  persist();

  return {
    clients: clientIdMap.size,
    collaborators: collabIdMap.size,
  };
}

/**
 * Re-encrypts every stored PPPoE password. Must run right after the
 * Organization Data Key is generated/imported so that clients created
 * before sync was enabled become readable by every synced station, not
 * just this one. The caller supplies decrypt/encrypt functions bound to the
 * old and new keys respectively (see ipc/handlers.js sync:setOrgKey).
 */
export function reencryptAllClientPasswords(decryptFn, encryptFn) {
  const rows = all("SELECT id, pppoe_password_enc FROM clients WHERE pppoe_password_enc IS NOT NULL AND pppoe_password_enc != ''");
  for (const row of rows) {
    const plain = decryptFn(row.pppoe_password_enc);
    const reencrypted = encryptFn(plain);
    run('UPDATE clients SET pppoe_password_enc=? WHERE id=?', [reencrypted, row.id]);
  }
  persist();
  return rows.length;
}

// ---------------------------------------------------------------------------
// Sync support (outbox + remote-merge helpers used by the MariaDB sync engine)
// ---------------------------------------------------------------------------

export function getUnsyncedOutbox(limit = 500) {
  return all('SELECT * FROM outbox WHERE synced = 0 ORDER BY id ASC LIMIT ?', [limit]);
}

export function markOutboxSynced(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  run(`UPDATE outbox SET synced = 1 WHERE id IN (${placeholders})`, ids);
  persist();
}

export function uuidFor(entity, id) {
  if (!id) return null;
  const row = get(`SELECT uuid FROM ${entity} WHERE id = ?`, [id]);
  return row ? row.uuid : null;
}

function localIdForUuid(entity, remoteUuid) {
  if (!remoteUuid) return null;
  const row = get(`SELECT id FROM ${entity} WHERE uuid = ?`, [remoteUuid]);
  return row ? row.id : null;
}

/** Last-write-wins merge of a row coming from the central MariaDB server. Returns true if applied. */
export function upsertCollaboratorFromRemote(row) {
  const existing = get('SELECT * FROM collaborators WHERE uuid=?', [row.uuid]);
  if (existing && existing.updated_at >= row.updated_at) return false;

  if (existing) {
    run('UPDATE collaborators SET first_name=?, last_name=?, phone=?, email=?, updated_at=?, deleted=? WHERE uuid=?', [
      row.first_name, row.last_name, row.phone || '', row.email || '', row.updated_at, row.deleted ? 1 : 0, row.uuid,
    ]);
  } else {
    run('INSERT INTO collaborators (uuid, first_name, last_name, phone, email, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?,?)', [
      row.uuid, row.first_name, row.last_name, row.phone || '', row.email || '', row.created_at, row.updated_at, row.deleted ? 1 : 0,
    ]);
  }
  return true;
}

export function upsertClientFromRemote(row) {
  const existing = get('SELECT * FROM clients WHERE uuid=?', [row.uuid]);
  if (existing && existing.updated_at >= row.updated_at) return false;

  const collaboratorId = localIdForUuid('collaborators', row.collaborator_uuid);

  if (existing) {
    run(
      `UPDATE clients SET collaborator_id=?, first_name=?, last_name=?, tax_code=?, address=?, phone=?, email=?,
       billing_cycle=?, monthly_fee=?, installation_fee=?, pppoe_username=?, pppoe_password_enc=?, mac_address=?,
       assigned_ip=?, device_model=?, notes=?, updated_at=?, deleted=? WHERE uuid=?`,
      [collaboratorId, row.first_name, row.last_name, row.tax_code || '', row.address || '', row.phone || '', row.email || '',
       row.billing_cycle, row.monthly_fee, row.installation_fee, row.pppoe_username || '', row.pppoe_password_enc || '',
       row.mac_address || '', row.assigned_ip || '', row.device_model || '', row.notes || '', row.updated_at, row.deleted ? 1 : 0, row.uuid]
    );
  } else {
    run(
      `INSERT INTO clients (uuid, collaborator_id, first_name, last_name, tax_code, address, phone, email, billing_cycle,
       monthly_fee, installation_fee, pppoe_username, pppoe_password_enc, mac_address, assigned_ip, device_model, notes,
       created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.uuid, collaboratorId, row.first_name, row.last_name, row.tax_code || '', row.address || '', row.phone || '', row.email || '',
       row.billing_cycle, row.monthly_fee, row.installation_fee, row.pppoe_username || '', row.pppoe_password_enc || '',
       row.mac_address || '', row.assigned_ip || '', row.device_model || '', row.notes || '', row.created_at, row.updated_at, row.deleted ? 1 : 0]
    );
  }
  return true;
}

export function upsertPaymentFromRemote(row) {
  const existing = get('SELECT * FROM payments WHERE uuid=?', [row.uuid]);
  if (existing && existing.updated_at >= row.updated_at) return false;

  const clientId = localIdForUuid('clients', row.client_uuid);
  if (!clientId) return false; // client not seen locally yet; will retry once it arrives

  if (existing) {
    run('UPDATE payments SET client_id=?, amount=?, payment_type=?, payment_date=?, due_date=?, status=?, updated_at=?, deleted=? WHERE uuid=?', [
      clientId, row.amount, row.payment_type, row.payment_date || '', row.due_date || '', row.status, row.updated_at, row.deleted ? 1 : 0, row.uuid,
    ]);
  } else {
    run('INSERT INTO payments (uuid, client_id, amount, payment_type, payment_date, due_date, status, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?,?,?,?)', [
      row.uuid, clientId, row.amount, row.payment_type, row.payment_date || '', row.due_date || '', row.status, row.created_at, row.updated_at, row.deleted ? 1 : 0,
    ]);
  }
  return true;
}

export function upsertCommissionFromRemote(row) {
  const existing = get('SELECT * FROM commissions WHERE uuid=?', [row.uuid]);
  if (existing && existing.updated_at >= row.updated_at) return false;

  const clientId = localIdForUuid('clients', row.client_uuid);
  const collaboratorId = localIdForUuid('collaborators', row.collaborator_uuid);
  if (!clientId || !collaboratorId) return false;

  if (existing) {
    run('UPDATE commissions SET collaborator_id=?, client_id=?, amount=?, payout_status=?, updated_at=?, deleted=? WHERE uuid=?', [
      collaboratorId, clientId, row.amount, row.payout_status, row.updated_at, row.deleted ? 1 : 0, row.uuid,
    ]);
  } else {
    run('INSERT INTO commissions (uuid, collaborator_id, client_id, amount, payout_status, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?,?)', [
      row.uuid, collaboratorId, clientId, row.amount, row.payout_status, row.created_at, row.updated_at, row.deleted ? 1 : 0,
    ]);
  }
  return true;
}

// --- BETA ENTERPRISE METHODS ---

export function listBetaNasRouters() {
  const rows = all('SELECT * FROM beta_nas_routers WHERE deleted = 0 ORDER BY name ASC');
  return rows.map(r => ({
    ...r,
    hasPassword: !!r.password,
    password: undefined, // never send raw password to renderer unless decrypted
    active: r.active === 1
  }));
}

export function saveBetaNasRouter(data, actor) {
  const now = new Date().toISOString();
  if (data.id) {
    let updateFields = [
      'name = ?', 'ip_address = ?', 'api_port = ?', 'username = ?', 
      'radius_secret = ?', 'active = ?', 'updated_at = ?'
    ];
    let params = [
      data.name, data.ip_address, data.api_port, data.username,
      data.radius_secret || null, data.active ? 1 : 0, now
    ];

    if (data.password !== undefined && data.password !== null) {
      updateFields.push('password = ?');
      params.push(data.password ? encryptField('nas', 'password', data.password) : null);
    }
    
    params.push(data.id);
    run(\UPDATE beta_nas_routers SET \ WHERE id = ?\, ...params);
    recordAudit(actor, 'UPDATE', 'beta_nas_router', data.id, null);
    persist();
    return data.id;
  } else {
    const uuidStr = crypto.randomUUID();
    const encPass = data.password ? encryptField('nas', 'password', data.password) : null;
    const stmt = db.prepare(\
      INSERT INTO beta_nas_routers (uuid, name, ip_address, api_port, username, password, radius_secret, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    \);
    stmt.run([uuidStr, data.name, data.ip_address, data.api_port, data.username, encPass, data.radius_secret || null, data.active ? 1 : 0, now, now]);
    const id = getInsertId();
    stmt.free();
    recordAudit(actor, 'CREATE', 'beta_nas_router', id, null);
    persist();
    return id;
  }
}

export function deleteBetaNasRouter(id, actor) {
  run('UPDATE beta_nas_routers SET deleted = 1, updated_at = ? WHERE id = ?', new Date().toISOString(), id);
  recordAudit(actor, 'DELETE', 'beta_nas_router', id, null);
  persist();
}

export function listBetaIpamSubnets() {
  return all('SELECT * FROM beta_ipam_subnets WHERE deleted = 0 ORDER BY cidr ASC');
}

export function saveBetaIpamSubnet(data, actor) {
  const now = new Date().toISOString();
  if (data.id) {
    run(\
      UPDATE beta_ipam_subnets SET name = ?, cidr = ?, gateway = ?, vlan_id = ?, notes = ?, updated_at = ?
      WHERE id = ?
    \, [data.name, data.cidr, data.gateway || null, data.vlan_id || null, data.notes || null, now, data.id]);
    recordAudit(actor, 'UPDATE', 'beta_ipam_subnet', data.id, null);
    persist();
    return data.id;
  } else {
    const uuidStr = crypto.randomUUID();
    const stmt = db.prepare(\
      INSERT INTO beta_ipam_subnets (uuid, name, cidr, gateway, vlan_id, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    \);
    stmt.run([uuidStr, data.name, data.cidr, data.gateway || null, data.vlan_id || null, data.notes || null, now, now]);
    const id = getInsertId();
    stmt.free();
    recordAudit(actor, 'CREATE', 'beta_ipam_subnet', id, null);
    persist();
    return id;
  }
}

export function getBetaRadiusSettings() {
  const row = get('SELECT value FROM schema_meta WHERE key = ?', ['beta_radius_settings']);
  if (!row) return { enabled: false, secret: '', coa_port: 3799, disconnect_on_overdue: false };
  return JSON.parse(row.value);
}

export function saveBetaRadiusSettings(settings, actor) {
  run(
    'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ['beta_radius_settings', JSON.stringify(settings)]
  );
  recordAudit(actor, 'UPDATE', 'beta_radius_settings', null, null);
  persist();
  return settings;
}

