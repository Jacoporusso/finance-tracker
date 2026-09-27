import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { deleteEmptyAccount, saveAccount, setAccountActive } from '../db/repository';
import type { Account, AccountInput } from '../domain/models';
import { formatMoney, parseMoneyToCents } from '../domain/money';
import { formatDate } from '../domain/display';
import DatePicker from '../components/DatePicker';
import { todayInRome } from '../domain/dates';
import { accountBalance } from '../domain/balances';

type Institution = AccountInput['institution'];
type AccountKind = AccountInput['type'];

const institutionLabels: Record<Institution, string> = {
  ING: 'ING',
  INTESA: 'Intesa Sanpaolo',
  TRADE_REPUBLIC: 'Trade Republic',
  MANUAL: 'Manuale',
};

const accountKindLabels: Record<AccountKind, string> = {
  checking: 'Conto corrente',
  savings: 'Conto deposito',
  broker: 'Investimenti',
  cash: 'Contanti',
  other: 'Altro',
};

const blankForm = (): AccountForm => ({
  name: '',
  institution: 'MANUAL',
  type: 'checking',
  maskedIdentifier: '',
  aliases: '',
  balance: '',
  balanceAt: '',
  balanceMode: 'snapshot',
});

interface AccountForm {
  name: string;
  institution: Institution;
  type: AccountKind;
  maskedIdentifier: string;
  aliases: string;
  balance: string;
  balanceAt: string;
  balanceMode: 'snapshot' | 'derived';
}

function formFromAccount(account: Account): AccountForm {
  return {
    name: account.name,
    institution: account.institution,
    type: account.type,
    maskedIdentifier: account.maskedIdentifier ?? '',
    aliases: account.ownAccountAliases.join('\n'),
    balance: account.currentBalanceCents === undefined
      ? ''
      : new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(account.currentBalanceCents / 100),
    balanceAt: account.currentBalanceAt ?? '',
    balanceMode: account.balanceMode ?? 'snapshot',
  };
}

export default function AccountsPage() {
  const accounts = useLiveQuery(async () => {
    const storedAccounts = await db.accounts.toArray();
    return Promise.all(storedAccounts.map(async (account) => {
      const [transactionCount, batchCount] = await Promise.all([
        db.transactions.where('accountId').equals(account.id).count(),
        db.importBatches.where('accountId').equals(account.id).count(),
      ]);
      return { ...account, canDelete: transactionCount === 0 && batchCount === 0 };
    }));
  }, []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(blankForm);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setEditingAccount(null);
    setForm(blankForm());
    setError('');
    setFormOpen(true);
  }

  function startEdit(account: Account) {
    setEditingAccount(account);
    setForm(formFromAccount(account));
    setError('');
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setEditingAccount(null);
    setForm(blankForm());
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const name = form.name.trim();
    if (!name) {
      setError('Inserisci un nome per il conto.');
      return;
    }

    const balanceText = form.balance.trim();
    const balanceAt = form.balanceAt.trim();
    if (balanceText && !balanceAt) {
      setError('Aggiungi la data di aggiornamento del saldo.');
      return;
    }
    if (!balanceText && balanceAt) {
      setError('Inserisci anche il saldo oppure rimuovi la data.');
      return;
    }

    let currentBalanceCents: number | undefined;
    if (balanceText) {
      try {
        currentBalanceCents = parseMoneyToCents(balanceText);
        if (!Number.isSafeInteger(currentBalanceCents)) throw new Error('Saldo non valido.');
      } catch {
        setError('Controlla il formato del saldo e riprova.');
        return;
      }
    }

    const input: AccountInput = {
      name,
      institution: form.institution,
      type: form.type,
      currency: 'EUR',
      maskedIdentifier: form.maskedIdentifier.trim() || undefined,
      ownAccountAliases: form.aliases.split(/\r?\n/).map((alias) => alias.trim()).filter(Boolean),
      currentBalanceCents,
      currentBalanceAt: currentBalanceCents === undefined ? undefined : balanceAt,
      balanceMode: form.balanceMode,
    };

    setBusy(true);
    try {
      await saveAccount(input, editingAccount?.id);
      setFormOpen(false);
      setEditingAccount(null);
      setForm(blankForm());
      setError('');
    } catch (error) {
      setError(getAccountSaveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(account: Account) {
    const nextActive = !account.active;
    if (!nextActive && !window.confirm(`Archiviare “${account.name}”? Lo storico del conto resta disponibile.`)) return;

    setError('');
    setBusy(true);
    try {
      await setAccountActive(account.id, nextActive);
    } catch {
      setError(nextActive ? 'Non è stato possibile riattivare il conto.' : 'Non è stato possibile archiviare il conto.');
    } finally {
      setBusy(false);
    }
  }

  async function removeEmptyAccount(account: Account) {
    if (!window.confirm(`Eliminare definitivamente il conto “${account.name}”? Questa azione non si può annullare.`)) return;

    setError('');
    setBusy(true);
    try {
      await deleteEmptyAccount(account.id);
      if (editingAccount?.id === account.id) {
        setFormOpen(false);
        setEditingAccount(null);
        setForm(blankForm());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Non è stato possibile eliminare il conto. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  const sortedAccounts = [...(accounts ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'it'));

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Conti</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">Organizza i conti e aggiorna i saldi. I dati restano su questo dispositivo.</p>
        </div>
        {!formOpen && <button type="button" onClick={startCreate} disabled={busy} className="min-h-11 w-full rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-on-green disabled:opacity-60 sm:w-auto">Aggiungi conto</button>}
      </div>

      {error && !formOpen && <p role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{editingAccount ? 'Modifica conto' : 'Nuovo conto'}</h2>
              <p className="mt-1 text-sm text-muted">I campi con * sono obbligatori. Saldi e identificativi sono facoltativi.</p>
            </div>
            <button type="button" onClick={closeForm} disabled={busy} className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted hover:bg-canvas disabled:opacity-60">Chiudi</button>
          </div>

          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink">
              Nome conto *
              <input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} required className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20" placeholder="Es. Conto principale" />
            </label>
            <label className="text-sm font-medium text-ink">
              Istituto
              <select value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value as Institution })} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20">
                {Object.entries(institutionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">
              Tipo conto
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AccountKind })} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20">
                {Object.entries(accountKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">
              Identificativo mascherato
              <input value={form.maskedIdentifier} onChange={(event) => setForm({ ...form, maskedIdentifier: event.target.value })} maxLength={60} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20" placeholder="Es. ···· 1234" aria-describedby="masked-help" />
              <span id="masked-help" className="mt-1 block text-sm font-normal text-muted">Non inserire il numero completo del conto o l’IBAN.</span>
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2">
              Saldo attuale (EUR)
              <input inputMode="decimal" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20" placeholder="Es. 1250,00" aria-describedby="balance-help" />
              <span id="balance-help" className="mt-1 block text-sm font-normal text-muted">Saldo manuale facoltativo. Inserisci anche la data dell’aggiornamento.</span>
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2">
              Data del saldo
              <DatePicker className="mt-1.5" label="Data del saldo" value={form.balanceAt} onChange={(balanceAt) => setForm({ ...form, balanceAt })} max={todayInRome()} />
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2">Metodo aggiornamento
              <select value={form.balanceMode} disabled={form.type === 'broker'} onChange={(event) => setForm({ ...form, balanceMode: event.target.value as AccountForm['balanceMode'] })} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink"><option value="snapshot">Saldo registrato</option><option value="derived">Calcolato dai movimenti</option></select>
              <span className="mt-1 block text-sm font-normal text-muted">Il saldo calcolato parte dal riferimento e usa i movimenti contabilizzati successivi.</span>
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2">
              Alias dei tuoi conti
              <textarea rows={3} value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20" placeholder={'Un alias per riga, ad esempio:\nConto deposito personale'} aria-describedby="alias-help" />
              <span id="alias-help" className="mt-1 block text-sm font-normal text-muted">Alias utili a riconoscere i trasferimenti tra i tuoi conti.</span>
            </label>
          </fieldset>

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeForm} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60">Annulla</button>
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-green px-5 py-2.5 text-sm font-semibold text-on-green disabled:cursor-wait disabled:opacity-60">{busy ? 'Salvataggio…' : 'Salva conto'}</button>
          </div>
        </form>
      )}

      <section aria-label="Elenco conti" className="mt-6">
        {accounts === undefined ? (
          <p role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-sm text-muted">Caricamento conti…</p>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center sm:px-8">
            <h2 className="text-lg font-semibold text-ink">Aggiungi il tuo primo conto</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">Potrai organizzare conti correnti, risparmi e investimenti. Puoi aggiungere il saldo anche in seguito.</p>
            {!formOpen && <button type="button" onClick={startCreate} disabled={busy} className="mt-5 min-h-11 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-on-green disabled:opacity-60">Crea un conto</button>}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sortedAccounts.map((account) => (
              <li key={account.id} className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${account.active ? '' : 'opacity-75'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold text-ink">{account.name}</h2>
                    <p className="mt-1 text-sm text-muted">{institutionLabels[account.institution]} · {accountKindLabels[account.type]}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ${account.active ? 'bg-green-soft text-green' : 'bg-canvas text-muted'}`}>{account.active ? 'Attivo' : 'Archiviato'}</span>
                </div>
                {account.maskedIdentifier && <p className="mt-3 text-sm text-muted">{account.maskedIdentifier}</p>}
                <div className="mt-4 border-t border-line pt-3">
                  {(() => { const balance = accountBalance(account, transactions ?? []); return <><p className="text-sm text-muted">Saldo {balance.amountCents === undefined ? 'non indicato' : formatMoney(balance.amountCents)}</p><p className="mt-1 text-xs text-muted">{balance.mode === 'derived' ? `Calcolato dai movimenti${balance.movementCount ? ` · ${balance.movementCount} contabilizzati` : ''}` : 'Saldo registrato'}{balance.stale ? ' · da verificare' : ''}</p></>; })()}
                  {account.currentBalanceAt && <p className="mt-1 text-sm text-muted">Aggiornato il {formatDate(account.currentBalanceAt)}</p>}
                  {account.ownAccountAliases.length > 0 && <p className="mt-2 break-words text-sm text-muted">Alias: {account.ownAccountAliases.join(', ')}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(account)} disabled={busy} className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60">Modifica</button>
                  <button type="button" onClick={() => void toggleActive(account)} disabled={busy} className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas disabled:opacity-60">{account.active ? 'Archivia conto' : 'Riattiva conto'}</button>
                  {account.canDelete && <button type="button" onClick={() => void removeEmptyAccount(account)} disabled={busy} className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas disabled:opacity-60">Elimina conto vuoto</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function getAccountSaveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Esiste già un conto')) return error.message;
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    const issuePaths = error.issues.flatMap((issue) =>
      issue && typeof issue === 'object' && 'path' in issue && Array.isArray(issue.path) ? issue.path : [],
    );
    if (issuePaths.includes('maskedIdentifier')) return 'Inserisci solo un identificativo mascherato, non un IBAN completo.';
    if (issuePaths.includes('currentBalanceAt')) return 'Controlla la data del saldo e riprova.';
    return 'Controlla i dati inseriti e riprova.';
  }
  return 'Non è stato possibile salvare il conto. Riprova.';
}
