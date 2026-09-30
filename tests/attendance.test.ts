import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attendanceToCsv, deriveDailyOicCoverage } from '../lib/attendance.ts';
import type { SiteOicAssignment } from '../lib/ptms-api.ts';

// deriveDailyOicCoverage deliberately uses the VIEWER's local calendar day
// (see its own header comment) — pinning this process to UTC makes the
// day-boundary tests below deterministic regardless of which timezone
// they actually run in, since every fixture timestamp below is written
// as an explicit UTC ('Z') instant.
process.env.TZ = 'UTC';

// Attendance / OIC time-in-time-out ledger (item 4c, owner-authorized
// 2026-09-30 — overrides PTMS_FINAL_ROLE_PERMISSION_POLICY.md Part II §I's
// Category 3 note; extended into a real time-in/time-out ledger the same
// day after a follow-up investigation and a second explicit user
// confirmation). Derived from the dedicated, date-range-scoped
// GET /sites/:siteId/attendance endpoint (site_oic_assignments) — no new
// migration, no Guard app change.

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

test('a segment\'s hours are clipped to the day being shown, not the segment\'s full duration', () => {
  const days = deriveDailyOicCoverage(
    [assignment({ personnel_id: 1, started_at: '2026-09-09T18:00:00.000Z', ended_at: '2026-09-11T06:00:00.000Z', full_name: 'Overnight Guard' })],
    '2026-09-09',
    '2026-09-11',
    new Date('2026-09-12T00:00:00.000Z'),
  );
  // Day 1 (09-09): 18:00Z -> midnight = 6h. Day 2 (09-10): full day = 24h.
  // Day 3 (09-11): midnight -> 06:00Z = 6h.
  assert.equal(days.find((d) => d.date === '2026-09-09')!.segments[0].hoursThisDay, 6);
  assert.equal(days.find((d) => d.date === '2026-09-10')!.segments[0].hoursThisDay, 24);
  assert.equal(days.find((d) => d.date === '2026-09-11')!.segments[0].hoursThisDay, 6);
});

test('missingTimeOut is true for an open segment on a PAST day, false for today or the day it started', () => {
  const now = new Date('2026-09-15T12:00:00.000Z');
  const days = deriveDailyOicCoverage(
    [assignment({ personnel_id: 1, started_at: '2026-09-13T00:00:00.000Z', ended_at: null })],
    '2026-09-13',
    '2026-09-15',
    now,
  );
  assert.equal(days.find((d) => d.date === '2026-09-13')!.segments[0].missingTimeOut, true);
  assert.equal(days.find((d) => d.date === '2026-09-14')!.segments[0].missingTimeOut, true);
  assert.equal(days.find((d) => d.date === '2026-09-15')!.segments[0].missingTimeOut, false);
});

test('missingTimeOut is always false for a segment that actually has a time-out', () => {
  const days = deriveDailyOicCoverage(
    [assignment({ personnel_id: 1, started_at: '2026-09-01T00:00:00.000Z', ended_at: '2026-09-02T00:00:00.000Z' })],
    '2026-09-01',
    '2026-09-01',
    new Date('2026-09-10T00:00:00.000Z'),
  );
  assert.equal(days[0].segments[0].missingTimeOut, false);
});

test('attendanceToCsv produces a header row, one row per segment, and a blank row for a day with no coverage', () => {
  const days = deriveDailyOicCoverage(
    [assignment({ personnel_id: 1, started_at: '2026-09-01T08:00:00.000Z', ended_at: '2026-09-01T20:00:00.000Z', full_name: 'Guard, A' })],
    '2026-09-01',
    '2026-09-02',
    new Date('2026-09-10T00:00:00.000Z'),
  );
  const csv = attendanceToCsv(days);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Date,Personnel,Time In,Time Out,Hours (this day),Missing time-out');
  // A comma in the name must be quoted per RFC 4180.
  assert.match(lines[1], /^2026-09-01,"Guard, A",/);
  assert.equal(lines[2], '2026-09-02,,,,,');
});

test('the panel uses the dedicated, date-range-scoped attendance endpoint — no unbounded backend call', () => {
  const source = readFileSync('components/site-attendance-panel.tsx', 'utf8');
  assert.match(source, /managementApi\.getAttendance\(session\.api, siteId, fromDate, toDate\)/);
});

test('the panel offers a CSV export', () => {
  const source = readFileSync('components/site-attendance-panel.tsx', 'utf8');
  assert.match(source, /attendanceToCsv\(days\)/);
  assert.match(source, /Export CSV/);
});

test('the panel is honest that this is an OIC-only ledger, not full multi-guard attendance', () => {
  const source = readFileSync('components/site-attendance-panel.tsx', 'utf8');
  assert.match(source, /not a full[\s\S]{0,15}multi-guard roster/i);
  assert.match(source, /identified by a photo at each[\s\S]{0,15}checkpoint tap/i);
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
