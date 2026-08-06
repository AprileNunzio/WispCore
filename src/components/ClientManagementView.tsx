import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import { ClientDetailModal } from './ClientDetailModal';
import type { Client, ClientStatus, Collaborator, NetworkNode, Plan, BillingCycle } from '../types';
import { BILLING_CYCLE_INFO } from '../types';
import {
  Users,
  Plus,
  Search,
  Wifi,
  Network,
  Trash2,
  Edit3,
  X,
  Radio,
  DollarSign,
  FileText,
  UserCheck,
  Eye,
  EyeOff,
  ClipboardList,
  PackageSearch,
  TrendingUp,
  MessageCircle,
  MapPin,
  Paperclip,
  FileSignature,
  Table2,
  Upload,
  Filter
} from 'lucide-react';

interface Props {
  initialSearchQuery?: string;
}

const STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Attivo',
  SUSPENDED: 'Sospeso',
  CANCELLED: 'Disdetto',
  PROSPECT: 'Prospect',
};

const STATUS_BADGE: Record<ClientStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  PROSPECT: 'bg-blue-50 text-blue-700 border-blue-200',
};

/** Numero di telefono ripulito in formato E.164-ish per il link WhatsApp (wa.me vuole solo cifre, senza +/spazi/trattini). */
function phoneDigitsForWhatsApp(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/** Somma un numero di mesi a una data "YYYY-MM-DD", usata per proporre la prossima scadenza in base al ciclo di fatturazione. */
function addMonthsToDateStr(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export const ClientManagementView: React.FC<Props> = ({ initialSearchQuery = '' }) => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [clients, setClients] = useState<Client[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [networkNodes, setNetworkNodes] = useState<NetworkNode[]>([]);
  const [search, setSearch] = useState(initialSearchQuery);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClientStatus>('ALL');
  const [planFilter, setPlanFilter] = useState<'ALL' | number>('ALL');
  const [collaboratorFilter, setCollaboratorFilter] = useState<'ALL' | number>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Set<number>>(new Set());
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [detailClientId, setDetailClientId] = useState<number | null>(null);
  const [isAttachingDoc, setIsAttachingDoc] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [c, collabs, p, nodes] = await Promise.all([
      dbService.getClients(),
      dbService.getCollaborators(),
      dbService.getPlans(),
      dbService.getNetworkNodes(),
    ]);
    setClients(c);
    setCollaborators(collabs);
    setPlans(p);
    setNetworkNodes(nodes);
  };

  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const filePath = await dbService.exportClientsCsv();
      if (filePath) notify(`Export completato: ${filePath}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nell'esportazione.", 'error');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleImportCsv = async () => {
    setIsImportingCsv(true);
    try {
      const result = await dbService.importClientsCsv();
      if (result) {
        notify(`Importati ${result.imported} di ${result.total} clienti${result.errors.length ? ` (${result.errors.length} righe con errori)` : ''}.`, result.errors.length ? 'info' : 'success');
        loadData();
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nell'importazione.", 'error');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleWhatsApp = (phone: string) => {
    const digits = phoneDigitsForWhatsApp(phone);
    if (!digits) return;
    dbService.openExternal(`https://wa.me/${digits}`).catch(() => notify('Impossibile aprire WhatsApp.', 'error'));
  };

  const handleOpenMaps = (address: string) => {
    dbService.openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
      .catch(() => notify('Impossibile aprire Google Maps.', 'error'));
  };

  const handleAttachDocument = async (clientId: number) => {
    setIsAttachingDoc(true);
    try {
      const path = await dbService.attachContractDocument(clientId);
      if (path) {
        notify('Documento di contratto allegato.', 'success');
        loadData();
        setEditingClient((prev) => (prev ? { ...prev, contract_document_path: path } : prev));
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nell'allegare il documento.", 'error');
    } finally {
      setIsAttachingDoc(false);
    }
  };

  const handleOpenDocument = async (clientId: number) => {
    try {
      await dbService.openContractDocument(clientId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossibile aprire il documento.', 'error');
    }
  };

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleOpenNewModal = () => {
    setEditingClient({
      first_name: '',
      last_name: '',
      tax_code: '',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
      billing_cycle: 'MONTHLY',
      monthly_fee: 29.90,
      installation_fee: 100.00,
      collaborator_commission_fee: 0,
      contract_start_date: '',
      contract_end_date: '',
      contract_notes: '',
      pppoe_username: '',
      pppoe_password: '',
      mac_address: '',
      assigned_ip: '',
      device_model: 'Ubiquiti LiteBeam 5AC',
      notes: ''
    });
    setFormPasswordVisible(false);
    setShowModal(true);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormPasswordVisible(false);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDialog('Sei sicuro di voler eliminare questo cliente? Tutti i relativi dati tecnici e pagamenti verranno cancellati.');
    if (!confirmed) return;
    await dbService.deleteClient(id);
    notify('Cliente eliminato.', 'success');
    loadData();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient?.first_name || !editingClient?.last_name) return;

    await dbService.saveClient(editingClient);
    notify(editingClient.id ? 'Cliente aggiornato con successo.' : 'Nuovo cliente WISP attivato.', 'success');
    setShowModal(false);
    setEditingClient(null);
    loadData();
  };

  const handleSelectPlan = (planId: number | null) => {
    if (!editingClient) return;
    const plan = plans.find((p) => p.id === planId);
    setEditingClient({
      ...editingClient,
      plan_id: planId,
      ...(plan ? { monthly_fee: plan.monthly_fee, installation_fee: plan.installation_fee } : {}),
    });
  };

  const handleSelectCollaborator = (collabId: number | null) => {
    if (!editingClient) return;
    // Nessuna proposta automatica: il guadagno va sempre concordato ed
    // inserito esplicitamente per il singolo cliente, non c'è più un
    // "default" del collaboratore da precompilare.
    setEditingClient({
      ...editingClient,
      collaborator_id: collabId,
      collaborator_commission_fee: editingClient.collaborator_commission_fee || 0,
    });
  };

  const filteredClients = clients.filter(c => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (planFilter !== 'ALL' && c.plan_id !== planFilter) return false;
    if (collaboratorFilter !== 'ALL' && c.collaborator_id !== collaboratorFilter) return false;

    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      c.first_name.toLowerCase().includes(query) ||
      c.last_name.toLowerCase().includes(query) ||
      (c.assigned_ip && c.assigned_ip.includes(query)) ||
      (c.mac_address && c.mac_address.toLowerCase().includes(query)) ||
      (c.pppoe_username && c.pppoe_username.toLowerCase().includes(query)) ||
      (c.tax_code && c.tax_code.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="text-blue-600" size={24} />
            <span>Gestione Anagrafica</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Configurazione PPPoE, indirizzi IP, MAC Address e contratti di fatturazione</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            title="Esporta clienti in CSV"
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-3 rounded-xl cursor-pointer transition-colors disabled:opacity-50"
          >
            <Table2 size={15} /> <span className="hidden lg:inline">Esporta CSV</span>
          </button>
          <button
            onClick={handleImportCsv}
            disabled={isImportingCsv}
            title="Importa clienti da CSV"
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-3 rounded-xl cursor-pointer transition-colors disabled:opacity-50"
          >
            <Upload size={15} /> <span className="hidden lg:inline">Importa CSV</span>
          </button>
          <button
            onClick={handleOpenNewModal}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg shadow-blue-600/20 border border-blue-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Plus size={16} />
            <span>Nuovo Cliente WISP</span>
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-gray-200 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-3 text-gray-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtra per Nome, IP, MAC Address o Username PPPoE..."
            className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pl-11 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all font-mono shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400"><Filter size={13} /> Filtri:</div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ClientStatus)}
          className="bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-700">
          <option value="ALL">Tutti gli stati</option>
          {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          className="bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-700">
          <option value="ALL">Tutti i piani</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={collaboratorFilter} onChange={(e) => setCollaboratorFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          className="bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-700">
          <option value="ALL">Tutti i collaboratori</option>
          {collaborators.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredClients.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center text-gray-400 text-sm">
            Nessun cliente WISP trovato con i filtri correnti.
          </div>
        ) : (
          filteredClients.map(client => (
            <div
              key={client.id}
              className={`glass-panel rounded-2xl p-5 border transition-all text-sm ${client.status === 'CANCELLED' ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-sm shrink-0">
                    {client.first_name[0]}{client.last_name[0]}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                      <span>{client.first_name} {client.last_name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[client.status]}`}>
                        {STATUS_LABELS[client.status]}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">
                        Cod: WISP-00{client.id}
                      </span>
                      {client.plan_name && (
                        <span className="text-xs font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 flex items-center gap-1">
                          <PackageSearch size={10} /> {client.plan_name}
                        </span>
                      )}
                      {client.network_node_name && (
                        <span className="text-xs font-mono px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded border border-cyan-200 flex items-center gap-1">
                          <Radio size={10} /> {client.network_node_name}
                        </span>
                      )}
                    </h3>
                    <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{client.address || 'Indirizzo non inserito'} • CF/PIVA: {client.tax_code || 'N/D'}</span>
                      {client.address && (
                        <button onClick={() => handleOpenMaps(client.address!)} className="text-blue-600 hover:text-blue-700 cursor-pointer inline-flex items-center gap-0.5" title="Apri in Google Maps">
                          <MapPin size={11} />
                        </button>
                      )}
                      {client.phone && (
                        <button onClick={() => handleWhatsApp(client.phone!)} className="text-emerald-600 hover:text-emerald-700 cursor-pointer inline-flex items-center gap-0.5" title="Scrivi su WhatsApp">
                          <MessageCircle size={11} />
                        </button>
                      )}
                      {client.contract_document_path && (
                        <button onClick={() => handleOpenDocument(client.id)} className="text-amber-600 hover:text-amber-700 cursor-pointer inline-flex items-center gap-0.5" title="Apri documento di contratto">
                          <Paperclip size={11} />
                        </button>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-gray-50 p-2.5 rounded-xl border border-gray-200 shrink-0">
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase block">Canone Ricorrente</span>
                    <span className="font-mono font-bold text-sm text-emerald-700">€ {client.monthly_fee.toFixed(2)} — {BILLING_CYCLE_INFO[client.billing_cycle].label}</span>
                  </div>
                  <div className="border-l border-gray-200 pl-4">
                    <span className="text-[11px] text-gray-400 uppercase block">Installazione</span>
                    <span className="font-mono text-sm text-gray-600">€ {client.installation_fee.toFixed(2)}</span>
                  </div>
                  {client.next_due_date && (
                    <div className="border-l border-gray-200 pl-4">
                      <span className="text-[11px] text-gray-400 uppercase block">Prossima Scadenza</span>
                      <span className="font-mono text-sm text-amber-700">{client.next_due_date}</span>
                    </div>
                  )}
                  {client.collaborator_name && client.collaborator_name !== 'Nessuno' && (
                    <div className="border-l border-gray-200 pl-4">
                      <span className="text-[11px] text-gray-400 uppercase block">Collaboratore</span>
                      <span className="text-sm text-cyan-700 font-semibold flex items-center gap-1">
                        <UserCheck size={12} /> {client.collaborator_name}
                      </span>
                      {!!client.collaborator_commission_fee && (
                        <span className="text-[11px] text-gray-400 flex items-center gap-1"><TrendingUp size={10} /> € {client.collaborator_commission_fee.toFixed(2)}/mese</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setDetailClientId(client.id)}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-emerald-600 rounded-lg border border-gray-200 transition-colors cursor-pointer"
                    title="Vedi Dettagli e Storico Pagamenti"
                  >
                    <ClipboardList size={15} />
                  </button>
                  <button
                    onClick={() => handleEdit(client)}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-blue-600 rounded-lg border border-gray-200 transition-colors cursor-pointer"
                    title="Modifica Cliente"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="p-2 bg-gray-100 hover:bg-rose-50 text-rose-600 rounded-lg border border-gray-200 hover:border-rose-300 transition-colors cursor-pointer"
                    title="Elimina"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1">
                    <Wifi size={12} className="text-cyan-600" /> Credenziali PPPoE
                  </div>
                  <div className="text-cyan-700 font-semibold text-xs truncate">
                    {client.pppoe_username || 'Non configurato'}
                  </div>
                  <div className="text-gray-500 text-[11px] truncate flex items-center gap-1.5">
                    <span>Pass: {visiblePasswordIds.has(client.id) ? (client.pppoe_password || 'N/D') : '••••••••'}</span>
                    {client.pppoe_password && (
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(client.id)}
                        className="text-gray-400 hover:text-cyan-700 cursor-pointer shrink-0"
                        title={visiblePasswordIds.has(client.id) ? 'Nascondi password' : 'Mostra password'}
                      >
                        {visiblePasswordIds.has(client.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1">
                    <Network size={12} className="text-blue-600" /> Indirizzo IP Assegnato
                  </div>
                  <div className="text-blue-700 font-bold text-sm">
                    {client.assigned_ip || '10.100.X.X'}
                  </div>
                  <div className="text-gray-400 text-[11px]">Subnet /32 Static</div>
                </div>

                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1">
                    <Radio size={12} className="text-emerald-600" /> Dispositivo & MAC
                  </div>
                  <div className="text-gray-700 text-xs font-semibold truncate">
                    {client.device_model || 'CPE WISP Standard'}
                  </div>
                  <div className="text-emerald-700 text-[11px]">{client.mac_address || '00:00:00:00:00:00'}</div>
                </div>

                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 font-sans">
                  <div className="text-[11px] text-gray-400 uppercase flex items-center gap-1 mb-1">
                    <FileText size={12} className="text-amber-600" /> Contatto & Note
                  </div>
                  <div className="text-gray-600 text-xs truncate">{client.phone || client.email || 'Nessun recapito'}</div>
                  <div className="text-gray-400 text-[11px] truncate">{client.notes || 'Nessuna nota aggiuntiva'}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {detailClientId !== null && (
        <ClientDetailModal clientId={detailClientId} onClose={() => setDetailClientId(null)} />
      )}

      {showModal && editingClient && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editingClient.id ? 'Modifica Scheda Cliente WISP' : 'Nuova Attivazione Cliente WISP'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Dati Anagrafici & Contatto</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-500 mb-1 block">Nome *</label>
                    <input
                      type="text"
                      required
                      value={editingClient.first_name || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, first_name: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Cognome / Ragione Sociale *</label>
                    <input
                      type="text"
                      required
                      value={editingClient.last_name || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, last_name: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Codice Fiscale / P.IVA</label>
                    <input
                      type="text"
                      value={editingClient.tax_code || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, tax_code: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Indirizzo di Installazione</label>
                    <input
                      type="text"
                      value={editingClient.address || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, address: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Telefono</label>
                    <input
                      type="text"
                      value={editingClient.phone || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Email</label>
                    <input
                      type="email"
                      value={editingClient.email || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                <h4 className="text-xs font-semibold text-cyan-700 uppercase tracking-wider flex items-center gap-1">
                  <Wifi size={14} /> Dettagli Tecnici WISP & Rete
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-500 mb-1 block font-mono">PPPoE Username</label>
                    <input
                      type="text"
                      value={editingClient.pppoe_username || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, pppoe_username: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-cyan-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block font-mono">PPPoE Password</label>
                    <div className="relative">
                      <input
                        type={formPasswordVisible ? 'text' : 'password'}
                        value={editingClient.pppoe_password || ''}
                        onChange={(e) => setEditingClient({ ...editingClient, pppoe_password: e.target.value })}
                        className="w-full bg-white border border-gray-300 rounded-lg p-3 pr-10 text-gray-900 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setFormPasswordVisible((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-700 cursor-pointer"
                      >
                        {formPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block font-mono">MAC Address Dispositivo</label>
                    <input
                      type="text"
                      placeholder="es. D8:50:E6:91:A4:0B"
                      value={editingClient.mac_address || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, mac_address: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-emerald-700 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block font-mono">IP Statico Assegnato</label>
                    <input
                      type="text"
                      placeholder="es. 10.100.14.22"
                      value={editingClient.assigned_ip || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, assigned_ip: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-blue-700 font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-gray-500 mb-1 block">Modello Apparato / CPE</label>
                    <input
                      type="text"
                      value={editingClient.device_model || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, device_model: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    />
                  </div>
                </div>
              </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign size={14} /> Piano, Fatturazione & Collaboratore
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-3">
                    <label className="text-gray-500 mb-1 block">Piano Internet</label>
                    <select
                      value={editingClient.plan_id || ''}
                      onChange={(e) => handleSelectPlan(e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-blue-700"
                    >
                      <option value="">Nessun piano / personalizzato</option>
                      {plans.filter(p => p.active).map(p => (
                        <option key={p.id} value={p.id}>{p.name} — € {p.monthly_fee.toFixed(2)}/mese</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Ogni Quanto Paga il Cliente</label>
                    <select
                      value={editingClient.billing_cycle || 'MONTHLY'}
                      onChange={(e) => setEditingClient({ ...editingClient, billing_cycle: e.target.value as BillingCycle })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    >
                      {(Object.keys(BILLING_CYCLE_INFO) as BillingCycle[]).map((cycle) => (
                        <option key={cycle} value={cycle}>{BILLING_CYCLE_INFO[cycle].label}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Determina ogni quanto viene generata in automatico la prossima scadenza quando segni un canone come saldato.
                    </p>
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Canone Ricorrente (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingClient.monthly_fee || 0}
                      onChange={(e) => setEditingClient({ ...editingClient, monthly_fee: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-emerald-700 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Costo Installazione Una-Tantum (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingClient.installation_fee || 0}
                      onChange={(e) => setEditingClient({ ...editingClient, installation_fee: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Data Ultimo Pagamento</label>
                    <input
                      type="date"
                      value={editingClient.last_payment_date || ''}
                      onChange={(e) => {
                        const lastPaymentDate = e.target.value;
                        const cycleMonths = BILLING_CYCLE_INFO[editingClient.billing_cycle || 'MONTHLY'].months;
                        setEditingClient({
                          ...editingClient,
                          last_payment_date: lastPaymentDate,
                          // Propone da sola la prossima scadenza in base al ciclo di fatturazione: resta comunque modificabile a mano subito dopo.
                          next_due_date: lastPaymentDate ? addMonthsToDateStr(lastPaymentDate, cycleMonths) : editingClient.next_due_date,
                        });
                      }}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Prossima Scadenza Pagamento</label>
                    <input
                      type="date"
                      value={editingClient.next_due_date || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, next_due_date: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-amber-700 font-mono"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Proposta automaticamente dalla Data Ultimo Pagamento in base al ciclo scelto sopra; modificabile a mano.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-gray-500 mb-1 block">Collaboratore di Riferimento</label>
                    <select
                      value={editingClient.collaborator_id || ''}
                      onChange={(e) => handleSelectCollaborator(e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-cyan-700"
                    >
                      <option value="">Nessun Collaboratore Esercitante</option>
                      {collaborators.map(col => (
                        <option key={col.id} value={col.id}>{col.first_name} {col.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Provvigione Ricorrente (€/mese)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingClient.collaborator_commission_fee || 0}
                      onChange={(e) => setEditingClient({ ...editingClient, collaborator_commission_fee: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-cyan-700 font-mono font-bold"
                      disabled={!editingClient.collaborator_id}
                    />
                  </div>
                  {!!editingClient.collaborator_id && !!editingClient.collaborator_commission_fee && (
                    <p className="sm:col-span-3 text-[11px] text-gray-400">
                      Ogni canone ricorrente pagato dal cliente genererà automaticamente una provvigione di € {Number(editingClient.collaborator_commission_fee).toFixed(2)} per il collaboratore.
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                  <FileSignature size={14} /> Stato, Contratto & Localizzazione
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-gray-500 mb-1 block">Stato Cliente</label>
                    <select
                      value={editingClient.status || 'ACTIVE'}
                      onChange={(e) => setEditingClient({ ...editingClient, status: e.target.value as ClientStatus })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                    >
                      {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  {editingClient.status === 'CANCELLED' && (
                    <div className="sm:col-span-2">
                      <label className="text-gray-500 mb-1 block">Motivo della Disdetta</label>
                      <input
                        type="text"
                        value={editingClient.cancellation_reason || ''}
                        onChange={(e) => setEditingClient({ ...editingClient, cancellation_reason: e.target.value })}
                        placeholder="es. Passato alla concorrenza, trasferito, insoddisfatto del servizio..."
                        className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-gray-500 mb-1 block">Nodo di Rete (BTS/Ripetitore)</label>
                    <select
                      value={editingClient.network_node_id || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, network_node_id: e.target.value ? Number(e.target.value) : null })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-cyan-700"
                    >
                      <option value="">Nessuno / non assegnato</option>
                      {networkNodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Inizio Contratto</label>
                    <input type="date" value={editingClient.contract_start_date || ''} onChange={(e) => setEditingClient({ ...editingClient, contract_start_date: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono" />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Fine Contratto / Rinnovo</label>
                    <input type="date" value={editingClient.contract_end_date || ''} onChange={(e) => setEditingClient({ ...editingClient, contract_end_date: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono" />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Latitudine</label>
                    <input type="number" step="any" placeholder="es. 41.9028" value={editingClient.latitude ?? ''}
                      onChange={(e) => setEditingClient({ ...editingClient, latitude: e.target.value ? Number(e.target.value) : null })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono" />
                  </div>
                  <div>
                    <label className="text-gray-500 mb-1 block">Longitudine</label>
                    <input type="number" step="any" placeholder="es. 12.4964" value={editingClient.longitude ?? ''}
                      onChange={(e) => setEditingClient({ ...editingClient, longitude: e.target.value ? Number(e.target.value) : null })}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 font-mono" />
                  </div>
                  <p className="sm:col-span-3 text-[11px] text-gray-400 -mt-1">Coordinate usate nella vista "Copertura & Rete". Puoi copiarle da Google Maps (click destro su un punto → "Cosa c'è qui").</p>
                  <div className="sm:col-span-3">
                    <label className="text-gray-500 mb-1 block">Note Contrattuali</label>
                    <textarea value={editingClient.contract_notes || ''} onChange={(e) => setEditingClient({ ...editingClient, contract_notes: e.target.value })} rows={2}
                      placeholder="Durata minima, penali di recesso, condizioni particolari..."
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900" />
                  </div>
                  <div className="sm:col-span-3 flex items-center gap-2">
                    {editingClient.id ? (
                      <>
                        <button type="button" onClick={() => handleAttachDocument(editingClient.id!)} disabled={isAttachingDoc}
                          className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2.5 rounded-xl cursor-pointer disabled:opacity-50">
                          <Paperclip size={13} /> {isAttachingDoc ? 'Caricamento...' : editingClient.contract_document_path ? 'Sostituisci Documento' : 'Allega Documento Contratto'}
                        </button>
                        {editingClient.contract_document_path && (
                          <button type="button" onClick={() => handleOpenDocument(editingClient.id!)}
                            className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold px-3 py-2.5 rounded-xl cursor-pointer">
                            <FileText size={13} /> Apri Documento
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-400">Salva prima il cliente per poter allegare un documento di contratto.</p>
                    )}
                  </div>
                </div>
              </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Salva Cliente WISP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
