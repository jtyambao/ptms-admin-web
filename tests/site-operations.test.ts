import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { managementApi } from '../lib/management-api.ts';
import { canManageSiteOperations, createGuardNdefText } from '../lib/site-operations.ts';

// Batch 3 correction (2026-09-26): reverted a 2026-09-24 edit that assumed
// the future five-role design (Supervisor/Admin only, super_admin retired)
// was already live in production. Verified against a fresh
// origin/main read (site-operational-access.service.ts requireManageAccess):
// manager/engineer explicitly forbidden; super_admin (any org/site) is very
// much still live; `admin` (migration 034) IS recognized by this exact
// check already.
test('operational roles match backend authority without Manager or Engineer broadening', () => {
  assert.equal(canManageSiteOperations('supervisor'), true);
  assert.equal(canManageSiteOperations('site_admin'), true);
  assert.equal(canManageSiteOperations('admin'), true);
  assert.equal(canManageSiteOperations('super_admin'), true);
  assert.equal(canManageSiteOperations('manager'), false);
  assert.equal(canManageSiteOperations('engineer'), false);
  assert.equal(canManageSiteOperations('org_admin'), false);
});

test('Guard payload is exact compact JSON for one NDEF text record', () => {
  assert.equal(createGuardNdefText({ tagUid: 'TEST-UID', tagSignature: 'TEST-SIGNATURE' }), '{"tagUid":"TEST-UID","tagSignature":"TEST-SIGNATURE"}');
});

test('management API uses exact Site-scoped Migration 028 contracts', async () => {
  const calls: Array<{path:string;init?:RequestInit}> = [];
  const api = { request: async <T>(path:string,init?:RequestInit)=>{calls.push({path,init});return {} as T;} };
  await managementApi.listDevices(api,4); await managementApi.registerDevice(api,4,{deviceId:'device',isPrimary:true}); await managementApi.deactivateDevice(api,4,7);
  await managementApi.listCheckpoints(api,4); await managementApi.getCheckpoint(api,4,8); await managementApi.createCheckpoint(api,4,{name:'Gate'}); await managementApi.deactivateCheckpoint(api,4,8);
  await managementApi.provisionNfc(api,4,8,'UID'); await managementApi.replaceNfc(api,4,8,'NEW','replacement'); await managementApi.revokeNfc(api,4,8,'retired');
  assert.deepEqual(calls.map(x=>x.path),['/sites/4/devices','/sites/4/devices','/sites/4/devices/7/deactivate','/sites/4/checkpoints','/sites/4/checkpoints/8','/sites/4/checkpoints','/sites/4/checkpoints/8/deactivate','/sites/4/checkpoints/8/provision-tag','/sites/4/checkpoints/8/replace-tag','/sites/4/checkpoints/8/revoke-tag']);
  assert.equal(calls[1].init?.method,'POST'); assert.equal(calls[2].init?.method,'PATCH');
});

test('Site Operations UI clears and never persists or renders the signing value', () => {
  const source=readFileSync('components/site-operations-panel.tsx','utf8');
  assert.match(source,/setWriterPayload\(null\)/);
  assert.match(source,/It is not saved after you close this window/);
  assert.doesNotMatch(source,/localStorage|sessionStorage/);
  assert.doesNotMatch(source,/writerPayload\.tagSignature|tag_signature/);
  assert.match(source,/old tag stops working/i);
  assert.match(source,/tag stops working right away/i);
});
