import { useState } from 'react';
import { formatMoney } from '../domain/money';
import { formatDate } from '../domain/display';
import type { ImportPreview, ImportPreviewAction } from './core/types';
import { importReason } from './messages';

const labels: Record<ImportPreviewAction, string> = { insert: 'Nuovi', update: 'Aggiornati', duplicate: 'Duplicati', review: 'Da verificare' };

interface Props { preview: ImportPreview; busy: boolean; onAcceptBalance: (accepted: boolean) => void; onConfirm: () => void }

export default function ImportPreviewPanel({ preview, busy, onAcceptBalance, onConfirm }: Props) {
  const [filter, setFilter] = useState<ImportPreviewAction | 'all'>('all');
  const [limit, setLimit] = useState(50);
  const filtered = preview.rows.filter((row) => filter === 'all' || (filter === 'review' ? row.action === 'review' || Boolean(row.transaction.reviewReason) : row.action === filter));
  return <section className="mt-6 min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-6" aria-label="Anteprima importazione">
    <h2 className="text-xl font-semibold">Anteprima · {preview.bank}</h2>
    <p className="mt-2 text-sm text-muted">{preview.rows.length} righe · {preview.metadata.periodFrom ? formatDate(preview.metadata.periodFrom) : 'Inizio non indicato'} → {preview.metadata.periodTo ? formatDate(preview.metadata.periodTo) : 'Fine non indicata'}</p>
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {([['Nuovi', preview.counts.insertedCount], ['Aggiornati', preview.counts.updatedCount], ['Duplicati', preview.counts.duplicateCount], ['Da verificare', preview.counts.reviewCount]] as const).map(([label, value]) => <div key={label} className="rounded-xl bg-canvas p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    {preview.counts.pendingReconciledCount > 0 && <p className="mt-3 text-sm">{preview.counts.pendingReconciledCount} movimenti in attesa riconciliati.</p>}
    {preview.counts.transferMatchedCount > 0 && <p className="mt-2 text-sm">{preview.counts.transferMatchedCount} trasferimenti riconosciuti tra conti propri.</p>}
    {preview.warnings.length > 0 && <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-muted">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {preview.blockedReasons.length > 0 && <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Importazione bloccata</p><ul className="mt-2 list-inside list-disc">{preview.blockedReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>}
    {preview.balanceUpdate ? <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm">
      <input type="checkbox" checked={preview.balanceUpdate.accepted} onChange={(event) => onAcceptBalance(event.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-green" />
      <span>Aggiorna il saldo del conto a <strong>{formatMoney(preview.balanceUpdate.proposedBalanceCents)}</strong> al {formatDate(preview.balanceUpdate.date)}.
        {preview.balanceUpdate.previous.currentBalanceCents !== undefined && <span className="mt-1 block text-muted">Sostituirà il saldo noto di {formatMoney(preview.balanceUpdate.previous.currentBalanceCents)}. Deseleziona per conservarlo.</span>}
      </span>
    </label> : <p className="mt-4 text-sm text-muted">Nessun aggiornamento del saldo disponibile per questo import. Puoi gestirlo dalla pagina Conti.</p>}
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Filtra anteprima">
      {(['all', 'insert', 'update', 'duplicate', 'review'] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(50); }} className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${filter === value ? 'border-green bg-green-soft text-green' : 'border-line'}`}>{value === 'all' ? 'Tutti' : labels[value]}</button>)}
    </div>
    <ul className="mt-4 divide-y divide-line">
      {filtered.slice(0, limit).map((row, index) => <li key={`${row.sourceRowIndex}-${index}`} className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-2 text-sm"><span className="text-muted">{formatDate(row.transaction.bookingDate)} · {labels[row.action]}{row.transaction.status === 'pending' ? ' · In attesa' : ''}</span><strong className="tabular-nums">{formatMoney(row.transaction.amountCents)}</strong></div>
        <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{row.transaction.rawDescription || row.transaction.sourceOperation || 'Movimento senza descrizione'}</p>
        {(row.transaction.reviewReason || row.reason) && <p className="mt-1 text-sm text-muted">{importReason(row.transaction.reviewReason || row.reason || '')}</p>}
      </li>)}
    </ul>
    {filtered.length === 0 && <p className="mt-4 text-sm text-muted">Nessuna riga in questa sezione.</p>}
    {filtered.length > limit && <button type="button" onClick={() => setLimit(limit + 50)} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm">Mostra altre 50 righe</button>}
    <p className="mt-5 text-sm text-muted">Solo la conferma salva i movimenti. I duplicati non vengono aggiunti e lo storico esistente non viene sostituito.</p>
    <button type="button" onClick={onConfirm} disabled={busy || preview.blockedReasons.length > 0} className="mt-4 min-h-11 w-full rounded-xl bg-green px-5 py-3 font-semibold text-on-green disabled:opacity-40 sm:w-auto">{busy ? 'Importazione…' : 'Conferma importazione'}</button>
  </section>;
}
