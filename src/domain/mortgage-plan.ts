import * as XLSX from 'xlsx';
import type { MortgageDetails, MortgageInstallment } from './transactions';
import { parseMoneyToCents } from './money';

function money(value: unknown): number {
  const text = String(value ?? '').replace(/€/gu, '').trim();
  if (!text) return 0;
  // SheetJS can expose Italian-formatted cells as an English decimal string
  // (e.g. 489.60). Treat a two-digit suffix as cents before Italian parsing,
  // otherwise 489.60 would be mistaken for 48,960 euros.
  if (/^-?\d+\.\d{1,2}$/u.test(text) && !text.includes(',')) return Math.round(Number(text) * 100);
  try { return parseMoneyToCents(text); } catch {
    const normalized = text.includes(',') && text.includes('.')
      ? (text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./gu, '').replace(',', '.') : text.replace(/,/gu, ''))
      : text.replace(',', '.');
    return Math.round(Number(normalized) * 100);
  }
}

function isoDate(value: unknown): string {
  const text = String(value ?? '').trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text;
}

export async function parseMortgagePlan(file: File): Promise<MortgageDetails> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null, raw: false });
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? '').trim().toLowerCase() === 'nr.'));
  if (headerIndex < 0) throw new Error('Non trovo la tabella delle rate nel piano Excel.');
  const header = rows[headerIndex].map((cell) => String(cell ?? '').trim().toLowerCase());
  const index = (names: string[]) => header.findIndex((cell) => names.some((name) => cell.includes(name)));
  const numberIndex = index(['nr.']);
  const dateIndex = index(['scadenza']);
  const statusIndex = index(['stato']);
  const principalIndex = index(['quota capitale']);
  const interestIndex = index(['quota interessi']);
  const paymentIndex = index(['importo rata']);
  const residualIndex = index(['capitale residuo']);
  if ([numberIndex, dateIndex, principalIndex, interestIndex, paymentIndex, residualIndex].some((value) => value < 0)) throw new Error('Il piano non contiene tutte le colonne necessarie.');
  const installments: MortgageInstallment[] = rows.slice(headerIndex + 1).flatMap((row) => {
    const number = Number(row[numberIndex]);
    if (!Number.isInteger(number) || number <= 0) return [];
    const rawStatus = String(row[statusIndex] ?? '').toLowerCase();
    return [{ number, dueDate: isoDate(row[dateIndex]), status: rawStatus.includes('pagat') ? 'paid' : rawStatus.includes('pag') || rawStatus.includes('da pagare') ? 'due' : 'other', principalCents: money(row[principalIndex]), interestCents: money(row[interestIndex]), installmentCents: money(row[paymentIndex]), residualCents: money(row[residualIndex]) }];
  });
  if (!installments.length) throw new Error('Non sono state trovate rate nel piano Excel.');
  const findSummary = (label: string) => rows.find((row) => String(row[3] ?? '').toLowerCase().includes(label))?.[4];
  return { originalAmountCents: money(findSummary('importo erogato')), debtResidualCents: money(findSummary('debito residuo')), accountLabel: String(findSummary('modalità di addebito') ?? '').trim() || undefined, scheduleFileName: file.name, installments };
}
