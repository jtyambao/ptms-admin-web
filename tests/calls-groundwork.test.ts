import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { callsFeatureEnabled } from '../lib/calls-feature.ts';

// Voice/video call groundwork (item 4b, user-requested 2026-09-30) — a
// feature flag (OFF by default), a socket-connection shell using the
// staff JWT, and a call-state UI shell, behind that flag. None of it has
// been run against a real Guard device or even a real browser session —
// these tests cover only the flag's own on/off behavior and that the
// pieces are wired together the way the design note in app/calls/page.tsx
// says, never that calling actually works.

test('the feature flag defaults OFF and only NEXT_PUBLIC_CALLS_ENABLED="true" turns it on', () => {
  const original = process.env.NEXT_PUBLIC_CALLS_ENABLED;
  try {
    delete process.env.NEXT_PUBLIC_CALLS_ENABLED;
    assert.equal(callsFeatureEnabled(), false);
    process.env.NEXT_PUBLIC_CALLS_ENABLED = 'false';
    assert.equal(callsFeatureEnabled(), false);
    process.env.NEXT_PUBLIC_CALLS_ENABLED = 'yes';
    assert.equal(callsFeatureEnabled(), false);
    process.env.NEXT_PUBLIC_CALLS_ENABLED = 'true';
    assert.equal(callsFeatureEnabled(), true);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_CALLS_ENABLED;
    else process.env.NEXT_PUBLIC_CALLS_ENABLED = original;
  }
});

test('the Calls page shows a plain "not yet enabled" message when the flag is off, not the connection shell', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /if \(!enabled\)/);
  assert.match(source, /Not yet enabled/);
});

test('the Calls page is honest about being untested groundwork, not a working feature', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /untested groundwork/i);
  assert.match(source, /never been (tried|run) against a[\s\S]{0,20}real Guard device/i);
});

test('the socket registers as staff using the real access token, matching CallsGateway\'s RegisterStaffPayload contract', () => {
  const source = readFileSync('lib/calls-socket.ts', 'utf8');
  assert.match(source, /socket\.emit\('register', \{ role: 'staff', accessToken \}\)/);
  assert.match(source, /register:ok/);
  assert.match(source, /register:error/);
});

test('the socket connects to the REST API\'s own origin — CallsGateway is mounted on the same server, no separate WS host', () => {
  const source = readFileSync('lib/calls-socket.ts', 'utf8');
  assert.match(source, /new URL\(API_BASE_URL\)\.origin/);
});

test('the raw access token is exposed from the session ONLY for this socket registration use, not general consumption', () => {
  const source = readFileSync('lib/session-provider.tsx', 'utf8');
  assert.match(source, /getAccessToken\(\): string \| null;/);
  assert.match(source, /getAccessToken: \(\) => accessToken/);
});

test('the Calls nav link is always shown; the page itself gates on the feature flag, same convention as Accounts/Settings', () => {
  const shell = readFileSync('components/portal-shell.tsx', 'utf8');
  assert.match(shell, /href: '\/calls', label: 'Calls'/);
  const page = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(page, /callsFeatureEnabled\(\)/);
});
