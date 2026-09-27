/** Parses an Italian euro amount into integer cents. */
export function parseMoneyToCents(input: string): number {
  if (typeof input !== 'string') {
    throw new TypeError('Amount must be a string');
  }

  const value = input.trim().replace(/\u20ac$/u, '').trim();
  if (!value || !/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/u.test(value)) {
    throw new TypeError('Invalid Italian money amount');
  }

  const negative = value.startsWith('-');
  const unsigned = value.replace(/^[+-]/u, '').replace(/\./gu, '');
  const [whole, fraction = ''] = unsigned.split(',');
  const absoluteCents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const signedCents = negative ? -absoluteCents : absoluteCents;
  const cents = Number(signedCents);
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Amount exceeds the safe integer cents range');
  }
  return cents;
}

export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError('Cents must be a safe integer');
  }
  const formatter = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  });
  const absoluteCents = BigInt(Math.abs(cents));
  const wholeEuros = absoluteCents / 100n;
  const fractionalCents = (absoluteCents % 100n).toString().padStart(2, '0');
  const sign = cents < 0 ? -1n : 1n;
  const patternEuros = wholeEuros === 0n ? 1n : wholeEuros;
  // Italian Intl defaults suppress grouping for four-digit values (1.000).
  // Group explicitly so 1.000,00 is consistent with 10.000,00 and above.
  const groupedEuros = wholeEuros.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
  let integerReplaced = false;

  return formatter.formatToParts(sign * patternEuros).map((part) => {
    if (part.type === 'integer' && !integerReplaced) {
      integerReplaced = true;
      return groupedEuros;
    }
    if (part.type === 'integer' || part.type === 'group') return '';
    if (part.type === 'fraction') return fractionalCents;
    return part.value;
  }).join('');
}
