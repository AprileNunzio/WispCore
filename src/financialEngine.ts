import type { Client, Payment, BillingCycle } from './types';
import { localDateString } from './dateUtils';

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
  const a = new Date(`${dateA}T00:00:00+01:00`).getTime();
  const b = new Date(`${dateB}T00:00:00+01:00`).getTime();
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

  if (totalCount > 0 && (latePaymentsCount + currentOverdueCount) > 0) {
    const unpunctualRatio = (latePaymentsCount + currentOverdueCount) / totalCount;
    if (unpunctualRatio > 0.5) score -= 15;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const avgDaysLate = latePaymentsCount > 0 ? Number((totalDaysLate / latePaymentsCount).toFixed(1)) : 0;

  let riskClass: RiskClass = 'EXCELLENT';
  let riskLabel = 'Eccellente';
  let riskBadgeColor: 'emerald' | 'yellow' | 'amber' | 'rose' = 'emerald';

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

export function computeBadPayersList(clients: Client[], payments: Payment[]): BadPayerClientInfo[] {
  const paymentsByClient = new Map<number, Payment[]>();
  for (const p of payments) {
    if (!paymentsByClient.has(p.client_id)) {
      paymentsByClient.set(p.client_id, []);
    }
    paymentsByClient.get(p.client_id)!.push(p);
  }

  const list: BadPayerClientInfo[] = [];

  for (const client of clients) {
    const clientPayments = paymentsByClient.get(client.id) || [];
    const rel = calculateClientReliability(client, clientPayments);
    const overduePayments = clientPayments.filter(p => p.status === 'OVERDUE');

    list.push({
      ...rel,
      client,
      overduePayments,
    });
  }

  // Ordina prima per punteggio crescente (i casi peggiori in cima)
  return list.sort((a, b) => a.score - b.score);
}
