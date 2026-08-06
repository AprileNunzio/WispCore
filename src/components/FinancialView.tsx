import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import type { Payment, Client, ClientLite, PaymentStatus, PaymentType, Commission } from '../types';
import { Wallet, CheckCircle2, Clock, AlertTriangle, Plus, Search, ShieldAlert, Edit3, Trash2, Undo2 } from 'lucide-react';
import { localDateString } from '../dateUtils';
import { BadPayersView } from './BadPayersView';
import { 
  calculateOverdueAmount,
  calculatePendingAmount,
  calculateNetWispMetrics,
  getValidPayments
} from '../financialEngine';

export const FinancialView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'BAD_PAYERS'>('PAYMENTS');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // Modale per segnare un pagamento come saldato con data incasso personalizzata
  const [payModal, setPayModal] = useState<{ paymentId: number; clientName: string; amount: number; paymentDate: string } | null>(null);

  // Modale di correzione (importo/scadenza/tipo) per rimediare a un errore di registrazione
  const [editModal, setEditModal] = useState<{ paymentId: number; amount: number; due_date: string; payment_type: PaymentType } | null>(null);

  // Ricerca live del cliente lato server
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    due_date: localDateString(),
    status: 'PENDING'
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      const results = await dbService.searchClients(clientQuery, 20);
      setClientResults(results);
    }, 200);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [clientQuery]);

  const loadData = async () => {
    const [p, loadedClients, comm] = await Promise.all([dbService.getPayments(), dbService.getClients(), dbService.getCommissions()]);
    setPayments(p);
    setClients(loadedClients);
    setCommissions(comm);
  };

  const handleOpenPayModal = (p: Payment) => {
    setPayModal({
      paymentId: p.id,
      clientName: p.client_name || 'Cliente',
      amount: p.amount,
      paymentDate: localDateString(),
    });
  };

  const handleConfirmPaid = async () => {
    if (!payModal) return;
    const result = await dbService.updatePaymentStatus(payModal.paymentId, 'PAID', payModal.paymentDate);
    if (result?.nextDueDate) {
      notify(`Pagamento saldato in data ${payModal.paymentDate}. Prossima scadenza generata: ${result.nextDueDate}.`, 'success');
    } else {
      notify(`Pagamento segnato come saldato in data ${payModal.paymentDate}.`, 'success');
    }
    setPayModal(null);
    loadData();
  };

  const handleUpdateStatusDirect = async (id: number, status: PaymentStatus) => {
    await dbService.updatePaymentStatus(id, status);
    notify('Stato pagamento aggiornato.', 'success');
    loadData();
  };

  const handleUndoPaid = async (p: Payment) => {
    const ok = await confirmDialog(
      `Annullare il saldo di questo pagamento (€ ${p.amount.toFixed(2)})? Tornerà "In Attesa". ` +
      `Nota: l'eventuale prossima scadenza già generata automaticamente e la provvigione collegata NON vengono rimosse in automatico - eliminale a mano se anch'esse sbagliate.`
    );
    if (!ok) return;
    await dbService.updatePaymentStatus(p.id, 'PENDING');
    notify('Saldo annullato: il pagamento è tornato In Attesa.', 'success');
    loadData();
  };

  const handleOpenEditModal = (p: Payment) => {
    setEditModal({ paymentId: p.id, amount: p.amount, due_date: p.due_date, payment_type: p.payment_type });
  };

  const handleConfirmEdit = async () => {
    if (!editModal) return;
    await dbService.updatePayment(editModal.paymentId, {
      amount: editModal.amount,
      due_date: editModal.due_date,
      payment_type: editModal.payment_type,
    });
    notify('Pagamento corretto.', 'success');
    setEditModal(null);
    loadData();
  };

  const handleDeletePayment = async (p: Payment) => {
    const ok = await confirmDialog(`Eliminare definitivamente questo pagamento (€ ${p.amount.toFixed(2)}, scadenza ${p.due_date})? L'operazione non è reversibile dall'interfaccia.`);
    if (!ok) return;
    await dbService.deletePayment(p.id);
    notify('Pagamento eliminato.', 'success');
    loadData();
  };

  const handleOpenAddModal = () => {
    setSelectedClient(null);
    setClientQuery('');
    setNewPayment((prev) => ({ ...prev, client_id: 0 }));
    setShowAddModal(true);
  };

  const handlePickClient = (client: ClientLite) => {
    setSelectedClient(client);
    setClientQuery(`${client.first_name} ${client.last_name}`);
    setNewPayment((prev) => ({ ...prev, client_id: client.id }));
    setShowClientDropdown(false);
  };

  const handleAddPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayment.client_id || newPayment.amount <= 0) return;

    const today = localDateString();
    await dbService.addPayment({
      ...newPayment,
      due_date: today,
      payment_date: today,
      status: 'PAID'
    });

    notify('Incasso registrato con successo.', 'success');
    setShowAddModal(false);
    loadData();
  };

  const validPayments = getValidPayments(payments);
  const filteredPayments = validPayments.filter(p => {
    if (statusFilter === 'ALL') return true;
    return p.status === statusFilter;
  });

  const netMetrics = calculateNetWispMetrics(payments, commissions);
  const totalIncassato = netMetrics.grossRevenue;
  const totalInsoluti = calculateOverdueAmount(payments);
  const totalInAttesa = calculatePendingAmount(payments);
  const totalCommissioni = netMetrics.totalCommissionsEarned;
  
  // Incasso netto coerente con l'engine (sottrae provvigioni pagate)
  const incassoNetto = netMetrics.netWispRevenue;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Wallet className="text-emerald-600" size={24} />
            <span>Modulo Finanziario & Indice Affidabilità</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Tracciamento incassi, canoni installazione una-tantum e analisi Cattivi Pagatori</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
            <button
              onClick={() => setActiveTab('PAYMENTS')}
              className={`px-3 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'PAYMENTS' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Registro Pagamenti
            </button>
            <button
              onClick={() => setActiveTab('BAD_PAYERS')}
              className={`px-3 py-2 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'BAD_PAYERS' ? 'bg-rose-600 text-white shadow' : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              <ShieldAlert size={14} /> Cattivi Pagatori
            </button>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 border border-emerald-400/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0"
          >
            <Plus size={16} />
            <span>Registra Nuovo Pagamento</span>
          </button>
        </div>
      </div>

      {activeTab === 'BAD_PAYERS' ? (
        <BadPayersView clients={clients} payments={payments} />
      ) : (
        <>
          <div className="ultra-grid">
            <div className="glass-panel p-5 rounded-2xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Incasso Netto</span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">€ {incassoNetto.toFixed(2)}</h3>
              <span className="text-xs text-gray-400 mt-2 block">
                Lordo € {totalIncassato.toFixed(2)} − Provvigioni € {totalCommissioni.toFixed(2)}
              </span>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">In Scadenza (Pending)</span>
              <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">€ {totalInAttesa.toFixed(2)}</h3>
              <span className="text-xs text-gray-400 mt-2 block">In attesa di liquidazione</span>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Totale Insoluti (Overdue)</span>
              <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">€ {totalInsoluti.toFixed(2)}</h3>
              <span className="text-xs text-rose-600 mt-2 block flex items-center gap-1">
                <AlertTriangle size={12} /> Richiedono sollecito immediato
              </span>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h3 className="text-base font-bold text-gray-900">Registro Pagamenti WISP</h3>

              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 text-sm">
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
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-gray-500 uppercase text-xs tracking-wider">
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
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-semibold text-xs">
                            {p.payment_type === 'RECURRING' && 'Canone Ricorrente'}
                            {p.payment_type === 'INSTALLATION' && 'Costo Installazione Una-Tantum'}
                            {p.payment_type === 'EXTRA' && 'Intervento Tecnico Extra'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-gray-900">€ {p.amount.toFixed(2)}</td>
                        <td className="p-3 font-mono text-gray-400">{p.due_date}</td>
                        <td className="p-3">
                          {p.status === 'PAID' && (
                            <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                              <CheckCircle2 size={12} /> Saldato ({p.payment_date})
                            </span>
                          )}
                          {p.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
                              <Clock size={12} /> In Attesa
                            </span>
                          )}
                          {p.status === 'OVERDUE' && (
                            <span className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full font-semibold">
                              <AlertTriangle size={12} /> Scaduto / Insoluto
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          {p.status !== 'PAID' && (
                            <button
                              onClick={() => handleOpenPayModal(p)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium cursor-pointer text-xs"
                            >
                              Segna Saldato
                            </button>
                          )}
                          {p.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateStatusDirect(p.id, 'OVERDUE')}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium cursor-pointer text-xs"
                            >
                              Segna Insoluto
                            </button>
                          )}
                          {p.status === 'PAID' && (
                            <button
                              onClick={() => handleUndoPaid(p)}
                              title="Annulla Saldo (torna In Attesa)"
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded cursor-pointer inline-flex"
                            >
                              <Undo2 size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            title="Modifica (correggi importo/scadenza/tipo)"
                            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-blue-600 border border-gray-200 rounded cursor-pointer inline-flex"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(p)}
                            title="Elimina pagamento"
                            className="p-1.5 bg-gray-100 hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-300 rounded cursor-pointer inline-flex"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200">
            <h3 className="text-base font-bold text-gray-900 mb-4">Registra Nuovo Pagamento / Canone</h3>

            <form onSubmit={handleAddPaymentSubmit} className="space-y-3 text-sm">
              <div className="relative">
                <label className="text-gray-500 block mb-1">Cerca Cliente * (nome, IP, MAC o PPPoE)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={15} />
                  <input
                    type="text"
                    required
                    value={clientQuery}
                    onFocus={() => setShowClientDropdown(true)}
                    onChange={(e) => { setClientQuery(e.target.value); setShowClientDropdown(true); setSelectedClient(null); setNewPayment({ ...newPayment, client_id: 0 }); }}
                    placeholder="Digita per cercare tra tutti i clienti..."
                    className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pl-9 pr-3 text-gray-900 font-mono"
                  />
                </div>
                {showClientDropdown && clientResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-10 max-h-56 overflow-y-auto">
                    {clientResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handlePickClient(c)}
                        className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
                      >
                        <div className="font-semibold text-gray-900">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{c.assigned_ip || 'N/D'} • {c.pppoe_username || 'N/D'}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!selectedClient && clients.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Nessun cliente in archivio: creane uno prima nella sezione Anagrafica.</p>
                )}
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Tipologia Pagamento</label>
                <select
                  value={newPayment.payment_type}
                  onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value as any })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-gray-900"
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
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-emerald-700 font-mono font-bold"
                />
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
                  disabled={!newPayment.client_id}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl cursor-pointer disabled:opacity-40"
                >
                  Registra Pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-gray-200 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">Registra Saldo Pagamento</h3>
            <p className="text-xs text-gray-500">
              Stai per marcare come saldato il pagamento per <span className="font-semibold text-gray-900">{payModal.clientName}</span> dell'importo di <span className="font-mono font-bold text-emerald-700">€ {payModal.amount.toFixed(2)}</span>.
            </p>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Data Reale Incasso (Fuso Roma)</label>
              <input
                type="date"
                required
                value={payModal.paymentDate}
                onChange={(e) => setPayModal({ ...payModal, paymentDate: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-gray-900 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModal(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer text-xs"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmPaid}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl cursor-pointer text-xs"
              >
                Conferma Saldato
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-gray-200 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">Correggi Pagamento</h3>
            <p className="text-xs text-gray-500">Correggi un errore di registrazione: importo, scadenza o tipologia. Non tocca lo stato del pagamento.</p>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Tipologia Pagamento</label>
              <select
                value={editModal.payment_type}
                onChange={(e) => setEditModal({ ...editModal, payment_type: e.target.value as PaymentType })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-gray-900 text-sm"
              >
                <option value="RECURRING">Canone Ricorrente</option>
                <option value="INSTALLATION">Costo Installazione Una-Tantum</option>
                <option value="EXTRA">Intervento Tecnico Extra</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Importo (€)</label>
              <input
                type="number"
                step="0.01"
                value={editModal.amount}
                onChange={(e) => setEditModal({ ...editModal, amount: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-emerald-700 font-mono font-bold text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Data Scadenza</label>
              <input
                type="date"
                value={editModal.due_date}
                onChange={(e) => setEditModal({ ...editModal, due_date: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-xl p-3 text-gray-900 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer text-xs"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer text-xs"
              >
                Salva Correzione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
