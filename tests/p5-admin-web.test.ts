import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';

const patrolToggle = readFileSync(new URL('../components/site-patrol-activation-toggle.tsx', import.meta.url), 'utf8');
const briefingPanel = readFileSync(new URL('../components/site-shift-briefing-panel.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/sites/[siteId]/page.tsx', import.meta.url), 'utf8');
const siteOperations = readFileSync(new URL('../lib/site-operations.ts', import.meta.url), 'utf8');

// P5(b)/(c) (owner-authorized, branch release/dry-run-ops): Shift
// Briefing authoring form + latest-briefing display, and the existing
// Patrol Activation toggle wired into the Site page.

test('canTogglePatrolActivation matches setPatrolActivation\'s requireRole exactly (narrower than canManageSiteOperations)', () => {
  assert.match(siteOperations, /export const canTogglePatrolActivation = \(role: UserRole\) =>\s*\n\s*role === 'supervisor' \|\| role === 'site_admin' \|\| role === 'super_admin';/);
});

test('Patrol toggle is rendered for every role but only enabled for canTogglePatrolActivation', () => {
  assert.match(patrolToggle, /canTogglePatrolActivation\(role\)/);
  assert.match(patrolToggle, /disabled=\{!canToggle \|\| saving\}/);
  assert.match(patrolToggle, /Your role cannot change this under current production RBAC\./);
});

test('Patrol toggle calls the real, existing PUT endpoint', () => {
  assert.match(patrolToggle, /managementApi\.setPatrolActivation\(session\.api, siteId, \{ active \}\)/);
});

test('Patrol toggle is wired into the Site page\'s Overview section', () => {
  assert.match(page, /import \{ SitePatrolActivationToggle \} from '@\/components\/site-patrol-activation-toggle';/);
  assert.match(page, /<SitePatrolActivationToggle/);
});

test('Shift Briefing form is gated by canManageSiteOperations (matches backend requireManageAccess)', () => {
  assert.match(briefingPanel, /canManageSiteOperations\(role\)/);
});

test('Shift Briefing panel shows the latest briefing and calls the real GET/POST endpoints', () => {
  assert.match(briefingPanel, /managementApi\.listShiftBriefingHistory\(session\.api, siteId\)/);
  assert.match(briefingPanel, /managementApi\.createShiftBriefing\(session\.api, siteId,/);
  assert.match(briefingPanel, /No briefing yet/);
});

test('Shift Briefing panel is wired into the Site page', () => {
  assert.match(page, /import \{ SiteShiftBriefingPanel \} from '@\/components\/site-shift-briefing-panel';/);
  assert.match(page, /<SiteShiftBriefingPanel siteId=\{siteId\} \/>/);
});

test('management-api wrappers hit the real, existing P5(b)/(c) backend routes', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => { calls.push({ path, init }); return {} as T; } };
  await managementApi.setPatrolActivation(api, 4, { active: true });
  await managementApi.getLatestShiftBriefing(api, 4);
  await managementApi.createShiftBriefing(api, 4, { handoverNote: 'Quiet night' });
  await managementApi.listDailyOccurrenceBook(api, 4);

  assert.deepEqual(calls.map((call) => call.path), [
    '/sites/4/patrol-activation',
    '/sites/4/shift-briefing',
    '/sites/4/shift-briefing',
    '/daily-occurrence-book/site/4',
  ]);
  assert.equal(calls[0].init?.method, 'PUT');
  assert.equal(calls[1].init, undefined);
  assert.equal(calls[2].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { handoverNote: 'Quiet night' });
});

// Pre-Shift Briefing audit (2026-10-07): own tab, history, edit = new entry.
test('Pre-Shift Briefing has its own Briefing tab on the Site page (no longer buried in Overview)', () => {
  assert.match(page, /section === 'briefing' && <SiteShiftBriefingPanel siteId=\{siteId\} \/>/);
  assert.match(readFileSync('lib/site-tabs.ts', 'utf8'), /section: 'briefing'/);
});

test('Pre-Shift Briefing shows the current briefing, a History list, and edit = publish a new entry pre-filled from the current one', () => {
  assert.match(briefingPanel, /Current briefing/);
  assert.match(briefingPanel, /History \(\{older\.length\}\)/);
  assert.match(briefingPanel, /Start from current briefing/);
  assert.match(briefingPanel, /nothing is overwritten/);
});

test('the long handover note is a multi-line Textarea and the short fields show their 255-character counters', () => {
  assert.match(briefingPanel, /<Textarea id="briefing-handover"/);
  assert.match(briefingPanel, /\{equipmentCheckNote\.length\}\/\{SHORT_MAX\}/);
  assert.match(briefingPanel, /\{weatherAdvisory\.length\}\/\{SHORT_MAX\}/);
});

test('history wrapper hits the staff-authenticated, bounded GET /sites/:id/shift-briefings', async () => {
  const paths: string[] = [];
  const api = { request: async (path: string) => { paths.push(path); return []; } } as never;
  await managementApi.listShiftBriefingHistory(api, 4);
  assert.deepEqual(paths, ['/sites/4/shift-briefings?limit=30']);
});
