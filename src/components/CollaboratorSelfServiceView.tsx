import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import type { Client, Collaborator, Commission } from '../types';
import { CollaboratorDetailContent } from './CollaboratorDetailModal';
import { Award } from 'lucide-react';

interface Props {
  collaboratorId: number;
}

/**
 * Vista riservata al ruolo COLLABORATORE: un tecnico/commerciale esterno
 * vede solo la propria scheda 360° (guadagni, clienti assegnati, storico
 * provvigioni), senza accesso al resto del gestionale. Riusa lo stesso
 * contenuto della modale che il Super Admin vede in Collaboratori & Provvigioni.
 */
export const CollaboratorSelfServiceView: React.FC<Props> = ({ collaboratorId }) => {
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [collabs, comm, cl] = await Promise.all([
      dbService.getCollaborators(),
      dbService.getCommissions(),
      dbService.getClients(),
    ]);
    setCollaborator(collabs.find((c) => c.id === collaboratorId) || null);
    setCommissions(comm.filter((c) => c.collaborator_id === collaboratorId));
    setClients(cl);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [collaboratorId]);

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'PENDING' ? 'PAID' : 'PENDING';
    await dbService.updateCommissionStatus(id, nextStatus as Commission['payout_status']);
    loadData();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Caricamento...</div>;
  }

  if (!collaborator) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-6">
        <p className="text-rose-600 text-sm">Il tuo account non risulta collegato a nessun collaboratore. Contatta l'amministratore.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <div className="glass-panel rounded-2xl p-6 border border-gray-200">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Award className="text-cyan-600" size={22} />
          Le Mie Provvigioni — {collaborator.first_name} {collaborator.last_name}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Vista personale: solo i tuoi guadagni e i clienti a te assegnati.</p>
      </div>

      <CollaboratorDetailContent
        collaborator={collaborator}
        commissions={commissions}
        clients={clients}
        onToggleStatus={handleToggleStatus}
      />
    </div>
  );
};
