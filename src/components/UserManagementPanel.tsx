import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import type { StaffAdmin, AdminRole, Collaborator } from '../types';
import { Users, UserPlus, Edit3, Trash2, ShieldCheck } from 'lucide-react';

const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  TECNICO: 'Tecnico',
  COMMERCIALE: 'Commerciale',
  COLLABORATORE: 'Collaboratore (self-service)',
};

const ROLE_BADGE: Record<AdminRole, string> = {
  SUPER_ADMIN: 'bg-purple-50 text-purple-700 border-purple-200',
  TECNICO: 'bg-blue-50 text-blue-700 border-blue-200',
  COMMERCIALE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  COLLABORATORE: 'bg-amber-50 text-amber-700 border-amber-200',
};

const emptyForm = { username: '', pin: '', confirmPin: '', role: 'TECNICO' as AdminRole, linkedCollaboratorId: null as number | null };

/** Pannello Impostazioni -> Utenti & Ruoli, riservato al Super Admin (la voce Impostazioni è già nascosta agli altri ruoli). */
export const UserManagementPanel: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [admins, setAdmins] = useState<StaffAdmin[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    const [a, c] = await Promise.all([dbService.getAdmins(), dbService.getCollaborators()]);
    setAdmins(a);
    setCollaborators(c);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleEdit = (a: StaffAdmin) => {
    setEditingId(a.id);
    setForm({ username: a.username, pin: '', confirmPin: '', role: a.role, linkedCollaboratorId: a.linked_collaborator_id });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return;
    if (form.pin && form.pin !== form.confirmPin) {
      notify('I PIN inseriti non coincidono.', 'error');
      return;
    }
    if (!editingId && !form.pin) {
      notify('Il PIN è obbligatorio per un nuovo utente.', 'error');
      return;
    }
    if (form.role === 'COLLABORATORE' && !form.linkedCollaboratorId) {
      notify('Seleziona il collaboratore collegato a questo account self-service.', 'error');
      return;
    }

    try {
      if (editingId) {
        await dbService.updateAdmin({
          id: editingId,
          username: form.username,
          role: form.role,
          linkedCollaboratorId: form.role === 'COLLABORATORE' ? form.linkedCollaboratorId : null,
          pin: form.pin || undefined,
        });
        notify('Utente aggiornato.', 'success');
      } else {
        await dbService.createAdmin({
          username: form.username,
          pin: form.pin,
          role: form.role,
          linkedCollaboratorId: form.role === 'COLLABORATORE' ? form.linkedCollaboratorId : null,
        });
        notify('Utente creato.', 'success');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel salvataggio dell'utente.", 'error');
    }
  };

  const handleDelete = async (a: StaffAdmin) => {
    const ok = await confirmDialog(`Eliminare l'utente "${a.username}"? Non potrà più accedere a WispCore.`);
    if (!ok) return;
    try {
      await dbService.deleteAdmin(a.id);
      notify('Utente eliminato.', 'success');
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nell'eliminazione.", 'error');
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4 lg:col-span-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-200">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Utenti & Ruoli</h3>
            <p className="text-xs text-gray-500">Account staff con permessi differenziati: PIN unico per tutti, un solo campo allo sblocco</p>
          </div>
        </div>
        <button onClick={handleOpenNew}
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors">
          <UserPlus size={14} /> Nuovo Utente
        </button>
      </div>

      <div className="space-y-2">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-600">
                {a.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{a.username}</div>
                {a.role === 'COLLABORATORE' && a.linked_collaborator_id && (
                  <div className="text-[11px] text-gray-400">
                    Collegato a: {collaborators.find((c) => c.id === a.linked_collaborator_id)?.first_name || '—'} {collaborators.find((c) => c.id === a.linked_collaborator_id)?.last_name || ''}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${ROLE_BADGE[a.role]}`}>{ROLE_LABELS[a.role]}</span>
              <button onClick={() => handleEdit(a)} className="p-1.5 bg-white hover:bg-gray-100 text-blue-600 rounded-md border border-gray-200 cursor-pointer"><Edit3 size={13} /></button>
              <button onClick={() => handleDelete(a)} className="p-1.5 bg-white hover:bg-gray-100 text-rose-600 rounded-md border border-gray-200 cursor-pointer"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Users size={16} /> {editingId ? 'Modifica Utente' : 'Nuovo Utente Staff'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Nome Utente *</label>
                <input type="text" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 block mb-1">PIN {editingId && <span className="text-gray-400">(lascia vuoto per non cambiarlo)</span>}</label>
                  <input type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Conferma PIN</label>
                  <input type="password" value={form.confirmPin} onChange={(e) => setForm({ ...form, confirmPin: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono" />
                </div>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Ruolo</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900">
                  <option value="SUPER_ADMIN">Super Admin — accesso completo</option>
                  <option value="TECNICO">Tecnico — anagrafica, piani, copertura</option>
                  <option value="COMMERCIALE">Commerciale — anagrafica, finanziario, provvigioni, report</option>
                  <option value="COLLABORATORE">Collaboratore — solo le proprie provvigioni</option>
                </select>
              </div>
              {form.role === 'COLLABORATORE' && (
                <div>
                  <label className="text-gray-500 block mb-1">Collaboratore Collegato *</label>
                  <select value={form.linkedCollaboratorId ?? ''} onChange={(e) => setForm({ ...form, linkedCollaboratorId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900">
                    <option value="">Seleziona...</option>
                    {collaborators.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer">Annulla</button>
                <button type="submit" className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl cursor-pointer">Salva Utente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
