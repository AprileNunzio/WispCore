import * as database from '../database.js';
import * as mariadbSync from './mariadb.js';
import { appendLog } from '../paths.js';

// Comportamento enterprise di default: quando la sync è attiva, ogni modifica
// (cliente, pagamento, provvigione, collaboratore) innesca una sincronizzazione
// entro pochi secondi. In assenza di modifiche, un fallback di sicurezza
// garantisce comunque una sincronizzazione almeno ogni 1 minuto.
const CHANGE_DEBOUNCE_MS = 4000;
const FALLBACK_FLOOR_MINUTES = 1;

let debounceTimer = null;
let intervalTimer = null;
let getActor = () => 'system';
let syncInFlight = false;
let initialized = false;

function triggerSync(reason) {
  if (syncInFlight) return; // evita sync sovrapposte se una precedente è ancora in corso
  const settings = mariadbSync.getSyncSettings();
  if (!settings.enabled) return;

  syncInFlight = true;
  mariadbSync
    .runSync(getActor())
    .catch((err) => appendLog(`Auto-sync (${reason}) fallita: ${err.message}`))
    .finally(() => {
      syncInFlight = false;
    });
}

function scheduleIntervalFallback() {
  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = null;

  const settings = mariadbSync.getSyncSettings();
  if (!settings.enabled) return;

  const minutes = Math.max(FALLBACK_FLOOR_MINUTES, settings.autoSyncMinutes || FALLBACK_FLOOR_MINUTES);
  intervalTimer = setInterval(() => triggerSync('interval'), minutes * 60 * 1000);
}

/** Da chiamare una sola volta all'avvio dell'app, dopo database.init(). */
export function initAutoSync(actorProvider) {
  if (initialized) return;
  initialized = true;
  getActor = actorProvider || getActor;

  database.dbEvents.on('change', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => triggerSync('on-change'), CHANGE_DEBOUNCE_MS);
  });

  scheduleIntervalFallback();
}

/** Da richiamare dopo che l'utente salva le impostazioni di sync, per applicarle subito senza riavviare l'app. */
export function rescheduleAutoSync() {
  scheduleIntervalFallback();
}

export function stopAutoSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  debounceTimer = null;
  intervalTimer = null;
}
