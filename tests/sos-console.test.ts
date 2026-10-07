import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';
import { formatDuration, formatElapsed, mapsUrl, sosOutcome, splitSosAlerts, trackLocationChange } from '../lib/sos-console.ts';
import type { SosAlertEntry } from '../lib/ptms-api.ts';

// SOS receiver console (user-authorized 2026-10-07).
const page = readFileSync('app/sos/page.tsx', 'utf8');
const banner = readFileSync('components/incoming-sos-banner.tsx', 'utf8');

function alert(over: Partial<SosAlertEntry>): SosAlertEntry {
  return {
    id: 1, organization_id: 1, personnel_id: null, site_id: 4, latitude: null, longitude: null, status: 'active',
    triggered_at: '2026-10-07T01:00:00.000Z', acknowledged_at: null, cancelled_at: null, cancel_reason: null,
    resolved_at: null, personnel_name: null, site_name: 'HQ', ...over,
  };
}

test('unacknowledged alerts sort first, then newest; closed alerts go to history newest-first', () => {
  const { open, history } = splitSosAlerts([
    alert({ id: 1, status: 'acknowledged', triggered_at: '2026-10-07T03:00:00.000Z' }),
    alert({ id: 2, status: 'active', triggered_at: '2026-10-07T01:00:00.000Z' }),
    alert({ id: 3, status: 'resolved', triggered_at: '2026-10-06T01:00:00.000Z' }),
    alert({ id: 4, status: 'cancelled', triggered_at: '2026-10-06T05:00:00.000Z' }),
  ]);
  assert.deepEqual(open.map((a) => a.id), [2, 1]);
  assert.deepEqual(history.map((a) => a.id), [4, 3]);
});

test('elapsed and durations read naturally', () => {
  const t0 = '2026-10-07T01:00:00.000Z';
  assert.equal(formatElapsed(t0, new Date('2026-10-07T01:00:07.000Z').getTime()), '0:07');
  assert.equal(formatElapsed(t0, new Date('2026-10-07T01:03:05.000Z').getTime()), '3:05');
  assert.equal(formatElapsed(t0, new Date('2026-10-07T02:05:00.000Z').getTime()), '1h 05m');
  assert.equal(formatDuration(t0, '2026-10-07T01:00:42.000Z'), '42s');
  assert.equal(formatDuration(t0, '2026-10-07T01:05:00.000Z'), '5 min');
});

test('outcome of a resolved alert: who handled it, the note, and how fast it was acknowledged', () => {
  const o = sosOutcome(alert({
    status: 'resolved', acknowledged_at: '2026-10-07T01:00:30.000Z', acknowledged_by_name: 'Maria', resolution_note: 'Intruder left',
  }));
  assert.equal(o.label, 'Resolved');
  assert.equal(o.tone, 'good');
  assert.equal(o.responseTime, '30s');
  assert.match(o.detail!, /handled by Maria/);
  assert.match(o.detail!, /"Intruder left"/);
});

test('outcome of a cancelled alert: false alarm by whom, with the reason; a guard self-cancel is attributed to the guard', () => {
  assert.match(sosOutcome(alert({ status: 'cancelled', cancelled_at: 'x', cancelled_by_name: 'Maria', cancel_reason: 'Test' })).detail!, /by Maria.*"Test"/);
  assert.match(sosOutcome(alert({ status: 'cancelled', cancelled_at: 'x' })).detail!, /by the guard/);
});

test('location freshness is only reset when the coordinates actually CHANGE', () => {
  const a = alert({ id: 9, latitude: 14.1, longitude: 121.1 });
  const first = trackLocationChange({}, [a], 1000);
  assert.equal(first[9].changedAt, 1000);
  const same = trackLocationChange(first, [a], 9000);
  assert.equal(same[9].changedAt, 1000);
  const moved = trackLocationChange(same, [{ ...a, latitude: 14.2 }], 12000);
  assert.equal(moved[9].changedAt, 12000);
  assert.equal(mapsUrl(14.1, 121.1), 'https://www.google.com/maps?q=14.1,121.1');
});

test('resolve wrapper posts the optional note to the staff resolve endpoint', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const api = { request: async (path: string, init?: RequestInit) => { calls.push({ path, body: init?.body }); return {}; } } as never;
  await managementApi.resolveSos(api, 7, 'All clear');
  await managementApi.resolveSos(api, 7);
  assert.deepEqual(calls, [
    { path: '/sos-alerts/7/resolve', body: '{"note":"All clear"}' },
    { path: '/sos-alerts/7/resolve', body: '{}' },
  ]);
});

test('the console: acknowledge -> Responding -> Resolve (with a note) or False alarm, Call the Site, and a History with outcomes', () => {
  assert.match(page, /Acknowledge - I&apos;m responding/);
  assert.match(page, /'Responding'/);
  assert.match(page, /managementApi\.resolveSos\(session\.api, action\.alert\.id,/);
  assert.match(page, /False alarm - cancel/);
  assert.match(page, /Call the Site/);
  assert.match(page, /sosOutcome\(alert\)/);
  assert.match(page, /Open map/);
});

test('the console only offers response actions to canRespondToSos roles, polls every 5s, and says plainly what the backend does not provide', () => {
  assert.match(page, /canRespond && \(/);
  assert.match(page, /POLL_MS = 5000/);
  assert.match(page, /guard selfie/);
});

test('Call the Site only appears when calls are enabled, deep-linking /calls?siteId=', () => {
  assert.match(page, /callsOn && alert\.site_id !== null/);
  assert.match(page, /\/calls\?siteId=\$\{alert\.site_id\}/);
  assert.match(readFileSync('app/calls/page.tsx', 'utf8'), /searchParams|URLSearchParams\(window\.location\.search\)\.get\('siteId'\)/);
});

test('the global alarm banner links to the console and flashes the tab title while any alert is unacknowledged', () => {
  assert.match(banner, /Open SOS console/);
  assert.match(banner, /SOS - ACTION NEEDED/);
});

test('SOS is in the portal navigation', () => {
  assert.match(readFileSync('components/portal-shell.tsx', 'utf8'), /href: '\/sos', label: 'SOS'/);
});
