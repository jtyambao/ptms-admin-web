import type { AuthenticatedApiClient } from './authenticated-api';
import type {
  CreatePersonnelRequest,
  CreateManagedUserRequest,
  CreateSiteRequest,
  HandoverOicRequest,
  Personnel,
  Site,
  SiteOicAssignment,
  OicHandoverResult,
  StaffingStatus,
  SiteInformationRequest,
  SiteUserAssignment,
  ReplaceSiteAssignmentRequest,
  AssignmentHistory,
  User,
  SiteDevice,
  RegisterDeviceRequest,
  ManagedCheckpoint,
  CreateCheckpointRequest,
  NfcWriterPayload,
  DashboardSummary,
  Incident,
  ManagedRound,
  SaveRoundRequest,
  RoundStatus,
  MissedCheckpointTap,
  GovernedMissedCheckpointTap,
  VisitorLogEntry,
  VoluntaryObservationReportEntry,
  DobEntry,
  LoneWorkerCheckin,
  SosAlertEntry,
  SpecialCheckRequest,
  CreateSpecialCheckRequest,
  PersonnelMpinRegenerated,
  EmergencyContact,
  CreateEmergencyContactRequest,
  CreateUserRequest,
  OperationalSettings,
  UpdateOperationalSettingsRequest,
  SiteOperationalSettings,
  UpdateSiteOperationalSettingsRequest,
  SiteCredentialRegenerationResult,
  DeactivateAdminAccountResult,
  UpdateOwnProfileRequest,
  ChangeOwnPasswordRequest,
  SetPatrolActivationRequest,
  ShiftBriefing,
  CreateShiftBriefingRequest,
} from './ptms-api';
export const managementApi = {
  // Not currently deployed (see ptms-api.ts's DashboardSiteRow comment) —
  // kept as a ready wrapper for when/if it is, but not called by the
  // rewritten Dashboard page.
  getDashboardSummary: (api: AuthenticatedApiClient) =>
    api.request<DashboardSummary>('/management/dashboard/summary'),
  // P1 Dashboard (2026-09-26) — GET /incidents, verified real and committed
  // (origin/main:src/incidents/incidents.controller.ts findAll). Role-gated
  // server-side (see lib/dashboard.ts's canViewIncidents, kept in
  // lock-step with this): super_admin/org_admin/site_manager/supervisor
  // see every Incident in the org; admin/site_admin (dry-run fix) see only
  // Incidents at their own actively assigned Site — the backend itself
  // narrows the result set, this call is identical for every role.
  listIncidents: (api: AuthenticatedApiClient) =>
    api.request<Incident[]>('/incidents'),
  // P3(b) (branch release/dry-run-ops) — admin/site_admin now also have
  // acknowledge/resolve authority, restricted server-side to their own
  // assigned Site (IncidentsService.transition()); legacy roles unchanged.
  acknowledgeIncident: (api: AuthenticatedApiClient, id: number) =>
    api.request<Incident>(`/incidents/${id}/acknowledge`, { method: 'POST' }),
  resolveIncident: (api: AuthenticatedApiClient, id: number) =>
    api.request<Incident>(`/incidents/${id}/resolve`, { method: 'POST' }),
  // Reports page (branch release/dry-run-ops) — read-only, existing
  // endpoints only, no new backend routes.
  listMissedCheckpoints: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<MissedCheckpointTap[]>(`/checkpoint-rounds/site/${siteId}/missed`),
  listGovernedMissedCheckpoints: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<GovernedMissedCheckpointTap[]>(`/checkpoint-rounds/site/${siteId}/missed/governed`),
  listVisitorLogs: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<VisitorLogEntry[]>(`/visitor-logs/site/${siteId}`),
  listVoluntaryObservationReports: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<VoluntaryObservationReportEntry[]>(`/voluntary-observation-reports/site/${siteId}`),
  // Daily Occurrence Book viewer (P5(a), branch release/dry-run-ops) —
  // read-only, existing endpoint only (Guard-facing/unauthenticated at
  // the backend, same as the two calls just above).
  listDailyOccurrenceBook: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<DobEntry[]>(`/daily-occurrence-book/site/${siteId}`),
  // Lone Worker Check-In (P5) — read-only, existing endpoint only
  // (Guard-facing/unauthenticated at the backend). Only the single most
  // recent check-in — there is no history-list endpoint today.
  getLastLoneWorkerCheckin: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<LoneWorkerCheckin | null>(`/lone-worker-checkins/last?siteId=${siteId}`),
  // JWT + RESPONDER_ROLES. super_admin/org_admin/site_manager/supervisor
  // get every SOS alert in the org (still filtered to one Site
  // client-side here); admin/site_admin (dry-run fix, P3(a)) are already
  // narrowed server-side to their own assigned Site.
  listSosAlerts: (api: AuthenticatedApiClient) =>
    api.request<SosAlertEntry[]>('/sos-alerts'),
  // Incoming SOS banner + Reports widget (P3, branch release/dry-run-ops)
  // — admin/site_admin can now acknowledge/cancel too, restricted
  // server-side to their own assigned Site (SosService); legacy roles
  // unchanged. `reason` matches CancelSosAlertDto.reason (optional).
  acknowledgeSos: (api: AuthenticatedApiClient, id: number) =>
    api.request<SosAlertEntry>(`/sos-alerts/${id}/acknowledge`, { method: 'POST' }),
  cancelSos: (api: AuthenticatedApiClient, id: number, reason?: string) =>
    api.request<SosAlertEntry>(`/sos-alerts/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  // Special Check Requests create page (branch release/dry-run-ops).
  // GET is Guard-facing/unauthenticated at the backend (siteId query
  // param); POST is JWT + SENDER_ROLES.
  listSpecialCheckRequests: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<SpecialCheckRequest[]>(`/special-check-requests?siteId=${siteId}`),
  createSpecialCheckRequest: (api: AuthenticatedApiClient, body: CreateSpecialCheckRequest) =>
    api.request<SpecialCheckRequest>('/special-check-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  listSites: (api: AuthenticatedApiClient) =>
    api.request<Site[]>('/management/sites'),
  getSite: (api: AuthenticatedApiClient, id: number) =>
    api.request<Site>(`/management/sites/${id}`),
  createSite: (api: AuthenticatedApiClient, body: CreateSiteRequest) =>
    api.request<Site>('/management/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateSite: (api: AuthenticatedApiClient, id: number, body: SiteInformationRequest) =>
    api.request<Site>(`/management/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  createSupervisorAccount: (api: AuthenticatedApiClient, body: CreateManagedUserRequest) =>
    api.request<User>('/management/supervisor-accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  // Batch 3 correction (2026-09-26): a 2026-09-24 edit incorrectly claimed
  // the legacy site_admin creation/assignment routes had been deleted and
  // replaced by these admin ones — current production has not undergone
  // that cutover. Verified against a fresh origin/main read
  // (site-assignments.controller.ts): BOTH pairs are live and distinct —
  // `site-admin-accounts`/`assignments/site-admin` still provision the
  // legacy `site_admin` role, while `admin-accounts`/`assignments/admin`
  // (migration 034) provision the new bare `admin` role. Restored the
  // site_admin functions alongside the admin ones rather than replacing them.
  createSiteAdminAccount: (api: AuthenticatedApiClient, siteId: number, body: CreateManagedUserRequest) =>
    api.request<User>(`/sites/${siteId}/site-admin-accounts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  createAdminAccount: (api: AuthenticatedApiClient, siteId: number, body: CreateManagedUserRequest) =>
    api.request<User>(`/sites/${siteId}/admin-accounts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  assignSupervisor: (api: AuthenticatedApiClient, siteId: number, body: ReplaceSiteAssignmentRequest) =>
    api.request<SiteUserAssignment>(`/sites/${siteId}/assignments/supervisor`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  assignSiteAdmin: (api: AuthenticatedApiClient, siteId: number, body: ReplaceSiteAssignmentRequest) =>
    api.request<SiteUserAssignment>(`/sites/${siteId}/assignments/site-admin`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  assignAdmin: (api: AuthenticatedApiClient, siteId: number, body: ReplaceSiteAssignmentRequest) =>
    api.request<SiteUserAssignment>(`/sites/${siteId}/assignments/admin`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  // Add Admin (P4, branch feat/admin-oic-management, sql/049) — additive,
  // same route path as assignAdmin above but POST, not PUT: never closes
  // an existing active admin. A Site may now have any number of
  // simultaneously active admins.
  addAdmin: (api: AuthenticatedApiClient, siteId: number, body: ReplaceSiteAssignmentRequest) =>
    api.request<SiteUserAssignment>(`/sites/${siteId}/assignments/admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  // P4(a) (branch release/dry-run-ops backend commit 06cb63e) —
  // Supervisor only, own assigned Site only; target must be an active
  // 'admin' with an active assignment at that exact Site.
  deactivateAdminAccount: (api: AuthenticatedApiClient, siteId: number, userId: number, reason?: string) =>
    api.request<DeactivateAdminAccountResult>(`/sites/${siteId}/admin-accounts/${userId}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  // P4 finding fix (branch release/dry-run-ops) — now allows `admin` at
  // its own assigned Site (previously supervisor/site_admin/super_admin
  // only). Returns the new plaintext Site MPIN exactly once, same
  // one-time-display contract as handoverOic's newSiteMpin.
  regenerateSiteCredential: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<SiteCredentialRegenerationResult>(`/sites/${siteId}/credential-regeneration`, {
      method: 'POST',
    }),
  getAssignmentHistory: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<AssignmentHistory>(`/sites/${siteId}/assignment-history`),
  // Attendance (item 4c follow-up, user-authorized 2026-09-30) — a
  // dedicated, date-range-scoped read over site_oic_assignments; from/to
  // are 'YYYY-MM-DD', inclusive both ends.
  getAttendance: (api: AuthenticatedApiClient, siteId: number, from: string, to: string) =>
    api.request<SiteOicAssignment[]>(`/sites/${siteId}/attendance?from=${from}&to=${to}`),
  getStaffing: (api: AuthenticatedApiClient, id: number) =>
    api.request<StaffingStatus>(`/sites/${id}/staffing-status`),
  // Patrol activation toggle (P5(c)) — roles per
  // SiteAssignmentsService.setPatrolActivation exactly: supervisor/
  // site_admin/super_admin (see canTogglePatrolActivation).
  setPatrolActivation: (api: AuthenticatedApiClient, siteId: number, body: SetPatrolActivationRequest) =>
    api.request<Site>(`/sites/${siteId}/patrol-activation`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  // Shift Briefing (P5(b)) — GET is Guard-facing/unauthenticated at the
  // backend; POST is JWT + requireManageAccess (supervisor/site_admin/
  // admin own Site, org_admin org-wide, super_admin cross-tenant).
  getLatestShiftBriefing: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<ShiftBriefing | null>(`/sites/${siteId}/shift-briefing`),
  // Pre-Shift Briefing HISTORY (user-authorized 2026-10-07) - staff-
  // authenticated, newest first; the first row is the current briefing.
  listShiftBriefingHistory: (api: AuthenticatedApiClient, siteId: number, limit = 30) =>
    api.request<ShiftBriefing[]>(`/sites/${siteId}/shift-briefings?limit=${limit}`),
  createShiftBriefing: (api: AuthenticatedApiClient, siteId: number, body: CreateShiftBriefingRequest) =>
    api.request<ShiftBriefing>(`/sites/${siteId}/shift-briefing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  // My Account page (P4(b)) — any authenticated role, self only.
  updateOwnProfile: (api: AuthenticatedApiClient, body: UpdateOwnProfileRequest) =>
    api.request<User>('/users/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  changeOwnPassword: (api: AuthenticatedApiClient, body: ChangeOwnPasswordRequest) =>
    api.request<void>('/users/me/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  listPersonnel: (api: AuthenticatedApiClient) =>
    api.request<Personnel[]>('/personnel'),
  createPersonnel: (api: AuthenticatedApiClient, body: CreatePersonnelRequest) =>
    api.request<Personnel>('/personnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deactivatePersonnel: (api: AuthenticatedApiClient, id: number) =>
    api.request<Personnel>(`/personnel/${id}/deactivate`, { method: 'PATCH' }),
  // No request body: the server generates the replacement MPIN. It is
  // present exactly once, on this response — never requested or displayed
  // again afterward.
  regeneratePersonnelMpin: (api: AuthenticatedApiClient, id: number) =>
    api.request<PersonnelMpinRegenerated>(`/personnel/${id}/regenerate-mpin`, { method: 'POST' }),
  // Dry-run fix (branch release/dry-run-ops): the response is the full
  // OicHandoverResult (assignment + newSiteMpin + credentialGeneration),
  // not bare SiteOicAssignment — the backend has always sent the rotated
  // Site MPIN here, it just wasn't typed/surfaced by this client before.
  handoverOic: (
    api: AuthenticatedApiClient,
    siteId: number,
    body: HandoverOicRequest,
  ) => api.request<OicHandoverResult>(`/sites/${siteId}/oic-handovers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  listDevices: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<SiteDevice[]>(`/sites/${siteId}/devices`),
  registerDevice: (api: AuthenticatedApiClient, siteId: number, body: RegisterDeviceRequest) =>
    api.request<SiteDevice>(`/sites/${siteId}/devices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  deactivateDevice: (api: AuthenticatedApiClient, siteId: number, registrationId: number) =>
    api.request<SiteDevice>(`/sites/${siteId}/devices/${registrationId}/deactivate`, { method: 'PATCH' }),
  setPrimaryDevice: (api: AuthenticatedApiClient, siteId: number, registrationId: number) =>
    api.request<SiteDevice>(`/sites/${siteId}/devices/${registrationId}/primary`, { method: 'PATCH' }),
  listCheckpoints: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<ManagedCheckpoint[]>(`/sites/${siteId}/checkpoints`),
  getCheckpoint: (api: AuthenticatedApiClient, siteId: number, checkpointId: number) =>
    api.request<ManagedCheckpoint>(`/sites/${siteId}/checkpoints/${checkpointId}`),
  createCheckpoint: (api: AuthenticatedApiClient, siteId: number, body: CreateCheckpointRequest) =>
    api.request<ManagedCheckpoint>(`/sites/${siteId}/checkpoints`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  deactivateCheckpoint: (api: AuthenticatedApiClient, siteId: number, checkpointId: number) =>
    api.request<ManagedCheckpoint>(`/sites/${siteId}/checkpoints/${checkpointId}/deactivate`, { method: 'PATCH' }),
  provisionNfc: (api: AuthenticatedApiClient, siteId: number, checkpointId: number, tagUid: string) =>
    api.request<NfcWriterPayload>(`/sites/${siteId}/checkpoints/${checkpointId}/provision-tag`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagUid }),
    }),
  replaceNfc: (api: AuthenticatedApiClient, siteId: number, checkpointId: number, tagUid: string, reason: 'lost' | 'damaged' | 'replacement' | 'correction') =>
    api.request<NfcWriterPayload>(`/sites/${siteId}/checkpoints/${checkpointId}/replace-tag`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagUid, reason }),
    }),
  revokeNfc: (api: AuthenticatedApiClient, siteId: number, checkpointId: number, reason: string) =>
    api.request<{ revoked: true }>(`/sites/${siteId}/checkpoints/${checkpointId}/revoke-tag`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    }),
  // Dry-run fix (branch release/dry-run-ops): the Batch 1 comment this
  // replaced is now out of date — `/sites/:siteId/rounds*` is a real,
  // newly-built, authenticated backend contract (CheckpointRoundsService.
  // listRoundsForRequester/createRoundForRequester/updateRoundForRequester/
  // deactivateRoundForRequester), reusing SiteOperationalAccessService for
  // authorization exactly like the checkpoints/NFC endpoints above.
  listRounds: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<ManagedRound[]>(`/sites/${siteId}/rounds`),
  createRound: (api: AuthenticatedApiClient, siteId: number, body: SaveRoundRequest) =>
    api.request<ManagedRound>(`/sites/${siteId}/rounds`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  updateRound: (api: AuthenticatedApiClient, siteId: number, roundId: number, body: Partial<SaveRoundRequest>) =>
    api.request<ManagedRound>(`/sites/${siteId}/rounds/${roundId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  deactivateRound: (api: AuthenticatedApiClient, siteId: number, roundId: number) =>
    api.request<ManagedRound>(`/sites/${siteId}/rounds/${roundId}/deactivate`, {
      method: 'PATCH',
    }),
  // Schedules visibility — the same public, Guard-app-facing status
  // endpoint the Guard App polls, reused read-only here (next due, current
  // alert, missed count). No auth header is required by the backend, but
  // this client sends one anyway for consistency; the endpoint ignores it.
  getRoundStatus: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<RoundStatus>(`/checkpoint-rounds/site/${siteId}/status`),

  // Batch 2 — Emergency Contacts. GET is genuinely unauthenticated at the
  // backend (guard-facing); no update/deactivate/delete endpoint exists.
  listEmergencyContacts: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<EmergencyContact[]>(`/emergency-contacts?siteId=${siteId}`),
  createEmergencyContact: (api: AuthenticatedApiClient, body: CreateEmergencyContactRequest) =>
    api.request<EmergencyContact>('/emergency-contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),

  // Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that
  // assumed `POST/GET /users` had already moved to the future five-role
  // design's Engineer-only account administration and stopped reading an
  // `organizationId` query param — that design is approved but not yet
  // deployed. Verified against a fresh origin/main read: current production
  // is still exactly `@Roles('super_admin', 'org_admin')`, and `GET /users`
  // still accepts an optional `organizationId` (honored for super_admin
  // only; every other role is hard-locked server-side to their own org
  // regardless of what's sent, unchanged since Batch 2).
  listUsers: (api: AuthenticatedApiClient, organizationId?: number) =>
    api.request<User[]>(organizationId ? `/users?organizationId=${organizationId}` : '/users'),
  createUser: (api: AuthenticatedApiClient, body: CreateUserRequest) =>
    api.request<User>('/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),

  // Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that
  // assumed this had become always site-scoped with Supervisor/Admin
  // read+write, ahead of any confirmed backend deployment of that shape.
  // Verified against a fresh origin/main read
  // (management-operational-settings.controller.ts +
  // operational-settings.service.ts): current production is an
  // ORGANIZATION-scoped
  // resource (`organization_settings` table), not site-scoped — there is no
  // `siteId` param on this route at all. Role scope is exactly
  // `super_admin` (must supply `organizationId`, no default) or
  // `org_admin` (always their own org; a client-supplied organizationId is
  // ignored/never trusted for them). Deliberately a separate surface from
  // the Guard-facing, pre-auth, genuinely site-scoped
  // `/operational-settings/site/:siteId` read endpoint (unchanged).
  getOperationalSettings: (api: AuthenticatedApiClient, organizationId?: number) =>
    api.request<OperationalSettings>(
      organizationId ? `/management/operational-settings?organizationId=${organizationId}` : '/management/operational-settings',
    ),
  updateOperationalSettings: (api: AuthenticatedApiClient, body: UpdateOperationalSettingsRequest) =>
    api.request<OperationalSettings>('/management/operational-settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  // Per-Site Operational Settings (P3) — Owner/Engineer/Manager view any
  // authorized Site, Supervisor/Admin view+edit their own assigned Site
  // (requireReadAccess/requireManageAccess, same as every other
  // assigned-Site capability).
  getSiteOperationalSettings: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<SiteOperationalSettings>(`/sites/${siteId}/operational-settings`),
  updateSiteOperationalSettings: (api: AuthenticatedApiClient, siteId: number, body: UpdateSiteOperationalSettingsRequest) =>
    api.request<SiteOperationalSettings>(`/sites/${siteId}/operational-settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  resetSiteOperationalSettings: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<SiteOperationalSettings>(`/sites/${siteId}/operational-settings`, { method: 'DELETE' }),
};
