import React, { useState, useEffect } from 'react';
import { dbService } from '../../dbService';
import { useToast } from '../Toast';
import { Network, Map } from 'lucide-react';
import type { BetaIpamSubnet, IpamHeatmapClient } from '../../types';

export const IpamView: React.FC = () => {
  const { notify } = useToast();
  const [subnets, setSubnets] = useState<BetaIpamSubnet[]>([]);
  const [heatmapData, setHeatmapData] = useState<IpamHeatmapClient[]>([]);
  const [selectedSubnet, setSelectedSubnet] = useState<BetaIpamSubnet | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setSubnets(await dbService.getBetaIpamSubnets());
      setHeatmapData(await dbService.getIpamHeatmapData());
    } catch (err) {
      notify('Errore caricamento IPAM', 'error');
    }
  };

  const calculateIps = (cidr: string) => {
    try {
      const [ip, bits] = cidr.split('/');
      const mask = ~(Math.pow(2, 32 - parseInt(bits)) - 1);
      const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
      const network = ipNum & mask;
      const broadcast = network | ~mask;
      
      const ips = [];
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
    <div className="space-y-4">
      <div className="flex gap-4">
        {/* Lista Subnet */}
        <div className="w-1/3 bg-white border border-gray-200 rounded-xl shadow-sm p-4 h-[600px] overflow-y-auto">
          <h2 className="font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <Network size={18} /> Subnet IP
          </h2>
          <div className="space-y-2">
            {subnets.map(sub => (
              <div 
                key={sub.id} 
                onClick={() => setSelectedSubnet(sub)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSubnet?.id === sub.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-gray-800">{sub.name}</div>
                <div className="text-sm text-gray-500">{sub.cidr}</div>
              </div>
            ))}
            {subnets.length === 0 && <p className="text-gray-400 text-sm">Nessuna subnet disponibile.</p>}
          </div>
        </div>

        {/* Heatmap Area */}
        <div className="w-2/3 bg-white border border-gray-200 rounded-xl shadow-sm p-4 h-[600px] flex flex-col">
          {selectedSubnet ? (
            <>
              <div className="mb-4">
                <h3 className="font-semibold text-lg text-gray-800">Mappa IP: {selectedSubnet.name}</h3>
                <p className="text-sm text-gray-500">{selectedSubnet.cidr}</p>
              </div>
              <div className="flex-1 overflow-auto bg-gray-50 rounded-xl border border-gray-200 p-6 flex items-center justify-center">
                <div className="grid grid-cols-16 gap-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                  {calculateIps(selectedSubnet.cidr).map(ip => {
                    const client = heatmapData.find(c => c.assigned_ip === ip);
                    return (
                      <div 
                        key={ip}
                        title={client ? `${ip} - ${client.first_name} ${client.last_name} (${client.status})` : `${ip} - Libero`}
                        className={`w-6 h-6 rounded-sm border flex items-center justify-center text-[8px] font-mono
                          ${client 
                            ? (client.status === 'ACTIVE' ? 'bg-red-500 border-red-600 text-white cursor-pointer' : 'bg-orange-500 border-orange-600 text-white cursor-pointer') 
                            : 'bg-green-100 border-green-200 text-transparent hover:bg-green-200'
                          }
                        `}
                      >
                        {client ? ip.split('.')[3] : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-xs text-gray-500 justify-center">
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm"></div> Libero</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 border border-red-600 rounded-sm"></div> Assegnato</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-500 border border-orange-600 rounded-sm"></div> Sospeso</div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <Map size={48} className="mb-2 opacity-50" />
              <p>Seleziona una subnet a sinistra per visualizzare la Heatmap</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
