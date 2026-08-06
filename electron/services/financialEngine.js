/**
 * Motore Finanziario WispCore (financialEngine.js)
 * 
 * Gestisce l'algoritmo di affidabilità creditizia (Punteggio Cattivo Pagatore),
 * il calcolo allineato delle scadenze contrattuali, la normalizzazione dei
 * canoni per ciclo di fatturazione (MRR/ARPU/LTV) e le regole provvigionali.
 * 
 * Fuso Orario di riferimento: Europe/Rome.
 */

const APP_TIMEZONE = 'Europe/Rome';
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export const BILLING_CYCLE_MONTHS = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  TRIMONTHLY: 3,
  SEMESTRAL: 6,
  ANNUAL: 12,
};

/** Restituisce la data di oggi "YYYY-MM-DD" nel fuso orario di Roma. */
export function getTodayRomeString() {
  return ROME_DATE_FORMATTER.format(new Date());
}

/**
 * Calcola i giorni di differenza tra due date "YYYY-MM-DD".
 * Restituisce un numero positivo se dateA è successiva a dateB.
 */
export function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return 0;
  const a = new Date(`${dateA}T00:00:00+01:00`).getTime();
  const b = new Date(`${dateB}T00:00:00+01:00`).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

/**
 * Aggiunge N mesi a una data "YYYY-MM-DD" preservando per quanto possibile il giorno del mese.
 * Esegue i calcoli e formatta nel fuso orario di Roma.
 */
export function addMonthsToDateString(dateStr, monthsToAdd) {
  if (!dateStr) return getTodayRomeString();
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetYear = y + Math.floor((m - 1 + monthsToAdd) / 12);
  const targetMonth = ((m - 1 + monthsToAdd) % 12) + 1;

  // Gestione ultimo giorno del mese (es. 31 Gennaio + 1 mese -> 28/29 Febbraio)
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(d, maxDaysInTargetMonth);

  const monthFormatted = String(targetMonth).padStart(2, '0');
  const dayFormatted = String(targetDay).padStart(2, '0');
  return `${targetYear}-${monthFormatted}-${dayFormatted}`;
}

/**
 * Normalizza il canone ricorrente al valore mensile in base al ciclo di fatturazione.
 */
export function normalizeMonthlyFee(monthlyFee, billingCycle = 'MONTHLY') {
  const fee = Number(monthlyFee) || 0;
  const months = BILLING_CYCLE_MONTHS[billingCycle] || 1;
  return fee / months;
}

/**
 * ALGORITMO PUNTEGGIO CATTIVO PAGATORE (Reliability Index 0 - 100)
 * 
 * Punteggio base: 100/100
 * Penalità:
 * 1. Pagamenti saldati in ritardo (data incasso > data scadenza):
 *    - Ritardo da 1 a 7 giorni: 2 punti per giorno di ritardo
 *    - Ritardo da 8 a 30 giorni: 15 punti base + 3 punti per ogni giorno oltre il 7°
 *    - Ritardo > 30 giorni: 50 punti di penalità fissa per singolo evento
 * 2. Pagamenti attualmente INSOLUTI (OVERDUE):
 *    - 25 punti di penalità per ogni voce scaduta non ancora saldata
 *    - Se l'insoluto ha oltre 30 giorni dalla scadenza, ulteriori 25 punti
 * 3. Tasso di puntualità:
 *    - Moltiplicatore sul totale di pagamenti in ritardo rispetto al totale storico.
 * 
 * Gradi di Rischio:
 * - 90..100: EXCELLENT (🟢 Pagatore Modello)
 * - 70..89:  MODERATE  (🟡 Ritardi Occasionali)
 * - 50..69:  RISKY     (🟠 A Rischio / Solleciti Frequenti)
 * - 0..49:   BAD_PAYER (🔴 Cattivo Pagatore)
 */
export function calculateClientReliability(client, clientPayments = []) {
  const today = getTodayRomeString();
  let score = 100;

  const validPayments = clientPayments.filter(p => !p.deleted);
  const totalCount = validPayments.length;
  
  let totalDaysLate = 0;
  let latePaymentsCount = 0;
  let currentOverdueCount = 0;
  let maxSingleDelayDays = 0;

  for (const p of validPayments) {
    if (p.status === 'PAID') {
      if (p.payment_date && p.due_date && p.payment_date > p.due_date) {
        const daysLate = daysBetween(p.payment_date, p.due_date);
        if (daysLate > 0) {
          latePaymentsCount++;
          totalDaysLate += daysLate;
          maxSingleDelayDays = Math.max(maxSingleDelayDays, daysLate);

          if (daysLate <= 7) {
            score -= daysLate * 2;
          } else if (daysLate <= 30) {
            score -= 15 + (daysLate - 7) * 3;
          } else {
            score -= 50;
          }
        }
      }
    } else if (p.status === 'OVERDUE' || (p.status === 'PENDING' && p.due_date && p.due_date < today)) {
      currentOverdueCount++;
      const daysOverdue = daysBetween(today, p.due_date);
      maxSingleDelayDays = Math.max(maxSingleDelayDays, daysOverdue);

      score -= 25;
      if (daysOverdue > 30) {
        score -= 25;
      }
    }
  }

  // Penalità sulla percentuale di pagamenti in ritardo
  if (totalCount > 0 && (latePaymentsCount + currentOverdueCount) > 0) {
    const unpunctualRatio = (latePaymentsCount + currentOverdueCount) / totalCount;
    if (unpunctualRatio > 0.5) score -= 15;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const avgDaysLate = latePaymentsCount > 0 ? Number((totalDaysLate / latePaymentsCount).toFixed(1)) : 0;

  let riskClass = 'EXCELLENT';
  let riskLabel = 'Eccellente';
  let riskBadgeColor = 'emerald';

  if (finalScore < 50 || currentOverdueCount >= 2 || maxSingleDelayDays >= 45) {
    riskClass = 'BAD_PAYER';
    riskLabel = 'Cattivo Pagatore';
    riskBadgeColor = 'rose';
  } else if (finalScore < 70 || currentOverdueCount === 1) {
    riskClass = 'RISKY';
    riskLabel = 'A Rischio';
    riskBadgeColor = 'amber';
  } else if (finalScore < 90 || latePaymentsCount > 0) {
    riskClass = 'MODERATE';
    riskLabel = 'Moderato';
    riskBadgeColor = 'yellow';
  }

  return {
    score: finalScore,
    riskClass,
    riskLabel,
    riskBadgeColor,
    totalPayments: totalCount,
    latePaymentsCount,
    currentOverdueCount,
    avgDaysLate,
    maxSingleDelayDays,
  };
}

/**
 * Calcola la nuova data di scadenza per un rinnovo contrattuale.
 * Per evitare di regalare giorni se un cliente paga in ritardo (es. scadenza 01/08, pagato il 05/08),
 * il rinnovo parte dalla VECCHIA SCADENZA (01/08 -> 01/09).
 */
export function calculateNextDueDate(previousDueDate, billingCycle = 'MONTHLY') {
  const baseDate = previousDueDate && previousDueDate.length === 10 ? previousDueDate : getTodayRomeString();
  const months = BILLING_CYCLE_MONTHS[billingCycle] || 1;
  return addMonthsToDateString(baseDate, months);
}
