import type { Account } from '../domain/models';
import type { Transaction } from '../domain/transactions';

export interface TransferCandidate {
  transaction: Transaction;
  account: Account;
  hasAliasEvidence: boolean;
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('it-IT')
    .replace(/[’']/gu, ' ').replace(/[^a-z0-9]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function mentionsAlias(transaction: Transaction, aliases: string[]): boolean {
  const content = normalize([
    transaction.rawDescription,
    transaction.sourceOperation ?? '',
    transaction.sourceAccountLabel ?? '',
  ].join(' '));
  return aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedAlias.length >= 3 && ` ${content} `.includes(` ${normalizedAlias} `);
  });
}

export function daysBetween(left: string, right: string): number {
  const [leftYear, leftMonth, leftDay] = left.split('-').map(Number);
  const [rightYear, rightMonth, rightDay] = right.split('-').map(Number);
  return Math.abs(Date.UTC(leftYear, leftMonth - 1, leftDay) - Date.UTC(rightYear, rightMonth - 1, rightDay)) / 86_400_000;
}

export function isPotentialTransferPair(left: Transaction, right: Transaction): boolean {
  return left.accountId !== right.accountId
    && left.currency === right.currency
    && left.amountCents === -right.amountCents
    && left.amountCents !== 0
    && left.status === 'posted'
    && right.status === 'posted'
    && daysBetween(left.bookingDate, right.bookingDate) <= 2;
}

export function findTransferCandidates(
  transaction: Transaction,
  ownAccount: Account,
  transactions: Transaction[],
  accountsById: Map<string, Account>,
): TransferCandidate[] {
  return transactions.flatMap((candidate) => {
    if (candidate.transferLinkId || candidate.reviewReason || !isPotentialTransferPair(transaction, candidate)) return [];
    const candidateAccount = accountsById.get(candidate.accountId);
    if (!candidateAccount) return [];
    const hasAliasEvidence = mentionsAlias(transaction, candidateAccount.ownAccountAliases)
      && mentionsAlias(candidate, ownAccount.ownAccountAliases);
    return [{ transaction: candidate, account: candidateAccount, hasAliasEvidence }];
  });
}
