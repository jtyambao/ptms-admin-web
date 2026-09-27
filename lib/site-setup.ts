import type { StaffingStatus, UserRole } from './ptms-api';

export const hasCoordinates = (
  latitude: number | null,
  longitude: number | null,
) => latitude !== null && longitude !== null;

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that narrowed
// this to Engineer-only, removing Manager's co-authority, on the mistaken
// premise that the future five-role design's Engineer/Manager split was
// already CURRENT PRODUCTION TECHNICAL RBAC. Verified against a fresh
// origin/main read (sites.service.ts create() AND its update()): both are
// `ForbiddenException('Only an organization Engineer or Manager may
// create/update sites.')` — identical role pair for both, and Site Edit
// (a separate, unrelated 2026-09-11 batch) is genuinely wired to this real
// `PATCH /management/sites/:id` route — see tests/site-edit.test.ts.
export const canEditSiteInformation = (role: UserRole) =>
  role === 'manager' || role === 'engineer';

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that narrowed
// this to Manager-only, on the mistaken premise that the future five-role
// design was already CURRENT PRODUCTION TECHNICAL RBAC. Verified
// against a fresh origin/main read (site-assignments.service.ts
// createSupervisorAccount): `requireRole(requester, ['engineer', 'manager'])`
// — unchanged since Batch 1/2.
export const canSetUpSupervisor = (role: UserRole) =>
  role === 'manager' || role === 'engineer';
export const canSetUpSiteAdmin = (role: UserRole) => role === 'supervisor';

export type SetupSignals = {
  staffing: StaffingStatus | null;
  activePersonnel: number | null;
  activeDevices: number | null;
  hasPrimaryDevice: boolean | null;
  activeCheckpoints: number | null;
  nfcReadyCheckpoints: number | null;
};

export function setupSteps(signals: SetupSignals) {
  return [
    { label: 'Site Information', complete: true },
    { label: 'Supervisor', complete: !!signals.staffing?.supervisor },
    { label: 'Admin', complete: !!signals.staffing?.siteAdmin },
    {
      label: 'Personnel',
      complete:
        signals.activePersonnel === null ? null : signals.activePersonnel > 0,
    },
    { label: 'OIC', complete: !!signals.staffing?.oic },
    {
      label: 'Device',
      complete:
        signals.activeDevices === null
          ? null
          : signals.activeDevices > 0 && signals.hasPrimaryDevice === true,
    },
    {
      label: 'Checkpoints / NFC',
      complete:
        signals.activeCheckpoints === null
          ? null
          : signals.activeCheckpoints > 0 &&
            signals.nfcReadyCheckpoints === signals.activeCheckpoints,
    },
  ];
}
