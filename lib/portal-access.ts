import type { UserRole } from './ptms-api';

// Batch 3 correction (2026-09-26): the 2026-09-24 edit here had coded this
// file as if the approved five-role business design (owner/engineer/
// manager/supervisor/admin) were already CURRENT PRODUCTION TECHNICAL RBAC.
// The design target itself is real and owner-approved (see
// `sql/049_final_owner_role.sql` in the ptms-api-release2-worktree
// reference checkout — LOCAL/UNCOMMITTED/UNDEPLOYED WIP); the error was
// treating undeployed transition work as already-live authorization.
// Reverted to what `origin/main` actually enforces today: `admin`
// (migration 034, additive, real, deployed) is included here since it is a
// real, live, currently-issued role — the task brief's own known live
// account (admin@guanzongroup.com.ph, id 18) has this exact role and needs
// Admin Web portal access for day-to-day Site administration. `org_admin`,
// `site_manager`, `auditor`, `client_viewer` remain excluded — no approved
// source establishes Admin Web portal access for them (same policy as
// Batch 1). `owner` cannot be represented yet — it does not exist in the
// currently deployed UserRole enum (see ptms-api.ts's UserRole comment for
// its LOCAL/UNCOMMITTED/UNDEPLOYED status).
export const PORTAL_ROLES: UserRole[] = [
  'super_admin',
  'engineer',
  'manager',
  'supervisor',
  'site_admin',
  'admin',
];
export const canAccessOperationalPortal = (role: UserRole) =>
  PORTAL_ROLES.includes(role);
// Verified (2026-09-26) against origin/main's sites.service.ts create():
// `ForbiddenException('Only an organization Engineer or Manager may create
// sites.')` — Manager IS authorized under current production RBAC; a
// 2026-09-24 edit had prematurely narrowed this to Engineer-only in line
// with the future five-role design's Engineer/Manager split, before that
// design is actually deployed.
export const canCreateSite = (role: UserRole) =>
  role === 'engineer' || role === 'manager';
