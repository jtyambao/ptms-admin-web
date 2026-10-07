import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';
import { requestStatusLabel, requestStatusSteps } from '../lib/special-requests.ts';
import type { SpecialCheckRequestDetailed } from '../lib/ptms-api.ts';

const panel = readFileSync('components/site-special-check-requests-panel.tsx', 'utf8');

const base: SpecialCheckRequestDetailed = {
  id: 1, organization_id: 1, personnel_id: null, site_id: 4, created_by: 9, title: 'Check the back gate',
  instructions: null, priority: 'normal', status: 'sent', needed_by: null, type: 'spot_visit',
  sent_at: '2026-10-07T01:00:00.000Z', acknowledged_at: null, completed_at: null, completion_remarks: null,
  selfie_url: null, sender_name: 'Maria Santos', target_checkpoints: [],
};

test('status words an admin understands: sent reads Pending', () => {
  assert.equal(requestStatusLabel('sent'), 'Pending');
  assert.equal(requestStatusLabel('acknowledged'), 'Acknowledged');
  assert.equal(requestStatusLabel('completed'), 'Completed');
  assert.equal(requestStatusLabel('expired'), 'Expired');
});

test('who/when trail: the SENDER is named, Guard-side steps are honestly the Site device (no person is recorded)', () => {
  const steps = requestStatusSteps({
    ...base, status: 'completed', acknowledged_at: '2026-10-07T01:05:00.000Z',
    completed_at: '2026-10-07T01:20:00.000Z', completion_remarks: 'All clear',
  });
  assert.deepEqual(steps.map((s) => [s.label, s.who]), [
    ['Sent', 'Maria Santos'], ['Acknowledged', 'the Site device'], ['Completed', 'the Site device'],
  ]);
  assert.equal(steps[2].note, 'All clear');
});

test('a request whose sender is unknown falls back, and an expired one says so', () => {
  assert.equal(requestStatusSteps({ ...base, sender_name: null })[0].who, 'an administrator');
  assert.equal(requestStatusSteps({ ...base, status: 'expired', needed_by: '2026-10-07T02:00:00.000Z' }).at(-1)!.label, 'Expired');
});

test('two plainly-named actions replace the Type dropdown: Send request / Send spot request', () => {
  assert.match(panel, /Send request/);
  assert.match(panel, /Send spot request/);
  assert.doesNotMatch(panel, /id="scr-type"/);
});

test('the spot request dialog offers a checkpoint picker (none ticked = any checkpoint) and only sends checkpointIds for spot requests', () => {
  assert.match(panel, /Which checkpoint\(s\)\?/);
  assert.match(panel, /Tick none to accept any checkpoint/);
  assert.match(panel, /mode === 'spot_visit' && picked\.length > 0 \? \{ checkpointIds: picked \}/);
});

test('the list shows sent requests with status, sender and the targeted checkpoints from the staff endpoint', () => {
  assert.match(panel, /managementApi\.listSpecialCheckRequestsStaff\(session\.api, siteId\)/);
  assert.match(panel, /Must scan:/);
  assert.match(panel, /Any checkpoint at this Site/);
});

test('staff list wrapper hits the JWT endpoint, not the Guard-facing unauthenticated one', async () => {
  const paths: string[] = [];
  const api = { request: async (p: string) => { paths.push(p); return []; } } as never;
  await managementApi.listSpecialCheckRequestsStaff(api, 4);
  assert.deepEqual(paths, ['/special-check-requests/site/4']);
});
