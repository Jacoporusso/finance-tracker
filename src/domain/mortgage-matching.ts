import type { Liability, MortgageDetails, MortgageInstallment, Transaction } from './transactions';
import { todayInRome } from './dates';
import { mortgageSchema, mortgageWarnings } from './mortgage-validation';

export interface MortgageMatch { installment: MortgageInstallment; transactionId: string; }

export function matchMortgageInstallments(plan: MortgageDetails, transactions: Transaction[]): MortgageMatch[] {
  if (!plan.accountId || !plan.contractNumber || plan.parserVersion !== 2) return [];
  const contract = plan.contractNumber.split('/').at(-1)?.replace(/\D/gu, '').replace(/^0+/u, '');
  if (!contract) return [];
  const candidates = transactions.filter((tx) => {
    const identifier = /\b(?:mutuo|finanziamento)\s+(?:\d+\s*\/\s*)?(\d+)\b/iu.exec(tx.rawDescription)?.[1]?.replace(/^0+/u, '');
    return tx.accountId === plan.accountId && tx.sourceBank === 'INTESA' && identifier === contract
      && tx.status === 'posted' && tx.amountCents < 0 && tx.bookingDate <= todayInRome()
      && tx.kind !== 'internal_transfer' && tx.kind !== 'investment_transfer';
  });
  const proposed = plan.installments.map((installment) => ({ installment, candidates: candidates.filter((tx) =>
    Math.abs(tx.amountCents) === installment.installmentCents
    && Math.abs(Date.parse(tx.bookingDate + 'T00:00:00Z') - Date.parse(installment.dueDate + 'T00:00:00Z')) <= 10 * 86400000) }));
  return proposed.flatMap(({ installment, candidates: options }) => {
    if (options.length !== 1) return [];
    const transactionId = options[0].id;
    if (proposed.filter((row) => row.candidates.some((tx) => tx.id === transactionId)).length !== 1) return [];
    return [{ installment, transactionId }];
  });
}

export function mortgageProgress(plan: MortgageDetails, matches: MortgageMatch[]) {
  const paidNumbers = new Set(plan.installments.filter((row) => row.status === 'paid').map((row) => row.number));
  for (const match of matches) paidNumbers.add(match.installment.number);
  const ordered = [...plan.installments].sort((a, b) => a.number - b.number);
  const paid = ordered.filter((row) => paidNumbers.has(row.number));
  return { paidNumbers, paidCount: paid.length, current: paid.at(-1), next: ordered.find((row) => !paidNumbers.has(row.number)), remaining: ordered.length - paid.length };
}

/** Manual capital/date are the anchor: imports before that date never subtract twice. */
export function liabilityProgress(liability: Liability, transactions: Transaction[]) {
  const validation = mortgageSchema.safeParse(liability.mortgage);
  const plan = validation.success ? validation.data : undefined;
  const matches = plan ? matchMortgageInstallments(plan, transactions) : [];
  const progress = plan ? mortgageProgress(plan, matches) : undefined;
  let residualCents = liability.amountCents;
  let asOf = liability.asOf;
  const warnings: string[] = plan ? mortgageWarnings(plan) : liability.mortgage ? ['Piano non valido: ricarica il file Excel. Manteniamo il capitale di riferimento.'] : [];
  if (plan && plan.parserVersion !== 2) warnings.push('Ricarica una volta il piano Excel con il lettore aggiornato per attivare gli aggiornamenti automatici.');
  if (plan && (!plan.accountId || !plan.contractNumber)) warnings.push('Configura conto di addebito e numero finanziamento per attivare gli aggiornamenti automatici.');
  const additions = matches.filter(({ installment }) => installment.status !== 'paid' && installment.dueDate > liability.asOf).sort((a, b) => a.installment.number - b.installment.number);
  for (const { installment } of additions) {
    if (!Number.isSafeInteger(installment.principalCents) || installment.principalCents < 0
      || Math.abs(installment.principalCents + installment.interestCents + (installment.otherCents ?? 0) - installment.installmentCents) > 1
      || installment.principalCents > residualCents) {
      warnings.push('Rata ' + installment.number + ': quote incoerenti, capitale non aggiornato.');
      continue;
    }
    residualCents -= installment.principalCents;
    asOf = installment.dueDate > asOf ? installment.dueDate : asOf;
  }
  const overdue = plan?.installments.filter((row) => row.dueDate < todayInRome() && !progress?.paidNumbers.has(row.number)) ?? [];
  if (overdue.length) warnings.push(overdue.length + ' rate scadute senza conferma di pagamento. Non vengono considerate pagate automaticamente.');
  return { ...progress, matches, residualCents, asOf, warnings };
}
