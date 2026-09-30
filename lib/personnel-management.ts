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
// deactivateForRequester and site-assignments.service.ts's handoverOic
// all now recognize `admin`, assignment-scoped to its own Site exactly
// like supervisor/site_admin. `manager` remains explicitly forbidden.
export const canManagePersonnel = (role: UserRole) =>
  role === 'supervisor' || role === 'site_admin' || role === 'admin';

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
