import assert from 'node:assert/strict';
import test from 'node:test';
import { SITE_GROUPS, groupOf, sectionFromTab } from '../lib/site-tabs.ts';

test('the Site page groups eleven parts into five tabs, and every part is reachable', () => {
  assert.equal(SITE_GROUPS.length, 5);
  const sections = SITE_GROUPS.flatMap((group) => group.items.map((item) => item.section));
  assert.equal(new Set(sections).size, 11);
});

test('old section ids and group ids both work as ?tab= deep links', () => {
  assert.equal(sectionFromTab('rounds'), 'rounds');
  assert.equal(sectionFromTab('emergency-contacts'), 'emergency-contacts');
  assert.equal(sectionFromTab('patrols'), 'checkpoints');
  assert.equal(sectionFromTab('requests'), 'requests');
  assert.equal(sectionFromTab('nonsense'), null);
  assert.equal(sectionFromTab(null), null);
  assert.equal(groupOf('devices').id, 'people');
  assert.equal(groupOf('attendance').id, 'requests');
});
