import React, { useState, useEffect, useCallback } from 'react';
import { dbService } from './dbService';
import { ToastProvider, ConfirmProvider, useToast, useConfirm } from './components/Toast';
import { SetupScreen } from './components/SetupScreen';
import { LockScreen } from './components/LockScreen';
import { DashboardView } from './components/DashboardView';
import { ClientManagementView } from './components/ClientManagementView';
import { CollaboratorsView } from './components/CollaboratorsView';
import { CollaboratorSelfServiceView } from './components/CollaboratorSelfServiceView';
import { FinancialView } from './components/FinancialView';
import { PlansView } from './components/PlansView';
import { ScadenzeView } from './components/ScadenzeView';
import { CoverageView } from './components/CoverageView';
import { ReportBiView } from './components/ReportBiView';
import { EmailTemplatesView } from './components/EmailTemplatesView';
import { SettingsView } from './components/SettingsView';
import { GlobalSearch, type SearchNavItem } from './components/GlobalSearch';
import { NotificationCenter } from './components/NotificationCenter';
import type { UpdateEvent, Session, AdminRole } from './types';
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
  MapPin,
  BarChart3,
  Search,
  type LucideIcon,
} from 'lucide-react';

type Tab = 'dashboard' | 'clients' | 'collaborators' | 'financial' | 'plans' | 'scadenze' | 'coverage' | 'report' | 'templates' | 'settings';

interface NavItem {
  id: Tab;
  label: string;
  icon: LucideIcon;
  roles: AdminRole[];
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const ALL_STAFF_ROLES: AdminRole[] = ['SUPER_ADMIN', 'TECNICO', 'COMMERCIALE'];

// Testi, icone e permessi del menu laterale centralizzati qui: un solo posto
// da modificare per rinominare una voce, riorganizzare le sezioni o cambiare
// chi può vederla. Ogni bottone applica poi `truncate` + `title` cosi il
// testo non spezza mai il layout, anche con un'etichetta lunga.
const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Operativo',
    items: [
      { id: 'dashboard', label: 'Dashboard Operativa', icon: LayoutDashboard, roles: ALL_STAFF_ROLES },
      { id: 'clients', label: 'Gestione Anagrafica', icon: Users, roles: ALL_STAFF_ROLES },
      { id: 'plans', label: 'Piani Internet', icon: Router, roles: ['SUPER_ADMIN', 'COMMERCIALE'] },
      { id: 'collaborators', label: 'Collaboratori & Provvigioni', icon: UserCheck, roles: ['SUPER_ADMIN', 'COMMERCIALE'] },
      { id: 'financial', label: 'Modulo Finanziario', icon: Wallet, roles: ['SUPER_ADMIN', 'COMMERCIALE'] },
      { id: 'scadenze', label: 'Scadenzario Dettagliato', icon: CalendarClock, roles: ['SUPER_ADMIN', 'COMMERCIALE'] },
      { id: 'coverage', label: 'Copertura & Rete', icon: MapPin, roles: ['SUPER_ADMIN', 'TECNICO'] },
      { id: 'report', label: 'Report & BI', icon: BarChart3, roles: ['SUPER_ADMIN', 'COMMERCIALE'] },
    ],
  },
  {
    heading: 'Sistema',
    items: [
      { id: 'templates', label: 'Template Email', icon: MailPlus, roles: ['SUPER_ADMIN', 'COMMERCIALE'] },
      { id: 'settings', label: 'Impostazioni & Sync', icon: Settings, roles: ['SUPER_ADMIN'] },
    ],
  },
];

const navItemClass = (active: boolean) =>
  `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer text-sm ${
    active
      ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-sm'
      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent'
  }`;

const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  TECNICO: 'Tecnico',
  COMMERCIALE: 'Commerciale',
  COLLABORATORE: 'Collaboratore',
};

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
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useAutoUpdateNotifier(!!session);

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
    if (session) {
      dbService.runBackupNow().catch(() => {
        // Backup automatico giornaliero è già gestito dal main process all'avvio;
        // questo è solo un tentativo best-effort, eventuali errori non bloccano l'uso dell'app.
      });
    }
  }, [session]);

  // Ctrl/Cmd+K apre la ricerca globale da qualunque schermata (tranne quando è già aperta).
  useEffect(() => {
    if (!session || session.role === 'COLLABORATORE') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session]);

  const handleNavigate = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }, []);

  const handleLock = async () => {
    try { await dbService.lockSession(); } catch { /* best-effort */ }
    setSession(null);
  };

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

  if (!session) {
    return <LockScreen onUnlock={setSession} />;
  }

  const handleNavigateToClients = (query?: string) => {
    setClientSearchQuery(query || '');
    setActiveTab('clients');
  };

  // Il ruolo COLLABORATORE non vede il gestionale: solo la propria scheda
  // 360° di guadagni/clienti assegnati, senza sidebar né altre sezioni.
  if (session.role === 'COLLABORATORE') {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="flex items-center justify-end p-4">
          <button
            onClick={handleLock}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-100 text-gray-600 text-xs rounded-xl border border-gray-200 transition-colors cursor-pointer shadow-sm"
          >
            <Lock size={13} /> Blocca Sessione
          </button>
        </div>
        {session.linkedCollaboratorId ? (
          <CollaboratorSelfServiceView collaboratorId={session.linkedCollaboratorId} />
        ) : (
          <div className="text-center text-rose-600 text-sm py-20">Account non collegato a nessun collaboratore.</div>
        )}
      </div>
    );
  }

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(session.role)),
  })).filter((section) => section.items.length > 0);

  const searchNavItems: SearchNavItem[] = visibleSections.flatMap((s) => s.items.map((i) => ({ id: i.id, label: i.label, section: s.heading })));

  // Se il tab attivo non è più visibile per il ruolo corrente (es. switch utente), torna alla dashboard.
  const activeIsVisible = visibleSections.some((s) => s.items.some((i) => i.id === activeTab));
  const effectiveTab = activeIsVisible ? activeTab : 'dashboard';

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

          {visibleSections.map((section) => (
            <nav key={section.heading} className="space-y-1.5 font-medium mb-5 last:mb-0">
              <p className="px-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{section.heading}</p>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  title={item.label}
                  className={navItemClass(effectiveTab === item.id)}
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
            onClick={handleLock}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-xl border border-gray-200 transition-colors cursor-pointer"
          >
            <Lock size={15} />
            <span>Blocca Sessione (Lock)</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-8">
        {/* Topbar: visibile sempre (non solo su mobile), ospita ricerca globale, notifiche e utente corrente */}
        <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-gray-200 mb-4 shadow-sm gap-3">
          <div className="flex items-center gap-2 md:hidden">
            <Wifi className="text-blue-600" size={20} />
            <span className="font-bold text-gray-900">WispCore</span>
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-xs cursor-pointer transition-colors"
          >
            <Search size={13} /> <span>Cerca ovunque...</span>
            <kbd className="ml-2 px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px]">Ctrl K</kbd>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setSearchOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"><Search size={18} /></button>
            <NotificationCenter onNavigateTab={(tab) => handleNavigate(tab as Tab)} />
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center text-[10px] font-bold">
                {session.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-gray-900">{session.username}</div>
                <div className="text-[10px] text-gray-400">{ROLE_LABELS[session.role]}</div>
              </div>
            </div>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-gray-600 p-1">
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {effectiveTab === 'dashboard' && <DashboardView onNavigateToClients={handleNavigateToClients} />}
        {effectiveTab === 'clients' && <ClientManagementView initialSearchQuery={clientSearchQuery} />}
        {effectiveTab === 'plans' && <PlansView />}
        {effectiveTab === 'collaborators' && <CollaboratorsView />}
        {effectiveTab === 'financial' && <FinancialView />}
        {effectiveTab === 'scadenze' && <ScadenzeView />}
        {effectiveTab === 'coverage' && <CoverageView onNavigateToClients={handleNavigateToClients} />}
        {effectiveTab === 'report' && <ReportBiView />}
        {effectiveTab === 'templates' && <EmailTemplatesView />}
        {effectiveTab === 'settings' && <SettingsView />}
      </main>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        navItems={searchNavItems}
        onNavigateTab={(tab) => handleNavigate(tab as Tab)}
        onNavigateToClients={handleNavigateToClients}
      />
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
