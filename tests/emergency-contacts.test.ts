import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canCreateEmergencyContact,
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

test('Emergency Contacts: create matches the real backend role restriction exactly (org_admin, site_manager only) — verified against a fresh origin/main read, unchanged since Batch 2', () => {
  assert.equal(canCreateEmergencyContact('org_admin'), true);
  assert.equal(canCreateEmergencyContact('site_manager'), true);
  assert.equal(canCreateEmergencyContact('supervisor'), false);
  assert.equal(canCreateEmergencyContact('site_admin'), false);
  assert.equal(canCreateEmergencyContact('admin'), false);
  assert.equal(canCreateEmergencyContact('super_admin'), false);
  assert.equal(canCreateEmergencyContact('engineer'), false);
  assert.equal(canCreateEmergencyContact('manager'), false);
});

test('Emergency Contacts: create-authorized roles are not in PORTAL_ROLES — a real, documented limitation, not a bug to paper over', () => {
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

test('Emergency Contacts panel: no edit/deactivate/delete UI exists — the backend has no such endpoint', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /updateEmergencyContact|deactivateEmergencyContact|deleteEmergencyContact/);
  assert.match(source, /no edit or deactivate action yet/i);
});

test('Emergency Contacts panel: handles loading, empty, and error states, and never persists data client-side', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.match(source, /Loading Emergency Contacts/);
  assert.match(source, /No Emergency Contacts for this Site/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('Emergency Contacts panel: create is gated separately from view, using the exact backend-authorized roles', () => {
  const source = readFileSync('components/site-emergency-contacts-panel.tsx', 'utf8');
  assert.match(source, /canCreateEmergencyContact/);
  assert.match(source, /canViewEmergencyContacts/);
  assert.match(source, /Organization Admin or Site Manager account/);
});
