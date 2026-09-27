import { Outlet } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import DashboardNavigation from './DashboardNavigation';

export default function DashboardLayout() {
  return <section className="min-w-0">
    <PageHeader title="Dashboard" description="Patrimonio, entrate e risparmio del tuo archivio locale." />
    <DashboardNavigation />
    <Outlet />
  </section>;
}
