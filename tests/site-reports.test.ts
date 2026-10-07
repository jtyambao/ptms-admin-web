import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../components/site-reports-panel.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/management-api.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/sites/[siteId]/page.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../lib/dashboard.ts', import.meta.url), 'utf8');

// Reports page (branch release/dry-run-ops) — read-only, per-Site,
// existing backend endpoints only.

test('Reports tab exists on the Site detail page', () => {
  assert.match(page, /import \{ SiteReportsPanel \} from '@\/components\/site-reports-panel';/);
  assert.match(page, /section === 'reports'/);
  assert.match(page, /<SiteReportsPanel siteId=\{siteId\} \/>/);
});

test('Reports panel calls only real, existing backend endpoints — no new backend routes', () => {
  assert.match(api, /^\s*listMissedCheckpoints:/m);
  assert.match(api, /\/checkpoint-rounds\/site\/\$\{siteId\}\/missed/);
  assert.match(api, /^\s*listGovernedMissedCheckpoints:/m);
  assert.match(api, /\/checkpoint-rounds\/site\/\$\{siteId\}\/missed\/governed/);
  assert.match(api, /^\s*listVisitorLogs:/m);
  assert.match(api, /\/visitor-logs\/site\/\$\{siteId\}/);
  assert.match(api, /^\s*listVoluntaryObservationReports:/m);
  assert.match(api, /\/voluntary-observation-reports\/site\/\$\{siteId\}/);
  assert.match(api, /^\s*listSosAlerts:/m);
  assert.match(api, /'\/sos-alerts'/);
});

test('Incidents and SOS reports skip gracefully for a role without backend access, rather than 403ing', () => {
  assert.match(panel, /canViewIncidents\(role\)/);
  assert.match(panel, /canViewSos\(role\)/);
  assert.match(panel, /kind: 'skipped'/);
});

test('SOS is org-wide at the backend and filtered to this Site client-side (no Site-scoped SOS list route exists)', () => {
  assert.match(panel, /listSosAlerts\(session\.api\)/);
  assert.match(panel, /all\.filter\(\(a\) => a\.site_id === siteId\)/);
});

// P3(a) update (branch release/dry-run-ops): `admin`/`site_admin` gained
// full view/acknowledge/cancel authority, restricted server-side to their
// own assigned Site (SosService).
test('canViewSos matches SosController RESPONDER_ROLES exactly', () => {
  assert.match(dashboard, /export const canViewSos = \(role: UserRole\) =>/);
  assert.match(dashboard, /role === 'super_admin' \|\|\s*\n\s*role === 'org_admin' \|\|\s*\n\s*role === 'site_manager' \|\|\s*\n\s*role === 'supervisor' \|\|\s*\n\s*role === 'site_admin' \|\|\s*\n\s*role === 'admin';/);
});

test('Incidents acknowledge/resolve and SOS acknowledge/cancel actions are gated and call the real endpoints', () => {
  assert.match(panel, /canViewIncidents\(role\)/);
  assert.match(panel, /canRespondToSos\(role\)/);
  assert.match(panel, /managementApi\.acknowledgeIncident/);
  assert.match(panel, /managementApi\.resolveIncident/);
  assert.match(panel, /managementApi\.acknowledgeSos/);
  assert.match(panel, /managementApi\.cancelSos/);
});

test('checkpoint visits/scans has no listing endpoint and is explicitly reported as such, not silently omitted', () => {
  assert.match(panel, /no listing endpoint on the current backend yet/);
});

test('every report widget loads independently — one failing report does not block the others', () => {
  const loadFnStart = panel.indexOf('const load = useCallback');
  const loadFnEnd = panel.indexOf('}, [role, session.api, session.status, siteId]);');
  const loadFnBody = panel.slice(loadFnStart, loadFnEnd);
  // Each data source has its own try/catch — a rejection in one does not
  // throw out of `load` and skip the rest.
  const tryCount = (loadFnBody.match(/try \{/g) ?? []).length;
  assert.equal(tryCount, 8); // incidents, missed, governedMissed, visitorLogs, vorReports, dob, lastCheckin, sos — each its own try/catch
});

// P5 (branch feat/admin-oic-management) — read-only, existing endpoint
// only (Guard-facing/unauthenticated at the backend). Only the single
// most recent check-in — there is no history-list endpoint yet.
test('Lone Worker Check-In widget shows only the latest check-in and says so plainly', () => {
  assert.match(api, /^\s*getLastLoneWorkerCheckin:/m);
  assert.match(api, /\/lone-worker-checkins\/last\?siteId=\$\{siteId\}/);
  assert.match(panel, /managementApi\.getLastLoneWorkerCheckin\(session\.api, siteId\)/);
  assert.match(panel, /the backend has no history-list endpoint yet/);
});

// P5(a) (branch release/dry-run-ops) — read-only, existing endpoint only
// (Guard-facing/unauthenticated at the backend, no role gate needed here).
test('Daily Occurrence Book widget uses the real, existing GET endpoint', () => {
  assert.match(api, /^\s*listDailyOccurrenceBook:/m);
  assert.match(api, /\/daily-occurrence-book\/site\/\$\{siteId\}/);
  assert.match(panel, /managementApi\.listDailyOccurrenceBook\(session\.api, siteId\)/);
});
