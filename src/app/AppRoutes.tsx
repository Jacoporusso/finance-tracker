import { Route, Routes, Link, Navigate } from 'react-router-dom';
import DashboardLayout from '../dashboard/DashboardLayout';
import AppShell from '../components/layout/AppShell';
import DashboardPage from '../pages/DashboardPage';
import GraphsPage from '../pages/GraphsPage';
import AccountsPage from '../pages/AccountsPage';
import CategoriesPage from '../pages/CategoriesPage';
import SettingsPage from '../pages/SettingsPage';
import PlaceholderPage from '../pages/PlaceholderPage';
import ImportPage from '../pages/ImportPage';
import TransactionsPage from '../pages/TransactionsPage';
import LiabilitiesPage from '../pages/LiabilitiesPage';
import LiabilityDetailPage from '../pages/LiabilityDetailPage';
import ReviewPage from '../pages/ReviewPage';
import ImportHistory from '../import/ImportHistory';

export default function AppRoutes() {
  return <Routes><Route element={<AppShell />}>
    <Route element={<DashboardLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="dashboard/flows" element={<GraphsPage view="flows" />} />
      <Route path="dashboard/savings" element={<GraphsPage view="savings" />} />
    </Route>
    <Route path="graphs" element={<Navigate to="/dashboard/flows" replace />} />
    <Route path="accounts" element={<AccountsPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="settings/categories" element={<CategoriesPage />} />
    <Route path="import" element={<ImportPage />} />
    <Route path="import/history" element={<section><h1 className="text-2xl font-bold">Importazioni</h1><ImportHistory /></section>} />
    <Route path="transactions" element={<TransactionsPage />} />
    <Route path="investments" element={<PlaceholderPage title="Investimenti" description="Trade Republic e la gestione dei titoli sono rimandati. Puoi includere un saldo investimenti manuale dalla pagina Conti." />} />
    <Route path="liabilities" element={<LiabilitiesPage />} />
    <Route path="liabilities/:liabilityId" element={<LiabilityDetailPage />} />
    <Route path="review" element={<ReviewPage />} />
    <Route path="*" element={<section><h1 className="text-2xl font-bold">Pagina non trovata</h1><Link to="/" className="mt-4 inline-flex min-h-11 items-center text-green">Torna alla dashboard</Link></section>} />
  </Route></Routes>;
}
