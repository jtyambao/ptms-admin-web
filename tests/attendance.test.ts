import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveDailyOicCoverage } from '../lib/attendance.ts';
import type { SiteOicAssignment } from '../lib/ptms-api.ts';

// deriveDailyOicCoverage deliberately uses the VIEWER's local calendar day
// (see its own header comment) — pinning this process to UTC makes the
// day-boundary tests below deterministic regardless of which timezone
// they actually run in, since every fixture timestamp below is written
// as an explicit UTC ('Z') instant.
process.env.TZ = 'UTC';

// Read-only "OIC Coverage" report (item 4c, owner-authorized 2026-09-30 —
// overrides PTMS_FINAL_ROLE_PERMISSION_POLICY.md Part II §I's Category 3
// note for this report only). Derived entirely from the EXISTING
// GET /sites/:siteId/assignment-history data (site_oic_assignments) —
// no new backend endpoint, no migration.

function assignment(overrides: Partial<SiteOicAssignment> & { personnel_id: number; started_at: string }): SiteOicAssignment {
  return {
    id: 1,
    organization_id: 1,
    site_id: 1,
    assigned_by_user_id: 1,
    ended_at: null,
    handover_reason: null,
    end_reason: null,
    full_name: `Personnel #${overrides.personnel_id}`,
    ...overrides,
  };
}

test('a single ongoing OIC assignment covers every day from its start through "now"', () => {
  const now = new Date('2026-09-15T12:00:00.000Z');
  const days = deriveDailyOicCoverage(
    [assignment({ personnel_id: 1, started_at: '2026-09-10T00:00:00.000Z', ended_at: null })],
    '2026-09-09',
    '2026-09-16',
    now,
  );
  assert.equal(days.length, 8);
  assert.equal(days.find((d) => d.date === '2026-09-09')!.segments.length, 0);
  assert.equal(days.find((d) => d.date === '2026-09-10')!.segments.length, 1);
  assert.equal(days.find((d) => d.date === '2026-09-15')!.segments.length, 1);
  // "now" is 2026-09-15T12:00Z — the interval [started, now) does not
  // reach 09-16 at all, so that day has no coverage.
  assert.equal(days.find((d) => d.date === '2026-09-16')!.segments.length, 0);
});

test('a mid-day handover produces two segments on the handover day, in chronological order', () => {
  const days = deriveDailyOicCoverage(
    [
      assignment({ personnel_id: 1, started_at: '2026-09-01T00:00:00.000Z', ended_at: '2026-09-10T08:00:00.000Z', full_name: 'Guard A' }),
      assignment({ personnel_id: 2, started_at: '2026-09-10T08:00:00.000Z', ended_at: null, full_name: 'Guard B' }),
    ],
    '2026-09-10',
    '2026-09-10',
    new Date('2026-09-10T20:00:00.000Z'),
  );
  assert.equal(days.length, 1);
  assert.equal(days[0].segments.length, 2);
  assert.equal(days[0].segments[0].fullName, 'Guard A');
  assert.equal(days[0].segments[1].fullName, 'Guard B');
});

test('a day entirely between two assignments (a real gap) shows no coverage', () => {
  const days = deriveDailyOicCoverage(
    [
      assignment({ personnel_id: 1, started_at: '2026-09-01T00:00:00.000Z', ended_at: '2026-09-05T00:00:00.000Z' }),
      assignment({ personnel_id: 2, started_at: '2026-09-08T00:00:00.000Z', ended_at: null }),
    ],
    '2026-09-06',
    '2026-09-07',
    new Date('2026-09-10T00:00:00.000Z'),
  );
  assert.equal(days.every((d) => d.segments.length === 0), true);
});

test('an assignment that ends exactly at a day boundary does not spill into the next day', () => {
  const days = deriveDailyOicCoverage(
    [assignment({ personnel_id: 1, started_at: '2026-09-01T00:00:00.000Z', ended_at: '2026-09-02T00:00:00.000Z' })],
    '2026-09-02',
    '2026-09-02',
    new Date('2026-09-10T00:00:00.000Z'),
  );
  assert.equal(days[0].segments.length, 0);
});

test('empty oicAssignments produces every requested day with zero coverage, never throws', () => {
  const days = deriveDailyOicCoverage([], '2026-09-01', '2026-09-03');
  assert.equal(days.length, 3);
  assert.equal(days.every((d) => d.segments.length === 0), true);
});

test('the panel reuses the EXISTING assignment-history endpoint — no new backend call', () => {
  const source = readFileSync('components/site-attendance-panel.tsx', 'utf8');
  assert.match(source, /managementApi\.getAssignmentHistory\(session\.api, siteId\)/);
});

test('the panel is honest that this is OIC coverage only, not full Guard attendance', () => {
  const source = readFileSync('components/site-attendance-panel.tsx', 'utf8');
  assert.match(source, /not a full Guard attendance/i);
  assert.match(source, /not historically recorded today/i);
});

test('the panel view-gates the same as OIC\\/Personnel visibility (canViewPersonnel)', () => {
  const source = readFileSync('components/site-attendance-panel.tsx', 'utf8');
  assert.match(source, /canViewPersonnel/);
});

test('the Attendance tab exists on the Site detail page', () => {
  const source = readFileSync('app/sites/[siteId]/page.tsx', 'utf8');
  assert.match(source, /value="attendance"/);
  assert.match(source, /<SiteAttendancePanel siteId=\{siteId\} \/>/);
});
