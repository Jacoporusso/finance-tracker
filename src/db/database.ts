import Dexie, { type EntityTable } from 'dexie';
import type { Account, Category } from '../domain/models';
import type { ImportBatch, ImportBatchRow, Liability, Transaction } from '../domain/transactions';
import type { NetWorthSnapshot } from '../domain/net-worth';
import type { InvestmentValuation } from '../domain/investments';

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class FinanceDatabase extends Dexie {
  settings!: EntityTable<AppSetting, 'key'>;
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  importBatchRows!: EntityTable<ImportBatchRow, 'id'>;
  liabilities!: EntityTable<Liability, 'id'>;
  netWorthSnapshots!: EntityTable<NetWorthSnapshot, 'id'>;
  investmentValuations!: EntityTable<InvestmentValuation, 'id'>;

  constructor() {
    super('finance-tracker');
    this.version(1).stores({ settings: '&key' });
    this.version(2).stores({
      settings: '&key',
      accounts: '&id, institution, type, active',
      categories: '&id, name',
    });
    this.version(3).stores({
      settings: '&key',
      accounts: '&id, institution, type, active',
      categories: '&id, name',
      transactions: '&id, accountId, bookingDate, status, kind, externalTransactionId, exactFingerprint, sourceBank',
      importBatches: '&id, fileSha256, accountId, sourceBank, status, importedAt',
      importBatchRows: '&id, importBatchId, transactionId, action',
      liabilities: '&id, asOf, updatedAt',
    });
    this.version(4).stores({
      settings: '&key', accounts: '&id, institution, type, active', categories: '&id, name',
      transactions: '&id, accountId, bookingDate, status, kind, externalTransactionId, exactFingerprint, sourceBank',
      importBatches: '&id, fileSha256, accountId, sourceBank, status, importedAt', importBatchRows: '&id, importBatchId, transactionId, action',
      liabilities: '&id, asOf, updatedAt', netWorthSnapshots: '&id, date',
    });
    this.version(5).stores({
      settings: '&key', accounts: '&id, institution, type, active', categories: '&id, name',
      transactions: '&id, accountId, bookingDate, status, kind, externalTransactionId, exactFingerprint, sourceBank',
      importBatches: '&id, fileSha256, accountId, sourceBank, status, importedAt', importBatchRows: '&id, importBatchId, transactionId, action',
      liabilities: '&id, asOf, updatedAt', netWorthSnapshots: '&id, date', investmentValuations: '&id, accountId, date',
    });
  }
}

export const db = new FinanceDatabase();
