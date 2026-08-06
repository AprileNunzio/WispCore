import React, { useMemo, useState } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import type { Client, Payment, PaymentStatus } from '../types';
import { listRecurringPeriodsBetween } from '../financialEngine';
import { localDateString } from '../dateUtils';
import { X, History } from 'lucide-react';

interface Props {
  client: Client;
  payments: Payment[]; // pagamenti già esistenti del cliente, per non riproporre periodi già tracciati
  onClose: () => void;
  onGenerated: () => void;
}

type RowStatus = '' | PaymentStatus | 'SKIP';

interface Row {
  due_date: string;
  amount: number;
  status: RowStatus;
  paymentDate: string; // usata solo se status === 'PAID'
}

/**
 * Strumento "Genera Storico Pagamenti": propone le scadenze del canone
 * ricorrente comprese tra una data di inizio (di norma la Data Inizio
 * Contratto) e la prima scadenza già tracciata nel sistema (o oggi, se il
 * cliente non ha ancora nessun pagamento). Pensato per due casi reali:
 * 1) importare clienti storici che quasi certamente hanno già pagato tutto;
 * 2) correggere lo storico quando si sposta indietro la Data Inizio Contratto
 *    di un cliente già esistente.
 *
 * Deliberatamente NON propone nessuno stato di default per nessun mese:
 * l'operatore deve scegliere esplicitamente Saldato/In Attesa/Insoluto/Salta
 * per ciascun periodo prima di poter confermare - niente scorciatoie che
 * potrebbero generare in massa insoluti falsi o incassi mai avvenuti.
 */
export const ClientHistoryBackfillModal: React.FC<Props> = ({ client, payments, onClose, onGenerated }) => {
  const { notify } = useToast();
  const [startDate, setStartDate] = useState(client.contract_start_date || '');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  // Prima scadenza RECURRING già presente in archivio: i periodi generati non devono mai superarla,
  // altrimenti duplicheremmo un canone che il sistema gestisce già normalmente.
  const earliestExistingDueDate = useMemo(() => {
    const recurringDates = payments
      .filter((p) => p.payment_type === 'RECURRING' && !p.deleted && p.due_date)
      .map((p) => p.due_date)
      .sort();
    return recurringDates[0] || localDateString();
  }, [payments]);

  const candidatePeriods = useMemo(
    () => listRecurringPeriodsBetween(startDate, earliestExistingDueDate, client.billing_cycle),
    [startDate, earliestExistingDueDate, client.billing_cycle]
  );

  // Rigenera le righe quando cambia l'elenco dei periodi candidati (es. l'operatore cambia la Data Inizio),
  // sempre senza stato preselezionato.
  const rowsKey = candidatePeriods.join('|');
  const [lastRowsKey, setLastRowsKey] = useState('');
  if (rowsKey !== lastRowsKey) {
    setLastRowsKey(rowsKey);
    setRows(candidatePeriods.map((due_date) => ({ due_date, amount: client.monthly_fee, status: '', paymentDate: due_date })));
  }

  const allResolved = rows.length > 0 && rows.every((r) => r.status !== '');
  const toGenerateCount = rows.filter((r) => r.status !== '' && r.status !== 'SKIP').length;
  const toSkipCount = rows.filter((r) => r.status === 'SKIP').length;

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleConfirm = async () => {
    if (!allResolved) return;
    setSaving(true);
    try {
      let generated = 0;
      for (const row of rows) {
        if (row.status === '' || row.status === 'SKIP') continue;
        await dbService.addPayment({
          client_id: client.id,
          amount: row.amount,
          payment_type: 'RECURRING',
          due_date: row.due_date,
          payment_date: row.status === 'PAID' ? row.paymentDate : '',
          status: row.status,
        } as any);
        generated++;
      }
      notify(`Storico generato: ${generated} pagamenti creati, ${toSkipCount} periodi saltati.`, 'success');
      onGenerated();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore nella generazione dello storico.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl p-6 border border-gray-200 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <History size={18} className="text-blue-600" /> Genera Storico Pagamenti
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Propone le scadenze del canone ricorrente ({client.first_name} {client.last_name}) tra la data scelta e la prima scadenza già presente in archivio ({earliestExistingDueDate}).
          Devi scegliere esplicitamente lo stato di <strong>ogni</strong> mese prima di confermare: nessuno stato è preselezionato.
        </p>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Inizio (di norma la Data Inizio Contratto)</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full sm:w-56 bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono text-sm"
          />
        </div>

        {candidatePeriods.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
            {startDate ? 'Nessun periodo mancante: lo storico risulta già completo fino alla prima scadenza tracciata.' : 'Imposta una data di inizio per calcolare i periodi mancanti.'}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] sticky top-0">
                <tr>
                  <th className="p-2.5">Periodo (Scadenza)</th>
                  <th className="p-2.5">Importo (€)</th>
                  <th className="p-2.5">Stato *</th>
                  <th className="p-2.5">Data Incasso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr key={row.due_date} className={row.status === '' ? 'bg-amber-50/40' : ''}>
                    <td className="p-2.5 font-mono">{row.due_date}</td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updateRow(idx, { amount: parseFloat(e.target.value) || 0 })}
                        className="w-24 bg-white border border-gray-300 rounded-lg p-1.5 text-gray-900 font-mono"
                      />
                    </td>
                    <td className="p-2.5">
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(idx, { status: e.target.value as RowStatus })}
                        className={`bg-white border rounded-lg p-1.5 text-xs font-semibold ${row.status === '' ? 'border-amber-300 text-amber-700' : 'border-gray-300 text-gray-900'}`}
                      >
                        <option value="">-- Seleziona --</option>
                        <option value="PAID">Saldato</option>
                        <option value="PENDING">In Attesa</option>
                        <option value="OVERDUE">Insoluto</option>
                        <option value="SKIP">Salta (non generare)</option>
                      </select>
                    </td>
                    <td className="p-2.5">
                      {row.status === 'PAID' ? (
                        <input
                          type="date"
                          value={row.paymentDate}
                          onChange={(e) => updateRow(idx, { paymentDate: e.target.value })}
                          className="bg-white border border-gray-300 rounded-lg p-1.5 text-gray-900 font-mono"
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {rows.length > 0 && (allResolved
              ? `Pronto: ${toGenerateCount} da generare, ${toSkipCount} da saltare.`
              : `Restano ${rows.filter((r) => r.status === '').length} mesi senza stato scelto.`)}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer text-sm">
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              disabled={!allResolved || saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer text-sm disabled:opacity-40"
            >
              {saving ? 'Generazione...' : 'Conferma e Genera'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
