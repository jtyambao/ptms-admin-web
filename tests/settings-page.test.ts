import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// P3 site-scoped Operational Settings (branch feat/admin-oic-management,
// backend sql/050) — supersedes the Batch 3 correction's premise. That
// correction was right for its OWN moment (2026-09-26: no site-scoped
// backend existed yet, so a "PER-SITE ALIGNMENT" page was a real, false
// premise) — but PTMS_FINAL_ROLE_PERMISSION_POLICY.md itself now
// documents an owner-authorized 2026-09-24 per-Site implementation, and
// sql/050 + site-operational-settings.controller.ts are the real thing
// this time. The org-wide section (super_admin/org_admin,
// GET/PATCH /management/operational-settings) is completely untouched;
// SiteOperationalSettingsPanel is a separate, additional component this
// page now also renders.
const source = readFileSync('app/settings/page.tsx', 'utf8');
const panel = readFileSync('components/site-operational-settings-panel.tsx', 'utf8');
const lib = readFileSync('lib/operational-settings.ts', 'utf8');

test('the org-wide section still role-gates on the org-wide predicates, unchanged', () => {
  assert.match(source, /canViewOperationalSettings\(role\)/);
  assert.match(source, /requiresOrganizationIdForSettings\(role\)/);
});

test('the page also renders the new per-Site panel, gated on the site-scoped view predicate', () => {
  assert.match(source, /import \{ SiteOperationalSettingsPanel \} from '@\/components\/site-operational-settings-panel';/);
  assert.match(source, /\{canViewSite && <SiteOperationalSettingsPanel \/>\}/);
  assert.match(source, /canViewSiteOperationalSettings\(role\)/);
});

test('the page no longer hard-walls every non-org-wide role — only unreachable when neither predicate passes', () => {
  assert.match(source, /if \(!canView && !canViewSite\) \{/);
  assert.match(source, /Operational Settings are unavailable for this role\./);
});

// Per-Site view/edit ARE now genuinely distinct roles (Owner/Engineer/
// Manager/org_admin view any authorized Site; Supervisor/Admin/legacy
// Site Admin view+edit their own) — matching
// SiteOperationalAccessService.requireReadAccess/requireManageAccess
// exactly, the same helper every other assigned-Site capability uses.
test('canViewSiteOperationalSettings is broader than canEditSiteOperationalSettings (Engineer/Manager view-only)', () => {
  assert.match(lib, /export const canViewSiteOperationalSettings = \(role: UserRole\) =>/);
  assert.match(lib, /export const canEditSiteOperationalSettings = \(role: UserRole\) =>/);
  const viewStart = lib.indexOf('export const canViewSiteOperationalSettings');
  const viewEnd = lib.indexOf(';', viewStart);
  const viewBody = lib.slice(viewStart, viewEnd);
  assert.match(viewBody, /role === 'engineer'/);
  assert.match(viewBody, /role === 'manager'/);
  const editStart = lib.indexOf('export const canEditSiteOperationalSettings');
  const editEnd = lib.indexOf(';', editStart);
  const editBody = lib.slice(editStart, editEnd);
  assert.doesNotMatch(editBody, /role === 'engineer'/);
  assert.doesNotMatch(editBody, /role === 'manager'/);
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

test('org-wide load/save still pass the parsed/needed organizationId', () => {
  const componentStart = source.indexOf('async function load()');
  const componentSource = source.slice(componentStart);
  assert.match(componentSource, /managementApi\.getOperationalSettings\(session\.api, parsedOrganizationId\)/);
  assert.match(componentSource, /managementApi\.updateOperationalSettings\(session\.api, \{/);
});

test('the per-Site panel is a real site selector with friendly presets, not a raw seconds input', () => {
  assert.match(panel, /managementApi\.listSites\(session\.api\)/);
  assert.match(panel, /managementApi\.getSiteOperationalSettings/);
  assert.match(panel, /managementApi\.updateSiteOperationalSettings/);
  assert.match(panel, /managementApi\.resetSiteOperationalSettings/);
  assert.match(panel, /15 seconds/);
  assert.match(panel, /30 seconds/);
  assert.match(panel, /1 minute/);
  assert.match(panel, /2 minutes/);
  // A single Site renders as a label, not a dropdown (per
  // PTMS_FINAL_ROLE_PERMISSION_POLICY.md's own documented design).
  assert.match(panel, /sites\.length === 1/);
  assert.match(panel, /sites\.length > 1/);
});

test('"Default" is a whole-row Reset action (shown only when a Site override exists), not a per-field null', () => {
  assert.match(panel, /Reset to organization default/);
  assert.match(panel, /settings\.hasOverride && \(/);
});

test('no new page, navigation, or workflow was introduced — same Settings entry, same nav', () => {
  assert.doesNotMatch(source, /useRouter\(\)\.push/);
  assert.match(source, /<PortalShell active="settings">/);
});
