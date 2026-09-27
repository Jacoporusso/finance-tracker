import type { Account } from './models';
import type { Liability, Transaction } from './transactions';
import { accountBalance } from './balances';
import { liabilityProgress } from './mortgage-matching';

export interface NetWorthSnapshot { id: string; date: string; cashCents: number; investmentsCents: number; liabilitiesCents: number; netWorthCents: number; source: 'manual' | 'import' | 'derived'; completeness: 'complete' | 'partial'; createdAt: string; }

export function calculateNetWorth(accounts: Account[], liabilities: Liability[], transactions: Transaction[], date: string) {
  const active = accounts.filter((account) => account.active);
  const balances = active.map((account) => accountBalance(account, transactions, date));
  const assets = balances.reduce((sum, balance) => sum + (balance.amountCents ?? 0), 0);
  const cashCents = active.filter((account) => ['checking', 'savings', 'cash'].includes(account.type)).reduce((sum, account) => sum + (accountBalance(account, transactions, date).amountCents ?? 0), 0);
  const investmentsCents = active.filter((account) => account.type === 'broker').reduce((sum, account) => sum + (accountBalance(account, transactions, date).amountCents ?? 0), 0);
  const liabilitiesCents = liabilities.reduce((sum, liability) => sum + liabilityProgress(liability, transactions).residualCents, 0);
  return { cashCents, investmentsCents, liabilitiesCents, netWorthCents: assets - liabilitiesCents, completeness: balances.every((balance) => !balance.missing) ? 'complete' as const : 'partial' as const };
}
