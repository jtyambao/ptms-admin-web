import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';
import {
  ALLOWED_TIME_CHOICES, allowedMinutesFromChoice, allowedTimeLabel, choiceFromAllowedMinutes, regularClashNotice,
  requestStatusLabel, requestStatusSteps, scheduleProblem, scheduledNotice, spotTimerNote,
} from '../lib/special-requests.ts';
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
    ...base, type: 'standard', status: 'completed', acknowledged_at: '2026-10-07T01:05:00.000Z',
    completed_at: '2026-10-07T01:20:00.000Z', completion_remarks: 'All clear',
  });
  assert.deepEqual(steps.map((s) => [s.label, s.who]), [
    ['Sent', 'Maria Santos'], ['Acknowledged', 'the Site device'], ['Completed', 'the Site device'],
  ]);
  assert.equal(steps[2].note, 'All clear');
});

test('a request whose sender is unknown falls back, and an expired one says so', () => {
  assert.equal(requestStatusSteps({ ...base, sender_name: null })[0].who, 'an administrator');
  assert.equal(requestStatusSteps({ ...base, type: 'standard', status: 'expired', needed_by: '2026-10-07T02:00:00.000Z' }).at(-1)!.label, 'Expired');
});

test('two plainly-named actions replace the Type dropdown: Send request / Send spot request', () => {
  assert.match(panel, /Send request/);
  assert.match(panel, /Send spot request/);
  assert.doesNotMatch(panel, /id="scr-type"/);
});

test('the spot request dialog offers a checkpoint picker (none ticked = any checkpoint) and only sends checkpointIds for spot requests', () => {
  assert.match(panel, /Which checkpoint\(s\)\?/);
  assert.match(panel, /Tick none to include every checkpoint at this Site/);
  assert.match(panel, /mode === 'spot_visit' && picked\.length > 0 \? \{ checkpointIds: picked \}/);
});

test('the list shows sent requests with status, sender and the targeted checkpoints from the staff endpoint', () => {
  assert.match(panel, /managementApi\.listSpecialCheckRequestsStaff\(session\.api, siteId\)/);
  assert.match(panel, /Must scan:/);
  assert.match(panel, /Every checkpoint at this Site/);
});

test('staff list wrapper hits the JWT endpoint, not the Guard-facing unauthenticated one', async () => {
  const paths: string[] = [];
  const api = { request: async (p: string) => { paths.push(p); return []; } } as never;
  await managementApi.listSpecialCheckRequestsStaff(api, 4);
  assert.deepEqual(paths, ['/special-check-requests/site/4']);
});

// Scheduled Spot requests (2026-10-14, sql/056).
test('Spot mode asks "When should the guard do this?" (empty = now) plus "Time allowed to finish"; a standard request keeps "Needed by"', () => {
  assert.ok(panel.includes('When should the guard do this?'));
  assert.ok(panel.includes('leave empty for right now'));
  assert.ok(panel.includes('Time allowed to finish'));
  assert.ok(panel.includes("const schedule = mode === 'spot_visit' ? scheduledAt : ''"));
  assert.ok(panel.includes('...(schedule ? { scheduledAt: new Date(schedule).toISOString() } : {})'));
  // The time allowed is the TAP timer after Acknowledge, sent as allowedMinutes - no longer a deadline counted from when it is shown.
  assert.ok(panel.includes('...(allowedMinutes ? { allowedMinutes } : {})'));
  assert.doesNotMatch(panel, /spotDeadline/);
  assert.match(panel, /Needed by/);
});

test('a scheduled request that is not due yet reads "Scheduled for <time> — not yet shown to the guard", then the normal status', () => {
  const pending = { ...base, scheduled_at: '2026-10-20T01:30:00.000Z', scheduled_pending: true, created_at: '2026-10-14T01:00:00.000Z' };
  assert.equal(scheduledNotice(pending, () => 'Oct 20, 9:30 AM'), 'Scheduled for Oct 20, 9:30 AM — not yet shown to the guard');
  assert.equal(requestStatusLabel('sent', true), 'Scheduled');
  assert.equal(requestStatusSteps(pending)[0].label, 'Created');
  const due = { ...base, scheduled_at: '2026-10-20T01:30:00.000Z', scheduled_pending: false };
  assert.equal(scheduledNotice(due, () => 'x'), null);
  assert.equal(requestStatusLabel('sent', false), 'Pending');
  assert.equal(requestStatusSteps(due)[0].label, 'Became due'); // a spot request
  assert.equal(requestStatusSteps({ ...due, type: 'standard' })[0].label, 'Sent');
  assert.equal(scheduledNotice(base, () => 'x'), null); // unscheduled rows are unchanged
  assert.match(panel, /scheduledNotice\(request, when\)/);
});

test('the form checks the schedule in plain words before sending (future, before "Needed by", within 30 days)', () => {
  const now = new Date('2026-10-14T00:00:00').getTime();
  assert.equal(scheduleProblem('', '', now), null);
  assert.equal(scheduleProblem('2026-10-15T09:00', '', now), null);
  assert.equal(scheduleProblem('2026-10-15T09:00', '2026-10-15T18:00', now), null);
  assert.match(scheduleProblem('2026-10-13T09:00', '', now)!, /must be in the future/);
  assert.match(scheduleProblem('2026-10-15T09:00', '2026-10-15T09:00', now)!, /must be later than/);
  assert.match(scheduleProblem('2026-10-15T09:00', '2026-10-15T08:00', now)!, /must be later than/);
  assert.match(scheduleProblem('2026-12-31T09:00', '', now)!, /at most 30 days/);
  assert.ok(panel.includes('scheduleProblem(schedule, '));
});

// Spot request = an additional Checkpoint Due Soon (2026-10-15).
test('a spot request reads Scheduled / Due now / Completed / Missed (a standard request keeps Pending / Acknowledged / Completed / Expired)', () => {
  assert.equal(requestStatusLabel('sent', true, 'spot_visit'), 'Scheduled');
  assert.equal(requestStatusLabel('sent', false, 'spot_visit'), 'Due now');
  assert.equal(requestStatusLabel('acknowledged', false, 'spot_visit'), 'Due now');
  assert.equal(requestStatusLabel('completed', false, 'spot_visit'), 'Completed');
  assert.equal(requestStatusLabel('expired', false, 'spot_visit'), 'Missed');
  assert.equal(requestStatusLabel('sent'), 'Pending');
  assert.equal(requestStatusLabel('sent', false, 'standard'), 'Pending');
  assert.equal(requestStatusLabel('expired', false, 'standard'), 'Expired');
  assert.match(panel, /requestStatusLabel\(request\.status, request\.scheduled_pending, request\.type\)/);
});

test('a spot request trail says Became due -> Completed / Missed, never "Acknowledged by the Site device"', () => {
  const missed = requestStatusSteps({ ...base, status: 'expired', acknowledged_at: '2026-10-07T01:05:00.000Z' });
  assert.deepEqual(missed.map((s) => s.label), ['Became due', 'Missed']);
  assert.match(missed[1].note ?? '', /timer ended/);
  const done = requestStatusSteps({ ...base, status: 'completed', completed_at: '2026-10-07T01:20:00.000Z' });
  assert.deepEqual(done.map((s) => [s.label, s.at]), [['Became due', base.sent_at], ['Completed', '2026-10-07T01:20:00.000Z']]);
  // standard requests are unchanged
  assert.deepEqual(requestStatusSteps({ ...base, type: 'standard', status: 'expired', needed_by: '2026-10-07T02:00:00.000Z' }).map((s) => s.label), ['Sent', 'Expired']);
});

test('the spot form describes the Due Soon behaviour: scan EVERY checkpoint (not any one), missed when the timer ends', () => {
  assert.match(panel, /extra Checkpoint Due Soon alert and must scan every checkpoint/);
  assert.match(panel, /Tick the checkpoints the guard must scan - all of them/);
  assert.match(panel, /Every checkpoint at this Site/);
  assert.doesNotMatch(panel, /any ONE of them/);
  assert.doesNotMatch(panel, /Guard app does not list the target checkpoints/);
});

test('Missed Checkpoints and the rounds history label a spot miss "Spot"; the missed report asks for it with includeSpot', () => {
  const details = readFileSync('components/dashboard-details.tsx', 'utf8');
  const reports = readFileSync('components/site-reports-panel.tsx', 'utf8');
  const api = readFileSync('lib/management-api.ts', 'utf8');
  assert.match(details, /\{event\.is_spot && <Badge variant="outline">Spot<\/Badge>\}/);
  assert.match(details, /\{item\.is_spot && <Badge variant="outline">Spot<\/Badge>\}/);
  assert.match(reports, /\{tap\.is_spot && <Badge variant="outline">Spot<\/Badge>\}/);
  assert.match(api, /missed\?includeSpot=1/);
  assert.match(api, /\/checkpoint-rounds\/site\/\$\{siteId\}\/missed\/governed/); // the governed list is untouched
});

// Spot request = a regular Checkpoint Due Soon: the time allowed is the tap timer after Acknowledge (2026-10-15).
test('time allowed to finish: choices, stored minutes and plain words', () => {
  assert.deepEqual(ALLOWED_TIME_CHOICES.map((c) => c.value), ['15', '30', '60', '120', 'regular']);
  assert.equal(allowedMinutesFromChoice('30'), 30);
  assert.equal(allowedMinutesFromChoice('regular'), null);
  assert.equal(choiceFromAllowedMinutes(null), 'regular');
  assert.equal(choiceFromAllowedMinutes(60), '60');
  assert.equal(allowedTimeLabel(null), 'the regular Due Soon time');
  assert.equal(allowedTimeLabel(45), '45 minutes');
  assert.equal(allowedTimeLabel(60), '1 hour');
  assert.equal(allowedTimeLabel(120), '2 hours');
});

test('the spot form explains the Acknowledge-then-tap flow and sends no deadline for a spot', () => {
  assert.match(panel, /regular Checkpoint Due Soon alert with the Acknowledge button/);
  assert.match(panel, /After they press\s+Acknowledge, this is how long they have to scan/);
  assert.match(panel, /const deadlineIso = mode === 'standard' && neededBy/);
  assert.match(panel, /scheduleProblem\(schedule, ''\)/);
  assert.doesNotMatch(panel, /No time limit/);
});

test('a spot request that is not finished can have its time changed from the list (PATCH), the open alert is recalculated by the server', async () => {
  assert.match(panel, /Time allowed after Acknowledge:/);
  assert.match(panel, /request\.status === 'sent' \|\| request\.status === 'acknowledged'\) && \(\s*<Button type="button" size="sm" variant="outline" onClick=\{\(\) => openEditAllowed\(request\)\}>Change time<\/Button>/);
  assert.match(panel, /managementApi\.updateSpecialCheckRequestAllowedTime\(session\.api, editing\.id, allowedMinutesFromChoice\(editChoice\)\)/);
  const calls: { path: string; init: { method?: string; body?: string } }[] = [];
  const api = { request: async (path: string, init: { method?: string; body?: string }) => { calls.push({ path, init }); return {}; } } as never;
  await managementApi.updateSpecialCheckRequestAllowedTime(api, 31, 45);
  await managementApi.updateSpecialCheckRequestAllowedTime(api, 31, null);
  assert.deepEqual(calls.map((c) => [c.path, c.init.method, c.init.body]), [
    ['/special-check-requests/31', 'PATCH', '{"allowedMinutes":45}'],
    ['/special-check-requests/31', 'PATCH', '{"allowedMinutes":null}'],
  ]);
});

// A spot yields to the regular Checkpoint Due Soon schedule (owner choice A, 2026-10-15).
test('the spot form warns when a regular Checkpoint Due Soon falls inside the spot and says where the timer would end', () => {
  const fmt = (iso: string) => `T(${iso.slice(11, 16)})`;
  assert.equal(regularClashNotice(null, fmt), null);
  assert.deepEqual(regularClashNotice({ at: '2026-10-20T01:00:00.000Z', ends_at: '2026-10-20T02:00:00.000Z', regular: [], shortened_to: null }, fmt), {
    clash: false, text: 'No regular Checkpoint Due Soon falls inside this spot.',
  });
  const clash = regularClashNotice({
    at: '2026-10-20T01:00:00.000Z', ends_at: '2026-10-20T02:00:00.000Z',
    regular: [{ round_name: 'Hourly', at: '2026-10-20T01:30:00.000Z' }], shortened_to: '2026-10-20T01:30:00.000Z',
  }, fmt)!;
  assert.equal(clash.clash, true);
  assert.match(clash.text, /due at T\(01:30\), inside this spot/);
  assert.match(clash.text, /The regular one goes first, so this spot's timer will end at T\(01:30\) instead of the full time/);
  assert.match(panel, /regularClashNotice\(clashCheck, when\)/);
  assert.match(panel, /managementApi\s*\.getSpotRegularSchedule\(session\.api, siteId,/);
});

test('the list shows the guard\'s live timer for a spot and when it was shortened to yield to a regular one', () => {
  const fmt = (iso: string) => `T(${iso.slice(11, 16)})`;
  const spot = { ...base, allowed_minutes: 60 };
  assert.equal(spotTimerNote(spot, fmt), null); // not due yet / no due event
  assert.equal(
    spotTimerNote({ ...spot, due_event: { status: 'pending', ack_deadline_at: '2026-10-20T01:01:30.000Z', acknowledged_at: null, tap_deadline_at: null } }, fmt),
    'Waiting for the guard to press Acknowledge (before T(01:01)).',
  );
  const ackOpen = { status: 'acknowledged' as const, ack_deadline_at: '2026-10-20T01:01:30.000Z', acknowledged_at: '2026-10-20T01:00:30.000Z' };
  assert.equal(
    spotTimerNote({ ...spot, due_event: { ...ackOpen, tap_deadline_at: '2026-10-20T02:00:30.000Z' } }, fmt),
    'The guard has until T(02:00) to scan.',
  );
  assert.equal(
    spotTimerNote({ ...spot, due_event: { ...ackOpen, tap_deadline_at: '2026-10-20T01:30:00.000Z' } }, fmt),
    'The guard has until T(01:30) to scan. Shortened so it does not clash with a regular Checkpoint Due Soon.',
  );
  assert.equal(spotTimerNote({ ...spot, due_event: { ...ackOpen, status: 'failed', tap_deadline_at: '2026-10-20T01:30:00.000Z' } }, fmt), null);
  assert.equal(spotTimerNote({ ...spot, type: 'standard', due_event: { ...ackOpen, tap_deadline_at: '2026-10-20T01:30:00.000Z' } }, fmt), null);
  assert.match(panel, /spotTimerNote\(request, when\)/);
});

test('the regular-schedule check calls the staff endpoint with the time and allowed minutes', async () => {
  const paths: string[] = [];
  const api = { request: async (p: string) => { paths.push(p); return {}; } } as never;
  await managementApi.getSpotRegularSchedule(api, 4);
  await managementApi.getSpotRegularSchedule(api, 4, '2026-10-20T01:00:00.000Z', 30);
  assert.deepEqual(paths, [
    '/special-check-requests/site/4/regular-schedule',
    '/special-check-requests/site/4/regular-schedule?at=2026-10-20T01%3A00%3A00.000Z&allowedMinutes=30',
  ]);
});
