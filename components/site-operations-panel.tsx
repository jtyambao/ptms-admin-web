'use client';

import { AlertTriangle, BadgeCheck, Camera, Eye, FileText, KeyRound, Nfc, Plus, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canManageSiteOperations, createGuardNdefText, generateTagId, writeGuardNfcTag } from '@/lib/site-operations';
import type { ManagedCheckpoint, NfcWriterPayload, SiteDevice } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type NfcMode = 'provision' | 'replace';
const operationError = 'The Site operation could not be completed. Please try again.';

export function SiteOperationsPanel({ siteId, section = 'all' }: { siteId: number; section?: 'all' | 'devices' | 'checkpoints' }) {
  const session = useSession();
  const allowed = !!session.user && canManageSiteOperations(session.user.role);
  const [devices, setDevices] = useState<SiteDevice[]>([]);
  const [checkpoints, setCheckpoints] = useState<ManagedCheckpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [checkpointName, setCheckpointName] = useState('');
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [requireNote, setRequireNote] = useState(false);
  const [deactivateDevice, setDeactivateDevice] = useState<SiteDevice | null>(null);
  const [deactivateCheckpoint, setDeactivateCheckpoint] = useState<ManagedCheckpoint | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [detail, setDetail] = useState<ManagedCheckpoint | null>(null);
  const [nfcTarget, setNfcTarget] = useState<ManagedCheckpoint | null>(null);
  const [nfcMode, setNfcMode] = useState<NfcMode>('provision');
  const [tagUid, setTagUid] = useState('');
  const [replaceReason, setReplaceReason] = useState<'lost' | 'damaged' | 'replacement' | 'correction'>('replacement');
  const [revokeTarget, setRevokeTarget] = useState<ManagedCheckpoint | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [writerPayload, setWriterPayload] = useState<NfcWriterPayload | null>(null);
  const [writerCheckpoint, setWriterCheckpoint] = useState('');
  const [writing, setWriting] = useState(false);

  const refresh = useCallback(async () => {
    if (!allowed || session.status !== 'authenticated') return;
    setLoading(true);
    try {
      const [deviceRows, checkpointRows] = await Promise.all([
        managementApi.listDevices(session.api, siteId),
        managementApi.listCheckpoints(session.api, siteId),
      ]);
      setDevices(deviceRows);
      setCheckpoints(checkpointRows);
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : operationError);
    } finally { setLoading(false); }
  }, [allowed, session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function showError(reason: unknown, conflict: string) {
    setError(reason instanceof ApiRequestError && reason.status === 409 ? conflict : reason instanceof ApiRequestError ? reason.message : operationError);
  }

  async function registerDevice(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deviceId.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.registerDevice(session.api, siteId, { deviceId: deviceId.trim(), ...(deviceLabel.trim() ? { label: deviceLabel.trim() } : {}), isPrimary });
      setDeviceId(''); setDeviceLabel(''); setIsPrimary(false); setDeviceOpen(false);
      await refresh(); setSuccess('Device registered. The physical identifier is now bound to this Site.');
    } catch (reason) { showError(reason, isPrimary ? 'That Device is already active, or this Site already has an active Primary Device.' : 'That Device already has an active registration. Deactivate the current registration before re-registering it.'); }
    finally { setSaving(false); }
  }

  async function confirmDeviceDeactivation() {
    if (!deactivateDevice) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.deactivateDevice(session.api, siteId, deactivateDevice.id);
      setDeactivateDevice(null); await refresh(); setSuccess('Device registration deactivated. Its history was preserved.');
    } catch (reason) { setDeactivateDevice(null); showError(reason, 'The Device registration changed before it could be deactivated.'); }
    finally { setSaving(false); }
  }

  async function createCheckpoint(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); if (!checkpointName.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.createCheckpoint(session.api, siteId, { name: checkpointName.trim(), requirePhoto, requireNote });
      setCheckpointName(''); setRequirePhoto(false); setRequireNote(false); setCheckpointOpen(false);
      await refresh(); setSuccess('Checkpoint created. Register its physical NFC tag when ready.');
    } catch (reason) { showError(reason, 'The Checkpoint could not be created because its operational state changed.'); }
    finally { setSaving(false); }
  }

  async function confirmCheckpointDeactivation() {
    if (!deactivateCheckpoint) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.deactivateCheckpoint(session.api, siteId, deactivateCheckpoint.id);
      setDeactivateCheckpoint(null); await refresh(); setSuccess('Checkpoint deleted. Past scans and reports are kept.');
    } catch (reason) { setDeactivateCheckpoint(null); showError(reason, 'The Checkpoint state changed before it could be deactivated.'); }
    finally { setSaving(false); }
  }

  function openNfc(checkpoint: ManagedCheckpoint, mode: NfcMode) {
    setNfcTarget(checkpoint); setNfcMode(mode); setTagUid(generateTagId(siteId, checkpoint.id)); setReplaceReason('replacement'); setError('');
  }

  async function submitNfc(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); if (!nfcTarget || !tagUid.trim()) return;
    setSaving(true); setError(''); setSuccess(''); setWriterPayload(null);
    try {
      const payload = nfcMode === 'provision'
        ? await managementApi.provisionNfc(session.api, siteId, nfcTarget.id, tagUid.trim())
        : await managementApi.replaceNfc(session.api, siteId, nfcTarget.id, tagUid.trim(), replaceReason);
      setWriterCheckpoint(nfcTarget.name); setNfcTarget(null); setTagUid(''); setWriterPayload(payload);
      await refresh();
    } catch (reason) {
      setTagUid('');
      showError(reason, 'This NFC tag is already active, or the Checkpoint already has an active NFC tag. Nothing was overwritten.');
    } finally { setSaving(false); }
  }

  async function writeNfc() {
    if (!writerPayload) return;
    setWriting(true); setError('');
    try {
      await writeGuardNfcTag(writerPayload);
      setWriterPayload(null); setSuccess(`NFC writing completed for ${writerCheckpoint}. The sensitive writer payload was cleared.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'NFC writing failed. Keep this dialog open and try again.');
    } finally { setWriting(false); }
  }

  async function confirmRevoke() {
    if (!revokeTarget || !revokeReason.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.revokeNfc(session.api, siteId, revokeTarget.id, revokeReason.trim());
      setRevokeTarget(null); setRevokeReason(''); await refresh(); setSuccess('NFC registration revoked. The physical tag will no longer validate.');
    } catch (reason) { setRevokeTarget(null); setRevokeReason(''); showError(reason, 'This Checkpoint has no active NFC tag to revoke.'); }
    finally { setSaving(false); }
  }

  if (!allowed) return (
    <section className="mt-8 rounded-2xl border bg-muted/20 p-5" aria-labelledby="operations-heading">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Physical setup</p>
      <h2 id="operations-heading" className="mt-1 text-xl font-black">{section === 'devices' ? 'Devices' : section === 'checkpoints' ? 'Checkpoints and NFC' : 'Device, Checkpoint and NFC'}</h2>
      <p className="mt-3 flex gap-2 text-sm text-muted-foreground"><ShieldAlert className="size-4 shrink-0" />Operational controls are unavailable for this role. The backend remains authoritative.</p>
    </section>
  );

  return (
    <section className="mt-8 space-y-8" aria-labelledby="operations-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Physical setup</p><h2 id="operations-heading" className="mt-1 text-xl font-black">{section === 'devices' ? 'Devices' : section === 'checkpoints' ? 'Checkpoints and NFC' : 'Device, Checkpoint and NFC'}</h2><p className="mt-2 text-sm text-muted-foreground">Use the physical Guard phone and NFC tags for these setup steps.</p></div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>
      </div>
      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
      {success && <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><BadgeCheck className="size-4 shrink-0" />{success}</p>}

      {(section === 'all' || section === 'devices') && <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">1. Guard Devices</h3><p className="mt-1 text-sm text-muted-foreground">Active registrations control which physical phone can operate at this Site.</p></div><Button onClick={() => setDeviceOpen(true)} className="bg-[#f36f0a] text-white hover:bg-[#d95e00]"><Plus />Register Device</Button></div>
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading Devices…</p> : devices.length === 0 ? <Empty icon={<Smartphone />} title="No Device registrations" text="Enter the identifier shown by the physical Guard phone." /> : <div className="divide-y">{devices.map(device => <div key={device.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className={`grid size-10 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15 ${device.is_active ? '' : 'opacity-45'}`}><Smartphone /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{device.label}</p><Badge variant="outline">{device.is_primary ? 'Primary' : 'Secondary'}</Badge><Badge variant={device.is_active ? 'secondary' : 'outline'}>{device.is_active ? 'Active' : 'Inactive'}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">Device ID: {device.device_id}</p><p className="mt-1 text-xs text-muted-foreground">Registered {new Date(device.registered_at).toLocaleString()}</p></div>{device.is_active && <Button variant="destructive" onClick={() => setDeactivateDevice(device)}>Deactivate</Button>}</div>)}</div>}
      </div>}

      {(section === 'all' || section === 'checkpoints') && <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">2. Checkpoints and NFC</h3><p className="mt-1 text-sm text-muted-foreground">Create the patrol location, then register and write its NFC tag.</p></div><Button onClick={() => setCheckpointOpen(true)} className="bg-[#f36f0a] text-white hover:bg-[#d95e00]"><Plus />Create Checkpoint</Button></div>
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading Checkpoints…</p> : checkpoints.length === 0 ? <Empty icon={<Nfc />} title="No Checkpoints" text="Create a Checkpoint before registering its NFC tag." /> : <div className="divide-y">{checkpoints.some(c=>c.status!=='active')&&<div className="px-5 py-3 text-right"><Button variant="ghost" size="sm" onClick={()=>setShowRemoved(v=>!v)}>{showRemoved?'Hide deleted':`Show deleted (${checkpoints.filter(c=>c.status!=='active').length})`}</Button></div>}{(showRemoved?checkpoints:checkpoints.filter(c=>c.status==='active')).map(cp => <div key={cp.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="grid size-10 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15"><Nfc /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{cp.name}</p><Badge variant={cp.status === 'active' ? 'secondary' : 'outline'}>{cp.status}</Badge><Badge variant={cp.tag_uid ? 'secondary' : 'outline'}>{cp.tag_uid ? 'NFC registered' : 'No NFC'}</Badge></div><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Camera className="size-3" />Photo {cp.require_photo ? 'required' : 'optional'}</span><span className="flex items-center gap-1"><FileText className="size-3" />Note {cp.require_note ? 'required' : 'optional'}</span></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async()=>{try{setDetail(await managementApi.getCheckpoint(session.api,siteId,cp.id));}catch(reason){showError(reason,'Checkpoint details changed.');}}}><Eye />View</Button>{cp.status==='active'&&!cp.tag_uid&&<Button onClick={()=>openNfc(cp,'provision')}><Nfc />Register NFC</Button>}{cp.status==='active'&&cp.tag_uid&&<><Button variant="outline" onClick={()=>openNfc(cp,'replace')}><KeyRound />Replace NFC</Button><Button variant="outline" onClick={()=>setRevokeTarget(cp)}>Revoke NFC</Button></>} {cp.status==='active'&&<Button variant="destructive" onClick={()=>setDeactivateCheckpoint(cp)}>Delete</Button>}</div></div></div>)}</div>}
      </div>}

      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}><DialogContent><DialogHeader><DialogTitle>Register Guard Device</DialogTitle><DialogDescription>Enter the identifier displayed by the physical Guard device. Devices cannot be transferred directly between Sites.</DialogDescription></DialogHeader><form onSubmit={registerDevice}><div className="grid gap-4"><label htmlFor="device-id" className="grid gap-2 font-bold">Device ID<Input id="device-id" value={deviceId} onChange={e=>setDeviceId(e.target.value)} maxLength={64} autoComplete="off" required /></label><label htmlFor="device-label" className="grid gap-2 font-bold">Label (optional)<Input id="device-label" value={deviceLabel} onChange={e=>setDeviceLabel(e.target.value)} maxLength={50} placeholder="Guard Phone 1" /></label><div className="flex items-center gap-3"><Checkbox id="device-primary" checked={isPrimary} onCheckedChange={value=>setIsPrimary(value===true)} /><label htmlFor="device-primary" className="font-bold">Make this the Primary Device</label></div><p className="text-xs text-muted-foreground">Only one active Primary Device is allowed. Additional Devices should remain Secondary.</p></div><DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={()=>setDeviceOpen(false)}>Cancel</Button><Button type="submit" disabled={saving||!deviceId.trim()}>{saving?'Registering…':'Register Device'}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={checkpointOpen} onOpenChange={setCheckpointOpen}><DialogContent><DialogHeader><DialogTitle>Create Checkpoint</DialogTitle><DialogDescription>Create the patrol location first. NFC registration is a separate physical step.</DialogDescription></DialogHeader><form onSubmit={createCheckpoint}><div className="grid gap-4"><label htmlFor="checkpoint-name" className="grid gap-2 font-bold">Checkpoint name<Input id="checkpoint-name" value={checkpointName} onChange={e=>setCheckpointName(e.target.value)} maxLength={150} required /></label><div className="flex items-center gap-3"><Checkbox id="checkpoint-photo" checked={requirePhoto} onCheckedChange={v=>setRequirePhoto(v===true)} /><label htmlFor="checkpoint-photo" className="font-bold">Require photo</label></div><div className="flex items-center gap-3"><Checkbox id="checkpoint-note" checked={requireNote} onCheckedChange={v=>setRequireNote(v===true)} /><label htmlFor="checkpoint-note" className="font-bold">Require note</label></div></div><DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={()=>setCheckpointOpen(false)}>Cancel</Button><Button type="submit" disabled={saving||!checkpointName.trim()}>{saving?'Creating…':'Create Checkpoint'}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={!!detail} onOpenChange={open=>{if(!open)setDetail(null)}}><DialogContent><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>Current Checkpoint state. To check a card, its Text record's "tagUid" must match the NFC ID below; the signature is verified by the server when a Guard scans it.</DialogDescription></DialogHeader>{detail&&<div className="grid gap-3 rounded-xl border p-4 text-sm"><Detail label="Status" value={detail.status}/><Detail label="Photo" value={detail.require_photo?'Required':'Optional'}/><Detail label="Note" value={detail.require_note?'Required':'Optional'}/><Detail label="NFC" value={detail.tag_uid?'Registered':'Not registered'}/>{detail.tag_uid&&<div className="grid gap-2 border-t pt-3"><p className="text-xs font-bold text-muted-foreground">NFC ID (the "tagUid" value in the card's Text record)</p><p className="break-all rounded-lg bg-muted p-2 font-mono text-xs">{detail.tag_uid}</p><Button type="button" variant="outline" size="sm" onClick={()=>{void navigator.clipboard.writeText(detail.tag_uid ?? '')}}>Copy NFC ID</Button></div>}</div>}<DialogFooter><Button onClick={()=>setDetail(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!nfcTarget} onOpenChange={open=>{if(!open){setNfcTarget(null);setTagUid('')}}}><DialogContent><DialogHeader><DialogTitle>{nfcMode==='provision'?'Register NFC':'Replace NFC'}</DialogTitle><DialogDescription>{nfcMode==='replace'?'The old physical tag becomes invalid immediately after confirmation. You must write the new payload to the replacement tag.':'A unique NFC ID has been generated for this checkpoint. Prepare it, then write the signed payload to the NFC card.'}</DialogDescription></DialogHeader><form onSubmit={submitNfc}><div className="grid gap-4"><label htmlFor="nfc-tag-uid" className="grid gap-2 font-bold">NFC ID<div className="flex gap-2"><Input id="nfc-tag-uid" value={tagUid} onChange={e=>setTagUid(e.target.value)} maxLength={100} autoComplete="off" required /><Button type="button" variant="outline" onClick={()=>nfcTarget&&setTagUid(generateTagId(siteId, nfcTarget.id))}>Generate</Button></div></label>{nfcMode==='replace'&&<label htmlFor="nfc-replace-reason" className="grid gap-2 font-bold">Replacement reason<select id="nfc-replace-reason" className="h-10 rounded-lg border bg-background px-3 font-normal" value={replaceReason} onChange={e=>setReplaceReason(e.target.value as typeof replaceReason)}><option value="replacement">Replacement</option><option value="lost">Lost</option><option value="damaged">Damaged</option><option value="correction">Correction</option></select></label>}<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">This action never silently overwrites another active tag. Duplicate assignments are rejected by the backend.</p></div><DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={()=>{setNfcTarget(null);setTagUid('')}}>Cancel</Button><Button type="submit" disabled={saving||!tagUid.trim()}>{saving?'Preparing…':nfcMode==='provision'?'Prepare NFC':'Replace and prepare NFC'}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={!!writerPayload} onOpenChange={open=>{if(!open){setWriterPayload(null);setWriterCheckpoint('')}}}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>Write NFC tag now</DialogTitle><DialogDescription>Write this as a single Text record on the NFC card (for example with an NFC writer app), or use Write to NFC tag on a compatible Android phone. It is not saved after you close this dialog.</DialogDescription></DialogHeader>{writerPayload&&<div className="grid gap-2"><p className="text-sm font-bold">Text record</p><textarea readOnly className="min-h-24 w-full rounded-lg border bg-background p-3 font-mono text-xs" value={createGuardNdefText(writerPayload)} onFocus={e=>e.currentTarget.select()} /><Button type="button" variant="outline" onClick={()=>{void navigator.clipboard.writeText(createGuardNdefText(writerPayload)).then(()=>setSuccess('Text record copied.'))}}>Copy text record</Button></div>}<div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-100"><p className="font-bold">Checkpoint: {writerCheckpoint}</p><p className="mt-2">On a compatible Android phone, tap Write and hold the intended NFC tag near the phone until completion.</p></div><DialogFooter><Button variant="outline" onClick={()=>{setWriterPayload(null);setWriterCheckpoint('')}} disabled={writing}>Close and clear</Button><Button onClick={()=>void writeNfc()} disabled={writing}><Nfc />{writing?'Hold tag near phone…':'Write to NFC tag'}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={!!deactivateDevice} onOpenChange={open=>{if(!open)setDeactivateDevice(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Deactivate Device registration?</AlertDialogTitle><AlertDialogDescription>The physical Device will stop resolving to this Site. Its registration history remains, and the same identifier can be registered again later as a new row.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={saving} onClick={()=>void confirmDeviceDeactivation()}>Deactivate</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={!!deactivateCheckpoint} onOpenChange={open=>{if(!open)setDeactivateCheckpoint(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Checkpoint?</AlertDialogTitle><AlertDialogDescription>It will be removed from this list and from the Guard app, and its NFC card will stop working. Past scans and reports are kept.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={saving} onClick={()=>void confirmCheckpointDeactivation()}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog open={!!revokeTarget} onOpenChange={open=>{if(!open){setRevokeTarget(null);setRevokeReason('')}}}><DialogContent><DialogHeader><DialogTitle>Revoke NFC registration</DialogTitle><DialogDescription>The physical tag will stop validating immediately. This cannot be undone silently; registering another tag requires a new provisioning action.</DialogDescription></DialogHeader><label htmlFor="nfc-revoke-reason" className="grid gap-2 font-bold">Reason<Input id="nfc-revoke-reason" value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} maxLength={500} required /></label><DialogFooter><Button variant="outline" onClick={()=>{setRevokeTarget(null);setRevokeReason('')}}>Cancel</Button><Button variant="destructive" disabled={saving||!revokeReason.trim()} onClick={()=>void confirmRevoke()}>Revoke NFC</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}

function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) { return <div className="p-10 text-center text-muted-foreground"><div className="mx-auto grid size-10 place-items-center">{icon}</div><p className="mt-3 font-bold text-foreground">{title}</p><p className="mt-1 text-sm">{text}</p></div>; }
function Detail({label,value}:{label:string;value:string}) { return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-bold capitalize">{value}</span></div>; }
