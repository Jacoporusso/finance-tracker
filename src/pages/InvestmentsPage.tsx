import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatMoney, parseMoneyToCents } from '../domain/money';
import { formatDate } from '../domain/display';
import { todayInRome } from '../domain/dates';
import PageHeader from '../components/PageHeader';
import DatePicker from '../components/DatePicker';

export default function InvestmentsPage() {
  const accounts = useLiveQuery(() => db.accounts.where('type').equals('broker').toArray(), []);
  const valuations = useLiveQuery(() => db.investmentValuations.orderBy('date').reverse().toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayInRome());
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!accountId) return setError('Seleziona un conto investimento.');
    let valueCents: number; try { valueCents = parseMoneyToCents(value); } catch { return setError('Inserisci un valore valido.'); }
    if (valueCents < 0) return setError('Il valore non può essere negativo.');
    await db.investmentValuations.put({ id: `${accountId}:${date}`, accountId, date, valueCents, source: 'manual', note: note.trim() || undefined, createdAt: new Date().toISOString() });
    setValue(''); setNote('');
  }
  const latest = accounts?.map((account) => valuations?.find((item) => item.accountId === account.id)).filter(Boolean) ?? [];
  const contributions = (transactions ?? []).filter((tx) => tx.kind === 'investment_transfer' && tx.status === 'posted' && tx.amountCents > 0).reduce((sum, tx) => sum + tx.amountCents, 0);
  return <section className="min-w-0"><PageHeader title="Investimenti" description="Registra il valore del portafoglio nel tempo. Gli investimenti restano separati dalle spese di consumo." /><div className="grid gap-3 sm:grid-cols-2"><article className="rounded-2xl border border-line bg-surface p-4 shadow-card"><p className="text-sm text-muted">Valore più recente</p><p className="mt-2 text-2xl font-bold tabular-nums">{formatMoney(latest.reduce((sum, item) => sum + (item?.valueCents ?? 0), 0))}</p></article><article className="rounded-2xl border border-line bg-surface p-4 shadow-card"><p className="text-sm text-muted">Versamenti riconosciuti</p><p className="mt-2 text-2xl font-bold tabular-nums">{formatMoney(contributions)}</p></article></div><form onSubmit={(event) => void save(event)} className="mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-5"><h2 className="text-lg font-semibold">Nuova valorizzazione</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Conto investimento<select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base"><option value="">Seleziona</option>{(accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="text-sm font-medium">Data<DatePicker className="mt-1.5" required label="Data valorizzazione" max={todayInRome()} value={date} onChange={setDate} /></label><label className="text-sm font-medium">Valore totale (EUR)<input required inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base" placeholder="Es. 12500,00" /></label><label className="text-sm font-medium">Nota<input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base" placeholder="Es. estratto mensile" /></label></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button type="submit" className="mt-4 min-h-11 rounded-xl bg-green px-4 font-semibold text-on-green">Salva valore</button></form><section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface"><div className="border-b border-line p-4"><h2 className="text-lg font-semibold">Storico valorizzazioni</h2></div>{!valuations?.length ? <p className="p-6 text-sm text-muted">Inserisci il primo valore per iniziare lo storico.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Conto</th><th className="px-4 py-3 text-right">Valore</th><th className="px-4 py-3">Nota</th></tr></thead><tbody className="divide-y divide-line">{valuations.map((item) => <tr key={item.id}><td className="px-4 py-3">{formatDate(item.date)}</td><td className="px-4 py-3">{accounts?.find((account) => account.id === item.accountId)?.name ?? 'Conto non disponibile'}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(item.valueCents)}</td><td className="px-4 py-3 text-muted">{item.note ?? '—'}</td></tr>)}</tbody></table></div>}</section></section>;
}
