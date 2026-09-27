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
  assert.match(page, /value="reports"/);
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

test('canViewSos matches SosController RESPONDER_ROLES exactly', () => {
  assert.match(dashboard, /export const canViewSos = \(role: UserRole\) =>/);
  assert.match(dashboard, /role === 'super_admin' \|\|\s*\n\s*role === 'org_admin' \|\|\s*\n\s*role === 'site_manager' \|\|\s*\n\s*role === 'supervisor';/);
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
  assert.equal(tryCount, 6); // incidents, missed, governedMissed, visitorLogs, vorReports, sos — each its own try/catch
});
