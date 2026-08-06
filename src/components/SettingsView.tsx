import React, { useEffect, useState } from 'react';
import { dbService } from '../dbService';
import { useToast, useConfirm } from './Toast';
import { UserManagementPanel } from './UserManagementPanel';
import {
  Settings,
  RefreshCw,
  FolderTree,
  Shield,
  CheckCircle2,
  Database,
  Download,
  Upload,
  History,
  Server,
  KeyRound,
  Copy,
  Radio,
  MailCheck,
  HardDrive,
  FolderOpen,
  AlertTriangle,
} from 'lucide-react';
import type { AppPaths, BackupInfo, SecondaryBackupSettings, SyncSettings, AuditLogEntry, UpdateCheckResult, SmtpSettings } from '../types';

export const SettingsView: React.FC = () => {
  const { notify } = useToast();
  const confirmDialog = useConfirm();

  const [appVersion, setAppVersion] = useState('');
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  const [secondaryBackup, setSecondaryBackup] = useState<SecondaryBackupSettings | null>(null);
  const [secondaryDirDraft, setSecondaryDirDraft] = useState<string | null>(null);
  const [isPickingDir, setIsPickingDir] = useState(false);
  const [isSavingSecondary, setIsSavingSecondary] = useState(false);

  const [sync, setSync] = useState<SyncSettings | null>(null);
  const [syncForm, setSyncForm] = useState({ host: '', port: 3306, database: '', user: '', password: '', ssl: false, autoSyncMinutes: 1 });
  const [testingConnection, setTestingConnection] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [orgKeyInput, setOrgKeyInput] = useState('');
  const [generatedOrgKey, setGeneratedOrgKey] = useState<string | null>(null);

  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, secure: false, user: '', password: '', fromName: 'WispCore', fromEmail: '' });
  const [testingSmtp, setTestingSmtp] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  // L'auto-update in background parte già da solo all'avvio (electron/main.js);
  // qui ascoltiamo gli stessi eventi solo per mostrare l'avanzamento quando
  // l'utente lo avvia manualmente da questa schermata.
  useEffect(() => {
    const unsubscribe = dbService.onUpdateEvent((evt) => {
      if (evt.type === 'progress') setDownloadPercent(evt.percent ?? null);
    });
    return unsubscribe;
  }, []);

  const handleDownloadUpdate = async () => {
    setIsDownloadingUpdate(true);
    setDownloadPercent(0);
    try {
      await dbService.downloadUpdateNow();
      notify('Download completato. Se è disponibile un aggiornamento riceverai a breve la richiesta di installazione.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : "Impossibile scaricare l'aggiornamento.", 'error');
    } finally {
      setIsDownloadingUpdate(false);
      setDownloadPercent(null);
    }
  };

  const loadAll = async () => {
    const [v, p, b, log, s, sm, secBackup] = await Promise.all([
      dbService.getAppVersion(),
      dbService.getAppPaths(),
      dbService.getBackupsList(),
      dbService.getAuditLog(15),
      dbService.getSyncSettings(),
      dbService.getSmtpSettings(),
      dbService.getSecondaryBackupSettings(),
    ]);
    setAppVersion(v);
    setPaths(p);
    setBackups(b);
    setAuditLog(log);
    setSync(s);
    setSyncForm({ host: s.host, port: s.port, database: s.database, user: s.user, password: '', ssl: s.ssl, autoSyncMinutes: s.autoSyncMinutes });
    setSmtp(sm);
    setSmtpForm({ host: sm.host, port: sm.port, secure: sm.secure, user: sm.user, password: '', fromName: sm.fromName, fromEmail: sm.fromEmail });
    setSecondaryBackup(secBackup);
    setSecondaryDirDraft(secBackup.directory);
  };

  const handlePickSecondaryDir = async () => {
    setIsPickingDir(true);
    try {
      const dir = await dbService.pickSecondaryBackupDir();
      if (dir) setSecondaryDirDraft(dir);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossibile aprire il selettore di cartelle.', 'error');
    } finally {
      setIsPickingDir(false);
    }
  };

  const handleSaveSecondaryBackup = async (enabled: boolean) => {
    setIsSavingSecondary(true);
    try {
      const updated = await dbService.setSecondaryBackupSettings({ enabled, directory: secondaryDirDraft });
      setSecondaryBackup(updated);
      notify(enabled ? 'Backup secondario attivato.' : 'Backup secondario disattivato.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore nel salvataggio del backup secondario.', 'error');
    } finally {
      setIsSavingSecondary(false);
    }
  };

  const handleSaveSmtpSettings = async (enabled: boolean) => {
    try {
      const updated = await dbService.setSmtpSettings({ ...smtpForm, enabled });
      setSmtp(updated);
      notify('Configurazione SMTP salvata.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore nel salvataggio.', 'error');
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const result = await dbService.testSmtpConnection(smtpForm.password ? smtpForm : { ...smtpForm, password: undefined });
      if (result.ok) notify('Connessione SMTP riuscita.', 'success');
      else notify(`Connessione fallita: ${result.error}`, 'error');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore di connessione.', 'error');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    setUpdateResult(null);
    try {
      const result = await dbService.checkForUpdate();
      setUpdateResult(result);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Impossibile contattare GitHub.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleRunBackup = async () => {
    setIsBackingUp(true);
    try {
      await dbService.runBackupNow();
      notify('Backup creato con successo.', 'success');
      loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore durante il backup.', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (fileName: string) => {
    const confirmed = await confirmDialog(
      `Ripristinare il backup "${fileName}"? Lo stato attuale del database verrà salvato come copia di sicurezza prima della sovrascrittura.`
    );
    if (!confirmed) return;
    setIsRestoring(fileName);
    try {
      await dbService.restoreBackup(fileName);
      notify('Database ripristinato con successo.', 'success');
      loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore durante il ripristino.', 'error');
    } finally {
      setIsRestoring(null);
    }
  };

  const handleExport = async () => {
    try {
      const filePath = await dbService.exportFullBackup();
      if (filePath) notify(`Backup esportato in: ${filePath}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore durante l\'esportazione.', 'error');
    }
  };

  const handleImport = async () => {
    const confirmed = await confirmDialog('L\'importazione unirà i dati del file selezionato con quelli esistenti. Continuare?');
    if (!confirmed) return;
    try {
      const done = await dbService.importFullBackup();
      if (done) {
        notify('Dati importati con successo.', 'success');
        loadAll();
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'File non valido.', 'error');
    }
  };

  const handleSaveSyncSettings = async (enabled: boolean) => {
    try {
      const updated = await dbService.setSyncSettings({ ...syncForm, enabled });
      setSync(updated);
      notify('Configurazione MariaDB salvata.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore nel salvataggio.', 'error');
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await dbService.testSyncConnection(syncForm.password ? syncForm : { ...syncForm, password: undefined });
      if (result.ok) notify('Connessione al server MariaDB riuscita.', 'success');
      else notify(`Connessione fallita: ${result.error}`, 'error');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore di connessione.', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunSync = async () => {
    setRunningSync(true);
    try {
      const summary = await dbService.runSync();
      notify(
        `Sync completata: ${summary.pushed} record inviati, ${summary.pulled.clients + summary.pulled.collaborators + summary.pulled.payments + summary.pulled.commissions} ricevuti.`,
        'success'
      );
      loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore durante la sincronizzazione.', 'error');
    } finally {
      setRunningSync(false);
    }
  };

  const handleGenerateOrgKey = async () => {
    const confirmed = await confirmDialog(
      'Verrà generata una nuova Chiave di Organizzazione condivisa e tutte le password PPPoE salvate verranno ri-cifrate con essa. Dovrai copiarla su ogni altra postazione che vuoi collegare a questo server. Continuare?'
    );
    if (!confirmed) return;
    try {
      const key = await dbService.generateOrgKey();
      setGeneratedOrgKey(key);
      notify('Chiave di organizzazione generata. Copiala ora, non verrà mostrata di nuovo.', 'success');
      loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Errore nella generazione della chiave.', 'error');
    }
  };

  const handleImportOrgKey = async () => {
    if (!orgKeyInput.trim()) return;
    try {
      await dbService.importOrgKey(orgKeyInput.trim());
      notify('Chiave di organizzazione importata con successo.', 'success');
      setOrgKeyInput('');
      loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Chiave non valida.', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white/80 glass-panel rounded-2xl p-6 border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Settings className="text-blue-600" size={24} />
          <span>Impostazioni di Sistema, Backup & Sincronizzazione</span>
        </h1>
        <p className="text-gray-500 text-xs mt-1">File system locale, disaster recovery e collegamento multi-sede</p>
      </div>

      <UserManagementPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Auto-update --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 font-bold">GH</div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Verifica Aggiornamenti</h3>
              <p className="text-xs text-gray-500">Controllo diretto delle GitHub Releases</p>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 font-mono text-xs text-gray-600 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Versione Installata:</span>
              <span className="text-cyan-700 font-bold">v{appVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Repository:</span>
              <span className="text-blue-700">AprileNunzio/WispCore</span>
            </div>
          </div>

          {updateResult && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              updateResult.isLatest ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <CheckCircle2 size={16} />
              <span>
                {updateResult.isLatest
                  ? `Sei già all'ultima versione (v${appVersion}).`
                  : `Nuova versione disponibile: v${updateResult.latestVersion}.`}
              </span>
            </div>
          )}
          {updateError && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs">{updateError}</div>
          )}

          {isDownloadingUpdate && (
            <div className="space-y-1.5">
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-600 transition-all"
                  style={{ width: `${downloadPercent ?? 0}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 text-center">Download in corso in background{downloadPercent != null ? ` — ${downloadPercent}%` : '…'}</p>
            </div>
          )}

          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold py-3 rounded-xl shadow-lg border border-blue-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={isCheckingUpdate ? 'animate-spin' : ''} />
            <span>Verifica Aggiornamenti su GitHub</span>
          </button>

          {updateResult && !updateResult.isLatest && (
            <button
              onClick={handleDownloadUpdate}
              disabled={isDownloadingUpdate}
              className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-semibold py-3 rounded-xl shadow-lg border border-emerald-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <Download size={16} />
              <span>{isDownloadingUpdate ? 'Download in corso...' : `Scarica v${updateResult.latestVersion} in Background`}</span>
            </button>
          )}
          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            Ad ogni avvio WispCore verifica da solo la presenza di aggiornamenti e li scarica in background: al termine ti chiederà se installarli.
          </p>
        </div>

        {/* --- Directory tree --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
              <FolderTree size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Albero Directory Locale</h3>
              <p className="text-xs text-gray-500">{paths?.oneDriveDetected ? 'Sincronizzata automaticamente con OneDrive' : 'OneDrive non rilevato: percorso locale standard'}</p>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 font-mono text-xs text-gray-600 space-y-2 overflow-x-auto">
            <div>
              <span className="text-gray-400 block text-[10px] uppercase">Cartella Radice:</span>
              <span className="text-emerald-700 font-semibold">{paths?.rootDir}</span>
            </div>
            <div className="pt-2 border-t border-gray-200 space-y-1 text-[11px]">
              <p className="text-gray-500">├── DB: <span className="text-gray-900">{paths?.dbPath}</span></p>
              <p className="text-gray-500">└── Backups: <span className="text-gray-900">{paths?.backupsDir}</span></p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 text-xs text-gray-600">
            <Shield className="text-cyan-700 shrink-0" size={20} />
            <span>Database cifrato AES-256-GCM at-rest{paths?.oneDriveDetected ? ' e sincronizzato su OneDrive' : ''}.</span>
          </div>
        </div>

        {/* --- Backup & restore --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
                <Database size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Backup Automatico & Ripristino</h3>
                <p className="text-xs text-gray-500">Snapshot giornalieri (30gg + 12 mesi), verificati con checksum SHA-256</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                <Download size={14} /> Esporta JSON
              </button>
              <button
                onClick={handleImport}
                className="flex items-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                <Upload size={14} /> Importa JSON
              </button>
              <button
                onClick={handleRunBackup}
                disabled={isBackingUp}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={isBackingUp ? 'animate-spin' : ''} /> Backup Ora
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-2.5">File</th>
                  <th className="p-2.5">Data</th>
                  <th className="p-2.5">Dimensione</th>
                  <th className="p-2.5">Integrità</th>
                  <th className="p-2.5 text-right">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {backups.length === 0 ? (
                  <tr><td colSpan={5} className="p-5 text-center text-gray-400">Nessun backup ancora creato.</td></tr>
                ) : (
                  backups.map((b) => (
                    <tr key={b.fileName} className="hover:bg-gray-50">
                      <td className="p-2.5 font-mono">{b.fileName}</td>
                      <td className="p-2.5 font-mono text-gray-400">{new Date(b.createdAt).toLocaleString('it-IT')}</td>
                      <td className="p-2.5 font-mono text-gray-400">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="p-2.5">
                        {b.checksumOk === null ? (
                          <span className="text-gray-400">N/D</span>
                        ) : b.checksumOk ? (
                          <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 size={12} /> OK</span>
                        ) : (
                          <span className="text-rose-600">Corrotto</span>
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleRestore(b.fileName)}
                          disabled={isRestoring === b.fileName}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium cursor-pointer text-[11px] disabled:opacity-50 flex items-center gap-1 ml-auto"
                        >
                          <History size={12} /> Ripristina
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- Secondary backup (external directory / NAS) --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200">
                <HardDrive size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Backup Secondario (Cartella Esterna)</h3>
                <p className="text-xs text-gray-500">Replica automatica su NAS, disco esterno o unità di rete aziendale, ad ogni backup</p>
              </div>
            </div>
            {secondaryBackup?.enabled && (
              <span className="text-[10px] px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-semibold flex items-center gap-1">
                <CheckCircle2 size={11} /> Attivo
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 text-xs items-end">
            <div>
              <label className="text-gray-500 block mb-1">Cartella di Destinazione</label>
              <div className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-700 font-mono truncate" title={secondaryDirDraft || undefined}>
                {secondaryDirDraft || 'Nessuna cartella selezionata'}
              </div>
            </div>
            <button
              onClick={handlePickSecondaryDir}
              disabled={isPickingDir}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 text-xs font-semibold px-3 py-2.5 rounded-xl cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <FolderOpen size={14} /> {isPickingDir ? 'Attendere...' : 'Scegli Cartella...'}
            </button>
          </div>

          {secondaryBackup?.lastError && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" /> Ultimo tentativo fallito: {secondaryBackup.lastError}
            </div>
          )}

          {secondaryBackup?.lastBackupAt && (
            <p className="text-[11px] text-gray-400">Ultima replica riuscita: {new Date(secondaryBackup.lastBackupAt).toLocaleString('it-IT')}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleSaveSecondaryBackup(false)}
              disabled={isSavingSecondary}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50"
            >
              Salva senza Attivare
            </button>
            <button
              onClick={() => handleSaveSecondaryBackup(true)}
              disabled={isSavingSecondary || !secondaryDirDraft}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50"
            >
              Salva & Attiva Replica
            </button>
          </div>

          <p className="text-[10px] text-gray-400 leading-relaxed">
            Ogni volta che viene creato un backup (giornaliero automatico o manuale) viene copiato anche qui, con checksum SHA-256 e la stessa politica di retention (30 giorni + 12 mesi). Se la cartella non è raggiungibile (es. disco scollegato), il backup locale primario non viene comunque compromesso.
          </p>
        </div>

        {/* --- MariaDB multi-site sync --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-200">
              <Server size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Sincronizzazione Multi-Sede (MariaDB)</h3>
              <p className="text-xs text-gray-500">Collega più postazioni/tecnici a un server centrale online — sync automatica ad ogni modifica</p>
            </div>
            {sync?.enabled && (
              <span className="ml-auto text-[10px] px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-semibold flex items-center gap-1">
                <Radio size={11} className="animate-pulse" /> Attiva
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-gray-500 block mb-1">Host Server</label>
              <input type="text" placeholder="es. sync.alynet.it" value={syncForm.host}
                onChange={(e) => setSyncForm({ ...syncForm, host: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Porta</label>
              <input type="number" value={syncForm.port}
                onChange={(e) => setSyncForm({ ...syncForm, port: Number(e.target.value) || 3306 })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Database</label>
              <input type="text" value={syncForm.database}
                onChange={(e) => setSyncForm({ ...syncForm, database: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Utente</label>
              <input type="text" value={syncForm.user}
                onChange={(e) => setSyncForm({ ...syncForm, user: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Password {sync?.hasPassword && <span className="text-gray-400">(già impostata, lascia vuoto per non cambiarla)</span>}</label>
              <input type="password" value={syncForm.password}
                onChange={(e) => setSyncForm({ ...syncForm, password: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Fallback di sicurezza ogni (minuti, min. 1)</label>
              <input type="number" min={1} value={syncForm.autoSyncMinutes}
                onChange={(e) => setSyncForm({ ...syncForm, autoSyncMinutes: Math.max(1, Number(e.target.value) || 1) })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="ssl" checked={syncForm.ssl} onChange={(e) => setSyncForm({ ...syncForm, ssl: e.target.checked })} />
              <label htmlFor="ssl" className="text-gray-500">Connessione TLS/SSL</label>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 -mt-1">
            Quando attiva, la sync parte automaticamente pochi secondi dopo ogni modifica (cliente, pagamento, provvigione...); l'intervallo qui sopra è solo un fallback di sicurezza nel caso non ci siano modifiche.
          </p>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleTestConnection} disabled={testingConnection}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50">
              {testingConnection ? 'Test in corso...' : 'Testa Connessione'}
            </button>
            <button onClick={() => handleSaveSyncSettings(false)}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer">
              Salva Configurazione
            </button>
            <button onClick={() => handleSaveSyncSettings(true)}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl cursor-pointer">
              Salva & Attiva Sync
            </button>
            {sync?.enabled && (
              <button onClick={handleRunSync} disabled={runningSync}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                <RefreshCw size={13} className={runningSync ? 'animate-spin' : ''} /> Sincronizza Ora
              </button>
            )}
          </div>

          {sync?.lastSyncAt && (
            <p className="text-[11px] text-gray-400">Ultima sincronizzazione: {new Date(sync.lastSyncAt).toLocaleString('it-IT')}</p>
          )}

          <div className="pt-3 border-t border-gray-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 uppercase tracking-wider">
              <KeyRound size={14} /> Chiave di Organizzazione (credenziali PPPoE condivise tra sedi)
            </div>
            <p className="text-[11px] text-gray-400">
              Necessaria perché le password PPPoE restino leggibili su tutte le postazioni collegate. Generala una sola volta sulla
              sede principale, poi copiala nelle Impostazioni di ogni altra postazione.
            </p>

            {sync?.hasOrgKey ? (
              <div className="flex items-center gap-2 text-emerald-700 text-xs">
                <CheckCircle2 size={14} /> Chiave di organizzazione già configurata su questa postazione.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={handleGenerateOrgKey}
                  className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold rounded-xl cursor-pointer">
                  Genera Nuova Chiave (sede principale)
                </button>
                <div className="flex gap-2">
                  <input type="text" placeholder="Incolla chiave da altra postazione" value={orgKeyInput}
                    onChange={(e) => setOrgKeyInput(e.target.value)}
                    className="flex-1 bg-white border border-gray-300 rounded-lg p-2 text-gray-900 font-mono text-[11px]" />
                  <button onClick={handleImportOrgKey}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer">
                    Importa
                  </button>
                </div>
              </div>
            )}

            {generatedOrgKey && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] space-y-2">
                <p className="font-semibold">Copia questa chiave adesso e conservala: non verrà mostrata di nuovo.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all bg-white p-2 rounded-lg border border-amber-200">{generatedOrgKey}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(generatedOrgKey); notify('Chiave copiata negli appunti.', 'success'); }}
                    className="p-2 bg-white hover:bg-gray-50 border border-amber-200 rounded-lg cursor-pointer shrink-0"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- SMTP / email --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <MailCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Server SMTP (invio email)</h3>
              <p className="text-sm text-gray-500">Necessario per inviare i solleciti di pagamento dalla pagina Scadenze</p>
            </div>
            {smtp?.enabled && (
              <span className="ml-auto text-[11px] px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-semibold">Attivo</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="text-gray-500 block mb-1">Host SMTP</label>
              <input type="text" placeholder="es. smtp.gmail.com" value={smtpForm.host}
                onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Porta</label>
              <input type="number" value={smtpForm.port}
                onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) || 587 })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Utente / Email di accesso</label>
              <input type="text" value={smtpForm.user}
                onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Password {smtp?.hasPassword && <span className="text-gray-400">(già impostata)</span>}</label>
              <input type="password" value={smtpForm.password}
                onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Nome Mittente</label>
              <input type="text" value={smtpForm.fromName}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Email Mittente</label>
              <input type="email" value={smtpForm.fromEmail}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="smtp-secure" checked={smtpForm.secure} onChange={(e) => setSmtpForm({ ...smtpForm, secure: e.target.checked })} />
              <label htmlFor="smtp-secure" className="text-gray-500">Connessione TLS/SSL (porta 465)</label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleTestSmtp} disabled={testingSmtp}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50">
              {testingSmtp ? 'Test in corso...' : 'Testa Connessione'}
            </button>
            <button onClick={() => handleSaveSmtpSettings(false)}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl cursor-pointer">
              Salva Configurazione
            </button>
            <button onClick={() => handleSaveSmtpSettings(true)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl cursor-pointer">
              Salva & Attiva Invio Email
            </button>
          </div>
        </div>

        {/* --- Audit log --- */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-200 space-y-3 lg:col-span-2">
          <h3 className="text-base font-bold text-gray-900">Registro Attività (Audit Log)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] text-gray-600">
              <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-2">Data/Ora</th>
                  <th className="p-2">Utente</th>
                  <th className="p-2">Azione</th>
                  <th className="p-2">Entità</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLog.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-gray-400">Nessuna attività registrata.</td></tr>
                ) : (
                  auditLog.map((a) => (
                    <tr key={a.id}>
                      <td className="p-2 font-mono text-gray-400">{new Date(a.ts).toLocaleString('it-IT')}</td>
                      <td className="p-2">{a.actor || 'system'}</td>
                      <td className="p-2 font-mono">{a.action}</td>
                      <td className="p-2 text-gray-500">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
