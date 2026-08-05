import React, { useState, useEffect } from 'react';
import { dbService } from './dbService';
import { ToastProvider, ConfirmProvider } from './components/Toast';
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
  MailPlus
} from 'lucide-react';

type Tab = 'dashboard' | 'clients' | 'collaborators' | 'financial' | 'plans' | 'scadenze' | 'templates' | 'settings';

const navItemClass = (active: boolean) =>
  `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer text-sm ${
    active
      ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-sm'
      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent'
  }`;

const AppShell: React.FC = () => {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Wifi size={22} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 tracking-wider flex items-center gap-1">
                WispCore
              </h2>
              <span className="text-xs text-cyan-700 font-mono font-medium block">Alynet Edition • Enterprise</span>
            </div>
          </div>

          <nav className="space-y-1.5 font-medium">
            <button onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'dashboard')}>
              <LayoutDashboard size={18} />
              <span>Dashboard Operativa</span>
            </button>

            <button onClick={() => { setActiveTab('clients'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'clients')}>
              <Users size={18} />
              <span>Anagrafica & Tecnica WISP</span>
            </button>

            <button onClick={() => { setActiveTab('plans'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'plans')}>
              <Router size={18} />
              <span>Piani Internet</span>
            </button>

            <button onClick={() => { setActiveTab('collaborators'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'collaborators')}>
              <UserCheck size={18} />
              <span>Collaboratori & Provvigioni</span>
            </button>

            <button onClick={() => { setActiveTab('financial'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'financial')}>
              <Wallet size={18} />
              <span>Modulo Finanziario</span>
            </button>

            <button onClick={() => { setActiveTab('scadenze'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'scadenze')}>
              <CalendarClock size={18} />
              <span>Scadenzario Dettagliato</span>
            </button>

            <button onClick={() => { setActiveTab('templates'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'templates')}>
              <MailPlus size={18} />
              <span>Template Email</span>
            </button>

            <button onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }} className={navItemClass(activeTab === 'settings')}>
              <Settings size={18} />
              <span>Impostazioni & Sync</span>
            </button>
          </nav>
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
