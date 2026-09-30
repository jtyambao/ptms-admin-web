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

// P1 friendly scheduling (branch feat/admin-oic-management) — the user's
// own rule: never make a non-technical admin compute seconds/minutes or
// enter a raw magic number (a bare "1440" was explicitly rejected).
// "Due interval (minutes)" and the raw ack/tap-seconds number inputs are
// replaced with plain-language presets; a raw number only ever appears
// under an explicit "Custom" choice.
test('Frequency is a plain-language preset dropdown, not a raw minutes input', () => {
  assert.doesNotMatch(panel, /Due interval \(minutes\)/);
  assert.match(panel, /Once per window\/day/);
  assert.match(panel, /Every 15 minutes/);
  assert.match(panel, /Every 30 minutes/);
  assert.match(panel, /Every 1 hour/);
  assert.match(panel, /Every 2 hours/);
  assert.match(panel, /Every 3 hours/);
  assert.match(panel, /Every 4 hours/);
  assert.match(panel, /<option value="custom">Custom<\/option>/);
});

test('"Once per window/day" maps to 1440 minutes — one reveal per day, or per window if one is set', () => {
  assert.match(panel, /\{ label: 'Once per window\/day', minutes: 1440 \}/);
});

test('Check Due Soon / tap-all seconds use presets (30s/1min/2min/5min) with a Default option, not raw seconds inputs', () => {
  assert.doesNotMatch(panel, /Check Due Soon shows for \(seconds\)/);
  assert.doesNotMatch(panel, /Time to tap all checkpoints \(seconds\)/);
  assert.match(panel, /30 seconds/);
  assert.match(panel, /1 minute/);
  assert.match(panel, /2 minutes/);
  assert.match(panel, /5 minutes/);
  assert.match(panel, /<option value="default">Default<\/option>/);
});

test('a legacy/non-preset value (e.g. editing an existing Round) falls back to a visible Custom field instead of being silently changed', () => {
  const frequencyFieldStart = panel.indexOf('function FrequencyField');
  const frequencyFieldEnd = panel.indexOf('\n}', frequencyFieldStart);
  const frequencyField = panel.slice(frequencyFieldStart, frequencyFieldEnd);
  assert.match(frequencyField, /const isCustom = value\.trim\(\) !== '' && !preset;/);
  assert.match(frequencyField, /\{\(isCustom \|\| !preset\) && \(/);

  const secondsFieldStart = panel.indexOf('function SecondsPresetField');
  const secondsFieldEnd = panel.indexOf('function frequencyBadgeLabel');
  const secondsField = panel.slice(secondsFieldStart, secondsFieldEnd);
  assert.match(secondsField, /const isCustom = !isDefault && !preset;/);
});

test('the Rounds list badge shows the friendly frequency label, not the raw minutes number', () => {
  assert.doesNotMatch(panel, /Every \{round\.due_interval_minutes\} min/);
  assert.match(panel, /frequencyBadgeLabel\(round\.due_interval_minutes\)/);
});
