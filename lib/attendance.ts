import type { SiteOicAssignment } from './ptms-api';

// Attendance / OIC time-in-time-out ledger (item 4c, owner-authorized
// 2026-09-30 — overrides PTMS_FINAL_ROLE_PERMISSION_POLICY.md Part II
// §I's Category 3 note for this report only; extended into a real time-
// in/time-out ledger 2026-09-30 after a follow-up investigation and a
// second, explicit user confirmation — see that file's own updated
// entry, and site-assignments.service.ts's getAttendanceForSite comment).
//
// HONEST SCOPE, checked against what this backend actually records before
// writing a line of this: personnel MPIN login (personnel.service.ts's
// login()) touches NO timestamp at all, and is confirmed DEAD CODE in the
// shipping Guard app — the product's own confirmed design is "selfie not
// login" for individual guards (see ROADMAP.md). site_devices.last_seen_at
// and users.last_login_at are both single mutable "most recent" values,
// overwritten on every login — neither is a historical log either. The
// ONLY genuinely historical, per-interval, per-guard-IDENTIFIED record
// that exists today is site_oic_assignments (started_at = time in,
// ended_at = time out, null = still the active OIC) — reused as-is, no
// new migration, no Guard app change.
//
// This is therefore a time-in/time-out ledger for whoever is OIC, not a
// full multi-guard roster/clock-in log — the UI says so plainly (see
// site-attendance-panel.tsx) rather than implying a completeness this
// data can't back up.
export interface DailyOicSegment {
  personnelId: number;
  fullName: string;
  startedAt: string;
  endedAt: string | null; // null = still active as of `now`
  // Hours actually falling within THIS calendar day (a segment can span
  // midnight or several days) — clipped to the day's own boundaries, not
  // the segment's full duration.
  hoursThisDay: number;
  // True only when this segment has no time-out AND the day it's shown on
  // is strictly in the past — a still-open segment on today (or on the
  // day it started) is normal (the OIC simply hasn't handed over yet),
  // not a data-quality problem.
  missingTimeOut: boolean;
}

export interface DailyOicCoverage {
  date: string; // 'YYYY-MM-DD', the viewer's own local calendar day
  segments: DailyOicSegment[];
}

function localDateKey(at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(dateKey: string, days: number): string {
  const at = startOfLocalDay(dateKey);
  at.setDate(at.getDate() + days);
  return localDateKey(at);
}

// `fromDate`/`toDate` are 'YYYY-MM-DD', inclusive both ends, in the
// viewer's own local calendar — same "honest approximation, stated as
// such" convention dashboard.ts's isToday() already established, not an
// authoritative per-Site timezone the way a real operational-day boundary
// would need (no such boundary is fetched here, to keep this report
// backend-change-free).
export function deriveDailyOicCoverage(
  oicAssignments: SiteOicAssignment[],
  fromDate: string,
  toDate: string,
  now: Date = new Date(),
): DailyOicCoverage[] {
  const todayKey = localDateKey(now);
  const days: DailyOicCoverage[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const dayStart = startOfLocalDay(date);
    const dayEnd = startOfLocalDay(addDays(date, 1));
    const segments: DailyOicSegment[] = [];
    for (const assignment of oicAssignments) {
      const startedAt = new Date(assignment.started_at);
      const endedAt = assignment.ended_at ? new Date(assignment.ended_at) : now;
      // Overlap test: the assignment interval [startedAt, endedAt) must
      // intersect this day's [dayStart, dayEnd).
      if (startedAt >= dayEnd || endedAt <= dayStart) continue;
      // Clip to this day's own boundaries for the hours figure — an
      // overnight or multi-day segment must not have its full duration
      // double-counted across every day it touches.
      const clippedStart = startedAt < dayStart ? dayStart : startedAt;
      const clippedEnd = endedAt > dayEnd ? dayEnd : endedAt;
      const hoursThisDay = Math.max(0, (clippedEnd.getTime() - clippedStart.getTime()) / 3_600_000);
      segments.push({
        personnelId: assignment.personnel_id,
        fullName: assignment.full_name ?? `Personnel #${assignment.personnel_id}`,
        startedAt: assignment.started_at,
        endedAt: assignment.ended_at,
        hoursThisDay: Math.round(hoursThisDay * 100) / 100,
        missingTimeOut: assignment.ended_at === null && date < todayKey,
      });
    }
    // Chronological, oldest segment first — matches how a handover reads
    // naturally ("A covered until 2pm, then B").
    segments.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    days.push({ date, segments });
  }
  return days;
}

function csvCell(value: string): string {
  // RFC 4180 quoting: only needed when the value itself contains a comma,
  // quote, or newline — quoting every cell would just be noisy.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// CSV export (item 4c follow-up) — generated entirely client-side from
// the same day-by-day data the table already renders; no server-side
// export endpoint needed for a report this size.
export function attendanceToCsv(days: DailyOicCoverage[]): string {
  const header = ['Date', 'Personnel', 'Time In', 'Time Out', 'Hours (this day)', 'Missing time-out'];
  const rows = days.flatMap((day) =>
    day.segments.length === 0
      ? [[day.date, '', '', '', '', '']]
      : day.segments.map((segment) => [
          day.date,
          segment.fullName,
          new Date(segment.startedAt).toLocaleString(),
          segment.endedAt ? new Date(segment.endedAt).toLocaleString() : '',
          segment.hoursThisDay.toFixed(2),
          segment.missingTimeOut ? 'Yes' : '',
        ]),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
