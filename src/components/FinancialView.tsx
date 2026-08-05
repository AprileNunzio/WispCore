import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import type { Payment, Client, PaymentStatus } from '../types';
import { Wallet, CheckCircle2, Clock, AlertTriangle, Plus } from 'lucide-react';

export const FinancialView: React.FC = () => {
  const { notify } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  const [newPayment, setNewPayment] = useState<{
    client_id: number;
    amount: number;
    payment_type: 'RECURRING' | 'INSTALLATION' | 'EXTRA';
    due_date: string;
    status: PaymentStatus;
  }>({
    client_id: 0,
    amount: 29.90,
    payment_type: 'RECURRING',
    due_date: new Date().toISOString().split('T')[0],
    status: 'PENDING'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, loadedClients] = await Promise.all([dbService.getPayments(), dbService.getClients()]);
    setPayments(p);
    setClients(loadedClients);
    if (loadedClients.length > 0 && newPayment.client_id === 0) {
      setNewPayment(prev => ({ ...prev, client_id: loadedClients[0].id }));
    }
  };

  const handleUpdateStatus = async (id: number, status: PaymentStatus) => {
    await dbService.updatePaymentStatus(id, status);
    notify(status === 'PAID' ? 'Pagamento segnato come saldato.' : 'Stato pagamento aggiornato.', 'success');
    loadData();
  };

  const handleAddPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayment.client_id || newPayment.amount <= 0) return;

    await dbService.addPayment({
      ...newPayment,
      payment_date: newPayment.status === 'PAID' ? new Date().toISOString().split('T')[0] : ''
    });

    notify('Pagamento registrato con successo.', 'success');
    setShowAddModal(false);
    loadData();
  };

  const filteredPayments = payments.filter(p => {
    if (statusFilter === 'ALL') return true;
    return p.status === statusFilter;
  });

  const totalIncassato = payments.filter(p => p.status === 'PAID').reduce((a, b) => a + b.amount, 0);
  const totalInsoluti = payments.filter(p => p.status === 'OVERDUE').reduce((a, b) => a + b.amount, 0);
  const totalInAttesa = payments.filter(p => p.status === 'PENDING').reduce((a, b) => a + b.amount, 0);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Wallet className="text-emerald-600" size={24} />
            <span>Modulo Finanziario & Registrazione Pagamenti</span>
          </h1>
          <p className="text-gray-500 text-xs mt-1">Tracciamento incassi, canoni installazione una-tantum e solleciti insoluti</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg shadow-emerald-600/20 border border-emerald-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
        >
          <Plus size={16} />
          <span>Registra Nuovo Pagamento</span>
        </button>
      </div>

      <div className="ultra-grid">
        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Totale Incassato</span>
          <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">€ {totalIncassato.toFixed(2)}</h3>
          <span className="text-[10px] text-gray-400 mt-2 block">Pagamenti saldati con successo</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">In Scadenza (Pending)</span>
          <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">€ {totalInAttesa.toFixed(2)}</h3>
          <span className="text-[10px] text-gray-400 mt-2 block">In attesa di liquidazione</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-200">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Totale Insoluti (Overdue)</span>
          <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">€ {totalInsoluti.toFixed(2)}</h3>
          <span className="text-[10px] text-rose-600 mt-2 block flex items-center gap-1">
            <AlertTriangle size={12} /> Richiedono sollecito immediato
          </span>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <h3 className="text-base font-bold text-gray-900">Registro Pagamenti WISP</h3>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
            {(['ALL', 'PAID', 'PENDING', 'OVERDUE'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {st === 'ALL' && 'Tutti'}
                {st === 'PAID' && 'Saldati'}
                {st === 'PENDING' && 'In Attesa'}
                {st === 'OVERDUE' && 'Insoluti'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3">ID Variazione</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Tipo Pagamento</th>
                <th className="p-3 font-mono">Importo</th>
                <th className="p-3">Data Scadenza</th>
                <th className="p-3">Stato</th>
                <th className="p-3 text-right">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-400">Nessun pagamento corrisponde ai filtri impostati.</td>
                </tr>
              ) : (
                filteredPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-mono text-gray-400">#PAY-{p.id.toString().padStart(4, '0')}</td>
                    <td className="p-3 font-semibold text-gray-900">{p.client_name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono text-[10px]">
                        {p.payment_type}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-gray-900">€ {p.amount.toFixed(2)}</td>
                    <td className="p-3 font-mono text-gray-400">{p.due_date}</td>
                    <td className="p-3">
                      {p.status === 'PAID' && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                          <CheckCircle2 size={12} /> Saldato ({p.payment_date})
                        </span>
                      )}
                      {p.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
                          <Clock size={12} /> In Attesa
                        </span>
                      )}
                      {p.status === 'OVERDUE' && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full font-semibold">
                          <AlertTriangle size={12} /> Scaduto / Insoluto
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-1">
                      {p.status !== 'PAID' && (
                        <button
                          onClick={() => handleUpdateStatus(p.id, 'PAID')}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium cursor-pointer text-[11px]"
                        >
                          Segna Saldato
                        </button>
                      )}
                      {p.status === 'PENDING' && (
                        <button
                          onClick={() => handleUpdateStatus(p.id, 'OVERDUE')}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium cursor-pointer text-[11px]"
                        >
                          Segna Insoluto
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200">
            <h3 className="text-base font-bold text-gray-900 mb-4">Registra Nuovo Pagamento / Canone</h3>

            <form onSubmit={handleAddPaymentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-gray-500 block mb-1">Seleziona Cliente *</label>
                <select
                  value={newPayment.client_id}
                  onChange={(e) => setNewPayment({ ...newPayment, client_id: Number(e.target.value) })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Tipologia Pagamento</label>
                <select
                  value={newPayment.payment_type}
                  onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value as any })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                >
                  <option value="RECURRING">Canone Ricorrente</option>
                  <option value="INSTALLATION">Costo Installazione Una-Tantum</option>
                  <option value="EXTRA">Intervento Tecnico Extra</option>
                </select>
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Importo (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-emerald-700 font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Data di Scadenza</label>
                <input
                  type="date"
                  required
                  value={newPayment.due_date}
                  onChange={(e) => setNewPayment({ ...newPayment, due_date: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono"
                />
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Stato Iniziale</label>
                <select
                  value={newPayment.status}
                  onChange={(e) => setNewPayment({ ...newPayment, status: e.target.value as any })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                >
                  <option value="PENDING">In Attesa</option>
                  <option value="PAID">Saldato Immediatamente</option>
                  <option value="OVERDUE">Insoluto</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Registra Pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
