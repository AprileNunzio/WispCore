import React, { useMemo } from 'react';
import type { Client, Collaborator, Commission } from '../types';
import { X, Phone, Mail, Wallet, CheckCircle2, Clock, UserRound, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface Props {
  collaborator: Collaborator;
  commissions: Commission[]; // già filtrate per questo collaboratore
  clients: Client[]; // tutti i clienti (viene filtrato qui dentro per collaborator_id)
  onClose: () => void;
  onToggleStatus: (commissionId: number, currentStatus: string) => void;
}

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** Vista a 360° di un collaboratore: entrate totali, andamento mensile, clienti assegnati e storico completo delle provvigioni. */
export const CollaboratorDetailModal: React.FC<Props> = ({ collaborator, commissions, clients, onClose, onToggleStatus }) => {
  const assignedClients = useMemo(
    () => clients.filter((c) => c.collaborator_id === collaborator.id),
    [clients, collaborator.id]
  );

  const totalEarned = commissions.reduce((a, b) => a + b.amount, 0);
  const paidAmount = commissions.filter((c) => c.payout_status === 'PAID').reduce((a, b) => a + b.amount, 0);
  const pendingAmount = commissions.filter((c) => c.payout_status === 'PENDING').reduce((a, b) => a + b.amount, 0);
  const avgPerClient = assignedClients.length ? totalEarned / assignedClients.length : 0;

  // Ultimi 12 mesi di andamento, calcolati client-side dallo storico già in memoria (nessuna chiamata IPC aggiuntiva).
  const monthlyTrend = useMemo(() => {
    const today = new Date();
    const buckets: { key: string; label: string; amount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      buckets.push({ key, label: MONTH_LABELS[d.getMonth()], amount: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const c of commissions) {
      const key = (c.created_at || '').slice(0, 7);
      const bucket = byKey.get(key);
      if (bucket) bucket.amount += c.amount;
    }
    return buckets;
  }, [commissions]);

  const sortedCommissions = useMemo(
    () => [...commissions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [commissions]
  );

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200 flex items-center justify-center font-bold text-xs shrink-0">
              {collaborator.first_name[0]}{collaborator.last_name[0]}
            </div>
            {collaborator.first_name} {collaborator.last_name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={20} /></button>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1.5"><Phone size={13} className="text-gray-400" /> {collaborator.phone || 'Telefono non fornito'}</span>
            <span className="flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> {collaborator.email || 'Email non fornita'}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-200">
              <span className="text-[11px] text-cyan-700 uppercase block font-semibold">Guadagno Totale</span>
              <span className="font-mono font-bold text-cyan-700 text-lg">€ {totalEarned.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[11px] text-emerald-700 uppercase block font-semibold">Liquidato</span>
              <span className="font-mono font-bold text-emerald-700 text-lg">€ {paidAmount.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-[11px] text-amber-700 uppercase block font-semibold">Da Liquidare</span>
              <span className="font-mono font-bold text-amber-700 text-lg">€ {pendingAmount.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <span className="text-[11px] text-gray-500 uppercase block font-semibold">Media / Cliente</span>
              <span className="font-mono font-bold text-gray-900 text-lg">€ {avgPerClient.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><BarChart3 size={15} className="text-cyan-600" /> Andamento Provvigioni (ultimi 12 mesi)</h3>
            <div className="h-[160px] w-full bg-gray-50 rounded-xl border border-gray-200 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `€${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '0.75rem', color: '#111827', fontSize: '12px' }}
                    formatter={(v) => [`€ ${Number(v).toFixed(2)}`, 'Provvigioni']}
                  />
                  <Bar dataKey="amount" fill="#0891b2" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><UserRound size={15} className="text-cyan-600" /> Clienti Assegnati ({assignedClients.length})</h3>
            {assignedClients.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nessun cliente assegnato al momento.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {assignedClients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-gray-700 truncate">{client.first_name} {client.last_name}</span>
                    <span className="font-mono font-bold text-cyan-700 shrink-0 ml-2">€ {(client.collaborator_commission_fee ?? 0).toFixed(2)}/mese</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Wallet size={15} className="text-cyan-600" /> Storico Completo Provvigioni ({sortedCommissions.length})</h3>
            <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-gray-500 uppercase text-xs sticky top-0">
                  <tr>
                    <th className="p-2.5">Cliente</th>
                    <th className="p-2.5">Importo</th>
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5">Stato</th>
                    <th className="p-2.5 text-right">Azione</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedCommissions.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-gray-400">Nessuna provvigione generata per questo collaboratore.</td></tr>
                  ) : (
                    sortedCommissions.map((c) => (
                      <tr key={c.id}>
                        <td className="p-2.5">{c.client_name}</td>
                        <td className="p-2.5 font-mono font-bold text-cyan-700">€ {c.amount.toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-gray-400">{c.created_at}</td>
                        <td className="p-2.5">
                          {c.payout_status === 'PAID' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} /> Liquidata</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Clock size={12} /> In Attesa</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => onToggleStatus(c.id, c.payout_status)}
                            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer text-[11px] transition-colors ${
                              c.payout_status === 'PAID'
                                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            {c.payout_status === 'PAID' ? 'Segna In Attesa' : 'Segna Liquidata'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
