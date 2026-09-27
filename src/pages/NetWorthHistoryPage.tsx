import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { todayInRome } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { calculateNetWorth } from '../domain/net-worth';
import PageHeader from '../components/PageHeader';

export default function NetWorthHistoryPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.orderBy('date').reverse().toArray(), []);
  const loading = accounts === undefined || liabilities === undefined || transactions === undefined || snapshots === undefined;
  async function saveSnapshot() {
    if (!accounts || !liabilities || !transactions) return;
    const date = todayInRome();
    const value = calculateNetWorth(accounts, liabilities, transactions, date);
    await db.netWorthSnapshots.put({ id: date, date, ...value, source: 'derived', createdAt: new Date().toISOString() });
  }
  return <section className="min-w-0"><PageHeader title="Storico patrimonio" description="Conserva istantanee datate di liquidità, investimenti e passività per seguire l’evoluzione reale del patrimonio." /><div className="mb-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void saveSnapshot()} className="min-h-11 rounded-xl bg-green px-4 font-semibold text-on-green">Salva snapshot di oggi</button><p className="text-sm text-muted">Una snapshot al giorno, aggiornabile.</p></div>{loading ? <p role="status" className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">Caricamento storico…</p> : snapshots.length === 0 ? <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">Nessuna snapshot salvata. Salva il primo punto di riferimento.</p> : <div className="overflow-hidden rounded-2xl border border-line bg-surface"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3 text-right">Liquidità</th><th className="px-4 py-3 text-right">Investimenti</th><th className="px-4 py-3 text-right">Passività</th><th className="px-4 py-3 text-right">Patrimonio netto</th><th className="px-4 py-3">Completezza</th></tr></thead><tbody className="divide-y divide-line">{snapshots.map((item) => <tr key={item.id}><th className="px-4 py-3 text-left font-medium">{item.date}</th><td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.cashCents)}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.investmentsCents)}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(-item.liabilitiesCents)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(item.netWorthCents)}</td><td className="px-4 py-3">{item.completeness === 'complete' ? 'Completa' : 'Parziale'}</td></tr>)}</tbody></table></div></div>}</section>;
}
