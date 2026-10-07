# PTMS Admin Web

Browser-based admin portal for PTMS — Sites, Personnel, OIC assignment,
Rounds/schedules, Operational Settings, Incidents/SOS/Reports, and Accounts.
Talks to the PTMS backend API only; it does not modify the backend or the
Guard mobile app.

## Requirements

- Node.js >= 22.13.0 (see `package.json` `engines`)
- The backend API reachable at the URL in `.env` (see below)

## Local development

```bash
cp .env.example .env.local   # only if you need a different API base URL
npm install
npm run dev                  # vinext dev, http://localhost:3000
```

`.env.example` documents the two variables the app reads:

- `NEXT_PUBLIC_PTMS_API_BASE_URL` — the backend API's base URL.
- `NEXT_PUBLIC_PTMS_WRITES_ENABLED` — safety gate for write operations.

## Tests

```bash
npm test    # node --test --experimental-strip-types tests/*.test.ts
```

## Build and deploy

```bash
npm run build   # vinext build
npm run deploy  # vinext build && wrangler deploy --config dist/server/wrangler.json --name ptms-admin
```

Deploys to Cloudflare Workers (`wrangler` must already be logged in). The
deployed instance runs at https://ptms-admin.jtyambao.workers.dev.

## Calls (voice/video) feature flag

Calls ship OFF. `NEXT_PUBLIC_CALLS_ENABLED=true` is read at **build** time, so
it is chosen per deploy:

```powershell
$env:NEXT_PUBLIC_CALLS_ENABLED='true'; npm run deploy   # Calls ON
npm run deploy                                          # Calls OFF
```

Real-device checklist: [`CALLS_TEST_SCRIPT.md`](CALLS_TEST_SCRIPT.md). TURN
(calls across mobile networks) is configured on the **backend** only
(`CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN`); the app fetches
`GET /calls/ice-servers` before each call and falls back to STUN.

## Known framework quirk: vinext client-side routing

vinext 1.0.0-beta.5's production client router throws on `<Link>` clicks
(`navigateClientSide is not a function`). Worked around in
[`app/layout.tsx`](app/layout.tsx) with a capture-phase click handler that
forces a normal full-page `location.assign()` navigation for any same-origin
link, instead of client-side navigation. If vinext fixes this upstream, that
handler can be removed.

Relatedly, `next/font/google` bakes the build machine's own absolute
filesystem path into production output on this framework — fonts use the
system font stack instead (see `app/layout.tsx`'s own comment) rather than
`next/font`, to avoid that whole bug class.

## Repository layout notes

- `.openai/hosting.json` — scaffold metadata from this project's initial
  setup (Cloudflare D1/R2 bindings, both unused/null here). Keep it tracked.
- `tsconfig.tsbuildinfo` — TypeScript's incremental build cache, gitignored
  (machine-local, regenerated automatically).
