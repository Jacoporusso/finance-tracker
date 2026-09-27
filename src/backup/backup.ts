import { z } from 'zod';
import { db } from '../db/database';
import type { Account, Category } from '../domain/models';
import type { ImportBatch, ImportBatchRow, Liability, Transaction } from '../domain/transactions';
import type { AppSetting } from '../db/database';
import { formatDate } from '../domain/display';
import { formatMoney } from '../domain/money';
import { mortgageSchema } from '../domain/mortgage-validation';

const BACKUP_FORMAT = 'finance-tracker-backup';
const BACKUP_VERSION = 1;
const KDF_ITERATIONS = 310_000;
const MIN_KDF_ITERATIONS = 200_000;
const MAX_KDF_ITERATIONS = 1_000_000;
const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
export const BACKUP_PASSWORD_MIN_LENGTH = 10;
const safeCentsSchema = z.number().int().refine(Number.isSafeInteger, 'Importo fuori intervallo.');
const isoDateSchema = z.iso.date();
const isoTimestampSchema = z.iso.datetime({ offset: true });

const accountSchema = z.object({
  id: z.string().min(1),
  institution: z.enum(['ING', 'INTESA', 'TRADE_REPUBLIC', 'MANUAL']),
  name: z.string(),
  type: z.enum(['checking', 'savings', 'broker', 'cash', 'other']),
  currency: z.literal('EUR'),
  currentBalanceCents: safeCentsSchema.optional(),
  currentBalanceAt: isoDateSchema.optional(),
  maskedIdentifier: z.string().optional(),
  ownAccountAliases: z.array(z.string()),
  active: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).passthrough();

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).passthrough();

const transactionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  amountCents: safeCentsSchema,
  bookingDate: isoDateSchema,
  valueDate: isoDateSchema.optional(),
  currency: z.literal('EUR'),
  status: z.enum(['pending', 'posted', 'cancelled']),
  kind: z.enum(['income', 'expense', 'internal_transfer', 'investment_transfer', 'fee', 'interest', 'other']),
  rawDescription: z.string(),
  sourceOperation: z.string().optional(),
  sourceCategory: z.string().optional(),
  sourceAccountLabel: z.string().optional(),
  externalTransactionId: z.string().optional(),
  exactFingerprint: z.string(),
  fuzzyFingerprint: z.string(),
  appCategoryId: z.string().optional(),
  categorySource: z.enum(['source', 'manual', 'uncategorized']),
  userNote: z.string().optional(),
  kindSource: z.enum(['manual', 'automatic']).optional(),
  transferLinkId: z.string().optional(),
  reviewReason: z.string().optional(),
  sourceBank: z.enum(['ING', 'INTESA']),
  firstSeenImportBatchId: z.string(),
  lastSeenImportBatchId: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).passthrough();

const importCountsSchema = z.object({
  insertedCount: safeCentsSchema.nonnegative(),
  updatedCount: safeCentsSchema.nonnegative(),
  duplicateCount: safeCentsSchema.nonnegative(),
  reviewCount: safeCentsSchema.nonnegative(),
  pendingReconciledCount: safeCentsSchema.nonnegative(),
  transferMatchedCount: safeCentsSchema.nonnegative(),
}).passthrough();

const balanceSnapshotSchema = z.object({
  currentBalanceCents: safeCentsSchema.optional(),
  currentBalanceAt: isoDateSchema.optional(),
  updatedAt: isoTimestampSchema.optional(),
}).passthrough();

const importBatchSchema = z.object({
  id: z.string().min(1),
  fileName: z.string(),
  fileSha256: z.string(),
  accountId: z.string().min(1),
  sourceBank: z.enum(['ING', 'INTESA']),
  status: z.enum(['committed', 'rolled_back']),
  importedAt: isoTimestampSchema,
  counts: importCountsSchema,
  previousAccountBalance: balanceSnapshotSchema,
  committedAccountBalance: balanceSnapshotSchema,
}).passthrough();

const transactionJournalSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  amountCents: safeCentsSchema,
  bookingDate: isoDateSchema,
  valueDate: isoDateSchema.optional(),
  currency: z.literal('EUR'),
  status: z.enum(['pending', 'posted', 'cancelled']),
  kind: z.enum(['income', 'expense', 'internal_transfer', 'investment_transfer', 'fee', 'interest', 'other']),
  rawDescription: z.string(),
  sourceOperation: z.string().optional(),
  sourceCategory: z.string().optional(),
  sourceAccountLabel: z.string().optional(),
  externalTransactionId: z.string().optional(),
  exactFingerprint: z.string(),
  fuzzyFingerprint: z.string(),
  appCategoryId: z.string().optional(),
  categorySource: z.enum(['source', 'manual', 'uncategorized']),
  userNote: z.string().optional(),
  kindSource: z.enum(['manual', 'automatic']).optional(),
  transferLinkId: z.string().optional(),
  reviewReason: z.string().optional(),
  sourceBank: z.enum(['ING', 'INTESA']),
  firstSeenImportBatchId: z.string(),
  lastSeenImportBatchId: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).passthrough();

const importBatchRowSchema = z.object({
  id: z.string().min(1),
  importBatchId: z.string().min(1),
  transactionId: z.string().min(1),
  action: z.enum(['inserted', 'updated', 'reconciled', 'transfer-updated']),
  before: transactionJournalSchema.optional(),
  after: transactionJournalSchema,
}).passthrough();

const liabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  amountCents: safeCentsSchema,
  asOf: isoDateSchema,
  updatedAt: isoTimestampSchema,
  mortgage: mortgageSchema.optional(),
}).passthrough();

const settingSchema = z.object({ key: z.string().min(1), value: z.unknown(), updatedAt: isoTimestampSchema }).passthrough();

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: isoTimestampSchema,
  settings: z.array(settingSchema),
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  transactions: z.array(transactionSchema),
  importBatches: z.array(importBatchSchema),
  importBatchRows: z.array(importBatchRowSchema),
  liabilities: z.array(liabilitySchema),
});

interface BackupSnapshot {
  schemaVersion: 1;
  createdAt: string;
  settings: AppSetting[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  importBatches: ImportBatch[];
  importBatchRows: ImportBatchRow[];
  liabilities: Liability[];
}
type StoreName = 'settings' | 'accounts' | 'categories' | 'transactions' | 'importBatches' | 'importBatchRows' | 'liabilities';
type BackupRecord = object;
type ConflictStrategy = 'keep-local' | 'use-backup';

export interface BackupRestorePreview {
  createdAt: string;
  recordCounts: Record<StoreName, { incoming: number; new: number; identical: number; conflicts: number }>;
  conflicts: Array<{ store: StoreName; id: string; label: string }>;
}

export interface BackupRestoreResult {
  added: number;
  identical: number;
  conflictsKept: number;
  conflictsReplaced: number;
}

export class BackupRestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupRestoreError';
  }
}

const plans = new WeakMap<BackupRestorePreview, { snapshot: BackupSnapshot; localAtPreview: BackupSnapshot }>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function readSnapshot(): Promise<BackupSnapshot> {
  await db.open();
  return db.transaction('r', [db.settings, db.accounts, db.categories, db.transactions, db.importBatches, db.importBatchRows, db.liabilities], async () => {
    const [settings, accounts, categories, transactions, importBatches, importBatchRows, liabilities] = await Promise.all([
      db.settings.toArray(), db.accounts.toArray(), db.categories.toArray(), db.transactions.toArray(),
      db.importBatches.toArray(), db.importBatchRows.toArray(), db.liabilities.toArray(),
    ]);
    return {
      schemaVersion: 1 as const,
      createdAt: new Date().toISOString(),
      settings,
      accounts,
      categories,
      transactions,
      importBatches,
      importBatchRows,
      liabilities,
    };
  });
}

function canonical(value: unknown): string {
  const sortKeys = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortKeys);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortKeys(nested)]));
    }
    return item;
  };
  return JSON.stringify(sortKeys(value));
}

function recordsEqual(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function recordsEquivalentForMerge(store: StoreName, left: BackupRecord, right: BackupRecord): boolean {
  if (store !== 'settings' && store !== 'categories') return recordsEqual(left, right);
  const stripTimestamps = (row: BackupRecord) => Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'createdAt' && key !== 'updatedAt'),
  );
  return recordsEqual(stripTimestamps(left), stripTimestamps(right));
}

function recordKey(store: StoreName, value: BackupRecord): string {
  const record = value as { id?: unknown; key?: unknown };
  const key = store === 'settings' ? record.key : record.id;
  if (typeof key !== 'string' || !key) throw new BackupRestoreError(`Chiave mancante nel contenuto ${store}.`);
  return key;
}

function recordsByStore(snapshot: BackupSnapshot): Record<StoreName, BackupRecord[]> {
  return {
    settings: snapshot.settings as unknown as BackupRecord[],
    accounts: snapshot.accounts as unknown as BackupRecord[],
    categories: snapshot.categories as unknown as BackupRecord[],
    transactions: snapshot.transactions as unknown as BackupRecord[],
    importBatches: snapshot.importBatches as unknown as BackupRecord[],
    importBatchRows: snapshot.importBatchRows as unknown as BackupRecord[],
    liabilities: snapshot.liabilities as unknown as BackupRecord[],
  };
}

function safeConflictLabel(store: StoreName, row: BackupRecord): string {
  const value = row as Record<string, unknown>;
  if (store === 'accounts' || store === 'categories' || store === 'liabilities') return String(value.name ?? store);
  if (store === 'transactions') return `Movimento · ${formatDate(String(value.bookingDate ?? ''))} · ${formatMoney(Number(value.amountCents ?? 0))}`;
  if (store === 'importBatches') return `${String(value.sourceBank ?? '')} · ${formatDate(String(value.importedAt ?? '').slice(0, 10))}`;
  if (store === 'settings') return String(value.key ?? 'Preferenza');
  return `Riga di storico · ${String(value.action ?? '')}`;
}

async function validateReferences(snapshot: BackupSnapshot): Promise<void> {
  const accountIds = new Set(snapshot.accounts.map((row) => row.id));
  if (snapshot.liabilities.some((row) => row.mortgage?.accountId && !accountIds.has(row.mortgage.accountId))) {
    throw new Error('Il piano contiene un conto di addebito mancante nel backup.');
  }
  const categoryIds = new Set(snapshot.categories.map((row) => row.id));
  const batchIds = new Set(snapshot.importBatches.map((row) => row.id));
  const transactionIds = new Set(snapshot.transactions.map((row) => row.id));
  const invalidTransaction = snapshot.transactions.find((row) =>
    !accountIds.has(row.accountId)
    || (row.appCategoryId !== undefined && !categoryIds.has(row.appCategoryId))
    || !batchIds.has(row.firstSeenImportBatchId)
    || !batchIds.has(row.lastSeenImportBatchId));
  if (invalidTransaction) throw new BackupRestoreError('Il backup contiene movimenti con riferimenti a conti, categorie o importazioni mancanti.');
  const invalidBatch = snapshot.importBatches.find((row) => !accountIds.has(row.accountId));
  if (invalidBatch) throw new BackupRestoreError('Il backup contiene importazioni collegate a conti mancanti.');
  const batchesById = new Map(snapshot.importBatches.map((row) => [row.id, row]));
  const invalidJournal = snapshot.importBatchRows.find((row) =>
    !batchesById.has(row.importBatchId)
    || row.transactionId !== row.after.id
    || (row.before !== undefined && row.before.id !== row.transactionId)
    || (!transactionIds.has(row.transactionId) && batchesById.get(row.importBatchId)?.status !== 'rolled_back'));
  if (invalidJournal) throw new BackupRestoreError('Il backup contiene righe di storico collegate a dati mancanti.');
  for (const row of snapshot.importBatchRows) {
    for (const snapshotTransaction of [row.before, row.after]) {
      if (snapshotTransaction && (
        !accountIds.has(snapshotTransaction.accountId)
        || (snapshotTransaction.appCategoryId !== undefined && !categoryIds.has(snapshotTransaction.appCategoryId))
        || !batchIds.has(snapshotTransaction.firstSeenImportBatchId)
        || !batchIds.has(snapshotTransaction.lastSeenImportBatchId)
      )) throw new BackupRestoreError('Lo storico di importazione contiene un movimento con riferimenti mancanti.');
    }
  }
  assertTransferIntegrity(snapshot.transactions);
}

function assertTransferIntegrity(transactions: Transaction[]): void {
  const links = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (!transaction.transferLinkId) continue;
    const group = links.get(transaction.transferLinkId) ?? [];
    group.push(transaction);
    links.set(transaction.transferLinkId, group);
  }
  for (const linked of links.values()) {
    if (linked.length !== 2) throw new BackupRestoreError('Il backup contiene un collegamento di trasferimento non reciproco o duplicato.');
    const [left, right] = linked;
    if (left.accountId === right.accountId || left.currency !== right.currency || left.amountCents !== -right.amountCents) {
      throw new BackupRestoreError('Gli importi o i conti di un trasferimento collegato non corrispondono.');
    }
  }
}

async function buildPreview(snapshot: BackupSnapshot): Promise<BackupRestorePreview> {
  const current = await readSnapshot();
  assertNoIndependentOverlap(snapshot, current);
  const incomingByStore = recordsByStore(snapshot);
  const currentByStore = recordsByStore(current);
  const recordCounts = {} as BackupRestorePreview['recordCounts'];
  const conflicts: BackupRestorePreview['conflicts'] = [];
  for (const store of Object.keys(incomingByStore) as StoreName[]) {
    const localById = new Map(currentByStore[store].map((row) => [recordKey(store, row), row]));
    const incomingIds = new Set<string>();
    let added = 0;
    let identical = 0;
    let conflictCount = 0;
    for (const row of incomingByStore[store]) {
      const key = recordKey(store, row);
      if (incomingIds.has(key)) throw new BackupRestoreError(`Il backup contiene chiavi duplicate nella sezione ${store}.`);
      incomingIds.add(key);
      const local = localById.get(key);
      if (!local) added += 1;
      else if (recordsEquivalentForMerge(store, local, row)) identical += 1;
      else {
        conflictCount += 1;
        conflicts.push({ store, id: key, label: safeConflictLabel(store, row) });
      }
    }
    recordCounts[store] = { incoming: incomingByStore[store].length, new: added, identical, conflicts: conflictCount };
  }
  const preview: BackupRestorePreview = { createdAt: snapshot.createdAt, recordCounts, conflicts };
  plans.set(preview, { snapshot, localAtPreview: current });
  return preview;
}

function assertNoIndependentOverlap(archive: BackupSnapshot, current: BackupSnapshot): void {
  const localAccountIds = new Set(current.accounts.map((row) => row.id));
  const accountOverlap = archive.accounts.find((incoming) => {
    if (localAccountIds.has(incoming.id)) return false;
    return current.accounts.some((local) => {
      const sameInstitutionAndType = local.institution === incoming.institution && local.type === incoming.type;
      const sameName = normalizedName(local.name) === normalizedName(incoming.name);
      const sameMasked = Boolean(local.maskedIdentifier && incoming.maskedIdentifier && local.maskedIdentifier === incoming.maskedIdentifier);
      return sameInstitutionAndType && (sameName || sameMasked);
    });
  });
  if (accountOverlap) throw new BackupRestoreError('Questo archivio sembra provenire da un dispositivo inizializzato separatamente: contiene un conto già presente con un ID diverso. Avvia il trasferimento partendo da un archivio comune.');

  const batchIds = new Set(current.importBatches.map((row) => row.id));
  const sharedBatchLineage = (fileSha256: string) => archive.importBatches.some((incoming) => incoming.fileSha256 === fileSha256
    && current.importBatches.some((local) => local.fileSha256 === fileSha256 && local.id === incoming.id));
  if (archive.importBatches.some((incoming) => !batchIds.has(incoming.id)
    && current.importBatches.some((local) => local.fileSha256 === incoming.fileSha256)
    && !sharedBatchLineage(incoming.fileSha256))) {
    throw new BackupRestoreError('Lo stesso file bancario è già stato importato su questo dispositivo con un ID diverso. Usa un archivio nato da questo stesso dispositivo per evitare movimenti duplicati.');
  }

  const transactionIds = new Set(current.transactions.map((row) => row.id));
  const incomingBatchesById = new Map(archive.importBatches.map((row) => [row.id, row]));
  const localBatchesById = new Map(current.importBatches.map((row) => [row.id, row]));
  if (archive.transactions.some((incoming) => !transactionIds.has(incoming.id)
    && current.transactions.some((local) => {
      if (local.exactFingerprint !== incoming.exactFingerprint) return false;
      const incomingHash = incomingBatchesById.get(incoming.lastSeenImportBatchId)?.fileSha256;
      const localHash = localBatchesById.get(local.lastSeenImportBatchId)?.fileSha256;
      return !incomingHash || !localHash || incomingHash !== localHash || !sharedBatchLineage(incomingHash);
    }))) {
    throw new BackupRestoreError('Il backup contiene movimenti già presenti con ID diversi. I dispositivi sono stati inizializzati separatamente: scegli un dispositivo di origine comune per il trasferimento.');
  }
}

function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it-IT');
}

export async function createEncryptedBackup(password: string): Promise<Blob> {
  if (password.length < BACKUP_PASSWORD_MIN_LENGTH) {
    throw new BackupRestoreError(`La password deve contenere almeno ${BACKUP_PASSWORD_MIN_LENGTH} caratteri.`);
  }
  const snapshot = await readSnapshot();
  await validateReferences(snapshot);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const file = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: { name: 'PBKDF2-SHA-256', iterations: KDF_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-256-GCM', iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) },
  };
  return new Blob([JSON.stringify(file)], { type: 'application/vnd.finance-tracker.backup+json' });
}

export async function downloadEncryptedBackup(password: string): Promise<void> {
  const blob = await createEncryptedBackup(password);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `finance-tracker-backup-${new Date().toISOString().slice(0, 10)}.financebackup`;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function previewEncryptedBackup(file: File, password: string): Promise<BackupRestorePreview> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupRestoreError('Il file di backup supera il limite di 250 MB.');
  let envelope: unknown;
  try {
    envelope = JSON.parse(await file.text());
  } catch {
    throw new BackupRestoreError('Il file non è un backup valido o è danneggiato.');
  }
  const envelopeSchema = z.object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    kdf: z.object({ name: z.literal('PBKDF2-SHA-256'), iterations: z.number().int().min(MIN_KDF_ITERATIONS).max(MAX_KDF_ITERATIONS), salt: z.string() }),
    cipher: z.object({ name: z.literal('AES-256-GCM'), iv: z.string(), ciphertext: z.string() }),
  });
  const parsedEnvelope = envelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) throw new BackupRestoreError('Versione o struttura del backup non supportata.');
  let plaintext: ArrayBuffer;
  try {
    const salt = base64ToBytes(parsedEnvelope.data.kdf.salt);
    const iv = base64ToBytes(parsedEnvelope.data.cipher.iv);
    const ciphertext = base64ToBytes(parsedEnvelope.data.cipher.ciphertext);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid crypto parameters');
    const key = await deriveKey(password, salt, parsedEnvelope.data.kdf.iterations);
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new BackupRestoreError('Password errata o file di backup alterato.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw new BackupRestoreError('Il contenuto del backup non è un JSON valido.');
  }
  const validated = snapshotSchema.safeParse(decoded);
  if (!validated.success) throw new BackupRestoreError('Il backup contiene dati non validi o di una versione incompatibile.');
  const snapshot = validated.data as unknown as BackupSnapshot;
  await validateReferences(snapshot);
  return buildPreview(snapshot);
}

export async function applyBackupRestore(
  preview: BackupRestorePreview,
  strategy: ConflictStrategy = 'keep-local',
): Promise<BackupRestoreResult> {
  const plan = plans.get(preview);
  if (!plan) throw new BackupRestoreError('Anteprima scaduta. Riapri il file di backup e ricontrolla i dati.');
  const { snapshot, localAtPreview } = plan;

  return db.transaction('rw', [db.settings, db.accounts, db.categories, db.transactions, db.importBatches, db.importBatchRows, db.liabilities], async () => {
    await validateReferences(snapshot);
    const incomingByStore = recordsByStore(snapshot);
    const current = await Promise.all([
      db.settings.toArray(), db.accounts.toArray(), db.categories.toArray(), db.transactions.toArray(),
      db.importBatches.toArray(), db.importBatchRows.toArray(), db.liabilities.toArray(),
    ]);
    const currentByStore: Record<StoreName, BackupRecord[]> = {
      settings: current[0] as unknown as BackupRecord[], accounts: current[1] as unknown as BackupRecord[], categories: current[2] as unknown as BackupRecord[],
      transactions: current[3] as unknown as BackupRecord[], importBatches: current[4] as unknown as BackupRecord[],
      importBatchRows: current[5] as unknown as BackupRecord[], liabilities: current[6] as unknown as BackupRecord[],
    };
    const currentSnapshot: BackupSnapshot = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      settings: current[0] as AppSetting[],
      accounts: current[1] as Account[],
      categories: current[2] as Category[],
      transactions: current[3] as Transaction[],
      importBatches: current[4] as ImportBatch[],
      importBatchRows: current[5] as ImportBatchRow[],
      liabilities: current[6] as Liability[],
    };
    assertNoIndependentOverlap(snapshot, currentSnapshot);
    const previewByStore = recordsByStore(localAtPreview);
    for (const store of Object.keys(incomingByStore) as StoreName[]) {
      const previewLocalById = new Map(previewByStore[store].map((row) => [recordKey(store, row), row]));
      const currentLocalById = new Map(currentByStore[store].map((row) => [recordKey(store, row), row]));
      for (const incoming of incomingByStore[store]) {
        const id = recordKey(store, incoming);
        const localAtPreview = previewLocalById.get(id);
        const localNow = currentLocalById.get(id);
        if (localAtPreview === undefined ? localNow !== undefined : !localNow || !recordsEqual(localAtPreview, localNow)) {
          throw new BackupRestoreError('I dati sono cambiati dopo l’anteprima. Riapri il backup e controlla di nuovo i conflitti.');
        }
      }
    }
    const result: BackupRestoreResult = { added: 0, identical: 0, conflictsKept: 0, conflictsReplaced: 0 };
    const mergedTransactions = new Map(currentSnapshot.transactions.map((row) => [row.id, row]));
    for (const incoming of snapshot.transactions) {
      const local = mergedTransactions.get(incoming.id);
      if (!local || strategy === 'use-backup') mergedTransactions.set(incoming.id, incoming);
    }
    assertTransferIntegrity([...mergedTransactions.values()]);
    const writeRecord = async (store: StoreName, operation: 'add' | 'put', row: BackupRecord): Promise<void> => {
      if (store === 'settings') {
        const typed = row as AppSetting;
        if (operation === 'add') await db.settings.add(typed); else await db.settings.put(typed);
      } else if (store === 'accounts') {
        const typed = row as Account;
        if (operation === 'add') await db.accounts.add(typed); else await db.accounts.put(typed);
      } else if (store === 'categories') {
        const typed = row as Category;
        if (operation === 'add') await db.categories.add(typed); else await db.categories.put(typed);
      } else if (store === 'transactions') {
        const typed = row as Transaction;
        if (operation === 'add') await db.transactions.add(typed); else await db.transactions.put(typed);
      } else if (store === 'importBatches') {
        const typed = row as ImportBatch;
        if (operation === 'add') await db.importBatches.add(typed); else await db.importBatches.put(typed);
      } else if (store === 'importBatchRows') {
        const typed = row as ImportBatchRow;
        if (operation === 'add') await db.importBatchRows.add(typed); else await db.importBatchRows.put(typed);
      } else {
        const typed = row as Liability;
        if (operation === 'add') await db.liabilities.add(typed); else await db.liabilities.put(typed);
      }
    };
    for (const store of Object.keys(incomingByStore) as StoreName[]) {
      const localById = new Map(currentByStore[store].map((row) => [recordKey(store, row), row]));
      for (const incoming of incomingByStore[store]) {
        const id = recordKey(store, incoming);
        const local = localById.get(id);
        if (!local) {
          await writeRecord(store, 'add', incoming);
          result.added += 1;
        } else if (recordsEquivalentForMerge(store, local, incoming)) {
          result.identical += 1;
        } else if (strategy === 'use-backup') {
          await writeRecord(store, 'put', incoming);
          result.conflictsReplaced += 1;
        } else {
          result.conflictsKept += 1;
        }
      }
    }
    return result;
  });
}
