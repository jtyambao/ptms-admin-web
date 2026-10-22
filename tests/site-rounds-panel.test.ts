import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// An ended round (Date Thru passed) stays active in the database and is listed under History; it must keep its
// Edit / Delete actions, otherwise it can never be removed (owner report 2026-10-21).
test('Edit and Delete show for every round that is still stored active, including an Ended one under History', () => {
  const source = readFileSync('components/site-rounds-panel.tsx', 'utf8');
  assert.match(source, /\{canManage && round\.is_active && \(/);
  assert.doesNotMatch(source, /round\.is_active && roundsTab === 'active'/);
  assert.match(source, /round\.is_active \? 'Ended' : 'Deleted'/); // ended = active in the database, past its Date Thru
});

test('creating / editing a round shows the backend\'s own sentence (e.g. "Date Thru has already passed...") instead of the generic text', () => {
  const api = readFileSync('lib/management-api.ts', 'utf8');
  assert.match(api, /createRound: [\s\S]*?\}, \{ surfaceServerMessage: true \}\),\n  updateRound:/);
  assert.match(api, /updateRound: [\s\S]*?\}, \{ surfaceServerMessage: true \}\),\n  deactivateRound:/);
});

// "Custom" fields in Add round (owner report 2026-10-22): choosing Custom selects the value that is shown, and an
// emptied Custom box stays Custom instead of snapping back to the preset / Default.
test('Custom frequency / window fields stay Custom while edited and select their text when chosen', () => {
  const source = readFileSync('components/site-rounds-panel.tsx', 'utf8');
  assert.match(source, /function useCustomField\(initiallyCustom: boolean\)/);
  assert.match(source, /inputRef\.current\?\.focus\(\);\s*inputRef\.current\?\.select\(\);/);
  // both Custom fields use it, keep their select on 'custom' while customMode is on, and select the text on choose
  assert.equal((source.match(/useCustomField\(/g) ?? []).length, 3); // definition + FrequencyField + SecondsPresetField
  assert.equal((source.match(/custom\.selectCustomText\(\)/g) ?? []).length, 2);
  assert.match(source, /value=\{showCustom \? 'custom' : String\(preset!\.minutes\)\}/);
  assert.match(source, /value=\{isCustom \? 'custom' : isDefault \? 'default' : String\(preset!\.seconds\)\}/);
  assert.match(source, /const isCustom = custom\.customMode \|\| \(!isDefault && !preset\);/);
});
