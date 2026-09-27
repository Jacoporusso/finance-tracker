import {
  Squares2X2Icon, ArrowUpTrayIcon, ArrowsUpDownIcon, WalletIcon,
  ChartPieIcon, HomeModernIcon, ClipboardDocumentCheckIcon, Cog6ToothIcon,
} from '@heroicons/react/24/outline';

export const navigation = [
  { path: '/', label: 'Dashboard', Icon: Squares2X2Icon },
  { path: '/import', label: 'Import', Icon: ArrowUpTrayIcon },
  { path: '/transactions', label: 'Movimenti', Icon: ArrowsUpDownIcon },
  { path: '/accounts', label: 'Conti', Icon: WalletIcon },
  { path: '/investments', label: 'Investimenti', Icon: ChartPieIcon },
  { path: '/liabilities', label: 'Passività', Icon: HomeModernIcon },
  { path: '/review', label: 'Review', Icon: ClipboardDocumentCheckIcon },
  { path: '/settings', label: 'Impostazioni', Icon: Cog6ToothIcon },
];
