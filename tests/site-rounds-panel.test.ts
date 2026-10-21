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
