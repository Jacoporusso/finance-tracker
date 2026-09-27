import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { saveCategory } from '../db/repository';
import type { Category } from '../domain/models';

export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const [name, setName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function startRename(category: Category) {
    setEditingCategory(category);
    setName(category.name);
    setError('');
  }

  function cancelEdit() {
    if (busy) return;
    setEditingCategory(null);
    setName('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    setError('');
    if (!normalizedName) {
      setError('Inserisci il nome della categoria.');
      return;
    }
    if ((categories ?? []).some((category) => category.name.localeCompare(normalizedName, 'it', { sensitivity: 'base' }) === 0 && category.id !== editingCategory?.id)) {
      setError('Esiste già una categoria con questo nome.');
      return;
    }

    setBusy(true);
    try {
      await saveCategory({ name: normalizedName }, editingCategory?.id);
      setEditingCategory(null);
      setName('');
    } catch {
      setError('Non è stato possibile salvare la categoria. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  const sortedCategories = [...(categories ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'it'));

  return (
    <section className="min-w-0">
      <header>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Categorie</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Personalizza i nomi usati per organizzare i movimenti. Modificare una categoria non elimina i movimenti associati.</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-ink">{editingCategory ? 'Rinomina categoria' : 'Nuova categoria'}</h2>
        <fieldset disabled={busy}>
          <label htmlFor="category-name" className="mt-4 block text-sm font-medium text-ink">Nome categoria</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input id="category-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-green focus:ring-2 focus:ring-green/20" placeholder="Es. Casa" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {editingCategory && <button type="button" onClick={cancelEdit} className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink">Annulla</button>}
              <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-on-green disabled:cursor-wait disabled:opacity-60">{busy ? 'Salvataggio…' : editingCategory ? 'Salva nome' : 'Aggiungi categoria'}</button>
            </div>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      </form>

      <section aria-label="Elenco categorie" className="mt-6">
        {categories === undefined ? (
          <p role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-sm text-muted">Caricamento categorie…</p>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center">
            <h3 className="text-base font-semibold text-ink">Ancora nessuna categoria</h3>
            <p className="mt-2 text-sm text-muted">Crea una categoria per iniziare a organizzare i movimenti.</p>
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-lg font-semibold text-ink">Categorie disponibili <span className="text-sm font-normal text-muted">({categories.length})</span></h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sortedCategories.map((category) => (
                <li key={category.id} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
                  <span className="min-w-0 break-words text-base font-medium text-ink">{category.name}</span>
                  <button type="button" onClick={() => startRename(category)} disabled={busy} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-green hover:bg-green-soft disabled:opacity-60">Rinomina</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </section>
  );
}
