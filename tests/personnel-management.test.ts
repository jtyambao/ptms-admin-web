import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canManagePersonnel,
  canViewPersonnel,
  generatePersonnelMpin,
  isValidMpin,
} from '../lib/personnel-management.ts';

test('MPIN validation accepts exactly 4 to 8 ASCII numeric digits', () => {
  assert.equal(isValidMpin('1234'), true);
  assert.equal(isValidMpin('12345678'), true);
  assert.equal(isValidMpin('123'), false);
  assert.equal(isValidMpin('123456789'), false);
  assert.equal(isValidMpin('12ab56'), false);
  assert.equal(isValidMpin('１２３４'), false);
});

test('Generate produces a six-digit MPIN through secure-random architecture', () => {
  let calls = 0;
  const secureRandom = {
    getRandomValues(values: Uint32Array) {
      calls += 1;
      values[0] = 42;
      return values;
    },
  };
  const generated = generatePersonnelMpin(secureRandom as Pick<Crypto, 'getRandomValues'>);
  assert.match(generated, /^[0-9]{6}$/);
  assert.equal(calls, 1);
  assert.equal(generatePersonnelMpin.toString().includes('Math.random'), false);
});

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that assumed
// the future five-role design (Admin-only) was already live in production.
// Verified against a fresh origin/main read
// (personnel.service.ts create/deactivate): still exactly
// `supervisor || site_admin` — `manager` explicitly forbidden, and the
// bare `admin` role (migration 034) is NOT yet recognized here at all (a
// real, current backend gap, not something to paper over).
test('management controls are limited to Supervisor and Site Admin', () => {
  assert.equal(canManagePersonnel('supervisor'), true);
  assert.equal(canManagePersonnel('site_admin'), true);
  assert.equal(canManagePersonnel('admin'), false);
  assert.equal(canManagePersonnel('manager'), false);
  assert.equal(canManagePersonnel('engineer'), false);
  assert.equal(canManagePersonnel('super_admin'), false);
});

// Dry-run fix (branch release/dry-run-ops): `admin` is added to
// findAllForRequester/findOneForRequester's assignment-scoped branch on
// the backend (read-only — canManagePersonnel above is unchanged).
test('view matches findAllForRequester exactly — super_admin/engineer/manager org-wide, supervisor/site_admin/admin assigned-site', () => {
  assert.equal(canViewPersonnel('super_admin'), true);
  assert.equal(canViewPersonnel('engineer'), true);
  assert.equal(canViewPersonnel('manager'), true);
  assert.equal(canViewPersonnel('supervisor'), true);
  assert.equal(canViewPersonnel('site_admin'), true);
  assert.equal(canViewPersonnel('admin'), true);
  assert.equal(canViewPersonnel('org_admin'), false);
});

test('Site Personnel UI includes safe list, create, duplicate, deactivate, and OIC flows', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(source, /Personnel and OIC/);
  assert.match(source, /Register Personnel/);
  assert.match(source, /This MPIN is already in use at this Site/);
  assert.match(source, /Deactivate Personnel\?/);
  assert.match(source, /Complete the OIC handover before deactivating/);
  assert.match(source, /Change OIC|Assign OIC/);
  assert.match(source, /person\.status === 'active'/);
  assert.match(source, /setMpin\(''\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /mpin_hash/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('Personnel list never renders an MPIN or hash field', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  const listStart = source.indexOf('personnel.map');
  const listEnd = source.indexOf('<Dialog open={createOpen}');
  const listSource = source.slice(listStart, listEnd);
  assert.ok(listStart > -1 && listEnd > listStart);
  assert.doesNotMatch(listSource, /person\.mpin|mpin_hash|View MPIN/);
});

test('light and dark visual treatment remains represented in the Personnel UI', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(source, /dark:/);
  assert.match(source, /#e86405|#f36f0a/);
});

test('Regenerate MPIN action only appears where existing Personnel-management permissions already allow it', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  // Same gate as Deactivate — `allowed` is unchanged from canManagePersonnel();
  // this feature does not introduce or widen any role check.
  assert.match(
    source,
    /\{allowed && person\.status === 'active' && \(\s*<div className="flex flex-wrap gap-2">\s*<Button variant="outline" onClick=\{\(\) => setRegenerateTarget\(person\)\}>/,
  );
  // Exactly the two pre-existing gates (header actions, row actions) — this
  // feature introduces no new role check of its own.
  const allowedOccurrences = source.match(/allowed &&/g) ?? [];
  assert.equal(allowedOccurrences.length, 2);
});

test('Regenerate MPIN confirmation warns the old MPIN stops working immediately', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(source, /Regenerate MPIN for \{regenerateTarget\?\.full_name\}\?/);
  assert.match(source, /current MPIN will stop working immediately/);
});

test('the new MPIN is only ever displayed after a successful regenerate response, never before', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  const regenerateFnStart = source.indexOf('async function regenerateMpin()');
  const regenerateFnEnd = source.indexOf('\n  }', regenerateFnStart);
  const regenerateFnBody = source.slice(regenerateFnStart, regenerateFnEnd);
  // setRegeneratedMpin is only called with the API response's own mpin value,
  // inside the try block, after the await — never in the catch branch and
  // never with a client-side/placeholder value.
  assert.match(regenerateFnBody, /setRegeneratedMpin\(result\.mpin\)/);
  const catchStart = regenerateFnBody.indexOf('} catch');
  assert.doesNotMatch(regenerateFnBody.slice(catchStart), /setRegeneratedMpin\(/);
});

test('the one-time MPIN is cleared from React state when its dialog closes', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(source, /function closeMpinDisplay\(\) \{\s*setRegeneratedMpin\(null\);\s*setCopyConfirmed\(false\);\s*\}/);
  assert.match(source, /onOpenChange=\{\(open\) => \{ if \(!open\) closeMpinDisplay\(\); \}\}/);
});

test('Copy action writes to the clipboard without persisting the MPIN anywhere else', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(source, /navigator\.clipboard\.writeText\(regeneratedMpin\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
});

test('there is no View Existing MPIN capability anywhere in the Personnel UI', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /View.{0,15}MPIN/i);
  assert.doesNotMatch(source, /person\.mpin\b/);
  assert.doesNotMatch(source, /mpin_hash/);
});

test('Regenerate MPIN handles 403/404/409 and the generic fallback distinctly', () => {
  const source = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(source, /This Personnel is inactive and cannot receive a new MPIN\./);
  assert.match(source, /This Personnel could not be found\. The list has been refreshed\./);
  assert.match(source, /reason instanceof ApiRequestError\s*\?\s*reason\.message\s*$/m);
  assert.match(source, /genericError/);
});

test('regeneratePersonnelMpin sends no request body — the server generates the MPIN', () => {
  const source = readFileSync('lib/management-api.ts', 'utf8');
  const start = source.indexOf('regeneratePersonnelMpin:');
  const end = source.indexOf('handoverOic:', start);
  const call = source.slice(start, end);
  assert.match(call, /\/personnel\/\$\{id\}\/regenerate-mpin/);
  assert.match(call, /method: 'POST'/);
  assert.doesNotMatch(call, /body:/);
});

// Dry-run fix (branch release/dry-run-ops): the backend has always
// rotated the Site's own Guard-facing credential on every OIC handover,
// returning it as newSiteMpin — this client previously typed the response
// as bare SiteOicAssignment and silently discarded it.
test('handoverOic is typed for and surfaces the rotated Site MPIN it has always received', () => {
  const api = readFileSync('lib/management-api.ts', 'utf8');
  const start = api.indexOf('handoverOic:');
  const end = api.indexOf('listDevices:', start);
  const call = api.slice(start, end);
  assert.match(call, /OicHandoverResult/);
  assert.doesNotMatch(call, /api\.request<SiteOicAssignment>/);

  const panel = readFileSync('components/site-personnel-panel.tsx', 'utf8');
  assert.match(panel, /result\.newSiteMpin/);
  assert.match(panel, /New Site MPIN/);
});
