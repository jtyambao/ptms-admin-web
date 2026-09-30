import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deviceOnlineStatus } from '../lib/dashboard.ts';

// Device presence — ONLINE/OFFLINE (branch feat/remaining-four). See the
// design-decision comment above deviceOnlineStatus in lib/dashboard.ts:
// switched from "Last active: X ago" to a real Online/Offline claim
// (< 60s = Online) now that the backend genuinely touches
// site_devices.last_seen_at on the Guard app's 5s round-status poll
// (PR #9). Devices on the old Guard build (pre-deviceId poll) will show
// Offline until that app update ships — never a false Online, since
// Offline only ever means "not proven online in the last 60 seconds".

test('never logged in (null last_seen_at) reads plainly, not as an error or a fabricated duration', () => {
  const status = deviceOnlineStatus(null);
  assert.equal(status.online, false);
  assert.equal(status.label, 'Offline · never logged in');
});

test('last_seen_at under the 60s threshold reads Online', () => {
  const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  assert.deepEqual(deviceOnlineStatus(secondsAgo(0)), { online: true, label: 'Online' });
  assert.deepEqual(deviceOnlineStatus(secondsAgo(59)), { online: true, label: 'Online' });
});

test('last_seen_at at or past the 60s threshold reads Offline with a human-readable last-seen duration, never raw seconds/milliseconds', () => {
  const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  assert.equal(deviceOnlineStatus(secondsAgo(60)).online, false);
  assert.equal(deviceOnlineStatus(secondsAgo(89)).label, 'Offline · last seen moments ago');
  assert.equal(deviceOnlineStatus(secondsAgo(5 * 60)).label, 'Offline · last seen 5 min ago');
  assert.equal(deviceOnlineStatus(secondsAgo(3 * 3600)).label, 'Offline · last seen 3 h ago');
  assert.equal(deviceOnlineStatus(secondsAgo(5 * 86400)).label, 'Offline · last seen 5 d ago');
});

test('the Devices tab shows a real Online/Offline claim per device (deviceOnlineStatus, not the old Last-active wording)', () => {
  const source = readFileSync('components/site-operations-panel.tsx', 'utf8');
  assert.match(source, /deviceOnlineStatus\(device\.last_seen_at\)\.label/);
});
