import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatLastActive } from '../lib/dashboard.ts';

// P2 device presence (branch feat/admin-oic-management, backend commit
// a5fbce2) — honest "Last active: X ago" wording, never "Online"/
// "Offline": last_seen_at is only touched at Guard-app login today, and
// (once the Guard app change lands) on its existing 5s round-status
// poll — never a true real-time heartbeat, so an online/offline claim
// would overstate what this data actually proves.

test('never logged in (null last_seen_at) reads plainly, not as an error or a fabricated duration', () => {
  assert.equal(formatLastActive(null), 'Never logged in');
});

test('recent activity rounds to a human-readable unit, never raw seconds/milliseconds', () => {
  const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  assert.equal(formatLastActive(secondsAgo(30)), 'Last active moments ago');
  assert.equal(formatLastActive(secondsAgo(5 * 60)), 'Last active 5 min ago');
  assert.equal(formatLastActive(secondsAgo(3 * 3600)), 'Last active 3 h ago');
  assert.equal(formatLastActive(secondsAgo(5 * 86400)), 'Last active 5 d ago');
});

test('the Devices tab shows Last active per device, never claims Online/Offline', () => {
  const source = readFileSync('components/site-operations-panel.tsx', 'utf8');
  assert.match(source, /formatLastActive\(device\.last_seen_at\)/);
  assert.doesNotMatch(source, /['"]Online['"]/);
  assert.doesNotMatch(source, /['"]Offline['"]/);
});
