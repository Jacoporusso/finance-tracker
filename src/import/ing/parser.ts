import type { BankParser, DetectionResult, ParsedWorkbook } from '../core/parser';
import type { ParsedImport, ParsedRow } from '../core/types';
import {
  cellText,
  effectiveRange,
  extractDateRange,
  findHeaderRow,
  getCell,
  maskIdentifier,
  normalizeHeader,
  parseAmountCents,
  parseBankDate,
} from '../core/normalize';

const HEADERS = ['DATA CONTABILE', 'DATA VALUTA', 'CAUSALE', 'DESCRIZIONE OPERAZIONE', 'IMPORTO IN EURO'] as const;
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
  const ibanPattern = /\bIT\s*\d{2}(?:\s*[A-Z]\s*\d{2})?(?:\s*\d{4}){4}\s*\d{3}\b/i;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = effectiveRange(sheet);
    for (let row = range.s.r; row < Math.min(headerRow, range.e.r + 1); row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const raw = cellText(getCell(sheet, row, col));
        if (!raw) continue;
        const normalized = normalizeHeader(raw);
        const value = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw;
        if (/saldo iniziale/.test(normalized)) {
          const cents = parseAmountCents(value);
          if (cents !== undefined) metadata.openingBalanceCents = cents;
        } else if (/saldo finale/.test(normalized)) {
          const cents = parseAmountCents(value);
          if (cents !== undefined) metadata.closingBalanceCents = cents;
        } else if (/periodo|dal\s+\d|estratt[oa]/.test(normalized)) {
          const dates = extractDateRange(raw);
          metadata.periodFrom ??= dates.from;
          metadata.periodTo ??= dates.to;
        }
        const iban = raw.match(ibanPattern)?.[0];
        if (iban) metadata.maskedIdentifier ??= maskIdentifier(iban);
        else if (/\b(?:n\.?\s*di\s*conto|numero\s*conto)\b/i.test(raw)) {
          const identifier = value.match(/[A-Z0-9*]{5,}/i)?.[0];
          if (identifier) metadata.maskedIdentifier ??= maskIdentifier(identifier);
        }
      }
    }
  }
  if (metadata.periodTo) metadata.balanceDate = metadata.periodTo;
  return metadata;
}

function parse(workbook: ParsedWorkbook): ParsedImport {
  const located = locate(workbook);
  const result: ParsedImport = {
    bank: 'ING', parserVersion: VERSION, rows: [], warnings: [], errors: [], metadata: {},
  };
  if (!located) {
    result.errors.push('Formato ING non riconosciuto: intestazioni richieste non trovate.');
    return result;
  }

  const { sheet, header } = located;
  result.metadata = findMetadata(workbook, header.rowIndex);
  const columns = header.columns;
  const getColumn = (name: string) => columns.get(normalizeHeader(name)) as number;
  const range = effectiveRange(sheet);

  for (let index = header.rowIndex + 1; index <= range.e.r; index += 1) {
    const bookingRaw = getCell(sheet, index, getColumn(HEADERS[0]));
    const valueRaw = getCell(sheet, index, getColumn(HEADERS[1]));
    const operationRaw = getCell(sheet, index, getColumn(HEADERS[2]));
    const descriptionRaw = getCell(sheet, index, getColumn(HEADERS[3]));
    const amountRaw = getCell(sheet, index, getColumn(HEADERS[4]));
    if ([bookingRaw, valueRaw, operationRaw, descriptionRaw, amountRaw].every((value) => cellText(value) === '')) continue;

    const rowNumber = index + 1;
    const bookingDate = parseBankDate(bookingRaw);
    const valueDate = parseBankDate(valueRaw);
    const amountCents = parseAmountCents(amountRaw);
    const reasons: string[] = [];
    if (!bookingDate) reasons.push('data contabile');
    if (!valueDate && cellText(valueRaw)) reasons.push('data valuta');
    if (amountCents === undefined) reasons.push('importo');
    if (reasons.length) {
      result.errors.push(`Riga ${rowNumber}: ${reasons.join(', ')} non valido.`);
      continue;
    }

    const sourceOperation = cellText(operationRaw) || undefined;
    const rawDescription = cellText(descriptionRaw) || sourceOperation || '';
    const externalTransactionId =
      rawDescription.match(/\bCPU(?:\s*(?:ID|COD(?:ICE)?)?)?\s*[:#-]?\s*([A-Z0-9]{5,})\b/i)?.[1] ??
      rawDescription.match(/\bN\.\s*([A-Z0-9]{4,})\b/i)?.[1];
    const row: ParsedRow = {
      sourceRowIndex: rowNumber,
      bookingDate: bookingDate as string,
      amountCents: amountCents as number,
      currency: 'EUR',
      status: 'posted',
      rawDescription,
    };
    if (valueDate) row.valueDate = valueDate;
    if (sourceOperation) row.sourceOperation = sourceOperation;
    if (externalTransactionId) row.externalTransactionId = externalTransactionId;
    result.rows.push(row);
  }

  if (result.rows.length) {
    const dates = result.rows.map((row) => row.bookingDate).sort();
    result.metadata.periodFrom ??= dates[0];
    result.metadata.periodTo ??= dates[dates.length - 1];
  }
  if (!result.rows.length && !result.errors.length) result.warnings.push('Il foglio non contiene movimenti.');
  return result;
}

export const ingParser: BankParser = {
  id: 'ING',
  version: VERSION,
  detect(workbook): DetectionResult {
    const match = locate(workbook);
    return match ? { bank: 'ING', confidence: 1, sheetName: match.sheetName } : { bank: 'UNKNOWN', confidence: 0 };
  },
  parse,
};
