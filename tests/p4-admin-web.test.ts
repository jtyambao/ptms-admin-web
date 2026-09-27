import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';

const hierarchyPanel = readFileSync(new URL('../components/site-hierarchy-panel.tsx', import.meta.url), 'utf8');
const portalShell = readFileSync(new URL('../components/portal-shell.tsx', import.meta.url), 'utf8');
const accountPage = readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8');
const siteSetup = readFileSync(new URL('../lib/site-setup.ts', import.meta.url), 'utf8');

// P4 (owner-authorized, branch release/dry-run-ops): Supervisor
// create/deactivate Admin accounts for a Site, plus a self-service
// My Account page (profile + change password) for every role.

test('site-hierarchy-panel now creates/assigns the admin tier, not the legacy site_admin one', () => {
  assert.match(hierarchyPanel, /managementApi\.createAdminAccount/);
  assert.match(hierarchyPanel, /managementApi\.assignAdmin/);
  assert.doesNotMatch(hierarchyPanel, /managementApi\.createSiteAdminAccount/);
  assert.doesNotMatch(hierarchyPanel, /managementApi\.assignSiteAdmin\(/);
});

test('an existing legacy site_admin assignment is still shown, read-only, when there is no admin one', () => {
  assert.match(hierarchyPanel, /legacyName=\{!staffing\?\.admin \? staffing\?\.siteAdmin\?\.full_name : undefined\}/);
  assert.match(hierarchyPanel, /Legacy Site Admin assignment \(read-only\)/);
});

test('Deactivate button on the Admin tier card calls deactivateAdminAccount, gated the same as canSetUpAdmin', () => {
  assert.match(hierarchyPanel, /managementApi\.deactivateAdminAccount\(session\.api, siteId, staffing\.admin\.user_id/);
  assert.match(hierarchyPanel, /secondaryAction=\{staffing\?\.admin && canAdmin/);
});

test('canSetUpAdmin (renamed from canSetUpSiteAdmin) still gates on supervisor only', () => {
  assert.match(siteSetup, /export const canSetUpAdmin = \(role: UserRole\) => role === 'supervisor';/);
});

test('setupSteps\' Admin step accepts either the legacy siteAdmin or the new admin tier', () => {
  assert.match(siteSetup, /complete: !!\(signals\.staffing\?\.siteAdmin \|\| signals\.staffing\?\.admin\)/);
});

test('My Account link exists in PortalShell for every authenticated role, not gated by any predicate', () => {
  assert.match(portalShell, /href="\/account"/);
  assert.match(portalShell, /My Account/);
});

test('My Account page has both a Profile form and a Change Password form', () => {
  assert.match(accountPage, /managementApi\.updateOwnProfile\(session\.api, \{ fullName: fullName\.trim\(\) \}\)/);
  assert.match(accountPage, /managementApi\.changeOwnPassword\(session\.api, \{ currentPassword, newPassword \}\)/);
  assert.match(accountPage, /Change Password/);
});

test('Change Password form validates length, confirmation match, and difference from current, client-side', () => {
  assert.match(accountPage, /newPassword\.length < 8/);
  assert.match(accountPage, /newPassword !== confirmPassword/);
  assert.match(accountPage, /newPassword === currentPassword/);
});

test('a wrong current password shows a specific message, not the generic 400 fallback', () => {
  assert.match(accountPage, /reason\.kind === 'validation' \? 'Current password is incorrect\.'/);
});

test('management-api wrappers hit the real, existing P4 backend routes', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = { request: async <T>(path: string, init?: RequestInit) => { calls.push({ path, init }); return {} as T; } };
  await managementApi.deactivateAdminAccount(api, 4, 18, 'Policy violation');
  await managementApi.regenerateSiteCredential(api, 4);
  await managementApi.updateOwnProfile(api, { fullName: 'New Name' });
  await managementApi.changeOwnPassword(api, { currentPassword: 'old', newPassword: 'new-password-1' });

  assert.deepEqual(calls.map((call) => call.path), [
    '/sites/4/admin-accounts/18/deactivate',
    '/sites/4/credential-regeneration',
    '/users/me',
    '/users/me/change-password',
  ]);
  assert.equal(calls[0].init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { reason: 'Policy violation' });
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal(calls[2].init?.method, 'PATCH');
  assert.equal(calls[3].init?.method, 'POST');
});

test('a 204 No Content response resolves to undefined instead of throwing on response.json()', async () => {
  const { createAuthenticatedApiClient } = await import('../lib/authenticated-api.ts');
  const client = createAuthenticatedApiClient({
    getAccessToken: () => 'test-token',
    refreshSession: async () => false,
    onSessionExpired: () => {},
    fetcher: (async () => new Response(null, { status: 204 })) as typeof fetch,
  });
  await assert.doesNotReject(() => client.request('/users/me/change-password', { method: 'POST' }));
});
