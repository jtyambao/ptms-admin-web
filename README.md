# PTMS Admin Web

Isolated browser-based admin portal for PTMS. The existing API and Guard App are references only and are not modified by this project.

## Current safety posture

- Live API use is limited to `GET /api/v1/sites`.
- Owner/Engineer login is implemented as a UI foundation but deliberately blocked because the current login endpoint updates `last_login_at`.
- All create, assignment, handover, update, and deactivate controls remain disabled.
- See `BACKEND_GAPS.md` before enabling writes.

## Local use

Copy `.env.example` to `.env.local` only if a different API base URL is needed, then run `npm run dev`.

The approved Theme Option B reference is stored at `public/reference/theme-option-b.png`.
