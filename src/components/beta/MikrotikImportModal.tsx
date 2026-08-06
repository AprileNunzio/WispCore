import { useState, useEffect } from 'react';
import { X, Search, CheckSquare, Download, AlertCircle, HardDrive } from 'lucide-react';
import { dbService } from '../../dbService';
import type { BetaNasRouter, Client } from '../../types';
import { useToast } from '../Toast';

interface MikrotikImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSelected: (accounts: any[]) => void;
  existingClients: Client[];
}

export function MikrotikImportModal({ isOpen, onClose, onImportSelected, existingClients }: MikrotikImportModalProps) {
  const [routers, setRouters] = useState<BetaNasRouter[]>([]);
  const [selectedNasId, setSelectedNasId] = useState<number | ''>('');
  const [isFetching, setIsFetching] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { notify } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadRouters();
      setAccounts([]);
      setSelectedIds(new Set());
      setSelectedNasId('');
    }
  }, [isOpen]);

  const loadRouters = async () => {
    try {
      const list = await dbService.getBetaNasRouters();
      setRouters(list);
    } catch (e) {
      console.error(e);
      notify('Errore nel caricamento dei NAS', 'error');
    }
  };

  const handleFetch = async () => {
    if (!selectedNasId) return;
    setIsFetching(true);
    setAccounts([]);
    setSelectedIds(new Set());
    
    try {
      const data = await dbService.fetchMikrotikAccounts(Number(selectedNasId));
      setAccounts(data);
      if (data.length === 0) {
        notify('Nessun account trovato sul NAS selezionato.', 'info');
      } else {
        notify(`Trovati ${data.length} account sul router.`, 'success');
      }
    } catch (err: any) {
      notify(err.message || 'Errore di comunicazione con il NAS', 'error');
    } finally {
      setIsFetching(false);
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === importableAccounts.length) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      importableAccounts.forEach(a => next.add(a.id));
      setSelectedIds(next);
    }
  };

  const handleImport = () => {
    const selectedAccounts = accounts.filter(a => selectedIds.has(a.id));
    onImportSelected(selectedAccounts);
    onClose();
  };

  if (!isOpen) return null;

  // Filter out accounts that seem already in the DB
  const isAlreadyImported = (acc: any) => {
    return existingClients.some(c => 
      (acc.type === 'pppoe' && c.pppoe_username && c.pppoe_username.toLowerCase() === acc.name.toLowerCase()) ||
      (c.mac_address && c.mac_address.toLowerCase() === acc.caller_id.toLowerCase()) ||
      (c.assigned_ip && c.assigned_ip === acc.remote_address)
    );
  };

  const importableAccounts = accounts.filter(a => !isAlreadyImported(a));
  const alreadyExistsCount = accounts.length - importableAccounts.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-2.5 rounded-xl">
              <Download size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Importazione Automatica da Mikrotik</h2>
              <p className="text-sm text-gray-500">Scarica Secrets PPPoE e DHCP Leases direttamente dal RouterOS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          
          <div className="flex items-end gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Seleziona NAS (RouterOS)</label>
              <select 
                value={selectedNasId} 
                onChange={e => setSelectedNasId(e.target.value ? Number(e.target.value) : '')}
                className="w-full p-3 bg-white border border-gray-300 rounded-xl font-semibold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- Scegli un NAS configurato --</option>
                {routers.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                ))}
              </select>
            </div>
            <button 
              onClick={handleFetch}
              disabled={!selectedNasId || isFetching}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              {isFetching ? <Search className="animate-spin" size={18} /> : <HardDrive size={18} />}
              {isFetching ? 'Connessione...' : 'Connetti e Cerca'}
            </button>
          </div>

          {accounts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <CheckSquare size={18} className="text-blue-600" /> Account Rilevati
                </h3>
                {alreadyExistsCount > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full flex items-center gap-1 font-semibold">
                    <AlertCircle size={14} /> {alreadyExistsCount} già presenti ignorati
                  </span>
                )}
              </div>
              
              {importableAccounts.length === 0 ? (
                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                  Tutti gli account presenti sul router sembrano essere già censiti in WispCore.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-900 border-b border-gray-200 text-xs uppercase font-bold">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input type="checkbox" className="w-4 h-4" checked={selectedIds.size === importableAccounts.length} onChange={toggleAll} />
                        </th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3">Identificativo (Nome/MAC)</th>
                        <th className="p-3">IP Assegnato</th>
                        <th className="p-3">Profilo (Server)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importableAccounts.map((acc, i) => (
                        <tr key={acc.id || i} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => toggleSelection(acc.id)}>
                          <td className="p-3 text-center">
                            <input type="checkbox" className="w-4 h-4 pointer-events-none" checked={selectedIds.has(acc.id)} readOnly />
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${acc.type === 'pppoe' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {acc.type === 'pppoe' ? 'PPPoE' : 'DHCP Static'}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-gray-800">{acc.name}</td>
                          <td className="p-3 font-mono text-xs">{acc.remote_address || '-'}</td>
                          <td className="p-3 text-xs text-gray-500">{acc.profile || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors">
            Annulla
          </button>
          <button 
            disabled={selectedIds.size === 0}
            onClick={handleImport}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-colors"
          >
            Importa Selezionati ({selectedIds.size})
          </button>
        </div>

      </div>
    </div>
  );
}
