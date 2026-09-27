import { Link } from 'react-router-dom';
import { FolderOpenIcon } from '@heroicons/react/24/outline';
import PageHeader from '../components/PageHeader';

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <><PageHeader title={title} description={description} /><section className="rounded-2xl border border-dashed border-line bg-surface px-5 py-12 text-center"><FolderOpenIcon className="mx-auto size-10 text-green" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold">Sezione in preparazione</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">Puoi già configurare i tuoi conti e personalizzare le categorie.</p><Link to="/accounts" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-green px-5 font-medium text-on-green">Vai ai conti</Link></section></>;
}
