import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

const navigation = [
  { path: '/', label: 'Dashboard', icon: '⌂' },
  { path: '/import', label: 'Import', icon: '⇧' },
  { path: '/transactions', label: 'Movimenti', icon: '↕' },
  { path: '/accounts', label: 'Conti', icon: '▤' },
  { path: '/investments', label: 'Investimenti', icon: '◌' },
  { path: '/liabilities', label: 'Passività', icon: '⌁' },
  { path: '/review', label: 'Review', icon: '✓' },
  { path: '/settings', label: 'Impostazioni', icon: '⚙' },
];

function Placeholder({ title }: { title: string }) {
  return (
    <section className="page-content" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AREA PERSONALE</p>
          <h1 id="page-title">{title}</h1>
        </div>
        <span className="local-badge"><span /> Solo su questo dispositivo</span>
      </div>
      {title === 'Dashboard' ? <DashboardPlaceholder /> : (
        <div className="empty-panel"><span className="empty-icon">✳</span><h2>Qui troverai {title.toLowerCase()}</h2><p>Questa sezione verrà configurata nelle prossime tappe.</p></div>
      )}
    </section>
  );
}

function DashboardPlaceholder() {
  const metrics = ['Patrimonio netto', 'Liquidità', 'Investimenti', 'Passività'];
  return (
    <>
      <div className="kpi-grid">
        {metrics.map((metric, index) => <article className="kpi-card" key={metric}><span className="kpi-icon">{['◈', '↗', '◌', '⌁'][index]}</span><p>{metric}</p><strong>—</strong><small>In attesa dei tuoi dati</small></article>)}
      </div>
      <div className="chart-grid">
        <article className="panel chart-panel"><div className="panel-title"><div><p className="eyebrow">PANORAMICA</p><h2>Patrimonio nel tempo</h2></div><span className="panel-menu">•••</span></div><div className="chart-placeholder"><div className="chart-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true"><path d="M0 122 C60 116 70 86 130 96 S220 120 280 74 S370 95 420 52 S500 64 600 20" /></svg><span>Nessun dato ancora</span></div></article>
        <article className="panel chart-panel"><div className="panel-title"><div><p className="eyebrow">QUESTO MESE</p><h2>Entrate e uscite</h2></div><span className="panel-menu">•••</span></div><div className="bar-placeholder"><div className="bar-set"><i /><i /><small>Gen</small></div><div className="bar-set"><i /><i /><small>Feb</small></div><div className="bar-set"><i /><i /><small>Mar</small></div><div className="bar-set"><i /><i /><small>Apr</small></div><div className="bar-set"><i /><i /><small>Mag</small></div><div className="bar-set"><i /><i /><small>Giu</small></div></div><div className="chart-legend"><span><i className="legend-green" />Entrate</span><span><i className="legend-muted" />Uscite</span></div></article>
      </div>
      <article className="panel accounts-panel"><div className="panel-title"><div><p className="eyebrow">IL TUO DENARO</p><h2>I tuoi conti</h2></div><NavLink to="/accounts" className="text-link">Vedi tutti <span>→</span></NavLink></div><div className="account-cards"><div className="account-card"><span className="account-mark ing">i</span><div><strong>Conto corrente</strong><small>Collega il tuo primo conto</small></div><b>—</b></div><div className="account-card"><span className="account-mark wallet">◉</span><div><strong>Risparmi</strong><small>Aggiungi un conto deposito</small></div><b>—</b></div></div></article>
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light');
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand"><span className="brand-mark">f.</span><span>finanza<small>PERSONAL TRACKER</small></span></NavLink>
        <p className="nav-caption">MENU</p>
        <nav aria-label="Navigazione principale">{navigation.map(({ path, label, icon }) => <NavLink end={path === '/'} to={path} key={path} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span className="nav-icon">{icon}</span><span>{label}</span>{label === 'Review' && <span className="nav-count">0</span>}</NavLink>)}</nav>
        <div className="sidebar-bottom"><div className="privacy-card"><span>◉</span><div><strong>I tuoi dati restano tuoi</strong><small>Archiviati solo su questo dispositivo.</small></div></div><button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Attiva tema ${theme === 'light' ? 'scuro' : 'chiaro'}`}><span>{theme === 'light' ? '☾' : '☀'}</span> Tema {theme === 'light' ? 'chiaro' : 'scuro'}<span className="toggle-track"><i /></span></button></div>
      </aside>
      <main className="main-area"><header className="mobile-header"><NavLink to="/" className="brand"><span className="brand-mark">f.</span><span>finanza</span></NavLink><button className="mobile-theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Cambia tema">{theme === 'light' ? '☾' : '☀'}</button></header><Routes>{navigation.map(({ path, label }) => <Route key={path} path={path} element={<Placeholder title={label} />} />)}<Route path="*" element={<Navigate to="/" replace />} /></Routes><footer className="app-footer">Finanza personale <span>·</span> I tuoi dati, sul tuo dispositivo</footer></main>
      {moreOpen && <><button className="menu-scrim" aria-label="Chiudi menu" onClick={() => setMoreOpen(false)} /><div className="more-menu" aria-label="Menu altre sezioni">{navigation.slice(4).map(({ path, label, icon }) => <NavLink to={path} key={path} onClick={() => setMoreOpen(false)} className={({ isActive }) => `more-link${isActive ? ' active' : ''}`}><span>{icon}</span>{label}</NavLink>)}</div></>}
      <nav className="bottom-nav" aria-label="Navigazione mobile">
        {navigation.slice(0, 4).map(({ path, label, icon }) => <NavLink end={path === '/'} to={path} key={path} className={({ isActive }) => `bottom-link${isActive ? ' active' : ''}`}><span>{icon}</span><small>{label}</small></NavLink>)}
        <button className={`bottom-link${moreOpen || navigation.slice(4).some((item) => window.location.hash.includes(item.path)) ? ' active' : ''}`} onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-label="Altre sezioni"><span>•••</span><small>Altro</small></button>
      </nav>
    </div>
  );
}
