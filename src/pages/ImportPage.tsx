import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpTrayIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import PageHeader from '../components/PageHeader';
import { db } from '../db/database';
import { findAccountByIdentity, saveAccount } from '../db/repository';
import { parseBankFile } from '../import/core/read';
import { prepareImport, commitImport, sha256 } from '../import/core/engine';
import type { ImportPreview, ParsedImport } from '../import/core/types';
import ImportHistory from '../import/ImportHistory';
import ImportPreviewPanel from '../import/ImportPreviewPanel';

interface LoadedFile { name: string; hash: string; parsed: ParsedImport }
const control = 'mt-2 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base';

export default function ImportPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const [file, setFile] = useState<LoadedFile>();
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [reprocess, setReprocess] = useState(false);
  const [preview, setPreview] = useState<ImportPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const generation = useRef(0);
  const creatingAccount = useRef(false);
  const compatible = (accounts ?? []).filter((account) => account.active && account.institution === file?.parsed.bank);

  async function loadFile(selected?: File) {
    if (!selected || busy) return;
    const version = ++generation.current;
    setFile(undefined); setPreview(undefined); setError(''); setSuccess(''); setAccountId(''); setReprocess(false);
    if (!/\.xlsx?$/iu.test(selected.name)) { setError('Seleziona un export Excel .xlsx o .xls di ING o Intesa Sanpaolo.'); return; }
    if (selected.size > 20 * 1024 * 1024) { setError('Il file supera il limite di 20 MB. Esporta un periodo più breve.'); return; }
    setBusy(true);
    try {
      const buffer = await selected.arrayBuffer();
      const [parsed, hash] = await Promise.all([parseBankFile(buffer), sha256(buffer)]);
      if (version !== generation.current) return;
      setFile({ name: selected.name, parsed, hash });
      const matches = (accounts ?? []).filter((account) => account.active && account.institution === parsed.bank);
      setAccountId(matches.length === 1 ? matches[0].id : '');
      setAccountName(parsed.bank === 'ING' ? 'ING corrente' : 'Intesa Sanpaolo');
    } catch { setError('Impossibile leggere il file: verifica che sia un export Excel supportato di ING o Intesa Sanpaolo e non sia protetto da password.'); }
    finally { setBusy(false); }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0]);
    event.target.value = '';
  }

  async function createAccount() {
    if (creatingAccount.current || !file || !accountName.trim()) return;
    creatingAccount.current = true;
    setBusy(true); setError('');
    const input = {
      name: accountName.trim(),
      institution: file.parsed.bank,
      type: 'checking' as const,
      currency: 'EUR' as const,
      ownAccountAliases: [],
      maskedIdentifier: file.parsed.metadata.maskedIdentifier,
    };
    try {
      let existing = await findAccountByIdentity(input);
      if (!existing) {
        try {
          const id = await saveAccount(input);
          setAccountId(id);
          setPreview(undefined);
          setReprocess(false);
          return;
        } catch (cause) {
          // Another tab may have created the identical account after the lookup.
          existing = await findAccountByIdentity(input);
          if (!existing) throw cause;
        }
      }

      if (!existing.active) {
        setError('Esiste già un conto archiviato con questi dati. Riattivalo dalla pagina Conti prima di importare.');
        return;
      }
      setAccountId(existing.id);
      setPreview(undefined);
      setReprocess(false);
    } catch {
      setError('Impossibile creare il conto. Controlla il nome e riprova.');
    } finally {
      creatingAccount.current = false;
      setBusy(false);
    }
  }

  async function analyze() {
    if (!file || !accountId) return;
    setBusy(true); setError(''); setPreview(undefined);
    try { setPreview(await prepareImport(file.parsed, file.name, file.hash, accountId, reprocess)); }
    catch { setError('Impossibile preparare l’anteprima. Verifica il conto e riprova.'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      await commitImport(preview, preview.reprocess);
      setSuccess('Importazione completata. Movimenti, saldi disponibili e dashboard sono aggiornati.');
      setPreview(undefined); setFile(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Importazione non riuscita. Nessuna modifica parziale è stata salvata.'); }
    finally { setBusy(false); }
  }

  return <section className="min-w-0">
    <PageHeader title="Import" description="Carica gli export Excel di Intesa Sanpaolo e ING. Controlla l’anteprima prima di confermare." />
    <p className="mt-4 flex items-start gap-2 text-sm text-muted"><ShieldCheckIcon className="size-5 shrink-0" aria-hidden="true" />File elaborati solo nel browser, senza invii a server. Trade Republic non è incluso in questa fase.</p>
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]); }} className="mt-6 rounded-2xl border-2 border-dashed border-line bg-surface p-5 text-center sm:p-8">
      <ArrowUpTrayIcon className="mx-auto size-8 text-green" aria-hidden="true" />
      <p className="mt-3 font-medium">Trascina qui un export oppure selezionalo</p>
      <label className={`relative mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-green px-5 py-3 font-semibold text-on-green focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${busy ? 'opacity-50' : ''}`}>
        Seleziona file Excel
        <input type="file" accept=".xlsx,.xls" disabled={busy} onChange={selectFile} aria-label="Seleziona file Excel" className="absolute inset-0 w-full cursor-pointer opacity-0" />
      </label>
      <p className="mt-3 text-sm text-muted">Un file alla volta · massimo 20 MB</p>
    </div>
    {busy && <p role="status" className="mt-4 text-sm text-muted">Elaborazione in corso…</p>}
    {error && <p role="alert" className="mt-4 break-words rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {success && <div role="status" className="mt-4 rounded-xl bg-green-soft p-4 text-green"><p>{success}</p><div className="mt-2 flex flex-wrap gap-4"><Link to="/transactions" className="inline-flex min-h-11 items-center font-semibold underline">Vai ai movimenti</Link><Link to="/" className="inline-flex min-h-11 items-center font-semibold underline">Apri dashboard</Link></div></div>}
    {file && <section className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="break-all text-lg font-semibold">{file.name}</h2>
      <p className="mt-2 text-sm text-muted">Formato {file.parsed.bank} riconosciuto · {file.parsed.rows.length} righe lette</p>
      {file.parsed.errors.length > 0 && <ul role="alert" className="mt-3 list-inside list-disc text-sm text-red-700 dark:text-red-300">{file.parsed.errors.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      <label className="mt-4 block text-sm font-medium">Conto di destinazione
        <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPreview(undefined); setReprocess(false); }} disabled={busy} className={control}><option value="">Seleziona un conto {file.parsed.bank}</option>{compatible.map((account) => <option key={account.id} value={account.id}>{account.name}{account.maskedIdentifier ? ` · ${account.maskedIdentifier}` : ''}</option>)}</select>
      </label>
      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm">
        <input type="checkbox" checked={reprocess} onChange={(event) => { setReprocess(event.target.checked); setPreview(undefined); }} disabled={busy || !accountId} className="mt-1 size-5 shrink-0 accent-green" />
        <span>Rianalizza un file già importato per recuperare righe mancanti. Le righe esistenti verranno confrontate e deduplicate.</span>
      </label>
      <details className="mt-4 rounded-xl border border-line p-3" open={compatible.length === 0}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Crea un conto {file.parsed.bank}</summary>
        <label className="block text-sm">Nome del nuovo conto<input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={80} disabled={busy} className={control} /></label>
        <p className="mt-2 text-sm text-muted">Questo pulsante salva solo il conto. I movimenti saranno salvati con la conferma dell’import.</p>
        <button type="button" onClick={() => void createAccount()} disabled={busy || !accountName.trim()} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">Crea e seleziona conto</button>
      </details>
      <button type="button" onClick={() => void analyze()} disabled={busy || !accountId || file.parsed.errors.length > 0} className="mt-5 min-h-11 w-full rounded-xl bg-green px-5 py-3 font-semibold text-on-green disabled:opacity-40 sm:w-auto">Analizza e mostra anteprima</button>
    </section>}
    {preview && <ImportPreviewPanel key={preview.previewId} preview={preview} busy={busy} onConfirm={() => void confirm()} onAcceptBalance={(accepted) => setPreview({ ...preview, balanceUpdate: preview.balanceUpdate ? { ...preview.balanceUpdate, accepted } : undefined })} />}
    <ImportHistory />
  </section>;
}
