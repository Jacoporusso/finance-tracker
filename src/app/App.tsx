import AppErrorBoundary from '../components/AppErrorBoundary';
import AppRoutes from './AppRoutes';
import SettingsProvider from './SettingsProvider';

export default function App() {
  return <AppErrorBoundary><SettingsProvider><AppRoutes /></SettingsProvider></AppErrorBoundary>;
}
