import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast } from './Toast';
import { ShieldCheck, Lock, User, KeyRound, FolderTree, History, Eye, EyeOff } from 'lucide-react';
import type { AppPaths } from '../types';

interface Props {
  onSetupComplete: () => void;
}

export const SetupScreen: React.FC<Props> = ({ onSetupComplete }) => {
  const { notify } = useToast();
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appPaths, setAppPaths] = useState<AppPaths | null>(null);
  const [hasLegacyData, setHasLegacyData] = useState(false);

  useEffect(() => {
    dbService.getAppPaths().then(setAppPaths).catch(() => {});
    setHasLegacyData(dbService.hasLegacyLocalStorageData());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Inserisci un nome utente per il Super Admin');
      return;
    }
    if (pin.length < 4) {
      setError('Il PIN / Passkey deve contenere almeno 4 caratteri o cifre');
      return;
    }
    if (pin !== confirmPin) {
      setError('I PIN inseriti non coincidono');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await dbService.registerSuperAdmin(username, pin);
      if (hasLegacyData) notify('Dati precedenti importati con successo nel nuovo database cifrato.', 'success');
      onSetupComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la creazione dell\'account Admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-300/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-cyan-300/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl glass-panel-glow rounded-2xl p-8 relative z-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-2xl border border-blue-200 mb-4 shadow-sm">
            <ShieldCheck size={42} />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">WispCore Zero-Trust</h1>
          <p className="text-gray-500 text-sm mt-2">Inizializzazione Sicura & Registrazione Super Admin</p>
        </div>

        {/* Directory structure preview box */}
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">
            <FolderTree size={16} /> Struttura Directory Locale {appPaths?.oneDriveDetected ? '(sincronizzata OneDrive)' : ''}:
          </div>
          <div className="font-mono text-xs text-gray-600 space-y-1 pl-2">
            <p className="text-blue-700 font-semibold">{appPaths?.rootDir ?? '...'}\</p>
            <p className="pl-4 text-emerald-700">├── database\wisp_data.db (cifrato AES-256-GCM)</p>
            <p className="pl-4 text-gray-500">├── config\app_config.json</p>
            <p className="pl-4 text-gray-500">├── logs\app.log</p>
            <p className="pl-4 text-gray-500">└── backups\ (snapshot giornalieri automatici)</p>
          </div>
        </div>

        {hasLegacyData && (
          <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2.5">
            <History size={16} className="shrink-0 mt-0.5" />
            <span>Rilevati dati di una versione precedente su questo PC: verranno importati automaticamente nel nuovo database cifrato non appena crei il Super Admin.</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
              Username Super Admin
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="es. admin"
                className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-11 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                PIN / Passkey
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-11 pr-10 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                  title={showPin ? 'Nascondi PIN' : 'Mostra PIN'}
                >
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Conferma PIN
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                <input
                  type={showPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-11 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-600/25 border border-blue-400/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Cifratura in corso (Argon2id)...</span>
            ) : (
              <>
                <ShieldCheck size={20} />
                <span>Crea Super Admin & Inizializza DB</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
