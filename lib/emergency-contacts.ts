import type { UserRole } from './ptms-api';

export const CONTACT_NAME_MAX = 150;
export const CONTACT_PHONE_MAX = 30;
export const CONTACT_NOTES_MAX = 300;

// Mirrors CreateEmergencyContactDto's own validation exactly
// (src/emergency-contacts/dto/create-emergency-contact.dto.ts) — defense in
// depth on top of the backend's own class-validator checks, not a
// replacement for them.
export function validateEmergencyContact(input: {
  category: 'internal' | 'external' | '';
  name: string;
  phoneNumber: string;
  notes: string;
}): string | null {
  if (input.category !== 'internal' && input.category !== 'external') {
    return 'Select a contact category.';
  }
  if (!input.name.trim() || input.name.length > CONTACT_NAME_MAX) {
    return `Enter a name up to ${CONTACT_NAME_MAX} characters.`;
  }
  if (input.phoneNumber.length > CONTACT_PHONE_MAX) {
    return `Phone number must be ${CONTACT_PHONE_MAX} characters or fewer.`;
  }
  if (input.notes.length > CONTACT_NOTES_MAX) {
    return `Notes must be ${CONTACT_NOTES_MAX} characters or fewer.`;
  }
  return null;
}

// View is a frontend-only gate (the backend read is genuinely
// unauthenticated, guard-facing) — matches the site-operations tier, plus
// `admin` (real, live role; migration 034) since Admin's whole purpose is
// day-to-day Site administration.
export const canViewEmergencyContacts = (role: UserRole) =>
  role === 'supervisor' || role === 'site_admin' || role === 'admin' || role === 'super_admin';

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that migrated
// this to Supervisor/Admin on the mistaken premise that the future
// five-role design was already CURRENT PRODUCTION TECHNICAL RBAC. Verified
// against a fresh origin/main read (emergency-contacts.controller.ts):
// still exactly
// `@Roles('org_admin', 'site_manager')`, unchanged since Batch 2. Note:
// as of Batch 1's role reconciliation, neither role is in PORTAL_ROLES, so
// this control remains currently unreachable by any role that can sign
// into Admin Web — a real, current limitation, not a bug to silently paper
// over by adding those roles to portal access, which would be an
// unauthorized permission expansion.
export const canCreateEmergencyContact = (role: UserRole) =>
  role === 'org_admin' || role === 'site_manager';
