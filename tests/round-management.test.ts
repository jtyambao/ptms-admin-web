import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../lib/management-api.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/site-rounds-panel.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/sites/[siteId]/page.tsx', import.meta.url), 'utf8');

// Dry-run fix (branch release/dry-run-ops) — supersedes the Batch 1 tests
// this file used to hold. A real, authenticated backend contract now
// exists (CheckpointRoundsController's sites/:siteId/rounds routes on
// branch release/dry-run-ops), so the panel calls it for real instead of
// showing a permanent "not available yet" placeholder.

test('Rounds calls the real, authenticated sites/:siteId/rounds contract', () => {
  assert.match(api, /\/sites\/\$\{siteId\}\/rounds/);
  assert.match(api, /^\s*listRounds:/m);
  assert.match(api, /^\s*createRound:/m);
  assert.match(api, /^\s*updateRound:/m);
  assert.match(api, /^\s*deactivateRound:/m);
  assert.match(panel, /managementApi\.listRounds/);
  assert.match(panel, /managementApi\.createRound/);
  assert.match(panel, /managementApi\.updateRound/);
  assert.match(panel, /managementApi\.deactivateRound/);
});

test('Rounds panel has a working create/edit/deactivate form, not a placeholder', () => {
  assert.doesNotMatch(panel, /not available yet/i);
  assert.match(panel, /New Round/);
  assert.match(panel, /Edit \$\{editTarget/);
  assert.match(panel, /Deactivate/);
  // The Rounds tab itself is preserved.
  assert.match(page, /value="rounds"/);
});

test('Rounds write authority reuses canManageSiteOperations; read is broader (org-wide Engineer/Manager)', () => {
  assert.match(panel, /canManageSiteOperations/);
  // Read gate is intentionally broader than write, mirroring the backend's
  // requireReadAccess (broader than requireManageAccess) — Engineer/Manager
  // can view a Site's schedule org-wide but cannot create/edit/deactivate.
  assert.match(panel, /role === 'engineer' \|\| role === 'manager'/);
});

test('Rounds panel surfaces Schedules visibility from the existing status endpoint', () => {
  assert.match(api, /^\s*getRoundStatus:/m);
  assert.match(api, /\/checkpoint-rounds\/site\/\$\{siteId\}\/status/);
  assert.match(panel, /managementApi\.getRoundStatus/);
  assert.match(panel, /Schedule status/);
});
