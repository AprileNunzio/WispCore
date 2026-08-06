import fs from 'fs';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import initSqlJs from 'sql.js';
import { ensureDirectories, appendLog } from './paths.js';
import { encryptBuffer, decryptBuffer, encryptField, decryptField, getFieldKey } from './crypto.js';
import { readConfig, updateConfig } from './config.js';

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
  created_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  collaborator_id INTEGER,
  plan_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  tax_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
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
  FOREIGN KEY (plan_id) REFERENCES plans(id)
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
  amount REAL NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
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
  const collabColumns = all('PRAGMA table_info(collaborators)').map((c) => c.name);
  if (!collabColumns.includes('default_commission_fee')) {
    run('ALTER TABLE collaborators ADD COLUMN default_commission_fee REAL NOT NULL DEFAULT 0');
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

// ---------------------------------------------------------------------------
// Collaborators
// ---------------------------------------------------------------------------

function mapCollaborator(row) {
  if (!row) return row;
  return { ...row, deleted: !!row.deleted };
}

export function listCollaborators() {
  return all('SELECT * FROM collaborators WHERE deleted = 0 ORDER BY id ASC').map(mapCollaborator);
}

export function saveCollaborator(data, actor) {
  if (data.id) {
    run(
      `UPDATE collaborators SET first_name=?, last_name=?, phone=?, email=?, default_commission_fee=?, updated_at=? WHERE id=?`,
      [data.first_name, data.last_name, data.phone || '', data.email || '', Number(data.default_commission_fee) || 0, now(), data.id]
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
    `INSERT INTO collaborators (uuid, first_name, last_name, phone, email, default_commission_fee, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [rowUuid, data.first_name, data.last_name, data.phone || '', data.email || '', Number(data.default_commission_fee) || 0, ts, ts]
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

function mapClient(row, collaboratorsById, plansById) {
  if (!row) return row;
  const coll = collaboratorsById?.get(row.collaborator_id);
  const plan = plansById?.get(row.plan_id);
  return {
    id: row.id,
    uuid: row.uuid,
    collaborator_id: row.collaborator_id,
    plan_id: row.plan_id,
    first_name: row.first_name,
    last_name: row.last_name,
    tax_code: row.tax_code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    billing_cycle: row.billing_cycle,
    monthly_fee: row.monthly_fee,
    installation_fee: row.installation_fee,
    collaborator_commission_fee: row.collaborator_commission_fee || 0,
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
  };
}

function collaboratorsMap() {
  return new Map(all('SELECT id, first_name, last_name FROM collaborators').map((c) => [c.id, c]));
}
function plansMap() {
  return new Map(all('SELECT id, name FROM plans').map((p) => [p.id, p]));
}

export function listClients() {
  return all('SELECT * FROM clients WHERE deleted = 0 ORDER BY id DESC').map((row) => mapClient(row, collaboratorsMap(), plansMap()));
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
  const client = mapClient(row, collaboratorsMap(), plansMap());
  const payments = all('SELECT * FROM payments WHERE client_id=? AND deleted=0 ORDER BY due_date DESC, id DESC', [id]);
  const commissions = all('SELECT * FROM commissions WHERE client_id=? AND deleted=0 ORDER BY id DESC', [id]).map((c) =>
    mapCommission(c, new Map([[id, row]]), collaboratorsMap())
  );
  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((a, b) => a + b.amount, 0);
  const totalOverdue = payments.filter((p) => p.status === 'OVERDUE').reduce((a, b) => a + b.amount, 0);
  const overdueCount = payments.filter((p) => p.status === 'OVERDUE').length;
  return { client, payments, commissions, stats: { totalPaid, totalOverdue, overdueCount, paymentsCount: payments.length } };
}

export function saveClient(data, actor) {
  const encPass = encryptField(data.pppoe_password || '', getFieldKey());

  if (data.id) {
    run(
      `UPDATE clients SET collaborator_id=?, plan_id=?, first_name=?, last_name=?, tax_code=?, address=?, phone=?, email=?,
       billing_cycle=?, monthly_fee=?, installation_fee=?, collaborator_commission_fee=?, last_payment_date=?, next_due_date=?,
       pppoe_username=?, pppoe_password_enc=?, mac_address=?,
       assigned_ip=?, device_model=?, notes=?, updated_at=? WHERE id=?`,
      [
        data.collaborator_id || null,
        data.plan_id || null,
        data.first_name,
        data.last_name,
        data.tax_code || '',
        data.address || '',
        data.phone || '',
        data.email || '',
        data.billing_cycle || 'MONTHLY',
        Number(data.monthly_fee) || 0,
        Number(data.installation_fee) || 0,
        Number(data.collaborator_commission_fee) || 0,
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
    recordOutbox('clients', updated.uuid, 'upsert', { ...updated, pppoe_password_enc: undefined });
    recordAudit(actor, 'UPDATE', 'client', data.id, { first_name: data.first_name, last_name: data.last_name });
    persist();
    return mapClient(updated, collaboratorsMap(), plansMap());
  }

  const rowUuid = uuid();
  const ts = now();
  run(
    `INSERT INTO clients (uuid, collaborator_id, plan_id, first_name, last_name, tax_code, address, phone, email,
     billing_cycle, monthly_fee, installation_fee, collaborator_commission_fee, last_payment_date, next_due_date,
     pppoe_username, pppoe_password_enc, mac_address, assigned_ip,
     device_model, notes, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      rowUuid,
      data.collaborator_id || null,
      data.plan_id || null,
      data.first_name,
      data.last_name,
      data.tax_code || '',
      data.address || '',
      data.phone || '',
      data.email || '',
      data.billing_cycle || 'MONTHLY',
      Number(data.monthly_fee) || 0,
      Number(data.installation_fee) || 0,
      Number(data.collaborator_commission_fee) || 0,
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

  if (created.installation_fee > 0) {
    addPayment(
      {
        client_id: created.id,
        amount: created.installation_fee,
        payment_type: 'INSTALLATION',
        payment_date: '',
        due_date: ts.split('T')[0],
        status: 'PENDING',
      },
      actor
    );
  }

  if (created.collaborator_id && created.installation_fee > 0) {
    addCommission(
      {
        collaborator_id: created.collaborator_id,
        client_id: created.id,
        amount: Number((created.installation_fee * 0.2).toFixed(2)),
        payout_status: 'PENDING',
      },
      actor
    );
  }

  persist();
  return mapClient(get('SELECT * FROM clients WHERE id=?', [created.id]), collaboratorsMap(), plansMap());
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

  // Recurring provvigione: se il cliente ha un collaboratore con una commissione
  // ricorrente configurata, ogni canone RECURRING genera automaticamente la
  // provvigione collegata (es. cliente paga 20€/mese, 5€/mese al collaboratore).
  if (data.payment_type === 'RECURRING') {
    const client = get('SELECT collaborator_id, collaborator_commission_fee FROM clients WHERE id=?', [data.client_id]);
    if (client?.collaborator_id && Number(client.collaborator_commission_fee) > 0) {
      addCommission(
        {
          collaborator_id: client.collaborator_id,
          client_id: data.client_id,
          amount: Number(client.collaborator_commission_fee),
          payout_status: 'PENDING',
        },
        actor
      );
    }
  }

  persist();
  const clients = new Map(all('SELECT id, first_name, last_name FROM clients').map((c) => [c.id, c]));
  return mapPayment(created, clients);
}

export function updatePaymentStatus(id, status, actor) {
  const paymentDate = status === 'PAID' ? now().split('T')[0] : undefined;
  if (paymentDate) {
    run('UPDATE payments SET status=?, payment_date=?, updated_at=? WHERE id=?', [status, paymentDate, now(), id]);
  } else {
    run('UPDATE payments SET status=?, updated_at=? WHERE id=?', [status, now(), id]);
  }
  const updated = get('SELECT * FROM payments WHERE id=?', [id]);
  if (updated) recordOutbox('payments', updated.uuid, 'upsert', updated);
  recordAudit(actor, 'UPDATE', 'payment', id, { status });
  persist();
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
    `INSERT INTO commissions (uuid, collaborator_id, client_id, amount, payout_status, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [rowUuid, data.collaborator_id, data.client_id, data.amount, data.payout_status || 'PENDING', ts, ts]
  );
  const created = get('SELECT * FROM commissions WHERE uuid=?', [rowUuid]);
  recordOutbox('commissions', rowUuid, 'upsert', created);
  recordAudit(actor, 'CREATE', 'commission', created.id, { amount: data.amount });
  persist();
  const clients = new Map(all('SELECT id, first_name, last_name FROM clients').map((c) => [c.id, c]));
  const collaborators = new Map(all('SELECT id, first_name, last_name FROM collaborators').map((c) => [c.id, c]));
  return mapCommission(created, clients, collaborators);
}

export function updateCommissionStatus(id, status, actor) {
  run('UPDATE commissions SET payout_status=?, updated_at=? WHERE id=?', [status, now(), id]);
  const updated = get('SELECT * FROM commissions WHERE id=?', [id]);
  if (updated) recordOutbox('commissions', updated.uuid, 'upsert', updated);
  recordAudit(actor, 'UPDATE', 'commission', id, { status });
  persist();
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
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStart = d.toISOString().slice(0, 7); // YYYY-MM
    const nextMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 1).toISOString().slice(0, 7);

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
