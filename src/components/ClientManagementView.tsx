import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import { ClientDetailModal } from './ClientDetailModal';
import { ClientFormModal } from './ClientFormModal';
import { ClientYearStrip } from './ClientYearStrip';
import { MikrotikImportModal } from './beta/MikrotikImportModal';
import type { Client, ClientStatus, Collaborator, NetworkNode, Plan, ClientSavePayload, Payment } from '../types';
import { BILLING_CYCLE_INFO } from '../types';
import { localDateString } from '../dateUtils';
import {
  Users,
  Plus,
  Search,
  Wifi,
  Network,
  Trash2,
  Edit3,
  Radio,
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
  Table2,
  Upload,
  Filter,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  CalendarRange
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

function phoneDigitsForWhatsApp(phone: string): string {
  return phone.replace(/[^\d]/g, '');
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
  const [showMikrotikModal, setShowMikrotikModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Set<number>>(new Set());
  const [detailClientId, setDetailClientId] = useState<number | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stripYear, setStripYear] = useState(() => Number(localDateString().slice(0, 4)));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [c, collabs, p, nodes, pay] = await Promise.all([
      dbService.getClients(),
      dbService.getCollaborators(),
      dbService.getPlans(),
      dbService.getNetworkNodes(),
      dbService.getPayments(),
    ]);
    setClients(c);
    setCollaborators(collabs);
    setPlans(p);
    setNetworkNodes(nodes);
    setPayments(pay);
  };

  // Raggruppati una sola volta per evitare un filter() su tutti i pagamenti per ogni singola scheda cliente.
  const paymentsByClientId = React.useMemo(() => {
    const map = new Map<number, Payment[]>();
    for (const p of payments) {
      const list = map.get(p.client_id) || [];
      list.push(p);
      map.set(p.client_id, list);
    }
    return map;
  }, [payments]);

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
        notify(`Importati ${result.imported} di ${result.total} clienti.`, 'success');
        loadData();
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nell'importazione.", 'error');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleMikrotikImport = async (accounts: any[]) => {
    if (accounts.length === 0) return;
    try {
      const defPlan = plans.length > 0 ? plans[0].id : null;
      const defCollab = collaborators.length > 0 ? collaborators[0].id : null;

      for (const acc of accounts) {
        const baseName = acc.comment ? acc.comment.trim() : (acc.name || 'Sconosciuto');
        const isPppoe = acc.type === 'pppoe';
        
        await dbService.saveClient({
          first_name: baseName,
          last_name: '[Importato]',
          status: 'ACTIVE',
          plan_id: defPlan,
          collaborator_id: defCollab,
          address: 'Da Mikrotik',
          phone: '',
          tax_code: '',
          assigned_ip: acc.remote_address || '',
          mac_address: acc.caller_id || '',
          device_model: isPppoe ? 'PPPoE Client' : 'DHCP Client',
          pppoe_username: isPppoe ? acc.name : '',
          pppoe_password: acc.password || '',
          billing_cycle: 'MONTHLY',
          monthly_fee: 0,
          installation_fee: 0,
          notes: 'Importato via NMS Mikrotik'
        } as any);
      }
      notify(`${accounts.length} clienti importati da Mikrotik con successo.`, 'success');
      loadData();
    } catch (error: any) {
      notify(`Errore durante il salvataggio dei clienti importati: ${error.message}`, 'error');
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

  const handleSavePayload = async (payload: ClientSavePayload) => {
    await dbService.saveClient(payload);
    notify(payload.id ? 'Cliente aggiornato con successo.' : 'Nuova attivazione cliente completata!', 'success');
    setShowModal(false);
    loadData();
  };

  const handleOpenNewModal = () => {
    setEditingClient(null);
    setShowModal(true);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirmDialog('Sei sicuro di voler eliminare questo cliente? Le informazioni storiche rimarranno conservate.');
    if (ok) {
      await dbService.deleteClient(id);
      notify('Cliente eliminato.', 'success');
      loadData();
    }
  };

  const filteredClients = clients.filter(c => {
    const matchesSearch =
      !search.trim() ||
      c.first_name.toLowerCase().includes(search.toLowerCase()) ||
      c.last_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.assigned_ip && c.assigned_ip.includes(search)) ||
      (c.mac_address && c.mac_address.toLowerCase().includes(search.toLowerCase())) ||
      (c.pppoe_username && c.pppoe_username.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesPlan = planFilter === 'ALL' || c.plan_id === planFilter;
    const matchesCollab = collaboratorFilter === 'ALL' || c.collaborator_id === collaboratorFilter;

    return matchesSearch && matchesStatus && matchesPlan && matchesCollab;
  });

  const handleOpenCpe = async (e: React.MouseEvent, ip: string) => {
    e.stopPropagation();
    try {
      const creds = await dbService.getBetaCpeCredentials();
      if (creds.password) {
        navigator.clipboard.writeText(creds.password);
      }
      window.wispcore.system.openExternal(`https://${ip}`);
      notify(`Browser aperto per ${ip}. Password '${creds.username}' copiata negli appunti!`, 'success');
    } catch (err) {
      notify('Impossibile recuperare credenziali CPE', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Bar Widescreen */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="text-blue-600" size={24} />
            <span>Gestione Anagrafica & Attivazioni Clienti WISP</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gestione completa utenti rete, contratti, parametri PPPoE, IP e provvigioni</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            onClick={() => setShowMikrotikModal(true)}
            title="Importa da Router Mikrotik (NMS)"
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-3 rounded-xl cursor-pointer transition-colors"
          >
            <HardDrive size={15} /> <span className="hidden lg:inline">Importa Mikrotik</span>
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

      {/* Barre di Filtro */}
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

        {/* Anno del calendario pagamenti mostrato sotto ogni scheda cliente - un solo
            selettore condiviso, così tutte le strisce restano confrontabili tra loro. */}
        <div className="flex items-center gap-1 ml-auto bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
          <CalendarRange size={13} className="text-gray-400 mr-1" />
          <button onClick={() => setStripYear((y) => y - 1)} className="p-0.5 text-gray-500 hover:text-gray-900 cursor-pointer" title="Anno precedente">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-mono font-bold text-gray-700 w-10 text-center">{stripYear}</span>
          <button onClick={() => setStripYear((y) => y + 1)} className="p-0.5 text-gray-500 hover:text-gray-900 cursor-pointer" title="Anno successivo">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Lista Schede Clienti */}
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
                  <div className="text-sm">
                    {client.assigned_ip ? (
                      <button onClick={(e) => handleOpenCpe(e, client.assigned_ip!)} className="text-blue-700 hover:text-blue-900 font-bold font-mono cursor-pointer transition-colors" title="Apri interfaccia web">
                        {client.assigned_ip}
                      </button>
                    ) : (
                      <span className="text-blue-700 font-bold">10.100.X.X</span>
                    )}
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

              <div className="pt-3 mt-1 border-t border-gray-100">
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5">Canone {stripYear} — verde saldato, giallo in attesa, rosso insoluto</div>
                <ClientYearStrip payments={paymentsByClientId.get(client.id) || []} year={stripYear} />
              </div>
            </div>
          ))
        )}
      </div>

      {detailClientId !== null && (
        <ClientDetailModal clientId={detailClientId} onClose={() => setDetailClientId(null)} />
      )}

      {showModal && (
        <ClientFormModal
          client={editingClient as Client}
          collaborators={collaborators}
          plans={plans}
          networkNodes={networkNodes}
          onSave={handleSavePayload}
          onClose={() => setShowModal(false)}
        />
      )}

      {showMikrotikModal && (
        <MikrotikImportModal 
          isOpen={showMikrotikModal} 
          onClose={() => setShowMikrotikModal(false)} 
          onImportSelected={handleMikrotikImport}
          existingClients={clients} 
        />
      )}
    </div>
  );
};
