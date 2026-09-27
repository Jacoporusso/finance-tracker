export type TransactionStatus = 'pending' | 'posted' | 'cancelled';

export type TransactionKind =
  | 'income'
  | 'expense'
  | 'internal_transfer'
  | 'investment_transfer'
  | 'fee'
  | 'interest'
  | 'other';

export type TransactionSourceBank = 'ING' | 'INTESA';
export type CategorySource = 'source' | 'manual' | 'uncategorized';

export interface Transaction {
  id: string;
  accountId: string;
  amountCents: number;
  bookingDate: string;
  valueDate?: string;
  currency: 'EUR';
  status: TransactionStatus;
  kind: TransactionKind;
  rawDescription: string;
  sourceOperation?: string;
  sourceCategory?: string;
  sourceAccountLabel?: string;
  externalTransactionId?: string;
  exactFingerprint: string;
  fuzzyFingerprint: string;
  appCategoryId?: string;
  categorySource: CategorySource;
  userNote?: string;
  kindSource?: 'manual' | 'automatic';
  transferLinkId?: string;
  reviewReason?: string;
  sourceBank: TransactionSourceBank;
  firstSeenImportBatchId: string;
  lastSeenImportBatchId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCounts {
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  reviewCount: number;
  pendingReconciledCount: number;
  transferMatchedCount: number;
}

export interface AccountBalanceSnapshot {
  currentBalanceCents?: number;
  currentBalanceAt?: string;
  updatedAt?: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileSha256: string;
  accountId: string;
  sourceBank: TransactionSourceBank;
  status: 'committed' | 'rolled_back';
  importedAt: string;
  counts: ImportCounts;
  previousAccountBalance: AccountBalanceSnapshot;
  committedAccountBalance: AccountBalanceSnapshot;
}

export type ImportBatchRowAction = 'inserted' | 'updated' | 'reconciled' | 'transfer-updated';

/** Journal entry for one unique transaction changed by a committed import. */
export interface ImportBatchRow {
  id: string;
  importBatchId: string;
  transactionId: string;
  action: ImportBatchRowAction;
  before?: Transaction;
  after: Transaction;
}

export interface Liability {
  id: string;
  name: string;
  amountCents: number;
  asOf: string;
  updatedAt: string;
}
