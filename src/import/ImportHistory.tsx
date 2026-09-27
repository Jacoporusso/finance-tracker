import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { rollbackImport } from './core/engine';

export default function ImportHistory() {
  const batches = useLiveQuery(() => db.importBatches.orderBy('importedAt').reverse().toArray(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = batches?.find((batch) => batch.status === 'committed');

  async function rollback(id: string) {
    if (!window.confirm('Annullare questo import? I movimenti aggiunti saranno rimossi e gli aggiornamenti ripristinati. Le modifiche manuali successive impediscono l’annullamento.')) return;
    setBusy(true);
    setError('');
    try { await rollbackImport(id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Annullamento non riuscito.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 min-w-0" aria-label="Storico importazioni">
    <h2 className="text-xl font-semibold">Storico importazioni</h2>
    <p className="mt-2 text-sm text-muted">Puoi annullare gli import dal più recente. Lo storico degli altri import rimane intatto.</p>
    {error && <p role="alert" className="mt-3 break-words text-sm text-red-700 dark:text-red-300">{error}</p>}
    {batches === undefined ? <p role="status" className="mt-4 text-muted">Caricamento…</p> : batches.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-muted">Nessuna importazione confermata.</p> : <ul className="mt-4 space-y-3">
      {batches.map((batch) => <li key={batch.id} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="break-all font-semibold">{batch.fileName}</h3>
            <p className="mt-1 text-sm text-muted">{batch.sourceBank} · {new Date(batch.importedAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</p>
            <p className="mt-2 text-sm">{batch.counts.insertedCount} nuovi · {batch.counts.updatedCount} aggiornati · {batch.counts.duplicateCount} duplicati · {batch.counts.reviewCount} da verificare</p>
          </div>
          {batch.status === 'rolled_back' ? <span className="text-sm text-muted">Annullato</span> : <button type="button" disabled={busy || latest?.id !== batch.id} onClick={() => void rollback(batch.id)} className="min-h-11 shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy && latest?.id === batch.id ? 'Annullamento…' : 'Annulla importazione'}</button>}
        </div>
      </li>)}
    </ul>}
  </section>;
}
