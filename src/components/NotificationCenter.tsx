import React, { useEffect, useState, useCallback } from 'react';
import { dbService } from '../dbService';
import { Bell, AlertTriangle, Clock, FileWarning, Wallet, RefreshCw, Download } from 'lucide-react';

interface NotificationItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  icon: React.ReactNode;
  text: string;
  onClick?: () => void;
}

interface Props {
  onNavigateTab: (tabId: string) => void;
}

const REFRESH_MS = 2 * 60 * 1000;

/**
 * Centro notifiche interne (per l'operatore, non per il cliente): raccoglie
 * segnali che oggi richiederebbero di aprire più schermate per accorgersene
 * - pagamenti scaduti, contratti in scadenza, provvigioni da liquidare,
 * backup secondario o sync in difficoltà, aggiornamento pronto.
 */
export const NotificationCenter: React.FC<Props> = ({ onNavigateTab }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refresh = useCallback(async () => {
    const [payments, clients, commissions, secondaryBackup, sync] = await Promise.all([
      dbService.getPayments(),
      dbService.getClients(),
      dbService.getCommissions(),
      dbService.getSecondaryBackupSettings(),
      dbService.getSyncSettings(),
    ]);

    const next: NotificationItem[] = [];

    const overdue = payments.filter((p) => p.status === 'OVERDUE');
    if (overdue.length > 0) {
      const total = overdue.reduce((a, b) => a + b.amount, 0);
      next.push({
        id: 'overdue',
        severity: 'critical',
        icon: <AlertTriangle size={15} className="text-rose-600" />,
        text: `${overdue.length} pagamenti insoluti (€ ${total.toFixed(2)})`,
        onClick: () => onNavigateTab('scadenze'),
      });
    }

    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const dueSoon = payments.filter((p) => p.status === 'PENDING' && p.due_date && new Date(p.due_date) <= in7Days);
    if (dueSoon.length > 0) {
      next.push({
        id: 'due-soon',
        severity: 'warning',
        icon: <Clock size={15} className="text-amber-600" />,
        text: `${dueSoon.length} pagamenti in scadenza nei prossimi 7 giorni`,
        onClick: () => onNavigateTab('scadenze'),
      });
    }

    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const contractsExpiring = clients.filter(
      (c) => c.status === 'ACTIVE' && c.contract_end_date && new Date(c.contract_end_date) <= in30Days
    );
    if (contractsExpiring.length > 0) {
      next.push({
        id: 'contracts',
        severity: 'warning',
        icon: <FileWarning size={15} className="text-amber-600" />,
        text: `${contractsExpiring.length} contratti in scadenza nei prossimi 30 giorni`,
        onClick: () => onNavigateTab('clients'),
      });
    }

    const pendingCommissions = commissions.filter((c) => c.payout_status === 'PENDING');
    if (pendingCommissions.length > 0) {
      const total = pendingCommissions.reduce((a, b) => a + b.amount, 0);
      next.push({
        id: 'commissions',
        severity: 'info',
        icon: <Wallet size={15} className="text-cyan-600" />,
        text: `€ ${total.toFixed(2)} di provvigioni da liquidare`,
        onClick: () => onNavigateTab('collaborators'),
      });
    }

    if (secondaryBackup.enabled && secondaryBackup.lastError) {
      next.push({
        id: 'secondary-backup',
        severity: 'critical',
        icon: <AlertTriangle size={15} className="text-rose-600" />,
        text: `Backup secondario fallito: ${secondaryBackup.lastError}`,
        onClick: () => onNavigateTab('settings'),
      });
    }

    if (sync.enabled) {
      const staleDays = sync.lastSyncAt ? (Date.now() - new Date(sync.lastSyncAt).getTime()) / 86_400_000 : Infinity;
      if (staleDays > 2) {
        next.push({
          id: 'sync-stale',
          severity: 'warning',
          icon: <RefreshCw size={15} className="text-amber-600" />,
          text: sync.lastSyncAt ? `Sync multi-sede ferma da più di 2 giorni` : 'Sync multi-sede attiva ma mai eseguita',
          onClick: () => onNavigateTab('settings'),
        });
      }
    }

    setItems(next);
  }, [onNavigateTab]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = dbService.onUpdateEvent((evt) => {
      if (evt.type === 'downloaded') setUpdateAvailable(true);
    });
    return unsubscribe;
  }, []);

  const totalCount = items.length + (updateAvailable ? 1 : 0);
  const hasCritical = items.some((i) => i.severity === 'critical');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors"
        title="Notifiche"
      >
        <Bell size={18} />
        {totalCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${hasCritical ? 'bg-rose-600' : 'bg-amber-500'}`}>
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-bold text-gray-900">Notifiche</div>
            <div className="max-h-80 overflow-y-auto">
              {totalCount === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Tutto in ordine, nessuna segnalazione.</p>
              ) : (
                <>
                  {updateAvailable && (
                    <button
                      onClick={() => { onNavigateTab('settings'); setOpen(false); }}
                      className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50 text-left cursor-pointer border-b border-gray-50"
                    >
                      <Download size={15} className="text-blue-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">Aggiornamento scaricato: pronto per l'installazione</span>
                    </button>
                  )}
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { item.onClick?.(); setOpen(false); }}
                      className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50 text-left cursor-pointer border-b border-gray-50 last:border-0"
                    >
                      <span className="shrink-0 mt-0.5">{item.icon}</span>
                      <span className="text-sm text-gray-700">{item.text}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
