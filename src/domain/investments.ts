export interface InvestmentValuation {
  id: string;
  accountId: string;
  date: string;
  valueCents: number;
  source: 'manual' | 'import';
  note?: string;
  createdAt: string;
}
