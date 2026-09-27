import type { Account } from './models';
import type { Transaction } from './transactions';
import { todayInRome } from './dates';

export interface AccountBalanceView {
  amountCents?: number;
  asOf?: string;
  referenceCents?: number;
  referenceDate?: string;
  mode: 'snapshot' | 'derived';
  movementCount: number;
  pendingCount: number;
  stale: boolean;
  missing: boolean;
  warnings: string[];
}

/** Derives only from a user-confirmed dated anchor; never invents a balance. */
export function accountBalance(account: Account, transactions: Transaction[], today = todayInRome()): AccountBalanceView {
  const referenceCents = account.currentBalanceCents;
  const referenceDate = account.currentBalanceAt;
  const mode = account.balanceMode ?? 'snapshot';
  const stale = !referenceDate || daysBetween(referenceDate, today) > 30;
  if (referenceCents === undefined || !referenceDate) return { mode, movementCount: 0, pendingCount: 0, stale, missing: true, warnings: ['Inserisci un saldo di riferimento con la relativa data.'] };
  if (mode !== 'derived' || account.type === 'broker') return { amountCents: referenceCents, asOf: referenceDate, referenceCents, referenceDate, mode: 'snapshot', movementCount: 0, pendingCount: 0, stale, missing: false, warnings: stale ? ['Il saldo registrato ha più di 30 giorni.'] : [] };
  const related = transactions.filter((tx) => tx.accountId === account.id && tx.bookingDate > referenceDate && tx.bookingDate <= today);
  const posted = related.filter((tx) => tx.status === 'posted');
  const pendingCount = related.filter((tx) => tx.status === 'pending').length;
  const delta = posted.reduce((sum, tx) => sum + tx.amountCents, 0);
  const amountCents = referenceCents + delta;
  if (!Number.isSafeInteger(amountCents)) return { mode: 'derived', referenceCents, referenceDate, stale: true, missing: true, movementCount: posted.length, pendingCount, warnings: ['Il saldo calcolato supera l’intervallo numerico sicuro.'] };
  return { amountCents, asOf: posted.at(-1)?.bookingDate ?? referenceDate, referenceCents, referenceDate, mode: 'derived', movementCount: posted.length, pendingCount, stale, missing: false, warnings: [...(stale ? ['Il riferimento ha più di 30 giorni: importa l’intero intervallo per mantenere il calcolo attendibile.'] : []), ...(pendingCount ? [`${pendingCount} movimenti in attesa non sono inclusi nel saldo.`] : [])] };
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));
}
