import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Batch 3 correction (2026-09-26): this file was rewritten on 2026-09-24 on
// the premise that Operational Settings had already become site-scoped in
// production. Restored to match the corrected, organization-scoped
// app/settings/page.tsx (source-inspection tests, matching this repo's
// established convention).
const source = readFileSync('app/settings/page.tsx', 'utf8');

test('Settings page role-gates on the corrected operational-settings predicates, not the site-operations one', () => {
  assert.match(source, /canViewOperationalSettings\(role\)/);
  assert.match(source, /requiresOrganizationIdForSettings\(role\)/);
  assert.doesNotMatch(source, /canManageSiteOperations/);
});

test('view without edit is not representable — Operational Settings has no view-only role in the real contract', () => {
  assert.match(source, /Operational Settings are unavailable for this role\./);
  assert.doesNotMatch(source, /canEdit/);
});

test('super_admin gets an Organization ID field with an explicit Load action; org_admin auto-loads without one', () => {
  assert.match(source, /needsOrganizationId/);
  assert.match(source, /settings-organization-id/);
  assert.match(source, /No Organization directory exists yet/);
  assert.match(source, /!needsOrganizationId && !settings && !loading && !error/);
});

test('changing the Organization ID clears any previously loaded settings before a fresh Load', () => {
  const fnStart = source.indexOf('onChange={(e) => { setOrganizationId');
  assert.ok(fnStart > -1);
  assert.match(source.slice(fnStart, fnStart + 80), /setSettings\(null\)/);
});

test('a missing/invalid Organization ID is rejected client-side before any request is sent', () => {
  const fnStart = source.indexOf('async function load()');
  const fnEnd = source.indexOf('\n  }', fnStart);
  const body = source.slice(fnStart, fnEnd);
  assert.match(body, /Number\.isInteger\(parsedOrganizationId\)/);
  assert.match(body, /Enter a valid Organization ID/);
});

test('load and save both pass the parsed/needed organizationId, never a siteId', () => {
  const componentStart = source.indexOf('export default function OperationalSettingsPage');
  const componentSource = source.slice(componentStart);
  assert.match(componentSource, /managementApi\.getOperationalSettings\(session\.api, parsedOrganizationId\)/);
  assert.match(componentSource, /managementApi\.updateOperationalSettings\(session\.api, \{/);
  assert.doesNotMatch(componentSource, /siteId/);
  assert.doesNotMatch(componentSource, /managementApi\.listSites/);
});

test('no new page, navigation, or workflow was introduced', () => {
  assert.doesNotMatch(source, /useRouter\(\)\.push/);
  assert.match(source, /<PortalShell active="settings">/);
});
