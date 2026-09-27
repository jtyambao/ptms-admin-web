import type { UserRole } from './ptms-api';

// P1 Dashboard (2026-09-26) — verified against a fresh origin/main read of
// SitesService.findAllForRequester (src/sites/sites.service.ts): exactly
// super_admin (all sites), engineer/manager (own org), supervisor/site_admin
// (their own assigned sites only). `admin` and `org_admin` both throw
// ForbiddenException here — a real, current backend gap (the known live
// `admin` account has no endpoint to discover its own assigned Site at all
// today; this is not introduced by this pass, the pre-existing Sites list
// page already called listSites unconditionally for every role). Kept as
// its own predicate, not reused from portal-access.ts, because it mirrors
// this one specific service method, not general portal access.
export const canViewSitesOverview = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'engineer' ||
  role === 'manager' ||
  role === 'supervisor' ||
  role === 'site_admin';

// Verified against a fresh origin/main read of IncidentsController's
// RESPONDER_ROLES constant (src/incidents/incidents.controller.ts): exactly
// super_admin, org_admin, site_manager, supervisor. `org_admin`/
// `site_manager` are not in PORTAL_ROLES (no Admin Web portal access at
// all), so in practice only super_admin/supervisor can reach this widget
// today — a real, current limitation, not hidden here.
export const canViewIncidents = (role: UserRole) =>
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
