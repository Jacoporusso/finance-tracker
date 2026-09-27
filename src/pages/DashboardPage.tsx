import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightIcon, ChartBarIcon, ChartPieIcon, WalletIcon } from '@heroicons/react/24/outline';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../db/database';
import { formatMoney } from '../domain/money';
import { formatDate } from '../domain/display';
import { todayInRome } from '../domain/dates';
import type { Transaction } from '../domain/transactions';
import DepositSetupPanel from '../transfers/DepositSetupPanel';
import { hasUntrackedIngDeposit, getLegacyDepositTransferReviewCandidates } from '../transfers/deposit';
import { matchMortgageInstallments, mortgageProgress } from '../domain/mortgage-matching';

const GREEN = 'var(--app-chart-income)';

export default function DashboardPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const legacyTransfers = useLiveQuery(getLegacyDepositTransferReviewCandidates, []);
  const [selectedMonth, setSelectedMonth] = useState('');
  const loading = accounts === undefined || liabilities === undefined || transactions === undefined || categories === undefined;
  const activeAccounts = (accounts ?? []).filter((account) => account.active);
  const unresolvedBalances = activeAccounts.filter((account) => account.currentBalanceCents === undefined);
  const depositMissing = hasUntrackedIngDeposit(accounts ?? [], transactions ?? []);
  const partialWealth = unresolvedBalances.length > 0 || depositMissing;
  const knownAssetsCents = activeAccounts.reduce((total, account) => total + (account.currentBalanceCents ?? 0), 0);
  const liabilitiesCents = (liabilities ?? []).reduce((total, liability) => {
    const matches = liability.mortgage ? matchMortgageInstallments(liability.mortgage, transactions ?? []) : [];
    const updated = (liability.mortgage ? mortgageProgress(liability.mortgage, matches).current?.residualCents : undefined) ?? liability.amountCents;
    return total + updated;
  }, 0);
  const netWorthCents = knownAssetsCents - liabilitiesCents;
  const cashTypes = new Set(['checking', 'savings', 'cash']);
  const investmentTypes = new Set(['broker']);
  const cashAccounts = activeAccounts.filter((account) => cashTypes.has(account.type));
  const investmentAccounts = activeAccounts.filter((account) => investmentTypes.has(account.type));
  const cashCents = cashAccounts.reduce((total, account) => total + (account.currentBalanceCents ?? 0), 0);
  const investmentsCents = investmentAccounts.reduce((total, account) => total + (account.currentBalanceCents ?? 0), 0);
  const currentMonth = todayInRome().slice(0, 7);
  const importedMonths = (transactions ?? []).map((transaction) => transaction.bookingDate.slice(0, 7));
  const availableMonths = [...new Set([currentMonth, ...importedMonths])].sort().reverse();
  const period = selectedMonth || currentMonth;
  const postedFlow = (transactions ?? []).filter((transaction) => transaction.status === 'posted' && isFlowTransaction(transaction));
  const periodTransactions = postedFlow.filter((transaction) => transaction.bookingDate.startsWith(period));
  const hasPeriodFlow = periodTransactions.length > 0;
  const monthIncome = periodTransactions.filter(isIncome).reduce((total, transaction) => total + transaction.amountCents, 0);
  const monthExpenses = periodTransactions.filter(isExpense).reduce((total, transaction) => total - transaction.amountCents, 0);
  const monthSavings = monthIncome - monthExpenses;
  const reviewCount = (transactions ?? []).filter((transaction) => Boolean(transaction.reviewReason)).length + (legacyTransfers ?? []).filter((transaction) => !transaction.reviewReason).length;

  const cashflow = buildMonthlyCashflow(postedFlow, period);
  const hasCashflow = cashflow.some((month) => month.count > 0);
  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const expenseCategories = periodTransactions.filter(isExpense).reduce<Record<string, number>>((totals, transaction) => {
    const name = transaction.appCategoryId ? categoryNames.get(transaction.appCategoryId) ?? 'Altra categoria' : transaction.sourceCategory ?? 'Senza categoria';
    totals[name] = (totals[name] ?? 0) - transaction.amountCents;
    return totals;
  }, {});
  const categoryData = Object.entries(expenseCategories).map(([name, cents]) => ({ name, euros: cents / 100 })).sort((a, b) => b.euros - a.euros).slice(0, 7).map((item, index) => ({ ...item, color: `var(--app-chart-category-${(index % 7) + 1})` }));
  const allocationData = activeAccounts.filter((account) => account.currentBalanceCents !== undefined).map((account, index) => ({ name: account.name, euros: (account.currentBalanceCents ?? 0) / 100, color: `var(--app-chart-account-${(index % 6) + 1})` }));

  return (
    <section className="min-w-0">

      {loading ? <p role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-sm text-muted">Caricamento riepilogo…</p> : (
        <>
          <section aria-label="Patrimonio e saldi" className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard title={partialWealth ? 'Patrimonio noto · parziale' : 'Patrimonio netto'} value={formatMoney(netWorthCents)} Icon={ChartBarIcon} prominent status={depositMissing ? 'Il deposito ING non è ancora registrato' : unresolvedBalances.length ? `${unresolvedBalances.length} ${unresolvedBalances.length === 1 ? 'conto attivo' : 'conti attivi'} senza saldo` : 'Basato sui saldi attivi e le passività registrate'} />
            <MetricCard title={depositMissing || unresolvedBalances.some((account) => cashTypes.has(account.type)) ? 'Liquidità · parziale' : 'Liquidità'} value={formatMoney(cashCents)} Icon={WalletIcon} status={cashAccounts.length ? `${cashAccounts.length} conti correnti, risparmio o contanti` : 'Nessun conto liquidità attivo'} />
            <MetricCard title={unresolvedBalances.some((account) => investmentTypes.has(account.type)) ? 'Investimenti · parziale' : 'Investimenti'} value={formatMoney(investmentsCents)} Icon={ChartPieIcon} status={investmentAccounts.length ? `${investmentAccounts.length} conti investimento` : 'Nessun conto investimento attivo'} />
            <MetricCard title="Passività registrate" value={formatMoney(-liabilitiesCents)} Icon={WalletIcon} status={`${(liabilities ?? []).length} ${(liabilities ?? []).length === 1 ? 'voce' : 'voci'}`} />
          </section>

          {unresolvedBalances.length > 0 && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">Il patrimonio è parziale: {unresolvedBalances.map((account) => account.name).join(', ')} {unresolvedBalances.length === 1 ? 'non ha' : 'non hanno'} un saldo aggiornato. Gli importi dei movimenti non vengono usati per stimare i saldi mancanti.</p>}

          <DepositSetupPanel />

          <section className="mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="monthly-summary">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="monthly-summary" className="text-lg font-semibold text-ink">Entrate e spese</h2><p className="text-sm text-muted">Solo movimenti contabilizzati. Trasferimenti esclusi.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="text-sm font-medium text-ink">Mese analizzato<select value={period} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink sm:w-auto">{availableMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label><Link to="/transactions" className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-3 text-sm font-semibold text-green hover:bg-green-soft">Movimenti <ArrowRightIcon className="size-4" aria-hidden="true" /></Link></div></div>
            {!hasPeriodFlow ? <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Nessun movimento contabilizzato nel mese selezionato.</p> : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniMetric label="Entrate" value={formatMoney(monthIncome)} />
                <MiniMetric label="Spese" value={formatMoney(monthExpenses)} />
                <MiniMetric label="Risparmio" value={formatMoney(monthSavings)} />
              </div>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="balance-dates">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="balance-dates" className="text-lg font-semibold text-ink">Saldi dei conti attivi</h2><p className="mt-1 text-sm text-muted">I saldi possono riferirsi a date diverse.</p></div><Link to="/accounts" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-green hover:bg-green-soft">Gestisci conti <ArrowRightIcon className="size-4" aria-hidden="true" /></Link></div>
            {activeAccounts.length === 0 ? <p className="mt-3 text-sm text-muted">Nessun conto attivo. Aggiungi un conto per iniziare.</p> : <ul className="mt-3 divide-y divide-line">{activeAccounts.map((account) => <li key={account.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"><span className="min-w-0 break-words text-sm font-medium text-ink">{account.name}</span><span className="ml-auto text-right"><span className="block text-sm font-semibold tabular-nums text-ink">{account.currentBalanceCents === undefined ? 'Saldo non indicato' : formatMoney(account.currentBalanceCents)}</span><span className="block text-sm text-muted">{account.currentBalanceAt ? `Al ${formatDate(account.currentBalanceAt)}` : 'Data saldo non indicata'}</span></span></li>)}</ul>}
          </section>

          <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
            <ChartPanel title="Flusso mensile" subtitle="Dati contabilizzati. I mesi senza flussi registrati restano vuoti; i periodi possono essere incompleti.">
              {hasCashflow ? <div className="h-64 min-w-0" role="img" aria-label="Grafico a barre delle entrate e spese mensili">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflow} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--app-line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--app-line)' }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(value: number) => compactEuro(value)} />
                    <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} contentStyle={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)', borderRadius: 12 }} />
                    <Bar dataKey="income" name="Entrate" fill={GREEN} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Spese" fill="var(--app-chart-expense)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div> : <ChartEmpty message="Il grafico apparirà dopo movimenti contabilizzati di entrata o spesa." />}
            </ChartPanel>

            <ChartPanel title="Spese per categoria" subtitle={`${monthLabel(period)} · spese e commissioni`}>
              {categoryData.length ? <div className="h-64 min-w-0" role="img" aria-label="Grafico delle spese per categoria">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                    <CartesianGrid stroke="var(--app-line)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--app-line)' }} tickLine={false} tickFormatter={(value: number) => compactEuro(value)} />
                    <YAxis type="category" dataKey="name" width={112} tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} contentStyle={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)', borderRadius: 12 }} />
                    <Bar dataKey="euros" name="Spese" radius={[0, 4, 4, 0]}>{categoryData.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div> : <ChartEmpty message="Non ci sono spese contabilizzate nel mese da mostrare per categoria." />}
            </ChartPanel>

            <ChartPanel title="Saldi per conto" subtitle="Saldi noti dei conti attivi">
              {allocationData.length ? <>
                {unresolvedBalances.length > 0 && <p className="mb-2 text-sm text-muted">Mostra solo i conti con saldo registrato.</p>}
                <div className="h-64 min-w-0" role="img" aria-label="Grafico dei saldi per conto">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={allocationData} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke="var(--app-line)" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--app-line)' }} tickLine={false} tickFormatter={(value: number) => compactEuro(value)} />
                      <YAxis type="category" dataKey="name" width={112} tick={{ fill: 'var(--app-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} contentStyle={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)', borderRadius: 12 }} />
                      <Bar dataKey="euros" name="Saldo" radius={[0, 4, 4, 0]}>{allocationData.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </> : <ChartEmpty message="Aggiungi i saldi dei tuoi conti per vedere la distribuzione." />}
            </ChartPanel>

            <ChartPanel title="Da verificare" subtitle="Movimenti che hanno bisogno di un controllo">
              <div className="flex min-h-48 flex-col items-start justify-center">
                <p className="text-4xl font-semibold tabular-nums text-ink">{reviewCount}</p>
                <p className="mt-1 text-sm text-muted">{reviewCount === 1 ? 'movimento da verificare' : 'movimenti da verificare'}</p>
                <Link to="/review" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-green hover:bg-green-soft">Apri la coda <ArrowRightIcon className="size-4" aria-hidden="true" /></Link>
              </div>
            </ChartPanel>
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({ title, value, status, Icon, prominent = false }: { title: string; value: string; status: string; Icon: typeof ChartBarIcon; prominent?: boolean }) {
  return <article className={`min-w-0 rounded-2xl border p-4 shadow-card sm:p-5 ${prominent ? 'col-span-2 border-transparent bg-hero text-on-hero xl:col-span-1' : 'border-line bg-surface text-ink'}`}>
    <div className="flex items-center justify-between gap-2"><h2 className={`text-sm font-medium ${prominent ? 'text-hero-muted' : 'text-muted'}`}>{title}</h2><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${prominent ? 'bg-on-hero/10 text-on-hero' : 'bg-green-soft text-green'}`}><Icon className="size-5" aria-hidden="true" /></span></div>
    <p className="mt-5 break-words text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</p>
    <p className={`mt-3 text-sm leading-relaxed ${prominent ? 'text-hero-muted' : 'text-muted'}`}>{status}</p>
  </article>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <article className="min-w-0 rounded-xl bg-canvas p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums text-ink">{value}</p></article>;
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"><h2 className="text-lg font-semibold text-ink">{title}</h2><p className="mt-1 text-sm text-muted">{subtitle}</p><div className="mt-3">{children}</div></section>;
}

function ChartEmpty({ message }: { message: string }) {
  return <p className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-muted">{message}</p>;
}

function isIncome(transaction: Transaction): boolean {
  return transaction.kind === 'income' || transaction.kind === 'interest';
}

function isExpense(transaction: Transaction): boolean {
  return transaction.kind === 'expense' || transaction.kind === 'fee';
}

function isFlowTransaction(transaction: Transaction): boolean {
  return isIncome(transaction) || isExpense(transaction);
}

function buildMonthlyCashflow(transactions: Transaction[], current: string) {
  const [year, month] = current.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { key, label: new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' }).format(date), incomeCents: 0, expenseCents: 0, count: 0 };
  });
  const byKey = new Map(months.map((entry) => [entry.key, entry]));
  for (const transaction of transactions) {
    const monthData = byKey.get(transaction.bookingDate.slice(0, 7));
    if (!monthData) continue;
    monthData.count++;
    if (isIncome(transaction)) monthData.incomeCents += transaction.amountCents;
    if (isExpense(transaction)) monthData.expenseCents -= transaction.amountCents;
  }
  return months.map(({ incomeCents, expenseCents, ...monthData }) => ({ ...monthData, income: monthData.count ? incomeCents / 100 : null, expenses: monthData.count ? expenseCents / 100 : null }));
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function compactEuro(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: Math.abs(value) >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(value);
}
