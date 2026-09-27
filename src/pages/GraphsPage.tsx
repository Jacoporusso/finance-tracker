import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../db/database';
import { formatMoney } from '../domain/money';
import { todayInRome } from '../domain/dates';
import type { Transaction } from '../domain/transactions';

export default function GraphsPage({ view }: { view: 'flows' | 'savings' }) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const years = useMemo(() => [...new Set((transactions ?? []).map((item) => item.bookingDate.slice(0, 4)))].sort().reverse(), [transactions]);
  const currentMonth = todayInRome().slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const year = years.includes(selectedYear) ? selectedYear : years[0] ?? currentYear;
  const data = useMemo(() => buildYearData(transactions ?? [], year), [transactions, year]);
  const hasData = data.some((month) => month.count > 0);
  const amount = (month: typeof data[number], cents: number) => month.count ? formatMoney(cents) : '—';
  const status = (month: typeof data[number]) => month.key > currentMonth ? 'Mese futuro' : month.count === 0 ? 'Nessun flusso registrato' : month.key === currentMonth ? 'Mese in corso' : `${month.count} movimenti`;

  return <section className="min-w-0">
    <label className="mb-4 block text-sm font-medium text-ink">Anno analizzato<select value={year} onChange={(event) => setSelectedYear(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base sm:w-auto">{(years.length ? years : [currentYear]).map((value) => <option key={value}>{value}</option>)}</select></label>
    <p className="mb-4 text-sm text-muted">Solo movimenti contabilizzati; trasferimenti interni e verso investimenti esclusi. I mesi senza flussi registrati sono lasciati vuoti. Gli import possono coprire solo parte del mese o dei conti.</p>
    {transactions === undefined && <p role="status" className="mb-4 text-sm text-muted">Caricamento dei movimenti…</p>}
    {view === 'flows' && <>
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="yearly-flow-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 id="yearly-flow-title" className="text-lg font-semibold text-ink">Andamento mensile</h2><p className="mt-1 text-sm text-muted">Importi contabilizzati, raggruppati per mese di registrazione.</p></div>
      </div>
      {!hasData ? <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Non ci sono movimenti di entrata o spesa contabilizzati per questo anno.</p> : <div className="mt-5 h-[22rem] min-w-0" role="img" aria-label={`Grafico mensile di entrate, spese e risparmio per ${year}`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--app-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--app-line)' }} tickLine={false} />
          <YAxis tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(value: number) => compactEuro(value)} />
          <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} contentStyle={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)', borderRadius: 12 }} />
          <Legend />
          <Bar dataKey="income" name="Entrate" fill="var(--app-chart-income)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" name="Spese" fill="var(--app-chart-expense)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
          <Bar dataKey="savings" name="Risparmio" fill="var(--app-chart-savings)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
        </BarChart></ResponsiveContainer>
      </div>}
    </section>
    </>}
    {view === 'savings' && <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="savings-trend-title">
      <div><h2 id="savings-trend-title" className="text-lg font-semibold text-ink">Risparmio mensile nel tempo</h2><p className="mt-1 text-sm text-muted">Entrate meno spese per ciascun mese. Sopra la linea dello zero hai risparmiato.</p></div>
      {!hasData ? <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Il grafico apparirà quando saranno disponibili movimenti contabilizzati.</p> : <div className="mt-5 h-[20rem] min-w-0" role="img" aria-label={`Andamento del risparmio mensile nel ${year}`}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--app-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--app-line)' }} tickLine={false} />
          <YAxis tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(value: number) => compactEuro(value)} />
          <ReferenceLine y={0} stroke="var(--app-muted)" strokeDasharray="4 4" />
          <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} contentStyle={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)', borderRadius: 12 }} />
          <Line type="linear" dataKey="savings" name="Risparmio" connectNulls={false} isAnimationActive={false} stroke="var(--app-chart-savings)" strokeWidth={3} dot={{ r: 4, fill: 'var(--app-chart-savings)' }} activeDot={{ r: 5 }} />
        </LineChart></ResponsiveContainer>
      </div>}
    </section>}
    <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface" aria-labelledby="monthly-table-title">
      <div className="border-b border-line p-4 sm:p-5"><h2 id="monthly-table-title" className="text-lg font-semibold text-ink">Riepilogo mensile</h2><p className="mt-1 text-sm text-muted">Il risparmio è calcolato come entrate meno spese.</p></div>
      <ul className="divide-y divide-line px-4 sm:hidden">{data.map((month) => <li key={month.key} className="py-3"><h3 className="font-semibold capitalize">{month.label}</h3><p className="text-xs text-muted">{status(month)}</p><dl className="mt-2 space-y-1 text-sm">{[['Entrate', month.incomeCents], ['Spese', month.expenseCents], ['Risparmio', month.incomeCents - month.expenseCents]].map(([label, cents]) => <div key={label} className="flex justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-medium tabular-nums">{amount(month, Number(cents))}</dd></div>)}</dl></li>)}</ul>
      <div className="hidden sm:block"><table className="w-full text-sm"><thead className="bg-canvas text-left text-muted"><tr><th className="px-3 py-3 font-medium">Mese</th><th className="px-3 py-3 text-right font-medium">Entrate</th><th className="px-3 py-3 text-right font-medium">Spese</th><th className="px-3 py-3 text-right font-medium">Risparmio</th></tr></thead><tbody className="divide-y divide-line">{data.map((month) => <tr key={month.key}><th className="px-3 py-3 text-left font-medium text-ink">{month.label}<span className="block text-xs font-normal text-muted">{status(month)}</span></th><td className="px-3 py-3 text-right tabular-nums text-ink">{amount(month, month.incomeCents)}</td><td className="px-3 py-3 text-right tabular-nums text-ink">{amount(month, month.expenseCents)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{amount(month, month.incomeCents - month.expenseCents)}</td></tr>)}</tbody></table></div>
    </section>
  </section>;
}

function buildYearData(transactions: Transaction[], year: string) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return { key: `${year}-${month}`, label: new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(year), index, 1))), incomeCents: 0, expenseCents: 0, count: 0 };
  });
  const byKey = new Map(months.map((month) => [month.key, month]));
  for (const transaction of transactions) {
    if (transaction.status !== 'posted') continue;
    const month = byKey.get(transaction.bookingDate.slice(0, 7));
    if (!month) continue;
    if (transaction.kind === 'income' || transaction.kind === 'interest') { month.incomeCents += transaction.amountCents; month.count++; }
    if (transaction.kind === 'expense' || transaction.kind === 'fee') { month.expenseCents -= transaction.amountCents; month.count++; }
  }
  return months.map((month) => ({ ...month, income: month.count ? month.incomeCents / 100 : null, expenses: month.count ? month.expenseCents / 100 : null, savings: month.count ? (month.incomeCents - month.expenseCents) / 100 : null }));
}

function compactEuro(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: Math.abs(value) >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(value);
}
