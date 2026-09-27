import type { UserRole } from './ptms-api';

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that narrowed
// this to only the five final business-role labels, on the mistaken
// premise that they were already CURRENT PRODUCTION TECHNICAL RBAC — see
// UserRole's own comment in ptms-api.ts for the corrected classification
// (the five-role design is real and approved, just not yet deployed).
// Display labels only — never used for
// permission checks (those live in portal-access.ts / personnel-management.ts /
// site-operations.ts / site-setup.ts / user-management.ts / emergency-contacts.ts
// and key on the exact backend UserRole string). A label like 'Admin' for
// `admin` (or 'Admin' reused loosely in UI copy for `site_admin`) is purely
// a shorter on-screen name, not a claim of business-role equivalence.
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin / Internal Platform Role',
  engineer: 'Engineer',
  manager: 'Manager',
  org_admin: 'Organization Admin',
  site_admin: 'Site Admin (legacy)',
  site_manager: 'Legacy Site Manager',
  supervisor: 'Supervisor',
  admin: 'Admin',
  auditor: 'Auditor',
  client_viewer: 'Client Viewer',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
