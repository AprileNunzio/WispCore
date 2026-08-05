import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import type { Payment, Client, Collaborator, EmailTemplate, PaymentStatus } from '../types';
import { CalendarClock, AlertTriangle, Clock, CheckCircle2, Mail, Filter, Send } from 'lucide-react';

export const ScadenzeView: React.FC = () => {
  const { notify } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [collabFilter, setCollabFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, c, collabs, tmpl, smtp] = await Promise.all([
      dbService.getPayments(),
      dbService.getClients(),
      dbService.getCollaborators(),
      dbService.getEmailTemplates(),
      dbService.getSmtpSettings(),
    ]);
    setPayments(p);
    setClients(c);
    setCollaborators(collabs);
    setTemplates(tmpl);
    setSmtpEnabled(smtp.enabled);
    if (tmpl.length > 0) setSelectedTemplateId(tmpl[0].id);
  };

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const filtered = payments.filter((p) => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (collabFilter !== 'ALL') {
      const client = clientsById.get(p.client_id);
      if (String(client?.collaborator_id ?? '') !== collabFilter) return false;
    }
    if (fromDate && p.due_date < fromDate) return false;
    if (toDate && p.due_date > toDate) return false;
    return true;
  });

  const totals = {
    overdue: filtered.filter((p) => p.status === 'OVERDUE').reduce((a, b) => a + b.amount, 0),
    pending: filtered.filter((p) => p.status === 'PENDING').reduce((a, b) => a + b.amount, 0),
    count: filtered.length,
  };

  const handleSendReminder = async (payment: Payment) => {
    if (!selectedTemplateId) {
      notify('Crea prima un template email nelle Impostazioni.', 'error');
      return;
    }
    setSendingId(payment.id);
    try {
      await dbService.sendPaymentReminder(payment.id, selectedTemplateId);
      notify(`Email di sollecito inviata a ${clientsById.get(payment.client_id)?.email}.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore durante l\'invio email.', 'error');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <CalendarClock className="text-amber-600" size={24} />
          <span>Scadenzario Dettagliato</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Tutte le scadenze di tutti i clienti, filtrabili e con invio solleciti via email</p>
        {!smtpEnabled && (
          <div className="mt-3 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            L'invio email non è attivo. Configuralo in Impostazioni → SMTP per poter inviare i solleciti.
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-5 border border-gray-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3"><Filter size={16} /> Filtri</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
          <div>
            <label className="text-gray-500 block mb-1 text-xs">Stato</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900">
              <option value="ALL">Tutti</option>
              <option value="OVERDUE">Insoluti</option>
              <option value="PENDING">In Attesa</option>
              <option value="PAID">Saldati</option>
            </select>
          </div>
          <div>
            <label className="text-gray-500 block mb-1 text-xs">Collaboratore</label>
            <select value={collabFilter} onChange={(e) => setCollabFilter(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900">
              <option value="ALL">Tutti</option>
              {collaborators.map((c) => <option key={c.id} value={String(c.id)}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-500 block mb-1 text-xs">Da Data</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
          </div>
          <div>
            <label className="text-gray-500 block mb-1 text-xs">A Data</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
          </div>
          <div>
            <label className="text-gray-500 block mb-1 text-xs">Template Sollecito</label>
            <select value={selectedTemplateId ?? ''} onChange={(e) => setSelectedTemplateId(Number(e.target.value) || null)} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900">
              {templates.length === 0 && <option value="">Nessun template</option>}
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="ultra-grid">
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Voci Filtrate</span>
          <h3 className="text-2xl font-black text-gray-900 mt-1 font-mono">{totals.count}</h3>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">In Attesa</span>
          <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">€ {totals.pending.toFixed(2)}</h3>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Insoluti</span>
          <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">€ {totals.overdue.toFixed(2)}</h3>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-500 uppercase text-xs tracking-wider">
              <tr>
                <th className="p-3">Cliente</th>
                <th className="p-3">Email</th>
                <th className="p-3">Collaboratore</th>
                <th className="p-3">Tipo</th>
                <th className="p-3 font-mono">Importo</th>
                <th className="p-3">Scadenza</th>
                <th className="p-3">Stato</th>
                <th className="p-3 text-right">Sollecito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-400">Nessuna scadenza corrisponde ai filtri.</td></tr>
              ) : (
                filtered.map((p) => {
                  const client = clientsById.get(p.client_id);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-900">{p.client_name}</td>
                      <td className="p-3 text-xs text-gray-400">{client?.email || '—'}</td>
                      <td className="p-3 text-xs">{client?.collaborator_name || '—'}</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono text-xs">{p.payment_type}</span></td>
                      <td className="p-3 font-mono font-bold text-gray-900">€ {p.amount.toFixed(2)}</td>
                      <td className="p-3 font-mono text-gray-400">{p.due_date}</td>
                      <td className="p-3">
                        {p.status === 'PAID' && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} /> Saldato</span>}
                        {p.status === 'PENDING' && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Clock size={12} /> In Attesa</span>}
                        {p.status === 'OVERDUE' && <span className="inline-flex items-center gap-1 text-xs text-rose-700"><AlertTriangle size={12} /> Insoluto</span>}
                      </td>
                      <td className="p-3 text-right">
                        {p.status !== 'PAID' && client?.email && (
                          <button
                            onClick={() => handleSendReminder(p)}
                            disabled={sendingId === p.id || !smtpEnabled}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium cursor-pointer text-xs disabled:opacity-40 inline-flex items-center gap-1"
                          >
                            {sendingId === p.id ? <Send size={12} className="animate-pulse" /> : <Mail size={12} />}
                            Invia
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
