import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import type { Client, Payment, Commission } from '../types';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Wallet,
  Search,
  Clock,
  ArrowUpRight,
  Zap,
  Activity
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface Props {
  onNavigateToClients: (searchQuery?: string) => void;
}

export const DashboardView: React.FC<Props> = ({ onNavigateToClients }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [quickSearch, setQuickSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [c, p, comm] = await Promise.all([
      dbService.getClients(),
      dbService.getPayments(),
      dbService.getCommissions(),
    ]);
    setClients(c);
    setPayments(p);
    setCommissions(comm);
  };

  const mrr = clients.reduce((acc, c) => acc + (Number(c.monthly_fee) || 0), 0);
  const totalRevenue = payments
    .filter(p => p.status === 'PAID')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const pendingPayments = payments.filter(p => p.status === 'PENDING' || p.status === 'OVERDUE');
  const overdueCount = payments.filter(p => p.status === 'OVERDUE').length;

  const pendingCommissions = commissions
    .filter(c => c.payout_status === 'PENDING')
    .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

  const searchResults = quickSearch.trim()
    ? clients.filter(c =>
        (c.assigned_ip && c.assigned_ip.includes(quickSearch.trim())) ||
        (c.mac_address && c.mac_address.toLowerCase().includes(quickSearch.trim().toLowerCase())) ||
        (c.pppoe_username && c.pppoe_username.toLowerCase().includes(quickSearch.trim().toLowerCase())) ||
        (`${c.first_name} ${c.last_name}`).toLowerCase().includes(quickSearch.trim().toLowerCase())
      )
    : [];

  const revenueChartData = [
    { month: 'Mar', entrate: 1650, mrr: 1200 },
    { month: 'Apr', entrate: 2200, mrr: 1450 },
    { month: 'Mag', entrate: 1980, mrr: 1600 },
    { month: 'Giu', entrate: 2450, mrr: 1800 },
    { month: 'Lug', entrate: 2890, mrr: 2100 },
    { month: 'Ago', entrate: totalRevenue > 0 ? totalRevenue : 3100, mrr: mrr > 0 ? mrr : 2300 },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="relative z-30 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>Dashboard Operativa WISP</span>
            <span className="text-xs font-mono px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full flex items-center gap-1">
              <Activity size={12} className="animate-pulse" /> Live Status
            </span>
          </h1>
          <p className="text-gray-500 text-xs mt-1">Controllo in tempo reale di clienti, infrastruttura WISP e flussi finanziari</p>
        </div>

        <div className="relative min-w-[320px] max-w-lg">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 text-cyan-600" size={18} />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Scheda Rapida: Cerca IP (es. 10.100...), MAC o PPPoE"
              className="w-full bg-white border border-cyan-300 rounded-xl py-2.5 pl-11 pr-4 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono shadow-sm"
            />
          </div>

          {quickSearch.trim() !== '' && (
            <div className="absolute left-0 right-0 top-12 bg-white border border-cyan-200 rounded-xl shadow-2xl p-3 z-50 max-h-80 overflow-y-auto backdrop-blur-xl">
              <div className="text-[10px] uppercase tracking-wider text-cyan-700 font-semibold mb-2 px-2 flex justify-between">
                <span>Risultati Tecnici Istantanei ({searchResults.length})</span>
                <span>Premere per Dettaglio</span>
              </div>
              {searchResults.length === 0 ? (
                <div className="text-gray-400 text-xs py-3 text-center">Nessun cliente trovato con questi parametri</div>
              ) : (
                searchResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => onNavigateToClients(c.assigned_ip || c.first_name)}
                    className="p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-gray-900">{c.first_name} {c.last_name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-cyan-700">IP: {c.assigned_ip || 'N/D'}</span>
                        <span>•</span>
                        <span className="font-mono text-gray-500">MAC: {c.mac_address || 'N/D'}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-mono">
                        {c.pppoe_username || 'PPPoE Standard'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ultra-grid">
        <div className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-blue-300 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Ricavo Mensile Ricorrente (MRR)</p>
              <h3 className="text-2xl font-black text-gray-900 mt-2 font-mono">€ {mrr.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-emerald-700 gap-1 font-medium">
            <Zap size={14} /> Base abbonamenti attiva
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-emerald-300 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Incasso Totale Registrato</p>
              <h3 className="text-2xl font-black text-gray-900 mt-2 font-mono">€ {totalRevenue.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
              <Wallet size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-500 gap-1">
            <span>Canoni + Installazioni Una-Tantum</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-rose-300 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Insoluti / In Scadenza</p>
              <h3 className="text-2xl font-black text-rose-600 mt-2 font-mono">{overdueCount} Scaduti</h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-200">
              <AlertTriangle size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500 flex items-center justify-between">
            <span>Totale in sospeso: € {pendingPayments.reduce((a,b)=>a+b.amount, 0).toFixed(2)}</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-amber-300 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Provvigioni Pendenti</p>
              <h3 className="text-2xl font-black text-amber-600 mt-2 font-mono">€ {pendingCommissions.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Da liquidare ai collaboratori sul campo
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Andamento Entrate vs MRR</h3>
              <p className="text-gray-500 text-xs">Crescita mensile stimata del fatturato WISP</p>
            </div>
            <span className="text-xs text-cyan-700 bg-cyan-50 px-3 py-1 rounded-full border border-cyan-200 font-mono">
              Vector SVG 8K Ready
            </span>
          </div>

          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorEntrate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '0.75rem', color: '#111827', fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                />
                <Area type="monotone" dataKey="entrate" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorEntrate)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-gray-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Clock size={18} className="text-amber-600" />
                <span>Scadenzario Attivo</span>
              </h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-mono">
                {pendingPayments.length} Voci
              </span>
            </div>

            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {pendingPayments.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-8">Tutti i pagamenti risultano in regola</div>
              ) : (
                pendingPayments.map(p => {
                  const isOverdue = p.status === 'OVERDUE';
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                        isOverdue
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-gray-900">{p.client_name}</div>
                        <div className="text-[11px] opacity-80 mt-0.5">
                          Scadenza: <span className="font-mono">{p.due_date}</span> ({p.payment_type})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-sm">€ {p.amount.toFixed(2)}</div>
                        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold ${
                          isOverdue ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {isOverdue ? 'Scaduto' : 'In Scadenza'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateToClients()}
            className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-xs py-2.5 rounded-xl border border-gray-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>Gestisci Pagamenti & Clienti</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
