import type { NfcWriterPayload, UserRole } from './ptms-api';

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that narrowed
// this to supervisor/admin only, retiring super_admin outright, on the
// mistaken premise that the future five-role design was already CURRENT
// PRODUCTION TECHNICAL RBAC. Verified against a fresh origin/main read
// (site-operational-access.service.ts's
// requireManageAccess): `manager`/`engineer` are explicitly forbidden;
// `super_admin` (any org, any site) and `org_admin` (own org, any site)
// both still have real, live, org-wide authority here — neither was
// retired. `admin` (migration 034) IS recognized by this exact check
// already (`role !== 'supervisor' && role !== 'site_admin' && role !== 'admin'`
// — one of only two backend services updated for the new role so far).
// `org_admin` is left out of this frontend gate only because it still has
// no Admin Web portal access at all (portal-access.ts) — not because the
// backend doesn't authorize it; flagged, not guessed around.
export const canManageSiteOperations = (role: UserRole) =>
  role === 'supervisor' || role === 'site_admin' || role === 'admin' || role === 'super_admin';

// Patrol activation toggle (P5(c), branch release/dry-run-ops) —
// verified against SiteAssignmentsService.setPatrolActivation's own
// requireRole call: exactly supervisor/site_admin/super_admin. Narrower
// than canManageSiteOperations above (`admin`/org_admin have no
// authority here today) — a real, current backend limitation to render
// around, not paper over. Per this task's own instruction, this gate is
// NOT widened to include `admin` here; only reported.
export const canTogglePatrolActivation = (role: UserRole) =>
  role === 'supervisor' || role === 'site_admin' || role === 'super_admin';

export const createGuardNdefText = (payload: NfcWriterPayload) =>
  JSON.stringify({ tagUid: payload.tagUid, tagSignature: payload.tagSignature });

export async function writeGuardNfcTag(payload: NfcWriterPayload): Promise<void> {
  const NdefReader = (globalThis as typeof globalThis & {
    NDEFReader?: new () => { write(message: { records: Array<{ recordType: 'text'; data: string }> }): Promise<void> };
  }).NDEFReader;
  if (!NdefReader) throw new Error('Web NFC is not available. Use Chrome on a compatible Android phone.');
  await new NdefReader().write({
    records: [{ recordType: 'text', data: createGuardNdefText(payload) }],
  });
}
