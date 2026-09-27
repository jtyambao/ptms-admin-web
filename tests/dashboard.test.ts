import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewIncidents, canViewSitesOverview, isToday } from '../lib/dashboard.ts';

// Dry-run fix (branch release/dry-run-ops): `admin` is added to
// findAllForRequester's assignment-scoped branch on the backend, closing
// the gap the superseded version of this test documented.
test('canViewSitesOverview matches findAllForRequester exactly', () => {
  assert.equal(canViewSitesOverview('super_admin'), true);
  assert.equal(canViewSitesOverview('engineer'), true);
  assert.equal(canViewSitesOverview('manager'), true);
  assert.equal(canViewSitesOverview('supervisor'), true);
  assert.equal(canViewSitesOverview('site_admin'), true);
  assert.equal(canViewSitesOverview('admin'), true);
  assert.equal(canViewSitesOverview('org_admin'), false);
  assert.equal(canViewSitesOverview('site_manager'), false);
  assert.equal(canViewSitesOverview('auditor'), false);
  assert.equal(canViewSitesOverview('client_viewer'), false);
});

// Dry-run fix (branch release/dry-run-ops): `admin`/`site_admin` gain
// READ-only, site-scoped Incident visibility via a new READ_ROLES set on
// the backend (RESPONDER_ROLES itself, gating acknowledge/resolve, is
// unchanged and still excludes both).
test('canViewIncidents matches READ_ROLES exactly (RESPONDER_ROLES + admin + site_admin)', () => {
  assert.equal(canViewIncidents('super_admin'), true);
  assert.equal(canViewIncidents('org_admin'), true);
  assert.equal(canViewIncidents('site_manager'), true);
  assert.equal(canViewIncidents('supervisor'), true);
  assert.equal(canViewIncidents('admin'), true);
  assert.equal(canViewIncidents('site_admin'), true);
  assert.equal(canViewIncidents('engineer'), false);
  assert.equal(canViewIncidents('manager'), false);
  assert.equal(canViewIncidents('auditor'), false);
  assert.equal(canViewIncidents('client_viewer'), false);
});

test('isToday matches only the viewer\'s own local calendar day', () => {
  const now = new Date();
  assert.equal(isToday(now.toISOString()), true);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(isToday(yesterday.toISOString()), false);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  assert.equal(isToday(tomorrow.toISOString()), false);
});
