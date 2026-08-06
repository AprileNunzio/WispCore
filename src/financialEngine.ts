import type { Client, Payment, BillingCycle } from './types';
import { localDateString } from './dateUtils';

// Helper centralizzati per filtrare i record eliminati e calcolare i totali in modo sicuro
export const getValidPayments = (payments: Payment[] = []) => payments.filter(p => !p.deleted);
export const getValidCommissions = <T extends { deleted?: boolean | number }>(commissions: T[] = []) => commissions.filter(c => !c.deleted);

export function calculateTotalRevenue(payments: Payment[] = []): number {
  return getValidPayments(payments).filter(p => p.status === 'PAID').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}

export function calculatePendingAmount(payments: Payment[] = []): number {
  return getValidPayments(payments).filter(p => p.status === 'PENDING').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}

export function calculateOverdueAmount(payments: Payment[] = []): number {
  return getValidPayments(payments).filter(p => p.status === 'OVERDUE').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}

export function calculateTotalCommissions<T extends { amount: number; deleted?: boolean | number }>(commissions: T[] = []): number {
  return getValidCommissions(commissions).reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
}

export function calculatePendingCommissions<T extends { amount: number; payout_status: string; deleted?: boolean | number }>(commissions: T[] = []): number {
  return getValidCommissions(commissions).filter(c => c.payout_status === 'PENDING').reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
}

export function calculatePaidCommissions<T extends { amount: number; payout_status: string; deleted?: boolean | number }>(commissions: T[] = []): number {
  return getValidCommissions(commissions).filter(c => c.payout_status === 'PAID').reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
}

export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  CUSTOM: 1,
};

export type RiskClass = 'EXCELLENT' | 'MODERATE' | 'RISKY' | 'BAD_PAYER';

export interface ReliabilityResult {
  score: number;
  riskClass: RiskClass;
  riskLabel: string;
  riskBadgeColor: 'emerald' | 'yellow' | 'amber' | 'rose';
  totalPayments: number;
  latePaymentsCount: number;
  currentOverdueCount: number;
  avgDaysLate: number;
  maxSingleDelayDays: number;
}

export interface BadPayerClientInfo extends ReliabilityResult {
  client: Client;
  overduePayments: Payment[];
}

export function daysBetween(dateA: string, dateB: string): number {
  if (!dateA || !dateB) return 0;
  const a = Date.parse(`${dateA.substring(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${dateB.substring(0, 10)}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export function calculateClientReliability(_client: Client, clientPayments: Payment[] = []): ReliabilityResult {
  const today = localDateString();
  let score = 100;

  const validPayments = clientPayments.filter(p => !p.deleted);
  const totalCount = validPayments.length;
  
  let totalDaysLate = 0;
  let latePaymentsCount = 0;
  let currentOverdueCount = 0;
  let maxSingleDelayDays = 0;
  let hasRecentSeriousDelay = false;

  for (const p of validPayments) {
    if (p.status === 'PAID') {
      if (p.payment_date && p.due_date && p.payment_date > p.due_date) {
        const daysLate = daysBetween(p.payment_date, p.due_date);
        if (daysLate > 0) {
          latePaymentsCount++;
          totalDaysLate += daysLate;
          maxSingleDelayDays = Math.max(maxSingleDelayDays, daysLate);

          if (daysLate >= 45) {
             const paymentTime = Date.parse(`${p.payment_date.substring(0,10)}T00:00:00Z`);
             if (!isNaN(paymentTime) && (Date.now() - paymentTime < 180 * 24 * 60 * 60 * 1000)) {
                 hasRecentSeriousDelay = true;
             }
          }

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

      if (daysOverdue >= 45) {
        hasRecentSeriousDelay = true; // È un insoluto ancora aperto e molto vecchio
      }

      score -= 25;
      if (daysOverdue > 30) {
        score -= 25;
      }
    }
  }

  // Richiede uno storico minimo (più di 2 pagamenti) per applicare la penale statistica sull'unpunctual ratio
  if (totalCount > 2 && (latePaymentsCount + currentOverdueCount) > 0) {
    const unpunctualRatio = (latePaymentsCount + currentOverdueCount) / totalCount;
    if (unpunctualRatio > 0.5) score -= 15;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const avgDaysLate = latePaymentsCount > 0 ? Number((totalDaysLate / latePaymentsCount).toFixed(1)) : 0;

  let riskClass: RiskClass = 'EXCELLENT';
  let riskLabel = 'Eccellente';
  let riskBadgeColor: 'emerald' | 'yellow' | 'amber' | 'rose' = 'emerald';

  if (finalScore < 50 || currentOverdueCount >= 2 || hasRecentSeriousDelay) {
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

export function computeBadPayersList(clients: Client[], payments: Payment[]): BadPayerClientInfo[] {
  const paymentsByClient = new Map<number, Payment[]>();
  for (const p of payments) {
    if (!paymentsByClient.has(p.client_id)) {
      paymentsByClient.set(p.client_id, []);
    }
    paymentsByClient.get(p.client_id)!.push(p);
  }

  const list: BadPayerClientInfo[] = [];

  const today = localDateString();

  for (const client of clients) {
    const clientPayments = paymentsByClient.get(client.id) || [];
    const rel = calculateClientReliability(client, clientPayments);
    const overduePayments = clientPayments.filter(p => 
      !p.deleted && (p.status === 'OVERDUE' || (p.status === 'PENDING' && p.due_date && p.due_date < today))
    );

    list.push({
      ...rel,
      client,
      overduePayments,
    });
  }

  // Ordina prima per punteggio crescente (i casi peggiori in cima)
  return list.sort((a, b) => a.score - b.score);
}

export interface NetWispMetrics {
  grossRevenue: number;
  totalCommissionsEarned: number;
  pendingCommissions: number;
  paidCommissions: number;
  netWispRevenue: number;
}

export function calculateNetWispMetrics(payments: Payment[] = [], commissions: { amount: number; payout_status: string; deleted?: boolean | number }[] = []): NetWispMetrics {
  const grossRevenue = calculateTotalRevenue(payments);
  const totalCommissionsEarned = calculateTotalCommissions(commissions);
  const pendingCommissions = calculatePendingCommissions(commissions);
  const paidCommissions = calculatePaidCommissions(commissions);
  
  // Bugfix: Net Wisp Revenue calcolato sottraendo per cassa (paidCommissions) invece che per competenza (totalCommissionsEarned)
  const netWispRevenue = Math.max(0, grossRevenue - paidCommissions);

  return {
    grossRevenue,
    totalCommissionsEarned,
    pendingCommissions,
    paidCommissions,
    netWispRevenue,
  };
}
