import React, { useState, useEffect } from 'react';
import { dbService } from '../../dbService';
import { useToast, useConfirm } from '../Toast';
import { Activity, Plus, Trash2, Edit2, RefreshCw, ServerCrash } from 'lucide-react';
import type { BetaMonitoringNode } from '../../types';

export const MonitoringView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [nodes, setNodes] = useState<BetaMonitoringNode[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<BetaMonitoringNode>>({ type: 'BTS', status: 'UNKNOWN' });
  const [isPinging, setIsPinging] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setNodes(await dbService.getBetaMonitoringNodes());
    } catch (err) {
      notify('Errore caricamento nodi', 'error');
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.ip_address) {
      notify('Nome e IP sono obbligatori', 'error');
      return;
    }
    try {
      await dbService.saveBetaMonitoringNode(form);
      notify('Nodo salvato', 'success');
      setShowModal(false);
      loadData();
    } catch (err) {
      notify('Errore salvataggio', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog('Eliminare questo nodo dal monitoraggio?')) {
      try {
        await dbService.deleteBetaMonitoringNode(id);
        notify('Nodo eliminato', 'success');
        loadData();
      } catch (err) {
        notify('Errore', 'error');
      }
    }
  };

  // Mock ping check per simulare il controllo ICMP
  const handleManualCheck = async () => {
    setIsPinging(true);
    notify('Ping dei nodi in corso...', 'info');
    setTimeout(async () => {
      // Simulate ping response by randomizing status a bit (usually online)
      for (const node of nodes) {
        const isOnline = Math.random() > 0.1; 
        await dbService.saveBetaMonitoringNode({
          ...node,
          status: isOnline ? 'ONLINE' : 'OFFLINE',
          last_check: new Date().toISOString(),
          uptime_percentage: isOnline ? Math.min(100, node.uptime_percentage + 0.1) : Math.max(0, node.uptime_percentage - 2.5)
        });
      }
      await loadData();
      setIsPinging(false);
      notify('Controllo rete completato', 'success');
    }, 2000);
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ONLINE': return <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse"></div>;
      case 'OFFLINE': return <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>;
      default: return <div className="w-3 h-3 rounded-full bg-gray-400"></div>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 text-indigo-900">
          <Activity size={24} />
          <div>
            <h2 className="font-semibold text-lg">Monitoraggio Rete & Uptime (Ping)</h2>
            <p className="text-sm text-gray-500">Stato in tempo reale dei Tralicci e dei Router principali</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleManualCheck}
            disabled={isPinging || nodes.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              isPinging ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            <RefreshCw size={16} className={isPinging ? 'animate-spin' : ''} /> {isPinging ? 'Ping in corso...' : 'Forza Check'}
          </button>
          <button 
            onClick={() => { setForm({ type: 'BTS', status: 'UNKNOWN' }); setShowModal(true); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus size={16} /> Aggiungi Nodo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {nodes.map(node => (
          <div key={node.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col relative overflow-hidden group">
            {node.status === 'OFFLINE' && <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>}
            {node.status === 'ONLINE' && <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>}
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-gray-800 text-lg flex items-center gap-2">
                  {node.name}
                </h3>
                <div className="text-sm text-gray-500 font-mono mt-1">{node.ip_address}</div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                {getStatusDot(node.status)}
                <span className="text-xs font-medium text-gray-600">{node.status}</span>
              </div>
            </div>

            <div className="mt-auto space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Uptime (30gg)</span>
                  <span className="font-medium text-gray-700">{node.uptime_percentage.toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${node.uptime_percentage > 98 ? 'bg-green-500' : node.uptime_percentage > 90 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${node.uptime_percentage}%` }}></div>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 flex justify-between items-center">
                <span>Ultimo check: {node.last_check ? new Date(node.last_check).toLocaleTimeString() : 'Mai'}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setForm(node); setShowModal(true); }} className="p-1 hover:text-blue-600"><Edit2 size={14}/></button>
                  <button onClick={() => handleDelete(node.id)} className="p-1 hover:text-red-600"><Trash2 size={14}/></button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="col-span-3 py-12 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
            <ServerCrash size={48} className="mx-auto mb-3 opacity-50" />
            Nessun nodo in monitoraggio. Aggiungi il tuo primo traliccio.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px]">
            <h3 className="text-xl font-bold mb-4">{form.id ? 'Modifica Nodo' : 'Nuovo Nodo da Monitorare'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Nodo (es. BTS Monte Mario)</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo IP</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg font-mono" value={form.ip_address || ''} onChange={e => setForm({...form, ip_address: e.target.value})} placeholder="192.168.1.1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Nodo</label>
                <select 
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  value={form.type || 'BTS'}
                  onChange={e => setForm({...form, type: e.target.value})}
                >
                  <option value="BTS">Traliccio Principale (BTS)</option>
                  <option value="ROUTER">Router / Core</option>
                  <option value="SWITCH">Switch di Zona</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Annulla</button>
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Salva Nodo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
