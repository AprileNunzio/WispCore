import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import type { BiMetrics } from '../types';
import { BarChart3, TrendingDown, Users, DollarSign, Download, FileText, Table2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const PERIOD_OPTIONS = [3, 6, 12, 24] as const;

export const ReportBiView: React.FC = () => {
  const { notify } = useToast();
  const [months, setMonths] = useState<(typeof PERIOD_OPTIONS)[number]>(12);
  const [bi, setBi] = useState<BiMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    dbService.getBiMetrics(months).then((data) => { setBi(data); setLoading(false); });
  }, [months]);

  const chartData = (bi?.churnSeries || []).map((c) => {
    const [, m] = c.month.split('-');
    return { ...c, label: MONTH_LABELS[Number(m) - 1] || c.month };
  });

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const filePath = await dbService.generatePeriodReportPdf(months);
      if (filePath) notify(`Report PDF salvato in: ${filePath}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore nella generazione del report.', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleExportCsv = async (kind: 'clients' | 'payments' | 'commissions') => {
    setExportingCsv(kind);
    try {
      const fn = kind === 'clients' ? dbService.exportClientsCsv : kind === 'payments' ? dbService.exportPaymentsCsv : dbService.exportCommissionsCsv;
      const filePath = await fn();
      if (filePath) notify(`CSV esportato in: ${filePath}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nell'esportazione CSV.", 'error');
    } finally {
      setExportingCsv(null);
    }
  };

  if (loading || !bi) {
    return <div className="text-center text-gray-400 py-20 text-sm">Calcolo metriche in corso...</div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="text-cyan-600" size={24} />
            <span>Report & Business Intelligence</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Metriche di crescita ISP: churn rate, ARPU, LTV e saturazione della rete</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button key={p} onClick={() => setMonths(p)}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs cursor-pointer transition-colors ${months === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {p}m
            </button>
          ))}
        </div>
      </div>

      <div className="ultra-grid">
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Clienti Attivi</p>
              <h3 className="text-2xl font-black text-gray-900 mt-2 font-mono">{bi.activeCount}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200"><Users size={22} /></div>
          </div>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">ARPU</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-2 font-mono">€ {bi.arpu.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200"><DollarSign size={22} /></div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Ricavo medio mensile per cliente attivo</p>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">LTV Stimato</p>
              <h3 className="text-2xl font-black text-cyan-700 mt-2 font-mono">€ {bi.ltv.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl border border-cyan-200"><TrendingDown size={22} className="rotate-180" /></div>
          </div>
          <p className="text-xs text-gray-400 mt-3">{bi.ltvMethod}</p>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Churn Rate Medio/Mese</p>
              <h3 className="text-2xl font-black text-rose-600 mt-2 font-mono">{bi.avgMonthlyChurnPct}%</h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-200"><TrendingDown size={22} /></div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Media sugli ultimi {months} mesi</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-gray-200">
          <h3 className="text-base font-bold text-gray-900 mb-4">Andamento Churn Rate Mensile</h3>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '0.75rem', fontSize: '12px' }}
                  formatter={(v) => [`${v}%`, 'Churn Rate']}
                />
                <Line type="monotone" dataKey="churnRatePct" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-gray-200">
          <h3 className="text-base font-bold text-gray-900 mb-4">Motivazioni di Disdetta</h3>
          {bi.cancellationReasons.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nessuna disdetta registrata.</p>
          ) : (
            <div className="space-y-2">
              {bi.cancellationReasons.map((r) => (
                <div key={r.reason} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                  <span className="text-gray-700">{r.reason}</span>
                  <span className="font-mono font-bold text-gray-900">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-gray-200">
        <h3 className="text-base font-bold text-gray-900 mb-4">Saturazione Nodi di Rete (BTS/Ripetitori)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-500 uppercase text-xs tracking-wider">
              <tr><th className="p-3">Nodo</th><th className="p-3 font-mono">Clienti Attivi</th><th className="p-3 font-mono">Capacità</th><th className="p-3">Saturazione</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bi.nodeSaturation.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nessun nodo di rete configurato (vedi Copertura & Rete).</td></tr>
              ) : (
                bi.nodeSaturation.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="p-3 font-semibold text-gray-900">{n.name}</td>
                    <td className="p-3 font-mono">{n.active_clients ?? 0}</td>
                    <td className="p-3 font-mono text-gray-400">{n.max_clients || '—'}</td>
                    <td className="p-3">
                      {n.saturation_pct === null || n.saturation_pct === undefined ? (
                        <span className="text-gray-400">N/D</span>
                      ) : (
                        <span className={`font-semibold ${n.saturation_pct >= 90 ? 'text-rose-600' : n.saturation_pct >= 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{n.saturation_pct}%</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-gray-200">
        <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><FileText size={18} className="text-cyan-600" /> Esportazioni</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleGeneratePdf} disabled={generatingPdf}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50">
            <FileText size={14} /> {generatingPdf ? 'Generazione...' : `Report PDF (${months} mesi)`}
          </button>
          <button onClick={() => handleExportCsv('clients')} disabled={exportingCsv === 'clients'}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50">
            <Table2 size={14} /> Esporta Clienti CSV
          </button>
          <button onClick={() => handleExportCsv('payments')} disabled={exportingCsv === 'payments'}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50">
            <Download size={14} /> Esporta Pagamenti CSV
          </button>
          <button onClick={() => handleExportCsv('commissions')} disabled={exportingCsv === 'commissions'}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50">
            <Download size={14} /> Esporta Provvigioni CSV
          </button>
        </div>
      </div>
    </div>
  );
};
