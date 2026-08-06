import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import type { Client, NetworkNode } from '../types';
import { MapPin, Radio, Plus, Edit3, Trash2, Users, AlertCircle } from 'lucide-react';

interface Props {
  onNavigateToClients: (query?: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#059669',
  SUSPENDED: '#d97706',
  CANCELLED: '#9ca3af',
  PROSPECT: '#2563eb',
};

const emptyNodeForm: Partial<NetworkNode> = { name: '', latitude: undefined, longitude: undefined, max_clients: undefined, notes: '', active: true };

/**
 * Mappa di copertura "relativa": non usa tile stradali esterni (nessuna
 * dipendenza internet/servizio terzi, coerente con l'impostazione offline-first
 * dell'app), ma proietta le coordinate reali dei clienti e dei nodi di rete
 * in uno scatter plot proporzionato, utile per valutare colpo d'occhio la
 * distribuzione geografica e la copertura dei BTS/ripetitori.
 */
export const CoverageView: React.FC<Props> = ({ onNavigateToClients }) => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();
  const [clients, setClients] = useState<Client[]>([]);
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<NetworkNode>>(emptyNodeForm);
  const [selected, setSelected] = useState<{ type: 'client' | 'node'; id: number } | null>(null);

  const loadData = async () => {
    const [c, n] = await Promise.all([dbService.getClients(), dbService.getNetworkNodes()]);
    setClients(c);
    setNodes(n);
  };

  useEffect(() => {
    loadData();
  }, []);

  const geoClients = useMemo(() => clients.filter((c) => c.latitude != null && c.longitude != null), [clients]);
  const missingGeoClients = useMemo(() => clients.filter((c) => c.status !== 'CANCELLED' && (c.latitude == null || c.longitude == null)), [clients]);
  const geoNodes = useMemo(() => nodes.filter((n) => n.latitude != null && n.longitude != null), [nodes]);

  const projection = useMemo(() => {
    const points = [
      ...geoClients.map((c) => ({ lat: c.latitude as number, lng: c.longitude as number })),
      ...geoNodes.map((n) => ({ lat: n.latitude as number, lng: n.longitude as number })),
    ];
    if (points.length === 0) return null;

    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.002);
    const lngSpan = Math.max(maxLng - minLng, 0.002);
    const W = 800, H = 480, PAD = 40;

    const project = (lat: number, lng: number) => ({
      x: PAD + ((lng - minLng) / lngSpan) * (W - PAD * 2),
      y: H - PAD - ((lat - minLat) / latSpan) * (H - PAD * 2), // lat cresce verso l'alto
    });
    return { W, H, project };
  }, [geoClients, geoNodes]);

  const handleOpenNew = () => { setForm(emptyNodeForm); setShowModal(true); };
  const handleEdit = (n: NetworkNode) => { setForm(n); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    await dbService.saveNetworkNode(form);
    notify(form.id ? 'Nodo aggiornato.' : 'Nodo di rete creato.', 'success');
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (n: NetworkNode) => {
    const ok = await confirmDialog(`Eliminare il nodo "${n.name}"? I clienti collegati resteranno ma senza nodo assegnato.`);
    if (!ok) return;
    await dbService.deleteNetworkNode(n.id);
    notify('Nodo eliminato.', 'success');
    loadData();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <MapPin className="text-blue-600" size={24} />
            <span>Copertura & Rete</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Distribuzione geografica dei clienti e saturazione dei nodi di rete (BTS/ripetitori)</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg shadow-blue-600/20 border border-blue-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
        >
          <Plus size={16} /> <span>Nuovo Nodo di Rete</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">Mappa Relativa (senza servizi di mappe esterni)</h3>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: STATUS_COLOR.ACTIVE }} /> Attivo</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: STATUS_COLOR.SUSPENDED }} /> Sospeso</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: STATUS_COLOR.PROSPECT }} /> Prospect</span>
              <span className="flex items-center gap-1"><Radio size={11} className="text-cyan-700" /> Nodo BTS</span>
            </div>
          </div>

          {!projection ? (
            <div className="h-[400px] flex items-center justify-center text-center text-gray-400 text-sm p-6">
              Nessuna coordinata disponibile ancora. Aggiungi latitudine/longitudine ai clienti (in Anagrafica) o ai nodi di rete per vederli qui.
            </div>
          ) : (
            <svg viewBox={`0 0 ${projection.W} ${projection.H}`} className="w-full h-[400px] bg-gray-50 rounded-xl border border-gray-200">
              {geoNodes.map((n) => {
                const p = projection.project(n.latitude as number, n.longitude as number);
                return (
                  <g key={`node-${n.id}`} onClick={() => setSelected({ type: 'node', id: n.id })} className="cursor-pointer">
                    <circle cx={p.x} cy={p.y} r={16} fill="#0891b2" fillOpacity={0.12} stroke="#0891b2" strokeDasharray="3 2" />
                    <circle cx={p.x} cy={p.y} r={5} fill="#0e7490" />
                    <text x={p.x} y={p.y - 20} textAnchor="middle" fontSize={10} fill="#0e7490" fontWeight={700}>{n.name}</text>
                  </g>
                );
              })}
              {geoClients.map((c) => {
                const p = projection.project(c.latitude as number, c.longitude as number);
                return (
                  <circle
                    key={`client-${c.id}`}
                    cx={p.x}
                    cy={p.y}
                    r={selected?.type === 'client' && selected.id === c.id ? 6 : 4}
                    fill={STATUS_COLOR[c.status] || '#6b7280'}
                    stroke="#fff"
                    strokeWidth={1}
                    className="cursor-pointer"
                    onClick={() => { setSelected({ type: 'client', id: c.id }); onNavigateToClients(`${c.first_name} ${c.last_name}`); }}
                  >
                    <title>{c.first_name} {c.last_name} — {c.status}</title>
                  </circle>
                );
              })}
            </svg>
          )}

          {missingGeoClients.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{missingGeoClients.length} clienti attivi non hanno ancora coordinate: aggiungile dalla scheda cliente in Anagrafica per vederli sulla mappa.</span>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-gray-200">
          <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Radio size={18} className="text-cyan-600" /> Nodi di Rete ({nodes.length})</h3>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {nodes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessun nodo configurato.</p>
            ) : (
              nodes.map((n) => (
                <div key={n.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 text-sm">{n.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(n)} className="p-1.5 bg-white hover:bg-gray-100 text-blue-600 rounded-md border border-gray-200 cursor-pointer"><Edit3 size={12} /></button>
                      <button onClick={() => handleDelete(n)} className="p-1.5 bg-white hover:bg-gray-100 text-rose-600 rounded-md border border-gray-200 cursor-pointer"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Users size={11} /> {n.active_clients ?? 0}{n.max_clients ? ` / ${n.max_clients}` : ''} clienti</span>
                    {n.saturation_pct !== null && n.saturation_pct !== undefined && (
                      <span className={`font-semibold ${n.saturation_pct >= 90 ? 'text-rose-600' : n.saturation_pct >= 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {n.saturation_pct}% saturazione
                      </span>
                    )}
                  </div>
                  {n.max_clients ? (
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${((n.saturation_pct ?? 0) >= 90) ? 'bg-rose-500' : ((n.saturation_pct ?? 0) >= 70) ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, n.saturation_pct ?? 0)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel-glow bg-white rounded-3xl p-6 border border-gray-200">
            <h3 className="text-base font-bold text-gray-900 mb-4">{form.id ? 'Modifica Nodo di Rete' : 'Nuovo Nodo di Rete (BTS/Ripetitore)'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Nome *</label>
                <input type="text" required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="es. BTS Monte Alto" className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 block mb-1">Latitudine</label>
                  <input type="number" step="any" value={form.latitude ?? ''} onChange={(e) => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Longitudine</label>
                  <input type="number" step="any" value={form.longitude ?? ''} onChange={(e) => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono" />
                </div>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Capacità Massima (n. clienti)</label>
                <input type="number" value={form.max_clients ?? ''} onChange={(e) => setForm({ ...form, max_clients: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900 font-mono" />
                <p className="text-[11px] text-gray-400 mt-1">Usata per calcolare la % di saturazione. Lascia vuoto se non la conosci ancora.</p>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Note</label>
                <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-gray-900" />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl cursor-pointer">Annulla</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer">Salva Nodo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
