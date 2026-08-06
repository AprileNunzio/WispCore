import React, { useState, useEffect, useCallback } from 'react';
import { dbService } from './dbService';
import { ToastProvider, ConfirmProvider, useToast, useConfirm } from './components/Toast';
import { SetupScreen } from './components/SetupScreen';
import { LockScreen } from './components/LockScreen';
import { DashboardView } from './components/DashboardView';
import { ClientManagementView } from './components/ClientManagementView';
import { CollaboratorsView } from './components/CollaboratorsView';
import { FinancialView } from './components/FinancialView';
import { PlansView } from './components/PlansView';
import { ScadenzeView } from './components/ScadenzeView';
import { EmailTemplatesView } from './components/EmailTemplatesView';
import { SettingsView } from './components/SettingsView';
import type { UpdateEvent } from './types';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Wallet,
  Settings,
  Lock,
  Wifi,
  Menu,
  X,
  Router,
  CalendarClock,
  MailPlus,
  type LucideIcon,
} from 'lucide-react';

type Tab = 'dashboard' | 'clients' | 'collaborators' | 'financial' | 'plans' | 'scadenze' | 'templates' | 'settings';

interface NavItem {
  id: Tab;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

// Testi e icone del menu laterale centralizzati qui: un solo posto da
// modificare per rinominare una voce o riorganizzare le sezioni, invece di
// cercare tra i bottoni JSX ripetuti. Ogni bottone applica poi `truncate` +
// `title` cosi il testo non spezza mai il layout, anche se una voce futura
// dovesse avere un'etichetta lunga.
const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Operativo',
    items: [
      { id: 'dashboard', label: 'Dashboard Operativa', icon: LayoutDashboard },
      { id: 'clients', label: 'Gestione Anagrafica', icon: Users },
      { id: 'plans', label: 'Piani Internet', icon: Router },
      { id: 'collaborators', label: 'Collaboratori & Provvigioni', icon: UserCheck },
      { id: 'financial', label: 'Modulo Finanziario', icon: Wallet },
      { id: 'scadenze', label: 'Scadenzario Dettagliato', icon: CalendarClock },
    ],
  },
  {
    heading: 'Sistema',
    items: [
      { id: 'templates', label: 'Template Email', icon: MailPlus },
      { id: 'settings', label: 'Impostazioni & Sync', icon: Settings },
    ],
  },
];

const navItemClass = (active: boolean) =>
  `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer text-sm ${
    active
      ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-sm'
      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent'
  }`;

/**
 * Ascolta in background gli eventi di auto-update inoltrati dal main process
 * (il controllo parte da solo all'avvio, vedi electron/main.js) e, appena il
 * download è completo, chiede conferma all'utente prima di installare.
 * Non renderizza nulla: usa solo Toast/Confirm già disponibili nel contesto.
 */
const useAutoUpdateNotifier = (isUnlocked: boolean) => {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [pendingInstall, setPendingInstall] = useState<UpdateEvent | null>(null);

  useEffect(() => {
    const unsubscribe = dbService.onUpdateEvent((evt) => {
      if (evt.type === 'downloading') {
        notify(`Trovata la versione v${evt.version}: download in corso in background...`, 'info');
      } else if (evt.type === 'downloaded') {
        setPendingInstall(evt);
      }
      // Gli errori del controllo automatico restano silenziosi: una rete
      // assente all'avvio non deve disturbare l'utente ogni volta.
    });
    return unsubscribe;
  }, [notify]);

  useEffect(() => {
    if (!pendingInstall || !isUnlocked) return;
    const evt = pendingInstall;
    setPendingInstall(null);

    (async () => {
      const ok = await confirm(
        `È disponibile la versione v${evt.version} di WispCore, già scaricata. Vuoi installarla ora? L'app si chiuderà per completare l'aggiornamento.`
      );
      if (!ok) return;
      try {
        await dbService.installUpdate();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Impossibile avviare l'installer.", 'error');
      }
    })();
  }, [pendingInstall, isUnlocked, confirm, notify]);
};

const AppShell: React.FC = () => {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useAutoUpdateNotifier(isUnlocked);

  useEffect(() => {
    (async () => {
      try {
        const firstRun = await dbService.isFirstRun();
        setIsSetupComplete(!firstRun);
      } catch (err) {
        setBootError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      dbService.runBackupNow().catch(() => {
        // Backup automatico giornaliero è già gestito dal main process all'avvio;
        // questo è solo un tentativo best-effort, eventuali errori non bloccano l'uso dell'app.
      });
    }
  }, [isUnlocked]);

  const handleNavigate = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }, []);

  if (bootError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <p className="text-rose-600 font-semibold mb-2">Impossibile avviare WispCore</p>
          <p className="text-gray-500 text-sm font-mono">{bootError}</p>
        </div>
      </div>
    );
  }

  if (isSetupComplete === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-blue-600 font-mono text-base">
        Caricamento WispCore Zero-Trust Environment...
      </div>
    );
  }

  if (!isSetupComplete) {
    return <SetupScreen onSetupComplete={() => setIsSetupComplete(true)} />;
  }

  if (!isUnlocked) {
    return <LockScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  const handleNavigateToClients = (query?: string) => {
    if (query) {
      setClientSearchQuery(query);
    } else {
      setClientSearchQuery('');
    }
    setActiveTab('clients');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col md:flex-row">
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-white/95 glass-panel border-r border-gray-200 p-5 flex flex-col justify-between transition-transform duration-300 overflow-y-auto ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
              <Wifi size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold text-gray-900 tracking-wider flex items-center gap-1 truncate">
                WispCore
              </h2>
              <span className="text-xs text-cyan-700 font-mono font-medium block truncate">Alynet Edition • Enterprise</span>
            </div>
          </div>

          {NAV_SECTIONS.map((section) => (
            <nav key={section.heading} className="space-y-1.5 font-medium mb-5 last:mb-0">
              <p className="px-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{section.heading}</p>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  title={item.label}
                  className={navItemClass(activeTab === item.id)}
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>
          ))}
        </div>

        <div className="pt-6 border-t border-gray-200">
          <button
            onClick={() => setIsUnlocked(false)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-xl border border-gray-200 transition-colors cursor-pointer"
          >
            <Lock size={15} />
            <span>Blocca Sessione (Lock)</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-8">
        <div className="md:hidden flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 mb-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Wifi className="text-blue-600" size={20} />
            <span className="font-bold text-gray-900">WispCore</span>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-gray-600 p-1">
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {activeTab === 'dashboard' && <DashboardView onNavigateToClients={handleNavigateToClients} />}
        {activeTab === 'clients' && <ClientManagementView initialSearchQuery={clientSearchQuery} />}
        {activeTab === 'plans' && <PlansView />}
        {activeTab === 'collaborators' && <CollaboratorsView />}
        {activeTab === 'financial' && <FinancialView />}
        {activeTab === 'scadenze' && <ScadenzeView />}
        {activeTab === 'templates' && <EmailTemplatesView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <ConfirmProvider>
      <AppShell />
    </ConfirmProvider>
  </ToastProvider>
);
