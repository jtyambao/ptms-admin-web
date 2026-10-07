import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// P2 Dashboard redesign (branch feat/admin-oic-management) — source-
// inspection tests matching this repo's established convention (page/
// component logic is plain functions + readable JSX, not exercised via a
// DOM-rendering test runner anywhere else in this suite). Supersedes the
// P1 Dashboard's tests: the abstract org-wide Sites/Personnel/Incidents
// counts are replaced by one big per-Site status card (patrol/next due,
// missed today, active SOS, incidents today, OIC on duty, devices).
const source = readFileSync('app/dashboard/page.tsx', 'utf8');

test('1. Dashboard no longer depends on the undeployed summary endpoint', () => {
  assert.doesNotMatch(source, /getDashboardSummary/);
  assert.doesNotMatch(source, /managementApi\.[a-zA-Z]*[Ss]ummary/);
});

test('2. Each per-Site metric loads and renders independently — one failing metric never blocks the others', () => {
  assert.match(source, /managementApi\.listSites\(session\.api\)/);
  assert.match(source, /managementApi\.getStaffing\(session\.api, siteId\)/);
  assert.match(source, /managementApi\.getRoundStatus\(session\.api, siteId\)/);
  assert.match(source, /managementApi\.listMissedCheckpoints\(session\.api, siteId\)/);
  assert.match(source, /managementApi\.listDevices\(session\.api, siteId\)/);
  assert.match(source, /managementApi\.listIncidents\(session\.api\)/);
  assert.match(source, /managementApi\.listSosAlerts\(session\.api\)/);
  // Six independent .then/.catch chains inside SiteStatusCard's effect —
  // a rejection in one can never throw out of the effect and skip the rest.
  const cardStart = source.indexOf('function SiteStatusCard');
  const cardEnd = source.indexOf('\nfunction Tile');
  const cardBody = source.slice(cardStart, cardEnd);
  const catchCount = (cardBody.match(/\.catch\(\(reason\) => \{/g) ?? []).length;
  assert.equal(catchCount, 6);
});

test('3. An unavailable/skipped metric never renders a fabricated zero — shows a plain role note instead', () => {
  assert.match(source, /skipped\?/);
  assert.match(source, /Not available to your role\./);
  assert.doesNotMatch(source, /kind: 'loaded', data: 0/);
});

test('4/5. Errors render the real ApiRequestError message, distinct from skipped/empty', () => {
  assert.match(source, /reason instanceof ApiRequestError \? reason\.message/);
  assert.match(source, /function Failed/);
  assert.match(source, /function SkippedCard/);
});

test('6. A Site with no Sites assigned renders an explicit empty message, not an error', () => {
  assert.match(source, /You have no Sites yet\./);
});

test('7. Site scope comes only from what the backend actually returns — no client-side organizationId or siteId override', () => {
  assert.doesNotMatch(source, /organizationId/);
  assert.match(source, /canViewSitesOverview\(role\)/);
});

test('8. Incidents/SOS "today"/"active" counts are derived from real widget data, never hardcoded', () => {
  assert.match(source, /data\.filter\(\(i\) => i\.site_id === siteId && isToday\(i\.occurred_at\)\)\.length/);
  assert.match(source, /data\.filter\(\(a\) => a\.site_id === siteId && \(a\.status === 'active' \|\| a\.status === 'acknowledged'\)\)\.length/);
});

test('9. Missed-today count is computed client-side from missed_at, same "today = viewer\'s local day" convention as isToday elsewhere', () => {
  assert.match(source, /missed\.data\.filter\(\(m\) => isToday\(m\.missed_at\)\)\.length/);
});

test('10. Patrol status reads patrol_operations_active straight off the already-fetched Site row, not a second redundant call', () => {
  assert.match(source, /site\.patrol_operations_active \? 'On' : 'Off'/);
});

test('11. Device tile shows a real Online/Offline claim (deviceOnlineStatus), counting devices proven online in the last 60s', () => {
  assert.match(source, /deviceOnlineStatus\(mostRecentDeviceActivity\)\.label/);
  assert.match(source, /onlineDeviceCount/);
});

test('12. Incident rows never attempt to render a photo — Incident has no photo_view_url', () => {
  assert.doesNotMatch(source, /photo_view_url/);
  assert.doesNotMatch(source, /<img/);
});
