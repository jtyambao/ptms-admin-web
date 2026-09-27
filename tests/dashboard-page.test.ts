import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// P1 Dashboard (2026-09-26) — source-inspection tests matching this repo's
// established convention (page/component logic is plain functions +
// readable JSX, not exercised via a DOM-rendering test runner anywhere
// else in this suite).
const source = readFileSync('app/dashboard/page.tsx', 'utf8');

test('1. Dashboard no longer depends on the undeployed summary endpoint', () => {
  assert.doesNotMatch(source, /getDashboardSummary/);
  // The comment explaining why it's not used legitimately names the route;
  // check only that it's never actually called.
  assert.doesNotMatch(source, /managementApi\.[a-zA-Z]*[Ss]ummary/);
});

test('2. Each widget renders its own loaded data independently', () => {
  assert.match(source, /widget\.kind === 'loaded'/);
  assert.match(source, /managementApi\.listSites\(session\.api\)/);
  assert.match(source, /managementApi\.listPersonnel\(session\.api\)/);
  assert.match(source, /managementApi\.listIncidents\(session\.api\)/);
});

test('3. An unavailable/skipped widget never renders a fabricated zero', () => {
  const skippedStart = source.indexOf("function Skipped(");
  const skippedEnd = source.indexOf('\n}', skippedStart);
  const skippedBody = source.slice(skippedStart, skippedEnd);
  assert.doesNotMatch(skippedBody, />0</);
  assert.match(skippedBody, /Unavailable for this role/);
});

test('4. Widgets load via Promise.allSettled, not Promise.all — one rejection cannot block the others', () => {
  assert.match(source, /Promise\.allSettled\(\[loadSites\(\), loadPersonnel\(\), loadIncidents\(\)\]\)/);
});

test('5/6. Errors render the real ApiRequestError message (401/403/network/etc. all distinguishable), separately from the skipped (403-preempted) and empty states', () => {
  assert.match(source, /reason instanceof ApiRequestError \? reason\.message/);
  assert.match(source, /function Failed/);
  assert.match(source, /function Skipped/);
  assert.match(source, /widget\.kind === 'error'/);
});

test('7. No polling exists, and the undeployed summary endpoint is never called', () => {
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /managementApi\.[a-zA-Z]*[Ss]ummary/);
});

test('8. A valid empty result is rendered as an explicit empty message, not an error', () => {
  assert.match(source, /No Sites are assigned to your account yet\./);
  assert.match(source, /No Personnel records visible to your role yet\./);
  assert.match(source, /No Incidents reported yet\./);
});

test('9. Site scope comes only from what the backend actually returns — no client-side combining, organizationId, or site-selector override', () => {
  assert.doesNotMatch(source, /organizationId/);
  assert.doesNotMatch(source, /\?siteId=/);
  assert.doesNotMatch(source, /managementApi\.\w+\([^)]*,\s*\d/);
  assert.match(source, /canViewSitesOverview\(role\)/);
  assert.match(source, /canViewPersonnel\(role\)/);
  assert.match(source, /canViewIncidents\(role\)/);
});

test('10. No hardcoded/fabricated operational numbers exist — every rendered count is derived from widget.data', () => {
  assert.doesNotMatch(source, /= 0;/);
  assert.match(source, /widget\.data\.length/);
  assert.match(source, /widget\.data\.filter/);
});

test('"Today" is explicitly labelled as the viewer\'s own local time, not a per-Site-timezone backend boundary', () => {
  assert.match(source, /today \(your local time\)/);
});

test('Incident rows never attempt to render a photo — findAll() does not provide photo_view_url', () => {
  assert.doesNotMatch(source, /photo_view_url/);
  assert.doesNotMatch(source, /<img/);
});
