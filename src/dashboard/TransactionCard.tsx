import { useState, type FormEvent } from 'react';
import { updateTransaction } from '../import/core/engine';
import type { Account, Category } from '../domain/models';
import type { Transaction, TransactionKind } from '../domain/transactions';
import { formatMoney } from '../domain/money';
import { formatDate } from '../domain/display';
import { importReason } from '../import/messages';
import { transactionKinds } from './transactionOptions';
import TransactionKindChip from '../components/TransactionKindChip';

interface TransactionCardProps {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
}

export default function TransactionCard({ transaction, accounts, categories }: TransactionCardProps) {
  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(transaction.appCategoryId ?? '');
  const [kind, setKind] = useState<TransactionKind>(transaction.kind);
  const [note, setNote] = useState(transaction.userNote ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const account = accounts.find((item) => item.id === transaction.accountId);
  const category = categories.find((item) => item.id === transaction.appCategoryId);

  function beginEdit() {
    setCategoryId(transaction.appCategoryId ?? '');
    setKind(transaction.kind);
    setNote(transaction.userNote ?? '');
    setError('');
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const patch: { appCategoryId?: string; kind?: TransactionKind; userNote?: string } = {};
      if (categoryId !== (transaction.appCategoryId ?? '')) patch.appCategoryId = categoryId || undefined;
      if (kind !== transaction.kind || transaction.reviewReason === 'possible-transfer') patch.kind = kind;
      if (note.trim() !== (transaction.userNote ?? '')) patch.userNote = note.trim() || undefined;
      if (Object.keys(patch).length) await updateTransaction(transaction.id, patch);
      setEditing(false);
    } catch {
      setError('Modifica non salvata. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted">{formatDate(transaction.bookingDate)} · {account?.name ?? 'Conto non disponibile'}</p>
          <h3 className="mt-1 break-words text-base font-semibold text-ink">{transaction.sourceOperation || transaction.rawDescription || 'Movimento senza descrizione'}</h3>
          {transaction.sourceOperation && transaction.rawDescription && transaction.sourceOperation !== transaction.rawDescription && <p className="mt-1 break-words text-sm text-muted">{transaction.rawDescription}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TransactionKindChip kind={transaction.kind} />
            <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${transaction.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-canvas text-muted'}`}>
              {transaction.status === 'posted' ? 'Contabilizzato' : transaction.status === 'pending' ? 'In attesa' : 'Annullato'}
            </span>
            <span className="rounded-full bg-canvas px-2.5 py-1 text-sm text-muted">{category?.name ?? transaction.sourceCategory ?? 'Senza categoria'}</span>
            {transaction.reviewReason && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-900">Da verificare</span>}
          </div>
        </div>
        <p className={`shrink-0 text-xl font-semibold tabular-nums ${transaction.amountCents < 0 ? 'text-ink' : 'text-green'}`}>{formatMoney(transaction.amountCents)}</p>
      </div>

      {transaction.reviewReason && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{importReason(transaction.reviewReason)}</p>}
      {transaction.userNote && !editing && <p className="mt-3 break-words text-sm text-muted">Nota: {transaction.userNote}</p>}

      {editing ? (
        <form onSubmit={save} className="mt-4 border-t border-line pt-4">
          {transaction.reviewReason === 'possible-transfer' && <p className="mb-3 text-sm text-muted">Salvando confermi il tipo selezionato e chiudi questa verifica. Controlla anche il movimento sull’altro conto.</p>}
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink">Categoria
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink">
                <option value="">Senza categoria</option>
                {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Tipo movimento
              <select value={kind} onChange={(event) => setKind(event.target.value as TransactionKind)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink">
                {transactionKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2">Nota personale
              <textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink" placeholder="Aggiungi una nota facoltativa" />
            </label>
          </fieldset>
          {error && <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-60">{busy ? 'Salvataggio…' : 'Salva modifiche'}</button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">Annulla</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={beginEdit} className="mt-3 min-h-11 rounded-lg px-3 text-sm font-semibold text-green hover:bg-green-soft">Modifica categoria, tipo o nota</button>
      )}
    </article>
  );
}
