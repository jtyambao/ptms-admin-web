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

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that narrowed
// this to Admin-only on the mistaken premise that the future five-role
// design (where Admin owns day-to-day Site administration) was already
// CURRENT PRODUCTION TECHNICAL RBAC. Verified against a fresh origin/main
// read (personnel.service.ts create/deactivate): still exactly
// `supervisor || site_admin` — `manager` is explicitly forbidden
// ("Managers cannot create/deactivate personnel"), and the bare `admin`
// role (migration 034) is NOT yet recognized by personnel.service.ts at
// all — a real, current backend gap (only site-operational-access.service.ts
// and site-assignments.service.ts's createSiteAdminAccount were updated for
// `admin` so far), not something to paper over here by adding it anyway.
export const canManagePersonnel = (role: UserRole) =>
  role === 'supervisor' || role === 'site_admin';

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
