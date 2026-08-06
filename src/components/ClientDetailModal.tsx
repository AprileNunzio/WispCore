import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import type { ClientDetail, ClientStatus } from '../types';
import {
  X,
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
  TrendingDown,
  TrendingUp,
  Receipt
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
  onClose: () => void;
}

export const ClientDetailModal: React.FC<Props> = ({ clientId, onClose }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useToast();

  useEffect(() => {
    setLoading(true);
    dbService.getClientDetail(clientId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
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

  // Calcoli Portafoglio & Estratto Conto Cliente
  const totalPaid = detail ? detail.payments.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.amount, 0) : 0;
  const totalPending = detail ? detail.payments.filter(p => p.status === 'PENDING').reduce((acc, p) => acc + p.amount, 0) : 0;
  const totalOverdue = detail ? detail.payments.filter(p => p.status === 'OVERDUE').reduce((acc, p) => acc + p.amount, 0) : 0;
  const totalOwed = totalPending + totalOverdue;
  const isUpToDate = totalOwed === 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200 max-h-[92vh] overflow-y-auto shadow-2xl">
        
        {/* Header Modale */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-sm shrink-0">
              {detail ? `${detail.client.first_name[0]}${detail.client.last_name[0]}` : <User size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>{loading ? 'Caricamento...' : `${detail?.client.first_name} ${detail?.client.last_name}`}</span>
                {detail && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[detail.client.status]}`}>
                    {STATUS_LABELS[detail.client.status]}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 font-mono">Codice Cliente: WISP-00{clientId} • CF/PIVA: {detail?.client.tax_code || 'N/D'}</p>
            </div>
          </div>
          
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors">
            <X size={20} />
          </button>
        </div>

        {loading || !detail ? (
          <div className="text-center text-gray-400 py-16 text-sm">Caricamento scheda e portafoglio cliente...</div>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.payments.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-400">Nessun movimento o addebito presente in archivio.</td></tr>
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
      </div>
    </div>
  );
};
