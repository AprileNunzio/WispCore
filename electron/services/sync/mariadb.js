import crypto from 'crypto';
import mariadb from 'mariadb';
import { readConfig, updateConfig } from '../config.js';
import * as cryptoService from '../crypto.js';
import { appendLog } from '../paths.js';
import * as database from '../database.js';

const { encryptSecret, decryptSecret, getOrgKey, getDataKey, generateOrgKey, importOrgKey, decryptField, encryptField } = cryptoService;

const REMOTE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS wispcore_collaborators (
    uuid VARCHAR(36) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    phone VARCHAR(64),
    email VARCHAR(255),
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    deleted TINYINT NOT NULL DEFAULT 0,
    INDEX (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS wispcore_clients (
    uuid VARCHAR(36) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    collaborator_uuid VARCHAR(36),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    tax_code VARCHAR(64),
    address VARCHAR(512),
    phone VARCHAR(64),
    email VARCHAR(255),
    billing_cycle VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
    monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    installation_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    pppoe_username VARCHAR(255),
    pppoe_password_enc TEXT,
    mac_address VARCHAR(32),
    assigned_ip VARCHAR(64),
    device_model VARCHAR(255),
    notes TEXT,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    deleted TINYINT NOT NULL DEFAULT 0,
    INDEX (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS wispcore_payments (
    uuid VARCHAR(36) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    client_uuid VARCHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_type VARCHAR(32) NOT NULL,
    payment_date VARCHAR(32),
    due_date VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    deleted TINYINT NOT NULL DEFAULT 0,
    INDEX (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS wispcore_commissions (
    uuid VARCHAR(36) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    collaborator_uuid VARCHAR(36) NOT NULL,
    client_uuid VARCHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payout_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    deleted TINYINT NOT NULL DEFAULT 0,
    INDEX (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

function getSiteId() {
  const config = readConfig();
  if (config.sync?.siteId) return config.sync.siteId;
  const siteId = crypto.randomUUID();
  updateConfig((c) => {
    c.sync = c.sync || {};
    c.sync.siteId = siteId;
  });
  return siteId;
}

export function getSyncSettings() {
  const config = readConfig();
  const sync = config.sync || {};
  return {
    enabled: !!sync.enabled,
    host: sync.host || '',
    port: sync.port || 3306,
    database: sync.database || '',
    user: sync.user || '',
    hasPassword: !!sync.passwordEncrypted,
    ssl: !!sync.ssl,
    autoSyncMinutes: sync.autoSyncMinutes || 0,
    lastSyncAt: sync.lastSyncAt || null,
    siteId: sync.siteId || null,
    hasOrgKey: !!sync.orgKeyEncrypted,
  };
}

export function setSyncSettings({ host, port, database: dbName, user, password, ssl, autoSyncMinutes, enabled }) {
  updateConfig((c) => {
    c.sync = c.sync || {};
    c.sync.host = host ?? c.sync.host;
    c.sync.port = port ?? c.sync.port;
    c.sync.database = dbName ?? c.sync.database;
    c.sync.user = user ?? c.sync.user;
    c.sync.ssl = ssl ?? c.sync.ssl;
    c.sync.autoSyncMinutes = autoSyncMinutes ?? c.sync.autoSyncMinutes;
    c.sync.enabled = enabled ?? c.sync.enabled;
    if (password) {
      const secret = encryptSecret(password);
      c.sync.passwordEncrypted = secret.value;
      c.sync.passwordProtection = secret.protection;
    }
  });
  getSiteId();
  return getSyncSettings();
}

function buildConnectionConfig() {
  const config = readConfig();
  const sync = config.sync || {};
  if (!sync.host || !sync.database || !sync.user) {
    throw new Error('Configurazione MariaDB incompleta: host, database e utente sono obbligatori.');
  }
  return {
    host: sync.host,
    port: sync.port || 3306,
    database: sync.database,
    user: sync.user,
    password: decryptSecret({ protection: sync.passwordProtection, value: sync.passwordEncrypted }),
    ssl: sync.ssl ? {} : undefined,
    connectTimeout: 8000,
  };
}

export async function testConnection(overrideSettings) {
  const connConfig = overrideSettings
    ? {
        host: overrideSettings.host,
        port: overrideSettings.port || 3306,
        database: overrideSettings.database,
        user: overrideSettings.user,
        password: overrideSettings.password,
        ssl: overrideSettings.ssl ? {} : undefined,
        connectTimeout: 8000,
      }
    : buildConnectionConfig();

  let conn;
  try {
    conn = await mariadb.createConnection(connConfig);
    await conn.ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

async function ensureRemoteSchema(conn) {
  for (const stmt of REMOTE_SCHEMA) {
    await conn.query(stmt);
  }
}

/**
 * Generates (or imports) the shared Organization Data Key and re-encrypts
 * every already-stored PPPoE password with it, so clients created before
 * sync was enabled become readable by every synced station too.
 */
export function generateAndStoreOrgKey() {
  const oldKey = getOrgKey() || getDataKey();
  const b64 = generateOrgKey();
  const newKey = getOrgKey();
  const migrated = database.reencryptAllClientPasswords(
    (blob) => decryptField(blob, oldKey),
    (plain) => encryptField(plain, newKey)
  );
  appendLog(`Chiave di organizzazione generata, ${migrated} credenziali cliente ri-cifrate.`);
  return b64;
}

export function importAndStoreOrgKey(base64Key) {
  const oldKey = getOrgKey() || getDataKey();
  importOrgKey(base64Key);
  const newKey = getOrgKey();
  const migrated = database.reencryptAllClientPasswords(
    (blob) => decryptField(blob, oldKey),
    (plain) => encryptField(plain, newKey)
  );
  appendLog(`Chiave di organizzazione importata, ${migrated} credenziali cliente ri-cifrate.`);
  return true;
}

export async function runSync(actor) {
  const settings = getSyncSettings();
  if (!settings.enabled) throw new Error('La sincronizzazione MariaDB non è attiva.');

  const siteId = getSiteId();
  const conn = await mariadb.createConnection(buildConnectionConfig());
  const summary = { pulled: { collaborators: 0, clients: 0, payments: 0, commissions: 0 }, pushed: 0 };

  try {
    await ensureRemoteSchema(conn);

    const lastSync = readConfig().sync?.lastSyncAt || '1970-01-01T00:00:00.000Z';

    // ---- PULL (order matters: parents before children) ----
    const remoteCollabs = await conn.query('SELECT * FROM wispcore_collaborators WHERE updated_at > ?', [lastSync]);
    for (const row of remoteCollabs) if (database.upsertCollaboratorFromRemote(row)) summary.pulled.collaborators++;

    const remoteClients = await conn.query('SELECT * FROM wispcore_clients WHERE updated_at > ?', [lastSync]);
    for (const row of remoteClients) if (database.upsertClientFromRemote(row)) summary.pulled.clients++;

    const remotePayments = await conn.query('SELECT * FROM wispcore_payments WHERE updated_at > ?', [lastSync]);
    for (const row of remotePayments) if (database.upsertPaymentFromRemote(row)) summary.pulled.payments++;

    const remoteCommissions = await conn.query('SELECT * FROM wispcore_commissions WHERE updated_at > ?', [lastSync]);
    for (const row of remoteCommissions) if (database.upsertCommissionFromRemote(row)) summary.pulled.commissions++;

    database.persist();

    // ---- PUSH local outbox ----
    const outbox = database.getUnsyncedOutbox();
    const pushedIds = [];

    for (const item of outbox) {
      const payload = JSON.parse(item.payload || '{}');
      try {
        if (item.entity === 'collaborators') {
          await conn.query(
            `INSERT INTO wispcore_collaborators (uuid, site_id, first_name, last_name, phone, email, created_at, updated_at, deleted)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name), phone=VALUES(phone),
               email=VALUES(email), updated_at=VALUES(updated_at), deleted=VALUES(deleted)`,
            [payload.uuid, siteId, payload.first_name, payload.last_name, payload.phone || '', payload.email || '', payload.created_at, payload.updated_at, payload.deleted ? 1 : 0]
          );
        } else if (item.entity === 'clients') {
          const collaboratorUuid = database.uuidFor('collaborators', payload.collaborator_id);
          await conn.query(
            `INSERT INTO wispcore_clients (uuid, site_id, collaborator_uuid, first_name, last_name, tax_code, address, phone, email,
              billing_cycle, monthly_fee, installation_fee, pppoe_username, pppoe_password_enc, mac_address, assigned_ip, device_model,
              notes, created_at, updated_at, deleted)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE collaborator_uuid=VALUES(collaborator_uuid), first_name=VALUES(first_name), last_name=VALUES(last_name),
               tax_code=VALUES(tax_code), address=VALUES(address), phone=VALUES(phone), email=VALUES(email),
               billing_cycle=VALUES(billing_cycle), monthly_fee=VALUES(monthly_fee), installation_fee=VALUES(installation_fee),
               pppoe_username=VALUES(pppoe_username), pppoe_password_enc=VALUES(pppoe_password_enc), mac_address=VALUES(mac_address),
               assigned_ip=VALUES(assigned_ip), device_model=VALUES(device_model), notes=VALUES(notes), updated_at=VALUES(updated_at),
               deleted=VALUES(deleted)`,
            [payload.uuid, siteId, collaboratorUuid, payload.first_name, payload.last_name, payload.tax_code || '', payload.address || '',
             payload.phone || '', payload.email || '', payload.billing_cycle, payload.monthly_fee, payload.installation_fee,
             payload.pppoe_username || '', payload.pppoe_password_enc || '', payload.mac_address || '', payload.assigned_ip || '',
             payload.device_model || '', payload.notes || '', payload.created_at, payload.updated_at, payload.deleted ? 1 : 0]
          );
        } else if (item.entity === 'payments') {
          const clientUuid = database.uuidFor('clients', payload.client_id);
          if (clientUuid) {
            await conn.query(
              `INSERT INTO wispcore_payments (uuid, site_id, client_uuid, amount, payment_type, payment_date, due_date, status, created_at, updated_at, deleted)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE client_uuid=VALUES(client_uuid), amount=VALUES(amount), payment_type=VALUES(payment_type),
                 payment_date=VALUES(payment_date), due_date=VALUES(due_date), status=VALUES(status), updated_at=VALUES(updated_at), deleted=VALUES(deleted)`,
              [payload.uuid, siteId, clientUuid, payload.amount, payload.payment_type, payload.payment_date || '', payload.due_date || '', payload.status, payload.created_at, payload.updated_at, payload.deleted ? 1 : 0]
            );
          }
        } else if (item.entity === 'commissions') {
          const clientUuid = database.uuidFor('clients', payload.client_id);
          const collaboratorUuid = database.uuidFor('collaborators', payload.collaborator_id);
          if (clientUuid && collaboratorUuid) {
            await conn.query(
              `INSERT INTO wispcore_commissions (uuid, site_id, collaborator_uuid, client_uuid, amount, payout_status, created_at, updated_at, deleted)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE collaborator_uuid=VALUES(collaborator_uuid), client_uuid=VALUES(client_uuid), amount=VALUES(amount),
                 payout_status=VALUES(payout_status), updated_at=VALUES(updated_at), deleted=VALUES(deleted)`,
              [payload.uuid, siteId, collaboratorUuid, clientUuid, payload.amount, payload.payout_status, payload.created_at, payload.updated_at, payload.deleted ? 1 : 0]
            );
          }
        }
        pushedIds.push(item.id);
        summary.pushed++;
      } catch (err) {
        appendLog(`Sync push fallita per outbox #${item.id} (${item.entity}): ${err.message}`);
      }
    }

    database.markOutboxSynced(pushedIds);

    updateConfig((c) => {
      c.sync.lastSyncAt = new Date().toISOString();
    });

    database.recordAudit(actor, 'SYNC', 'mariadb', null, summary);
    appendLog(`Sync MariaDB completata: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await conn.end().catch(() => {});
  }
}
