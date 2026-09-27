export const TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 86_400_000;

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Bangkok. */
export function bangkokDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d);
}

/** Start of a Bangkok calendar day (YYYY-MM-DD) as epoch ms. */
export function bangkokDayStart(date: string): number {
  return Date.parse(`${date}T00:00:00+07:00`);
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

export { DAY_MS };
