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

// P1 "Days" control (branch feat/admin-oic-management, backend sql/048) —
// every day / pick weekdays, matching days_of_week (bitmask) exactly.
// "Monthly on a specific day" was replaced 2026-09-30 by the Date From/
// Date Thru range below — the user found the monthly option confusing.
test('Days is a mode select with two plain-language choices, not raw bitmask/day-number inputs; the confusing Monthly option is gone', () => {
  assert.match(panel, /<option value="every_day">Every day<\/option>/);
  assert.match(panel, /<option value="weekdays">Pick weekdays<\/option>/);
  assert.doesNotMatch(panel, /<option value="monthly">/);
  assert.doesNotMatch(panel, /round-day-of-month/);
});

test('weekday picking uses named day chips (Mon..Sun), converting to the bitmask internally', () => {
  assert.match(panel, /\{ label: 'Mon', bit: 1 \}/);
  assert.match(panel, /\{ label: 'Sun', bit: 64 \}/);
  assert.match(panel, /const next = mask & bit \? mask & ~bit : mask \| bit;/);
});

test('picking weekdays with none selected blocks submit, matching the checkpoint-selection guard', () => {
  assert.match(panel, /daysModeFor\(timing\.daysOfWeek, ''\) === 'weekdays' && Number\(timing\.daysOfWeek\) === 0/);
  assert.match(panel, /Select at least one day\./);
});

test('editing an existing Round with days_of_week set populates the Days control from it; this form never writes dayOfMonth', () => {
  assert.match(panel, /daysOfWeek: round\.days_of_week \? String\(round\.days_of_week\) : round\.day_of_month \? '0' : '',/);
  assert.match(panel, /dayOfMonth: null,/);
});

test('the Rounds list badge still shows a legacy day_of_month, display-only, for a Round created before this form change', () => {
  assert.match(panel, /function daysBadgeLabel/);
  assert.match(panel, /Day \$\{round\.day_of_month\} of month/);
});

test('createRound/updateRound requests include daysOfWeek (null when unset) and always send dayOfMonth: null', () => {
  assert.match(panel, /daysOfWeek: timing\.daysOfWeek \? Number\(timing\.daysOfWeek\) : null,/);
  assert.match(panel, /dayOfMonth: null,/);
});

// "Date From"/"Date Thru" (P1 follow-up, user-requested 2026-09-30, backend
// sql/051) — replaces the confusing "Monthly on day N" option with two
// plain date pickers, independent of the Days control.
test('Round form has Date From / Date Thru date pickers, inclusive, no date limit when both empty', () => {
  assert.match(panel, /function DateRangeField/);
  assert.match(panel, /Date From/);
  assert.match(panel, /Date Thru/);
  assert.match(panel, /type="date"/);
  assert.match(panel, /Leave both empty to run with no date limit\. Inclusive of both dates\./);
});

test('Date Thru before Date From shows an inline error and blocks submit', () => {
  assert.match(panel, /Date Thru must be on or after Date From\./);
  assert.match(panel, /timing\.activeThru < timing\.activeFrom/);
});

test('createRound/updateRound requests include activeFrom/activeThru (null when unset)', () => {
  assert.match(panel, /activeFrom: timing\.activeFrom \|\| null,/);
  assert.match(panel, /activeThru: timing\.activeThru \|\| null,/);
});

test('editing an existing Round populates Date From/Date Thru from it', () => {
  assert.match(panel, /activeFrom: round\.active_from \?\? '',/);
  assert.match(panel, /activeThru: round\.active_thru \?\? '',/);
});

test('the Rounds list badge shows the active date range when one is configured', () => {
  assert.match(panel, /function dateRangeBadgeLabel/);
  assert.match(panel, /From \$\{formatBadgeDate\(round\.active_from\)\}/);
  assert.match(panel, /Until \$\{formatBadgeDate\(round\.active_thru\)\}/);
});
