import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const banner = readFileSync(new URL('../components/incoming-sos-banner.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/portal-shell.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../lib/dashboard.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/management-api.ts', import.meta.url), 'utf8');

// Incoming SOS banner (P3(d), branch release/dry-run-ops) — global,
// mounted once in PortalShell so it's visible from any authenticated
// page. Polls the same GET /sos-alerts findAll() the Reports page uses
// (already Site-scoped server-side for admin/site_admin, P3(a)).

test('mounted globally in PortalShell, not on any one page', () => {
  assert.match(shell, /import \{ IncomingSosBanner \} from '@\/components\/incoming-sos-banner';/);
  assert.match(shell, /<IncomingSosBanner \/>/);
});

test('gated by canRespondToSos (alias of canViewSos — same role set as backend RESPONDER_ROLES)', () => {
  assert.match(banner, /canRespondToSos\(role\)/);
  assert.match(dashboard, /export const canRespondToSos = canViewSos;/);
});

test('polls listSosAlerts on an interval, not a one-shot load', () => {
  assert.match(banner, /window\.setInterval\(\(\) => void poll\(\), POLL_MS\)/);
  assert.match(banner, /managementApi\.listSosAlerts\(session\.api\)/);
});

test('shows only alerts nobody has responded to yet (owner decision 2026-10-08)', () => {
  assert.match(banner, /all\.filter\(\(a\) => a\.status === 'active'\)/);
  assert.doesNotMatch(banner, /a\.status === 'acknowledged'\)\)/);
});

test('has Acknowledge and Cancel actions calling the real endpoints', () => {
  assert.match(banner, /managementApi\.acknowledgeSos\(session\.api, id\)/);
  assert.match(banner, /managementApi\.cancelSos\(session\.api, id\)/);
});

test('sound only plays while an alert is still active (unacknowledged), not merely present', () => {
  assert.match(banner, /const hasActive = alerts\.some\(\(a\) => a\.status === 'active'\);/);
  assert.match(banner, /if \(!hasActive\) \{ stopBeep\(\); return; \}/);
});

test('has a visible fallback to enable sound when autoplay is blocked', () => {
  assert.match(banner, /soundBlocked/);
  assert.match(banner, /Turn on alarm sound/);
  assert.match(banner, /onClick=\{enableSound\}/);
});

test('acknowledgeSos/cancelSos API wrappers hit the real backend routes', () => {
  assert.match(api, /acknowledgeSos: \(api: AuthenticatedApiClient, id: number\) =>/);
  assert.match(api, /\/sos-alerts\/\$\{id\}\/acknowledge/);
  assert.match(api, /cancelSos: \(api: AuthenticatedApiClient, id: number, reason\?: string\) =>/);
  assert.match(api, /\/sos-alerts\/\$\{id\}\/cancel/);
});
