export const API_BASE_URL =
  process.env.NEXT_PUBLIC_PTMS_API_BASE_URL ?? 'https://ptms-api.onrender.com/api/v1';

// Batch 3 correction (2026-09-26): the previous Admin Web pass had coded
// this file AS IF the five-role model (owner/engineer/manager/supervisor/
// admin) were already the live, deployed backend contract. That was wrong,
// but not because the five-role model itself is fictional — it is the
// approved FINAL BUSINESS-ROLE DESIGN TARGET (see `sql/049_final_owner_role.sql`,
// a real migration that exists in the `ptms-api-release2-worktree` reference
// checkout — LOCAL / UNCOMMITTED / UNDEPLOYED WIP, not yet merged to
// `origin/main` or deployed to production, per that migration's own header:
// legacy roles are additively kept until each account is individually,
// manually re-mapped by an owner decision — this is intentional and
// unfinished, not abandoned). The error was treating that undeployed
// transition work as if it were already CURRENT PRODUCTION TECHNICAL RBAC.
// This is the second time this kind of premature-assumption mistake has
// happened in this project (see the Batch 1 site_admin→admin incident) —
// the fix is the same each time: obey only what `origin/main` (or, if truly
// needed, a fresh read of live production) currently and actually enforces
// for what UserRole a real JWT can contain, and treat local/uncommitted WIP
// as a preview of the design target, never as current authorization.
//
// CURRENT PRODUCTION TECHNICAL RBAC — verified real, current, deployed
// UserRole (`src/auth/jwt-payload.interface.ts` on `origin/main`, 10
// values, below). `owner` does not exist in the committed enum yet. The
// real, additive, narrow migration that HAS landed on `origin/main` is
// `034_final_admin_role.sql` (adds only the bare 'admin' value, changing
// nothing else) — `049_final_owner_role.sql`'s bare 'owner' value has not.
// Do not remove any of the 10 values below until each is independently
// re-verified gone from a fresh `origin/main` read AND confirmed deployed.
//
// UNRESOLVED / TRANSITION GAP: which of these 10 legacy technical roles
// maps to which of the 5 final business roles is not decided by name
// similarity and is not implemented here — per migration 049's own
// instruction, each existing account gets an individual, human, owner-made
// mapping decision, not an automatic one. Do not infer super_admin=Owner,
// org_admin=Owner, site_admin=Admin, or site_manager=Manager from this file.
export type UserRole =
  | 'super_admin'
  | 'engineer'
  | 'manager'
  | 'org_admin'
  | 'site_admin'
  | 'site_manager'
  | 'supervisor'
  | 'admin'
  | 'auditor'
  | 'client_viewer';

export type User = {
  id: number;
  organization_id: number | null;
  email: string;
  full_name: string;
  role: UserRole;
  status: 'active' | 'inactive';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

// My Account page (P4(b), branch release/dry-run-ops) — matches
// UpdateOwnProfileDto/ChangeOwnPasswordDto exactly
// (src/users/dto/). `fullName` is the only editable profile field that
// exists on `users` today (no phone/other column); PATCH /users/me has
// no field for role/organizationId/email/status at all, not just
// server-side rejection of them.
export type UpdateOwnProfileRequest = { fullName?: string };
export type ChangeOwnPasswordRequest = { currentPassword: string; newPassword: string };

export type TokenPair = { accessToken: string; refreshToken: string };
export type LoginRequest = { email: string; password: string };
export type LoginResult = TokenPair & { user: User };
export type RefreshRequest = { refreshToken: string };

export type Site = {
  id: number;
  organization_id: number;
  name: string;
  address: string | null;
  status: 'active' | 'inactive';
  latitude: number | null;
  longitude: number | null;
  // Missed Checkpoint Random Catch-Up (owner-approved, 2026-09-11). "HH:MM"
  // or "HH:MM:SS", interpreted using the organization's own timezone — never
  // a browser/device timezone. NULL means catch-up scheduling is disabled
  // for this site; there is no default, admins must opt in per site.
  duty_end_time: string | null;
  // P5(c) fix (branch release/dry-run-ops) — a real `sites` column
  // (used by SiteAssignmentsService.setPatrolActivation/getStaffingStatus,
  // already present in every `SELECT *`/`RETURNING *` response), just
  // never added to this type until the toggle needed it.
  patrol_operations_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SiteInformationRequest = {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  // Omit the key to leave the site's duty-end cutoff untouched; send a
  // "HH:MM"/"HH:MM:SS" string to set it, or `null` to explicitly clear it
  // back to "catch-up scheduling disabled."
  dutyEndTime?: string | null;
};
export type CreateSiteRequest = SiteInformationRequest & { name: string };
export type CreateManagedUserRequest = {
  email: string;
  password: string;
  fullName: string;
};
export type ReplaceSiteAssignmentRequest = { userId: number; reason?: string };
// `admin` is real (migration 034 additively extended the site_user_assignment_role
// enum), and createSiteAdminAccount/replaceSiteAdmin now assign it going
// forward — but existing rows created before that migration still read back
// as `site_admin` (migrations never rewrite existing data here), and most
// OTHER services (personnel.service.ts, sites.service.ts,
// site-assignments.service.ts's own getStaffingStatus lookup) still check
// only for literal 'site_admin', not 'admin' — a real, currently-live
// backend gap, not a frontend concern to paper over. Both values must stay
// representable here.
export type AssignmentRole = 'supervisor' | 'site_admin' | 'admin';

export type SiteUserAssignment = {
  id: number;
  organization_id: number;
  site_id: number;
  user_id: number;
  assignment_role: AssignmentRole;
  assigned_by_user_id: number;
  started_at: string;
  ended_at: string | null;
  assignment_reason: string | null;
  end_reason: string | null;
  full_name?: string;
  email?: string;
  assigned_by_name?: string;
};

export type Personnel = {
  id: number;
  organization_id: number;
  site_id: number | null;
  full_name: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

export type CreatePersonnelRequest = { siteId: number; fullName: string; mpin: string };

// The server-generated plaintext MPIN, present only on this one response —
// never persisted client-side beyond the one-time display dialog, never
// requested back from the server again.
export type PersonnelMpinRegenerated = Personnel & { mpin: string };

export type SiteOicAssignment = {
  id: number;
  organization_id: number;
  site_id: number;
  personnel_id: number;
  assigned_by_user_id: number;
  started_at: string;
  ended_at: string | null;
  handover_reason: string | null;
  end_reason: string | null;
  full_name?: string;
  assigned_by_name?: string;
};

export type HandoverOicRequest = { personnelId: number; reason?: string };

// Dry-run fix (branch release/dry-run-ops) — matches the real backend
// response shape exactly (SiteAssignmentsService.handoverOic's
// OicHandoverResult): every OIC handover ALSO rotates the Site's
// Guard-facing credential in the same transaction, returning the new
// plaintext MPIN exactly once. The frontend previously typed this
// response as bare SiteOicAssignment and silently discarded newSiteMpin/
// credentialGeneration — the new MPIN was never shown to the operator
// even though the backend already sent it.
export type OicHandoverResult = {
  assignment: SiteOicAssignment;
  newSiteMpin: string;
  credentialGeneration: number;
};
// P4 fix (branch release/dry-run-ops backend commit 06cb63e) —
// getStaffingStatus now surfaces the 'admin' assignment as its own
// `admin` field (previously queried but never shaped into the response),
// and staffingComplete now accepts either `siteAdmin` (legacy) or
// `admin` (final-role-model replacement) being filled.
export type StaffingStatus = {
  site: Pick<Site, 'id' | 'organization_id' | 'name' | 'status'> & {
    patrol_operations_active: boolean;
  };
  supervisor: SiteUserAssignment | null;
  siteAdmin: SiteUserAssignment | null;
  admin: SiteUserAssignment | null;
  // P4 (branch feat/admin-oic-management, sql/049) — a Site may now have
  // any number of simultaneously active admins; `admin` above stays as
  // "the first one" for backward compatibility, `admins` is the full
  // list for the Add Admin / list-and-deactivate-each UI.
  admins: SiteUserAssignment[];
  oic: SiteOicAssignment | null;
  staffingComplete: boolean;
};

// P4 fix (branch release/dry-run-ops) — regenerateSiteCredential now also
// allows `admin` (own assigned Site only), matching
// PTMS_FINAL_ROLE_PERMISSION_POLICY.md's OIC section.
export type SiteCredentialRegenerationResult = {
  siteId: number;
  newSiteMpin: string;
  credentialGeneration: number;
};

// Deactivate Admin account (P4(a)) — Supervisor only, own assigned Site
// only; target must be an active 'admin' with an active assignment at
// that exact Site.
export type DeactivateAdminAccountResult = {
  user: { id: number; status: 'active' | 'inactive' };
  assignment: SiteUserAssignment;
};
export type AssignmentHistory = {
  userAssignments: SiteUserAssignment[];
  oicAssignments: SiteOicAssignment[];
};
export type SetPatrolActivationRequest = { active: boolean };

// Shift Briefing (P5(b), branch release/dry-run-ops) — matches
// ShiftBriefing/CreateShiftBriefingDto exactly (src/sites/). All three
// text fields are optional/nullable (sql/021 — no NOT NULL beyond the
// server-derived organization_id/site_id).
export type ShiftBriefing = {
  id: number;
  organization_id: number;
  site_id: number;
  handover_note: string | null;
  equipment_check_note: string | null;
  weather_advisory: string | null;
  created_at: string;
};
export type CreateShiftBriefingRequest = {
  handoverNote?: string;
  equipmentCheckNote?: string;
  weatherAdvisory?: string;
};

export type SiteDevice = {
  id: number;
  device_id: string;
  label: string;
  is_primary: boolean;
  is_active: boolean;
  registered_at: string;
  last_seen_at: string | null;
};

export type RegisterDeviceRequest = {
  deviceId: string;
  label?: string;
  isPrimary?: boolean;
};

export type ManagedCheckpoint = {
  id: number;
  site_id: number;
  organization_id: number;
  name: string;
  tag_uid: string | null;
  require_photo: boolean;
  require_note: boolean;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

export type CreateCheckpointRequest = {
  name: string;
  requirePhoto?: boolean;
  requireNote?: boolean;
};

export type NfcWriterPayload = { tagUid: string; tagSignature: string };

// Batch 2, corrected Batch 3 (2026-09-26) — Emergency Contacts
// (src/emergency-contacts). Read (`GET /emergency-contacts?siteId=`) is
// genuinely unauthenticated at the backend — the same guard-facing call the
// Guard Mobile App uses. Create (`POST /emergency-contacts`) is
// `@Roles('org_admin', 'site_manager')` on `origin/main` right now — a
// prior local edit (2026-09-24) claimed this had been "migrated" to
// Supervisor/Admin/Manager; that was verified false against a fresh
// origin/main read (still exactly org_admin/site_manager, unchanged since
// Batch 2). There is still no update/deactivate/delete endpoint despite
// `is_active` existing on the row, so this type has no corresponding edit
// request type.
export type EmergencyContact = {
  id: number;
  organization_id: number;
  site_id: number | null;
  category: 'internal' | 'external';
  name: string;
  phone_number: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
};

export type CreateEmergencyContactRequest = {
  siteId?: number;
  category: 'internal' | 'external';
  name: string;
  phoneNumber?: string;
  notes?: string;
  sortOrder?: number;
};

// Batch 2, corrected Batch 3 (2026-09-26) — generic platform/organization
// accounts (src/users). Distinct from the Supervisor/Admin hierarchy
// accounts managed via site-hierarchy-panel.tsx — `POST /users` on
// `origin/main` right now is still `@Roles('super_admin', 'org_admin')`
// (a prior local edit falsely claimed this had migrated to Engineer-only,
// and that `organizationId` had been removed from the DTO entirely — both
// verified false against a fresh origin/main read: `organizationId` is
// still present, still super_admin-only-and-required, exactly as Batch 2
// found it). `role` excludes `super_admin` (platform-operator-only,
// provisioned out-of-band) — UsersService.create further refuses
// engineer/manager/supervisor/site_admin/admin for any non-super_admin
// caller ("Hierarchy accounts must be created through their authorized
// management endpoint"), computed per-requester in
// `assignableRolesFor` (lib/user-management.ts), not hardcoded here.
export type CreateUserRequest = {
  organizationId?: number;
  email: string;
  password: string;
  fullName: string;
  role: Exclude<UserRole, 'super_admin'>;
};

// Dry-run fix (branch release/dry-run-ops) — matches the real, newly-built
// authenticated backend contract exactly (GET/POST/PATCH
// sites/:siteId/rounds, CheckpointRoundsService.listRoundsForRequester /
// createRoundForRequester / updateRoundForRequester /
// deactivateRoundForRequester). `checkpoint_status` lets this UI warn when
// a round points at a deactivated checkpoint — the exact "Quick Round"
// situation this feature was built to let an operator fix.
export type RoundStop = {
  id: number;
  checkpoint_id: number;
  tap_order: number;
  checkpoint_name: string;
  tag_uid: string | null;
  checkpoint_status?: string;
};

export type ManagedRound = {
  id: number;
  organization_id: number;
  site_id: number;
  name: string;
  due_interval_minutes: number;
  ack_window_seconds: number | null;
  tap_window_seconds: number | null;
  window_start_time: string | null;
  window_end_time: string | null;
  // P1 weekly/monthly recurrence (branch feat/admin-oic-management,
  // backend sql/048) — days_of_week bitmask Mon=1 (bit 0) .. Sun=64 (bit
  // 6); day_of_month 1-31, clamped server-side to a shorter month's last
  // day. Mutually exclusive; both null means every day (unchanged
  // behavior for every Round created before this feature existed).
  days_of_week: number | null;
  day_of_month: number | null;
  is_active: boolean;
  stops: RoundStop[];
};

// null = organization default (seconds) or all day (window).
export type SaveRoundRequest = {
  name: string;
  dueIntervalMinutes: number;
  checkpointIds: number[];
  ackWindowSeconds?: number | null;
  tapWindowSeconds?: number | null;
  windowStartTime?: string | null;
  windowEndTime?: string | null;
  daysOfWeek?: number | null;
  dayOfMonth?: number | null;
};

// Schedules visibility (branch release/dry-run-ops) — mirrors
// CheckpointRoundsService.getStatus's real response shape exactly (the
// same public, Guard-app-facing, meant-to-be-polled endpoint), reused
// read-only on the Admin Web Rounds tab.
export type RoundStatus = {
  currentAlert: unknown | null;
  missedCount: number;
  catchUpEligible: boolean;
  nextDueAt: string | null;
  nextDueRoundId: number | null;
  nextDueIntervalMinutes: number | null;
};

// DEPLOYMENT READINESS + ADMIN DASHBOARD PHASE (2026-09-02) — mirrors
// AdminDashboardService's response shape exactly (ptms-api/src/admin-
// dashboard/admin-dashboard.service.ts). photo_view_url is always either an
// already-resolved, short-lived signed URL or null — never a raw R2 key.
//
// P1 correction (2026-09-26): `admin-dashboard/` does not exist anywhere in
// `origin/main` (confirmed via `git ls-tree -r origin/main | grep -i
// dashboard` — zero matches) or in current production Swagger
// (`GET /management/dashboard/summary` is absent from
// `https://ptms-api.onrender.com/api/docs-json`). These types and
// `managementApi.getDashboardSummary` are kept, unused by the Dashboard
// page for now, as a ready shape for if/when that backend module is ever
// built and deployed — see BACKEND_GAPS.md's "P1 Dashboard" section. The
// rewritten Dashboard sources its widgets from real, currently-deployed
// endpoints instead (`Incident` below, `managementApi.listSites`/
// `listPersonnel`).
export type DashboardSiteRow = {
  site_id: number;
  site_name: string;
  status: string;
  patrol_operations_active: boolean;
  oic_name: string | null;
  completed_today: number;
  missed_today: number;
  incidents_today: number;
  last_activity_at: string | null;
};

export type DashboardIncidentRow = {
  id: number;
  site_id: number;
  site_name: string;
  title: string;
  severity: string;
  status: string;
  occurred_at: string;
  photo_view_url: string | null;
};

export type DashboardReportRow = {
  id: number;
  site_id: number;
  site_name: string;
  remarks: string | null;
  occurred_at: string;
  photo_view_url: string | null;
};

export type DashboardVisitorRow = {
  id: number;
  site_id: number;
  site_name: string;
  visitor_name: string;
  purpose: string;
  valid_id_checked: boolean;
  occurred_at: string;
  photo_view_url: string | null;
};

export type DashboardSosRow = {
  id: number;
  site_id: number;
  site_name: string;
  status: string;
  triggered_at: string;
  personnel_name: string | null;
};

// Verified (2026-09-26) directly against `origin/main` of ptms-api —
// `GET/PATCH /management/operational-settings` is real and committed
// (src/operational-settings/management-operational-settings.controller.ts +
// operational-settings.service.ts), field-for-field matching this shape
// exactly, including catchupWindowSeconds (sql/046, also committed).
// catchupWindowSeconds is Admin-editable here but deliberately never sent
// to the Guard App — Catch-Up scheduling is entirely backend-authoritative
// (CheckpointCatchupService); Guard only ever sees the resulting
// activatesAt/expiresAt on an already-scheduled window, never this raw
// setting, so it can never calculate its own independent duration.
export type OperationalSettings = {
  guardIdleTimeoutSeconds: number;
  guardIdleWarningSeconds: number;
  nfcScanTimeoutSeconds: number;
  weatherCacheFreshnessSeconds: number;
  orphanPhotoCleanupIntervalSeconds: number;
  catchupWindowSeconds: number;
};

// Verified (2026-09-26): a prior local edit (2026-09-24) claimed this write
// endpoint "unconditionally fails closed for every role" — false against a
// fresh origin/main read. `OperationalSettingsService.resolveOrganizationId`
// authorizes exactly `super_admin` (must supply `organizationId` — no
// default, there is no "current org" for a platform-wide role) or
// `org_admin` (always locked to their own token-derived organizationId,
// never a client-supplied one). Every field independently optional — a
// field left out of the request means "leave the existing value alone"
// (mirrors the backend DTO's own comment); the service validates the fully
// merged result (e.g. warning-must-be-less-than-timeout) before writing.
export type UpdateOperationalSettingsRequest = Partial<OperationalSettings> & { organizationId?: number };

// Per-Site Operational Settings (P3, branch feat/admin-oic-management,
// backend sql/050) — matches SiteOperationalSettingsResult exactly.
// hasOverride tells the UI whether this Site currently has its own
// override row (show "Custom" + a Reset action) or is still tracking
// the organization's default (show "Organization default").
export type SiteOperationalSettings = OperationalSettings & { hasOverride: boolean };
export type UpdateSiteOperationalSettingsRequest = Partial<OperationalSettings>;

export type DashboardSummary = {
  totals: {
    activeSites: number;
    checkpointsCompletedToday: number;
    missedCheckpointsToday: number;
    incidentsToday: number;
    reportsToday: number;
    visitorsToday: number;
  };
  sites: DashboardSiteRow[];
  recentIncidents: DashboardIncidentRow[];
  recentReports: DashboardReportRow[];
  recentVisitors: DashboardVisitorRow[];
  recentSos: DashboardSosRow[];
};

// P1 Dashboard (2026-09-26) — matches the real, committed
// `IncidentsService.findAll()` response exactly (origin/main:
// src/incidents/incidents.service.ts). Deliberately narrower than the
// backend's full `Incident` row: `photo_url` is a bare R2 object key (or a
// legacy raw URL), never a viewable signed URL, and `findAll()` does not
// resolve one (unlike the Guard-facing `findForSite`, which adds
// `photo_view_url`) — so this type omits it entirely rather than risk a
// future caller rendering it as an `<img>` src.
export type Incident = {
  id: number;
  organization_id: number;
  site_id: number | null;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  occurred_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

// Reports page (branch release/dry-run-ops) — read-only, per-Site,
// existing backend endpoints only. No new backend routes were added for
// any of these; each type mirrors its real service's row shape exactly.

// checkpoint-rounds/site/:id/missed — CheckpointRoundsService.listMissed.
export type MissedCheckpointTap = {
  id: number;
  site_id: number;
  due_event_id: number;
  checkpoint_id: number;
  checkpoint_name: string;
  round_name: string;
  missed_at: string;
};

// checkpoint-rounds/site/:id/missed/governed —
// CheckpointRoundsService.listGovernedNonActiveMisses. Informational
// only — never implies a completion path (see that method's own comment).
export type GovernedMissedCheckpointTap = {
  missedTapId: number;
  checkpointId: number;
  checkpointName: string;
  missedAt: string;
  catchUpStatus: 'scheduled' | 'expired' | 'unschedulable_today';
};

// visitor-logs/site/:id — VisitorLogsService.findForSite. Guard-facing,
// genuinely unauthenticated at the backend (no JwtAuthGuard on this route).
export type VisitorLogEntry = {
  id: number;
  organization_id: number;
  site_id: number;
  visitor_name: string;
  purpose: string;
  host_name: string;
  valid_id_checked: boolean;
  photo_url: string | null;
  photo_view_url: string | null;
  occurred_at: string;
  created_at: string;
};

// voluntary-observation-reports/site/:id —
// VoluntaryObservationReportsService.findForSite. Also genuinely
// unauthenticated at the backend, same Guard-facing shape as above.
export type VoluntaryObservationReportEntry = {
  id: number;
  organization_id: number;
  site_id: number;
  photo_url: string;
  photo_view_url: string | null;
  remarks: string | null;
  occurred_at: string;
  created_at: string;
};

// sos-alerts (GET, JWT + RESPONDER_ROLES) — SosService.findAll. Org-wide
// for super_admin/org_admin/site_manager/supervisor (filtered to one Site
// client-side); already Site-scoped server-side for admin/site_admin
// (P3(a), branch release/dry-run-ops). latitude/longitude come from the
// Guard app's separate PATCH .../location follow-up call — null until (or
// if) that resolves.
export type SosAlertEntry = {
  id: number;
  organization_id: number;
  personnel_id: number | null;
  site_id: number | null;
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'acknowledged' | 'cancelled' | 'resolved';
  triggered_at: string;
  acknowledged_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  resolved_at: string | null;
  personnel_name: string | null;
  site_name: string | null;
};

// Special Check Requests create page (branch release/dry-run-ops) —
// mirrors SpecialCheckRequestsService's real row shape and
// CreateSpecialCheckRequestDto exactly (src/special-check-requests/).
// GET is Guard-facing/unauthenticated at the backend, filtered by siteId
// query param; POST is JWT + SENDER_ROLES (super_admin/org_admin/
// site_manager/supervisor) — `admin`/`site_admin` cannot send one today.
// daily-occurrence-book/site/:id — Guard-facing/unauthenticated at the
// backend (DailyOccurrenceBookService.findForSite), same as
// VisitorLogEntry/VoluntaryObservationReportEntry above. Verified against
// ptms-guard-app-v1.1-volume-worktree's src/api.ts DobEntry/fetchDobEntries
// — field names match exactly.
export type DobEntry = {
  id: number;
  organization_id: number;
  site_id: number;
  entry_text: string;
  occurred_at: string;
  created_at: string;
};

// lone-worker-checkins/last?siteId= (P5, branch feat/admin-oic-management)
// — Guard-facing/unauthenticated at the backend, same as DobEntry above.
// Only the SINGLE most recent check-in — there is no history-list
// endpoint on the backend today, so this widget can only ever show the
// latest one, not a log.
export type LoneWorkerCheckin = {
  id: number;
  organization_id: number;
  personnel_id: number | null;
  site_id: number | null;
  selfie_url: string | null;
  checked_in_at: string;
};

export type SpecialCheckRequest = {
  id: number;
  organization_id: number;
  personnel_id: number | null;
  site_id: number | null;
  created_by: number;
  title: string;
  instructions: string | null;
  priority: 'normal' | 'urgent';
  status: 'sent' | 'acknowledged' | 'completed' | 'expired';
  needed_by: string | null;
  type: 'standard' | 'spot_visit';
  sent_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  completion_remarks: string | null;
  selfie_url: string | null;
};

export type CreateSpecialCheckRequest = {
  siteId: number;
  title: string;
  instructions?: string;
  priority?: 'normal' | 'urgent';
  neededBy?: string;
  type?: 'standard' | 'spot_visit';
};

export type ApiEnvelope<T> = {
  success: boolean;
  statusCode?: number;
  message: string;
  data: T;
};

export async function getSites(signal?: AbortSignal): Promise<Site[]> {
  const response = await fetch(`${API_BASE_URL}/sites`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Site lookup failed (${response.status}).`);
  return (await response.json() as ApiEnvelope<Site[]>).data;
}
