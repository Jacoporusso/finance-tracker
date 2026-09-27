import { Fragment, useMemo, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import PageHeader from '../components/PageHeader';
import { formatDate } from '../domain/display';
import DatePicker from '../components/DatePicker';
import TransactionCard from '../dashboard/TransactionCard';
import TransactionKindChip from '../components/TransactionKindChip';
import { transactionKinds, transactionStatuses } from '../dashboard/transactionOptions';

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const transactions = useLiveQuery(() => db.transactions.orderBy('bookingDate').reverse().toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('search') ?? '';
  const accountId = searchParams.get('account') ?? '';
  const kind = searchParams.get('kind') ?? '';
  const categoryId = searchParams.get('category') ?? '';
  const status = searchParams.get('status') ?? '';
  const dateFrom = searchParams.get('from') ?? '';
  const dateTo = searchParams.get('to') ?? '';
  const setFilter = (key: string, value: string) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  const setAccountId = (value: string) => setFilter('account', value);
  const setKind = (value: string) => setFilter('kind', value);
  const setCategoryId = (value: string) => setFilter('category', value);
  const setStatus = (value: string) => setFilter('status', value);
  const setDateFrom = (value: string) => setFilter('from', value);
  const setDateTo = (value: string) => setFilter('to', value);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase('it-IT');
    const accountNames = new Map((accounts ?? []).map((account) => [account.id, account.name]));
    return transactions.filter((transaction) => {
      if (accountId && transaction.accountId !== accountId) return false;
      if (kind && transaction.kind !== kind) return false;
      if (status && transaction.status !== status) return false;
      if (dateFrom && transaction.bookingDate < dateFrom) return false;
      if (dateTo && transaction.bookingDate > dateTo) return false;
      if (categoryId === 'none' && transaction.appCategoryId) return false;
      if (categoryId && categoryId !== 'none' && transaction.appCategoryId !== categoryId) return false;
      if (normalizedQuery) {
        const searchable = [transaction.rawDescription, transaction.sourceOperation, transaction.sourceCategory, transaction.userNote, accountNames.get(transaction.accountId)]
          .filter(Boolean).join(' ').toLocaleLowerCase('it-IT');
        if (!searchable.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [transactions, accounts, query, accountId, kind, categoryId, status, dateFrom, dateTo]);

  function updateSearch(value: string) {
    setVisibleCount(PAGE_SIZE);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }

  function resetVisibleCount() {
    setVisibleCount(PAGE_SIZE);
  }

  const loading = transactions === undefined || accounts === undefined || categories === undefined;
  const visible = filtered.slice(0, visibleCount);
  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account]));
  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category.name]));

  return (
    <section className="min-w-0">
      <PageHeader title="Movimenti" description="Cerca e organizza le operazioni importate dai tuoi estratti conto." />

      <details open className="min-w-0 max-w-full rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-ink">Filtri e ricerca</summary>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="min-w-0 text-sm font-medium text-ink sm:col-span-2 xl:col-span-1">Cerca
            <input type="search" value={query} onChange={(event) => updateSearch(event.target.value)} className="mt-1.5 min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink" placeholder="Descrizione, nota, conto…" />
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">Conto
            <select value={accountId} onChange={(event) => { setAccountId(event.target.value); resetVisibleCount(); }} className="mt-1.5 min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink">
              <option value="">Tutti i conti</option>
              {(accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}{account.active ? '' : ' (archiviato)'}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">Tipo
            <select value={kind} onChange={(event) => { setKind(event.target.value); resetVisibleCount(); }} className="mt-1.5 min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink">
              <option value="">Tutti i tipi</option>
              {transactionKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">Categoria
            <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); resetVisibleCount(); }} className="mt-1.5 min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink">
              <option value="">Tutte le categorie</option>
              <option value="none">Senza categoria</option>
              {(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">Stato
            <select value={status} onChange={(event) => { setStatus(event.target.value); resetVisibleCount(); }} className="mt-1.5 min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink">
              <option value="">Tutti gli stati</option>
              {transactionStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">Dal
            <DatePicker className="mt-1.5" label="Data iniziale" value={dateFrom} max={dateTo || undefined} onChange={(value) => { setDateFrom(value); resetVisibleCount(); }} />
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">Al
            <DatePicker className="mt-1.5" label="Data finale" value={dateTo} min={dateFrom || undefined} onChange={(value) => { setDateTo(value); resetVisibleCount(); }} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>{loading ? 'Caricamento movimenti…' : `${filtered.length} ${filtered.length === 1 ? 'movimento' : 'movimenti'}`}</span>
          <Link to="/import" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-green hover:bg-green-soft">Importa movimenti</Link>
        </div>
      </details>

      <section aria-label="Elenco movimenti" className="mt-4">
        {loading ? <p role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-sm text-muted">Lettura dei dati locali…</p> : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center">
            <h2 className="text-lg font-semibold text-ink">Nessun movimento trovato</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">Importa un estratto conto o modifica i filtri per vedere i movimenti.</p>
            <Link to="/import" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-green px-4 py-2 text-sm font-semibold text-on-green">Vai all’import</Link>
          </div>
        ) : (
          <>
            <ul className="grid min-w-0 gap-3 md:hidden">
              {visible.map((transaction) => <li key={transaction.id} className="min-w-0 rounded-2xl border border-line bg-surface">
                <button type="button" aria-expanded={selectedId === transaction.id} aria-controls={`movement-mobile-${transaction.id}`} onClick={() => setSelectedId(selectedId === transaction.id ? null : transaction.id)} className="block min-h-11 w-full min-w-0 rounded-2xl p-4 text-left hover:bg-canvas">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted">{formatDate(transaction.bookingDate)}</span><span className="font-semibold tabular-nums">{formatAmount(transaction.amountCents)}</span></span>
                  <span className="mt-2 block break-words font-semibold [overflow-wrap:anywhere]">{transaction.sourceOperation || 'Movimento'}</span>
                  <span className="mt-1 block break-words text-sm text-muted [overflow-wrap:anywhere]">{transaction.rawDescription || 'Descrizione non disponibile'}</span>
                  <span className="mt-2 block text-sm text-muted">{accountMap.get(transaction.accountId)?.name} · {transaction.status === 'posted' ? 'Contabilizzato' : transaction.status === 'pending' ? 'In attesa' : 'Annullato'}</span>
                  <span className="mt-3 flex items-center justify-between gap-2"><TransactionKindChip kind={transaction.kind} /><span className="inline-flex items-center gap-1 text-sm font-semibold text-green">{selectedId === transaction.id ? 'Chiudi' : 'Dettagli'}<ChevronDownIcon aria-hidden="true" className={`size-4 ${selectedId === transaction.id ? 'rotate-180' : ''}`} /></span></span>
                </button>
                <div id={`movement-mobile-${transaction.id}`} hidden={selectedId !== transaction.id}>{selectedId === transaction.id && <TransactionCard transaction={transaction} accounts={accounts ?? []} categories={categories ?? []} />}</div>
              </li>)}
            </ul>
            <div className="relative hidden w-full min-w-0 max-w-full overflow-x-auto rounded-2xl border border-line bg-surface md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-line bg-canvas text-muted"><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Descrizione</th><th className="px-4 py-3 font-medium">Conto</th><th className="px-4 py-3 font-medium">Tipo / stato</th><th className="px-4 py-3 font-medium">Categoria</th><th className="px-4 py-3 text-right font-medium">Importo</th><th className="px-4 py-3"><span className="sr-only">Dettaglio</span></th></tr></thead>
                <tbody>{visible.map((transaction) => <Fragment key={transaction.id}><tr className="border-b border-line last:border-0" data-transaction-id={transaction.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(transaction.bookingDate)}</td>
                  <td className="max-w-80 px-4 py-3"><p className="break-words font-medium text-ink">{transaction.sourceOperation || transaction.rawDescription || 'Movimento senza descrizione'}</p>{transaction.sourceOperation && transaction.rawDescription && transaction.sourceOperation !== transaction.rawDescription && <p className="mt-1 break-words text-xs leading-relaxed text-muted">{transaction.rawDescription}</p>}{transaction.reviewReason && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Da verificare</span>}</td>
                  <td className="max-w-40 truncate px-4 py-3 text-muted">{accountMap.get(transaction.accountId)?.name ?? 'Conto non disponibile'}</td>
                  <td className="whitespace-nowrap px-4 py-3"><TransactionKindChip kind={transaction.kind} /><span className="mt-1 block text-muted">{transaction.status === 'posted' ? 'Contabilizzato' : transaction.status === 'pending' ? 'In attesa' : 'Annullato'}</span></td>
                  <td className="max-w-40 truncate px-4 py-3 text-muted">{categoryMap.get(transaction.appCategoryId ?? '') ?? transaction.sourceCategory ?? 'Senza categoria'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatAmount(transaction.amountCents)}</td>
                  <td className="px-4 py-3"><button type="button" aria-expanded={selectedId === transaction.id} aria-controls={`movement-desktop-${transaction.id}`} onClick={() => setSelectedId(selectedId === transaction.id ? null : transaction.id)} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-lg px-3 font-semibold text-green hover:bg-green-soft">{selectedId === transaction.id ? 'Chiudi' : 'Apri'}<ChevronDownIcon aria-hidden="true" className={`size-4 ${selectedId === transaction.id ? 'rotate-180' : ''}`} /></button></td>
                </tr><tr id={`movement-desktop-${transaction.id}`} hidden={selectedId !== transaction.id} className="border-b border-line bg-canvas"><td colSpan={7} className="p-3">{selectedId === transaction.id && <TransactionCard transaction={transaction} accounts={accounts ?? []} categories={categories ?? []} />}</td></tr></Fragment>)}</tbody>
              </table>
            </div>
            {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mt-4 min-h-11 w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink">Mostra altri {Math.min(PAGE_SIZE, filtered.length - visibleCount)} movimenti</button>}
            {filtered.length <= visibleCount && filtered.length > PAGE_SIZE && <p className="mt-3 text-center text-sm text-muted">Tutti i {filtered.length} movimenti corrispondenti sono visibili.</p>}
          </>
        )}
      </section>
    </section>
  );
}

function formatAmount(cents: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
