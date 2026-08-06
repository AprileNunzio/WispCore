import React, { useEffect, useRef, useState } from 'react';
import { dbService } from '../dbService';
import type { ClientLite, Collaborator } from '../types';
import { Search, X, Users, UserCheck, Compass } from 'lucide-react';

export interface SearchNavItem {
  id: string;
  label: string;
  section: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  navItems: SearchNavItem[];
  onNavigateTab: (tabId: string) => void;
  onNavigateToClients: (query: string) => void;
}

/** Palette di ricerca globale (Ctrl/Cmd+K): naviga rapidamente tra sezioni, clienti e collaboratori senza toccare il mouse. */
export const GlobalSearch: React.FC<Props> = ({ open, onClose, navItems, onNavigateTab, onNavigateToClients }) => {
  const [query, setQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setClientResults([]);
      dbService.getCollaborators().then(setCollaborators).catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) { setClientResults([]); return; }
    debounce.current = setTimeout(async () => {
      const results = await dbService.searchClients(query.trim(), 6);
      setClientResults(results);
    }, 150);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matchingNav = q ? navItems.filter((n) => n.label.toLowerCase().includes(q)) : navItems.slice(0, 5);
  const matchingCollaborators = q
    ? collaborators.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q)).slice(0, 5)
    : [];

  const handleSelectNav = (tabId: string) => {
    onNavigateTab(tabId);
    onClose();
  };
  const handleSelectClient = (client: ClientLite) => {
    onNavigateToClients(client.assigned_ip || `${client.first_name} ${client.last_name}`);
    onClose();
  };
  const handleSelectCollaborator = () => {
    onNavigateTab('collaborators');
    onClose();
  };

  const hasResults = matchingNav.length > 0 || clientResults.length > 0 || matchingCollaborators.length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start justify-center pt-[12vh] p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            placeholder="Cerca clienti, collaboratori, sezioni..."
            className="flex-1 outline-none text-sm text-gray-900 placeholder-gray-400"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer shrink-0"><X size={16} /></button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {!hasResults && (
            <p className="text-center text-sm text-gray-400 py-8">Nessun risultato per "{query}".</p>
          )}

          {matchingNav.length > 0 && (
            <div className="px-2 pb-1">
              <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sezioni</p>
              {matchingNav.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNav(n.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left cursor-pointer text-sm text-gray-700"
                >
                  <Compass size={14} className="text-blue-500 shrink-0" />
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
          )}

          {clientResults.length > 0 && (
            <div className="px-2 pb-1 pt-1 border-t border-gray-100">
              <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Clienti</p>
              {clientResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectClient(c)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left cursor-pointer text-sm"
                >
                  <Users size={14} className="text-cyan-600 shrink-0" />
                  <span className="text-gray-900 font-medium">{c.first_name} {c.last_name}</span>
                  <span className="text-gray-400 text-xs font-mono ml-auto">{c.assigned_ip || c.pppoe_username || ''}</span>
                </button>
              ))}
            </div>
          )}

          {matchingCollaborators.length > 0 && (
            <div className="px-2 pb-1 pt-1 border-t border-gray-100">
              <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Collaboratori</p>
              {matchingCollaborators.map((c) => (
                <button
                  key={c.id}
                  onClick={handleSelectCollaborator}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left cursor-pointer text-sm text-gray-700"
                >
                  <UserCheck size={14} className="text-amber-600 shrink-0" />
                  <span>{c.first_name} {c.last_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex items-center gap-3">
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">Esc</kbd> per chiudere</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">K</kbd> per aprire</span>
        </div>
      </div>
    </div>
  );
};
