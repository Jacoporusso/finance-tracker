import { NavLink } from 'react-router-dom';

export default function DashboardNavigation() {
  return <nav aria-label="Viste dashboard" className="mb-6 flex gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-card">
    {[{ to: '/', label: 'Patrimonio' }, { to: '/dashboard/flows', label: 'Entrate e spese' }, { to: '/dashboard/savings', label: 'Risparmio' }].map(({ to, label }) => (
      <NavLink key={to} to={to} end className={({ isActive }) => `flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl px-2 py-2 text-center text-sm font-semibold ${isActive ? 'bg-green text-on-green' : 'text-muted hover:bg-canvas'}`}>{label}</NavLink>
    ))}
  </nav>;
}
