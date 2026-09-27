export type AccountInstitution = 'ING' | 'INTESA' | 'TRADE_REPUBLIC' | 'MANUAL';

export type AccountType = 'checking' | 'savings' | 'broker' | 'cash' | 'other';

export interface Account {
  id: string;
  institution: AccountInstitution;
  name: string;
  type: AccountType;
  currency: 'EUR';
  currentBalanceCents?: number;
  currentBalanceAt?: string;
  maskedIdentifier?: string;
  ownAccountAliases: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AccountInput = Pick<Account, 'name' | 'institution' | 'type' | 'currency' | 'ownAccountAliases'> &
  Partial<Pick<Account, 'maskedIdentifier' | 'currentBalanceCents' | 'currentBalanceAt'>>;

export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoryInput = Pick<Category, 'name'>;

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  currency: 'EUR';
  timeZone: 'Europe/Rome';
  locale: 'it-IT';
}
