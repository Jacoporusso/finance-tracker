export function todayInRome(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new TypeError('Invalid date');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) {
    throw new Error('Could not determine the date in Europe/Rome');
  }
  return `${year}-${month}-${day}`;
}
