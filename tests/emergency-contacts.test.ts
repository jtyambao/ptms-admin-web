import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';
import {
  canManageEmergencyContacts,
  canViewEmergencyContacts,
  validateEmergencyContact,
} from '../lib/emergency-contacts.ts';
import { PORTAL_ROLES } from '../lib/portal-access.ts';

// Batch 3 correction (2026-09-26): this file was rewritten on 2026-09-24
// on the premise that the five-role design (approved, but local/uncommitted/
// undeployed transition WIP in ptms-api-release2-worktree) was already live
// in production. Restored to match a fresh origin/main read of CURRENT
// PRODUCTION TECHNICAL RBAC.
test('Emergency Contacts: view is a frontend-only gate matching the site-operations tier', () => {
  assert.equal(canViewEmergencyContacts('supervisor'), true);
  assert.equal(canViewEmergencyContacts('site_admin'), true);
  assert.equal(canViewEmergencyContacts('admin'), true);
  assert.equal(canViewEmergencyContacts('super_admin'), true);
  assert.equal(canViewEmergencyContacts('engineer'), false);
  assert.equal(canViewEmergencyContacts('manager'), false);
  assert.equal(canViewEmergencyContacts('org_admin'), false);
});

test('Emergency Contacts: add/edit/delete matches the backend requireManageAccess exactly - Supervisor/Admin of the Site, Manager/Engineer view-only (policy section 11, 2026-10-07)', () => {
  assert.equal(canManageEmergencyContacts('supervisor'), true);
  assert.equal(canManageEmergencyContacts('site_admin'), true);
  assert.equal(canManageEmergencyContacts('admin'), true);
  assert.equal(canManageEmergencyContacts('org_admin'), true);
  assert.equal(canManageEmergencyContacts('super_admin'), true);
  assert.equal(canManageEmergencyContacts('manager'), false);
  assert.equal(canManageEmergencyContacts('engineer'), false);
  assert.equal(canManageEmergencyContacts('site_manager'), false);
});

test('Emergency Contacts: the legacy create roles (org_admin, site_manager) are still not portal roles - which is why add/edit/delete moved to Supervisor/Admin', () => {
  assert.equal(PORTAL_ROLES.includes('org_admin'), false);
  assert.equal(PORTAL_ROLES.includes('site_manager'), false);
});

test('Emergency Contacts: validation mirrors CreateEmergencyContactDto exactly', () => {
  assert.equal(validateEmergencyContact({ category: '', name: 'x', phoneNumber: '', notes: '' }), 'Select a contact category.');
  assert.equal(validateEmergencyContact({ category: 'internal', name: '', phoneNumber: '', notes: '' }), 'Enter a name up to 150 characters.');
  assert.equal(validateEmergencyContact({ category: 'internal', name: 'a'.repeat(151), phoneNumber: '', notes: '' }), 'Enter a name up to 150 characters.');
  assert.equal(validateEmergencyContact({ category: 'external', name: 'Ok', phoneNumber: '1'.repeat(31), notes: '' }), 'Phone number must be 30 characters or fewer.');
  assert.equal(validateEmergencyContact({ category: 'external', name: 'Ok', phoneNumber: '', notes: 'n'.repeat(301) }), 'Notes must be 300 characters or fewer.');
  assert.equal(validateEmergencyContact({ category: 'internal', name: 'Front Desk', phoneNumber: '021234567', notes: 'Lobby' }), null);
});

test('Emergency Contacts panel: has Edit (same dialog, pre-filled) and Delete (confirmed) wired to the real endpoints', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.match(source, /managementApi\.updateEmergencyContact\(session\.api, editTarget\.id,/);
  assert.match(source, /managementApi\.deleteEmergencyContact\(session\.api, deleteTarget\.id\)/);
  assert.match(source, /Edit Emergency Contact/);
  assert.match(source, /<AlertDialogTitle>Delete \{deleteTarget\?\.name\}\?/);
  assert.doesNotMatch(source, /no edit or deactivate action yet/i);
});

test('Emergency Contacts panel: clearing the phone/notes while editing really clears them (blank -> null, not omitted)', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.match(source, /phoneNumber: phoneNumber\.trim\(\) \? phoneNumber\.trim\(\) : null/);
  assert.match(source, /notes: notes\.trim\(\) \? notes\.trim\(\) : null/);
});

test('management-api: PATCH/DELETE /emergency-contacts/:id', async () => {
  const calls: { path: string; method?: string; body?: unknown }[] = [];
  const api = { request: async (path: string, init?: RequestInit) => { calls.push({ path, method: init?.method, body: init?.body }); return {}; } } as never;
  await managementApi.updateEmergencyContact(api, 5, { phoneNumber: null });
  await managementApi.deleteEmergencyContact(api, 5);
  assert.deepEqual(calls, [
    { path: '/emergency-contacts/5', method: 'PATCH', body: '{"phoneNumber":null}' },
    { path: '/emergency-contacts/5', method: 'DELETE', body: undefined },
  ]);
});

test('Emergency Contacts panel: handles loading, empty, and error states, and never persists data client-side', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.match(source, /Loading Emergency Contacts/);
  assert.match(source, /No Emergency Contacts for this Site/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('Emergency Contacts panel: manage is gated separately from view, using the exact backend-authorized roles', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.match(source, /canManageEmergencyContacts/);
  assert.match(source, /canViewEmergencyContacts/);
  assert.match(source, /Only a Supervisor or Admin of this Site can add, edit or delete contacts/);
});
