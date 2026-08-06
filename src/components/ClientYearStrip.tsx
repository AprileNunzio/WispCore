import React from 'react';
import type { Payment } from '../types';
import { MONTH_LABELS_FULL } from '../dateUtils';

interface Props {
  payments: Payment[]; // già filtrati per il singolo cliente
  year: number;
}

/**
 * Striscia orizzontale di 12 mesi per un cliente, colorata in base al canone
 * ricorrente di quel mese: verde = saldato, rosso = insoluto/scaduto, giallo =
 * in attesa (non ancora scaduto), grigio = nessuna scadenza registrata in quel
 * mese (es. cliente non ancora attivo, disdetto, o ciclo di fatturazione non
 * mensile - trimestrale/annuale - che quindi valorizza solo alcuni mesi).
 * Il mese viene attribuito in base alla data di scadenza (due_date), la stessa
 * logica del calendario giornaliero in ClientPaymentCalendar.
 */
export const ClientYearStrip: React.FC<Props> = ({ payments, year }) => {
  const yearPrefix = String(year);

  const monthCells = MONTH_LABELS_FULL.map((label, idx) => {
    const monthKey = `${yearPrefix}-${String(idx + 1).padStart(2, '0')}`;
    const monthPayments = payments.filter((p) => p.payment_type === 'RECURRING' && p.due_date?.startsWith(monthKey));

    let colorClass = 'bg-gray-100 border-gray-200';
    let title = 'Nessuna scadenza registrata';
    if (monthPayments.length > 0) {
      const total = monthPayments.reduce((s, p) => s + p.amount, 0);
      if (monthPayments.some((p) => p.status === 'PAID')) {
        colorClass = 'bg-emerald-400 border-emerald-500';
        title = `Saldato — € ${total.toFixed(2)}`;
      } else if (monthPayments.some((p) => p.status === 'OVERDUE')) {
        colorClass = 'bg-rose-400 border-rose-500';
        title = `Insoluto — € ${total.toFixed(2)}`;
      } else {
        colorClass = 'bg-amber-300 border-amber-400';
        title = `In attesa — € ${total.toFixed(2)}`;
      }
    }
    return { label, colorClass, title };
  });

  return (
    <div className="flex items-center gap-1.5 w-full">
      {monthCells.map((m, idx) => (
        <div key={idx} className="flex-1 min-w-0 flex flex-col items-center gap-0.5" title={m.title}>
          <div className={`w-full h-4 rounded border ${m.colorClass}`} />
          <span className="text-[9px] text-gray-500 font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{m.label}</span>
        </div>
      ))}
    </div>
  );
};
