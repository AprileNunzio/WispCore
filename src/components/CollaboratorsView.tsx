import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import type { Collaborator, Commission, CommissionByCollaborator } from '../types';
import { Users, UserPlus, Award, Phone, Mail, CheckCircle2, Clock, Edit3, TrendingUp, Wallet } from 'lucide-react';

const emptyForm = { first_name: '', last_name: '', phone: '', email: '', default_commission_fee: 0 };

export const CollaboratorsView: React.FC = () => {
  const { notify } = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [stats, setStats] = useState<CommissionByCollaborator[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Collaborator>>(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [c, comm, byCollab] = await Promise.all([
      dbService.getCollaborators(),
      dbService.getCommissions(),
      dbService.getCommissionsByCollaborator(),
    ]);
    setCollaborators(c);
    setCommissions(comm);
    setStats(byCollab);
  };

  const handleOpenNew = () => {
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleEdit = (col: Collaborator) => {
    setForm(col);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name) return;
    await dbService.saveCollaborator(form);
    notify(form.id ? 'Collaboratore aggiornato.' : 'Collaboratore salvato con successo.', 'success');
    setForm(emptyForm);
    setShowModal(false);
    loadData();
  };

  const handleToggleCommissionStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'PENDING' ? 'PAID' : 'PENDING';
    await dbService.updateCommissionStatus(id, nextStatus as Commission['payout_status']);
    loadData();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="text-cyan-600" size={24} />
            <span>Collaboratori sul Campo & Provvigioni</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gestione tecnici/commerciali esterni, guadagno di default e calcolo automatico dei rimborsi</p>
        </div>

        <button
          onClick={handleOpenNew}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg shadow-cyan-600/20 border border-cyan-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
        >
          <UserPlus size={16} />
          <span>Nuovo Collaboratore</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {collaborators.map(col => {
          const colCommissions = commissions.filter(c => c.collaborator_id === col.id);
          const totalEarned = colCommissions.reduce((a, b) => a + b.amount, 0);
          const pendingAmount = colCommissions.filter(c => c.payout_status === 'PENDING').reduce((a, b) => a + b.amount, 0);
          const stat = stats.find((s) => s.id === col.id);

          return (
            <div key={col.id} className="glass-panel p-5 rounded-2xl border border-gray-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200 flex items-center justify-center font-bold text-sm">
                    {col.first_name[0]}{col.last_name[0]}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{col.first_name} {col.last_name}</h3>
                    <span className="text-xs text-gray-400">Tecnico / Commerciale</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleEdit(col)} className="p-2 bg-gray-100 hover:bg-gray-200 text-blue-600 rounded-lg border border-gray-200 cursor-pointer" title="Modifica">
                    <Edit3 size={14} />
                  </button>
                  <Award className="text-cyan-600" size={20} />
                </div>
              </div>

              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-gray-400" /> {col.phone || 'Telefono non fornito'}
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-gray-400" /> {col.email || 'Email non fornita'}
                </div>
              </div>

              {!!col.default_commission_fee && (
                <div className="text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5">
                  <TrendingUp size={12} /> Guadagno di default: € {col.default_commission_fee.toFixed(2)}/mese per cliente
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-center justify-between text-sm">
                <div>
                  <span className="text-[11px] text-gray-400 uppercase block">Provvigioni Totali</span>
                  <span className="font-mono font-bold text-gray-900">€ {(stat?.total_amount ?? totalEarned).toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-amber-700 uppercase block font-semibold">Da Liquidare</span>
                  <span className="font-mono font-bold text-amber-600">€ {(stat?.pending_amount ?? pendingAmount).toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-gray-200">
        <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Wallet size={18} className="text-cyan-600" /> Registro Provvigioni & Liquidazioni</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-500 uppercase text-xs tracking-wider">
              <tr>
                <th className="p-3">Collaboratore</th>
                <th className="p-3">Cliente Collegato</th>
                <th className="p-3 font-mono">Importo Spettante</th>
                <th className="p-3">Data Generazione</th>
                <th className="p-3">Stato Liquidazione</th>
                <th className="p-3 text-right">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {commissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400">Nessuna provvigione registrata nel sistema.</td>
                </tr>
              ) : (
                commissions.map(comm => (
                  <tr key={comm.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-semibold text-gray-900">{comm.collaborator_name}</td>
                    <td className="p-3 text-gray-600">{comm.client_name}</td>
                    <td className="p-3 font-mono font-bold text-cyan-700">€ {comm.amount.toFixed(2)}</td>
                    <td className="p-3 font-mono text-gray-400">{comm.created_at}</td>
                    <td className="p-3">
                      {comm.payout_status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                          <CheckCircle2 size={12} /> Liquidata
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                          <Clock size={12} /> In Attesa
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleToggleCommissionStatus(comm.id, comm.payout_status)}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer text-xs ${
                          comm.payout_status === 'PAID'
                            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                        }`}
                      >
                        {comm.payout_status === 'PAID' ? 'Segna In Attesa' : 'Segna Liquidata'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200">
            <h3 className="text-base font-bold text-gray-900 mb-4">{form.id ? 'Modifica Collaboratore' : 'Aggiungi Collaboratore Esterno'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={form.first_name || ''}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Cognome *</label>
                <input
                  type="text"
                  required
                  value={form.last_name || ''}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Telefono</label>
                <input
                  type="text"
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Email</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Guadagno di Default (€/mese per cliente)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.default_commission_fee ?? 0}
                  onChange={(e) => setForm({ ...form, default_commission_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-cyan-700 font-mono font-bold"
                />
                <p className="text-[11px] text-gray-400 mt-1">Usato come proposta automatica quando assegni questo collaboratore a un nuovo cliente (es. cliente paga 20€/mese, 5€/mese al collaboratore).</p>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Salva Collaboratore
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
