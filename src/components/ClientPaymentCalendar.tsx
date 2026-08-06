import React, { useMemo, useState } from 'react';
import type { Payment } from '../types';
import { MONTH_LABELS_FULL, localDateString } from '../dateUtils';
import { ChevronLeft, ChevronRight, CalendarDays, Flag } from 'lucide-react';

interface Props {
  payments: Payment[];
  contractStartDate?: string; // "YYYY-MM-DD": evidenzia il mese di inizio contratto, utile quando differisce dal primo canone (giorni omaggio, ecc.)
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  RECURRING: 'Canone Ricorrente',
  INSTALLATION: 'Costo Installazione',
  EXTRA: 'Intervento Tecnico Extra',
};

/**
 * Calendario SEMPRE annuale (mai giorno per giorno): 12 riquadri, uno per
 * mese, colorati in base al canone ricorrente di quel mese - stessa logica
 * della striscia usata in Gestione Anagrafica (ClientYearStrip), ma con
 * riquadri più grandi e un dettaglio a click, dato che qui c'è spazio dedicato
 * a un solo cliente. Il mese viene attribuito in base alla data di scadenza
 * (due_date) dei pagamenti RECURRING.
 */
export const ClientPaymentCalendar: React.FC<Props> = ({ payments, contractStartDate }) => {
  const [year, setYear] = useState(() => Number(localDateString().slice(0, 4)));
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 1-12

  const monthCells = useMemo(() => {
    const yearPrefix = String(year);
    return MONTH_LABELS_FULL.map((label, idx) => {
      const monthNum = idx + 1;
      const monthKey = `${yearPrefix}-${String(monthNum).padStart(2, '0')}`;
      const recurring = payments.filter((p) => p.payment_type === 'RECURRING' && p.due_date?.startsWith(monthKey));
      const allInMonth = payments.filter((p) => p.due_date?.startsWith(monthKey) || (p.payment_date || '').startsWith(monthKey));
      const isContractStartMonth = !!contractStartDate && contractStartDate.startsWith(monthKey);

      let colorClass = 'bg-gray-50 border-gray-200 text-gray-400';
      let statusLabel = 'Nessuna scadenza';
      if (recurring.length > 0) {
        const total = recurring.reduce((s, p) => s + p.amount, 0);
        if (recurring.some((p) => p.status === 'PAID')) {
          colorClass = 'bg-emerald-100 border-emerald-300 text-emerald-800';
          statusLabel = `Saldato — € ${total.toFixed(2)}`;
        } else if (recurring.some((p) => p.status === 'OVERDUE')) {
          colorClass = 'bg-rose-100 border-rose-300 text-rose-800';
          statusLabel = `Insoluto — € ${total.toFixed(2)}`;
        } else {
          colorClass = 'bg-amber-100 border-amber-300 text-amber-800';
          statusLabel = `In attesa — € ${total.toFixed(2)}`;
        }
      }
      if (isContractStartMonth) {
        statusLabel = `Inizio contratto (${contractStartDate})${statusLabel !== 'Nessuna scadenza' ? ` • ${statusLabel}` : ''}`;
      }
      return { monthNum, label, colorClass, statusLabel, payments: allInMonth, isContractStartMonth };
    });
  }, [payments, year, contractStartDate]);

  const selected = selectedMonth ? monthCells[selectedMonth - 1] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
          <CalendarDays size={14} className="text-blue-600" /> Calendario Annuale Pagamenti
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => { setYear((y) => y - 1); setSelectedMonth(null); }} className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg cursor-pointer">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-mono font-bold text-gray-700 w-12 text-center">{year}</span>
          <button onClick={() => { setYear((y) => y + 1); setSelectedMonth(null); }} className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg cursor-pointer">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 bg-white">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {monthCells.map((m) => (
            <button
              key={m.monthNum}
              onClick={() => setSelectedMonth(selectedMonth === m.monthNum ? null : m.monthNum)}
              title={m.statusLabel}
              className={`relative p-2.5 rounded-xl border text-left cursor-pointer transition-all ${m.colorClass} ${selectedMonth === m.monthNum ? 'ring-2 ring-gray-900' : ''} ${m.isContractStartMonth ? 'ring-2 ring-blue-500' : ''}`}
            >
              {m.isContractStartMonth && (
                <Flag size={11} className="absolute top-1.5 right-1.5 text-blue-600" />
              )}
              <div className="text-xs font-bold">{m.label}</div>
              <div className="text-[10px] mt-0.5 opacity-80 truncate">{m.statusLabel}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 inline-block" /> Saldato</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 inline-block" /> In attesa</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-300 inline-block" /> Insoluto</span>
          {contractStartDate && (
            <span className="flex items-center gap-1"><Flag size={11} className="text-blue-600" /> Inizio contratto</span>
          )}
        </div>

        {selected && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-700">{selected.label} {year}</p>
            {selected.payments.length === 0 ? (
              <p className="text-xs text-gray-400">Nessun movimento in questo mese.</p>
            ) : (
              selected.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-200">
                  <span className="text-gray-700">
                    {PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type} • Scad. {p.due_date}
                    {p.status === 'PAID' && p.payment_date && <span className="text-emerald-700 font-semibold"> • Pagato il {p.payment_date}</span>}
                  </span>
                  <span className="font-mono font-bold text-gray-900">€ {p.amount.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
