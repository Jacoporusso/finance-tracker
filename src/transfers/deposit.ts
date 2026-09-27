import { db } from '../db/database';
import type { Transaction } from '../domain/transactions';

function normalized(value: string | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('it-IT').replace(/\s+/gu, ' ').trim();
}

/** Strong ING bank wording: GIROCONTO is an explicit bank operation, while a generic bonifico is not. */
export function isIngDepositTransfer(transaction: Pick<Transaction, 'sourceBank' | 'sourceOperation' | 'rawDescription'>): boolean {
  if (transaction.sourceBank !== 'ING') return false;
  const operation = normalized(transaction.sourceOperation);
  const description = normalized(transaction.rawDescription);
  return operation === 'giroconto'
    || /\bgiro\s*conto\b/iu.test(description);
}

/**
 * Finds older automatic transfer classifications that may have relied on the
 * former broad deposit wording. These rows are only surfaced for user review;
 * this query never changes them.
 */
export async function getLegacyDepositTransferReviewCandidates(): Promise<Transaction[]> {
  const rows = await db.transactions.toArray();
  return rows.filter((transaction) => {
    if (transaction.sourceBank !== 'ING'
      || transaction.status === 'cancelled'
      || transaction.kind !== 'internal_transfer'
      || transaction.kindSource === 'manual'
      || transaction.transferLinkId
      || isIngDepositTransfer(transaction)) return false;

    const description = normalized(transaction.rawDescription);
    return /\bconto\s+arancio\b/iu.test(description)
      || /\bdeposito\b/iu.test(description);
  });
}

export function hasUntrackedIngDeposit(accounts: Array<{ active: boolean; institution: string; type: string }>, transactions: Transaction[]): boolean {
  const hasTransfer = transactions.some((transaction) => transaction.status !== 'cancelled' && isIngDepositTransfer(transaction));
  const hasSavings = accounts.some((account) => account.active && account.institution === 'ING' && account.type === 'savings');
  return hasTransfer && !hasSavings;
}

export async function getDepositTransferCandidates(): Promise<Transaction[]> {
  const rows = await db.transactions.toArray();
  return rows.filter((transaction) => isIngDepositTransfer(transaction)
    && transaction.status !== 'cancelled'
    && transaction.kind !== 'internal_transfer'
    && transaction.kindSource !== 'manual'
    && !transaction.transferLinkId);
}

/** Explicit user-confirmed repair for already imported ING giroconti. */
export async function confirmDepositTransfers(ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  await db.transaction('rw', db.transactions, async () => {
    for (const id of uniqueIds) {
      const transaction = await db.transactions.get(id);
      if (!transaction || !isIngDepositTransfer(transaction) || transaction.kindSource === 'manual') continue;
      if (transaction.kind === 'internal_transfer') continue;
      await db.transactions.put({
        ...transaction,
        kind: 'internal_transfer',
        kindSource: 'automatic',
        reviewReason: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}
