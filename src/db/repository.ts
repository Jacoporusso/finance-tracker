import { z } from 'zod';
import { db } from './database';
import type { Account, AccountInput, Category, CategoryInput, Preferences } from '../domain/models';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((date) => {
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= daysInMonth;
}, 'Expected a valid YYYY-MM-DD date');

const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.enum(['ING', 'INTESA', 'TRADE_REPUBLIC', 'MANUAL']),
  type: z.enum(['checking', 'savings', 'broker', 'cash', 'other']),
  currency: z.literal('EUR'),
  maskedIdentifier: z.string().trim().optional(),
  ownAccountAliases: z.array(z.string().trim().min(1)),
  currentBalanceCents: z.number().int().safe().optional(),
  currentBalanceAt: dateSchema.optional(),
}).strict().superRefine((account, context) => {
  if (account.maskedIdentifier && looksLikeFullIban(account.maskedIdentifier)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maskedIdentifier'], message: 'A full IBAN cannot be stored' });
  }
  account.ownAccountAliases.forEach((alias, index) => {
    if (looksLikeFullIban(alias)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownAccountAliases', index], message: 'A full IBAN cannot be stored in account aliases' });
    }
  });
});

function looksLikeFullIban(value: string): boolean {
  const compact = value.replace(/[\s-]/gu, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(compact);
}

const categoryInputSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();

const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  currency: z.literal('EUR'),
  timeZone: z.literal('Europe/Rome'),
  locale: z.literal('it-IT'),
}).strict();

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  currency: 'EUR',
  timeZone: 'Europe/Rome',
  locale: 'it-IT',
};

const defaultCategories = [
  'Casa',
  'Mutuo',
  'Alimentari',
  'Ristoranti',
  'Trasporti',
  'Auto / Carburante',
  'Utenze e abbonamenti',
  'Famiglia / Scuola',
  'Shopping',
  'Tempo libero',
  'Viaggi',
  'Assicurazioni',
  'Salute',
  'Donazioni',
  'Imposte e commissioni',
  'Entrate / Stipendio',
  'Interessi',
  'Trasferimenti',
  'Investimenti',
  'Altro',
] as const;

const categoryId = (name: string) => `default-${name.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`;
const normalizeCategoryName = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('it-IT');
const normalizeMaskedIdentifier = (value?: string) => (value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleUpperCase('it-IT');
const nowIso = () => new Date().toISOString();

type AccountIdentity = Pick<AccountInput, 'institution' | 'type' | 'name' | 'maskedIdentifier'>;

function hasAccountIdentity(account: Account, candidate: AccountIdentity): boolean {
  return account.institution === candidate.institution &&
    account.type === candidate.type &&
    normalizeCategoryName(account.name) === normalizeCategoryName(candidate.name) &&
    normalizeMaskedIdentifier(account.maskedIdentifier) === normalizeMaskedIdentifier(candidate.maskedIdentifier);
}

export async function findAccountByIdentity(candidate: AccountIdentity): Promise<Account | undefined> {
  const accounts = await db.accounts.toArray();
  return accounts.find((account) => hasAccountIdentity(account, candidate));
}

export async function listAccounts(): Promise<Account[]> {
  return db.accounts.toArray();
}

export async function readAccount(id: string): Promise<Account | undefined> {
  return db.accounts.get(id);
}

export async function listCategories(): Promise<Category[]> {
  return db.categories.toArray();
}

export async function readCategory(id: string): Promise<Category | undefined> {
  return db.categories.get(id);
}

export async function getPreferences(): Promise<Preferences> {
  const stored = await db.settings.get('preferences');
  if (stored === undefined) return { ...DEFAULT_PREFERENCES };

  // Keep forward-compatible settings intact while accepting only supported preferences.
  const parsed = preferencesSchema.safeParse(stored.value);
  return parsed.success ? parsed.data : { ...DEFAULT_PREFERENCES };
}

export async function savePreferences(input: Preferences): Promise<void> {
  const preferences = preferencesSchema.parse(input);
  await db.settings.put({ key: 'preferences', value: preferences, updatedAt: nowIso() });
}

export async function saveAccount(input: AccountInput, id?: string): Promise<string> {
  const validated = accountInputSchema.parse(input);
  const timestamp = nowIso();
  const accountId = id ?? crypto.randomUUID();
  const supplied = (key: keyof Pick<AccountInput, 'maskedIdentifier' | 'currentBalanceCents' | 'currentBalanceAt'>) =>
    Object.prototype.hasOwnProperty.call(input, key);

  await db.transaction('rw', db.accounts, async () => {
    const existing = id ? await db.accounts.get(id) : undefined;
    if (id && !existing) throw new Error(`Account not found: ${id}`);
    if (!id) {
      const duplicate = (await db.accounts.toArray()).find((account) => hasAccountIdentity(account, validated));
      if (duplicate) {
        throw new Error('Esiste già un conto con questi dati. Seleziona quello esistente oppure modifica i suoi dettagli.');
      }
    }

    const requiredFields = { ...validated };
    delete requiredFields.maskedIdentifier;
    delete requiredFields.currentBalanceCents;
    delete requiredFields.currentBalanceAt;
    const account: Account = {
      ...existing,
      ...requiredFields,
      id: accountId,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    // Omitted optional keys preserve stored values; explicitly present undefined keys clear them.
    if (supplied('maskedIdentifier')) {
      if (validated.maskedIdentifier === undefined) delete account.maskedIdentifier;
      else account.maskedIdentifier = validated.maskedIdentifier;
    }
    if (supplied('currentBalanceCents')) {
      if (validated.currentBalanceCents === undefined) delete account.currentBalanceCents;
      else account.currentBalanceCents = validated.currentBalanceCents;
    }
    if (supplied('currentBalanceAt')) {
      if (validated.currentBalanceAt === undefined) delete account.currentBalanceAt;
      else account.currentBalanceAt = validated.currentBalanceAt;
    }
    if (account.currentBalanceAt !== undefined && account.currentBalanceCents === undefined) {
      throw new Error('A balance date requires a known balance');
    }
    if (account.currentBalanceCents !== undefined && account.currentBalanceAt === undefined) {
      throw new Error('A known balance requires its reference date');
    }

    await db.accounts.put(account);
  });
  return accountId;
}

export async function deleteEmptyAccount(id: string): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, db.importBatches, db.importBatchRows, async () => {
    const account = await db.accounts.get(id);
    if (!account) throw new Error('Il conto non è più disponibile. Aggiorna la pagina e riprova.');

    const [transactionIds, batchIds] = await Promise.all([
      db.transactions.where('accountId').equals(id).primaryKeys(),
      db.importBatches.where('accountId').equals(id).primaryKeys(),
    ]);
    const rowCounts = await Promise.all([
      batchIds.length ? db.importBatchRows.where('importBatchId').anyOf(batchIds).count() : 0,
      transactionIds.length ? db.importBatchRows.where('transactionId').anyOf(transactionIds).count() : 0,
    ]);

    if (transactionIds.length || batchIds.length || rowCounts.some((count) => count > 0)) {
      throw new Error('Questo conto ha movimenti o storico di importazione e non può essere eliminato. Puoi archiviarlo.');
    }
    await db.accounts.delete(id);
  });
}

export async function setAccountActive(id: string, active: boolean): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    const account = await db.accounts.get(id);
    if (!account) throw new Error(`Account not found: ${id}`);
    await db.accounts.put({ ...account, active, updatedAt: nowIso() });
  });
}

export async function saveCategory(input: CategoryInput, id?: string): Promise<void> {
  const validated = categoryInputSchema.parse(input);
  const timestamp = nowIso();
  const categoryIdValue = id ?? crypto.randomUUID();
  await db.transaction('rw', db.categories, async () => {
    const existing = id ? await db.categories.get(id) : undefined;
    if (id && !existing) throw new Error('Category not found');
    const normalizedName = normalizeCategoryName(validated.name);
    const duplicate = (await db.categories.toArray()).find((category) =>
      category.id !== categoryIdValue && normalizeCategoryName(category.name) === normalizedName,
    );
    if (duplicate) throw new Error(`Category name already exists: ${validated.name}`);

    await db.categories.put({
      ...existing,
      ...validated,
      id: categoryIdValue,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  });
}

export async function initializeDatabase(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.categories, db.settings, async () => {
    const timestamp = nowIso();
    for (const name of defaultCategories) {
      const id = categoryId(name);
      if (!(await db.categories.get(id))) {
        const alreadyPresent = (await db.categories.toArray()).some(
          (category) => normalizeCategoryName(category.name) === normalizeCategoryName(name),
        );
        if (!alreadyPresent) {
          await db.categories.add({ id, name, createdAt: timestamp, updatedAt: timestamp });
        }
      }
    }
    if (!(await db.settings.get('preferences'))) {
      await db.settings.add({ key: 'preferences', value: { ...DEFAULT_PREFERENCES }, updatedAt: timestamp });
    }
  });
}
