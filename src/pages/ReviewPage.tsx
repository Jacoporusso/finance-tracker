import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import PageHeader from '../components/PageHeader';
import TransactionCard from '../dashboard/TransactionCard';
import { getLegacyDepositTransferReviewCandidates } from '../transfers/deposit';

export default function ReviewPage() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const legacy = useLiveQuery(getLegacyDepositTransferReviewCandidates, []);
  const suspectIds = new Set((legacy ?? []).map((row) => row.id));
  const loading = transactions === undefined || accounts === undefined || categories === undefined || legacy === undefined;
  const queue = (transactions ?? [])
    .filter((transaction) => Boolean(transaction.reviewReason) || suspectIds.has(transaction.id))
    .map((transaction) => suspectIds.has(transaction.id) ? { ...transaction, reviewReason: transaction.reviewReason || 'possible-transfer' } : transaction)
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));

  return (
    <section className="min-w-0">
      <PageHeader title="Da verificare" description="Controlla corrispondenze e trasferimenti dubbi. I totali seguono il tipo attuale: i trasferimenti restano esclusi finché non li riclassifichi." />
      {!!legacy?.length && <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{legacy.length} movimenti ING sono stati classificati con una vecchia regola troppo generica. Apri la modifica del tipo e conferma se sono davvero trasferimenti tra conti tuoi oppure entrate o spese.</p>}
      {loading ? <p role="status" className="rounded-2xl border border-line bg-surface px-5 py-8 text-center text-sm text-muted">Caricamento verifiche…</p> : queue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center">
          <h2 className="text-lg font-semibold text-ink">Nessuna verifica in sospeso</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">Quando un import richiede un controllo, il movimento comparirà qui. I movimenti originali restano disponibili.</p>
          <Link to="/transactions" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">Vedi tutti i movimenti</Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{queue.length} {queue.length === 1 ? 'movimento da verificare' : 'movimenti da verificare'}</p>
          <ul className="grid min-w-0 gap-3">
            {queue.map((transaction) => (
              <li key={transaction.id} className="min-w-0">
                <TransactionCard transaction={transaction} accounts={accounts ?? []} categories={categories ?? []} />
                <Link to={`/transactions?search=${encodeURIComponent(transaction.sourceOperation || transaction.rawDescription)}`} className="mt-1 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-green hover:bg-green-soft">Apri tra i movimenti</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
