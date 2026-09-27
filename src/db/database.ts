import Dexie, { type EntityTable } from 'dexie';
import type { Account, Category } from '../domain/models';
import type { ImportBatch, ImportBatchRow, Liability, Transaction } from '../domain/transactions';

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
  }
}

export const db = new FinanceDatabase();
