// Voice/video call groundwork (item 4b, user-requested 2026-09-30) — a
// feature flag, OFF by default and only ever flippable via an env var, not
// a role or UI toggle. This gate exists because the groundwork behind it
// (lib/calls-socket.ts, app/calls/page.tsx) has never been exercised
// against a real Guard device — see those files' own comments. Flipping
// this on is a deliberate, explicit opt-in for testing, not a signal that
// calling is ready for real use.
export function callsFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CALLS_ENABLED === 'true';
}
