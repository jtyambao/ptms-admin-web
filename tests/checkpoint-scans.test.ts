import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { addDays, scanRange, scanTimeLabel } from '../lib/checkpoint-scans.ts';
import { managementApi } from '../lib/management-api.ts';

// Checkpoint Scans (2026-10-08): "where can I see my tagged checkpoints and view the pictures?"
const panel = readFileSync('components/site-checkpoint-scans-panel.tsx', 'utf8');

test('date arithmetic stays on plain calendar days (month and year edges)', () => {
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
});

test('presets: today leaves the dates to the server; yesterday/week are computed from the server\'s today', () => {
  assert.deepEqual(scanRange('today', null, '', ''), {});
  assert.deepEqual(scanRange('today', '2026-10-08', '', ''), {});
  assert.deepEqual(scanRange('yesterday', '2026-10-08', '', ''), { from: '2026-10-07', to: '2026-10-07' });
  assert.deepEqual(scanRange('week', '2026-10-08', '', ''), { from: '2026-10-02', to: '2026-10-08' });
  assert.deepEqual(scanRange('yesterday', null, '', ''), {});
});

test('picked dates need both days, in order, within 31 days - with a plain message otherwise', () => {
  assert.deepEqual(scanRange('custom', '2026-10-08', '2026-10-01', '2026-10-03'), { from: '2026-10-01', to: '2026-10-03' });
  assert.match(scanRange('custom', null, '', '2026-10-03').invalid!, /both dates/);
  assert.match(scanRange('custom', null, '2026-10-05', '2026-10-03').invalid!, /not be before/);
  assert.match(scanRange('custom', null, '2026-09-01', '2026-10-02').invalid!, /at most 31 days/);
  assert.equal(scanRange('custom', null, '2026-09-01', '2026-10-01').invalid, undefined);
});

test('scan time is shown in the organization timezone, with the date only when several days are listed', () => {
  const iso = '2026-10-08T01:30:00.000Z'; // 09:30 in Manila (UTC+8)
  assert.match(scanTimeLabel(iso, 'Asia/Manila', false), /9:30/);
  assert.match(scanTimeLabel(iso, 'Asia/Manila', true), /Oct/);
  assert.doesNotMatch(scanTimeLabel(iso, 'Asia/Manila', false), /Oct/);
  assert.match(scanTimeLabel(iso, 'America/Los_Angeles', false), /6:30/);
  assert.ok(scanTimeLabel(iso, 'Not/AZone', false).length > 0);
});

test('the API wrapper builds the query string and only sends what was chosen', async () => {
  const paths: string[] = [];
  const api = { request: async (path: string) => { paths.push(path); return {}; } } as never;
  await managementApi.listCheckpointScans(api, 4);
  await managementApi.listCheckpointScans(api, 4, { from: '2026-10-01', to: '2026-10-03', checkpointId: 12, limit: 50, offset: 100 });
  assert.deepEqual(paths, [
    '/sites/4/checkpoint-visits',
    '/sites/4/checkpoint-visits?from=2026-10-01&to=2026-10-03&checkpointId=12&limit=50&offset=100',
  ]);
});

test('Scans is a sub-tab under Patrols next to Checkpoints and Rounds, and /sites/4?tab=scans opens it', async () => {
  const { SITE_GROUPS, sectionFromTab, groupOf } = await import('../lib/site-tabs.ts');
  const patrols = SITE_GROUPS.find((g) => g.id === 'patrols')!;
  assert.deepEqual(patrols.items.map((i) => i.section), ['checkpoints', 'rounds', 'scans']);
  assert.equal(sectionFromTab('scans'), 'scans');
  assert.equal(groupOf('scans').id, 'patrols');
  assert.match(readFileSync('app/sites/[siteId]/page.tsx', 'utf8'), /section === 'scans' && <SiteCheckpointScansPanel siteId=\{siteId\} \/>/);
});

test('the panel: Today / Yesterday / Last 7 days / Pick dates, a checkpoint filter, newest-first list with On time / Late, and Show more', () => {
  for (const label of ['Today', 'Yesterday', 'Last 7 days', 'Pick dates', 'All checkpoints', 'On time', 'Late']) assert.ok(panel.includes(label), label);
  assert.match(panel, /Show \$\{Math\.min\(PAGE_SIZE, remaining\)\} more/);
  assert.match(panel, /fetchPage\(items\.length, PAGE_SIZE\)/);
  assert.match(panel, /No scans /);
  assert.match(panel, /When a guard taps a checkpoint tag with the Guard app, it shows up here with the photo\./);
});

test('the shared photo viewer has next/previous (buttons, arrow keys, swipe), full-size link, and survives expired links', () => {
  const viewer = readFileSync('components/photo-viewer.tsx', 'utf8');
  assert.match(viewer, /ChevronLeft/);
  assert.match(viewer, /event\.key === 'ArrowRight'/);
  assert.match(viewer, /onTouchEnd/);
  assert.match(viewer, /Open full size/);
  assert.match(viewer, /This photo link has expired\./);
  assert.match(viewer, /onError=\{\(\) => setPhotoFailed\(true\)\}/);
  // The Scans panel uses it, and still reloads a stale list before opening a photo.
  assert.match(panel, /<PhotoViewer/);
  assert.match(panel, /STALE_LINK_MS/);
});

test('the panel uses the layout standard and never stores the signed photo links', () => {
  assert.match(panel, /from '@\/components\/page-layout'/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});
