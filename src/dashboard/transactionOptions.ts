import type { TransactionKind } from '../domain/transactions';

export const transactionKinds: { value: TransactionKind; label: string }[] = [
  { value: 'income', label: 'Entrata' },
  { value: 'expense', label: 'Spesa' },
  { value: 'fee', label: 'Commissione' },
  { value: 'interest', label: 'Interesse' },
  { value: 'internal_transfer', label: 'Trasferimento interno' },
  { value: 'investment_transfer', label: 'Trasferimento a investimenti' },
  { value: 'other', label: 'Altro' },
];

export const transactionStatuses = [
  { value: 'posted', label: 'Contabilizzato' },
  { value: 'pending', label: 'In attesa' },
  { value: 'cancelled', label: 'Annullato' },
] as const;

export function transactionKindLabel(kind: TransactionKind): string {
  return transactionKinds.find((item) => item.value === kind)?.label ?? 'Altro';
}
