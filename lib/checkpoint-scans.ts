// Checkpoint Scans helpers (2026-10-08). Dates here are plain calendar days
// ("YYYY-MM-DD") in the ORGANIZATION's timezone - the server decides what
// "today" is, so the browser's own clock/timezone never shifts the day.

export type ScanPreset = 'today' | 'yesterday' | 'week' | 'custom';

export const MAX_SCAN_DAYS = 31;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function scanRange(
  preset: ScanPreset,
  today: string | null,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string; invalid?: string } {
  if (preset === 'custom') {
    if (!DAY.test(customFrom) || !DAY.test(customTo)) return { invalid: 'Choose both dates.' };
    if (customTo < customFrom) return { invalid: 'The last day must not be before the first day.' };
    if (dayNumber(customTo) - dayNumber(customFrom) + 1 > MAX_SCAN_DAYS) {
      return { invalid: `Choose at most ${MAX_SCAN_DAYS} days at a time.` };
    }
    return { from: customFrom, to: customTo };
  }
  if (!today || preset === 'today') return {};
  if (preset === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) };
  return { from: addDays(today, -6), to: today };
}

/** "9:41 AM" - or "Oct 8, 9:41 AM" when the list spans several days - in the organization's timezone. */
export function scanTimeLabel(iso: string, timeZone: string, withDate: boolean): string {
  const date = new Date(iso);
  try {
    return date.toLocaleString(undefined, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      ...(withDate ? { month: 'short', day: 'numeric' } : {}),
    });
  } catch {
    return date.toLocaleString();
  }
}
