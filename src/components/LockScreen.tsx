import React, { useState } from 'react';
import { dbService } from '../dbService';
import type { Session } from '../types';
import { Lock, ShieldAlert, ArrowRight, Server, Wifi, Eye, EyeOff, Delete, Shield, Cpu, Code } from 'lucide-react';
import { APP_VERSION } from '../version';

interface Props {
  onUnlock: (session: Session) => void;
}

const MAX_VISIBLE_DOTS = 8;
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export const LockScreen: React.FC<Props> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Con più utenti/PIN possibili non sappiamo chi sta per accedere finché non
  // digita il PIN (nessun selettore username): il saluto resta generico e
  // mostriamo il nome reale solo dopo lo sblocco (vedi topbar in App.tsx).
  const submitPin = async (candidate: string) => {
    if (!candidate || loading) return;
    setLoading(true);
    setError(null);

    try {
      const session = await dbService.verifyPin(candidate);
      if (session) {
        onUnlock(session);
      } else {
        const lockout = await dbService.getLockoutState();
        setError(
          lockout.isLocked
            ? `Troppi tentativi falliti. Riprova dopo le ${new Date(lockout.lockedUntil!).toLocaleTimeString('it-IT')}.`
            : `PIN o Passkey non corretta. Tentativi rimasti: ${lockout.remainingAttempts}.`
        );
        setPin('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la verifica.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPin(pin);
  };

  const handleKeypadPress = (key: string) => {
    if (loading) return;
    if (key === 'back') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => p + key);
  };

  const dotsToShow = Math.min(pin.length, MAX_VISIBLE_DOTS);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-300/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[380px] h-[380px] bg-cyan-300/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm glass-panel-glow rounded-3xl p-8 relative z-10 text-center shadow-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white mb-5 shadow-lg shadow-blue-500/25">
          <Wifi size={30} />
        </div>

        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">WispCore</h2>
        <p className="text-gray-500 text-xs mt-1 flex items-center justify-center gap-1">
          <Lock size={11} /> Accesso staff riservato — inserisci il tuo PIN personale
        </p>

        <div className="my-5 flex flex-col gap-2">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 text-left">
            <Server className="text-blue-600 shrink-0" size={18} />
            <div className="text-xs text-gray-600 flex-1">
              <span className="text-gray-900 font-bold block">Connessione DB Attiva</span>
              <span className="text-[10px] uppercase tracking-wide">SQLite (Cifrato) AES-256</span>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
          </div>

          <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl flex items-center gap-3 text-left">
            <Shield className="text-cyan-600 shrink-0" size={18} />
            <div className="text-xs text-cyan-800 flex-1">
              <span className="font-bold block">Accesso Sicuro</span>
              <span className="text-[10px] tracking-wide">Modalità WispCore Enterprise</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-center gap-2 animate-shake">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          {/* Indicatore visivo del PIN inserito, in stile moderno a puntini */}
          <div className="flex items-center justify-center gap-2 h-4">
            {pin.length === 0 ? (
              <span className="text-gray-300 text-xs">Inserisci il tuo PIN / Passkey</span>
            ) : (
              <>
                {Array.from({ length: dotsToShow }).map((_, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                ))}
                {pin.length > MAX_VISIBLE_DOTS && <span className="text-blue-600 text-xs font-bold">+{pin.length - MAX_VISIBLE_DOTS}</span>}
              </>
            )}
          </div>

          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="w-full bg-white border border-gray-300 rounded-xl py-3.5 pl-4 pr-11 text-center text-gray-900 placeholder-gray-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 text-lg font-mono tracking-widest transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              tabIndex={-1}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              title={showPin ? 'Nascondi PIN' : 'Mostra PIN'}
            >
              {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {/* Tastierino numerico touch-friendly: comodo su schermi tattili in ufficio, in alternativa alla tastiera */}
          <div className="grid grid-cols-3 gap-2">
            {KEYPAD_KEYS.map((key, i) =>
              key === '' ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleKeypadPress(key)}
                  disabled={loading}
                  className="py-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-semibold text-lg cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {key === 'back' ? <Delete size={18} /> : key}
                </button>
              )
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-600/25 border border-blue-400/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span>Verifica in corso...</span>
            ) : (
              <>
                <span>Sblocca Gestionale</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 flex flex-col items-center gap-2 border-t border-gray-100 pt-5">
          <div className="flex items-center gap-4 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1"><Cpu size={12} /> Node.js</span>
            <span className="flex items-center gap-1"><Code size={12} /> React</span>
            <span className="flex items-center gap-1"><Server size={12} /> NMS Sync</span>
          </div>
          <p className="text-[11px] text-gray-400">
            WispCore Enterprise v{APP_VERSION} &copy; {new Date().getFullYear()} NunzioTech
          </p>
        </div>
      </div>
    </div>
  );
};
