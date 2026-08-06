import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import { ClientPaymentCalendar } from './ClientPaymentCalendar';
import { calculateClientReliability } from '../financialEngine';
import type { Client, ClientDetail, ClientStatus, Payment, PaymentType } from '../types';
import {
  ArrowLeft,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wifi,
  Network,
  Radio,
  User,
  FileSignature,
  History,
  Ban,
  ShieldCheck,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Receipt,
  Edit3,
  Trash2,
  Undo2,
} from 'lucide-react';

const STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Attivo',
  SUSPENDED: 'Sospeso',
  CANCELLED: 'Disdetto',
  PROSPECT: 'In Attivazione (Prospect)',
};

const STATUS_BADGE: Record<ClientStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  PROSPECT: 'bg-blue-50 text-blue-700 border-blue-200',
};

interface Props {
  clientId: number;
  onBack: () => void;
  onEdit?: (client: Client) => void;
}

/**
 * Pagina cliente a tutto schermo (non un popup): sostituisce l'elenco in
 * Gestione Anagrafica quando si clicca su un cliente, con un pulsante
 * "Torna all'elenco" al posto della X di chiusura. Stessa scelta di design
 * delle altre viste principali (FinancialView, ScadenzeView...), così da
 * poter scorrere liberamente tutte le informazioni senza il vincolo di
 * altezza di una finestra modale.
 */
export const ClientDetailModal: React.FC<Props> = ({ clientId, onBack, onEdit }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useToast();
  const confirmDialog = useConfirm();

  // Modale di correzione (importo/scadenza/tipo) per rimediare a un errore di registrazione,
  // riusabile qui sull'estratto conto esattamente come nel Modulo Finanziario.
  const [editModal, setEditModal] = useState<{ paymentId: number; amount: number; due_date: string; payment_type: PaymentType } | null>(null);

  const loadDetail = () => {
    dbService.getClientDetail(clientId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  };

  useEffect(() => {
    setLoading(true);
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleOpenCpe = async (ip: string) => {
    try {
      const creds = await dbService.getBetaCpeCredentials();
      if (creds.password) {
        navigator.clipboard.writeText(creds.password);
      }
      window.wispcore.system.openExternal(`https://${ip}`);
      notify(`Browser aperto per ${ip}. Password '${creds.username}' copiata negli appunti!`, 'success');
    } catch (e) {
      notify('Impossibile recuperare credenziali CPE', 'error');
    }
  };

  const handleUndoPaid = async (p: Payment) => {
    const ok = await confirmDialog(
      `Annullare il saldo di questo pagamento (€ ${p.amount.toFixed(2)})? Tornerà "In Attesa". ` +
      `Nota: l'eventuale prossima scadenza già generata automaticamente e la provvigione collegata NON vengono rimosse in automatico.`
    );
    if (!ok) return;
    await dbService.updatePaymentStatus(p.id, 'PENDING');
    notify('Saldo annullato: il pagamento è tornato In Attesa.', 'success');
    loadDetail();
  };

  const handleOpenEditModal = (p: Payment) => {
    setEditModal({ paymentId: p.id, amount: p.amount, due_date: p.due_date, payment_type: p.payment_type });
  };

  const handleConfirmEdit = async () => {
    if (!editModal) return;
    await dbService.updatePayment(editModal.paymentId, {
      amount: editModal.amount,
      due_date: editModal.due_date,
      payment_type: editModal.payment_type,
    });
    notify('Pagamento corretto.', 'success');
    setEditModal(null);
    loadDetail();
  };

  const handleDeletePayment = async (p: Payment) => {
    const ok = await confirmDialog(`Eliminare definitivamente questo pagamento (€ ${p.amount.toFixed(2)}, scadenza ${p.due_date})? L'operazione non è reversibile dall'interfaccia.`);
    if (!ok) return;
    await dbService.deletePayment(p.id);
    notify('Pagamento eliminato.', 'success');
    loadDetail();
  };

  // Calcoli Portafoglio & Estratto Conto Cliente
  const totalPaid = detail ? detail.payments.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.amount, 0) : 0;
  const totalPending = detail ? detail.payments.filter(p => p.status === 'PENDING').reduce((acc, p) => acc + p.amount, 0) : 0;
  const totalOverdue = detail ? detail.payments.filter(p => p.status === 'OVERDUE').reduce((acc, p) => acc + p.amount, 0) : 0;
  const totalOwed = totalPending + totalOverdue;
  const isUpToDate = totalOwed === 0;

  // Indice Affidabilità: stessa formula usata in "Cattivi Pagatori" (Modulo
  // Finanziario), qui calcolata per il singolo cliente aperto.
  const reliability = useMemo(
    () => (detail ? calculateClientReliability(detail.client, detail.payments) : null),
    [detail]
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header pagina */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2.5 text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors shrink-0" title="Torna all'elenco clienti">
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-sm shrink-0">
            {detail ? `${detail.client.first_name[0]}${detail.client.last_name[0]}` : <User size={20} />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              <span>{loading ? 'Caricamento...' : `${detail?.client.first_name} ${detail?.client.last_name}`}</span>
              {detail && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[detail.client.status]}`}>
                  {STATUS_LABELS[detail.client.status]}
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-400 font-mono">Codice Cliente: WISP-00{clientId} • CF/PIVA: {detail?.client.tax_code || 'N/D'}</p>
          </div>
        </div>

        {detail && onEdit && (
          <button
            onClick={() => onEdit(detail.client)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0"
          >
            <Edit3 size={14} /> Modifica Cliente
          </button>
        )}
      </div>

      {loading || !detail ? (
        <div className="glass-panel rounded-2xl p-16 text-center text-gray-400 text-sm border border-gray-200">Caricamento scheda e portafoglio cliente...</div>
      ) : (
        <div className="space-y-6">

            {/* SEZIONE PORTAFOGLIO & ESTRATTO CONTO CLIENTE */}
            <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 p-5 rounded-2xl border border-gray-800 text-white shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-gray-700/60 pb-3">
                <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  <Wallet className="text-emerald-400" size={18} />
                  <span>Portafoglio & Bilancio Cliente</span>
                </h3>
                <div className="flex items-center gap-2">
                  {isUpToDate ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold rounded-full">
                      <CheckCircle2 size={13} /> Posizione in Regola (Saldo € 0.00)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-400/30 text-xs font-semibold rounded-full">
                      <AlertTriangle size={13} /> Cliente in Debito di € {totalOwed.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <span className="text-[10px] uppercase font-semibold text-emerald-400 block tracking-wider flex items-center gap-1">
                    <TrendingUp size={12} /> Incassato Totale (Denaro in Mano)
                  </span>
                  <span className="font-mono font-bold text-emerald-300 text-xl mt-0.5 block">€ {totalPaid.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Somma pagamenti saldati con successo</span>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <span className="text-[10px] uppercase font-semibold text-amber-400 block tracking-wider flex items-center gap-1">
                    <Clock size={12} /> In Attesa di Saldare
                  </span>
                  <span className="font-mono font-bold text-amber-300 text-xl mt-0.5 block">€ {totalPending.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Prossime scadenze regolari</span>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <span className="text-[10px] uppercase font-semibold text-rose-400 block tracking-wider flex items-center gap-1">
                    <TrendingDown size={12} /> Insoluti / Scaduti da Incassare
                  </span>
                  <span className="font-mono font-bold text-rose-400 text-xl mt-0.5 block">€ {totalOverdue.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Richiedono sollecito d'incasso</span>
                </div>
              </div>
            </div>

            {/* Indice Affidabilità - stessa metrica di "Cattivi Pagatori", per questo cliente */}
            {reliability && (
              <div className="glass-panel p-5 rounded-2xl border border-gray-200">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-rose-600" />
                    <span>Indice Affidabilità</span>
                  </h3>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 border text-xs font-semibold rounded-full ${
                    reliability.riskBadgeColor === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    reliability.riskBadgeColor === 'yellow' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' :
                    reliability.riskBadgeColor === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {reliability.riskLabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-gray-400 uppercase block mb-1">Punteggio</span>
                    <span className="font-mono font-bold text-lg text-gray-900">{reliability.score}/100</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-gray-400 uppercase block mb-1">Ritardo Medio</span>
                    <span className="font-mono font-bold text-lg text-gray-900">{reliability.avgDaysLate}g</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-gray-400 uppercase block mb-1">Insoluti Attivi</span>
                    <span className="font-mono font-bold text-lg text-rose-600">{reliability.currentOverdueCount}</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-gray-400 uppercase block mb-1">Max Ritardo</span>
                    <span className="font-mono font-bold text-lg text-gray-900">{reliability.maxSingleDelayDays}g</span>
                  </div>
                </div>
              </div>
            )}

            {/* Dettagli Tecnici e Contratto */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1 font-semibold"><Wifi size={13} className="text-cyan-600" /> Credenziali PPPoE</div>
                <div className="text-cyan-700 font-mono font-bold">{detail.client.pppoe_username || 'Non configurato'}</div>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1 font-semibold"><Network size={13} className="text-blue-600" /> Indirizzo IP Assegnato</div>
                {detail.client.assigned_ip ? (
                  <button onClick={() => handleOpenCpe(detail.client.assigned_ip!)} className="text-blue-700 hover:text-blue-900 font-mono font-bold cursor-pointer transition-colors" title="Apri interfaccia web">
                    {detail.client.assigned_ip}
                  </button>
                ) : (
                  <div className="text-blue-700 font-mono font-bold">Non assegnato</div>
                )}
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1 font-semibold"><Radio size={13} className="text-emerald-600" /> Dispositivo CPE / MAC</div>
                <div className="text-gray-900 font-semibold">{detail.client.device_model || 'CPE WISP Standard'}</div>
                <div className="text-emerald-700 text-xs font-mono">{detail.client.mac_address || '00:00:00:00:00:00'}</div>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1 font-semibold"><Wallet size={13} className="text-amber-600" /> Offerta Internet & Collaboratore</div>
                <div className="text-gray-900 font-semibold">{detail.client.plan_name || 'Piano Personalizzato'}</div>
                <div className="text-cyan-700 text-xs font-semibold">Collaboratore: {detail.client.collaborator_name}</div>
              </div>

              {(detail.client.last_payment_date || detail.client.next_due_date) && (
                <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 sm:col-span-2">
                  <div className="text-[11px] text-amber-700 uppercase flex items-center gap-1 mb-1 font-bold">Scadenze Fatturazione</div>
                  <div className="text-gray-700 text-xs">
                    Data Ultimo Incasso: <span className="font-mono font-bold text-gray-900">{detail.client.last_payment_date || 'Nessuno'}</span> • Prossima Scadenza Canone: <span className="font-mono font-bold text-amber-700">{detail.client.next_due_date || 'In attesa'}</span>
                  </div>
                </div>
              )}

              {(detail.client.contract_start_date || detail.client.contract_end_date || detail.client.contract_notes) && (
                <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-200 sm:col-span-2">
                  <div className="text-[11px] text-purple-700 uppercase flex items-center gap-1 mb-1 font-bold"><FileSignature size={13} /> Dettagli Contratto</div>
                  <div className="text-gray-700 text-xs">
                    Data Inizio: <span className="font-mono font-semibold">{detail.client.contract_start_date || 'N/D'}</span> • Data Scadenza/Rinnovo: <span className="font-mono font-semibold">{detail.client.contract_end_date || 'Indeterminato'}</span>
                  </div>
                  {detail.client.contract_notes && <div className="text-gray-600 text-xs mt-1 italic">{detail.client.contract_notes}</div>}
                </div>
              )}

              {detail.client.status === 'CANCELLED' && (
                <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 sm:col-span-2">
                  <div className="text-[11px] text-rose-700 uppercase flex items-center gap-1 mb-1 font-bold"><Ban size={13} /> Motivo Disdetta</div>
                  <div className="text-gray-700 text-xs">
                    Data Disdetta: <span className="font-mono font-semibold">{detail.client.cancelled_at?.split('T')[0] || 'N/D'}</span>
                    {detail.client.cancellation_reason && <> • Motivazione: <span className="font-semibold">{detail.client.cancellation_reason}</span></>}
                  </div>
                </div>
              )}
            </div>

            {/* Storico Modifiche Piano */}
            {detail.planHistory.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History size={14} className="text-purple-600" /> Storico Variazioni Piano & Canone
                </h3>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead className="bg-gray-100 text-gray-500 uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">Data Variazione</th>
                        <th className="p-2.5">Piano Precedente</th>
                        <th className="p-2.5">Nuovo Piano</th>
                        <th className="p-2.5">Canone Precedente</th>
                        <th className="p-2.5">Nuovo Canone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.planHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="p-2.5 font-mono text-gray-400">{h.changed_at.split('T')[0]}</td>
                          <td className="p-2.5">{h.old_plan_name || '—'}</td>
                          <td className="p-2.5 font-semibold text-gray-900">{h.new_plan_name || '—'}</td>
                          <td className="p-2.5 font-mono text-gray-400">€ {(h.old_monthly_fee ?? 0).toFixed(2)}</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-700">€ {(h.new_monthly_fee ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Calendario Annuale Pagamenti */}
            <ClientPaymentCalendar payments={detail.payments} />

            {/* Tabella Estratto Conto Movimenti */}
            <div>
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Receipt size={14} className="text-emerald-600" /> Estratto Conto & Movimenti Portafoglio ({detail.payments.length})
              </h3>
              <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead className="bg-gray-100 text-gray-500 uppercase text-[11px] sticky top-0">
                    <tr>
                      <th className="p-2.5">Tipo Movimento</th>
                      <th className="p-2.5">Importo</th>
                      <th className="p-2.5">Data Scadenza</th>
                      <th className="p-2.5">Data Incasso</th>
                      <th className="p-2.5">Stato Movimento</th>
                      <th className="p-2.5 text-right">Azione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.payments.length === 0 ? (
                      <tr><td colSpan={6} className="p-4 text-center text-gray-400">Nessun movimento o addebito presente in archivio.</td></tr>
                    ) : (
                      detail.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-2.5 font-semibold text-gray-800">
                            {p.payment_type === 'RECURRING' && 'Canone Ricorrente'}
                            {p.payment_type === 'INSTALLATION' && 'Costo Installazione Una-Tantum'}
                            {p.payment_type === 'EXTRA' && 'Intervento Tecnico Extra'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-gray-900">€ {p.amount.toFixed(2)}</td>
                          <td className="p-2.5 font-mono text-gray-500">{p.due_date}</td>
                          <td className="p-2.5 font-mono text-emerald-700">{p.payment_date || '—'}</td>
                          <td className="p-2.5">
                            {p.status === 'PAID' && (
                              <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                                <CheckCircle2 size={11} /> Saldato / Incassato
                              </span>
                            )}
                            {p.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                                <Clock size={11} /> In Attesa di Saldare
                              </span>
                            )}
                            {p.status === 'OVERDUE' && (
                              <span className="inline-flex items-center gap-1 text-[11px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-semibold">
                                <AlertTriangle size={11} /> Scaduto / Insoluto
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right space-x-1 whitespace-nowrap">
                            {p.status === 'PAID' && (
                              <button
                                onClick={() => handleUndoPaid(p)}
                                title="Annulla Saldo (torna In Attesa)"
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded cursor-pointer inline-flex"
                              >
                                <Undo2 size={12} />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditModal(p)}
                              title="Modifica (correggi importo/scadenza/tipo)"
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-blue-600 border border-gray-200 rounded cursor-pointer inline-flex"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeletePayment(p)}
                              title="Elimina pagamento"
                              className="p-1.5 bg-gray-100 hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-300 rounded cursor-pointer inline-flex"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Provvigioni Collegate */}
            {detail.commissions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-cyan-600" /> Provvigioni Collaboratori Generate ({detail.commissions.length})
                </h3>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead className="bg-gray-100 text-gray-500 uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">Collaboratore</th>
                        <th className="p-2.5">Importo Spettante</th>
                        <th className="p-2.5">Data Generazione</th>
                        <th className="p-2.5">Stato Liquidazione</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.commissions.map((c) => (
                        <tr key={c.id}>
                          <td className="p-2.5 font-semibold text-gray-800">{c.collaborator_name}</td>
                          <td className="p-2.5 font-mono font-bold text-cyan-700">€ {c.amount.toFixed(2)}</td>
                          <td className="p-2.5 font-mono text-gray-400">{c.created_at}</td>
                          <td className="p-2.5">
                            {c.payout_status === 'PAID' ? (
                              <span className="text-emerald-700 font-semibold">Liquidata</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">In Attesa</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-gray-200 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">Correggi Pagamento</h3>
            <p className="text-xs text-gray-500">Correggi un errore di registrazione: importo, scadenza o tipologia. Non tocca lo stato del pagamento.</p>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Tipologia Pagamento</label>
              <select
                value={editModal.payment_type}
                onChange={(e) => setEditModal({ ...editModal, payment_type: e.target.value as PaymentType })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-gray-900 text-sm"
              >
                <option value="RECURRING">Canone Ricorrente</option>
                <option value="INSTALLATION">Costo Installazione Una-Tantum</option>
                <option value="EXTRA">Intervento Tecnico Extra</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Importo (€)</label>
              <input
                type="number"
                step="0.01"
                value={editModal.amount}
                onChange={(e) => setEditModal({ ...editModal, amount: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-emerald-700 font-mono font-bold text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Data Scadenza</label>
              <input
                type="date"
                value={editModal.due_date}
                onChange={(e) => setEditModal({ ...editModal, due_date: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-gray-900 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditModal(null)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer text-xs">
                Annulla
              </button>
              <button type="button" onClick={handleConfirmEdit} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer text-xs">
                Salva Correzione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
