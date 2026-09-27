import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { saveAccount } from '../db/repository';
import { formatMoney, parseMoneyToCents } from '../domain/money';
import { formatDate } from '../domain/display';
import DatePicker from '../components/DatePicker';
import { todayInRome } from '../domain/dates';
import { confirmDepositTransfers, getDepositTransferCandidates, isIngDepositTransfer } from './deposit';

const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-line bg-canvas px-3 text-base';

export default function DepositSetupPanel() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const candidates = useLiveQuery(getDepositTransferCandidates, []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('ING deposito');
  const [balance, setBalance] = useState('');
  const [balanceDate, setBalanceDate] = useState(todayInRome());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const locked = useRef(false);
  if (!accounts || !candidates || !transactions) return null;

  const savings = accounts.filter((account) => account.active && account.institution === 'ING' && account.type === 'savings');
  const recognized = transactions.filter((transaction) => transaction.status !== 'cancelled' && isIngDepositTransfer(transaction)
    && (transaction.kindSource !== 'manual' || transaction.kind === 'internal_transfer'));
  const needsBalance = recognized.length > 0 && (savings.length === 0 || savings.some((account) => account.currentBalanceCents === undefined));
  if (!candidates.length && !needsBalance && !open && !success) return null;

  function chooseAccount(id: string) {
    setAccountId(id);
    const selected = savings.find((account) => account.id === id);
    setName(selected?.name ?? 'ING deposito');
    setBalance(selected?.currentBalanceCents === undefined ? '' : new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(selected.currentBalanceCents / 100));
    setBalanceDate(selected?.currentBalanceAt ?? todayInRome());
    setError('');
  }

  function showForm() {
    chooseAccount(savings.length === 1 ? savings[0].id : '');
    setOpen(true); setSuccess('');
  }

  async function correctOnly() {
    if (locked.current || !candidates?.length) return;
    locked.current = true; setBusy(true); setError('');
    try {
      await confirmDepositTransfers(candidates.map((transaction) => transaction.id));
      setSuccess('Giroconti corretti: sono esclusi da entrate e spese. Aggiungi il saldo del deposito per completare il patrimonio.');
    } catch { setError('I movimenti sono cambiati. Riapri il riepilogo e riprova.'); }
    finally { locked.current = false; setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !accounts || !candidates) return;
    let cents: number;
    try { cents = parseMoneyToCents(balance); }
    catch { setError('Inserisci il saldo effettivo del deposito, ad esempio 1250,00.'); return; }
    if (cents < 0) { setError('Il saldo del deposito non può essere negativo.'); return; }
    if (!name.trim() || !balanceDate || balanceDate > todayInRome()) { setError('Controlla il nome e la data del saldo.'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      await db.transaction('rw', db.accounts, db.transactions, async () => {
        const existing = accountId ? await db.accounts.get(accountId) : undefined;
        if (accountId && (!existing || !existing.active || existing.institution !== 'ING' || existing.type !== 'savings')) throw new Error('Conto cambiato');
        await saveAccount({ name: name.trim(), institution: 'ING', type: 'savings', currency: 'EUR', ownAccountAliases: existing?.ownAccountAliases ?? [], currentBalanceCents: cents, currentBalanceAt: balanceDate }, accountId || undefined);
        await confirmDepositTransfers(candidates.map((transaction) => transaction.id));
      });
      setOpen(false);
      setSuccess('Deposito salvato nel patrimonio. I giroconti riconosciuti sono esclusi da entrate e spese.');
    } catch { setError('Salvataggio non riuscito. Verifica che non esista già un deposito con questo nome e che i movimenti non siano stati modificati. Nessuna modifica parziale è stata salvata.'); }
    finally { locked.current = false; setBusy(false); }
  }

  return <section className="mt-4 min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="Deposito ING">
    <h2 className="text-lg font-semibold">Deposito ING e giroconti</h2>
    <p className="mt-2 text-sm text-muted">I giroconti tra Conto Corrente Arancio e Conto Arancio spostano denaro tra tuoi conti. Il saldo del deposito va aggiunto separatamente al patrimonio.</p>
    {needsBalance && <p className="mt-2 text-sm font-medium">Manca il saldo del deposito: il patrimonio mostrato è parziale.</p>}
    {candidates.length > 0 && <>
      <p className="mt-3 text-sm">{candidates.length} giroconti già importati da correggere. Categorie e note manuali vengono conservate.</p>
      <details className="mt-2 rounded-xl border border-line p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Vedi movimenti da correggere</summary><ul className="divide-y divide-line">{candidates.map((transaction) => <li key={transaction.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{formatDate(transaction.bookingDate)}</span><strong>{formatMoney(transaction.amountCents)}</strong></div><p className="mt-1 break-words [overflow-wrap:anywhere]">{transaction.rawDescription || transaction.sourceOperation}</p></li>)}</ul></details>
    </>}
    {success && <p role="status" className="mt-3 rounded-xl bg-green-soft p-3 text-sm text-green">{success}</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!open ? <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={showForm} className="min-h-11 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-50">Imposta saldo deposito</button>
      {candidates.length > 0 && <button type="button" disabled={busy} onClick={() => void correctOnly()} className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">Correggi solo i giroconti</button>}
      <Link to="/accounts" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-green">Gestisci conti</Link>
    </div> : <form onSubmit={(event) => void save(event)} className="mt-4 border-t border-line pt-4">
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium sm:col-span-2">Conto deposito<select aria-label="Conto deposito ING" value={accountId} onChange={(event) => chooseAccount(event.target.value)} className={inputClass}><option value="">Crea un nuovo conto deposito ING</option>{savings.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="min-w-0 text-sm font-medium sm:col-span-2">Nome conto<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
        <label className="min-w-0 text-sm font-medium">Saldo effettivo del deposito (EUR)<input required aria-label="Saldo deposito" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} className={inputClass} placeholder="Saldo da home banking" /></label>
        <label className="min-w-0 text-sm font-medium">Data del saldo<DatePicker className="mt-1.5" required label="Data saldo deposito" value={balanceDate} max={todayInRome()} onChange={setBalanceDate} /></label>
      </fieldset>
      <p className="mt-3 text-sm text-muted">Inserisci il saldo attuale del deposito, inclusi eventuali interessi o prelievi. La somma dei giroconti di un singolo export può non rappresentare il saldo completo.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-50">{busy ? 'Salvataggio…' : 'Salva deposito e correggi giroconti'}</button><button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">Annulla</button></div>
    </form>}
  </section>;
}
