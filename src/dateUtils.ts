/**
 * Utility di data condivise dal renderer. WispCore è un gestionale per
 * un'attività italiana: i bucket mensili dei grafici devono ragionare sul
 * calendario di Roma esplicitamente, non su quello (magari diverso) del
 * sistema operativo. Mai usare `toISOString()` per estrarre una data di
 * calendario: converte in UTC e per un fuso avanti su UTC (Italia, UTC+1/+2)
 * sposta il giorno/mese indietro di uno. Specchio di electron/services/database.js.
 */
const APP_TIMEZONE = 'Europe/Rome';
const ROME_MONTH_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit' });
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** Data di calendario "YYYY-MM-DD" nel fuso orario di Roma di un dato istante (default: adesso). */
export function localDateString(date: Date = new Date()): string {
  return ROME_DATE_FORMATTER.format(date); // 'en-CA' formatta già come YYYY-MM-DD
}

/** "YYYY-MM" del mese `monthOffset` mesi prima/dopo `baseDate`, calcolato nel fuso orario di Roma. */
export function localYearMonth(baseDate: Date, monthOffset = 0): string {
  const parts = ROME_MONTH_FORMATTER.formatToParts(baseDate);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value) - 1; // 0-indexed
  const totalMonths = year * 12 + month + monthOffset;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Etichetta breve ("Ago 2026") di una chiave "YYYY-MM". */
export function monthKeyLabel(key: string): string {
  const [, m] = key.split('-');
  return MONTH_LABELS[Number(m) - 1] || key;
}
