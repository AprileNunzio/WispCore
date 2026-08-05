import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import type { ClientDetail } from '../types';
import { X, Wallet, AlertTriangle, CheckCircle2, Clock, Wifi, Network, Radio, User } from 'lucide-react';

interface Props {
  clientId: number;
  onClose: () => void;
}

export const ClientDetailModal: React.FC<Props> = ({ clientId, onClose }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    dbService.getClientDetail(clientId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [clientId]);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <User className="text-blue-600" size={20} />
            {loading ? 'Caricamento...' : `${detail?.client.first_name} ${detail?.client.last_name}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={20} /></button>
        </div>

        {loading || !detail ? (
          <div className="text-center text-gray-400 py-12 text-sm">Caricamento scheda cliente...</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[11px] text-emerald-700 uppercase block font-semibold">Totale Pagato</span>
                <span className="font-mono font-bold text-emerald-700 text-lg">€ {detail.stats.totalPaid.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                <span className="text-[11px] text-rose-700 uppercase block font-semibold">Insoluti</span>
                <span className="font-mono font-bold text-rose-700 text-lg">€ {detail.stats.totalOverdue.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-[11px] text-gray-500 uppercase block font-semibold">N. Pagamenti</span>
                <span className="font-mono font-bold text-gray-900 text-lg">{detail.stats.paymentsCount}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-[11px] text-amber-700 uppercase block font-semibold">Ritardi</span>
                <span className="font-mono font-bold text-amber-700 text-lg">{detail.stats.overdueCount}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1"><Wifi size={12} className="text-cyan-600" /> PPPoE</div>
                <div className="text-cyan-700 font-mono">{detail.client.pppoe_username || 'N/D'}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1"><Network size={12} className="text-blue-600" /> IP Assegnato</div>
                <div className="text-blue-700 font-mono">{detail.client.assigned_ip || 'N/D'}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1"><Radio size={12} className="text-emerald-600" /> Dispositivo</div>
                <div className="text-gray-700">{detail.client.device_model || 'N/D'}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1"><Wallet size={12} className="text-amber-600" /> Piano / Collaboratore</div>
                <div className="text-gray-700">{detail.client.plan_name || 'Nessun piano'} • {detail.client.collaborator_name}</div>
              </div>
              {(detail.client.last_payment_date || detail.client.next_due_date) && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 sm:col-span-2">
                  <div className="text-[11px] text-amber-700 uppercase flex items-center gap-1 mb-1 font-semibold">Scadenze</div>
                  <div className="text-gray-700 text-sm">
                    Ultimo pagamento: <span className="font-mono">{detail.client.last_payment_date || 'N/D'}</span> • Prossima scadenza: <span className="font-mono font-bold text-amber-700">{detail.client.next_due_date || 'N/D'}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Storico Pagamenti Completo</h3>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-100 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Importo</th>
                      <th className="p-2.5">Scadenza</th>
                      <th className="p-2.5">Pagato il</th>
                      <th className="p-2.5">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.payments.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-400">Nessun pagamento registrato.</td></tr>
                    ) : (
                      detail.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="p-2.5 font-mono text-xs">{p.payment_type}</td>
                          <td className="p-2.5 font-mono font-bold text-gray-900">€ {p.amount.toFixed(2)}</td>
                          <td className="p-2.5 font-mono text-gray-400">{p.due_date}</td>
                          <td className="p-2.5 font-mono text-gray-400">{p.payment_date || '—'}</td>
                          <td className="p-2.5">
                            {p.status === 'PAID' && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} /> Saldato</span>}
                            {p.status === 'PENDING' && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Clock size={12} /> In Attesa</span>}
                            {p.status === 'OVERDUE' && <span className="inline-flex items-center gap-1 text-xs text-rose-700"><AlertTriangle size={12} /> Insoluto</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {detail.commissions.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">Provvigioni Generate per questo Cliente</h3>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-100 text-gray-500 uppercase text-xs">
                      <tr>
                        <th className="p-2.5">Collaboratore</th>
                        <th className="p-2.5">Importo</th>
                        <th className="p-2.5">Data</th>
                        <th className="p-2.5">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.commissions.map((c) => (
                        <tr key={c.id}>
                          <td className="p-2.5">{c.collaborator_name}</td>
                          <td className="p-2.5 font-mono font-bold text-cyan-700">€ {c.amount.toFixed(2)}</td>
                          <td className="p-2.5 font-mono text-gray-400">{c.created_at}</td>
                          <td className="p-2.5 text-xs">{c.payout_status === 'PAID' ? 'Liquidata' : 'In Attesa'}</td>
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
