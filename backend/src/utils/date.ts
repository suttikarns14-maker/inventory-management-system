export const DAY_MS = 86_400_000;

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Bangkok. */
export function bangkokDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
}

/** Start of a Bangkok calendar day. */
export function bangkokDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

export const daysAgo = (days: number, from: Date = new Date()) => new Date(from.getTime() - days * DAY_MS);
