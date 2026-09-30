import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadCallableSites } from '../lib/calls-contacts.ts';
import type { AuthenticatedApiClient } from '../lib/authenticated-api.ts';
import type { Site } from '../lib/ptms-api.ts';

// Full voice/video calling (item A, 2026-09-30) — built on item 4b's
// groundwork, protocol verified against the real Guard app client. See
// app/calls/page.tsx's own design note for the full protocol writeup.

function site(overrides: Partial<Site> & { id: number; name: string }): Site {
  return {
    organization_id: 1,
    address: null,
    status: 'active',
    latitude: null,
    longitude: null,
    ...overrides,
  } as Site;
}

function makeApi(responses: {
  devices?: Record<number, unknown[]>;
  staffing?: Record<number, unknown>;
}): AuthenticatedApiClient {
  return {
    request: (async (path: string) => {
      const deviceMatch = path.match(/^\/sites\/(\d+)\/devices$/);
      if (deviceMatch) return responses.devices?.[Number(deviceMatch[1])] ?? [];
      const staffingMatch = path.match(/^\/sites\/(\d+)\/staffing-status$/);
      if (staffingMatch) return responses.staffing?.[Number(staffingMatch[1])] ?? null;
      throw new Error(`unexpected path in test: ${path}`);
    }) as AuthenticatedApiClient['request'],
  };
}

test('loadCallableSites sorts online-first, then alphabetically', async () => {
  const api = makeApi({
    devices: {
      1: [{ is_active: true, last_seen_at: new Date().toISOString() }], // online
      2: [{ is_active: true, last_seen_at: '2020-01-01T00:00:00.000Z' }], // offline
      3: [], // no devices at all
    },
  });
  const sites = [
    site({ id: 2, name: 'Beta Site' }),
    site({ id: 1, name: 'Alpha Site' }),
    site({ id: 3, name: 'Charlie Site' }),
  ];
  const result = await loadCallableSites(api, sites);
  assert.deepEqual(result.map((s) => s.siteName), ['Alpha Site', 'Beta Site', 'Charlie Site']);
  assert.equal(result[0].onlineDeviceCount, 1);
  assert.equal(result[1].onlineDeviceCount, 0);
});

test('loadCallableSites surfaces the current OIC name when staffing has one', async () => {
  const api = makeApi({
    devices: { 1: [] },
    staffing: { 1: { oic: { full_name: 'Juan Dela Cruz' } } },
  });
  const result = await loadCallableSites(api, [site({ id: 1, name: 'Site One' })]);
  assert.equal(result[0].oicName, 'Juan Dela Cruz');
});

test('loadCallableSites never throws when a Site\'s devices/staffing calls fail — degrades to zero/null for that Site only', async () => {
  const api: AuthenticatedApiClient = {
    request: (async () => {
      throw new Error('boom');
    }) as AuthenticatedApiClient['request'],
  };
  const result = await loadCallableSites(api, [site({ id: 1, name: 'Flaky Site' })]);
  assert.deepEqual(result, [{ siteId: 1, siteName: 'Flaky Site', onlineDeviceCount: 0, activeDeviceCount: 0, oicName: null }]);
});

test('only ACTIVE devices count toward online/active totals', async () => {
  const api = makeApi({
    devices: {
      1: [
        { is_active: true, last_seen_at: new Date().toISOString() },
        { is_active: false, last_seen_at: new Date().toISOString() },
      ],
    },
  });
  const result = await loadCallableSites(api, [site({ id: 1, name: 'Site One' })]);
  assert.equal(result[0].activeDeviceCount, 1);
  assert.equal(result[0].onlineDeviceCount, 1);
});

test('the contact picker is honest that a call fans out to the whole Site, not a specific device', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /no[\s\S]{0,15}per-device targeting from Admin Web/i);
});

test('the incoming-call overlay offers accept/decline and a click-to-enable ringtone control', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /function IncomingCallOverlay/);
  assert.match(source, /Enable ringtone sound/);
  assert.match(source, /onAccept/);
  assert.match(source, /onDecline/);
});

// Caller identity (owner-authorized 2026-09-30, follow-up to items A/B —
// closes gap 1: the invite payload used to carry only from:'guard'|
// 'staff', no site/device/name at all).
test('the incoming-call overlay shows the caller\'s site/device/OIC when the backend provides it, a plain fallback when it doesn\'t', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /function CallerIdentityLine/);
  assert.match(source, /callerContext\.siteName/);
  assert.match(source, /callerContext\.deviceLabel/);
  assert.match(source, /callerContext\.oicName/);
  assert.match(source, /callerContext\.userName/);
  assert.match(source, /if \(!callerContext\)/);
});

test('the ringtone requires a user gesture before it can play (browser autoplay policy)', () => {
  const source = readFileSync('lib/webrtc/ringtone.ts', 'utf8');
  assert.match(source, /must be called from within a user gesture/i);
  assert.match(source, /async enableSound\(\)/);
});

test('the in-call panel offers mute, camera toggle (video only), and end call', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /function InCallPanel/);
  assert.match(source, /toggleMute/);
  assert.match(source, /toggleCamera/);
  assert.match(source, /hangUp/);
});

test('an outgoing dial is correlated to its own callId via call:ringing, never assumed', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /event\.type === 'ringing' && dialing/);
});

test('the page states plainly that no staff-facing call log exists — a call is not recorded anywhere staff can browse later', () => {
  const source = readFileSync('app/calls/page.tsx', 'utf8');
  assert.match(source, /no staff-facing call-log[\s\S]{0,15}read endpoint/i);
});

test('the ICE config matches the Guard app\'s own STUN-only server exactly', () => {
  const source = readFileSync('lib/webrtc/ice-config.ts', 'utf8');
  assert.match(source, /stun:stun\.l\.google\.com:19302/);
  assert.doesNotMatch(source, /turn:/);
});
