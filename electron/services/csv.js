import fs from 'fs';
import { dialog } from 'electron';
import * as database from './database.js';
import { appendLog } from './paths.js';

const DELIMITER = ';'; // il punto e virgola evita ambiguità con la virgola decimale usata da Excel in Italia

function toCsvValue(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/["\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.join(DELIMITER)];
  for (const row of rows) {
    lines.push(headers.map((h) => toCsvValue(row[h])).join(DELIMITER));
  }
  return lines.join('\r\n');
}

async function saveCsvViaDialog(browserWindow, baseName, csvContent) {
  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title: `Esporta ${baseName} in CSV`,
    defaultPath: `wispcore_${baseName}_${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return null;
  // BOM UTF-8: senza, Excel su Windows mostra male gli accenti.
  fs.writeFileSync(filePath, `﻿${csvContent}`, 'utf-8');
  appendLog(`Export CSV ${baseName} creato: ${filePath}`);
  return filePath;
}

const CLIENT_CSV_COLUMNS = [
  'id', 'first_name', 'last_name', 'tax_code', 'address', 'phone', 'email', 'status',
  'plan_name', 'network_node_name', 'collaborator_name', 'billing_cycle', 'monthly_fee',
  'installation_fee', 'last_payment_date', 'next_due_date', 'contract_start_date',
  'contract_end_date', 'assigned_ip', 'mac_address', 'pppoe_username', 'created_at',
];

export async function exportClientsCsv(browserWindow) {
  return saveCsvViaDialog(browserWindow, 'clienti', rowsToCsv(CLIENT_CSV_COLUMNS, database.listClients()));
}

const PAYMENT_CSV_COLUMNS = ['id', 'client_name', 'payment_type', 'amount', 'due_date', 'payment_date', 'status', 'created_at'];

export async function exportPaymentsCsv(browserWindow) {
  return saveCsvViaDialog(browserWindow, 'pagamenti', rowsToCsv(PAYMENT_CSV_COLUMNS, database.listPayments()));
}

const COMMISSION_CSV_COLUMNS = ['id', 'collaborator_name', 'client_name', 'amount', 'payout_status', 'created_at'];

export async function exportCommissionsCsv(browserWindow) {
  return saveCsvViaDialog(browserWindow, 'provvigioni', rowsToCsv(COMMISSION_CSV_COLUMNS, database.listCommissions()));
}

/**
 * Parser CSV minimale ma corretto sulle virgolette: gestisce campi tra
 * doppi apici contenenti il delimitatore, newline o apici raddoppiati (""),
 * e rileva da sola se il file usa ';' o ',' guardando la prima riga.
 */
function parseCsv(content) {
  const firstLine = content.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
    return obj;
  });
  return { headers, records };
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k]) return row[k];
  }
  return '';
}

/**
 * Import massivo clienti da CSV (es. migrazione da Excel/altro gestionale).
 * Accetta intestazioni in italiano o inglese. Non genera automaticamente
 * pagamenti/provvigioni di installazione: un import in blocco non deve
 * riempire lo Scadenzario di decine di voci una-tantum indesiderate.
 */
export async function importClientsCsv(browserWindow, actor) {
  const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
    title: 'Importa clienti da CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;

  const content = fs.readFileSync(filePaths[0], 'utf-8').replace(/^﻿/, '');
  const { records } = parseCsv(content);

  let imported = 0;
  const errors = [];
  records.forEach((row, idx) => {
    const first_name = pick(row, 'first_name', 'nome');
    const last_name = pick(row, 'last_name', 'cognome');
    if (!first_name || !last_name) {
      errors.push(`Riga ${idx + 2}: nome o cognome mancante, ignorata.`);
      return;
    }
    try {
      database.saveClient(
        {
          first_name,
          last_name,
          tax_code: pick(row, 'tax_code', 'codice_fiscale'),
          address: pick(row, 'address', 'indirizzo'),
          phone: pick(row, 'phone', 'telefono'),
          email: pick(row, 'email'),
          status: 'ACTIVE',
          billing_cycle: 'MONTHLY',
          monthly_fee: parseFloat(pick(row, 'monthly_fee', 'canone').replace(',', '.')) || 0,
          installation_fee: 0,
          assigned_ip: pick(row, 'assigned_ip', 'ip'),
          mac_address: pick(row, 'mac_address', 'mac'),
          pppoe_username: pick(row, 'pppoe_username', 'pppoe'),
        },
        actor
      );
      imported++;
    } catch (err) {
      errors.push(`Riga ${idx + 2}: ${err.message}`);
    }
  });

  appendLog(`Import CSV clienti da ${filePaths[0]}: ${imported} importati, ${errors.length} errori.`);
  return { imported, total: records.length, errors };
}
