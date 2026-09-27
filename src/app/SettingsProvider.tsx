import { useEffect, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db/database';
import { getPreferences, initializeDatabase, savePreferences } from '../db/repository';
import type { Preferences } from '../domain/models';
import { SettingsContext } from './settings-context';

export default function SettingsProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(getPreferences).subscribe({ next: (next) => setPreferences((current) => current === null ? null : next) });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const stored = await db.settings.get('preferences');
      await initializeDatabase();
      let next = await getPreferences();
      if (!stored) {
        let legacy: string | null = null;
        try { legacy = localStorage.getItem('theme'); } catch { /* IndexedDB remains the source of truth. */ }
        if (legacy === 'light' || legacy === 'dark') next = { ...next, theme: legacy };
        await savePreferences(next);
      }
      if (active) setPreferences(next);
    }
    void initialize().catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const isDark = preferences?.theme === 'dark' || (preferences?.theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#131a17' : '#f4f6f3');
  }, [isDark]);

  async function changeTheme(theme: Preferences['theme']) {
    if (!preferences || saving) return;
    setSaving(true);
    try {
      const next = { ...preferences, theme };
      await savePreferences(next);
      setPreferences(next);
    } finally { setSaving(false); }
  }

  if (failed) return <div role="alert" className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-semibold">Archivio locale non disponibile</h1><p className="mt-3">Consenti l'archiviazione nel browser e riprova. Nessun dato è stato cancellato.</p><button type="button" className="mt-4 min-h-11 rounded-xl border border-line px-4" onClick={() => window.location.reload()}>Riprova</button></div>;
  if (!preferences) return <p role="status" className="p-6 text-muted">Apertura dell'archivio locale…</p>;
  return <SettingsContext.Provider value={{ preferences, isDark, saving, changeTheme }}>{children}</SettingsContext.Provider>;
}
