import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  callBackUrl, callDuration, callOutcomeLabel, dobItem, incidentItem, isOnDay, newestFirst, notifyItem, parseCallbackParams,
  sumRoundsSummaries, visitorItem,
} from '../lib/dashboard-details.ts';
import { managementApi } from '../lib/management-api.ts';

// Dashboard tiles and details (2026-10-08).
const overview = readFileSync('components/dashboard-overview.tsx', 'utf8');
const details = readFileSync('components/dashboard-details.tsx', 'utf8');

test('"today" is the organization\'s calendar day, not the browser\'s or UTC', () => {
  // 2026-10-07 17:30 UTC is already 2026-10-08 01:30 in Manila.
  assert.equal(isOnDay('2026-10-07T17:30:00Z', '2026-10-08', 'Asia/Manila'), true);
  assert.equal(isOnDay('2026-10-07T17:30:00Z', '2026-10-07', 'Asia/Manila'), false);
  assert.equal(isOnDay('2026-10-07T17:30:00Z', '2026-10-07', 'America/Los_Angeles'), true);
  assert.equal(isOnDay('2026-10-08T05:00:00Z', '2026-10-08', 'Not/AZone'), true); // falls back to the UTC date
});

test('round counts add up across Sites', () => {
  const total = sumRoundsSummaries([
    { completed: 2, failed: 1, in_progress: 0, missed: 3, missed_open: 1 },
    { completed: 5, failed: 0, in_progress: 2, missed: 0, missed_open: 0 },
  ]);
  assert.deepEqual(total, { completed: 7, failed: 1, in_progress: 2, missed: 3, missed_open: 1 });
});

test('reports merge into one newest-first list with a type each; Notify is the Voluntary Observation Report', () => {
  const items = newestFirst([
    dobItem({ id: 1, organization_id: 1, site_id: 4, entry_text: 'Gate light fixed', occurred_at: '2026-10-08T01:00:00Z', created_at: '' }, 'HQ'),
    notifyItem({ id: 2, organization_id: 1, site_id: 4, photo_url: 'k', photo_view_url: 'https://s/n.jpg', remarks: null, occurred_at: '2026-10-08T03:00:00Z', created_at: '' }, 'HQ'),
    visitorItem({ id: 3, organization_id: 1, site_id: 4, visitor_name: 'Ana', purpose: 'Delivery', host_name: 'Ben', valid_id_checked: true, photo_url: null, photo_view_url: null, occurred_at: '2026-10-08T02:00:00Z', created_at: '' }, 'HQ'),
    incidentItem({ id: 4, organization_id: 1, site_id: 4, title: 'Loitering', severity: 'high', status: 'open', occurred_at: '2026-10-08T04:00:00Z', acknowledged_at: null, resolved_at: null, photo_view_url: 'https://s/i.jpg' }, 'HQ'),
  ]);
  assert.deepEqual(items.map((i) => i.kind), ['incident', 'notify', 'visitor', 'dob']);
  assert.equal(items[0].photoUrl, 'https://s/i.jpg');
  assert.equal(items[1].title, 'Notify (no remarks)');
  assert.equal(items[2].detail, 'Delivery - host: Ben');
  assert.equal(items[3].photoUrl, null);
});

test('call outcomes read plainly from Admin Web\'s side, with duration and a Call back link to the phone when known', () => {
  assert.deepEqual(callOutcomeLabel({ outcome: 'answered', direction: 'outgoing' }), { label: 'Answered', tone: 'good' });
  assert.equal(callOutcomeLabel({ outcome: 'no_answer', direction: 'incoming' }).label, 'Missed call');
  assert.equal(callOutcomeLabel({ outcome: 'no_answer', direction: 'outgoing' }).label, 'No answer');
  assert.equal(callDuration({ outcome: 'answered', started_at: '2026-10-08T01:00:00Z', ended_at: '2026-10-08T01:04:12Z' }), '4 min 12 s');
  assert.equal(callDuration({ outcome: 'answered', started_at: '2026-10-08T01:00:00Z', ended_at: '2026-10-08T01:00:09Z' }), '9 s');
  assert.equal(callDuration({ outcome: 'no_answer', started_at: '2026-10-08T01:00:00Z', ended_at: '2026-10-08T01:00:30Z' }), null);
  assert.equal(callBackUrl(4, { site_device_id: 9, call_type: 'voice' }), '/calls?siteId=4&autostart=1&targetSiteDeviceId=9');
  assert.equal(callBackUrl(4, { site_device_id: null, call_type: 'video' }), '/calls?siteId=4&autostart=1&callType=video');
});

test('the Calls page understands the callback link (and ignores SOS links, which have their own autostart)', () => {
  assert.deepEqual(parseCallbackParams('?siteId=4&autostart=1&targetSiteDeviceId=9'), { siteId: 4, targetSiteDeviceId: 9, callType: 'voice' });
  assert.deepEqual(parseCallbackParams('?siteId=4&autostart=1&callType=video'), { siteId: 4, targetSiteDeviceId: null, callType: 'video' });
  assert.equal(parseCallbackParams('?siteId=4'), null);
  assert.equal(parseCallbackParams('?sosAlertId=9&siteId=4&autostart=1'), null);
  assert.match(readFileSync('app/calls/page.tsx', 'utf8'), /callbackAutostarted/);
});

test('API wrappers: rounds history (summary/date), latest photo, and the staff call log', async () => {
  const paths: string[] = [];
  const api = { request: async (path: string) => { paths.push(path); return {}; } } as never;
  await managementApi.roundsHistory(api, 4, { summary: true });
  await managementApi.roundsHistory(api, 4, { date: '2026-10-08' });
  await managementApi.latestSitePhoto(api, 4);
  await managementApi.listStaffCalls(api, 4, { limit: 100 });
  assert.deepEqual(paths, [
    '/sites/4/rounds/history?summary=1',
    '/sites/4/rounds/history?date=2026-10-08',
    '/sites/4/latest-photo',
    '/calls/history?siteId=4&limit=100',
  ]);
});

test('the six tiles open their detail BELOW the tiles, one at a time, and hide what the role cannot see', () => {
  for (const label of ['Checkpoints done', 'Missed checkpoints', 'SOS right now', 'Officer in Charge', 'Reports today', 'Calls today']) {
    assert.ok(overview.includes(label), label);
  }
  assert.match(overview, /aria-expanded=\{open\}/);
  assert.match(overview, /setSelected\(\(current\) => \(current === id \? null : id\)\)/);
  assert.match(overview, /hidden: !canSos/);
  for (const component of ['RoundsDetail', 'MissedDetail', 'SosDetail', 'OicDetail', 'ReportsDetail', 'CallsDetail']) {
    assert.match(overview, new RegExp(`<${component}`), component);
  }
});

test('details: lists are capped with Show more, photos open the shared viewer, SOS uses the shared card with Call sender now', () => {
  assert.ok((details.match(/useShowMore\(/g) ?? []).length >= 6);
  assert.match(details, /onPhotos\(photos, photoIndex\)/);
  assert.match(details, /<SosAlertCard/);
  assert.match(details, /Call sender now/);
  assert.match(details, /Closed today/);
  assert.match(details, /Call back/);
  assert.match(details, /Checked in by guard in charge/);
  assert.match(details, /<Disclosure count=\{history\.length\} title="Check-in history">/);
  assert.doesNotMatch(details, /latestSitePhoto/);
  assert.match(details, /No Officer in Charge chosen/);
  assert.match(details, /Main phone/);
  assert.match(details, /Backup phone/);
  assert.match(details, /status === 'completed'/);
});

test('the Officer in Charge tile uses the shift-start Check-In (GET /sites/:id/check-ins), not a generic Site photo', async () => {
  const paths: string[] = [];
  const api = { request: async (path: string) => { paths.push(path); return {}; } } as never;
  await managementApi.listSiteCheckIns(api, 4, { limit: 50 });
  await managementApi.listSiteCheckIns(api, 4, { from: '2026-10-01', to: '2026-10-03', limit: 5, offset: 5 });
  assert.deepEqual(paths, ['/sites/4/check-ins?limit=50', '/sites/4/check-ins?from=2026-10-01&to=2026-10-03&limit=5&offset=5']);
  assert.match(details, /listSiteCheckIns\(session\.api, site\.id, \{ limit: 50 \}\)/);
  assert.match(details, /The photo is the Check-In selfie the guard in charge takes in the Guard app when the shift starts\./);
  assert.match(details, /No Check-In in the last 7 days\./);
  assert.match(details, /useShowMore\(history, 5, 10\)/);
});
