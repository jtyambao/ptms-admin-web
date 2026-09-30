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

// Device presence — ONLINE/OFFLINE (branch feat/remaining-four, chosen
// design documented here). The backend now genuinely touches
// site_devices.last_seen_at on the Guard app's existing 5s round-status
// poll (PR #9, live in production) whenever the Guard app itself sends
// its deviceId on that poll. That Guard app change is QUEUED, not yet
// shipped to real devices as of this writing.
//
// Chosen tradeoff (option (b) from this task's own brief): switch
// straight to a real Online/Offline claim rather than inventing a
// "heartbeat-capable" detection heuristic (that would need a NEW column
// to reliably distinguish a login-caused last_seen_at advance from a
// heartbeat-caused one — real scope, not justified for a threshold
// choice). A device still on the OLD Guard build will show "Offline"
// here even while actively in use, because its last_seen_at only ever
// advances at login (rare), not every 5 seconds — that's fine: "Offline"
// only ever means "not proven online in the last 60 seconds", never
// "proven offline", so this never OVERclaims. Once every fielded Guard
// device has the updated app, every device correctly shows Online/
// Offline in real time with no further Admin Web change needed.
const ONLINE_THRESHOLD_SECONDS = 60;

function relativeTimeAgo(secondsAgo: number): string {
  if (secondsAgo < 90) return 'moments ago';
  const minutes = Math.round(secondsAgo / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function deviceOnlineStatus(lastSeenAt: string | null): { online: boolean; label: string } {
  if (!lastSeenAt) return { online: false, label: 'Offline · never logged in' };
  const seconds = Math.max(0, (Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (seconds < ONLINE_THRESHOLD_SECONDS) return { online: true, label: 'Online' };
  return { online: false, label: `Offline · last seen ${relativeTimeAgo(seconds)}` };
}
