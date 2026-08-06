import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../dbService';
import type { Client, Payment, Commission, MonthlyAnalyticsPoint, TopClient, CommissionByCollaborator } from '../types';
import { BILLING_CYCLE_INFO } from '../types';
import { computeBadPayersList } from '../financialEngine';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Wallet,
  Search,
  Clock,
  ArrowUpRight,
  Zap,
  Activity,
  Terminal,
  ChevronDown,
  ChevronUp,
  Trophy,
  Award,
  UserPlus,
  ArrowUp,
  ArrowDown,
  UsersRound,
  ShieldCheck,
  ShieldAlert,
  Hourglass
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';

interface Props {
  onNavigateToClients: (searchQuery?: string) => void;
}

type MetricKey = 'mrr' | 'revenue' | 'overdue' | 'commissions';
type Period = 3 | 6 | 12 | 24 | 36;

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 3, label: '3m' },
  { value: 6, label: '6m' },
  { value: 12, label: '12m' },
  { value: 24, label: '24m' },
  { value: 36, label: '36m' },
];

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** % di variazione tra due totali di periodo. null quando manca una base di confronto (periodo precedente a zero). */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

const DeltaBadge: React.FC<{ pct: number | null; goodWhenUp?: boolean }> = ({ pct, goodWhenUp = true }) => {
  if (pct === null) return <span className="text-[11px] text-gray-400">vs periodo prec.: N/D</span>;
  const isUp = pct >= 0;
  const isGood = isUp === goodWhenUp;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}>
      {isUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />} {Math.abs(pct).toFixed(1)}% vs periodo prec.
    </span>
  );
};

export const DashboardView: React.FC<Props> = ({ onNavigateToClients }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [quickSearch, setQuickSearch] = useState('');
  const [monthly, setMonthly] = useState<MonthlyAnalyticsPoint[]>([]);
  const [previousMonthly, setPreviousMonthly] = useState<MonthlyAnalyticsPoint[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [byCollaborator, setByCollaborator] = useState<CommissionByCollaborator[]>([]);
  const [period, setPeriod] = useState<Period>(12);
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    // Chiediamo il doppio del periodo selezionato: la seconda metà è il
    // periodo corrente mostrato nei grafici, la prima metà serve solo come
    // base di confronto per le variazioni % (badge "vs periodo precedente").
    const [c, p, comm, fullSeries, top, byColl] = await Promise.all([
      dbService.getClients(),
      dbService.getPayments(),
      dbService.getCommissions(),
      dbService.getMonthlyAnalytics(period * 2),
      dbService.getTopClients(5),
      dbService.getCommissionsByCollaborator(),
    ]);
    setClients(c);
    setPayments(p);
    setCommissions(comm);
    setPreviousMonthly(fullSeries.slice(0, period));
    setMonthly(fullSeries.slice(period));
    setTopClients(top);
    setByCollaborator(byColl);
  };

  // MRR = canone normalizzato al mese in base al ciclo di fatturazione reale
  // (un cliente che paga 300€ ogni 6 mesi vale 50€/mese di MRR, non 300€) e
  // solo sui clienti ACTIVE: sospesi/disdetti non generano incasso ricorrente.
  const mrr = clients
    .filter((c) => c.status === 'ACTIVE')
    .reduce((acc, c) => acc + (Number(c.monthly_fee) || 0) / (BILLING_CYCLE_INFO[c.billing_cycle]?.months || 1), 0);
  const totalRevenue = payments
    .filter(p => p.status === 'PAID')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const pendingPayments = payments.filter(p => p.status === 'PENDING' || p.status === 'OVERDUE');
  const overdueCount = payments.filter(p => p.status === 'OVERDUE').length;
  const totalOverdueAmount = payments.filter(p => p.status === 'OVERDUE').reduce((a, b) => a + b.amount, 0);

  const pendingCommissions = commissions
    .filter(c => c.payout_status === 'PENDING')
    .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const totalCommissions = commissions.reduce((a, b) => a + b.amount, 0);
  // Incasso netto: quanto resta in azienda dopo le provvigioni ai
  // collaboratori (es. cliente 20€/mese, 5€ al collaboratore -> 15€ netti).
  const netRevenue = totalRevenue - totalCommissions;

  // Stato clienti: riusa lo stesso algoritmo di affidabilità del Modulo
  // Finanziario (Cattivi Pagatori) per una vista rapida in Dashboard, senza
  // dover aprire quella sezione per sapere "quanti clienti sono in regola".
  const reliability = useMemo(() => computeBadPayersList(clients, payments), [clients, payments]);
  const totalClients = clients.length;
  const puntualiCount = reliability.filter((r) => r.currentOverdueCount === 0).length;
  const ritardatariCount = totalClients - puntualiCount;
  const puntualiPct = totalClients ? Math.round((puntualiCount / totalClients) * 100) : 0;
  const ritardatariPct = totalClients ? 100 - puntualiPct : 0;
  const clientsAwaitingPayment = new Set(payments.filter((p) => p.status === 'PENDING').map((p) => p.client_id)).size;

  const searchResults = quickSearch.trim()
    ? clients.filter(c =>
        (c.assigned_ip && c.assigned_ip.includes(quickSearch.trim())) ||
        (c.mac_address && c.mac_address.toLowerCase().includes(quickSearch.trim().toLowerCase())) ||
        (c.pppoe_username && c.pppoe_username.toLowerCase().includes(quickSearch.trim().toLowerCase())) ||
        (`${c.first_name} ${c.last_name}`).toLowerCase().includes(quickSearch.trim().toLowerCase())
      )
    : [];

  const chartData = useMemo(() => monthly.map((m) => {
    const [, monthNum] = m.month.split('-');
    return { ...m, label: MONTH_LABELS[Number(monthNum) - 1] || m.month };
  }), [monthly]);

  const avgMonthlyRevenue = chartData.length ? chartData.reduce((a, b) => a + b.revenue, 0) / chartData.length : 0;
  const totalNewClients = chartData.reduce((a, b) => a + b.newClients, 0);
  const growthPct = chartData.length >= 2 && chartData[0].revenue > 0
    ? (((chartData[chartData.length - 1].revenue - chartData[0].revenue) / chartData[0].revenue) * 100)
    : 0;

  // Totali del periodo selezionato vs il periodo immediatamente precedente
  // (stessa durata), per i badge "vs periodo precedente" sulle card in alto.
  const periodTotals = useMemo(() => chartData.reduce((acc, m) => ({
    revenue: acc.revenue + m.revenue,
    newClients: acc.newClients + m.newClients,
    overdue: acc.overdue + m.overdue,
    commissions: acc.commissions + m.commissions,
  }), { revenue: 0, newClients: 0, overdue: 0, commissions: 0 }), [chartData]);

  const previousPeriodTotals = useMemo(() => previousMonthly.reduce((acc, m) => ({
    revenue: acc.revenue + m.revenue,
    newClients: acc.newClients + m.newClients,
    overdue: acc.overdue + m.overdue,
    commissions: acc.commissions + m.commissions,
  }), { revenue: 0, newClients: 0, overdue: 0, commissions: 0 }), [previousMonthly]);

  const revenueDeltaPct = pctChange(periodTotals.revenue, previousPeriodTotals.revenue);
  const overdueDeltaPct = pctChange(periodTotals.overdue, previousPeriodTotals.overdue);
  const commissionsDeltaPct = pctChange(periodTotals.commissions, previousPeriodTotals.commissions);
  const newClientsDeltaPct = pctChange(periodTotals.newClients, previousPeriodTotals.newClients);

  const toggleMetric = (key: MetricKey) => setExpandedMetric((cur) => (cur === key ? null : key));

  return (
    <div className="space-y-6 pb-12">
      <div className="relative z-30 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>Dashboard Operativa WISP</span>
            <span className="text-sm font-mono px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full flex items-center gap-1">
              <Activity size={12} className="animate-pulse" /> Live Status
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Controllo in tempo reale di clienti, infrastruttura WISP e flussi finanziari</p>
        </div>

        <div className="relative min-w-[320px] max-w-lg">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 text-cyan-600" size={18} />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Scheda Rapida: Cerca IP (es. 10.100...), MAC o PPPoE"
              className="w-full bg-white border border-cyan-300 rounded-xl py-2.5 pl-11 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono shadow-sm"
            />
          </div>

          {quickSearch.trim() !== '' && (
            <div className="absolute left-0 right-0 top-12 bg-white border border-cyan-200 rounded-xl shadow-2xl p-3 z-50 max-h-80 overflow-y-auto backdrop-blur-xl">
              <div className="text-xs uppercase tracking-wider text-cyan-700 font-semibold mb-2 px-2 flex justify-between">
                <span>Risultati Tecnici Istantanei ({searchResults.length})</span>
                <span>Premere per Dettaglio</span>
              </div>
              {searchResults.length === 0 ? (
                <div className="text-gray-400 text-sm py-3 text-center">Nessun cliente trovato con questi parametri</div>
              ) : (
                searchResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => onNavigateToClients(c.assigned_ip || c.first_name)}
                    className="p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{c.first_name} {c.last_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-cyan-700">IP: {c.assigned_ip || 'N/D'}</span>
                        <span>•</span>
                        <span className="font-mono text-gray-500">MAC: {c.mac_address || 'N/D'}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-mono">
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

      {/* Period selector for the "nerd" drill-down */}
      <div className="flex items-center gap-2 text-xs">
        <Terminal size={14} className="text-gray-400" />
        <span className="text-gray-400 font-mono">analytics --range</span>
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-2.5 py-1 rounded-md font-mono cursor-pointer transition-colors ${period === p.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <span className="text-gray-400">confronto automatico con i {period} mesi precedenti</span>
      </div>

      <div className="ultra-grid">
        <div onClick={() => toggleMetric('mrr')} className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-blue-300 transition-all cursor-pointer">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Ricavo Mensile Ricorrente (MRR)</p>
              <h3 className="text-2xl font-black text-gray-900 mt-2 font-mono">€ {mrr.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span className="flex items-center gap-1"><Zap size={14} /> Base abbonamenti attiva</span>
            {expandedMetric === 'mrr' ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-400">
            <UserPlus size={12} /> {periodTotals.newClients} nuovi clienti nel periodo <DeltaBadge pct={newClientsDeltaPct} />
          </div>
        </div>

        <div onClick={() => toggleMetric('revenue')} className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-emerald-300 transition-all cursor-pointer">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Incasso Netto</p>
              <h3 className="text-2xl font-black text-gray-900 mt-2 font-mono">€ {netRevenue.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
              <Wallet size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>Lordo € {totalRevenue.toFixed(2)} − Provvigioni € {totalCommissions.toFixed(2)}</span>
            {expandedMetric === 'revenue' ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
          <div className="mt-1.5"><DeltaBadge pct={revenueDeltaPct} /></div>
        </div>

        <div onClick={() => toggleMetric('overdue')} className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-rose-300 transition-all cursor-pointer">
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
            {expandedMetric === 'overdue' ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
          <div className="mt-1.5"><DeltaBadge pct={overdueDeltaPct} goodWhenUp={false} /></div>
        </div>

        <div onClick={() => toggleMetric('commissions')} className="glass-panel p-5 rounded-2xl border border-gray-200 hover:border-amber-300 transition-all cursor-pointer">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Provvigioni Pendenti</p>
              <h3 className="text-2xl font-black text-amber-600 mt-2 font-mono">€ {pendingCommissions.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500 flex items-center justify-between">
            <span>Da liquidare ai collaboratori sul campo</span>
            {expandedMetric === 'commissions' ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
          <div className="mt-1.5"><DeltaBadge pct={commissionsDeltaPct} /></div>
        </div>
      </div>

      {/* --- Stato Clienti: vista rapida di affidabilità pagamenti --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 shrink-0"><UsersRound size={18} /></div>
          <div>
            <span className="text-[11px] text-gray-400 uppercase block">Clienti Totali</span>
            <span className="font-mono font-bold text-lg text-gray-900">{totalClients}</span>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200 shrink-0"><ShieldCheck size={18} /></div>
          <div>
            <span className="text-[11px] text-gray-400 uppercase block">Clienti Puntuali</span>
            <span className="font-mono font-bold text-lg text-emerald-700">{puntualiPct}%</span>
            <span className="text-[10px] text-gray-400"> ({puntualiCount})</span>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-200 shrink-0"><ShieldAlert size={18} /></div>
          <div>
            <span className="text-[11px] text-gray-400 uppercase block">Clienti Ritardatari</span>
            <span className="font-mono font-bold text-lg text-rose-600">{ritardatariPct}%</span>
            <span className="text-[10px] text-gray-400"> ({ritardatariCount})</span>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-gray-200 flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shrink-0"><Hourglass size={18} /></div>
          <div>
            <span className="text-[11px] text-gray-400 uppercase block">In Attesa di Pagamento</span>
            <span className="font-mono font-bold text-lg text-amber-600">{clientsAwaitingPayment}</span>
          </div>
        </div>
      </div>

      {/* --- "Nerd" drill-down panel --- */}
      {expandedMetric && (
        <div className="glass-panel rounded-2xl p-6 border border-gray-900/10 bg-gray-950 text-emerald-400 font-mono text-xs overflow-x-auto shadow-xl">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <Terminal size={14} />
            <span>$ wispcore analytics --metric={expandedMetric} --range={period}m --format=table</span>
          </div>
          {expandedMetric === 'mrr' && (
            <div className="space-y-1">
              <p>MRR_CORRENTE ................ € {mrr.toFixed(2)}</p>
              <p>CLIENTI_ATTIVI ............... {clients.length}</p>
              <p>ARPU (medio per cliente) ..... € {(clients.length ? mrr / clients.length : 0).toFixed(2)}</p>
              <p>ARR_PROIETTATO (x12) ......... € {(mrr * 12).toFixed(2)}</p>
            </div>
          )}
          {expandedMetric === 'revenue' && (
            <div className="space-y-1">
              <p>INCASSO_TOTALE ............... € {totalRevenue.toFixed(2)}</p>
              <p>MEDIA_MENSILE ({period}m) ....... € {avgMonthlyRevenue.toFixed(2)}</p>
              <p>CRESCITA_PERIODO ............. {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(1)}%</p>
              <p>NUOVI_CLIENTI ({period}m) ....... {totalNewClients}</p>
            </div>
          )}
          {expandedMetric === 'overdue' && (
            <div className="space-y-1">
              <p>PAGAMENTI_INSOLUTI ........... {overdueCount}</p>
              <p>IMPORTO_INSOLUTO_TOTALE ....... € {totalOverdueAmount.toFixed(2)}</p>
              <p>TASSO_INSOLUTI ................ {payments.length ? ((overdueCount / payments.length) * 100).toFixed(1) : '0.0'}%</p>
            </div>
          )}
          {expandedMetric === 'commissions' && (
            <div className="space-y-1">
              <p>PROVVIGIONI_TOTALI ............ € {totalCommissions.toFixed(2)}</p>
              <p>PROVVIGIONI_PENDENTI .......... € {pendingCommissions.toFixed(2)}</p>
              <p>COLLABORATORI_ATTIVI .......... {byCollaborator.length}</p>
            </div>
          )}
          <div className="mt-4 h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '11px' }} />
                <Bar dataKey={expandedMetric === 'overdue' ? 'overdue' : expandedMetric === 'commissions' ? 'commissions' : 'revenue'} fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Andamento Entrate Reali</h3>
              <p className="text-gray-500 text-sm">Fatturato mensile calcolato dai pagamenti effettivi ({period} mesi)</p>
            </div>
            <span className="text-xs text-cyan-700 bg-cyan-50 px-3 py-1 rounded-full border border-cyan-200 font-mono">
              Dati reali dal DB
            </span>
          </div>

          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorEntrate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '0.75rem', color: '#111827', fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorEntrate)" />
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
                <div className="text-center text-gray-400 text-sm py-8">Tutti i pagamenti risultano in regola</div>
              ) : (
                pendingPayments.map(p => {
                  const isOverdue = p.status === 'OVERDUE';
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-sm transition-all ${
                        isOverdue
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-gray-900">{p.client_name}</div>
                        <div className="text-xs opacity-80 mt-0.5">
                          Scadenza: <span className="font-mono">{p.due_date}</span> ({p.payment_type})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-sm">€ {p.amount.toFixed(2)}</div>
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold ${
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
            className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm py-2.5 rounded-xl border border-gray-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>Gestisci Pagamenti & Clienti</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /> Nuovi Clienti Acquisiti per Mese</h3>
              <p className="text-gray-500 text-sm">Crescita della base clienti nel periodo selezionato ({period} mesi)</p>
            </div>
            <DeltaBadge pct={newClientsDeltaPct} />
          </div>
          <div className="h-[220px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '0.75rem', color: '#111827', fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="newClients" name="Nuovi Clienti" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-gray-200 space-y-3">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><Activity size={18} className="text-cyan-600" /> Riepilogo Periodo ({period} mesi)</h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-gray-500">Incasso periodo (lordo)</span>
              <span className="font-mono font-bold text-gray-700">€ {periodTotals.revenue.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-emerald-700 font-semibold">Incasso periodo (netto)</span>
              <span className="font-mono font-bold text-emerald-700">€ {(periodTotals.revenue - periodTotals.commissions).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-gray-500">Media mensile</span>
              <span className="font-mono font-bold text-gray-900">€ {avgMonthlyRevenue.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-gray-500">Nuovi clienti</span>
              <span className="font-mono font-bold text-blue-700">{periodTotals.newClients}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-gray-500">Provvigioni generate</span>
              <span className="font-mono font-bold text-cyan-700">€ {periodTotals.commissions.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-gray-500">Insoluti nel periodo</span>
              <span className="font-mono font-bold text-rose-600">€ {periodTotals.overdue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 border border-gray-200">
          <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Trophy size={18} className="text-amber-600" /> Top 5 Clienti per Fatturato</h3>
          <div className="space-y-2">
            {topClients.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessun dato ancora disponibile.</p>
            ) : (
              topClients.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800">{c.first_name} {c.last_name}</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 text-sm">€ {c.total_paid.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-gray-200">
          <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Award size={18} className="text-cyan-600" /> Provvigioni per Collaboratore</h3>
          <div className="space-y-2">
            {byCollaborator.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessun collaboratore registrato.</p>
            ) : (
              byCollaborator.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50">
                  <span className="text-sm font-medium text-gray-800">{c.first_name} {c.last_name}</span>
                  <div className="text-right">
                    <span className="font-mono font-bold text-cyan-700 text-sm">€ {c.total_amount.toFixed(2)}</span>
                    {c.pending_amount > 0 && <span className="block text-[11px] text-amber-600">€ {c.pending_amount.toFixed(2)} da liquidare</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
