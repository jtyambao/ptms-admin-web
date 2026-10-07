import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fetchIceConfiguration, getIceConfiguration } from '../lib/webrtc/ice-config.ts';
import type { AuthenticatedApiClient } from '../lib/authenticated-api.ts';

const apiReturning = (impl: (path: string) => unknown): AuthenticatedApiClient =>
  ({ request: (async (path: string) => impl(path)) as AuthenticatedApiClient['request'] });

test('uses the servers returned by GET /calls/ice-servers (STUN + TURN)', async () => {
  const servers = [{ urls: 'stun:a' }, { urls: ['turn:b'], username: 'u', credential: 'c' }];
  let asked = '';
  const config = await fetchIceConfiguration(apiReturning((p) => { asked = p; return { iceServers: servers, turn: true }; }));
  assert.equal(asked, '/calls/ice-servers');
  assert.deepEqual(config.iceServers, servers);
});

test('falls back to STUN-only when the request fails, or returns nothing usable', async () => {
  const stun = getIceConfiguration();
  assert.deepEqual(await fetchIceConfiguration({ request: (async () => { throw new Error('offline'); }) as AuthenticatedApiClient['request'] }), stun);
  assert.deepEqual(await fetchIceConfiguration(apiReturning(() => ({ iceServers: [] }))), stun);
  assert.deepEqual(await fetchIceConfiguration(apiReturning(() => null)), stun);
});

test('the Calls page fetches ICE servers before dialing and while an incoming call rings, and passes them to the call session', () => {
  const page = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(page, /setIceConfiguration\(await fetchIceConfiguration\(session\.api\)\);\s*client\.invite/);
  assert.match(page, /icePrefetch\.current = fetchIceConfiguration\(session\.api\)/);
  assert.match(page, /useCallSession\(client, call, iceConfiguration\)/);
});

test('an incoming call cancelled before it was answered stops the ringtone and is kept as a Missed entry', () => {
  const page = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(page, /event\.type === 'end' && incomingInvite/);
  assert.match(page, /setMissedCalls/);
  assert.match(page, /Missed calls/);
});
