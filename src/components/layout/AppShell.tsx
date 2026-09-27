import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { EllipsisHorizontalIcon, MoonIcon, SunIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { navigation } from '../../app/navigation';
import { useSettings } from '../../app/settings-context';

function Brand() {
  return <Link to="/" className="flex min-h-11 items-center gap-3 font-bold tracking-tight"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-green text-xl text-on-green">f.</span><span className="text-xl">finanza</span></Link>;
}

function ThemeButton({ sidebar = false }: { sidebar?: boolean }) {
  const { isDark, saving, changeTheme } = useSettings();
  const [error, setError] = useState(false);
  async function toggle() {
    setError(false);
    try { await changeTheme(isDark ? 'light' : 'dark'); } catch { setError(true); }
  }
  const Icon = isDark ? SunIcon : MoonIcon;
  return <div><button type="button" disabled={saving} onClick={() => void toggle()} aria-label={`Attiva tema ${isDark ? 'chiaro' : 'scuro'}`} className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm disabled:opacity-50 ${sidebar ? 'border-sidebar-line text-on-sidebar' : 'border-line text-ink'}`}><Icon className="size-5" aria-hidden="true" /><span className="hidden lg:inline">Tema {isDark ? 'chiaro' : 'scuro'}</span></button>{error && <p role="alert" className={`max-w-48 text-sm ${sidebar ? 'text-sidebar-muted' : 'text-muted'}`}>Tema non salvato. Riprova.</p>}</div>;
}

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (menuOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [menuOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    content.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const moreActive = navigation.slice(4).some(({ path }) => location.pathname.startsWith(path));

  return <div className="min-h-dvh bg-canvas text-ink">
    <a className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-surface p-3 focus:translate-y-0" href="#main-content" onClick={(event) => { event.preventDefault(); content.current?.focus(); }}>Vai al contenuto</a>
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-sidebar-line bg-sidebar px-5 py-6 text-on-sidebar lg:flex">
      <Brand />
      <nav aria-label="Navigazione principale" className="mt-8 space-y-1">
        {navigation.map(({ path, label, Icon }) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive || (path === '/' && location.pathname.startsWith('/dashboard/')) ? 'bg-green text-on-green' : 'text-sidebar-muted hover:bg-on-sidebar/5 hover:text-on-sidebar'}`}><Icon className="size-5 shrink-0" aria-hidden="true" />{label}</NavLink>)}
      </nav>
      <div className="mt-auto space-y-4 pt-8"><p className="flex items-start gap-2 rounded-xl bg-on-sidebar/5 p-3 text-sm text-sidebar-muted"><ShieldCheckIcon className="size-5 shrink-0" aria-hidden="true" />I tuoi dati restano su questo dispositivo.</p><ThemeButton sidebar /></div>
    </aside>

    <div className="min-w-0 lg:ml-64">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden"><Brand /><ThemeButton /></header>
      <main ref={content} id="main-content" tabIndex={-1} className="mx-auto min-w-0 max-w-7xl px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] outline-none sm:px-6 sm:pt-8 lg:px-10 lg:py-10"><Outlet /></main>
    </div>

    <nav aria-label="Navigazione mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden">
      {navigation.slice(0, 4).map(({ path, label, Icon }) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[11px] font-medium sm:text-xs ${isActive || (path === '/' && location.pathname.startsWith('/dashboard/')) ? 'bg-green-soft text-green' : 'text-muted'}`}><Icon className="size-5" aria-hidden="true" /><span>{label}</span></NavLink>)}
      <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="more-navigation" aria-label="Altre sezioni" className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium sm:text-xs ${moreActive ? 'bg-green-soft text-green' : 'text-muted'}`}><EllipsisHorizontalIcon className="size-5" aria-hidden="true" />Altro</button>
    </nav>

    <dialog ref={dialog} id="more-navigation" aria-labelledby="more-title" onClose={() => setMenuOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="more-title" className="text-lg font-semibold">Altre sezioni</h2><button type="button" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu" className="grid size-11 place-items-center rounded-xl hover:bg-canvas"><XMarkIcon className="size-5" aria-hidden="true" /></button></div>
      <nav aria-label="Sezioni aggiuntive" className="space-y-1">{navigation.slice(4).map(({ path, label, Icon }) => <NavLink to={path} key={path} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-3 ${isActive ? 'bg-green-soft text-green' : 'text-muted hover:bg-canvas'}`}><Icon className="size-5" aria-hidden="true" />{label}</NavLink>)}</nav>
    </dialog>
  </div>;
}
