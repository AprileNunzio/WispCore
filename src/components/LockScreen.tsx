import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { Lock, ShieldAlert, ArrowRight, Server } from 'lucide-react';

interface Props {
  onUnlock: () => void;
}

export const LockScreen: React.FC<Props> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminName, setAdminName] = useState('Super Admin');

  useEffect(() => {
    dbService.getAdminUsername().then(setAdminName).catch(() => {});
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const isValid = await dbService.verifyPin(pin);
      if (isValid) {
        onUnlock();
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-blue-300/20 rounded-full blur-[130px] pointer-events-none" />

      <div className="w-full max-w-md glass-panel-glow rounded-3xl p-8 relative z-10 text-center shadow-2xl">
        <div className="inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-2xl border border-blue-200 mb-5 shadow-sm">
          <Lock size={36} />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">WispCore Zero-Trust Access</h2>
        <p className="text-gray-500 text-xs mt-1">Sessione protetta per l'utente <span className="text-blue-700 font-semibold">{adminName}</span></p>

        <div className="my-6 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 text-left">
          <Server className="text-cyan-700 shrink-0" size={20} />
          <div className="text-xs text-gray-600">
            <span className="text-gray-900 font-medium block">Database Cifrato in Locale</span>
            <span>Documenti\NunzioTech\WispCore\database\wisp_data.db</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-center gap-2 animate-shake">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Inserisci PIN / Passkey"
              autoFocus
              className="w-full bg-white border border-gray-300 rounded-xl py-3.5 px-4 text-center text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 text-lg font-mono tracking-widest transition-all"
            />
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
      </div>
    </div>
  );
};
