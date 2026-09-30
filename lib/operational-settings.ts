import type { UserRole } from './ptms-api';

// Verified (2026-09-26) directly against origin/main's
// OperationalSettingsService.resolveOrganizationId: exactly `super_admin`
// or `org_admin` may read or write `/management/operational-settings` —
// there is no read/write distinction between them (unlike an earlier,
// disproven "PER-SITE ALIGNMENT" version of this page that claimed
// Owner/Engineer/Manager got view-only and Supervisor/Admin got
// read+write — none of those four roles are authorized for this endpoint
// at all). `org_admin` is not currently in PORTAL_ROLES (see
// BACKEND_GAPS.md), so in practice only `super_admin` can reach this page
// today through the Admin Web portal — a real, current limitation, not
// hidden here.
export const canViewOperationalSettings = (role: UserRole) =>
  role === 'super_admin' || role === 'org_admin';
export const canEditOperationalSettings = canViewOperationalSettings;

// Only super_admin may (and must) supply organizationId — org_admin is
// hard-locked server-side to their own organization regardless of what's
// sent, so no id field is shown for them at all.
export const requiresOrganizationIdForSettings = (role: UserRole) => role === 'super_admin';

// Per-Site Operational Settings (P3, branch feat/admin-oic-management,
// backend sql/050) — a SEPARATE, genuinely site-scoped surface from the
// org-wide one above, per PTMS_FINAL_ROLE_PERMISSION_POLICY.md's own
// documented design for this exact feature. Matches
// SiteOperationalAccessService.requireReadAccess/requireManageAccess
// exactly (the same helper every other assigned-Site capability in this
// codebase already uses) — Owner/Engineer/Manager/org_admin view any
// authorized Site; Supervisor/Admin/legacy Site Admin view+edit only
// their own assigned Site; Engineer/Manager cannot edit.
export const canViewSiteOperationalSettings = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'engineer' ||
  role === 'manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';

export const canEditSiteOperationalSettings = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';
