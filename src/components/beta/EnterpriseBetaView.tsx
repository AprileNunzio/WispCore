import React, { useState, useEffect } from 'react';
import { dbService } from '../../dbService';
import { useToast, useConfirm } from '../Toast';
import { Network, Server, KeyRound, Wifi, Router, Activity, ShieldCheck, Database, Save, Plus, Trash2 } from 'lucide-react';
import type { BetaNasRouter, BetaIpamSubnet, BetaRadiusSettings } from '../../types';

export const EnterpriseBetaView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  
  const [activeTab, setActiveTab] = useState<'nms' | 'radius' | 'ipam'>('nms');

  // --- NMS State ---
  const [routers, setRouters] = useState<BetaNasRouter[]>([]);
  const [showRouterModal, setShowRouterModal] = useState(false);
  const [routerForm, setRouterForm] = useState<Partial<BetaNasRouter>>({});

  // --- RADIUS State ---
  const [radiusSettings, setRadiusSettings] = useState<BetaRadiusSettings>({ enabled: false, secret: '', coa_port: 3799, disconnect_on_overdue: false });

  // --- IPAM State ---
  const [subnets, setSubnets] = useState<BetaIpamSubnet[]>([]);
  const [showSubnetModal, setShowSubnetModal] = useState(false);
  const [subnetForm, setSubnetForm] = useState<Partial<BetaIpamSubnet>>({});
  const [selectedSubnet, setSelectedSubnet] = useState<BetaIpamSubnet | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      if (activeTab === 'nms') {
        setRouters(await dbService.getBetaNasRouters());
      } else if (activeTab === 'radius') {
        setRadiusSettings(await dbService.getBetaRadiusSettings());
      } else if (activeTab === 'ipam') {
        setSubnets(await dbService.getBetaIpamSubnets());
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore durante il caricamento dei dati beta.', 'error');
    }
  };

  // --- NMS Actions ---
  const handleSaveRouter = async () => {
    if (!routerForm.name || !routerForm.ip_address || !routerForm.api_port || !routerForm.username) {
      notify('Compila tutti i campi obbligatori del NAS', 'error');
      return;
    }
    try {
      await dbService.saveBetaNasRouter(routerForm);
      notify('NAS salvato con successo', 'success');
      setShowRouterModal(false);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore salvataggio NAS', 'error');
    }
  };

  const handleDeleteRouter = async (id: number) => {
    const ok = await confirmDialog('Sicuro di voler eliminare questo NAS?');
    if (!ok) return;
    try {
      await dbService.deleteBetaNasRouter(id);
      notify('NAS eliminato', 'success');
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore', 'error');
    }
  };

  // --- RADIUS Actions ---
  const handleSaveRadius = async () => {
    try {
      await dbService.saveBetaRadiusSettings(radiusSettings);
      notify('Impostazioni RADIUS salvate', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore', 'error');
    }
  };

  // --- IPAM Actions ---
  const handleSaveSubnet = async () => {
    if (!subnetForm.name || !subnetForm.cidr) {
      notify('Nome e CIDR obbligatori', 'error');
      return;
    }
    try {
      await dbService.saveBetaIpamSubnet(subnetForm);
      notify('Subnet salvata', 'success');
      setShowSubnetModal(false);
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore', 'error');
    }
  };

  // IP Math Helper
  const calculateIps = (cidr: string) => {
    try {
      const [ip, bits] = cidr.split('/');
      const mask = ~(Math.pow(2, 32 - parseInt(bits)) - 1);
      const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
      const network = ipNum & mask;
      const broadcast = network | ~mask;
      
      const ips = [];
      // Generiamo solo fino a /24 (254 IP) per non bloccare la UI in caso di /8
      const limit = Math.min(broadcast - 1, network + 254);
      for (let i = network + 1; i <= limit; i++) {
        ips.push([
          (i >>> 24) & 255,
          (i >>> 16) & 255,
          (i >>> 8) & 255,
          i & 255
        ].join('.'));
      }
      return ips;
    } catch (e) {
      return [];
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-gradient-to-r from-gray-900 to-indigo-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Database size={120} /></div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Server className="text-indigo-400" size={24} />
          <span>Laboratorio Enterprise (BETA)</span>
        </h1>
        <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
          Questi moduli sono isolati dal database di produzione (tabelle `beta_*`). Usali per configurare gli apparati, il provisioning e l'assegnazione IP in sicurezza.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
        <button onClick={() => setActiveTab('nms')} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'nms' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Router size={16} /> Apparati (NMS)
        </button>
        <button onClick={() => setActiveTab('radius')} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'radius' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <KeyRound size={16} /> RADIUS / AAA
        </button>
        <button onClick={() => setActiveTab('ipam')} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'ipam' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Network size={16} /> Gestione Subnet (IPAM)
        </button>
      </div>

      {/* NMS TAB */}
      {activeTab === 'nms' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Network Nodes (NAS / Mikrotik)</h2>
            <button onClick={() => { setRouterForm({ active: true, api_port: 8728 }); setShowRouterModal(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg">
              <Plus size={16} /> Aggiungi NAS
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {routers.map(router => (
              <div key={router.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all relative">
                <div className="absolute top-4 right-4">
                  <span className={`w-3 h-3 rounded-full inline-block ${router.active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Server size={24} /></div>
                  <div>
                    <h3 className="font-bold text-gray-900">{router.name}</h3>
                    <p className="text-xs font-mono text-gray-500">{router.ip_address}:{router.api_port}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-600 space-y-1 mb-4">
                  <p><strong>Utente API:</strong> {router.username}</p>
                  <p><strong>Status Password:</strong> {router.hasPassword ? 'Cifrata in DB' : 'Non impostata'}</p>
                  <p><strong>Secret RADIUS:</strong> {router.radius_secret ? 'Impostato' : 'Nessuno'}</p>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <button className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1"><Activity size={14}/> Ping Test</button>
                  <button onClick={() => handleDeleteRouter(router.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
            {routers.length === 0 && <p className="text-gray-400 text-sm col-span-3">Nessun apparato configurato. Aggiungine uno.</p>}
          </div>

          {showRouterModal && (
            <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <h3 className="text-xl font-bold text-gray-900">Nuovo NAS Mikrotik</h3>
                <div className="space-y-3 text-sm">
                  <div><label className="block text-gray-700 mb-1">Nome Identificativo</label><input type="text" className="w-full border rounded-lg p-2" value={routerForm.name || ''} onChange={e => setRouterForm({...routerForm, name: e.target.value})} placeholder="es. CCR-Core-Site1" /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2"><label className="block text-gray-700 mb-1">Indirizzo IP</label><input type="text" className="w-full border rounded-lg p-2 font-mono" value={routerForm.ip_address || ''} onChange={e => setRouterForm({...routerForm, ip_address: e.target.value})} placeholder="10.0.0.1" /></div>
                    <div><label className="block text-gray-700 mb-1">Porta API</label><input type="number" className="w-full border rounded-lg p-2 font-mono" value={routerForm.api_port || 8728} onChange={e => setRouterForm({...routerForm, api_port: parseInt(e.target.value)})} /></div>
                  </div>
                  <div><label className="block text-gray-700 mb-1">Utente API Mikrotik</label><input type="text" className="w-full border rounded-lg p-2" value={routerForm.username || ''} onChange={e => setRouterForm({...routerForm, username: e.target.value})} /></div>
                  <div><label className="block text-gray-700 mb-1">Password API</label><input type="password" className="w-full border rounded-lg p-2" value={routerForm.password || ''} onChange={e => setRouterForm({...routerForm, password: e.target.value})} /></div>
                  <div><label className="block text-gray-700 mb-1">Secret Condiviso RADIUS (Opzionale)</label><input type="password" className="w-full border rounded-lg p-2" value={routerForm.radius_secret || ''} onChange={e => setRouterForm({...routerForm, radius_secret: e.target.value})} /></div>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!routerForm.active} onChange={e => setRouterForm({...routerForm, active: e.target.checked})} /> Attivo e raggiungibile</label>
                </div>
                <div className="flex gap-2 pt-4">
                  <button onClick={() => setShowRouterModal(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-bold">Annulla</button>
                  <button onClick={handleSaveRouter} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Salva e Cifra</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RADIUS TAB */}
      {activeTab === 'radius' && (
        <div className="glass-panel bg-white p-6 rounded-2xl border border-gray-200 space-y-6 max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><ShieldCheck size={24} /></div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Provisioning AAA & RADIUS</h3>
              <p className="text-sm text-gray-500">Configurazione globale del server integrato</p>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" className="w-5 h-5 text-purple-600 rounded border-gray-300" checked={radiusSettings.enabled} onChange={e => setRadiusSettings({...radiusSettings, enabled: e.target.checked})} />
              <div>
                <span className="block font-bold text-gray-900">Abilita Server RADIUS Integrato</span>
                <span className="text-xs text-gray-500">In ascolto locale sulla porta 1812/1813 per Autenticazione e Accounting</span>
              </div>
            </label>

            <div>
              <label className="block text-gray-700 font-bold mb-1">Global Secret</label>
              <input type="password" placeholder="Shared secret..." value={radiusSettings.secret} onChange={e => setRadiusSettings({...radiusSettings, secret: e.target.value})} className="w-full p-3 bg-white border border-gray-300 rounded-xl font-mono" />
              <p className="text-xs text-gray-500 mt-1">Verrà usato come fallback se il NAS non ha un secret specifico.</p>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-1">Porta CoA (Change of Authorization)</label>
              <input type="number" value={radiusSettings.coa_port} onChange={e => setRadiusSettings({...radiusSettings, coa_port: parseInt(e.target.value)})} className="w-full p-3 bg-white border border-gray-300 rounded-xl font-mono" />
            </div>

            <label className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100 cursor-pointer hover:bg-red-100 transition-colors">
              <input type="checkbox" className="w-5 h-5 text-red-600 rounded border-red-300" checked={radiusSettings.disconnect_on_overdue} onChange={e => setRadiusSettings({...radiusSettings, disconnect_on_overdue: e.target.checked})} />
              <div>
                <span className="block font-bold text-red-900">Sospensione Automatica (Hard Disconnect)</span>
                <span className="text-xs text-red-700">Se abilitato, invia un pacchetto PoD/CoA ai router quando un cliente diventa moroso</span>
              </div>
            </label>

            <button onClick={handleSaveRadius} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg">
              <Save size={18} /> Salva Configurazione RADIUS
            </button>
          </div>
        </div>
      )}

      {/* IPAM TAB */}
      {activeTab === 'ipam' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800">Elenco Subnet</h2>
                <button onClick={() => { setSubnetForm({}); setShowSubnetModal(true); }} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg font-semibold text-sm flex items-center gap-1">
                  <Plus size={16} /> Nuova
                </button>
             </div>
             
             <div className="space-y-3">
               {subnets.map(s => (
                 <div key={s.id} onClick={() => setSelectedSubnet(s)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedSubnet?.id === s.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-500' : 'bg-white hover:border-indigo-300 border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Wifi size={16} className={selectedSubnet?.id === s.id ? 'text-indigo-600' : 'text-gray-400'} />
                      <h3 className="font-bold text-gray-900">{s.name}</h3>
                    </div>
                    <p className="text-xs font-mono text-gray-500 bg-gray-100 p-1 rounded inline-block">{s.cidr}</p>
                 </div>
               ))}
               {subnets.length === 0 && <p className="text-gray-400 text-sm">Nessuna subnet. Creane una per generare la mappa IP.</p>}
             </div>
          </div>

          <div className="lg:col-span-2">
            {selectedSubnet ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-1">{selectedSubnet.name}</h2>
                <div className="flex gap-4 text-sm text-gray-500 mb-6 font-mono">
                   <span>CIDR: <strong className="text-gray-900">{selectedSubnet.cidr}</strong></span>
                   <span>Gateway: <strong className="text-gray-900">{selectedSubnet.gateway || 'N/D'}</strong></span>
                   <span>VLAN: <strong className="text-gray-900">{selectedSubnet.vlan_id || 'N/D'}</strong></span>
                </div>
                
                <h3 className="font-bold text-gray-700 mb-3 text-sm">Visualizzazione Block Allocation (Disponibili: {calculateIps(selectedSubnet.cidr).length})</h3>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {calculateIps(selectedSubnet.cidr).map(ip => {
                    // MOCK logica per UI: il gateway è rosso, alcuni a caso blu (assegnati)
                    const isGateway = ip === selectedSubnet.gateway;
                    // Solo per demo UI beta, mostriamo i primi IP come assegnati a caso
                    const isAssignedMock = Math.random() > 0.8 && !isGateway;
                    
                    return (
                      <div key={ip} title={ip} className={`p-2 text-[10px] font-mono text-center rounded border ${isGateway ? 'bg-red-50 border-red-200 text-red-700 font-bold' : isAssignedMock ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 cursor-crosshair'}`}>
                        .{ip.split('.')[3]}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-4 text-right">* Clicca su un IP libero per assegnarlo (WIP)</p>
              </div>
            ) : (
              <div className="h-full min-h-[300px] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400">
                 <Network size={48} className="mb-4 opacity-50" />
                 <p>Seleziona una subnet per visualizzare la mappa degli indirizzi IP.</p>
              </div>
            )}
          </div>

          {showSubnetModal && (
            <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h3 className="text-xl font-bold text-gray-900">Aggiungi Subnet IPAM</h3>
                <div className="space-y-3 text-sm">
                  <div><label className="block text-gray-700 mb-1">Nome / Descrizione</label><input type="text" className="w-full border rounded-lg p-2" value={subnetForm.name || ''} onChange={e => setSubnetForm({...subnetForm, name: e.target.value})} placeholder="es. Clienti PPPoE - Torre 1" /></div>
                  <div><label className="block text-gray-700 mb-1">Rete CIDR</label><input type="text" className="w-full border rounded-lg p-2 font-mono" value={subnetForm.cidr || ''} onChange={e => setSubnetForm({...subnetForm, cidr: e.target.value})} placeholder="192.168.10.0/24" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-gray-700 mb-1">Gateway (Opzionale)</label><input type="text" className="w-full border rounded-lg p-2 font-mono text-xs" value={subnetForm.gateway || ''} onChange={e => setSubnetForm({...subnetForm, gateway: e.target.value})} placeholder="192.168.10.1" /></div>
                    <div><label className="block text-gray-700 mb-1">VLAN (Opzionale)</label><input type="number" className="w-full border rounded-lg p-2" value={subnetForm.vlan_id || ''} onChange={e => setSubnetForm({...subnetForm, vlan_id: parseInt(e.target.value)})} /></div>
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <button onClick={() => setShowSubnetModal(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-bold">Annulla</button>
                  <button onClick={handleSaveSubnet} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Salva Rete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
