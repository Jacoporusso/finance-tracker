import Dexie, { type EntityTable } from 'dexie';

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class FinanceDatabase extends Dexie {
  settings!: EntityTable<AppSetting, 'key'>;

  constructor() {
    super('finance-tracker');
    this.version(1).stores({ settings: '&key' });
  }
}

export const db = new FinanceDatabase();
