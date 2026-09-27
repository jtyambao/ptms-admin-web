import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canAccessOperationalPortal, canCreateSite, PORTAL_ROLES } from '../lib/portal-access.ts';

// Batch 3 correction (2026-09-26): this file was rewritten on 2026-09-24
// on the premise that the five-role design (approved, but local/uncommitted/
// undeployed transition WIP) was already live in production. Restored to
// match a fresh origin/main read of CURRENT PRODUCTION TECHNICAL RBAC.
test('operational portal access matches the verified backend roles', () => {
  assert.equal(canAccessOperationalPortal('super_admin'), true);
  assert.equal(canAccessOperationalPortal('engineer'), true);
  assert.equal(canAccessOperationalPortal('manager'), true);
  assert.equal(canAccessOperationalPortal('supervisor'), true);
  assert.equal(canAccessOperationalPortal('site_admin'), true);
  assert.equal(canAccessOperationalPortal('admin'), true);
  assert.equal(canAccessOperationalPortal('org_admin'), false);
  assert.equal(canAccessOperationalPortal('site_manager'), false);
  assert.equal(canAccessOperationalPortal('auditor'), false);
  assert.equal(canAccessOperationalPortal('client_viewer'), false);
});

test('PORTAL_ROLES contains exactly the six roles with an approved Admin Web access basis', () => {
  assert.deepEqual(
    [...PORTAL_ROLES].sort(),
    ['admin', 'engineer', 'manager', 'site_admin', 'super_admin', 'supervisor'],
  );
});

test('site creation matches sites.service.ts exactly — engineer OR manager, verified against a fresh origin/main read', () => {
  assert.equal(canCreateSite('engineer'), true);
  assert.equal(canCreateSite('manager'), true);
  assert.equal(canCreateSite('supervisor'), false);
  assert.equal(canCreateSite('site_admin'), false);
  assert.equal(canCreateSite('admin'), false);
  assert.equal(canCreateSite('super_admin'), false);
});

test('Batch 1/3: site_admin is not rejected merely because of stale frontend typing', () => {
  assert.equal(PORTAL_ROLES.includes('site_admin'), true);
  assert.equal(canAccessOperationalPortal('site_admin'), true);
});

test('Batch 1/3: every real production role parses without throwing, whether or not it gets portal access', () => {
  const realRoles = [
    'super_admin', 'engineer', 'manager', 'org_admin', 'site_admin',
    'site_manager', 'supervisor', 'admin', 'auditor', 'client_viewer',
  ] as const;
  for (const role of realRoles) {
    assert.doesNotThrow(() => canAccessOperationalPortal(role));
    assert.doesNotThrow(() => canCreateSite(role));
  }
});

test('an unrecognized role string fails safely (no portal access, no throw)', () => {
  const unknown = 'totally_made_up_role' as Parameters<typeof canAccessOperationalPortal>[0];
  assert.doesNotThrow(() => canAccessOperationalPortal(unknown));
  assert.equal(canAccessOperationalPortal(unknown), false);
  assert.equal(canCreateSite(unknown), false);
});

test('recognizing a role does not automatically broaden its permissions', () => {
  assert.equal(canAccessOperationalPortal('site_admin'), true);
  assert.equal(canCreateSite('site_admin'), false);
  assert.equal(canAccessOperationalPortal('org_admin'), false);
  assert.equal(canAccessOperationalPortal('site_manager'), false);
});

test('Owner cannot be represented — it does not exist in the real, deployed UserRole enum yet', () => {
  const source = readFileSync('lib/portal-access.ts', 'utf8');
  assert.doesNotMatch(source, /'owner'/);
});
