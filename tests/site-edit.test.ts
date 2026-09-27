import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/sites/[siteId]/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/management-api.ts', import.meta.url), 'utf8');

// Missed Checkpoint Random Catch-Up (owner-approved, 2026-09-11) closed the
// gap Batch 1 found: `PATCH /management/sites/:id` now exists
// (ptms-api-release2-worktree's management-sites.controller.ts), so the
// Site Edit form this test previously proved was permanently unreachable
// is reachable again — gated only by role, the same as every other
// role-gated management action in this app.
test('Site Edit is reachable for Engineer/Manager roles now that the backend PATCH route exists', () => {
  assert.doesNotMatch(page, /SITE_EDIT_SUPPORTED_BY_BACKEND/);
  assert.match(page, /const editable = !!role && canEditSiteInformation\(role\)/);
});

test('the Site Edit form opens and its dutyEndTime field round-trips through beginEdit/updateSite', () => {
  assert.match(page, /function beginEdit\(\)/);
  assert.match(page, /setEditOpen\(true\)/);
  assert.match(page, /\{editable && \(/);
  // duty_end_time (Missed Checkpoint Random Catch-Up) is pre-filled from
  // the loaded Site on open, and sent back as `null` (explicit clear) when
  // the field is left blank, or the raw "HH:MM" string otherwise — never
  // omitted, since this form always means to set-or-clear it on every save.
  assert.match(page, /setDutyEndTime\(site\.duty_end_time\?\.slice\(0, 5\) \?\? ''\)/);
  assert.match(
    page,
    /dutyEndTime: dutyEndTime\.trim\(\) === '' \? null : dutyEndTime/,
  );
});

test('the underlying updateSite API wrapper is correctly shaped and reachable from the UI', () => {
  assert.match(api, /updateSite:[\s\S]*?\/management\/sites\/\$\{id\}[\s\S]*?method: 'PATCH'/);
});
