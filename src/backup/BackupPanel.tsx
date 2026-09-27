import { useRef, useState, type ChangeEvent } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import {
  applyBackupRestore,
  BACKUP_PASSWORD_MIN_LENGTH,
  BackupRestoreError,
  downloadEncryptedBackup,
  previewEncryptedBackup,
  type BackupRestorePreview,
} from './backup';

type RestoreStrategy = 'keep-local' | 'use-backup';

const storeLabels: Record<keyof BackupRestorePreview['recordCounts'], string> = {
  settings: 'Preferenze',
  accounts: 'Conti',
  categories: 'Categorie',
  transactions: 'Movimenti',
  importBatches: 'Importazioni',
  importBatchRows: 'Storico import',
  liabilities: 'Passività',
  netWorthSnapshots: 'Storico patrimonio',
  investmentValuations: 'Valorizzazioni investimenti',
};

export default function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportConfirmation, setExportConfirmation] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [preview, setPreview] = useState<BackupRestorePreview>();
  const [strategy, setStrategy] = useState<RestoreStrategy>('keep-local');
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function exportFile() {
    setError(''); setNotice(''); setBusy(true);
    try {
      await downloadEncryptedBackup(exportPassword);
      setNotice('Backup cifrato scaricato. Conserva la password in un luogo sicuro: senza di essa non potrai aprire il file.');
      setExportPassword(''); setExportConfirmation('');
    } catch (cause) {
      setError(cause instanceof BackupRestoreError ? cause.message : 'Impossibile creare il backup su questo dispositivo.');
    } finally { setBusy(false); }
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(undefined); setNotice(''); setError(''); setReplaceConfirmed(false);
    if (!file) return;
    setBusy(true);
    try {
      const nextPreview = await previewEncryptedBackup(file, restorePassword);
      setPreview(nextPreview);
      setStrategy('keep-local');
    } catch (cause) {
      setError(cause instanceof BackupRestoreError ? cause.message : 'Impossibile leggere il backup.');
    } finally { setBusy(false); event.target.value = ''; }
  }

  async function restore() {
    if (!preview) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await applyBackupRestore(preview, strategy);
      setNotice(`Ripristino completato: ${result.added} aggiunti, ${result.identical} già presenti, ${result.conflictsKept} conflitti mantenuti${result.conflictsReplaced ? `, ${result.conflictsReplaced} conflitti aggiornati dal backup` : ''}.`);
      setPreview(undefined); setRestorePassword(''); setStrategy('keep-local'); setReplaceConfirmed(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (cause) {
      setError(cause instanceof BackupRestoreError ? cause.message : 'Ripristino non completato; nessun dato è stato applicato.');
    } finally { setBusy(false); }
  }

  const conflictCount = preview ? Object.values(preview.recordCounts).reduce((sum, row) => sum + row.conflicts, 0) : 0;
  const newCount = preview ? Object.values(preview.recordCounts).reduce((sum, row) => sum + row.new, 0) : 0;
  const identicalCount = preview ? Object.values(preview.recordCounts).reduce((sum, row) => sum + row.identical, 0) : 0;

  return <section className="mt-5 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="backup-title">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-soft text-green"><LockClosedIcon className="size-5" aria-hidden="true" /></span>
      <div><h2 id="backup-title" className="text-lg font-semibold">Backup cifrato e trasferimento</h2><p className="mt-1 text-sm text-muted">I dati restano nel browser. Crea un file cifrato sul telefono e aprilo sul computer, o viceversa.</p></div>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-line p-4">
        <h3 className="font-semibold">Esporta questo dispositivo</h3>
        <label className="mt-3 block text-sm font-medium" htmlFor="backup-export-password">Password del backup</label>
        <input id="backup-export-password" type="password" autoComplete="new-password" minLength={BACKUP_PASSWORD_MIN_LENGTH} value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink" />
        <label className="mt-3 block text-sm font-medium" htmlFor="backup-export-confirm">Ripeti la password</label>
        <input id="backup-export-confirm" type="password" autoComplete="new-password" value={exportConfirmation} onChange={(event) => setExportConfirmation(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink" />
        <button type="button" disabled={busy || exportPassword.length < BACKUP_PASSWORD_MIN_LENGTH || exportPassword !== exportConfirmation} onClick={() => void exportFile()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green px-4 font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownTrayIcon className="size-5" aria-hidden="true" />Scarica backup cifrato</button>
        <p className="mt-2 text-xs text-muted">Inserisci almeno {BACKUP_PASSWORD_MIN_LENGTH} caratteri e usa la stessa password sul dispositivo di destinazione.</p>
      </div>

      <div className="rounded-xl border border-line p-4">
        <h3 className="font-semibold">Importa su questo dispositivo</h3>
        <label className="mt-3 block text-sm font-medium" htmlFor="backup-restore-password">Password del backup</label>
        <input id="backup-restore-password" type="password" autoComplete="current-password" value={restorePassword} onChange={(event) => { setRestorePassword(event.target.value); setPreview(undefined); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink" />
        <input ref={fileRef} type="file" accept=".financebackup,application/octet-stream" onChange={(event) => void selectBackup(event)} className="sr-only" aria-label="Seleziona file di backup cifrato" />
        <button type="button" disabled={busy || !restorePassword} onClick={() => fileRef.current?.click()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"><ArrowUpTrayIcon className="size-5" aria-hidden="true" />Scegli backup e mostra anteprima</button>
        <p className="mt-2 text-xs text-muted">Per trasferirlo puoi usare un cavo o una condivisione di file scelta da te. Il file è cifrato prima di uscire dal dispositivo.</p>
      </div>
    </div>

    {preview && <div className="mt-5 rounded-xl border border-line p-4" aria-live="polite">
      <h3 className="font-semibold">Anteprima del ripristino</h3>
      <p className="mt-1 text-sm text-muted">Backup creato il {new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preview.createdAt))}. Nessun dato è stato ancora modificato.</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-canvas p-3"><dt className="text-xs text-muted">Nuovi</dt><dd className="mt-1 text-lg font-semibold">{newCount}</dd></div><div className="rounded-lg bg-canvas p-3"><dt className="text-xs text-muted">Già presenti</dt><dd className="mt-1 text-lg font-semibold">{identicalCount}</dd></div><div className="rounded-lg bg-canvas p-3"><dt className="text-xs text-muted">Conflitti</dt><dd className="mt-1 text-lg font-semibold">{conflictCount}</dd></div><div className="rounded-lg bg-canvas p-3"><dt className="text-xs text-muted">Operazione</dt><dd className="mt-1 text-sm font-semibold">Aggiunta incrementale</dd></div></dl>
      <ul className="mt-3 grid gap-1 text-sm text-muted sm:grid-cols-2">{(Object.keys(storeLabels) as Array<keyof BackupRestorePreview['recordCounts']>).map((store) => {
        const row = preview.recordCounts[store];
        return row.incoming ? <li key={store}>{storeLabels[store]}: {row.new} nuovi, {row.identical} uguali, {row.conflicts} in conflitto</li> : null;
      })}</ul>
      {conflictCount > 0 && <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-semibold">Come trattare i conflitti</legend>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 text-sm"><input className="mt-1 size-4 accent-green" type="radio" name="restore-strategy" checked={strategy === 'keep-local'} onChange={() => { setStrategy('keep-local'); setReplaceConfirmed(false); }} /><span><strong>Mantieni i dati di questo dispositivo</strong><span className="block text-muted">Consigliato: aggiunge i dati mancanti e salta quelli diversi.</span></span></label>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 text-sm"><input className="mt-1 size-4 accent-red-700" type="radio" name="restore-strategy" checked={strategy === 'use-backup'} onChange={() => { setStrategy('use-backup'); setReplaceConfirmed(false); }} /><span><strong>Usa i dati del backup nei conflitti</strong><span className="block text-muted">Sovrascrive i record divergenti elencati qui sotto.</span></span></label>
        {strategy === 'use-backup' && <>
          <ul className="max-h-40 overflow-auto rounded-lg bg-canvas p-3 text-xs text-muted">{preview.conflicts.slice(0, 100).map(({ store, id, label }) => <li key={`${store}:${id}`} className="break-words">{storeLabels[store]} · {label}</li>)}{preview.conflicts.length > 100 && <li>…e altri {preview.conflicts.length - 100}</li>}</ul>
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-red-300 p-3 text-sm text-red-800 dark:text-red-200"><input className="mt-1 size-4 accent-red-700" type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} /><span>Confermo di voler sostituire i record locali in conflitto con quelli del backup.</span></label>
        </>}
      </fieldset>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={busy || (strategy === 'use-backup' && !replaceConfirmed)} onClick={() => void restore()} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-green px-4 font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-50">{strategy === 'use-backup' ? 'Conferma unione e aggiornamenti' : 'Ripristina dati mancanti'}</button><button type="button" disabled={busy} onClick={() => { setPreview(undefined); setReplaceConfirmed(false); setStrategy('keep-local'); setError(''); if (fileRef.current) fileRef.current.value = ''; }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 font-semibold text-ink disabled:opacity-50">Annulla anteprima</button></div>
    </div>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-green-soft p-3 text-sm text-green">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
  </section>;
}
