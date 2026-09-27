import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Liability } from '../domain/transactions';
import { formatMoney } from '../domain/money';
import { formatDate } from '../domain/display';
import { liabilityProgress } from '../domain/mortgage-matching';
import { mortgageSchema } from '../domain/mortgage-validation';
import PageHeader from '../components/PageHeader';

type LiabilityLoad = Liability | null | { loadError: true };

export default function LiabilityDetailPage() {
  const { liabilityId } = useParams();
  const liabilityResult = useLiveQuery<LiabilityLoad>(async () => {
    if (!liabilityId) return null;
    try { return (await db.liabilities.get(liabilityId)) ?? null; } catch { return { loadError: true }; }
  }, [liabilityId]);
  const transactions = useLiveQuery(async () => {
    try { return await db.transactions.toArray(); } catch { return []; }
  }, []);

  if (liabilityResult === undefined) return <p role="status" className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">Caricamento passività…</p>;
  if (isLoadError(liabilityResult)) return <section><PageHeader title="Passività non disponibile" description="Non è stato possibile leggere il debito dal database locale." /><Link to="/liabilities" className="text-green">Torna alle passività</Link></section>;
  if (!liabilityResult) return <section><PageHeader title="Passività non trovata" description="Il debito richiesto non è disponibile." /><Link to="/liabilities" className="text-green">Torna alle passività</Link></section>;

  const liability = liabilityResult;
  if (!Number.isSafeInteger(liability.amountCents) || liability.amountCents <= 0 || !isValidDate(liability.asOf) || typeof liability.name !== 'string') {
    return <section><PageHeader title="Passività non valida" description="I dati salvati per questo debito non sono validi." /><Link to="/liabilities" className="text-green">Torna alle passività</Link></section>;
  }
  const parsedPlan = liability.mortgage === undefined ? undefined : mortgageSchema.safeParse(liability.mortgage);
  const plan = parsedPlan?.success ? parsedPlan.data : undefined;
  const safeLiability: Liability = { ...liability, mortgage: plan };
  const progress = liabilityProgress(safeLiability, transactions ?? []);
  const matched = new Set(progress.matches.map((match) => match.installment.number));
  const next = plan?.installments.find((item) => !progress.paidNumbers?.has(item.number));
  const warnings = [...new Set(progress.warnings)];
  if (plan && plan.parserVersion !== 2) warnings.push('Questo piano usa un vecchio parser: ricarica il file Excel per riattivare e verificare gli abbinamenti automatici.');

  return <section className="min-w-0">
    <PageHeader title={liability.name} description="Dettaglio del finanziamento e del piano di ammortamento." />
    <div className="mb-5 flex flex-wrap gap-2"><Link to="/liabilities" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-ink">Torna alle passività</Link></div>
    {parsedPlan && !parsedPlan.success && <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">Il piano salvato non supera i controlli di validità e non può essere mostrato. Modifica la passività e ricarica il file Excel.</p>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Capitale residuo" value={formatMoney(-progress.residualCents)} note={`Riferimento al ${formatDate(progress.asOf)}`} />
      <Kpi label="Rate pagate" value={plan ? `${progress.paidCount ?? 0} / ${plan.installments.length}` : '—'} />
      <Kpi label="Rate residue" value={plan ? String(progress.remaining ?? plan.installments.length) : '—'} />
      <Kpi label="Prossima rata" value={next ? `${formatDate(next.dueDate)} · ${formatMoney(-next.installmentCents)}` : '—'} />
    </section>
    <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-muted">Il capitale residuo inserito e la relativa data sono il riferimento autorevole. I pagamenti abbinati successivi aggiornano il saldo; per correggere il riferimento, modifica la passività.</p>
    {warnings.length > 0 && <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><h2 className="font-semibold">Avvisi del piano e dei movimenti</h2><ul className="mt-2 max-h-56 list-disc space-y-1 overflow-auto pl-5">{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></section>}
    <section className="mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Informazioni finanziamento</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Importo iniziale" value={plan?.originalAmountCents !== undefined ? formatMoney(plan.originalAmountCents) : 'Non indicato'} />
        <Info label="Debito residuo nel piano" value={plan?.debtResidualCents !== undefined ? formatMoney(plan.debtResidualCents) : 'Non indicato'} />
        <Info label="Data di riferimento" value={formatDate(liability.asOf)} />
        <Info label="Conto addebito" value={plan?.accountLabel ?? 'Non indicato'} />
        <Info label="Numero finanziamento" value={plan?.contractNumber ?? 'Non indicato'} />
        <Info label="Rata prevista" value={next ? formatMoney(-next.installmentCents) : '—'} />
        <Info label="Interessi prossima rata" value={next ? formatMoney(-next.interestCents) : '—'} />
      </dl>
    </section>
    {plan ? <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-4 sm:p-5"><h2 className="text-lg font-semibold">Piano di ammortamento</h2><p className="mt-1 break-words text-sm text-muted">{plan.scheduleFileName} · {progress.paidCount ?? 0} rate pagate · {progress.matches.length} movimenti abbinati all’import.</p></div>
      <div className="max-h-[65dvh] overflow-auto p-3 sm:hidden" aria-label="Rate del piano">
        <ol className="space-y-3">{plan.installments.map((item) => <li key={item.number} className={`rounded-xl border border-line p-3 ${matched.has(item.number) ? 'bg-green-soft/40' : 'bg-canvas'}`}>
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">Rata {item.number}</h3><p className="mt-1 text-sm text-muted">Scadenza {formatDate(item.dueDate)}</p></div><span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink">{installmentStatus(item, matched.has(item.number))}</span></div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm"><Info label="Capitale" value={formatMoney(-item.principalCents)} /><Info label="Interessi" value={formatMoney(-item.interestCents)} /><Info label="Rata" value={formatMoney(-item.installmentCents)} /><Info label="Residuo" value={formatMoney(-item.residualCents)} /></dl>
        </li>)}</ol>
      </div>
      <div className="hidden max-h-[65dvh] overflow-auto sm:block"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-canvas text-left text-muted"><tr><th className="px-3 py-3">Rata</th><th className="px-3 py-3">Scadenza</th><th className="px-3 py-3">Stato</th><th className="px-3 py-3 text-right">Capitale</th><th className="px-3 py-3 text-right">Interessi</th><th className="px-3 py-3 text-right">Rata</th><th className="px-3 py-3 text-right">Residuo</th></tr></thead><tbody className="divide-y divide-line">{plan.installments.map((item) => <tr key={item.number} className={matched.has(item.number) ? 'bg-green-soft/40' : ''}><th className="px-3 py-2 text-left font-medium">{item.number}</th><td className="px-3 py-2">{formatDate(item.dueDate)}</td><td className="px-3 py-2">{installmentStatus(item, matched.has(item.number))}</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(-item.principalCents)}</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(-item.interestCents)}</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(-item.installmentCents)}</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(-item.residualCents)}</td></tr>)}</tbody></table></div>
    </section> : <section className="mt-5 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">Nessun piano di ammortamento collegato.</section>}
  </section>;
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <article className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card"><p className="text-sm text-muted">{label}</p><p className="mt-2 break-words text-xl font-bold tabular-nums text-ink">{value}</p>{note && <p className="mt-1 text-xs text-muted">{note}</p>}</article>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-muted">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>;
}

function installmentStatus(item: { status: 'paid' | 'due' | 'other' }, matched: boolean): string {
  if (matched) return 'Movimento abbinato';
  if (item.status === 'paid') return 'Pagata nel piano';
  if (item.status === 'due') return 'Da pagare';
  return 'Stato non indicato';
}

function isLoadError(value: LiabilityLoad): value is { loadError: true } {
  return typeof value === 'object' && value !== null && 'loadError' in value;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
