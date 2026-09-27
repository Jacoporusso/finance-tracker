import type { BankParser, DetectionResult, ParsedWorkbook } from '../core/parser';
import type { ParsedImport, ParsedRow } from '../core/types';
import {
  cellText,
  effectiveRange,
  findHeaderRow,
  getCell,
  maskIdentifier,
  normalizeHeader,
  parseAmountCents,
  parseBankDate,
} from '../core/normalize';

const HEADERS = ['Data', 'Operazione', 'Dettagli', 'Conto o carta', 'Contabilizzazione', 'Categoria', 'Valuta', 'Importo'] as const;
const VERSION = '1.0.0';

function locate(workbook: ParsedWorkbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const header = findHeaderRow(sheet, HEADERS);
    if (header) return { sheetName, sheet, header };
  }
  return undefined;
}

function findMetadata(workbook: ParsedWorkbook, headerRow: number): ParsedImport['metadata'] {
  const metadata: ParsedImport['metadata'] = {};
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = effectiveRange(sheet);
    for (let row = range.s.r; row < Math.min(headerRow, range.e.r + 1); row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const raw = cellText(getCell(sheet, row, col));
        const label = normalizeHeader(raw);
        const next = cellText(getCell(sheet, row, col + 1));
        const accountText = /conto|carta|iban/.test(label) ? `${raw} ${next}` : '';
        const suffix = accountText.match(/(?:\*{2,}|x{2,}|•{2,})\s*([0-9]{2,4})\b/i)?.[1];
        if (suffix) metadata.maskedIdentifier ??= maskIdentifier(suffix);
        else if (/iban/.test(label)) {
          const identifier = next.match(/IT[\sA-Z0-9]{10,}/i)?.[0];
          if (identifier) metadata.maskedIdentifier ??= maskIdentifier(identifier);
        }

        if (/data inizio periodo|periodo da|dal/.test(label)) metadata.periodFrom ??= parseBankDate(next || raw.split(':').slice(1).join(':'));
        if (/data fine periodo|periodo a|al/.test(label)) metadata.periodTo ??= parseBankDate(next || raw.split(':').slice(1).join(':'));
      }
    }
  }
  return metadata;
}

function parse(workbook: ParsedWorkbook): ParsedImport {
  const located = locate(workbook);
  const result: ParsedImport = {
    bank: 'INTESA', parserVersion: VERSION, rows: [], warnings: [], errors: [], metadata: {},
  };
  if (!located) {
    result.errors.push('Formato Intesa non riconosciuto: intestazioni richieste non trovate.');
    return result;
  }

  const { sheet, header } = located;
  result.metadata = findMetadata(workbook, header.rowIndex);
  const columns = header.columns;
  const getColumn = (name: string) => columns.get(normalizeHeader(name)) as number;
  const range = effectiveRange(sheet);

  for (let index = header.rowIndex + 1; index <= range.e.r; index += 1) {
    const values = HEADERS.map((name) => getCell(sheet, index, getColumn(name)));
    if (values.every((value) => cellText(value) === '')) continue;
    const rowNumber = index + 1;
    const [dateRaw, operationRaw, detailsRaw, accountRaw, statusRaw, categoryRaw, currencyRaw, amountRaw] = values;
    const bookingDate = parseBankDate(dateRaw);
    const currencyText = cellText(currencyRaw).toUpperCase();
    const amountCents = parseAmountCents(amountRaw);
    const normalizedStatus = normalizeHeader(statusRaw);
    const reasons: string[] = [];
    if (!bookingDate) reasons.push('data');
    if (amountCents === undefined) reasons.push('importo');
    if (currencyText !== 'EUR' && currencyText !== '€') reasons.push('valuta non supportata');
    if (!['contabilizzato', 'non contabilizzato'].includes(normalizedStatus)) reasons.push('stato');
    if (reasons.length) {
      result.errors.push(`Riga ${rowNumber}: ${reasons.join(', ')} non valido.`);
      continue;
    }

    const sourceOperation = cellText(operationRaw) || undefined;
    const rawDescription = cellText(detailsRaw) || sourceOperation || '';
    const status = normalizedStatus === 'non contabilizzato' ? 'pending' : 'posted';
    const id = rawDescription.match(/\bCOD\.?\s*DISP\.?\s*[:#-]?\s*([A-Z0-9]{4,})\b/i)?.[1];
    const row: ParsedRow = {
      sourceRowIndex: rowNumber,
      bookingDate: bookingDate as string,
      amountCents: amountCents as number,
      currency: 'EUR',
      status,
      rawDescription,
    };
    if (sourceOperation) row.sourceOperation = sourceOperation;
    const sourceCategory = cellText(categoryRaw);
    if (sourceCategory) row.sourceCategory = sourceCategory;
    const sourceAccountLabel = cellText(accountRaw);
    if (sourceAccountLabel) row.sourceAccountLabel = sourceAccountLabel;
    if (id) row.externalTransactionId = id;
    result.rows.push(row);
  }

  const sourceAccounts = new Set(result.rows
    .map((row) => row.sourceAccountLabel?.trim())
    .filter((value): value is string => Boolean(value)));
  if (sourceAccounts.size > 1) {
    result.errors.push('Il file contiene più conti. Esportare un solo conto alla volta.');
  }
  if (result.rows.length) {
    const dates = result.rows.map((row) => row.bookingDate).sort();
    result.metadata.periodFrom ??= dates[0];
    result.metadata.periodTo ??= dates[dates.length - 1];
  }
  if (!result.rows.length && !result.errors.length) result.warnings.push('Il foglio non contiene movimenti.');
  return result;
}

export const intesaParser: BankParser = {
  id: 'INTESA',
  version: VERSION,
  detect(workbook): DetectionResult {
    const match = locate(workbook);
    return match ? { bank: 'INTESA', confidence: 1, sheetName: match.sheetName } : { bank: 'UNKNOWN', confidence: 0 };
  },
  parse,
};
