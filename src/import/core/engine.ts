import Dexie from 'dexie';
import { z } from 'zod';
import { db } from '../../db/database';
import type { Account } from '../../domain/models';
import type {
  AccountBalanceSnapshot,
  ImportBatch,
  ImportBatchRow,
  ImportBatchRowAction,
  ImportCounts,
  Transaction,
  TransactionKind,
} from '../../domain/transactions';
import type {
  Bank,
  ImportPreview,
  ImportPreviewRow,
  ParsedImport,
  ParsedRow,
  TransactionUpdate,
} from './types';
import { findTransferCandidates } from '../../transfers/matching';
import { isIngDepositTransfer } from '../../transfers/deposit';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((date) => {
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= daysInMonth;
}, 'Expected a valid YYYY-MM-DD date');

const parsedRowSchema = z.object({
  sourceRowIndex: z.number().int().nonnegative(),
  bookingDate: dateSchema,
  valueDate: dateSchema.optional(),
  amountCents: z.number().int().safe(),
  currency: z.literal('EUR'),
  status: z.enum(['pending', 'posted']),
  rawDescription: z.string(),
  sourceOperation: z.string().optional(),
  sourceCategory: z.string().optional(),
  externalTransactionId: z.string().trim().min(1).max(200).optional(),
  sourceAccountLabel: z.string().optional(),
}).strict();

const parsedImportSchema = z.object({
  bank: z.enum(['ING', 'INTESA']),
  parserVersion: z.string().trim().min(1),
  rows: z.array(parsedRowSchema),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  metadata: z.object({
    openingBalanceCents: z.number().int().safe().optional(),
    closingBalanceCents: z.number().int().safe().optional(),
    balanceDate: dateSchema.optional(),
    periodFrom: dateSchema.optional(),
    periodTo: dateSchema.optional(),
    maskedIdentifier: z.string().trim().optional(),
  }).strict(),
}).strict();

const updateSchema = z.object({
  appCategoryId: z.string().trim().min(1).optional(),
  kind: z.enum(['income', 'expense', 'internal_transfer', 'investment_transfer', 'fee', 'interest', 'other']).optional(),
  userNote: z.string().max(2000).optional(),
}).strict();

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const isFullIban = (value: string) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(value.replace(/[\s-]/gu, '').toUpperCase());

export async function sha256(value: ArrayBuffer | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('it-IT')
    .replace(/[\u2019']/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function datesWithin(left: string, right: string, days: number): boolean {
  const [leftYear, leftMonth, leftDay] = left.split('-').map(Number);
  const [rightYear, rightMonth, rightDay] = right.split('-').map(Number);
  return Math.abs(Date.UTC(leftYear, leftMonth - 1, leftDay) - Date.UTC(rightYear, rightMonth - 1, rightDay)) <= days * 86_400_000;
}

function merchantEvidence(left: Pick<ParsedRow, 'rawDescription' | 'sourceOperation'>, right: Transaction): boolean {
  const leftText = normalizeText(left.rawDescription);
  const rightText = normalizeText(right.rawDescription);
  const stopWords = new Set([
    'del', 'della', 'dello', 'per', 'con', 'bonifico', 'pagamento', 'operazione', 'pos',
    'carta', 'commissione', 'commissioni', 'disposizione', 'contabilizzato', 'contabilizzata',
    'non', 'in', 'data', 'valuta', 'pag', 'movimento', 'transazione', 'online', 'acquisto',
  ]);
  const words = (value: string) => new Set(value.split(/[^a-z0-9]+/u).filter((word) => word.length >= 3 && !stopWords.has(word) && !/^\d+$/u.test(word)));
  const leftWords = words(leftText);
  const rightWords = words(rightText);
  const shared = [...leftWords].filter((word) => rightWords.has(word));
  const unionSize = new Set([...leftWords, ...rightWords]).size;
  return (leftWords.size === 1 && rightWords.size === 1 && shared.some((word) => word.length >= 5))
    || (shared.length >= 2
      && shared.some((word) => word.length >= 5)
      && unionSize > 0
      && shared.length / unionSize >= 0.65);
}

async function rowFingerprints(bank: Bank, accountId: string, row: ParsedRow): Promise<{ exact: string; fuzzy: string }> {
  const operation = normalizeText(row.sourceOperation ?? '');
  const description = normalizeText(row.rawDescription);
  const exact = await sha256(canonical([
    bank,
    accountId,
    row.bookingDate,
    row.valueDate ?? '',
    row.amountCents,
    row.currency,
    operation,
    description,
  ]));
  const fuzzy = await sha256(canonical([bank, accountId, row.amountCents, row.currency, operation || description]));
  return { exact, fuzzy };
}

function createDraft(
  row: ParsedRow,
  bank: Bank,
  accountId: string,
  fingerprints: { exact: string; fuzzy: string },
  batchId: string,
  sourceCategoryId?: string,
  reviewReason?: string,
): Transaction {
  const timestamp = nowIso();
  return {
    id: uuid(),
    accountId,
    amountCents: row.amountCents,
    bookingDate: row.bookingDate,
    ...(row.valueDate ? { valueDate: row.valueDate } : {}),
    currency: 'EUR',
    status: row.status,
    kind: bank === 'ING' && isIngDepositTransfer({ sourceBank: bank, sourceOperation: row.sourceOperation, rawDescription: row.rawDescription })
      ? 'internal_transfer'
      : row.amountCents < 0 ? 'expense' : 'income',
    rawDescription: row.rawDescription,
    ...(row.sourceOperation ? { sourceOperation: row.sourceOperation } : {}),
    ...(row.sourceCategory ? { sourceCategory: row.sourceCategory } : {}),
    ...(row.sourceAccountLabel ? { sourceAccountLabel: row.sourceAccountLabel } : {}),
    ...(row.externalTransactionId ? { externalTransactionId: row.externalTransactionId } : {}),
    exactFingerprint: fingerprints.exact,
    fuzzyFingerprint: fingerprints.fuzzy,
    ...(sourceCategoryId ? { appCategoryId: sourceCategoryId, categorySource: 'source' as const } : { categorySource: 'uncategorized' as const }),
    kindSource: 'automatic',
    ...(reviewReason ? { reviewReason } : {}),
    sourceBank: bank,
    firstSeenImportBatchId: batchId,
    lastSeenImportBatchId: batchId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mergeBankFields(
  existing: Transaction,
  row: ParsedRow,
  fingerprints: { exact: string; fuzzy: string },
  sourceCategoryId?: string,
): Transaction {
  return {
    ...existing,
    bookingDate: row.bookingDate,
    ...(row.valueDate ? { valueDate: row.valueDate } : { valueDate: undefined }),
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    rawDescription: row.rawDescription,
    ...(row.sourceOperation === undefined ? { sourceOperation: undefined } : { sourceOperation: row.sourceOperation }),
    ...(row.sourceCategory === undefined ? { sourceCategory: undefined } : { sourceCategory: row.sourceCategory }),
    ...(row.externalTransactionId === undefined ? { externalTransactionId: undefined } : { externalTransactionId: row.externalTransactionId }),
    ...(row.sourceAccountLabel === undefined ? { sourceAccountLabel: undefined } : { sourceAccountLabel: row.sourceAccountLabel }),
    exactFingerprint: fingerprints.exact,
    fuzzyFingerprint: fingerprints.fuzzy,
    ...(existing.categorySource === 'manual' ? {} : sourceCategoryId
      ? { appCategoryId: sourceCategoryId, categorySource: 'source' as const }
      : { appCategoryId: undefined, categorySource: 'uncategorized' as const }),
    ...(existing.kindSource === 'manual' || existing.transferLinkId
      ? {}
      : { kind: row.sourceOperation && existing.sourceBank === 'ING' && isIngDepositTransfer({ sourceBank: existing.sourceBank, sourceOperation: row.sourceOperation, rawDescription: row.rawDescription })
        ? 'internal_transfer' as const
        : row.amountCents < 0 ? 'expense' as const : 'income' as const }),
  };
}

function equalBankFields(left: Transaction, right: Transaction): boolean {
  return left.bookingDate === right.bookingDate
    && left.valueDate === right.valueDate
    && left.amountCents === right.amountCents
    && left.currency === right.currency
    && left.status === right.status
    && left.rawDescription === right.rawDescription
    && left.sourceOperation === right.sourceOperation
    && left.sourceCategory === right.sourceCategory
    && left.externalTransactionId === right.externalTransactionId
    && left.sourceAccountLabel === right.sourceAccountLabel
    && left.exactFingerprint === right.exactFingerprint
    && left.fuzzyFingerprint === right.fuzzyFingerprint;
}

function countsFor(rows: ImportPreviewRow[]): ImportCounts {
  return {
    insertedCount: rows.filter((row) => row.action === 'insert').length,
    updatedCount: rows.filter((row) => row.action === 'update').length,
    duplicateCount: rows.filter((row) => row.action === 'duplicate').length,
    reviewCount: rows.filter((row) => row.action === 'review' || row.transaction.reviewReason !== undefined).length,
    pendingReconciledCount: rows.filter((row) => row.reason === 'pending-posted-reconciled').length,
    transferMatchedCount: rows.filter((row) => row.transaction.transferLinkId !== undefined && row.reason === 'transfer-matched').length,
  };
}

function accountBalanceSnapshot(account: Account): AccountBalanceSnapshot {
  return {
    ...(account.currentBalanceCents === undefined ? {} : { currentBalanceCents: account.currentBalanceCents }),
    ...(account.currentBalanceAt === undefined ? {} : { currentBalanceAt: account.currentBalanceAt }),
    updatedAt: account.updatedAt,
  };
}

async function fingerprintState(
  account: Account,
  accounts: Account[],
  transactions: Transaction[],
  categories: Array<{ id: string; name: string; updatedAt: string }>,
): Promise<string> {
  const projection = {
    account,
    accounts: [...accounts].sort((left, right) => left.id.localeCompare(right.id)),
    transactions: [...transactions].sort((left, right) => left.id.localeCompare(right.id)),
    categories: [...categories].sort((left, right) => left.id.localeCompare(right.id)),
  };
  return sha256(canonical(projection));
}

function validateInput(parsed: ParsedImport): ParsedImport {
  return parsedImportSchema.parse(parsed) as ParsedImport;
}

export async function prepareImport(
  parsedInput: ParsedImport,
  fileName: string,
  fileSha256: string,
  accountId: string,
  reprocess = false,
): Promise<ImportPreview> {
  const parsed = validateInput(parsedInput);
  const previewId = uuid();
  const [account, accounts, allTransactions, categories, committedBatches] = await Promise.all([
    db.accounts.get(accountId),
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.importBatches.where('fileSha256').equals(fileSha256).filter((batch) => batch.status === 'committed').toArray(),
  ]);
  const matchingScopeBatch = committedBatches.find((batch) => batch.accountId === accountId && batch.sourceBank === parsed.bank);
  const priorHashOutsideScope = committedBatches.some((batch) => batch.accountId !== accountId || batch.sourceBank !== parsed.bank);
  const recoveringExistingFile = Boolean(reprocess && matchingScopeBatch);
  const blockedReasons: string[] = [];
  const warnings = [...parsed.warnings];
  if (!account) blockedReasons.push('Conto selezionato non trovato');
  else {
    if (!account.active) blockedReasons.push('Il conto selezionato è disattivato');
    if (account.institution !== parsed.bank) blockedReasons.push('Il conto selezionato non corrisponde alla banca rilevata');
  }
  if (parsed.errors.length) blockedReasons.push('Il parser ha segnalato errori');
  if (!parsed.rows.length) blockedReasons.push('Non sono stati letti movimenti');
  if (!/^[a-f\d]{64}$/iu.test(fileSha256)) blockedReasons.push('Impronta SHA-256 del file non valida');
  if (matchingScopeBatch && !reprocess) blockedReasons.push('Questo file è già stato importato');
  if (priorHashOutsideScope) blockedReasons.push('Questo file è già stato importato per un conto o una banca diversi');
  if (reprocess && matchingScopeBatch) {
    warnings.push('Rianalisi esplicita attiva: i movimenti verranno deduplicati e riconciliati con i dati esistenti.');
  }
  if (parsed.metadata.maskedIdentifier && isFullIban(parsed.metadata.maskedIdentifier)) {
    blockedReasons.push('I metadati del parser contengono un IBAN completo');
  }
  if ((parsed.metadata.closingBalanceCents !== undefined) !== (parsed.metadata.balanceDate !== undefined)) {
    warnings.push('Saldo finale ignorato: servono sia l’importo sia la data');
  }

  const indexedTransactions = account
    ? allTransactions.filter((transaction) => transaction.accountId === account.id && transaction.sourceBank === parsed.bank)
    : [];
  const sourceCategoryIds = new Map(categories.map((category) => [normalizeText(category.name), category.id]));
  const claimed = new Set<string>();
  const fingerprints = await Promise.all(parsed.rows.map((row) => rowFingerprints(parsed.bank, accountId, row)));
  const matchedExisting: Array<Transaction | undefined> = new Array(parsed.rows.length);
  const matchReasons: Array<string | undefined> = new Array(parsed.rows.length);
  const reviewReasons: Array<string | undefined> = new Array(parsed.rows.length);
  const externalIssues: Array<string | undefined> = new Array(parsed.rows.length);

  // 1. External IDs have priority. Repeated rows still consume separate existing occurrences.
  parsed.rows.forEach((row, index) => {
    if (!row.externalTransactionId) return;
    const sameId = indexedTransactions.filter((transaction) =>
      transaction.externalTransactionId === row.externalTransactionId,
    );
    if (!sameId.length) return;
    const available = sameId.filter((transaction) => !claimed.has(transaction.id));
    const exactCandidates = available.filter((transaction) => transaction.exactFingerprint === fingerprints[index].exact);
    const compatible = available.filter((transaction) => {
      if (transaction.amountCents !== row.amountCents || transaction.currency !== row.currency) return false;
      const incomingOperation = normalizeText(row.sourceOperation ?? '');
      const storedOperation = normalizeText(transaction.sourceOperation ?? '');
      return !incomingOperation || !storedOperation || incomingOperation === storedOperation;
    });
    const candidates = exactCandidates.length === 1 ? exactCandidates : compatible;
    if (!available.length || !candidates.length) {
      externalIssues[index] = 'external-id-conflict';
      return;
    }
    if (exactCandidates.length > 0 || candidates.length === 1) {
      matchedExisting[index] = candidates[0];
      claimed.add(candidates[0].id);
      matchReasons[index] = 'external-id';
    } else {
      externalIssues[index] = 'ambiguous-external-id';
    }
  });

  // 2. Exact fingerprints are matched as an occurrence-aware multiset.
  parsed.rows.forEach((_, index) => {
    if (matchedExisting[index]) return;
    const candidates = indexedTransactions.filter((transaction) =>
      !claimed.has(transaction.id) && transaction.exactFingerprint === fingerprints[index].exact,
    );
    if (candidates.length) {
      const existing = candidates[0];
      matchedExisting[index] = existing;
      claimed.add(existing.id);
      matchReasons[index] = 'exact-fingerprint';
    }
  });

  parsed.rows.forEach((_, index) => {
    if (!matchedExisting[index] && externalIssues[index]) reviewReasons[index] = externalIssues[index];
  });

  // 3. Pending and posted rows reconcile only with one uniquely evidenced inverse-status match.
  const pendingCandidates = parsed.rows.map((row, index) => {
    if (matchedExisting[index] || reviewReasons[index]) return [];
    const oppositeStatus = row.status === 'posted' ? 'pending' : 'posted';
    return indexedTransactions.filter((transaction) =>
      !claimed.has(transaction.id)
      && transaction.status === oppositeStatus
      && transaction.amountCents === row.amountCents
      && transaction.currency === row.currency
      && datesWithin(transaction.bookingDate, row.bookingDate, 4)
      && merchantEvidence(row, transaction),
    );
  });
  const pendingClaimCounts = new Map<string, number>();
  pendingCandidates.forEach((candidates) => candidates.forEach((candidate) => {
    pendingClaimCounts.set(candidate.id, (pendingClaimCounts.get(candidate.id) ?? 0) + 1);
  }));
  pendingCandidates.forEach((candidates, index) => {
    if (!candidates.length) return;
    if (candidates.length === 1 && pendingClaimCounts.get(candidates[0].id) === 1) {
      matchedExisting[index] = candidates[0];
      claimed.add(candidates[0].id);
      matchReasons[index] = parsed.rows[index].status === 'posted'
        ? 'pending-posted-reconciled'
        : 'stale-pending-duplicate';
    } else {
      reviewReasons[index] = 'ambiguous-pending-posted-match';
    }
  });

  const rows: ImportPreviewRow[] = parsed.rows.map((row, index) => {
    const existing = matchedExisting[index];
    const reason = reviewReasons[index] ?? matchReasons[index];
    if (existing) {
      if (row.status === 'pending' && existing.status === 'posted') {
        return {
          sourceRowIndex: row.sourceRowIndex,
          action: 'duplicate',
          transaction: existing,
          matchedTransactionId: existing.id,
          reason: 'stale-pending-ignored',
        };
      }
      const sourceCategoryId = row.sourceCategory ? sourceCategoryIds.get(normalizeText(row.sourceCategory)) : undefined;
      const proposed = mergeBankFields(existing, row, fingerprints[index], sourceCategoryId);
      const changed = !equalBankFields(existing, proposed);
      const reconciled = reason === 'pending-posted-reconciled' || (existing.status === 'pending' && row.status === 'posted');
      return {
        sourceRowIndex: row.sourceRowIndex,
        action: changed ? 'update' : 'duplicate',
        transaction: proposed,
        matchedTransactionId: existing.id,
        ...(reconciled ? { reason: 'pending-posted-reconciled' } : changed ? { reason: 'bank-fields-updated' } : {}),
      };
    }

    const sourceCategoryId = row.sourceCategory ? sourceCategoryIds.get(normalizeText(row.sourceCategory)) : undefined;
    const transaction = createDraft(row, parsed.bank, accountId, fingerprints[index], previewId, sourceCategoryId, reviewReasons[index]);
    return {
      sourceRowIndex: row.sourceRowIndex,
      action: reviewReasons[index] ? 'review' : 'insert',
      transaction,
      ...(reviewReasons[index] ? { reason: reviewReasons[index] } : {}),
    };
  });

  /*
   * The previous pending-to-posted algorithm was intentionally replaced above with
   * a bidirectional unique candidate pass so an older pending export cannot regress
   * a row that has already been reconciled to posted.
   */

  if (account) {
    // Only a unique, reciprocal alias match is confirmed automatically. Same amount/date alone stays in review.
    const accountsById = new Map(accounts.map((candidate) => [candidate.id, candidate]));
    const claimedTransferIds = new Set<string>();
    const candidatesByRow = rows.map((row) => {
      const transaction = row.transaction;
      if (transaction.transferLinkId || transaction.kindSource === 'manual'
        || (transaction.reviewReason && transaction.reviewReason !== 'possible-transfer')) return [];
      return findTransferCandidates(transaction, account, allTransactions, accountsById);
    });
    const candidateUseCounts = new Map<string, number>();
    candidatesByRow.forEach((candidates) => candidates.forEach((candidate) => {
      candidateUseCounts.set(candidate.transaction.id, (candidateUseCounts.get(candidate.transaction.id) ?? 0) + 1);
    }));

    rows.forEach((row, rowIndex) => {
      const transaction = row.transaction;
      if (transaction.transferLinkId || transaction.kindSource === 'manual'
        || (transaction.reviewReason && transaction.reviewReason !== 'possible-transfer')) return;
      const candidates = candidatesByRow[rowIndex];
      if (!candidates.length) return;
      const candidate = candidates[0];
      const uniqueForBothRows = candidateUseCounts.get(candidate.transaction.id) === 1 && !claimedTransferIds.has(candidate.transaction.id);
      if (candidates.length === 1 && uniqueForBothRows && candidate.hasAliasEvidence && candidate.transaction.kindSource !== 'manual') {
        const transferLinkId = uuid();
        row.transaction = {
          ...transaction,
          kind: 'internal_transfer',
          kindSource: 'automatic',
          transferLinkId,
        };
        delete row.transaction.reviewReason;
        row.relatedTransactions = [{
          ...candidate.transaction,
          kind: 'internal_transfer',
          kindSource: 'automatic',
          transferLinkId,
        }];
        if (row.action === 'duplicate') row.action = 'update';
        row.reason = 'transfer-matched';
        claimedTransferIds.add(candidate.transaction.id);
      } else {
        row.transaction = { ...transaction, reviewReason: 'possible-transfer' };
        if (row.action === 'insert') row.action = 'review';
        else if (row.action === 'duplicate') row.action = 'update';
        row.reason = 'possible-transfer-review';
      }
    });
  }

  let balanceUpdate: ImportPreview['balanceUpdate'];
  if (parsed.bank === 'ING' && parsed.metadata.closingBalanceCents !== undefined && parsed.metadata.balanceDate) {
    if (!account) {
      warnings.push('Saldo finale non applicato perché il conto non è disponibile');
    } else if (account.currentBalanceAt && parsed.metadata.balanceDate < account.currentBalanceAt) {
      warnings.push('Saldo finale precedente a quello salvato: non verrà applicato');
    } else {
      const hasExistingBalance = account.currentBalanceCents !== undefined || account.currentBalanceAt !== undefined;
      balanceUpdate = {
        proposedBalanceCents: parsed.metadata.closingBalanceCents,
        date: parsed.metadata.balanceDate,
        previous: {
          ...(account.currentBalanceCents === undefined ? {} : { currentBalanceCents: account.currentBalanceCents }),
          ...(account.currentBalanceAt === undefined ? {} : { currentBalanceAt: account.currentBalanceAt }),
        },
        requiresAcceptance: hasExistingBalance,
        accepted: !recoveringExistingFile && !hasExistingBalance,
      };
    }
  }

  if (!parsed.rows.length) warnings.push('Nessun movimento disponibile per l’anteprima');
  const stateFingerprint = account
    ? await fingerprintState(account, accounts, allTransactions, categories)
    : '';
  return {
    previewId,
    fileName,
    fileSha256,
    reprocess,
    accountId,
    bank: parsed.bank,
    parserVersion: parsed.parserVersion,
    metadata: parsed.metadata,
    rows,
    counts: countsFor(rows),
    warnings,
    errors: [...parsed.errors],
    blockedReasons,
    stateFingerprint,
    ...(balanceUpdate ? { balanceUpdate } : {}),
  };
}

function sameBalanceSnapshot(account: Account, snapshot: AccountBalanceSnapshot): boolean {
  return account.currentBalanceCents === snapshot.currentBalanceCents
    && account.currentBalanceAt === snapshot.currentBalanceAt
    && account.updatedAt === snapshot.updatedAt;
}

function transactionWithBatch(transaction: Transaction, batchId: string, timestamp: string, firstSeen?: string): Transaction {
  return {
    ...transaction,
    firstSeenImportBatchId: firstSeen ?? batchId,
    lastSeenImportBatchId: batchId,
    createdAt: transaction.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export async function commitImport(preview: ImportPreview, reprocess = false): Promise<string> {
  if (preview.reprocess !== reprocess) throw new Error('L’opzione di rianalisi è cambiata dopo l’anteprima. Analizza di nuovo il file.');
  if (preview.blockedReasons.length) throw new Error(`Importazione bloccata: ${preview.blockedReasons.join('; ')}`);
  if (preview.errors.length) throw new Error('Non è possibile importare un file con errori di parsing');

  const batchId = preview.previewId;
  await db.transaction('rw', db.accounts, db.categories, db.transactions, db.importBatches, db.importBatchRows, async () => {
    const account = await db.accounts.get(preview.accountId);
    if (!account) throw new Error('Il conto selezionato non esiste più');
    if (!account.active) throw new Error('Il conto selezionato è disattivato');
    if (account.institution !== preview.bank) throw new Error('Il conto non corrisponde più alla banca rilevata');

    const priorBatches = await db.importBatches.where('fileSha256').equals(preview.fileSha256)
      .filter((batch) => batch.status === 'committed').toArray();
    const sameScopePriorBatch = priorBatches.some((batch) => batch.accountId === preview.accountId && batch.sourceBank === preview.bank);
    const priorHashOutsideScope = priorBatches.some((batch) => batch.accountId !== preview.accountId || batch.sourceBank !== preview.bank);
    if (priorHashOutsideScope) throw new Error('Questo file è già stato importato per un conto o una banca diversi');
    if (sameScopePriorBatch && !reprocess) throw new Error('Questo file è già stato importato');

    const previousBatches = await db.importBatches.toArray();
    const latestImportedAt = previousBatches.reduce((latest, batch) => Math.max(latest, Date.parse(batch.importedAt)), 0);
    const timestamp = new Date(Math.max(Date.now(), latestImportedAt + 1)).toISOString();

    const [accounts, transactions, categories] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.categories.toArray()]);
    const currentFingerprint = await Dexie.waitFor(fingerprintState(account, accounts, transactions, categories));
    if (currentFingerprint !== preview.stateFingerprint) throw new Error('I dati sono cambiati dopo l’anteprima. Analizza di nuovo il file.');

    const beforeBalance = accountBalanceSnapshot(account);
    if (preview.balanceUpdate && preview.balanceUpdate.accepted) {
      if (preview.bank !== 'ING') throw new Error('Solo un import ING può aggiornare il saldo del conto');
      account.currentBalanceCents = preview.balanceUpdate.proposedBalanceCents;
      account.currentBalanceAt = preview.balanceUpdate.date;
      account.updatedAt = timestamp;
      await db.accounts.put(account);
    }
    const committedAccount = preview.balanceUpdate?.accepted ? account : await db.accounts.get(preview.accountId) as Account;
    const afterBalance = accountBalanceSnapshot(committedAccount);

    const journal = new Map<string, ImportBatchRow>();
    for (const row of preview.rows) {
      if (row.action === 'duplicate') continue;
      const before = row.matchedTransactionId ? await db.transactions.get(row.matchedTransactionId) : undefined;
      if (row.matchedTransactionId && !before) throw new Error('Il movimento corrispondente non esiste più');
      if (!row.matchedTransactionId && await db.transactions.get(row.transaction.id)) {
        throw new Error('Conflitto nell’identificativo del movimento. Analizza di nuovo il file.');
      }
      const after = transactionWithBatch(row.transaction, batchId, timestamp, before?.firstSeenImportBatchId);
      await db.transactions.put(after);
      const action: ImportBatchRowAction = row.action === 'review'
        ? 'inserted'
        : row.reason === 'pending-posted-reconciled'
          ? 'reconciled'
          : before
            ? 'updated'
            : 'inserted';
      journal.set(after.id, {
        id: uuid(),
        importBatchId: batchId,
        transactionId: after.id,
        action,
        ...(before ? { before } : {}),
        after,
      });

      for (const related of row.relatedTransactions ?? []) {
        const relatedBefore = await db.transactions.get(related.id);
        if (!relatedBefore) throw new Error('Il movimento della controparte non esiste più');
        const relatedAfter = transactionWithBatch(related, batchId, timestamp, relatedBefore.firstSeenImportBatchId);
        await db.transactions.put(relatedAfter);
        journal.set(relatedAfter.id, {
          id: uuid(),
          importBatchId: batchId,
          transactionId: relatedAfter.id,
          action: 'transfer-updated',
          before: relatedBefore,
          after: relatedAfter,
        });
      }
    }

    const batch: ImportBatch = {
      id: batchId,
      fileName: preview.fileName,
      fileSha256: preview.fileSha256,
      accountId: preview.accountId,
      sourceBank: preview.bank,
      status: 'committed',
      importedAt: timestamp,
      counts: preview.counts,
      previousAccountBalance: beforeBalance,
      committedAccountBalance: afterBalance,
    };
    await db.importBatches.add(batch);
    if (journal.size) await db.importBatchRows.bulkAdd([...journal.values()]);
  });
  return batchId;
}

function snapshotMatches(current: Transaction, expected: Transaction): boolean {
  return canonical(current) === canonical(expected);
}

export async function rollbackImport(batchId: string): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, db.importBatches, db.importBatchRows, async () => {
    const batch = await db.importBatches.get(batchId);
    if (!batch) throw new Error('Importazione non trovata');
    if (batch.status !== 'committed') throw new Error('È possibile annullare solo un’importazione confermata');
    const laterBatch = await db.importBatches.where('status').equals('committed').filter((candidate) =>
      candidate.importedAt > batch.importedAt || (candidate.importedAt === batch.importedAt && candidate.id > batch.id),
    ).first();
    if (laterBatch) throw new Error('Annulla prima l’importazione confermata più recente');

    const account = await db.accounts.get(batch.accountId);
    if (!account || !sameBalanceSnapshot(account, batch.committedAccountBalance)) {
      throw new Error('Il conto è cambiato dopo l’importazione. Annullamento bloccato per proteggere le modifiche successive.');
    }
    const journalRows = await db.importBatchRows.where('importBatchId').equals(batchId).toArray();
    for (const journal of journalRows) {
      const current = await db.transactions.get(journal.transactionId);
      if (!current || !snapshotMatches(current, journal.after)) {
        throw new Error('Un movimento è cambiato dopo l’importazione. Annullamento bloccato per proteggere le modifiche successive.');
      }
    }

    for (const journal of journalRows) {
      if (!journal.before) await db.transactions.delete(journal.transactionId);
      else await db.transactions.put(journal.before);
    }
    if (batch.previousAccountBalance.currentBalanceCents === undefined) delete account.currentBalanceCents;
    else account.currentBalanceCents = batch.previousAccountBalance.currentBalanceCents;
    if (batch.previousAccountBalance.currentBalanceAt === undefined) delete account.currentBalanceAt;
    else account.currentBalanceAt = batch.previousAccountBalance.currentBalanceAt;
    account.updatedAt = batch.previousAccountBalance.updatedAt ?? account.updatedAt;
    await db.accounts.put(account);
    await db.importBatches.put({ ...batch, status: 'rolled_back' });
  });
}

const transactionUpdateSchema = updateSchema;

export async function updateTransaction(id: string, patch: TransactionUpdate): Promise<void> {
  const validated = transactionUpdateSchema.parse(patch);
  await db.transaction('rw', db.transactions, db.categories, async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction) throw new Error(`Movimento non trovato: ${id}`);
    if (Object.prototype.hasOwnProperty.call(patch, 'appCategoryId')) {
      if (validated.appCategoryId === undefined) {
        delete transaction.appCategoryId;
        transaction.categorySource = 'uncategorized';
      } else {
        if (!(await db.categories.get(validated.appCategoryId))) throw new Error('Categoria non trovata');
        transaction.appCategoryId = validated.appCategoryId;
        transaction.categorySource = 'manual';
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
      if (validated.kind === undefined) throw new Error('Il tipo del movimento non può essere rimosso');
      const transferLinkId = transaction.transferLinkId;
      transaction.kind = validated.kind as TransactionKind;
      transaction.kindSource = 'manual';
      if (transaction.reviewReason === 'possible-transfer') delete transaction.reviewReason;
      if (transferLinkId && validated.kind !== 'internal_transfer') {
        delete transaction.transferLinkId;
        if (!transaction.reviewReason) transaction.reviewReason = 'possible-transfer';
        const linkedTransactions = await db.transactions.toCollection()
          .filter((candidate) => candidate.transferLinkId === transferLinkId)
          .toArray();
        for (const linked of linkedTransactions) {
          if (linked.id === transaction.id) continue;
          delete linked.transferLinkId;
          if (linked.kindSource !== 'manual') {
            linked.kind = linked.amountCents < 0 ? 'expense' : 'income';
            linked.kindSource = 'automatic';
          }
          if (!linked.reviewReason || linked.reviewReason === 'possible-transfer') linked.reviewReason = 'possible-transfer';
          linked.updatedAt = nowIso();
          await db.transactions.put(linked);
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'userNote')) {
      if (validated.userNote === undefined) delete transaction.userNote;
      else transaction.userNote = validated.userNote;
    }
    transaction.updatedAt = nowIso();
    await db.transactions.put(transaction);
  });
}
