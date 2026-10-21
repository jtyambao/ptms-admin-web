import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';
import {
  assignableRolesFor,
  canCreateUsers,
  canManageAccount,
  canViewUsers,
  isValidEmail,
  isValidPassword,
  requiresOrganizationId,
} from '../lib/user-management.ts';

// Batch 3 correction (2026-09-26): this file was rewritten on 2026-09-24 on
// the premise that the future five-role design (Engineer-only,
// organizationId removed) was already live in production. Restored to
// match a fresh origin/main read of CURRENT PRODUCTION TECHNICAL RBAC
// (users.controller.ts, create-user.dto.ts: unchanged since Batch 2).
test('Accounts: view/create is limited to super_admin, org_admin and Engineer (Manager accounts only), matching UsersController', () => {
  assert.equal(canViewUsers('super_admin'), true);
  assert.equal(canViewUsers('org_admin'), true);
  assert.equal(canViewUsers('engineer'), true);
  assert.equal(canViewUsers('manager'), false);
  assert.equal(canViewUsers('supervisor'), false);
  assert.equal(canViewUsers('site_admin'), false);
  assert.equal(canViewUsers('admin'), false);
  assert.equal(canCreateUsers('super_admin'), true);
  assert.equal(canCreateUsers('org_admin'), true);
  assert.equal(canCreateUsers('site_manager'), false);
});

test('Accounts: super_admin may assign any non-super_admin role; org_admin is refused the 5 hierarchy roles (including the new admin)', () => {
  const superAdminRoles = assignableRolesFor('super_admin');
  assert.equal(superAdminRoles.includes('engineer'), true);
  assert.equal(superAdminRoles.includes('manager'), true);
  assert.equal(superAdminRoles.includes('supervisor'), true);
  assert.equal(superAdminRoles.includes('site_admin'), true);
  assert.equal(superAdminRoles.includes('admin'), true);
  assert.equal(superAdminRoles.includes('org_admin'), true);
  assert.equal(superAdminRoles.includes('site_manager'), true);
  assert.equal(superAdminRoles.includes('auditor'), true);
  assert.equal(superAdminRoles.includes('client_viewer'), true);
  assert.equal(superAdminRoles.includes('super_admin'), false);

  const orgAdminRoles = assignableRolesFor('org_admin');
  assert.equal(orgAdminRoles.includes('engineer'), false);
  assert.equal(orgAdminRoles.includes('manager'), false);
  assert.equal(orgAdminRoles.includes('supervisor'), false);
  assert.equal(orgAdminRoles.includes('site_admin'), false);
  assert.equal(orgAdminRoles.includes('admin'), false);
  assert.equal(orgAdminRoles.includes('org_admin'), true);
  assert.equal(orgAdminRoles.includes('site_manager'), true);
  assert.equal(orgAdminRoles.includes('auditor'), true);
  assert.equal(orgAdminRoles.includes('client_viewer'), true);
});

test('Accounts: super_admin has no Organization directory to pick from, so organizationId stays a manual field only for them — the field still exists on the real DTO', () => {
  assert.equal(requiresOrganizationId('super_admin'), true);
  assert.equal(requiresOrganizationId('org_admin'), false);
});

test('Accounts: email/password validation mirrors CreateUserDto', () => {
  assert.equal(isValidEmail('a@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidPassword('short'), false);
  assert.equal(isValidPassword('exactly8'), true);
});

test('Accounts page: no edit/deactivate UI exists — the backend has no such endpoint', () => {
  const source = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.doesNotMatch(source, /updateUser|deactivateUser|editUser/i);
  assert.match(source, /To change or turn off an account,\s+ask the platform team/i);
});

test('Accounts page: handles loading, empty, and error states, and never renders a password back', () => {
  const source = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.match(source, /Loading accounts/);
  assert.match(source, /No accounts yet/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /user\.password|password_hash/);
});

test('Accounts page: 409 conflict is distinguished from the generic error', () => {
  const source = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.match(source, /status === 409/);
  assert.match(source, /already exists/);
});

test('Accounts page: role select is populated from assignableRolesFor, not a hardcoded/guessed list', () => {
  const source = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.match(source, /assignableRolesFor/);
  assert.doesNotMatch(source, /<option value="engineer">/);
});

test('Accounts page: restores the Organization ID field for super_admin', () => {
  const source = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.match(source, /needsOrganizationId/);
  assert.match(source, /account-organization-id/);
  assert.match(source, /A number that identifies the company/);
});

test('Accounts nav link exists and role-gates the page content, not the navigation itself', () => {
  const shell = readFileSync('components/portal-shell.tsx', 'utf8');
  assert.match(shell, /\/accounts/);
  const page = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.match(page, /canViewUsers/);
  assert.match(page, /Your role cannot manage accounts/);
});

// Engineer administration of Manager accounts (owner request 2026-10-21).
test('an Engineer can add and manage Owner / Engineer / Manager / Supervisor / Admin accounts only', () => {
  assert.equal(canCreateUsers('engineer'), true);
  assert.deepEqual(assignableRolesFor('engineer'), ['owner', 'engineer', 'manager', 'supervisor', 'admin']);
  assert.equal(requiresOrganizationId('engineer'), false); // the server uses the Engineer's own organization
  for (const managed of ['owner', 'engineer', 'manager', 'supervisor', 'admin'] as const) assert.equal(canManageAccount('engineer', managed), true);
  for (const other of ['org_admin', 'site_admin', 'site_manager', 'auditor', 'client_viewer', 'super_admin'] as const) {
    assert.equal(canManageAccount('engineer', other), false);
  }
  for (const requester of ['super_admin', 'org_admin', 'manager', 'supervisor', 'admin'] as const) {
    assert.equal(canManageAccount(requester, 'manager'), false);
  }
});

test('the Accounts page gives an Engineer Edit, Deactivate / Reactivate and Delete on managed rows (never on their own), calling the real endpoints', async () => {
  const page = readFileSync('app/accounts/page.tsx', 'utf8');
  assert.match(page, /role && canManageAccount\(role, user\.role\)/);
  assert.match(page, />Edit<\/Button>/);
  assert.match(page, /\{user\.status === 'active' \? 'Deactivate' : 'Reactivate'\}/);
  assert.match(page, /Nothing is deleted/);
  assert.match(page, /user\.id !== session\.user\?\.id/);
  assert.match(page, /onClick=\{\(\) => setDeleteTarget\(user\)\}>Delete<\/Button>/);
  assert.match(page, /This only works for an account that has no history yet/);
  assert.match(page, /managementApi\.updateAccount\(session\.api, editing\.id,/);
  const calls: { path: string; init?: { method?: string; body?: string } }[] = [];
  const api = { request: async (path: string, init?: { method?: string; body?: string }) => { calls.push({ path, init }); return {}; } } as never;
  await managementApi.updateAccount(api, 30, { fullName: 'Maria', password: 'NewPass123' });
  await managementApi.deactivateAccount(api, 30);
  await managementApi.reactivateAccount(api, 30);
  await managementApi.deleteAccount(api, 30);
  assert.deepEqual(calls.map((c) => [c.path, c.init?.method, c.init?.body]), [
    ['/users/30', 'PATCH', '{"fullName":"Maria","password":"NewPass123"}'],
    ['/users/30/deactivate', 'PATCH', undefined],
    ['/users/30/reactivate', 'PATCH', undefined],
    ['/users/30', 'DELETE', undefined],
  ]);
});

// Owner (sql/060): a monitoring-only role - visible views, no actions.
import { canRespondToSos, canViewSos, canViewSitesOverview } from '../lib/dashboard.ts';
import { canViewPersonnel, canManagePersonnel } from '../lib/personnel-management.ts';
import { canEditSiteOperationalSettings, canViewSiteOperationalSettings } from '../lib/operational-settings.ts';
import { canManageSiteOperations } from '../lib/site-operations.ts';
import { canSendSpecialCheckRequest } from '../lib/dashboard.ts';

test('Owner can view Sites, personnel, settings and the SOS list, but cannot edit or act on anything', () => {
  assert.equal(canViewSitesOverview('owner'), true);
  assert.equal(canViewPersonnel('owner'), true);
  assert.equal(canViewSiteOperationalSettings('owner'), true);
  assert.equal(canViewSos('owner'), true);
  // no write / action capability
  assert.equal(canRespondToSos('owner'), false);
  assert.equal(canManagePersonnel('owner'), false);
  assert.equal(canEditSiteOperationalSettings('owner'), false);
  assert.equal(canManageSiteOperations('owner'), false);
  assert.equal(canSendSpecialCheckRequest('owner'), false);
  assert.equal(canCreateUsers('owner'), false);
  // the roles that could respond before still can
  for (const responder of ['super_admin', 'org_admin', 'supervisor', 'admin', 'site_admin'] as const) assert.equal(canRespondToSos(responder), true);
});
