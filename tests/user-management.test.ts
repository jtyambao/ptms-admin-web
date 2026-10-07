import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assignableRolesFor,
  canCreateUsers,
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
test('Accounts: view/create is limited to super_admin and org_admin, matching UsersController exactly', () => {
  assert.equal(canViewUsers('super_admin'), true);
  assert.equal(canViewUsers('org_admin'), true);
  assert.equal(canViewUsers('engineer'), false);
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
