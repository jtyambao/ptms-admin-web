import type { UserRole } from './ptms-api';

// P1 Dashboard (2026-09-26) — verified against a fresh origin/main read of
// SitesService.findAllForRequester (src/sites/sites.service.ts): exactly
// super_admin (all sites), engineer/manager (own org), supervisor/site_admin
// (their own assigned sites only). Kept as its own predicate, not reused
// from portal-access.ts, because it mirrors this one specific service
// method, not general portal access.
//
// Dry-run fix (branch release/dry-run-ops, backend commit
// "admin assigned-site access for Personnel and Incidents"): `admin` is
// added to the assignment-scoped branch on the backend, closing the gap
// this comment used to document — `admin` can now discover its own
// assigned Site here too.
export const canViewSitesOverview = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'engineer' ||
  role === 'manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';

// Verified against a fresh origin/main read of IncidentsController's
// RESPONDER_ROLES constant (src/incidents/incidents.controller.ts): exactly
// super_admin, org_admin, site_manager, supervisor. `org_admin`/
// `site_manager` are not in PORTAL_ROLES (no Admin Web portal access at
// all), so in practice only super_admin/supervisor could reach this widget
// before this fix.
//
// Dry-run fix (branch release/dry-run-ops): `admin`/`site_admin` gain
// READ-only, site-scoped Incident visibility via a new READ_ROLES set on
// the backend (separate from RESPONDER_ROLES, which still gates
// acknowledge/resolve — admin has no write authority here, matching the
// backend's least-privilege design).
export const canViewIncidents = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'site_manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';

// Reports page (branch release/dry-run-ops) — verified against a fresh
// origin/main read of SosController's RESPONDER_ROLES constant
// (src/sos/sos.controller.ts): exactly super_admin, org_admin,
// site_manager, supervisor — the same set as canViewIncidents above,
// since both controllers happen to share the identical constant name and
// value today (not guaranteed to stay in lock-step, so kept as its own
// predicate rather than an alias).
export const canViewSos = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'site_manager' ||
  role === 'supervisor';

// Special Check Requests create page (branch release/dry-run-ops) —
// verified against a fresh origin/main read of
// SpecialCheckRequestsController's SENDER_ROLES constant
// (src/special-check-requests/special-check-requests.controller.ts):
// exactly super_admin, org_admin, site_manager, supervisor. `admin`/
// `site_admin` cannot send one today — a real, current backend
// limitation, not something to paper over here.
export const canSendSpecialCheckRequest = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'site_manager' ||
  role === 'supervisor';

// "Today" for a widget that has no server-computed boundary of its own
// (unlike the old fake summary, which used each Site's own configured
// timezone) is necessarily the viewer's local calendar day — an honest
// approximation stated as such in the UI, never presented as an
// authoritative per-Site "today" the way the undeployed summary endpoint
// would compute it.
export function isToday(iso: string): boolean {
  const occurred = new Date(iso);
  const now = new Date();
  return (
    occurred.getFullYear() === now.getFullYear() &&
    occurred.getMonth() === now.getMonth() &&
    occurred.getDate() === now.getDate()
  );
}
