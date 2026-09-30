import type { SiteOicAssignment } from './ptms-api';

// Read-only Attendance report (item 4c, owner-authorized 2026-09-30 —
// overrides PTMS_FINAL_ROLE_PERMISSION_POLICY.md Part II §I's Category 3
// note for this one report only, see that file's own updated entry).
//
// HONEST SCOPE, checked against what this backend actually records before
// writing a line of this: personnel MPIN login (personnel.service.ts's
// login()) touches NO timestamp at all — there is no historical login log
// for Guard personnel anywhere. site_devices.last_seen_at and
// users.last_login_at are both single mutable "most recent" values,
// overwritten on every login — neither is a historical log either, so
// neither can answer "was this device/user active on day X." The ONLY
// genuinely historical, per-interval record that exists today is
// site_oic_assignments (started_at/ended_at, already exposed via the
// existing GET /sites/:siteId/assignment-history endpoint — no new
// backend endpoint or migration needed for this report at all).
//
// This report is therefore titled "OIC Coverage," derived entirely
// client-side from that existing data: for each calendar day in a range,
// which personnel covered this Site as OIC, and any day with a coverage
// gap. It is NOT a full Guard attendance/clock-in log — the UI says so
// plainly (see site-attendance-panel.tsx) rather than implying a
// completeness this data can't back up.
export interface DailyOicSegment {
  personnelId: number;
  fullName: string;
  startedAt: string;
  endedAt: string | null; // null = still active as of `now`
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
      segments.push({
        personnelId: assignment.personnel_id,
        fullName: assignment.full_name ?? `Personnel #${assignment.personnel_id}`,
        startedAt: assignment.started_at,
        endedAt: assignment.ended_at,
      });
    }
    // Chronological, oldest segment first — matches how a handover reads
    // naturally ("A covered until 2pm, then B").
    segments.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    days.push({ date, segments });
  }
  return days;
}
