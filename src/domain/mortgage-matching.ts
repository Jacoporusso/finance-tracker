import type { MortgageDetails, MortgageInstallment, Transaction } from './transactions';

export interface MortgageMatch { installment: MortgageInstallment; transactionId: string; }
export function mortgageProgress(plan: MortgageDetails, matches: MortgageMatch[]) {
  const planPaid = plan.installments.filter((item) => item.status === 'paid').length;
  const matchedMax = matches.reduce((max, item) => Math.max(max, item.installment.number), 0);
  const paidCount = Math.max(planPaid, matchedMax);
  const current = plan.installments.find((item) => item.number === paidCount) ?? plan.installments.at(-1);
  const next = plan.installments.find((item) => item.number > paidCount && item.status === 'due') ?? plan.installments.find((item) => item.number > paidCount);
  return { paidCount, current, next, remaining: Math.max(0, plan.installments.length - paidCount) };
}

export function matchMortgageInstallments(plan: MortgageDetails, transactions: Transaction[]): MortgageMatch[] {
  const candidates = transactions.filter((tx) => tx.status === 'posted' && tx.amountCents < 0 && tx.kind !== 'internal_transfer' && tx.kind !== 'investment_transfer');
  const used = new Set<string>();
  return plan.installments.flatMap((installment) => {
    const due = Date.parse(`${installment.dueDate}T00:00:00Z`);
    const match = candidates.find((tx) => {
      if (used.has(tx.id) || Math.abs(tx.amountCents) !== installment.installmentCents) return false;
      const date = Date.parse(`${tx.bookingDate}T00:00:00Z`);
      return Math.abs(date - due) <= 10 * 86400000;
    });
    if (!match) return [];
    used.add(match.id);
    return [{ installment, transactionId: match.id }];
  });
}
