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
// site-scoped Incident visibility. P3(b) update: RESPONDER_ROLES and
// READ_ROLES on the backend are now the SAME set (admin/site_admin also
// gained acknowledge/resolve, restricted server-side to their own
// assigned Site) — this one predicate now gates both viewing the list and
// showing the acknowledge/resolve action buttons.
export const canViewIncidents = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'site_manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';

// Reports page + Incoming SOS banner (branch release/dry-run-ops) —
// verified against SosController's RESPONDER_ROLES constant
// (src/sos/sos.controller.ts). P3(a) update: `admin`/`site_admin` added —
// full view/acknowledge/cancel authority, restricted server-side to their
// own assigned Site (SosService). This one predicate now gates viewing
// the list, the acknowledge/cancel action buttons, and the global
// Incoming SOS banner.
export const canViewSos = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'site_manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';

// Incoming SOS banner + Reports/acknowledge action gate — an SOS alert
// this role is currently viewing can also be acknowledged/cancelled by
// that same role (SosController's RESPONDER_ROLES has no narrower
// "read-only" subset, unlike Incidents), so this is deliberately an alias
// of canViewSos rather than a separately-drifting predicate.
export const canRespondToSos = canViewSos;

// Special Check Requests create page (branch release/dry-run-ops) —
// verified against SpecialCheckRequestsController's SENDER_ROLES constant
// (src/special-check-requests/special-check-requests.controller.ts).
// P3(c) update: `admin`/`site_admin` added — restricted server-side to
// their own assigned Site (SpecialCheckRequestsService.create()).
export const canSendSpecialCheckRequest = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'org_admin' ||
  role === 'site_manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';

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

// Device presence (P2, branch feat/admin-oic-management) — deliberately
// "Last active: X ago", never "Online"/"Offline". site_devices.last_seen_at
// is only touched at Guard-app site login and (once the Guard app ships
// the deviceId-carrying change) on its existing 5s round-status poll —
// there is no real-time heartbeat here, so a live online/offline claim
// would be dishonest. A null last_seen_at means the device has never
// logged in since being registered.
export function formatLastActive(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Never logged in';
  const seconds = Math.max(0, (Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (seconds < 90) return 'Last active moments ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Last active ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Last active ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Last active ${days} d ago`;
}
