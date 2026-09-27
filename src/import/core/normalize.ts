import * as XLSX from 'xlsx';

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .replace(/\s+/g, ' ');
}

export function cellText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

export function parseBankDate(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    // SheetJS represents Excel date cells as UTC midnight when cellDates is enabled.
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y > 0 && parsed.m > 0 && parsed.d > 0) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    return undefined;
  }

  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:$|\s)/.exec(text);
  if (local) {
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    return validDate(year, Number(local[2]), Number(local[1]));
  }
  return undefined;
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseAmountCents(value: unknown): number | undefined {
  if (typeof value === 'number') {
    const cents = Math.round(value * 100);
    return Number.isFinite(value)
      && Number.isSafeInteger(cents)
      && Math.abs(value - cents / 100) <= 1e-7
      ? cents
      : undefined;
  }
  if (typeof value !== 'string') return undefined;

  let text = value.trim().replace(/[€\u00a0\u202f\s]/g, '').replace(/(?:EUR|euro)/gi, '');
  if (!text) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const leadingSign = /^[+-]/.exec(text)?.[0];
  const trailingSign = /[+-]$/.exec(text)?.[0];
  if ((leadingSign && trailingSign) || (leadingSign && !/^[+-]/.test(text)) || (trailingSign && !/[+-]$/.test(text))) return undefined;
  if (leadingSign === '-' || (!leadingSign && trailingSign === '-')) negative = !negative;
  text = text.replace(/^[+-]|[+-]$/g, '').replace(/[’']/g, '');
  if (!/^\d[\d.,]*$/.test(text)) return undefined;

  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  const separator = Math.max(comma, dot);
  let whole = text;
  let fraction = '';
  if (separator >= 0) {
    const tailLength = text.length - separator - 1;
    if (tailLength === 1 || tailLength === 2) {
      whole = text.slice(0, separator);
      fraction = text.slice(separator + 1);
    } else if (tailLength === 0) {
      return undefined;
    } else if (tailLength === 3) {
      if (text.includes(',') && text.includes('.')) return undefined;
      if (!validGrouping(text)) return undefined;
      whole = text.replace(/[.,]/g, '');
    } else {
      return undefined;
    }
  }
  if (whole.includes('.') || whole.includes(',')) {
    if (!validGrouping(whole)) return undefined;
    whole = whole.replace(/[.,]/g, '');
  }
  if (!/^\d+$/.test(whole) || (fraction && !/^\d{1,2}$/.test(fraction))) return undefined;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents)) return undefined;
  return negative ? -cents : cents;
}

function validGrouping(value: string): boolean {
  const separators = value.match(/[.,]/g) ?? [];
  return separators.length > 0
    && new Set(separators).size === 1
    && /^\d{1,3}(?:[.,]\d{3})+$/.test(value);
}

export function findHeaderRow(
  sheet: XLSX.WorkSheet,
  requiredHeaders: readonly string[],
): { rowIndex: number; columns: Map<string, number> } | undefined {
  const range = effectiveRange(sheet);
  const required = requiredHeaders.map(normalizeHeader);
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const columns = new Map<string, number>();
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
      const header = normalizeHeader(cell?.v);
      if (header) columns.set(header, colIndex);
    }
    if (required.every((header) => columns.has(header))) return { rowIndex, columns };
  }
  return undefined;
}

/**
 * SheetJS normally uses the worksheet `!ref` dimension. Some bank exports
 * leave that dimension stale (for example A1:J33 while cells exist through
 * row 463), so derive the bounds from the actual cell addresses as well.
 */
export function effectiveRange(sheet: XLSX.WorkSheet): XLSX.Range {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const cell = XLSX.utils.decode_cell(address);
    range.s.r = Math.min(range.s.r, cell.r);
    range.s.c = Math.min(range.s.c, cell.c);
    range.e.r = Math.max(range.e.r, cell.r);
    range.e.c = Math.max(range.e.c, cell.c);
  }
  return range;
}

export function getCell(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number): unknown {
  return sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })]?.v;
}

export function maskIdentifier(value: string): string | undefined {
  const compact = value.replace(/\s/g, '');
  const lastFour = compact.slice(-4);
  return lastFour ? `••••${lastFour}` : undefined;
}

export function extractDateRange(value: string): { from?: string; to?: string } {
  const dateTokens = value.match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/g) ?? [];
  return { from: parseBankDate(dateTokens[0]), to: parseBankDate(dateTokens[1]) };
}
