import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Liability, MortgageDetails } from '../domain/transactions';
import { formatMoney, parseMoneyToCents } from '../domain/money';
import { formatDate } from '../domain/display';
import DatePicker from '../components/DatePicker';
import { todayInRome } from '../domain/dates';
import PageHeader from '../components/PageHeader';
import { parseMortgagePlan } from '../domain/mortgage-plan';
import { liabilityProgress } from '../domain/mortgage-matching';
import { mortgageSchema, mortgageWarnings } from '../domain/mortgage-validation';

interface LiabilityForm {
  name: string;
  amount: string;
  asOf: string;
}

const emptyForm = (): LiabilityForm => ({ name: '', amount: '', asOf: todayInRome() });
const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink';

export default function LiabilitiesPage() {
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.where('institution').equals('INTESA').toArray(), []);
  const [form, setForm] = useState<LiabilityForm>(emptyForm);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseFailed, setParseFailed] = useState(false);
  const [mortgagePlan, setMortgagePlan] = useState<MortgageDetails | undefined>();
  const [mortgageAccountId, setMortgageAccountId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const parseSequence = useRef(0);

  function beginEdit(liability: Liability) {
    setEditing(liability);
    setForm({ name: liability.name, amount: new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(liability.amountCents / 100), asOf: liability.asOf });
    setError('');
    setParseFailed(false);
    setMortgagePlan(liability.mortgage);
    const oldAccount = liability.mortgage?.accountId ?? '';
    const matchedAccount = (accounts ?? []).find((account) => account.id === oldAccount);
    setMortgageAccountId(matchedAccount?.id ?? '');
    setContractNumber(liability.mortgage?.contractNumber ?? '');
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setMortgagePlan(undefined);
    setMortgageAccountId('');
    setContractNumber('');
    setParseFailed(false);
    setParsing(false);
  }

  function cancelEdit() {
    if (busy || parsing) return;
    parseSequence.current += 1;
    resetForm();
  }

  async function selectPlan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const sequence = ++parseSequence.current;
    setError('');
    setParseFailed(false);
    setParsing(true);
    try {
      const parsed = await parseMortgagePlan(file);
      if (sequence !== parseSequence.current) return;
      // A selected Intesa account is authoritative across schedule reimports.
      setMortgagePlan({ ...parsed, ...(mortgageAccountId ? { accountId: mortgageAccountId } : {}) });
      setContractNumber((current) => parsed.contractNumber ?? current);
    } catch (reason: unknown) {
      if (sequence !== parseSequence.current) return;
      setParseFailed(true);
      setError(reason instanceof Error ? reason.message : 'Piano Excel non riconosciuto.');
    } finally {
      if (sequence === parseSequence.current) setParsing(false);
      event.target.value = '';
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parsing) return setError('Attendi il completamento della lettura del piano Excel.');
    if (parseFailed) return setError('Il piano Excel selezionato non è valido. Seleziona un altro file prima di salvare.');
    const name = form.name.trim();
    if (name.length > 80) return setError('Il nome può contenere al massimo 80 caratteri.');
    if (!name) return setError('Inserisci il nome della passività.');
    if (!isValidDate(form.asOf)) return setError('Seleziona una data di aggiornamento valida.');
    let amountCents: number;
    try {
      amountCents = parseMoneyToCents(form.amount);
    } catch {
      return setError('Controlla il formato dell’importo e riprova.');
    }
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return setError('L’importo deve essere maggiore di zero.');

    let validatedPlan: MortgageDetails | undefined;
    if (mortgagePlan) {
      const candidate: MortgageDetails = {
        ...mortgagePlan,
        accountId: mortgageAccountId || undefined,
        contractNumber: normalizeContractNumber(contractNumber) || undefined,
      };
      const parsed = mortgageSchema.safeParse(candidate);
      if (!parsed.success) return setError(`Piano mutuo non valido: ${parsed.error.issues[0]?.message ?? 'controlla i dati del piano'}.`);
      validatedPlan = { ...parsed.data, warnings: mortgageWarnings(parsed.data) };
      if (mortgageAccountId) {
        try {
          const account = await db.accounts.get(mortgageAccountId);
          if (!account || account.institution !== 'INTESA') return setError('Seleziona un conto Intesa valido per l’addebito.');
        } catch {
          return setError('Non è stato possibile verificare il conto selezionato. Riprova.');
        }
      }
      const normalizedContract = normalizeContractNumber(contractNumber);
      if (normalizedContract && mortgageAccountId) {
        const duplicate = (liabilities ?? []).some((item) => item.id !== editing?.id
          && item.mortgage?.accountId === mortgageAccountId
          && normalizeContractNumber(item.mortgage.contractNumber ?? '') === normalizedContract);
        if (duplicate) return setError('Esiste già una passività con questo conto e numero finanziamento.');
      }
    }

    setBusy(true);
    setError('');
    const liability: Liability = {
      id: editing?.id ?? crypto.randomUUID(),
      name,
      amountCents,
      asOf: form.asOf,
      updatedAt: new Date().toISOString(),
      mortgage: validatedPlan,
    };
    try {
      await db.liabilities.put(liability);
      resetForm();
    } catch {
      setError('Non è stato possibile salvare la passività. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(liability: Liability) {
    if (!window.confirm(`Eliminare la passività “${liability.name}”?`)) return;
    setBusy(true);
    setError('');
    try {
      await db.liabilities.delete(liability.id);
      if (editing?.id === liability.id) resetForm();
    } catch {
      setError('Non è stato possibile eliminare la passività. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...(liabilities ?? [])].sort((a, b) => b.asOf.localeCompare(a.asOf) || a.name.localeCompare(b.name, 'it'));
  const loading = liabilities === undefined;

  return (
    <section className="min-w-0">
      <PageHeader title="Passività" description="Registra mutui e altri debiti con il loro importo residuo e la data dell’ultimo aggiornamento." />
      <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-ink">{editing ? 'Modifica passività' : 'Aggiungi una passività'}</h2>
        <fieldset disabled={busy || parsing} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-ink">Nome
            <input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Es. Mutuo casa" />
          </label>
          <label className="text-sm font-medium text-ink">Capitale residuo di riferimento (EUR)
            <input required inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} placeholder="Es. 125000,00" />
          </label>
          <label className="text-sm font-medium text-ink">Data di riferimento
            <DatePicker className="mt-1.5" required label="Data di riferimento" max={todayInRome()} value={form.asOf} onChange={(asOf) => setForm({ ...form, asOf })} />
          </label>
        </fieldset>
        <p className="mt-2 text-xs text-muted">Questo capitale e la data sono il riferimento autorevole: i movimenti abbinati successivi aggiornano il residuo senza sottrarre di nuovo le rate precedenti.</p>
        <div className="mt-4 rounded-xl border border-dashed border-line p-3">
          <label className="block text-sm font-medium text-ink">Piano di ammortamento Excel
            <input type="file" accept=".xlsx,.xls" disabled={busy || parsing} onChange={(event) => void selectPlan(event)} className="mt-2 block min-h-11 w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-green-soft file:px-3 file:py-2 file:font-semibold file:text-green" />
          </label>
          <p role={parsing ? 'status' : undefined} className="mt-2 text-xs text-muted">Il file resta sul dispositivo. {parsing ? 'Lettura del piano in corso…' : mortgagePlan ? `${mortgagePlan.installments.length} rate lette · ${mortgagePlan.scheduleFileName}` : 'Puoi aggiungerlo ora o in un secondo momento.'}</p>
          {mortgagePlan && <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink">Conto Intesa per l’addebito
              <select disabled={busy || parsing} value={mortgageAccountId} onChange={(event) => setMortgageAccountId(event.target.value)} className={inputClass}>
                <option value="">Seleziona un conto</option>
                {(accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}{account.maskedIdentifier ? ` · ${account.maskedIdentifier}` : ''}{!account.active ? ' · inattivo' : ''}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Numero finanziamento
              <input disabled={busy || parsing} inputMode="numeric" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} className={inputClass} placeholder="Es. 00123456 o MU 123456" />
            </label>
          </div>}
          {mortgagePlan && !accounts?.length && <p className="mt-2 text-sm text-muted">Aggiungi prima un conto Intesa in Conti per abilitare l’abbinamento automatico delle rate.</p>}
          {editing?.mortgage && editing.mortgage.parserVersion === undefined && <p className="mt-2 rounded-lg bg-canvas p-3 text-sm text-muted">Questo piano usa un vecchio formato di importazione. Ricarica il piano Excel per ricalcolare e verificare gli avvisi.</p>}
          {!!mortgagePlan?.warnings?.length && <details className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm text-amber-900"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Avvisi del piano ({mortgagePlan.warnings.length})</summary><ul className="max-h-56 list-disc space-y-1 overflow-auto pb-3 pl-5">{mortgagePlan.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></details>}
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {editing && <button type="button" disabled={busy || parsing} onClick={cancelEdit} className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">Annulla</button>}
          <button type="submit" disabled={busy || parsing || parseFailed} className="min-h-11 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:cursor-wait disabled:opacity-60">{parsing ? 'Lettura piano…' : busy ? 'Salvataggio…' : editing ? 'Salva modifiche' : 'Aggiungi passività'}</button>
        </div>
      </form>

      <section aria-label="Passività registrate" className="mt-5">
        {loading ? <p role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-sm text-muted">Caricamento passività…</p> : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center">
            <h2 className="text-lg font-semibold text-ink">Nessuna passività registrata</h2>
            <p className="mt-2 text-sm text-muted">Le passività inserite verranno sottratte dal patrimonio netto in dashboard.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sorted.map((liability) => {
              const progress = liabilityProgress(liability, transactions ?? []);
              const plan = liability.mortgage;
              const next = plan?.installments.find((rate) => !progress.paidNumbers?.has(rate.number) && rate.status === 'due');
              return <li key={liability.id} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="break-words text-base font-semibold text-ink">{liability.name}</h3><p className="mt-1 text-sm text-muted">Riferimento al {formatDate(progress.asOf)}</p></div>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-ink">{formatMoney(-progress.residualCents)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/liabilities/${liability.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-green px-3 text-sm font-semibold text-on-green">Apri dettaglio</Link>
                  <button type="button" disabled={busy || parsing} onClick={() => beginEdit(liability)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-60">Modifica</button>
                  <button type="button" disabled={busy || parsing} onClick={() => void remove(liability)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-canvas disabled:opacity-60">Elimina</button>
                </div>
                {plan && <>
                  <p className="mt-3 rounded-lg bg-green-soft px-3 py-2 text-sm text-green">Piano collegato: {plan.installments.length} rate · {progress.paidCount ?? 0} pagate · residuo {formatMoney(-progress.residualCents)} al {formatDate(progress.asOf)}</p>
                  {progress.warnings.length > 0 && <details className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm text-amber-900"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Avvisi ({progress.warnings.length})</summary><ul className="max-h-56 list-disc space-y-1 overflow-auto pb-3 pl-5">{progress.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></details>}
                  <details className="mt-3 rounded-lg border border-line p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Dettaglio piano</summary><dl className="grid gap-2 pt-2 text-sm sm:grid-cols-2"><div><dt className="text-muted">Rate pagate</dt><dd className="font-semibold">{progress.paidCount ?? 0} / {plan.installments.length}</dd></div><div><dt className="text-muted">Rate residue</dt><dd className="font-semibold">{progress.remaining ?? plan.installments.length}</dd></div><div><dt className="text-muted">Prossima rata</dt><dd className="font-semibold">{next ? `${formatDate(next.dueDate)} · ${formatMoney(-next.installmentCents)}` : 'Nessuna'}</dd></div><div><dt className="text-muted">Quota interessi prossima rata</dt><dd className="font-semibold">{next ? formatMoney(-next.interestCents) : '—'}</dd></div></dl></details>
                </>}
              </li>;
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

function normalizeContractNumber(value: string): string {
  const digits = (value.includes('/') ? value.split('/').at(-1) ?? value : value).replace(/\D/gu, '');
  return digits.replace(/^0+/u, '');
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
