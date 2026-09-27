import type { AuthenticatedApiClient } from './authenticated-api';
import type {
  CreatePersonnelRequest,
  CreateManagedUserRequest,
  CreateSiteRequest,
  HandoverOicRequest,
  Personnel,
  Site,
  SiteOicAssignment,
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
  PersonnelMpinRegenerated,
  EmergencyContact,
  CreateEmergencyContactRequest,
  CreateUserRequest,
  OperationalSettings,
  UpdateOperationalSettingsRequest,
} from './ptms-api';
export const managementApi = {
  // Not currently deployed (see ptms-api.ts's DashboardSiteRow comment) —
  // kept as a ready wrapper for when/if it is, but not called by the
  // rewritten Dashboard page.
  getDashboardSummary: (api: AuthenticatedApiClient) =>
    api.request<DashboardSummary>('/management/dashboard/summary'),
  // P1 Dashboard (2026-09-26) — GET /incidents, verified real and committed
  // (origin/main:src/incidents/incidents.controller.ts findAll). Role-gated
  // server-side to exactly super_admin/org_admin/site_manager/supervisor
  // (see lib/dashboard.ts's canViewIncidents, kept in lock-step with this).
  // Org-wide (RLS-scoped by organization_id, not filtered to any one Site),
  // so this is a single call regardless of how many Sites the org has.
  listIncidents: (api: AuthenticatedApiClient) =>
    api.request<Incident[]>('/incidents'),
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
  getAssignmentHistory: (api: AuthenticatedApiClient, siteId: number) =>
    api.request<AssignmentHistory>(`/sites/${siteId}/assignment-history`),
  getStaffing: (api: AuthenticatedApiClient, id: number) =>
    api.request<StaffingStatus>(`/sites/${id}/staffing-status`),
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
  handoverOic: (
    api: AuthenticatedApiClient,
    siteId: number,
    body: HandoverOicRequest,
  ) => api.request<SiteOicAssignment>(`/sites/${siteId}/oic-handovers`, {
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
  // Batch 1 (2026-09-07): listRounds/createRound/updateRound were removed
  // here. They called `/sites/:siteId/rounds*`, a contract confirmed to
  // have never existed on origin/main or production — the real backend
  // Round module (`/checkpoint-rounds`) is a differently-shaped,
  // non-Site-scoped, create-only endpoint. See site-rounds-panel.tsx and
  // BACKEND_GAPS.md. A real Patrol Schedule contract will be designed in a
  // dedicated later batch rather than reusing these signatures.

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
};
