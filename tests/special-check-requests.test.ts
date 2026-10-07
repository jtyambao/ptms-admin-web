import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../components/site-special-check-requests-panel.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/management-api.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/sites/[siteId]/page.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../lib/dashboard.ts', import.meta.url), 'utf8');

// Special Check Requests create page (branch release/dry-run-ops) —
// existing backend endpoints only (POST /special-check-requests, GET
// /special-check-requests?siteId=), no new backend routes.

test('Requests tab exists on the Site detail page', () => {
  assert.match(page, /import \{ SiteSpecialCheckRequestsPanel \} from '@\/components\/site-special-check-requests-panel';/);
  assert.match(page, /section === 'requests'/);
  assert.match(page, /<SiteSpecialCheckRequestsPanel siteId=\{siteId\} \/>/);
});

test('uses the real, existing create/list contract, siteId scoped from the route not the body for GET', () => {
  assert.match(api, /^\s*listSpecialCheckRequests:/m);
  assert.match(api, /\/special-check-requests\?siteId=\$\{siteId\}/);
  assert.match(api, /^\s*createSpecialCheckRequest:/m);
  assert.match(api, /method: 'POST'/);
});

// P3(c) update (branch release/dry-run-ops): `admin`/`site_admin` gained
// create authority, restricted server-side to their own assigned Site
// (SpecialCheckRequestsService.create()).
test('canSendSpecialCheckRequest matches SpecialCheckRequestsController SENDER_ROLES exactly', () => {
  assert.match(dashboard, /export const canSendSpecialCheckRequest = \(role: UserRole\) =>/);
  assert.match(dashboard, /role === 'super_admin' \|\|\s*\n\s*role === 'org_admin' \|\|\s*\n\s*role === 'site_manager' \|\|\s*\n\s*role === 'supervisor' \|\|\s*\n\s*role === 'site_admin' \|\|\s*\n\s*role === 'admin';/);
});

test('the create form is gated by canSendSpecialCheckRequest; the list itself is visible regardless (backend GET is unauthenticated)', () => {
  assert.match(panel, /canSendSpecialCheckRequest\(role\)/);
  assert.match(panel, /\{canSend && \(/);
  assert.doesNotMatch(panel, /if \(!canSend\) return/);
});

test('siteId always comes from the route param, never a client-editable field in the create form', () => {
  const createFnStart = panel.indexOf('async function submitCreate');
  const createFnEnd = panel.indexOf('\n  }', createFnStart);
  const body = panel.slice(createFnStart, createFnEnd);
  assert.match(body, /siteId,/);
  assert.doesNotMatch(body, /siteId: Number\(/);
});
