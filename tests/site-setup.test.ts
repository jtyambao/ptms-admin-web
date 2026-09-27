import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditSiteInformation,
  canSetUpAdmin,
  canSetUpSupervisor,
  hasCoordinates,
  setupSteps,
} from '../lib/site-setup.ts';

test('Site coordinates are complete only as a pair', () => {
  assert.equal(hasCoordinates(14.6, 121), true);
  assert.equal(hasCoordinates(14.6, null), false);
  assert.equal(hasCoordinates(null, null), false);
});

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that assumed
// Supervisor setup had already become Manager-only and Site Information
// editing had already become Engineer-only in production, ahead of the
// future five-role design's Engineer/Manager split actually deploying.
// Verified against a fresh origin/main read
// (site-assignments.service.ts createSupervisorAccount: requireRole(['engineer','manager']);
// sites.service.ts create/update: "Only an organization Engineer or Manager
// may create/update sites."): both are engineer-OR-manager, unchanged.
test('hierarchy setup controls match the verified backend roles exactly', () => {
  assert.equal(canSetUpSupervisor('manager'), true);
  assert.equal(canSetUpSupervisor('engineer'), true);
  assert.equal(canSetUpSupervisor('supervisor'), false);
  assert.equal(canSetUpAdmin('supervisor'), true);
  assert.equal(canSetUpAdmin('admin'), false);
  assert.equal(canSetUpAdmin('manager'), false);
  assert.equal(canEditSiteInformation('engineer'), true);
  assert.equal(canEditSiteInformation('manager'), true);
  assert.equal(canEditSiteInformation('supervisor'), false);
});

test('setup status does not claim unavailable operational data is complete', () => {
  const steps = setupSteps({
    staffing: null,
    activePersonnel: null,
    activeDevices: null,
    hasPrimaryDevice: null,
    activeCheckpoints: null,
    nfcReadyCheckpoints: null,
  });
  assert.deepEqual(
    steps.map((step) => step.complete),
    [true, false, false, null, false, null, null],
  );
  assert.equal(
    steps.some(
      (step) =>
        step.label.includes('Round') || step.label.includes('Activation'),
    ),
    false,
  );
});
