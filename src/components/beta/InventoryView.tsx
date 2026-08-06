import React, { useState, useEffect } from 'react';
import { dbService } from '../../dbService';
import { useToast, useConfirm } from '../Toast';
import { Package, Plus, Trash2, Edit2, ShieldAlert } from 'lucide-react';
import type { BetaInventoryItem } from '../../types';

export const InventoryView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<BetaInventoryItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<BetaInventoryItem>>({ status: 'IN_STOCK' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setItems(await dbService.getBetaInventoryItems());
    } catch (err) {
      notify('Errore caricamento magazzino', 'error');
    }
  };

  const handleSave = async () => {
    if (!form.device_type) {
      notify('Il tipo apparato è obbligatorio', 'error');
      return;
    }
    try {
      await dbService.saveBetaInventoryItem(form);
      notify('Apparato salvato', 'success');
      setShowModal(false);
      loadData();
    } catch (err) {
      notify('Errore salvataggio', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (await confirmDialog('Eliminare questo apparato?')) {
      try {
        await dbService.deleteBetaInventoryItem(id);
        notify('Apparato eliminato', 'success');
        loadData();
      } catch (err) {
        notify('Errore', 'error');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_STOCK': return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">In Magazzino</span>;
      case 'INSTALLED': return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">Installato</span>;
      case 'BROKEN': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1"><ShieldAlert size={12}/> Guasto</span>;
      case 'RETURNED': return <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-medium">Reso</span>;
      default: return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full font-medium">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 text-indigo-900">
          <Package size={24} />
          <div>
            <h2 className="font-semibold text-lg">Magazzino Apparati (Inventory)</h2>
            <p className="text-sm text-gray-500">Tracciamento seriali, MAC Address e assegnazione CPE/Router ai clienti</p>
          </div>
        </div>
        <button 
          onClick={() => { setForm({ status: 'IN_STOCK', device_type: 'ANTENNA_CPE' }); setShowModal(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus size={16} /> Nuovo Apparato
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
              <th className="p-4 font-medium">Tipo</th>
              <th className="p-4 font-medium">Modello</th>
              <th className="p-4 font-medium">MAC / Seriale</th>
              <th className="p-4 font-medium">Stato</th>
              <th className="p-4 font-medium">Cliente Assegnato</th>
              <th className="p-4 font-medium text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50/50">
                <td className="p-4 font-medium text-gray-800">{item.device_type}</td>
                <td className="p-4 text-gray-600">
                  <div className="text-sm">{item.brand}</div>
                  <div className="font-semibold">{item.model}</div>
                </td>
                <td className="p-4 text-gray-600 font-mono text-xs">
                  <div>MAC: {item.mac_address || '-'}</div>
                  <div>SN: {item.serial_number || '-'}</div>
                </td>
                <td className="p-4">{getStatusBadge(item.status)}</td>
                <td className="p-4 text-sm text-gray-600">
                  {item.first_name ? `${item.first_name} ${item.last_name}` : <span className="text-gray-400 italic">Nessuno</span>}
                </td>
                <td className="p-4 text-right space-x-2">
                  <button onClick={() => { setForm(item); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">Nessun apparato in magazzino.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[500px]">
            <h3 className="text-xl font-bold mb-4">{form.id ? 'Modifica Apparato' : 'Nuovo Apparato'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Dispositivo</label>
                <select 
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  value={form.device_type || ''}
                  onChange={e => setForm({...form, device_type: e.target.value})}
                >
                  <option value="ANTENNA_CPE">Antenna CPE</option>
                  <option value="ROUTER_WIFI">Router Wi-Fi</option>
                  <option value="SWITCH">Switch</option>
                  <option value="OTHER">Altro</option>
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                  <input type="text" className="w-full p-2 border border-gray-300 rounded-lg" value={form.brand || ''} onChange={e => setForm({...form, brand: e.target.value})} placeholder="es. Ubiquiti" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modello</label>
                  <input type="text" className="w-full p-2 border border-gray-300 rounded-lg" value={form.model || ''} onChange={e => setForm({...form, model: e.target.value})} placeholder="es. LiteBeam 5AC" />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                  <input type="text" className="w-full p-2 border border-gray-300 rounded-lg font-mono text-sm" value={form.mac_address || ''} onChange={e => setForm({...form, mac_address: e.target.value})} placeholder="00:11:22:33:44:55" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seriale (SN)</label>
                  <input type="text" className="w-full p-2 border border-gray-300 rounded-lg font-mono text-sm" value={form.serial_number || ''} onChange={e => setForm({...form, serial_number: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
                <select 
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  value={form.status || 'IN_STOCK'}
                  onChange={e => setForm({...form, status: e.target.value})}
                >
                  <option value="IN_STOCK">In Magazzino</option>
                  <option value="INSTALLED">Installato</option>
                  <option value="BROKEN">Guasto</option>
                  <option value="RETURNED">Reso</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Annulla</button>
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Salva Apparato</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
