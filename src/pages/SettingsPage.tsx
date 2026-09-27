import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../app/settings-context';
import PageHeader from '../components/PageHeader';
import type { Preferences } from '../domain/models';
import BackupPanel from '../backup/BackupPanel';

export default function SettingsPage() {
  const { preferences, saving, changeTheme } = useSettings();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function chooseTheme(theme: Preferences['theme']) {
    setError(''); setNotice('');
    try { await changeTheme(theme); setNotice('Tema salvato.'); }
    catch { setError('Impossibile salvare il tema. Riprova.'); }
  }
  return <>
    <PageHeader title="Impostazioni" description="Personalizza l'aspetto e le preferenze del tuo archivio." />
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <fieldset disabled={saving}><legend className="text-lg font-semibold">Aspetto</legend><p className="mt-2 text-sm text-muted">Il tema viene salvato su questo dispositivo.</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{([{ value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }, { value: 'system', label: 'Come il dispositivo' }] as const).map(({ value, label }) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${preferences.theme === value ? 'border-green bg-green-soft' : 'border-line'}`}><input type="radio" name="theme" value={value} checked={preferences.theme === value} onChange={() => void chooseTheme(value)} className="size-4 accent-green" />{label}</label>)}</div></fieldset>
      {notice && <p role="status" className="mt-3 text-sm text-green">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-3"><div><dt className="text-sm text-muted">Valuta</dt><dd className="mt-1 font-medium">EUR · Euro</dd></div><div><dt className="text-sm text-muted">Fuso orario</dt><dd className="mt-1 font-medium">Europe/Rome</dd></div><div><dt className="text-sm text-muted">Formato</dt><dd className="mt-1 font-medium">Italiano</dd></div></dl>
    </section>
    <section className="mt-5 rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="text-lg font-semibold">Categorie</h2><p className="mt-2 text-sm text-muted">Parti dalle categorie iniziali o aggiungi quelle che ti servono.</p><Link to="/settings/categories" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-medium text-green">Gestisci categorie →</Link></section>
    <BackupPanel />
    <section className="prose prose-sm mt-5 max-w-none rounded-2xl border border-line bg-surface p-5 prose-headings:text-ink prose-p:text-muted dark:prose-invert sm:p-6"><h2>Telefono e computer</h2><p>Ogni browser conserva un archivio separato. Per passare da un dispositivo all’altro, esporta il backup cifrato, trasferisci il file e aprilo qui con la stessa password.</p><p>Non è una sincronizzazione automatica. Parti dallo stesso backup su entrambi i dispositivi; se modifichi gli stessi dati su entrambi, confronta i conflitti prima di confermare. Conserva un backup di ciascun dispositivo prima di unire due archivi diversi.</p><p>La cancellazione dei dati del sito o l’uso di una sessione privata può rendere indisponibile l’archivio locale. Tieni una copia recente del file fuori dal browser.</p></section>
  </>;
}
