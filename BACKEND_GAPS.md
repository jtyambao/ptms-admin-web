# Backend and contract gaps for PTMS Admin Web

This file reflects production Swagger and the authoritative local backend source as reviewed on 2026-09-01, with a documentation-only audit against `origin/main` of `ptms-api` on 2026-09-06 (see "Verified against current source" below). Backend authorization remains authoritative.

## Verified against current source (2026-09-06)

This audit checked `origin/main` of `ptms-api` directly. The local `ptms-api` working copy was **not** used as evidence — it is currently a divergent checkout (ahead/behind `origin/main`, with uncommitted changes) and was left untouched by this audit.

- **Resolved / already backend-implemented on `origin/main`:** site-scoped personnel MPIN uniqueness (`6cc8e27`), personnel soft deactivation (`8c422d3`), MPIN login returning HTTP 200 (`b107e26`). These are no longer open gaps; see "Personnel and MPIN gaps" below.
- **Genuinely open backend gaps:** no logout/token-revocation endpoint; no server-side refresh-token rotation/revocation record. Swagger's undocumented response/DTO schemas remain unverified either way.
- **Intentionally deferred (approved role design, not a gap):** Owner/`super_admin` mapping and Engineer's final business permissions. This audit does not change or propose role mappings.

## Role reconciliation (Batch 1, 2026-09-07)

**What happened:** sometime on 2026-09-06, `ptms-admin-web`'s `UserRole` type and every role-based permission gate were edited, client-side only, to a 7-value set (`super_admin, org_admin, owner, engineer, manager, supervisor, admin`) — renaming `site_admin` to `admin`, dropping `site_manager`/`auditor`/`client_viewer` entirely, and adding a fictional `owner`. The comment attributed this to "migration 027," but `origin/main`'s real migration 027 (`027_personnel_site_mpin_uniqueness.sql`) is unrelated to roles entirely. The actual source appears to be a differently-named migration (`027_management_role_cleanup.sql`) that exists only in the divergent local `ptms-api` working copy this project's own conventions already say must never be treated as authoritative. **Practical effect (found and fixed this batch):** a real production user with role `site_admin` — per the approved design, likely the most common day-to-day Admin Web user — was redirected straight to `/unauthorized` on login, because nothing in the frontend recognized that string anymore.

**Authoritative sources checked for this reconciliation:**
1. `origin/main`'s `src/auth/jwt-payload.interface.ts` and the live Postgres `user_role` enum — the real, deployed technical roles: `super_admin, engineer, manager, org_admin, site_admin, site_manager, supervisor, auditor, client_viewer` (9 values).
2. `ROADMAP.md` Section 4b's Management Account Tier matrix (v3.34) — the approved *business* roles: Engineer, Owner, Executive, Supervisor, Admin — for a separate Management App layer confirmed by the document's own latest (v3.97) self-audit as **still 0% built, not started**.

**Exact mappings proven by an existing source:** none, positively. Two mappings are explicitly *forbidden* by this file's own pre-existing guidance (not new conclusions, restated here for completeness):
- `super_admin` must **not** be presented as Owner (no approved mapping exists).
- `site_manager` must **never** be mapped to Manager (legacy role).

**Unresolved mappings (preserved as unresolved, not guessed):**
- `site_admin` ↔ business role "Admin" — tempting by name similarity (this is exactly the unproven assumption that produced the bug above), but no document states this equivalence; the backend `site_admin` role was added later, separately, for the Site hierarchy feature (`sql/026`), not as an implementation of the v3.34 Admin row.
- `engineer` ↔ business role "Engineer", `supervisor` ↔ business role "Supervisor" — same names appear in both places, but the v3.34 tier is confirmed unbuilt, so these backend roles cannot be *implementations* of that tier's rows; treat the name overlap as coincidental/directional at best, not proven.
- `manager` (backend) — has no corresponding row in the v3.34 matrix at all (already flagged in this file's Engineer note above).
- `org_admin`, `auditor`, `client_viewer` (backend) — no business-role counterpart proposed anywhere.
- `Owner`, `Executive` (business roles) — no backend technical-role implementation exists at all.

**Resolution applied:** every permission-check identifier in Admin Web now uses the exact backend technical role string (reverted `lib/ptms-api.ts`'s `UserRole`/`AssignmentRole`, `lib/role-labels.ts`, `lib/portal-access.ts`, `lib/personnel-management.ts`, `lib/site-operations.ts`, and the inline role list in `app/sites/[siteId]/page.tsx`). Display labels (`role-labels.ts`) are cosmetic only and never used for authorization — a label reading "Admin" for `site_admin` is not a claim of business-role equivalence. Where a mapping is unresolved, the narrower/prior-known-safe behavior was kept (e.g., `org_admin`/`site_manager`/`auditor`/`client_viewer` remain excluded from `PORTAL_ROLES` — no source grants them Admin Web access, so none was added).

**2026-09-06, later the same day — Personnel MPIN Regenerate implemented, not yet merged.** `POST /personnel/:id/regenerate-mpin` and its database function `regenerate_personnel_mpin` (`sql/029_personnel_mpin_regeneration.sql`) were implemented and tested on an isolated worktree/branch (`feat/personnel-mpin-regenerate`, based on `origin/main` at `6c2e1e3`) — **not yet committed, pushed, reviewed, or merged.** Backend unit and source-inspection tests pass (`npx jest` — see PR/commit once raised); real-Postgres concurrency tests were written (`personnel.mpin-regeneration-postgres.integration.spec.ts`, mirroring the existing MPIN creation integration spec) but require `MPIN_TEST_DATABASE_URL` and were not run in this environment. Frontend (`ptms-admin-web`) API wrapper, types, and UI (regenerate button, confirm dialog, one-time MPIN display, copy action) are implemented and covered by new tests in this repo (`npm test`, all passing) — but they call a backend route that does not exist on `origin/main` yet, so this feature is **not live** until the `ptms-api` branch above is merged and deployed. Do not treat the "Open" item below as resolved until that merge/deploy has actually happened.

## Confirmed available contracts

- JWT login, refresh, and current-user lookup
- Authenticated management Site list, detail, and creation
- Manager-created Supervisor accounts and Supervisor assignment
- Supervisor-created Site Admin accounts and Site Admin assignment (`sites/:siteId/site-admin-accounts`, `sites/:siteId/assignments/site-admin`) — the backend technical role is `site_admin`; see "Role reconciliation" below for why an earlier version of this line incorrectly claimed it had been renamed to `admin`
- Multi-site Supervisor scope with exact-Site authorization
- Staffing status and effective-dated assignment history
- Authenticated personnel list, detail, and creation
- Authenticated personnel soft deactivation (`PATCH /personnel/:id/deactivate`)
- OIC handover history
- Patrol activation controls

The production Swagger exposes these routes, but most response envelopes and DTO property details are not documented in its generated schemas. Frontend types therefore also rely on the authoritative controller/service source.

## Remaining authentication gaps

1. Login and refresh return both access and refresh tokens in JSON. No HttpOnly refresh-token cookie is issued.
2. Refresh tokens are stateless. They are not stored or hashed server-side and cannot be individually revoked.
3. There is no logout or token-revocation endpoint.
4. Refresh rotates the returned token pair, but an older unexpired refresh token remains usable because there is no server-side rotation record.
5. Browser-safe session persistence needs an approved design before live login is enabled. Refresh tokens must not be placed in ordinary localStorage as an undocumented workaround.
6. Production token lifetimes are not exposed by Swagger. Local source defaults are 15 minutes for access and 7 days for refresh unless deployment environment settings override them.

## Remaining contract and role gaps

1. Production Swagger does not describe concrete success-response schemas for the reviewed endpoints.
2. Most DTOs lack complete Swagger property metadata even though runtime validation exists in source.
3. Deployment parity beyond the route/security inventory should be verified after each backend release.
4. Owner remains deferred. `super_admin` must not be presented as Owner without an approved mapping.
5. Engineer's business permissions are already approved and defined (ROADMAP.md v3.34 management-account-tier matrix: full org-wide site scope, the only management role that can manage users, Admin Portal access, among other entitlements) and are already implemented and enforced on `origin/main` for Sites, Site Assignments, and Personnel (`sites.service.ts`, `site-assignments.service.ts`, `personnel.service.ts`), and reflected in Admin Web's own portal-role and site-creation checks (`lib/portal-access.ts`). What remains missing is narrower and not Engineer-specific: the matrix's Call and Spot/Special-Request entitlements cannot yet be enforced end-to-end for *any* management role because those backend modules (Calls/SOS-delivery) are not yet merged into `origin/main` (they currently exist only on the unmerged `feat/webrtc-calls` branch), and Admin Web does not yet expose UI for them. This is a feature-availability gap, not an undecided permission design. Separately, `site-assignments.service.ts` currently also permits `manager` to create Supervisor accounts alongside `engineer`, which does not appear in the v3.34 matrix as written (that matrix has no `manager` row) — flagged here as an observation for the role model, not resolved by this audit.
6. `site_manager` is a legacy role and must never be mapped to Manager.
7. The bare `admin` role (migration 034) is recognized by
   `site-operational-access.service.ts` and `site-assignments.service.ts`'s
   creation/assignment routes, but **not yet** by `personnel.service.ts`
   (view/create/deactivate still check only `supervisor`/`site_admin`) or
   by `getStaffingStatus()` (its `siteAdmin` field looks up
   `assignment_role === 'site_admin'` only, so a real `admin` assignment
   row never shows as staffed there). Found during the Batch 3 role-drift
   correction below; not fixed here (read-only backend inspection). Admin
   Web's Site Hierarchy panel currently assigns `site_admin`, not `admin`,
   specifically because of this gap — do not switch it to `admin` until
   `getStaffingStatus()` is updated.

## Personnel and MPIN gaps

**Resolved** (verified on `origin/main`, 2026-09-06 — see "Verified against current source"):

- Site-scoped personnel MPIN uniqueness is enforced atomically by the backend (commit `6cc8e27`), via the database function `create_personnel_with_unique_site_mpin`. A bcrypt hash cannot support a plain column-level unique constraint because bcrypt uses a random salt, so uniqueness is enforced inside this transactional function instead. Concurrency protection is therefore already implemented; this is not an open gap.
- Personnel soft deactivation is implemented and authorized (commit `8c422d3`, `PATCH /personnel/:id/deactivate`). Admin Web's Site Personnel panel already calls this contract.
- MPIN login returns HTTP 200 on success (commit `b107e26`).

**Implemented, pending merge/deploy (2026-09-06 — see the dated note above):**

- The MPIN reset/regenerate gap is closed in code: `POST /personnel/:id/regenerate-mpin` (branch `feat/personnel-mpin-regenerate`, migration `029_personnel_mpin_regeneration.sql`) generates the replacement MPIN server-side (never client-supplied), enforces the same Site-scoped atomic uniqueness as creation (identical advisory-lock key), authorizes against live `site_user_assignments` data inside the same transaction as the mutation (closing the TOCTOU window a check-then-write approach would leave open), and never returns the old MPIN or any `mpin_hash`. Admin Web's UI exposes only a Regenerate action — there is still no "view existing MPIN" capability anywhere.
- **This is not yet an available contract** — nothing here is merged into `origin/main`, committed, pushed, or deployed. Do not treat Admin Web's new UI as functional against a real backend until that happens.

**Open:**

1. Merge, commit, push, and deploy the branch above (or an equivalent), then re-verify against `origin/main` before calling this contract available.

## Frontend foundation implemented

- Browser refresh tokens are held in same-site HttpOnly cookies by the Admin Web session gateway; access tokens remain memory-only.
- The authenticated API client performs one shared refresh for concurrent 401 responses and retries each request at most once.
- Login, session restoration, local logout, session expiry, protected routing, and role-aware navigation are implemented.
- Safe user-facing handling exists for validation, expired-session, forbidden, missing-resource, conflict, network, and service failures.
- Automated session, contract, access, personnel, operations, round, and setup tests are present.

## Remaining frontend limitations

1. Server-side refresh-token revocation and replay prevention still require backend support; local logout can clear the browser cookie but cannot invalidate an already-issued token.
2. Dashboard and management views require an authenticated account with deployed contracts matching the reviewed API source. Anonymous preview mode intentionally does not fabricate operational records.
3. NFC writing still requires Web NFC support on a compatible Android Chrome device; desktop browsers can configure checkpoints but cannot write physical tags.
4. Scheduling beyond the current round interval model remains outside the approved backend contract and is not shown as a working control.
5. Batch 1 (2026-09-07): Site Edit and the Rounds panel are explicitly disabled — both previously called routes confirmed to not exist on `origin/main` or production (`PATCH /management/sites/:id`; `/sites/:siteId/rounds*`). Site Edit's form remains in code, gated off, ready for a real update endpoint. Rounds is replaced with an explicit "not available yet" state pending a dedicated Patrol Schedule design batch.

Do not add unsupported mutations or persist authentication tokens in browser storage as a workaround.

## Five-Role Closure (owner-authorized, 2026-09-24) — supersedes several items above

The backend has since been migrated for real to a final, narrow five-role
`UserRole`: `owner, engineer, manager, supervisor, admin`. Every earlier
entry above describing `super_admin`, `org_admin`, `site_admin`,
`site_manager`, `auditor`, or `client_viewer` as still-live technical roles,
or describing `owner`/`admin` mappings as unresolved/deferred, reflects the
state as of its own dated entry and is now historical, not current:

- The "Role reconciliation" section's "Unresolved mappings" and "Owner
  remains deferred" (item 4 above) are resolved: `owner` and `admin` are
  now genuine, narrow, backend-issuable roles (migration 049, `admin` is
  `site_admin`'s sole final successor). See each `lib/*.ts` file's own
  "FIVE-ROLE CLOSURE AUDIT" / "FINAL FIVE-ROLE MODEL" comments for the
  exact, current, per-capability mapping — those comments are the
  authoritative current source, not this section.
- "Site Admin accounts" (Confirmed available contracts, item 2) now use
  `sites/:siteId/admin-accounts` / `sites/:siteId/assignments/admin` — the
  `site_admin` routes named there were deleted on the backend.
- The Personnel MPIN Regenerate feature (Personnel and MPIN gaps, "Implemented,
  pending merge/deploy") has since merged and deployed — Admin Web's
  Regenerate MPIN UI is live and tested against a real backend contract.
- Site Edit (Remaining frontend limitations, item 5) has since been
  re-enabled — `PATCH /management/sites/:id` exists and is called; see
  `tests/round-management.test.ts`'s Site Edit tests. The Rounds panel
  remains genuinely unavailable, unchanged.
- Emergency Contact create/view moved from the unreachable legacy
  `org_admin`/`site_manager` pair to the final, portal-reachable
  `manager`/`supervisor`/`admin` tier — a genuine, owner-approved capability
  expansion, not a bug.

This file is kept as a historical record of past audits rather than rewritten
in place; treat any conflict between an earlier dated entry and this section
in favor of this section, and treat any conflict between this section and
the actual current source/tests in favor of the source/tests.

## Batch 3 correction (2026-09-26) — the "Five-Role Closure" section above was premature, not fictional

The section immediately above ("Five-Role Closure (owner-authorized,
2026-09-24)") describes CURRENT PRODUCTION TECHNICAL RBAC incorrectly — it
was discovered on disk at the start of this batch, alongside matching
same-day edits across most of `lib/*.ts`, `app/accounts/page.tsx`, and
`app/settings/page.tsx`, all citing "migration 049" and a five-value
`owner, engineer, manager, supervisor, admin` `UserRole` as if it were
already the live, deployed backend contract. **The five-role design itself
is not fictional — it is the real, approved FINAL PTMS BUSINESS-ROLE DESIGN
TARGET.** The error was narrower and more specific: frontend code had been
written as though undeployed transition work already governed production
authorization. A fresh read of `origin/main` (current production technical
RBAC) together with the `ptms-api-release2-worktree` reference checkout
(the transition work itself) established the following three-layer picture:

**A. Current production technical RBAC** (authoritative for what Admin Web
may call today) — unchanged from the "Verified against current source
(2026-09-06)" list at the top of this file, plus the additive `admin`:
`super_admin, engineer, manager, org_admin, site_admin, site_manager,
supervisor, admin, auditor, client_viewer` (10 values). The real, committed,
additive migration behind `admin` is `sql/034_final_admin_role.sql`.
`owner` does not exist in this deployed enum or type yet.

**B. Final approved business-role design target** (real, owner-approved,
**not yet fully deployed**): Owner (global/org visibility, monitoring, not
merely a generic super-admin), Engineer (technical/system/site
configuration, top-level account administration, device provisioning),
Manager (org-wide operational management where supported), Supervisor
(multiple site assignments), Admin (one active site, multiple Admins per
site, day-to-day site administration).

**C. Transition / implementation gaps** between A and B — real,
substantial, uncommitted local work exists for this in the
`ptms-api-release2-worktree` reference checkout (`git status` shows
`sql/047`–`051` untracked, plus modified `src/auth/jwt-payload.interface.ts`
and dozens of other files implementing a narrowed five-role `UserRole` at
the TypeScript layer). None of it is committed to `origin/main`, merged, or
deployed. Specifically:

- **`sql/049_final_owner_role.sql` is real** — it exists in the reference
  worktree as an untracked file. Classification: **LOCAL / UNCOMMITTED /
  UNDEPLOYED WIP.** It is not fictional, and it is not production
  authority. Its own header comment is explicit that it is deliberately not
  the final stage: legacy roles remain physically present in the enum and
  on existing rows until each account is individually, manually re-mapped
  by an owner decision (never inferred from the legacy role's name), a
  read-only production preflight confirms the exact accounts affected, and
  a follow-up narrowing migration (intentionally not yet written) is run.
  Until that sequence completes and is deployed, current production
  remains on the 10-value technical model in section A.
- **The site_admin creation/assignment routes were not deleted** on
  `origin/main`. Both `sites/:siteId/site-admin-accounts` /
  `sites/:siteId/assignments/site-admin` (provisioning the legacy
  `site_admin` role) and `sites/:siteId/admin-accounts` /
  `sites/:siteId/assignments/admin` (provisioning the new bare `admin`
  role, migration 034) are live and distinct today. A real, separate
  backend gap was found in the process: `getStaffingStatus()` only
  recognizes `assignment_role === 'site_admin'` for its `siteAdmin` field,
  so a bare-`admin` assignment does not show up as staffed — the
  frontend's Site Hierarchy panel was reverted to use `site_admin`
  accordingly (see #7 in "Remaining contract and role gaps" below).
- **`POST/GET /users` has not moved to Engineer-only today.** Still
  exactly `super_admin`/`org_admin` under section A, and `CreateUserDto`
  still accepts an optional `organizationId`, unchanged since Batch 2. The
  five-role design's intent for Engineer to own general account
  administration is a section B target, not yet a section A fact.
- **Emergency Contact create has not moved to manager/supervisor/admin
  today.** Still exactly `org_admin`/`site_manager` under section A,
  unchanged since Batch 2. Read remains unauthenticated.
- **Operational Settings has not become site-scoped today.** It remains
  the organization-scoped contract described in "Confirmed available
  contracts" and the "Role reconciliation" era of this file — `GET/PATCH
  /management/operational-settings`, optional `organizationId` (required
  only for `super_admin`; `org_admin` is always locked to their own org).
  `app/settings/page.tsx` was corrected back to this model (an
  Organization ID field for `super_admin`, no Site selector anywhere).

**Unresolved / transition gap — do not guess:** which of the 10 section-A
technical roles maps to which of the 5 section-B business roles is not
established by any approved source and is not implemented in Admin Web.
Name similarity is not evidence. In particular, do NOT assume
`super_admin = Owner`, `org_admin = Owner`, `site_admin = Admin`, or
`site_manager = Manager` — each remains UNRESOLVED / TRANSITION GAP, same
standing position as the "Role reconciliation" section above.

**What was genuinely true and was kept:** the bare `admin` role itself
(migration 034, real, deployed); `admin` recognized by
`site-operational-access.service.ts` alongside `supervisor`/`site_admin`;
Site Edit's real `PATCH /management/sites/:id` route and its `dutyEndTime`
field (unrelated to this incident — see the 2026-09-11 Site Edit note
above); the Personnel MPIN Regenerate feature (also unrelated, genuinely
merged and deployed).

Every `lib/*.ts` file, `app/accounts/page.tsx`, `app/settings/page.tsx`,
`components/site-hierarchy-panel.tsx`, `app/sites/[siteId]/page.tsx`, and
every test file this incident touched were corrected to obey section A
(current production technical RBAC) for authorization, while documenting
section B (the approved design target) and section C (the real transition
gaps) accurately rather than erasing them. Treat the "Five-Role Closure"
section above as historical evidence of the incident — code written as if
undeployed transition work were already live — not as a record that the
five-role design itself was ever fictional. This section supersedes it in
full for classification purposes, and any conflict between this section and
the actual current source/tests is resolved in favor of the source/tests,
per this file's own standing rule.

## P1 Dashboard (2026-09-26)

The Dashboard page (`app/dashboard/page.tsx`) previously depended entirely
on `GET /management/dashboard/summary`. Confirmed absent both on
`origin/main` (`git ls-tree -r origin/main | grep -i dashboard` — zero
matches, the whole `admin-dashboard/` module referenced in
`lib/ptms-api.ts`'s `DashboardSiteRow` comment does not exist there) and in
current production (`https://ptms-api.onrender.com/api/docs-json` has no
such path). Rewritten to source three independent widgets from real,
currently-deployed endpoints instead. `managementApi.getDashboardSummary`
and the `Dashboard*` types are kept, unused, as a ready shape for if/when
that module is ever built and deployed.

**Widget classification:**

| Widget | Classification | Source |
|---|---|---|
| Accessible Sites (count + list) | LIVE NOW | `GET /management/sites` (`managementApi.listSites`) |
| Personnel (active/total count) | LIVE NOW / DERIVABLE NOW | `GET /personnel` (`managementApi.listPersonnel`), active count derived client-side |
| Incidents (today/total count + recent list) | LIVE NOW / DERIVABLE NOW | `GET /incidents` (`managementApi.listIncidents`, new), "today" derived client-side from `occurred_at` against the viewer's local calendar day |
| Per-Site patrol status, staffing, OIC | DERIVABLE NOW, but per-Site only | `GET /sites/:id/staffing-status` — already live on the Site Detail page; not duplicated on the Dashboard because aggregating it for every accessible Site would add one request per Site (fan-out), worse for org-wide roles with many Sites |
| Checkpoints/Devices summary | DERIVABLE NOW, but per-Site only | `GET /sites/:id/checkpoints` / `/devices` — same per-Site fan-out concern as above; already live on the Site Detail page |
| Checkpoints Completed/Missed Today (org-wide) | SUMMARY-ENDPOINT DEPENDENT | No org-wide "today" aggregate exists; `GET /checkpoint-rounds/site/:siteId/status` (real, unauthenticated, guard-facing) is per-Site only and does not itself state a same-day completed/missed count without additional interpretation |
| Reports (Voluntary Observation Reports) | SUMMARY-ENDPOINT DEPENDENT / not yet built anywhere in Admin Web | `GET /voluntary-observation-reports/site/:siteId` exists and is real, but is per-Site only (no org-wide aggregate) and has no existing Admin Web UI at all (not even on the Site Detail page) — out of scope for this bounded pass |
| Visitor Log activity | SUMMARY-ENDPOINT DEPENDENT / not yet built anywhere in Admin Web | Same as Reports — `GET /visitor-logs/site/:siteId` is real, per-Site only, no existing UI |
| Daily Occurrence Book activity | SUMMARY-ENDPOINT DEPENDENT / not yet built anywhere in Admin Web | Same pattern — `GET /daily-occurrence-book/site/:siteId` is real, per-Site only, no existing UI |
| Recent SOS / active alerts (org-wide) | UNSUPPORTED | No org-wide or simple per-Site "list active SOS" management contract exists in current production Swagger — `GET /sos-alerts/active` requires both `siteId` AND `deviceId` (a single-device, Guard-facing lookup shape, not a management listing) |

**New role-gate finding (2026-09-26):** `SitesService.findAllForRequester`
(`origin/main`, backs `GET /management/sites`) throws `ForbiddenException`
for both `admin` and `org_admin` — only `super_admin`, `engineer`,
`manager`, `supervisor`, `site_admin` may list Sites at all. This is a
**pre-existing** gap, not introduced by this pass: the Sites list page
(`app/sites/page.tsx`) already called `listSites` unconditionally for every
role before this batch. Combined with the already-documented gap that
`admin` is excluded from `personnel.service.ts` (item 7 above), **the known
live `admin` account (id 18) currently has no endpoint anywhere to discover
its own assigned Site** — it can only reach a Site's detail page by already
knowing/bookmarking its numeric id. On the rewritten Dashboard, this means
all three widgets (Sites, Personnel, Incidents — `admin` is also outside
`IncidentsController`'s `RESPONDER_ROLES`) show "Unavailable for this role"
for that account today. This is shown honestly rather than hidden, but is
flagged here as the clearest concrete next backend priority for making
Admin Web actually useful to its most common day-to-day user.

**Incidents role gate** — verified against a fresh origin/main read of
`IncidentsController`'s `RESPONDER_ROLES` constant: exactly `super_admin,
org_admin, site_manager, supervisor`. `org_admin`/`site_manager` are not in
`PORTAL_ROLES` (no Admin Web access at all), so in practice only
`super_admin`/`supervisor` see this widget populated today.

Do NOT infer that any of the above SUMMARY-ENDPOINT DEPENDENT / UNSUPPORTED
items are actually unavailable from the frontend role model alone — each
is a real, currently-deployed backend contract limitation independently
verified against `origin/main` and/or live production Swagger, not a
frontend guess.
