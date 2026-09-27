import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../lib/management-api.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/site-rounds-panel.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/sites/[siteId]/page.tsx', import.meta.url), 'utf8');

test('Batch 1: Rounds no longer calls the nonexistent /sites/:siteId/rounds contract', () => {
  assert.doesNotMatch(api, /\/sites\/\$\{siteId\}\/rounds/);
  assert.doesNotMatch(api, /^\s*(listRounds|createRound|updateRound):/m);
  assert.doesNotMatch(panel, /managementApi\.(listRounds|createRound|updateRound)/);
});

test('Batch 1: Rounds panel shows an explicit unavailable state instead of a broken form', () => {
  assert.match(panel, /not available yet/i);
  assert.doesNotMatch(panel, /Create Round/);
  assert.doesNotMatch(panel, /setActive|isActive/);
  // The Rounds tab itself is preserved (not removed from navigation) —
  // "preserve any safe read-only information if possible" per Batch 1 scope.
  assert.match(page, /value="rounds"/);
});

test('Batch 1: Rounds role visibility still reuses the approved operational role boundary', () => {
  assert.match(panel, /canManageSiteOperations/);
  assert.doesNotMatch(panel, /role === 'manager'/);
  assert.doesNotMatch(panel, /role === 'engineer'/);
});
