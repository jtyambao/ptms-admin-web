import type { UserRole } from './ptms-api';

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that narrowed
// this to Engineer-only with no organizationId field, on the mistaken
// premise that the future five-role design (where Engineer owns general
// account administration) was already CURRENT PRODUCTION TECHNICAL RBAC —
// verified against a fresh origin/main read (users.controller.ts,
// create-user.dto.ts):
// `POST/GET /users` is still exactly `@Roles('super_admin', 'org_admin')`,
// and `CreateUserDto.organizationId` is still present, unchanged since
// Batch 2. Generic platform/organization account screen, distinct from the
// Supervisor/Admin hierarchy accounts managed via site-hierarchy-panel.tsx.
export const canViewUsers = (role: UserRole) =>
  role === 'super_admin' || role === 'org_admin';
export const canCreateUsers = canViewUsers;

// Verified (2026-09-26) against origin/main's UsersService.create(): the
// hierarchy carve-out now also blocks the new `admin` role (alongside the
// pre-existing engineer/manager/supervisor/site_admin) for any
// non-super_admin caller — `admin` accounts must go through
// createSiteAdminAccount instead, same as site_admin always did.
const HIERARCHY_ROLES: UserRole[] = ['engineer', 'manager', 'supervisor', 'site_admin', 'admin'];
const NON_SUPER_ADMIN_ROLES: UserRole[] = [
  'engineer', 'manager', 'org_admin', 'site_admin', 'site_manager', 'supervisor', 'admin', 'auditor', 'client_viewer',
];

/**
 * The exact set of roles a requester may assign via POST /users, mirroring
 * UsersService.create's own check: super_admin may pick any of the 9
 * non-super_admin roles; org_admin (the only other caller that can reach
 * this screen) is refused the 5 hierarchy roles — those require the
 * dedicated hierarchy endpoints (createSupervisorAccount/createSiteAdminAccount)
 * instead. super_admin itself is never assignable through this endpoint by
 * anyone — provisioning one is an out-of-band operational step.
 */
export function assignableRolesFor(requesterRole: UserRole): UserRole[] {
  if (requesterRole === 'super_admin') return NON_SUPER_ADMIN_ROLES;
  return NON_SUPER_ADMIN_ROLES.filter((role) => !HIERARCHY_ROLES.includes(role));
}

// Only super_admin may (and must) supply organizationId — org_admin is
// hard-locked server-side to their own organization regardless of what's
// sent, so the field is not shown for them at all. Verified unchanged
// against origin/main's create-user.dto.ts (2026-09-26).
export const requiresOrganizationId = (requesterRole: UserRole) => requesterRole === 'super_admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (value: string) => EMAIL_PATTERN.test(value);
export const isValidPassword = (value: string) => value.length >= 8;
