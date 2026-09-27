import type {
  ImportCounts,
  Transaction,
  TransactionKind,
  TransactionSourceBank,
} from '../../domain/transactions';

export type Bank = TransactionSourceBank;

export interface ParsedRow {
  sourceRowIndex: number;
  bookingDate: string;
  valueDate?: string;
  amountCents: number;
  currency: 'EUR';
  status: 'pending' | 'posted';
  rawDescription: string;
  sourceOperation?: string;
  sourceCategory?: string;
  externalTransactionId?: string;
  sourceAccountLabel?: string;
}

export interface ParsedImportMetadata {
  openingBalanceCents?: number;
  closingBalanceCents?: number;
  balanceDate?: string;
  periodFrom?: string;
  periodTo?: string;
  maskedIdentifier?: string;
}

export interface ParsedImport {
  bank: Bank;
  parserVersion: string;
  rows: ParsedRow[];
  warnings: string[];
  errors: string[];
  metadata: ParsedImportMetadata;
}

export type ImportPreviewAction = 'insert' | 'update' | 'duplicate' | 'review';

export interface ImportPreviewRow {
  sourceRowIndex: number;
  action: ImportPreviewAction;
  transaction: Transaction;
  matchedTransactionId?: string;
  reason?: string;
  relatedTransactions?: Transaction[];
}

export interface BalanceUpdatePreview {
  proposedBalanceCents: number;
  date: string;
  previous: { currentBalanceCents?: number; currentBalanceAt?: string };
  requiresAcceptance: boolean;
  accepted: boolean;
}

export interface ImportPreview {
  previewId: string;
  fileName: string;
  fileSha256: string;
  reprocess: boolean;
  accountId: string;
  bank: Bank;
  parserVersion: string;
  metadata: ParsedImportMetadata;
  rows: ImportPreviewRow[];
  counts: ImportCounts;
  warnings: string[];
  errors: string[];
  blockedReasons: string[];
  stateFingerprint: string;
  balanceUpdate?: BalanceUpdatePreview;
}

export interface TransactionUpdate {
  appCategoryId?: string;
  kind?: TransactionKind;
  userNote?: string;
}

export const IMPORT_REASON_LABELS_IT: Record<string, string> = {
  'external-id': 'Identificativo bancario riconosciuto',
  'exact-fingerprint': 'Movimento già presente',
  'external-id-conflict': 'Identificativo già usato con importi o dettagli diversi',
  'ambiguous-external-id': 'Identificativo bancario ambiguo: verifica il movimento',
  'pending-posted-reconciled': 'Movimento in attesa aggiornato a contabilizzato',
  'stale-pending-ignored': 'Esportazione in attesa più vecchia ignorata',
  'stale-pending-duplicate': 'Movimento in attesa già contabilizzato',
  'ambiguous-pending-posted-match': 'Possibile aggiornamento ambiguo: verifica il movimento',
  'bank-fields-updated': 'Dettagli bancari aggiornati',
  'possible-transfer': 'Possibile trasferimento tra conti da verificare',
  'possible-transfer-review': 'Possibile trasferimento: verifica prima di classificarlo',
  'transfer-matched': 'Trasferimento tra conti riconosciuto con alias',
};

export function importReasonLabelIt(reason: string): string {
  return IMPORT_REASON_LABELS_IT[reason] ?? reason;
}
