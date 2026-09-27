import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewIncidents, canViewSitesOverview, isToday } from '../lib/dashboard.ts';

// Verified against a fresh origin/main read of SitesService.findAllForRequester:
// super_admin/engineer/manager (org-wide), supervisor/site_admin (own
// assigned sites). admin and org_admin both throw ForbiddenException there.
test('canViewSitesOverview matches findAllForRequester exactly', () => {
  assert.equal(canViewSitesOverview('super_admin'), true);
  assert.equal(canViewSitesOverview('engineer'), true);
  assert.equal(canViewSitesOverview('manager'), true);
  assert.equal(canViewSitesOverview('supervisor'), true);
  assert.equal(canViewSitesOverview('site_admin'), true);
  assert.equal(canViewSitesOverview('admin'), false);
  assert.equal(canViewSitesOverview('org_admin'), false);
  assert.equal(canViewSitesOverview('site_manager'), false);
  assert.equal(canViewSitesOverview('auditor'), false);
  assert.equal(canViewSitesOverview('client_viewer'), false);
});

// Verified against a fresh origin/main read of IncidentsController's
// RESPONDER_ROLES constant: super_admin, org_admin, site_manager, supervisor.
test('canViewIncidents matches RESPONDER_ROLES exactly', () => {
  assert.equal(canViewIncidents('super_admin'), true);
  assert.equal(canViewIncidents('org_admin'), true);
  assert.equal(canViewIncidents('site_manager'), true);
  assert.equal(canViewIncidents('supervisor'), true);
  assert.equal(canViewIncidents('engineer'), false);
  assert.equal(canViewIncidents('manager'), false);
  assert.equal(canViewIncidents('admin'), false);
  assert.equal(canViewIncidents('site_admin'), false);
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
