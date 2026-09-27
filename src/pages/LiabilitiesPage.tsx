import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Liability } from '../domain/transactions';
import { formatMoney, parseMoneyToCents } from '../domain/money';
import { formatDate } from '../domain/display';
import DatePicker from '../components/DatePicker';
import { todayInRome } from '../domain/dates';
import PageHeader from '../components/PageHeader';

interface LiabilityForm {
  name: string;
  amount: string;
  asOf: string;
}

const emptyForm = (): LiabilityForm => ({ name: '', amount: '', asOf: todayInRome() });

export default function LiabilitiesPage() {
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const [form, setForm] = useState<LiabilityForm>(emptyForm);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function beginEdit(liability: Liability) {
    setEditing(liability);
    setForm({ name: liability.name, amount: new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(liability.amountCents / 100), asOf: liability.asOf });
    setError('');
  }

  function cancelEdit() {
    if (busy) return;
    setEditing(null);
    setForm(emptyForm());
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    setBusy(true);
    setError('');
    const liability: Liability = {
      id: editing?.id ?? crypto.randomUUID(),
      name,
      amountCents,
      asOf: form.asOf,
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.liabilities.put(liability);
      setEditing(null);
      setForm(emptyForm());
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
      if (editing?.id === liability.id) {
        setEditing(null);
        setForm(emptyForm());
      }
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
        <fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-ink">Nome
            <input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink" placeholder="Es. Mutuo casa" />
          </label>
          <label className="text-sm font-medium text-ink">Importo residuo (EUR)
            <input required inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink" placeholder="Es. 125000,00" />
          </label>
          <label className="text-sm font-medium text-ink">Aggiornato al
            <DatePicker className="mt-1.5" required label="Data aggiornamento" max={todayInRome()} value={form.asOf} onChange={(asOf) => setForm({ ...form, asOf })} />
          </label>
        </fieldset>
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {editing && <button type="button" disabled={busy} onClick={cancelEdit} className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">Annulla</button>}
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:cursor-wait disabled:opacity-60">{busy ? 'Salvataggio…' : editing ? 'Salva modifiche' : 'Aggiungi passività'}</button>
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
            {sorted.map((liability) => (
              <li key={liability.id} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="break-words text-base font-semibold text-ink">{liability.name}</h3><p className="mt-1 text-sm text-muted">Aggiornato al {formatDate(liability.asOf)}</p></div>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-ink">{formatMoney(-liability.amountCents)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => beginEdit(liability)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-60">Modifica</button>
                  <button type="button" disabled={busy} onClick={() => void remove(liability)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-canvas disabled:opacity-60">Elimina</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
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
