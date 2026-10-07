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

// Write authority (user-authorized 2026-10-07, per
// PTMS_FINAL_ROLE_PERMISSION_POLICY.md section 11): Supervisor/Admin
// add/edit/remove for their own Site. Mirrors the backend's
// requireManageAccess exactly (supervisor/site_admin/admin own assigned
// Site, org_admin org-wide, super_admin cross-tenant); Manager/Engineer
// are view-only. Before this, create was org_admin/site_manager only -
// legacy roles that cannot sign into Admin Web, so nobody could add one.
export const canManageEmergencyContacts = (role: UserRole) =>
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin' ||
  role === 'org_admin' ||
  role === 'super_admin';
