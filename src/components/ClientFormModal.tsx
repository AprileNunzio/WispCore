import React, { useState, useEffect } from 'react';
import type {
  Client,
  ClientSavePayload,
  Collaborator,
  Plan,
  NetworkNode,
  BillingCycle,
  ClientStatus,
} from '../types';
import { BILLING_CYCLE_INFO } from '../types';
import { localDateString } from '../dateUtils';
import {
  X,
  User,
  FileText,
  DollarSign,
  Wifi,
  CheckSquare,
  Plus,
  Trash2,
  TrendingUp,
  ShieldCheck,
  Building2
} from 'lucide-react';

interface Props {
  client?: Client | null;
  collaborators: Collaborator[];
  plans: Plan[];
  networkNodes: NetworkNode[];
  onSave: (payload: ClientSavePayload) => Promise<void>;
  onClose: () => void;
}

interface SplitRow {
  collaborator_id: number;
  amount: number;
}

export const ClientFormModal: React.FC<Props> = ({
  client,
  collaborators,
  plans,
  networkNodes,
  onSave,
  onClose,
}) => {
  const isEditing = !!client?.id;
  const todayStr = localDateString();

  const [form, setForm] = useState<Partial<ClientSavePayload>>({
    first_name: '',
    last_name: '',
    tax_code: '',
    address: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
    billing_cycle: 'MONTHLY',
    monthly_fee: 29.90,
    installation_fee: 0,
    collaborator_id: null,
    collaborator_commission_fee: 0,
    collaborator_installation_commission: 0,
    contract_start_date: todayStr,
    contract_end_date: '',
    contract_notes: '',
    pppoe_username: '',
    pppoe_password: '',
    mac_address: '',
    assigned_ip: '',
    device_model: '',
    notes: '',
    plan_id: null,
    network_node_id: null,
    already_paid_this_period: false,
    already_paid_installation: false,
  });

  const [installationSplits, setInstallationSplits] = useState<SplitRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        ...client,
        already_paid_this_period: false,
        already_paid_installation: false,
      });
      // Se modifico un cliente esistente, carico eventuali split di installazione
      if (client.id) {
        window.wispcore.clients.getInstallationSplits(client.id).then((splits) => {
          setInstallationSplits(splits.map((s) => ({ collaborator_id: s.collaborator_id, amount: s.amount })));
        });
      }
    }
  }, [client]);

  // Seleziona un piano internet di listino
  const handleSelectPlan = (planId: number | null) => {
    const plan = plans.find((p) => p.id === planId);
    setForm((prev) => ({
      ...prev,
      plan_id: planId,
      ...(plan ? { monthly_fee: plan.monthly_fee, installation_fee: plan.installation_fee } : {}),
    }));
  };

  // Seleziona collaboratore commerciale principale
  const handleSelectCollaborator = (collabId: number | null) => {
    const collab = collaborators.find((c) => c.id === collabId);
    setForm((prev) => ({
      ...prev,
      collaborator_id: collabId,
      collaborator_commission_fee: prev.collaborator_commission_fee || collab?.default_commission_fee || 0,
      collaborator_installation_commission: prev.collaborator_installation_commission || collab?.default_installation_commission || 0,
    }));
  };

  // Aggiunge una riga di ripartizione installazione
  const handleAddSplitRow = () => {
    const firstAvailableCollab = collaborators.find(c => !installationSplits.some(s => s.collaborator_id === c.id));
    if (!firstAvailableCollab) return;
    setInstallationSplits([...installationSplits, { collaborator_id: firstAvailableCollab.id, amount: 0 }]);
  };

  const handleUpdateSplitRow = (index: number, field: keyof SplitRow, value: number) => {
    const updated = [...installationSplits];
    updated[index] = { ...updated[index], [field]: value };
    setInstallationSplits(updated);
  };

  const handleRemoveSplitRow = (index: number) => {
    setInstallationSplits(installationSplits.filter((_, i) => i !== index));
  };

  // Calcoli finanziari in tempo reale
  const monthlyFee = Number(form.monthly_fee) || 0;
  const collaboratorCommissionFee = form.collaborator_id ? (Number(form.collaborator_commission_fee) || 0) : 0;
  const netWispMonthlyFee = Math.max(0, monthlyFee - collaboratorCommissionFee);

  const installationFee = Number(form.installation_fee) || 0;
  const totalSplitsAmount = installationSplits.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  const netWispInstallationFee = Math.max(0, installationFee - totalSplitsAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        installation_splits: installationSplits,
      } as ClientSavePayload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-6xl bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Widescreen */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-400">
              <User size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                {isEditing ? `Modifica Scheda Cliente: ${client?.first_name} ${client?.last_name}` : 'Nuova Attivazione Cliente WISP'}
              </h2>
              <p className="text-xs text-gray-400">Inserimento anagrafica, contratto, inquadramento finanziario e ripartizione provvigioni</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body a Griglia Widescreen */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* Box Anteprima Margine Netto WISP */}
          <div className="bg-gradient-to-r from-emerald-900/90 via-teal-900/90 to-slate-900 p-4 rounded-2xl border border-emerald-500/30 text-white grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 shadow-lg">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">Canone Cliente</span>
              <span className="text-lg font-mono font-bold">€ {monthlyFee.toFixed(2)} <span className="text-xs font-normal opacity-75">/mese</span></span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 block">Provvigione Collaboratore</span>
              <span className="text-lg font-mono font-bold text-cyan-300">- € {collaboratorCommissionFee.toFixed(2)} <span className="text-xs font-normal opacity-75">/mese</span></span>
            </div>
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300 block flex items-center gap-1">
                <TrendingUp size={12} /> Margine Netto WISP
              </span>
              <span className="text-xl font-mono font-black text-emerald-300">€ {netWispMonthlyFee.toFixed(2)} <span className="text-xs font-normal">/mese</span></span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 block">Installazione Quota Azienda</span>
              <span className="text-lg font-mono font-bold text-purple-300">€ {netWispInstallationFee.toFixed(2)} <span className="text-[10px] opacity-75">(su € {installationFee.toFixed(2)})</span></span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* SEZIONE 1: Anagrafica & Contatti */}
            <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-2 border-b border-gray-200">
                <User size={16} className="text-blue-600" />
                <span>1. Anagrafica Cliente & Contatti</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 mb-1 block">Nome *</label>
                  <input
                    type="text"
                    required
                    value={form.first_name || ''}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-gray-500 mb-1 block">Cognome *</label>
                  <input
                    type="text"
                    required
                    value={form.last_name || ''}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Codice Fiscale / P.IVA</label>
                <input
                  type="text"
                  value={form.tax_code || ''}
                  onChange={(e) => setForm({ ...form, tax_code: e.target.value.toUpperCase() })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 font-mono text-gray-900"
                  placeholder="RSSMRA80A01H501U"
                />
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Indirizzo di Installazione</label>
                <input
                  type="text"
                  value={form.address || ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                  placeholder="Via Roma 123, Città (VV)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 mb-1 block">Telefono</label>
                  <input
                    type="text"
                    value={form.phone || ''}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-gray-500 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={form.email || ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* SEZIONE 2: Piano, Contratto & Fatturazione */}
            <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-2 border-b border-gray-200">
                <FileText size={16} className="text-emerald-600" />
                <span>2. Piano Internet & Contratto</span>
              </h3>

              <div>
                <label className="text-gray-500 mb-1 block">Offerta Internet da Catalogo Piani</label>
                <select
                  value={form.plan_id || ''}
                  onChange={(e) => handleSelectPlan(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-blue-700 font-semibold"
                >
                  <option value="">Piano personalizzato / Nessuno</option>
                  {plans.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name} — € {p.monthly_fee.toFixed(2)}/mese</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Ciclo di Fatturazione</label>
                <select
                  value={form.billing_cycle || 'MONTHLY'}
                  onChange={(e) => setForm({ ...form, billing_cycle: e.target.value as BillingCycle })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                >
                  {(Object.keys(BILLING_CYCLE_INFO) as BillingCycle[]).map((cycle) => (
                    <option key={cycle} value={cycle}>{BILLING_CYCLE_INFO[cycle].label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 mb-1 block">Data Inizio Contratto</label>
                  <input
                    type="date"
                    value={form.contract_start_date || ''}
                    onChange={(e) => setForm({ ...form, contract_start_date: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-gray-500 mb-1 block">Data Scadenza Contratto</label>
                  <input
                    type="date"
                    value={form.contract_end_date || ''}
                    onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Note Contrattuali / Note Cliente</label>
                <textarea
                  rows={2}
                  value={form.contract_notes || ''}
                  onChange={(e) => setForm({ ...form, contract_notes: e.target.value })}
                  placeholder="Dettagli installazione, accordi specifici..."
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                />
              </div>
            </div>

            {/* SEZIONE 3: Configurazione Rete WISP */}
            <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-2 border-b border-gray-200">
                <Wifi size={16} className="text-cyan-600" />
                <span>3. Configurazione Rete & PPPoE</span>
              </h3>

              <div>
                <label className="text-gray-500 mb-1 block">Nodo di Rete / Stazione Base (BTS)</label>
                <select
                  value={form.network_node_id || ''}
                  onChange={(e) => setForm({ ...form, network_node_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-semibold"
                >
                  <option value="">Nessun nodo selezionato</option>
                  {networkNodes.filter(n => n.active).map(node => (
                    <option key={node.id} value={node.id}>{node.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 mb-1 block">Username PPPoE</label>
                  <input
                    type="text"
                    value={form.pppoe_username || ''}
                    onChange={(e) => setForm({ ...form, pppoe_username: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-cyan-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-gray-500 mb-1 block">Password PPPoE</label>
                  <input
                    type="password"
                    value={form.pppoe_password || ''}
                    onChange={(e) => setForm({ ...form, pppoe_password: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 mb-1 block">IP Assegnato</label>
                  <input
                    type="text"
                    value={form.assigned_ip || ''}
                    onChange={(e) => setForm({ ...form, assigned_ip: e.target.value })}
                    placeholder="10.100.0.X"
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-blue-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-gray-500 mb-1 block">Indirizzo MAC CPE/Router</label>
                  <input
                    type="text"
                    value={form.mac_address || ''}
                    onChange={(e) => setForm({ ...form, mac_address: e.target.value.toUpperCase() })}
                    placeholder="00:11:22:33:44:55"
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Modello Dispositivo CPE / Antenna</label>
                <input
                  type="text"
                  value={form.device_model || ''}
                  onChange={(e) => setForm({ ...form, device_model: e.target.value })}
                  placeholder="Es. Ubiquiti LiteBeam 5AC Gen2"
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900"
                />
              </div>
            </div>

          </div>

          {/* SEZIONE 4: Inquadramento Finanziario & Ripartizione Provvigioni (Widescreen Full Width) */}
          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center justify-between pb-2 border-b border-gray-200">
              <span className="flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-600" />
                <span>4. Inquadramento Finanziario & Ripartizione Provvigioni</span>
              </span>
              <span className="text-xs text-gray-500 font-mono font-normal">
                Margine Mensile WISP: <strong className="text-emerald-700 font-bold">€ {netWispMonthlyFee.toFixed(2)}</strong>
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-gray-500 mb-1 block">Canone Mensile Cliente (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={form.monthly_fee || 0}
                  onChange={(e) => setForm({ ...form, monthly_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-emerald-700 font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Collaboratore Commerciale</label>
                <select
                  value={form.collaborator_id || ''}
                  onChange={(e) => handleSelectCollaborator(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-cyan-700 font-semibold text-sm"
                >
                  <option value="">Nessun Collaboratore Esercitante</option>
                  {collaborators.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Provvigione Ricorrente (€/mese)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.collaborator_commission_fee || 0}
                  onChange={(e) => setForm({ ...form, collaborator_commission_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-cyan-700 font-mono font-bold text-sm"
                  disabled={!form.collaborator_id}
                />
              </div>

              <div>
                <label className="text-gray-500 mb-1 block">Costo Installazione Una-Tantum (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.installation_fee || 0}
                  onChange={(e) => setForm({ ...form, installation_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-purple-700 font-mono font-bold text-sm"
                />
              </div>
            </div>

            {/* Tabella Ripartizione Costo Installazione Multi-Collaboratore */}
            {installationFee > 0 && (
              <div className="mt-3 p-4 bg-white rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <Building2 size={14} className="text-purple-600" />
                      <span>Ripartizione Quota Installazione tra Tecnici / Collaboratori</span>
                    </h4>
                    <p className="text-[11px] text-gray-400">Definisci a chi è destinata la tantum di € {installationFee.toFixed(2)}. La quota non assegnata resta all'Azienda.</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddSplitRow}
                    disabled={installationSplits.length >= collaborators.length}
                    className="px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Plus size={13} /> Aggiungi Collaboratore
                  </button>
                </div>

                {installationSplits.length === 0 ? (
                  <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100 text-purple-800 text-xs flex items-center justify-between font-mono">
                    <span>Nessun tecnico specificato per l'installazione: l'intero importo di € {installationFee.toFixed(2)} sarà registrato come **Incasso Netto Aziendale**.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {installationSplits.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <select
                          value={row.collaborator_id}
                          onChange={(e) => handleUpdateSplitRow(idx, 'collaborator_id', Number(e.target.value))}
                          className="bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-900 font-semibold flex-1"
                        >
                          {collaborators.map((c) => (
                            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-gray-500 font-mono">Quota (€):</span>
                          <input
                            type="number"
                            step="0.01"
                            value={row.amount}
                            onChange={(e) => handleUpdateSplitRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-28 bg-white border border-gray-300 rounded-lg p-2 text-xs font-mono font-bold text-purple-700"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveSplitRow(idx)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between text-xs pt-1 px-1">
                      <span className="text-gray-500">Totale assegnato ai collaboratori: <strong className="font-mono text-purple-700">€ {totalSplitsAmount.toFixed(2)}</strong></span>
                      <span className="text-gray-700 font-semibold">Quota Netta Trattenuta dal WISP: <strong className="font-mono text-emerald-700 font-bold">€ {netWispInstallationFee.toFixed(2)}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SEZIONE 5: Stato Iniziale & Flag Incasso Immediato */}
          <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-200 space-y-4">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2 pb-2 border-b border-blue-200">
              <CheckSquare size={16} className="text-blue-600" />
              <span>5. Stato Iniziale & Flag Incasso Immediato</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div>
                <label className="text-gray-600 mb-1 block">Stato Iniziale Cliente</label>
                <select
                  value={form.status || 'ACTIVE'}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-semibold"
                >
                  <option value="ACTIVE">🟢 Attivo (Fatturazione Regolare)</option>
                  <option value="SUSPENDED">🟡 Sospeso (Mancato Pagamento)</option>
                  <option value="PROSPECT">🔵 Prospect / In Attivazione</option>
                  <option value="CANCELLED">🔴 Disdetto</option>
                </select>
              </div>

              {!isEditing && (
                <>
                  <label className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-blue-200 cursor-pointer hover:bg-blue-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={!!form.already_paid_this_period}
                      onChange={(e) => setForm({ ...form, already_paid_this_period: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-gray-900 block">Canone Mese Iniziale Già Pagato</span>
                      <span className="text-[11px] text-gray-500 block">Segna il primo canone subito come SALDATO</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-blue-200 cursor-pointer hover:bg-blue-50/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={!!form.already_paid_installation}
                      onChange={(e) => setForm({ ...form, already_paid_installation: e.target.checked })}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-gray-900 block">Installazione Una-Tantum Già Pagata</span>
                      <span className="text-[11px] text-gray-500 block">Segna il costo di installazione subito come SALDATO</span>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Footer Azioni */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving || !form.first_name || !form.last_name}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 cursor-pointer disabled:opacity-40 flex items-center gap-2"
            >
              <ShieldCheck size={16} />
              <span>{saving ? 'Salvataggio in corso...' : isEditing ? 'Salva Modifiche Cliente' : 'Conferma Nuova Attivazione'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
