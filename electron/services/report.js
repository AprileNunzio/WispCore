import fs from 'fs';
import { BrowserWindow, dialog, app } from 'electron';
import * as database from './database.js';
import { appendLog } from './paths.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function eur(n) {
  return `€ ${(Number(n) || 0).toFixed(2)}`;
}

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
function monthLabel(ym) {
  const [, m] = ym.split('-');
  return `${MONTH_LABELS[Number(m) - 1] || m} ${ym.slice(0, 4)}`;
}

function bar(pct, color) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return `<div class="barTrack"><div class="barFill" style="width:${clamped}%;background:${color}"></div></div>`;
}

function buildReportHtml({ months, monthly, bi, topClients, byCollaborator, generatedAt, appVersion }) {
  const monthlyRows = monthly
    .map(
      (m) => `<tr>
        <td>${monthLabel(m.month)}</td>
        <td class="num">${eur(m.revenue)}</td>
        <td class="num" style="font-weight:600">${eur(m.revenue - m.commissions)}</td>
        <td class="num">${m.newClients}</td>
        <td class="num">${eur(m.overdue)}</td>
        <td class="num">${eur(m.commissions)}</td>
      </tr>`
    )
    .join('');

  const topClientsRows = topClients
    .map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.first_name)} ${esc(c.last_name)}</td><td class="num">${eur(c.total_paid)}</td></tr>`)
    .join('');

  const collabRows = byCollaborator
    .map(
      (c) => `<tr><td>${esc(c.first_name)} ${esc(c.last_name)}</td><td class="num">${eur(c.total_amount)}</td><td class="num">${eur(c.pending_amount)}</td></tr>`
    )
    .join('');

  const nodeRows = bi.nodeSaturation
    .map(
      (n) => `<tr>
        <td>${esc(n.name)}</td>
        <td class="num">${n.active_clients}</td>
        <td class="num">${n.max_clients || '—'}</td>
        <td>${n.saturation_pct === null ? 'N/D' : `${n.saturation_pct}%`} ${n.saturation_pct !== null ? bar(n.saturation_pct, n.saturation_pct >= 90 ? '#e11d48' : n.saturation_pct >= 70 ? '#f59e0b' : '#0891b2') : ''}</td>
      </tr>`
    )
    .join('');

  const reasonRows = bi.cancellationReasons
    .map((r) => `<tr><td>${esc(r.reason)}</td><td class="num">${r.count}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #111827; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 24px 0 8px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #0369a1; }
  .subtitle { color: #6b7280; font-size: 11px; margin-bottom: 20px; }
  .kpiGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 8px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .kpi .label { font-size: 9px; text-transform: uppercase; color: #6b7280; letter-spacing: .03em; }
  .kpi .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #f3f4f6; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .barTrack { display: inline-block; width: 80px; height: 6px; background: #f3f4f6; border-radius: 3px; vertical-align: middle; margin-left: 6px; overflow: hidden; }
  .barFill { height: 100%; }
  .footer { margin-top: 28px; color: #9ca3af; font-size: 9px; text-align: center; }
</style></head>
<body>
  <h1>WispCore — Report Periodico</h1>
  <div class="subtitle">Periodo analizzato: ultimi ${months} mesi · Generato il ${esc(generatedAt)} · WispCore v${esc(appVersion)}</div>

  <div class="kpiGrid">
    <div class="kpi"><div class="label">Clienti Attivi</div><div class="value">${bi.activeCount}</div></div>
    <div class="kpi"><div class="label">MRR</div><div class="value">${eur(bi.mrr)}</div></div>
    <div class="kpi"><div class="label">ARPU</div><div class="value">${eur(bi.arpu)}</div></div>
    <div class="kpi"><div class="label">LTV Stimato</div><div class="value">${eur(bi.ltv)}</div></div>
    <div class="kpi"><div class="label">Churn Rate Medio/Mese</div><div class="value">${bi.avgMonthlyChurnPct}%</div></div>
    <div class="kpi"><div class="label">Metodo LTV</div><div class="value" style="font-size:10px;font-weight:400">${esc(bi.ltvMethod)}</div></div>
  </div>

  <h2>Andamento Mensile</h2>
  <table>
    <thead><tr><th>Mese</th><th class="num">Incasso Lordo</th><th class="num">Incasso Netto</th><th class="num">Nuovi Clienti</th><th class="num">Insoluti</th><th class="num">Provvigioni</th></tr></thead>
    <tbody>${monthlyRows || '<tr><td colspan="6">Nessun dato.</td></tr>'}</tbody>
  </table>

  <h2>Top 10 Clienti per Fatturato</h2>
  <table>
    <thead><tr><th>#</th><th>Cliente</th><th class="num">Totale Pagato</th></tr></thead>
    <tbody>${topClientsRows || '<tr><td colspan="3">Nessun dato.</td></tr>'}</tbody>
  </table>

  <h2>Provvigioni per Collaboratore</h2>
  <table>
    <thead><tr><th>Collaboratore</th><th class="num">Totale</th><th class="num">Da Liquidare</th></tr></thead>
    <tbody>${collabRows || '<tr><td colspan="3">Nessun collaboratore.</td></tr>'}</tbody>
  </table>

  <h2>Saturazione Nodi di Rete (BTS/Ripetitori)</h2>
  <table>
    <thead><tr><th>Nodo</th><th class="num">Clienti Attivi</th><th class="num">Capacità Max</th><th>Saturazione</th></tr></thead>
    <tbody>${nodeRows || '<tr><td colspan="4">Nessun nodo di rete configurato.</td></tr>'}</tbody>
  </table>

  ${bi.cancellationReasons.length > 0 ? `
  <h2>Motivazioni di Disdetta</h2>
  <table>
    <thead><tr><th>Motivo</th><th class="num">N. Clienti</th></tr></thead>
    <tbody>${reasonRows}</tbody>
  </table>` : ''}

  <div class="footer">Documento generato automaticamente da WispCore — NunzioTech</div>
</body></html>`;
}

/** Genera il report periodico in PDF renderizzando una vista HTML autonoma in una finestra nascosta, poi la stampa via Chromium (nessuna libreria PDF esterna necessaria). */
export async function generatePeriodReportPdf(browserWindow, { months = 12 } = {}) {
  const monthly = database.getMonthlyAnalytics(months);
  const bi = database.getBiMetrics(months);
  const topClients = database.getTopClientsByRevenue(10);
  const byCollaborator = database.getCommissionsByCollaborator();

  const html = buildReportHtml({
    months,
    monthly,
    bi,
    topClients,
    byCollaborator,
    generatedAt: new Date().toLocaleString('it-IT'),
    appVersion: app.getVersion(),
  });

  const reportWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });

  try {
    await reportWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    const pdfBuffer = await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
      title: 'Salva Report PDF',
      defaultPath: `wispcore_report_${new Date().toISOString().split('T')[0]}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;

    fs.writeFileSync(filePath, pdfBuffer);
    appendLog(`Report PDF generato: ${filePath}`);
    return filePath;
  } finally {
    reportWindow.destroy();
  }
}
