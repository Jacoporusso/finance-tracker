/** Format an ISO calendar date for people; keep storage and filtering in ISO form. */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
