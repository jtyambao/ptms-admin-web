import type { UserRole } from './ptms-api';

export const MPIN_PATTERN = /^[0-9]{4,8}$/;
export const isValidMpin = (value: string) => MPIN_PATTERN.test(value);

export function generatePersonnelMpin(
  randomValues: Pick<Crypto, 'getRandomValues'> = crypto,
): string {
  const value = new Uint32Array(1);
  randomValues.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
}

// P0 fix (branch feat/admin-oic-management, backend commit b361c65) —
// `admin` added. personnel.service.ts's resolvePersonnelWriteOrganization/
// deactivateForRequester recognize `admin`, assignment-scoped to its own
// Site exactly like supervisor/site_admin. `manager` remains explicitly
// forbidden. This gates Personnel create/deactivate only — OIC handover
// and Site MPIN regeneration have their own narrower gate, see
// canManageOic below (policy alignment, 2026-09-30).
export const canManagePersonnel = (role: UserRole) =>
  role === 'supervisor' || role === 'site_admin' || role === 'admin';

// Policy alignment (user-requested 2026-09-30, PTMS_FINAL_ROLE_
// PERMISSION_POLICY.md §14): Supervisor is view-only for OIC — "no MPIN
// generation/regeneration; no OIC change through this workflow." Matches
// site-assignments.service.ts's handoverOic/regenerateSiteCredential
// requireRole(['site_admin', 'admin', 'super_admin']) exactly — narrower
// than canManagePersonnel above, which Supervisor still passes for
// Personnel create/deactivate (unaffected by this change).
export const canManageOic = (role: UserRole) =>
  role === 'site_admin' || role === 'admin' || role === 'super_admin';

// View mirrors findAllForRequester's real role branches exactly
// (personnel.service.ts) — broader than canManagePersonnel's narrower
// per-site create/deactivate tier.
//
// Dry-run fix (branch release/dry-run-ops): `admin` is added to
// findAllForRequester/findOneForRequester's assignment-scoped branch on
// the backend (read-only — canManagePersonnel above is intentionally
// unchanged, `admin` still has no personnel create/deactivate authority).
export const canViewPersonnel = (role: UserRole) =>
  role === 'super_admin' ||
  role === 'engineer' ||
  role === 'manager' ||
  role === 'supervisor' ||
  role === 'site_admin' ||
  role === 'admin';
