import React, { useMemo, useState } from 'react';
import type { Payment } from '../types';
import { MONTH_LABELS, localDateString } from '../dateUtils';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

interface Props {
  payments: Payment[];
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/**
 * Tutta l'aritmetica del calendario lavora su interi (anno/mese/giorno), mai
 * su oggetti Date nel fuso orario locale del sistema: le date di WispCore
 * sono già stringhe "YYYY-MM-DD" nel calendario di Roma (vedi dateUtils.ts),
 * quindi basta usare Date.UTC() per calcolare giorni-nel-mese e giorno della
 * settimana senza rischiare lo spostamento di un giorno dei fusi avanti su UTC.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOfFirst(year: number, month: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Dom..6=Sab
  return (jsDay + 6) % 7; // 0=Lun..6=Dom
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  RECURRING: 'Canone Ricorrente',
  INSTALLATION: 'Costo Installazione',
  EXTRA: 'Intervento Tecnico Extra',
};

/**
 * Calendario mensile del singolo cliente, colorato a colpo d'occhio in base
 * ai pagamenti: verde = incassato quel giorno, giallo = scadenza futura in
 * attesa, rosso = scadenza passata e non saldata. Pensato per rispondere alla
 * confusione della vista tabellare del Modulo Finanziario con qualcosa di
 * immediatamente leggibile per un singolo cliente.
 */
export const ClientPaymentCalendar: React.FC<Props> = ({ payments }) => {
  const todayStr = localDateString();
  const [year, setYear] = useState(() => Number(todayStr.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayStr.slice(5, 7))); // 1-12
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { paidByDay, dueByDay } = useMemo(() => {
    const paid = new Map<string, Payment[]>();
    const due = new Map<string, Payment[]>();
    for (const p of payments) {
      if (p.status === 'PAID' && p.payment_date) {
        const list = paid.get(p.payment_date) || [];
        list.push(p);
        paid.set(p.payment_date, list);
      } else if (p.status !== 'PAID' && p.due_date) {
        const list = due.get(p.due_date) || [];
        list.push(p);
        due.set(p.due_date, list);
      }
    }
    return { paidByDay: paid, dueByDay: due };
  }, [payments]);

  const goToMonth = (offset: number) => {
    const total = year * 12 + (month - 1) + offset;
    setYear(Math.floor(total / 12));
    setMonth((total % 12) + 1);
    setSelectedDay(null);
  };

  const goToToday = () => {
    setYear(Number(todayStr.slice(0, 4)));
    setMonth(Number(todayStr.slice(5, 7)));
    setSelectedDay(null);
  };

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = weekdayOfFirst(year, month);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const cells: (string | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`),
  ];

  const selectedPayments = selectedDay
    ? [...(paidByDay.get(selectedDay) || []), ...(dueByDay.get(selectedDay) || [])]
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
          <CalendarDays size={14} className="text-blue-600" /> Calendario Mensile Pagamenti
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => goToMonth(-1)} className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg cursor-pointer">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-mono font-semibold text-gray-700 w-24 text-center">
            {MONTH_LABELS[month - 1]} {year}
          </span>
          <button onClick={() => goToMonth(1)} className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg cursor-pointer">
            <ChevronRight size={14} />
          </button>
          <button onClick={goToToday} className="ml-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-semibold rounded-lg cursor-pointer">
            Oggi
          </button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 bg-white">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (!day) return <div key={`blank-${idx}`} />;
            const paidHere = paidByDay.get(day) || [];
            const dueHere = dueByDay.get(day) || [];
            const overdueHere = dueHere.filter((p) => p.status === 'OVERDUE');
            const pendingHere = dueHere.filter((p) => p.status === 'PENDING');

            let colorClass = 'bg-gray-50 text-gray-500 border-gray-200';
            if (paidHere.length > 0) colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
            else if (overdueHere.length > 0) colorClass = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
            else if (pendingHere.length > 0) colorClass = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';

            const isToday = day === todayStr;
            const isSelected = day === selectedDay;
            const total = [...paidHere, ...dueHere].reduce((s, p) => s + p.amount, 0);

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                title={total > 0 ? `€ ${total.toFixed(2)}` : undefined}
                className={`aspect-square rounded-lg border text-xs flex items-center justify-center relative cursor-pointer transition-all ${colorClass} ${isToday ? 'ring-2 ring-blue-400' : ''} ${isSelected ? 'ring-2 ring-gray-900' : ''}`}
              >
                {Number(day.slice(-2))}
                {(paidHere.length + dueHere.length) > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 inline-block" /> Incassato</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 inline-block" /> In attesa</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-300 inline-block" /> Scaduto/Insoluto</span>
        </div>

        {selectedDay && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-700">{selectedDay}</p>
            {selectedPayments.length === 0 ? (
              <p className="text-xs text-gray-400">Nessun movimento in questo giorno.</p>
            ) : (
              selectedPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-200">
                  <span className="text-gray-700">{PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}</span>
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
