import type { TransactionKind } from '../domain/transactions';
import { transactionKindLabel } from '../dashboard/transactionOptions';

const kindClasses: Record<TransactionKind, string> = {
  expense: 'border-kind-expense-fg/25 bg-kind-expense-bg text-kind-expense-fg',
  income: 'border-kind-income-fg/25 bg-kind-income-bg text-kind-income-fg',
  fee: 'border-kind-fee-fg/25 bg-kind-fee-bg text-kind-fee-fg',
  interest: 'border-kind-income-fg/25 bg-kind-income-bg text-kind-income-fg',
  internal_transfer: 'border-kind-transfer-fg/25 bg-kind-transfer-bg text-kind-transfer-fg',
  investment_transfer: 'border-kind-investment-fg/25 bg-kind-investment-bg text-kind-investment-fg',
  other: 'border-kind-other-fg/25 bg-kind-other-bg text-kind-other-fg',
};

interface TransactionKindChipProps {
  kind: TransactionKind;
  className?: string;
}

export default function TransactionKindChip({ kind, className = '' }: TransactionKindChipProps) {
  const variant = kindClasses[kind] ?? kindClasses.other;

  return (
    <span className={[
      'inline-flex min-h-7 max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5',
      variant,
      className,
    ].filter(Boolean).join(' ')}>
      {transactionKindLabel(kind)}
    </span>
  );
}
