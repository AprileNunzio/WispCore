import React, { useState, useMemo } from 'react';
import type { Client, Payment } from '../types';
import { computeBadPayersList } from '../financialEngine';
import type { BadPayerClientInfo, RiskClass } from '../financialEngine';
import { AlertTriangle, ShieldAlert, ShieldCheck, Search, Clock, ExternalLink } from 'lucide-react';

interface Props {
  clients: Client[];
  payments: Payment[];
  onSelectClient?: (client: Client) => void;
}

export const BadPayersView: React.FC<Props> = ({ clients, payments, onSelectClient }) => {
  const [filterClass, setFilterClass] = useState<'ALL' | RiskClass>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadPayer, setSelectedBadPayer] = useState<BadPayerClientInfo | null>(null);

  const badPayersList = useMemo(() => computeBadPayersList(clients, payments), [clients, payments]);

  const filteredList = useMemo(() => {
    return badPayersList.filter((item) => {
      if (filterClass !== 'ALL' && item.riskClass !== filterClass) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullName = `${item.client.first_name} ${item.client.last_name}`.toLowerCase();
        const ip = (item.client.assigned_ip || '').toLowerCase();
        const pppoe = (item.client.pppoe_username || '').toLowerCase();
        return fullName.includes(q) || ip.includes(q) || pppoe.includes(q);
      }
      return true;
    });
  }, [badPayersList, filterClass, searchQuery]);

  const badPayerCount = badPayersList.filter(i => i.riskClass === 'BAD_PAYER').length;
  const riskyCount = badPayersList.filter(i => i.riskClass === 'RISKY').length;
  const totalOverdueSum = badPayersList.reduce((sum, item) => sum + item.overduePayments.reduce((a, b) => a + b.amount, 0), 0);
  const avgDelayGlobal = useMemo(() => {
    const withDelays = badPayersList.filter(i => i.latePaymentsCount > 0);
    if (!withDelays.length) return 0;
    return (withDelays.reduce((a, b) => a + b.avgDaysLate, 0) / withDelays.length).toFixed(1);
  }, [badPayersList]);

  return (
    <div className="space-y-6">
      {/* Cards di riepilogo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-rose-200 bg-rose-50/40">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider block">Cattivi Pagatori Attivi</span>
              <h3 className="text-2xl font-black text-rose-700 mt-1 font-mono">{badPayerCount}</h3>
            </div>
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl"><ShieldAlert size={20} /></div>
          </div>
          <span className="text-xs text-rose-600 mt-2 block">Punteggio affidabilità &lt; 50 o insoluti multipli</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-amber-200 bg-amber-50/40">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">Clienti a Rischio</span>
              <h3 className="text-2xl font-black text-amber-700 mt-1 font-mono">{riskyCount}</h3>
            </div>
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl"><AlertTriangle size={20} /></div>
          </div>
          <span className="text-xs text-amber-600 mt-2 block">Punteggio tra 50 e 69 / 1 insoluto aperto</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Totale Importi Insoluti</span>
              <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">€ {totalOverdueSum.toFixed(2)}</h3>
            </div>
            <div className="p-2.5 bg-gray-100 text-gray-700 rounded-xl"><Clock size={20} /></div>
          </div>
          <span className="text-xs text-gray-400 mt-2 block">Somma scadenze attualmente in OVERDUE</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Ritardo Medio Globale</span>
              <h3 className="text-2xl font-black text-gray-900 mt-1 font-mono">{avgDelayGlobal} <span className="text-sm font-normal">giorni</span></h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl"><ShieldCheck size={20} /></div>
          </div>
          <span className="text-xs text-gray-400 mt-2 block">Tempo medio di saldo rispetto alla scadenza</span>
        </div>
      </div>

      {/* Bar dei Filtri e Ricerca */}
      <div className="glass-panel rounded-2xl p-5 border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca cliente per nome, IP o PPPoE..."
              className="w-full bg-white border border-gray-300 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-900 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
            <button
              onClick={() => setFilterClass('ALL')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filterClass === 'ALL' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Tutti ({badPayersList.length})
            </button>
            <button
              onClick={() => setFilterClass('BAD_PAYER')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filterClass === 'BAD_PAYER' ? 'bg-rose-600 text-white shadow' : 'text-rose-700 hover:bg-rose-50'}`}
            >
              🔴 Cattivi Pagatori ({badPayerCount})
            </button>
            <button
              onClick={() => setFilterClass('RISKY')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filterClass === 'RISKY' ? 'bg-amber-600 text-white shadow' : 'text-amber-700 hover:bg-amber-50'}`}
            >
              🟠 A Rischio ({riskyCount})
            </button>
            <button
              onClick={() => setFilterClass('MODERATE')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filterClass === 'MODERATE' ? 'bg-yellow-500 text-white shadow' : 'text-yellow-700 hover:bg-yellow-50'}`}
            >
              🟡 Moderati
            </button>
            <button
              onClick={() => setFilterClass('EXCELLENT')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filterClass === 'EXCELLENT' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              🟢 Virtuosi
            </button>
          </div>
        </div>

        {/* Tabella Clienti Bad Payers */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-500 uppercase text-xs tracking-wider">
              <tr>
                <th className="p-3">Cliente</th>
                <th className="p-3">Punteggio Affidabilità</th>
                <th className="p-3">Grado Rischio</th>
                <th className="p-3">Insoluti Attivi</th>
                <th className="p-3">Ritardo Medio</th>
                <th className="p-3">Max Singolo Ritardo</th>
                <th className="p-3 text-right">Dettaglio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">Nessun cliente corrisponde al filtro o ai criteri impostati.</td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const sumOverdue = item.overduePayments.reduce((a, b) => a + b.amount, 0);
                  return (
                    <tr key={item.client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-gray-900">{item.client.first_name} {item.client.last_name}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {item.client.assigned_ip || 'No IP'} • {item.client.phone || 'No telefono'}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${
                                item.score >= 90 ? 'bg-emerald-500' :
                                item.score >= 70 ? 'bg-yellow-500' :
                                item.score >= 50 ? 'bg-amber-500' : 'bg-rose-600'
                              }`}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-sm text-gray-900">{item.score}/100</span>
                        </div>
                      </td>

                      <td className="p-3">
                        {item.riskClass === 'BAD_PAYER' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full font-semibold">
                            🔴 Cattivo Pagatore
                          </span>
                        )}
                        {item.riskClass === 'RISKY' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
                            🟠 A Rischio
                          </span>
                        )}
                        {item.riskClass === 'MODERATE' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 px-2.5 py-0.5 rounded-full font-semibold">
                            🟡 Moderato
                          </span>
                        )}
                        {item.riskClass === 'EXCELLENT' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                            🟢 Puntuale
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-mono">
                        {item.currentOverdueCount > 0 ? (
                          <span className="text-rose-600 font-bold">
                            {item.currentOverdueCount} (€ {sumOverdue.toFixed(2)})
                          </span>
                        ) : (
                          <span className="text-gray-400">Nessuno</span>
                        )}
                      </td>

                      <td className="p-3 font-mono">
                        {item.avgDaysLate > 0 ? (
                          <span className={item.avgDaysLate > 10 ? 'text-rose-600 font-bold' : 'text-gray-700'}>
                            {item.avgDaysLate} giorni
                          </span>
                        ) : (
                          <span className="text-emerald-600">0 giorni (In orario)</span>
                        )}
                      </td>

                      <td className="p-3 font-mono text-gray-500">
                        {item.maxSingleDelayDays > 0 ? `${item.maxSingleDelayDays}g max` : '—'}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => setSelectedBadPayer(item)}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium cursor-pointer text-xs inline-flex items-center gap-1"
                        >
                          <ExternalLink size={13} /> Dettagli
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dettaglio Scheda Cattivo Pagatore */}
      {selectedBadPayer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 border border-gray-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Analisi Affidabilità: {selectedBadPayer.client.first_name} {selectedBadPayer.client.last_name}
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  IP: {selectedBadPayer.client.assigned_ip || 'N/D'} • Tel: {selectedBadPayer.client.phone || 'N/D'}
                </p>
              </div>
              <span className="text-xl font-black font-mono px-3 py-1 bg-gray-100 rounded-xl text-gray-900">
                {selectedBadPayer.score}/100
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Classificazione</span>
                <span className="font-bold text-sm text-gray-900">{selectedBadPayer.riskLabel}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Ritardo Medio Storico</span>
                <span className="font-bold text-sm text-gray-900">{selectedBadPayer.avgDaysLate} giorni</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Insoluti Attivi</span>
                <span className="font-bold text-sm text-rose-600">{selectedBadPayer.currentOverdueCount} voci</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Max Ritardo Registrato</span>
                <span className="font-bold text-sm text-gray-900">{selectedBadPayer.maxSingleDelayDays} giorni</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Voci Insolute o Scadute</h4>
              {selectedBadPayer.overduePayments.length === 0 ? (
                <div className="text-xs text-gray-400 p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                  Nessun insoluto pendente al momento. I ritardi passati riguardavano pagamenti storici poi saldati.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedBadPayer.overduePayments.map(p => (
                    <div key={p.id} className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-rose-900">Scadenza: {p.due_date} ({p.payment_type})</div>
                        <div className="text-rose-700">Stato: Scaduto / Insoluto</div>
                      </div>
                      <div className="font-mono font-bold text-sm text-rose-800">
                        € {p.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              {onSelectClient && (
                <button
                  onClick={() => {
                    const cl = selectedBadPayer.client;
                    setSelectedBadPayer(null);
                    onSelectClient(cl);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Apri Anagrafica Cliente
                </button>
              )}
              <button
                onClick={() => setSelectedBadPayer(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
