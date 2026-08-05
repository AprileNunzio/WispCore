import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import type { Plan } from '../types';
import { Wifi, Plus, Edit3, Trash2, Gauge, X, PackageCheck, PackageX } from 'lucide-react';

export const PlansView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => setPlans(await dbService.getPlans());

  const handleOpenNew = () => {
    setEditing({ name: '', monthly_fee: 29.9, installation_fee: 100, download_mbps: 30, upload_mbps: 10, description: '', active: true });
    setShowModal(true);
  };

  const handleEdit = (plan: Plan) => {
    setEditing(plan);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDialog('Eliminare questo piano? I clienti già associati non verranno modificati.');
    if (!confirmed) return;
    await dbService.deletePlan(id);
    notify('Piano eliminato.', 'success');
    loadData();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name) return;
    await dbService.savePlan(editing);
    notify(editing.id ? 'Piano aggiornato.' : 'Nuovo piano creato.', 'success');
    setShowModal(false);
    setEditing(null);
    loadData();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Wifi className="text-blue-600" size={24} />
            <span>Piani Internet</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Catalogo delle offerte da assegnare ai clienti WISP</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg shadow-blue-600/20 border border-blue-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
        >
          <Plus size={16} />
          <span>Nuovo Piano</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center text-gray-400 text-sm lg:col-span-3">
            Nessun piano configurato. Creane uno per iniziare ad assegnarlo ai clienti.
          </div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="glass-panel p-5 rounded-2xl border border-gray-200 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 ${plan.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                    {plan.active ? <PackageCheck size={11} /> : <PackageX size={11} />}
                    {plan.active ? 'Attivo' : 'Disattivato'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => handleEdit(plan)} className="p-2 bg-gray-100 hover:bg-gray-200 text-blue-600 rounded-lg border border-gray-200 cursor-pointer"><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(plan.id)} className="p-2 bg-gray-100 hover:bg-rose-50 text-rose-600 rounded-lg border border-gray-200 cursor-pointer"><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-cyan-700 text-sm font-semibold">
                <Gauge size={16} /> {plan.download_mbps || '?'} / {plan.upload_mbps || '?'} Mbps
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-center justify-between text-sm">
                <div>
                  <span className="text-[11px] text-gray-400 uppercase block">Canone</span>
                  <span className="font-mono font-bold text-emerald-700">€ {plan.monthly_fee.toFixed(2)}/mese</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-gray-400 uppercase block">Installazione</span>
                  <span className="font-mono text-gray-700">€ {plan.installation_fee.toFixed(2)}</span>
                </div>
              </div>

              {plan.description && <p className="text-xs text-gray-500">{plan.description}</p>}
            </div>
          ))
        )}
      </div>

      {showModal && editing && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editing.id ? 'Modifica Piano' : 'Nuovo Piano Internet'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Nome Piano *</label>
                <input type="text" required value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900" placeholder="es. Home 30/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 block mb-1">Download (Mbps)</label>
                  <input type="number" value={editing.download_mbps || ''} onChange={(e) => setEditing({ ...editing, download_mbps: Number(e.target.value) || undefined })}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Upload (Mbps)</label>
                  <input type="number" value={editing.upload_mbps || ''} onChange={(e) => setEditing({ ...editing, upload_mbps: Number(e.target.value) || undefined })}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Canone Mensile (€)</label>
                  <input type="number" step="0.01" value={editing.monthly_fee || 0} onChange={(e) => setEditing({ ...editing, monthly_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-emerald-700 font-mono font-bold" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Costo Installazione (€)</label>
                  <input type="number" step="0.01" value={editing.installation_fee || 0} onChange={(e) => setEditing({ ...editing, installation_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
                </div>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Descrizione</label>
                <textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900" rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="plan-active" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <label htmlFor="plan-active" className="text-gray-500">Piano attivo (selezionabile per nuovi clienti)</label>
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl cursor-pointer">Annulla</button>
                <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer">Salva Piano</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
