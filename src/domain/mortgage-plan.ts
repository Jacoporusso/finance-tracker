import * as XLSX from 'xlsx';
import type { MortgageDetails, MortgageInstallment } from './transactions';
import { mortgageSchema, mortgageWarnings } from './mortgage-validation';
import { parseMoneyToCents } from './money';

const parserVersion = 2;

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function money(value: unknown, field: string): number {
  if (value === null || value === undefined || value === '') throw new Error(`Importo mancante nella colonna ${field}.`);
  if (typeof value === 'number') {
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents)) throw new Error(`Importo non valido nella colonna ${field}.`);
    return cents;
  }
  const text = String(value).trim().replace(/[€\s]/gu, '');
  if (!text) throw new Error(`Importo mancante nella colonna ${field}.`);
  try { return parseMoneyToCents(text); } catch {
    // Strict English fallback: comma grouping and dot decimal, or plain decimal.
    if (/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/u.test(text)) {
      const cents = Math.round(Number(text.replace(/,/gu, '')) * 100);
      if (Number.isSafeInteger(cents)) return cents;
    }
    throw new Error(`Importo non valido nella colonna ${field}.`);
  }
}

function date(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
    throw new Error('Data rata Excel non valida.');
  }
  const text = String(value ?? '').trim();
  const it = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/u.exec(text);
  const en = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  const result = it ? `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}` : en ? text : '';
  if (!result || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw new Error('Data rata mancante o non valida.');
  return result;
}

function status(value: unknown): MortgageInstallment['status'] {
  const text = normalized(value);
  if (/\b(da pagare|da rimborsare|non pagat[ao]|due|unpaid|outstanding|scadut[ao])\b/u.test(text)) return 'due';
  if (/\b(pagat[aoe]|paid|settled|eseguit[ao])\b/u.test(text)) return 'paid';
  return 'other';
}

function summaryValue(rows: unknown[][], labels: string[]): unknown {
  for (const row of rows) {
    for (let column = 0; column < row.length; column += 1) {
      if (!labels.some((label) => normalized(row[column]).includes(label))) continue;
      for (let next = column + 1; next < row.length; next += 1) {
        if (row[next] !== null && row[next] !== undefined && String(row[next]).trim()) return row[next];
      }
    }
  }
  return undefined;
}

function maskAccount(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const digits = text.replace(/\D/gu, '');
  if (digits.length < 4) return text;
  return `•••• ${digits.slice(-4)}`;
}

export async function parseMortgagePlan(file: File): Promise<MortgageDetails> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Il file Excel non contiene fogli.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const aliases = {
    number: ['nr.', 'numero rata', 'installment number', 'number'],
    date: ['scadenza', 'data scadenza', 'due date', 'deadline'],
    status: ['stato', 'status'],
    principal: ['quota capitale', 'capitale', 'principal'],
    interest: ['quota interessi', 'interessi', 'interest'],
    other: ['altri importi', 'altre spese', 'spese', 'other charges', 'other'],
    payment: ['importo rata', 'rata', 'installment amount', 'payment'],
    residual: ['capitale residuo', 'debito residuo', 'residual principal', 'residual'],
  };
  const matches = (cell: unknown, names: string[]) => names.some((name) => normalized(cell) === normalized(name));
  const headerIndex = rows.findIndex((row) => aliases.number.some((name) => row.some((cell) => matches(cell, [name])))
    && aliases.date.some((name) => row.some((cell) => matches(cell, [name]))));
  if (headerIndex < 0) throw new Error('Non trovo la tabella delle rate nel piano Excel.');
  const header = rows[headerIndex];
  const column = (names: string[]) => header.findIndex((cell) => matches(cell, names));
  const indexes = {
    number: column(aliases.number), date: column(aliases.date), status: column(aliases.status),
    principal: column(aliases.principal), interest: column(aliases.interest), other: column(aliases.other),
    payment: column(aliases.payment), residual: column(aliases.residual),
  };
  if ([indexes.number, indexes.date, indexes.principal, indexes.interest, indexes.payment, indexes.residual].some((value) => value < 0)) {
    throw new Error('Il piano non contiene tutte le colonne necessarie.');
  }
  const installments: MortgageInstallment[] = [];
  for (const [offset, row] of rows.slice(headerIndex + 1).entries()) {
    const rawNumber = row[indexes.number];
    if (rawNumber === null || rawNumber === undefined || String(rawNumber).trim() === '') continue;
    const number = typeof rawNumber === 'number' ? rawNumber : Number(String(rawNumber).trim());
    if (!Number.isInteger(number) || number <= 0) throw new Error(`Numero rata non valido alla riga ${headerIndex + offset + 2}.`);
    const otherCents = indexes.other >= 0 && row[indexes.other] !== null && row[indexes.other] !== '' ? money(row[indexes.other], 'altre spese') : 0;
    installments.push({
      number,
      dueDate: date(row[indexes.date]),
      status: indexes.status >= 0 ? status(row[indexes.status]) : 'other',
      principalCents: money(row[indexes.principal], 'quota capitale'),
      interestCents: money(row[indexes.interest], 'quota interessi'),
      ...(indexes.other >= 0 ? { otherCents } : {}),
      installmentCents: money(row[indexes.payment], 'importo rata'),
      residualCents: money(row[indexes.residual], 'capitale residuo'),
    });
  }
  if (!installments.length) throw new Error('Non sono state trovate rate nel piano Excel.');

  const original = summaryValue(rows.slice(0, headerIndex), ['importo erogato', 'importo finanziato', 'original amount', 'loan amount']);
  const residual = summaryValue(rows.slice(0, headerIndex), ['debito residuo', 'residual debt']);
  const account = summaryValue(rows.slice(0, headerIndex), ['modalita di addebito', 'conto di addebito', 'account debit', 'payment account']);
  const contract = summaryValue(rows.slice(0, headerIndex), ['numero finanziamento', 'numero contratto', 'contract number', 'loan number']);
  const plan: MortgageDetails = {
    parserVersion,
    originalAmountCents: original === undefined ? undefined : money(original, 'importo erogato'),
    debtResidualCents: residual === undefined ? undefined : money(residual, 'debito residuo'),
    accountLabel: maskAccount(account),
    contractNumber: contract === undefined ? undefined : String(contract).split('/').at(-1)?.replace(/\D/gu, '') || undefined,
    scheduleFileName: file.name,
    installments,
  };
  const parsed = mortgageSchema.safeParse(plan);
  if (!parsed.success) throw new Error(`Piano mutuo non valido: ${parsed.error.issues[0]?.message ?? 'struttura non valida'}`);
  plan.warnings = mortgageWarnings(parsed.data);
  return plan;
}
