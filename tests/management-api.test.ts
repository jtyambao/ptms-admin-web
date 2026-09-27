import assert from 'node:assert/strict';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';

// P1 Dashboard (2026-09-26) — verified real and committed against
// origin/main:src/incidents/incidents.controller.ts (`GET /incidents`, no
// query params, org-wide RLS scoping — not Site-scoped).
test('listIncidents uses the org-wide GET /incidents contract', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => { calls.push({ path, init }); return [] as T; } };
  await managementApi.listIncidents(api);
  assert.deepEqual(calls.map((call) => call.path), ['/incidents']);
  assert.equal(calls[0].init, undefined);
});

test('site management uses authenticated management routes and omits organizationId', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => { calls.push({ path, init }); return {} as T; } };
  await managementApi.listSites(api);
  await managementApi.getSite(api, 7);
  await managementApi.createSite(api, { name: 'Test Site', address: 'Test Address', latitude: 14.6, longitude: 121 });
  await managementApi.updateSite(api, 7, { latitude: 14.7, longitude: 121.1 });
  assert.deepEqual(calls.map(call => call.path), ['/management/sites', '/management/sites/7', '/management/sites', '/management/sites/7']);
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { name: 'Test Site', address: 'Test Address', latitude: 14.6, longitude: 121 });
  assert.equal(String(calls[2].init?.body).includes('organizationId'), false);
  assert.equal(calls[3].init?.method, 'PATCH');
  assert.equal(String(calls[3].init?.body).includes('organizationId'), false);
});

// Batch 3 correction (2026-09-26): reverted an incorrect 2026-09-24 claim
// that the site_admin creation/assignment routes had already been deleted
// from production. Verified against
// a fresh origin/main read (site-assignments.controller.ts): both the
// legacy site_admin pair and the newer bare-admin pair are live and
// distinct. Also verified getStaffingStatus() only recognizes
// `assignment_role === 'site_admin'` for its `siteAdmin` field — a real,
// separate backend gap, not something to work around here.
test('hierarchy setup uses the live supervisor/site-admin/admin assignment endpoints without client organization authority', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => { calls.push({ path, init }); return { id: 31 } as T; } };
  await managementApi.createSupervisorAccount(api, { fullName: 'Supervisor', email: 's@example.com', password: 'temporary-password' });
  await managementApi.assignSupervisor(api, 4, { userId: 31, reason: 'Initial setup' });
  await managementApi.createSiteAdminAccount(api, 4, { fullName: 'Site Admin', email: 'sa@example.com', password: 'temporary-password' });
  await managementApi.assignSiteAdmin(api, 4, { userId: 31 });
  await managementApi.createAdminAccount(api, 4, { fullName: 'Admin', email: 'a@example.com', password: 'temporary-password' });
  await managementApi.assignAdmin(api, 4, { userId: 31 });
  await managementApi.getAssignmentHistory(api, 4);
  assert.deepEqual(calls.map((call) => call.path), [
    '/management/supervisor-accounts',
    '/sites/4/assignments/supervisor',
    '/sites/4/site-admin-accounts',
    '/sites/4/assignments/site-admin',
    '/sites/4/admin-accounts',
    '/sites/4/assignments/admin',
    '/sites/4/assignment-history',
  ]);
  assert.equal(calls.every((call) => !String(call.init?.body).includes('organizationId')), true);
});

test('Personnel and OIC operations use only verified backend contracts', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return {} as T;
  } };
  await managementApi.listPersonnel(api);
  await managementApi.createPersonnel(api, { siteId: 4, fullName: 'Test Guard', mpin: '123456' });
  await managementApi.deactivatePersonnel(api, 22);
  await managementApi.regeneratePersonnelMpin(api, 22);
  await managementApi.handoverOic(api, 4, { personnelId: 22 });

  assert.deepEqual(calls.map((call) => call.path), [
    '/personnel',
    '/personnel',
    '/personnel/22/deactivate',
    '/personnel/22/regenerate-mpin',
    '/sites/4/oic-handovers',
  ]);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    siteId: 4,
    fullName: 'Test Guard',
    mpin: '123456',
  });
  assert.equal(String(calls[1].init?.body).includes('organizationId'), false);
  assert.equal(calls[2].init?.method, 'PATCH');
  assert.equal(calls[3].init?.method, 'POST');
  assert.equal(calls[3].init?.body, undefined);
});

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that assumed
// listUsers had dropped its organizationId param and that /users had
// already moved to the future five-role design's Engineer-only account
// administration. Verified against a fresh origin/main read
// (users.controller.ts, create-user.dto.ts): unchanged since Batch 2 —
// still super_admin/org_admin only, organizationId still accepted.
test('Emergency Contacts and Accounts use only verified backend contracts', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return {} as T;
  } };
  await managementApi.listEmergencyContacts(api, 4);
  await managementApi.createEmergencyContact(api, { siteId: 4, category: 'internal', name: 'Front Desk' });
  await managementApi.listUsers(api);
  await managementApi.listUsers(api, 8);
  await managementApi.createUser(api, { email: 'a@example.com', password: 'temporary-password', fullName: 'Manager One', role: 'manager' });

  assert.deepEqual(calls.map((call) => call.path), [
    '/emergency-contacts?siteId=4',
    '/emergency-contacts',
    '/users',
    '/users?organizationId=8',
    '/users',
  ]);
  assert.equal(calls[0].init, undefined);
  assert.equal(calls[1].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { siteId: 4, category: 'internal', name: 'Front Desk' });
  assert.equal(calls[3].init, undefined);
  assert.equal(calls[4].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[4].init?.body)), {
    email: 'a@example.com', password: 'temporary-password', fullName: 'Manager One', role: 'manager',
  });
});

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that assumed
// Operational Settings had already become site-scoped in production.
// Verified against a fresh origin/main read
// (management-operational-settings.controller.ts +
// operational-settings.service.ts): this is an ORGANIZATION-scoped
// endpoint (optional organizationId query param, required only for
// super_admin), with no siteId anywhere — distinct from the Guard-facing,
// pre-auth `/operational-settings/site/:siteId` read endpoint (unchanged).
test('Operational Settings uses the organization-scoped management contract, not the Guard-facing site-scoped one', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return {} as T;
  } };
  await managementApi.getOperationalSettings(api);
  await managementApi.getOperationalSettings(api, 9);
  await managementApi.updateOperationalSettings(api, { guardIdleTimeoutSeconds: 30 });
  await managementApi.updateOperationalSettings(api, { catchupWindowSeconds: 1800, organizationId: 9 });

  assert.deepEqual(calls.map((call) => call.path), [
    '/management/operational-settings',
    '/management/operational-settings?organizationId=9',
    '/management/operational-settings',
    '/management/operational-settings',
  ]);
  assert.equal(calls[0].init, undefined);
  assert.equal(calls[2].init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { guardIdleTimeoutSeconds: 30 });
  // sql/046 — Catch-Up window setting passes through the same generic
  // management contract, never a separate Guard-facing endpoint.
  assert.equal(calls[3].init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[3].init?.body)), { catchupWindowSeconds: 1800, organizationId: 9 });
});
