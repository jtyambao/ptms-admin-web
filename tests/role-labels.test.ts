import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ROLE_LABELS, roleLabel } from '../lib/role-labels.ts';

// Batch 3 correction (2026-09-26): this file was rewritten on 2026-09-24 on
// the premise that the approved five-role business design (owner/engineer/
// manager/supervisor/admin — real design target, see
// sql/049_final_owner_role.sql in the ptms-api-release2-worktree reference
// checkout, LOCAL/UNCOMMITTED/UNDEPLOYED) was already the live, deployed
// UserRole. Restored to match CURRENT PRODUCTION TECHNICAL RBAC — the
// real, committed 10-value UserRole (origin/main:src/auth/jwt-payload.interface.ts).
test('every currently deployed role has a label', () => {
  const realRoles = [
    'super_admin', 'owner', 'engineer', 'manager', 'org_admin', 'site_admin',
    'site_manager', 'supervisor', 'admin', 'auditor', 'client_viewer',
  ] as const;
  for (const role of realRoles) {
    assert.equal(typeof roleLabel(role), 'string');
    assert.ok(roleLabel(role).length > 0);
  }
  assert.equal(Object.keys(ROLE_LABELS).length, realRoles.length);
});

test('admin has a label — the bare role added by migration 034, distinct from legacy site_admin', () => {
  assert.equal(roleLabel('admin'), 'Admin');
});

test('site_admin keeps a distinguishing label — it is legacy, not deleted; both it and admin are live', () => {
  assert.match(roleLabel('site_admin'), /legacy/i);
});

test('owner has a label now that sql/060 adds the role (monitoring only)', () => {
  assert.equal(roleLabel('owner'), 'Owner');
});

test('a role label is cosmetic only — the UserRole type carries all 11 values (the 10 committed ones plus owner, sql/060)', () => {
  const source = readFileSync('lib/ptms-api.ts', 'utf8');
  const start = source.indexOf('export type UserRole =');
  const end = source.indexOf(';', start);
  const declaration = source.slice(start, end);
  assert.match(declaration, /'super_admin'/);
  assert.match(declaration, /'engineer'/);
  assert.match(declaration, /'manager'/);
  assert.match(declaration, /'org_admin'/);
  assert.match(declaration, /'site_admin'/);
  assert.match(declaration, /'site_manager'/);
  assert.match(declaration, /'supervisor'/);
  assert.match(declaration, /'admin'/);
  assert.match(declaration, /'auditor'/);
  assert.match(declaration, /'client_viewer'/);
  assert.match(declaration, /'owner'/);
});
