'use client';

import { AlertTriangle, BadgeCheck, ClipboardCheck, MapPin, Plus, RefreshCw, Siren } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError } from '@/lib/authenticated-api';
import { canSendSpecialCheckRequest } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import { requestStatusLabel, requestStatusSteps } from '@/lib/special-requests';
import type { ManagedCheckpoint, SpecialCheckRequestDetailed } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Requests tab. Two plainly-named actions instead of a "Type" dropdown
// (audited as a user 2026-10-07): "Send request" (a normal task - the
// guard acknowledges, does it, and completes it with a selfie) and
// "Send spot request" (a surprise visit - the guard must scan a checkpoint
// NFC tag to prove they went; optionally aimed at specific checkpoints).
// The list shows each request's lifecycle with who/when: sender name from
// the staff list endpoint; the Guard-side steps are attributed to "the
// Site device" because Guard acknowledge/complete record no person (one
// shared OIC login per Site). Only canSendSpecialCheckRequest roles get
// the create buttons, matching the backend's sender roles.
const operationError = 'The request could not be sent. Please try again.';
type Mode = 'standard' | 'spot_visit';

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

export function SiteSpecialCheckRequestsPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canSend = !!role && canSendSpecialCheckRequest(role);

  const [requests, setRequests] = useState<SpecialCheckRequestDetailed[]>([]);
  const [checkpoints, setCheckpoints] = useState<ManagedCheckpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [neededBy, setNeededBy] = useState('');
  const [picked, setPicked] = useState<number[]>([]);

  const activeCheckpoints = checkpoints.filter((c) => c.status === 'active');

  const refresh = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    setLoading(true);
    try {
      const [rows, cps] = await Promise.all([
        managementApi.listSpecialCheckRequestsStaff(session.api, siteId),
        managementApi.listCheckpoints(session.api, siteId).catch(() => [] as ManagedCheckpoint[]),
      ]);
      setRequests(rows);
      setCheckpoints(cps);
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : operationError);
    } finally { setLoading(false); }
  }, [session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function openCreate(next: Mode) {
    setTitle(''); setInstructions(''); setUrgent(false); setNeededBy(''); setPicked([]); setError(''); setMode(next);
  }

  function togglePick(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submitCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || !title.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.createSpecialCheckRequest(session.api, {
        siteId,
        title: title.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        priority: urgent ? 'urgent' : 'normal',
        ...(neededBy ? { neededBy: new Date(neededBy).toISOString() } : {}),
        type: mode,
        ...(mode === 'spot_visit' && picked.length > 0 ? { checkpointIds: picked } : {}),
      });
      setMode(null);
      await refresh();
      setSuccess(mode === 'spot_visit' ? 'Spot request sent. Guards at this Site will see it now.' : 'Request sent. Guards at this Site will see it now.');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : operationError);
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-6" aria-labelledby="requests-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Tasks for the guards</p>
          <h2 id="requests-heading" className="mt-1 text-xl font-black">Requests</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A <strong>request</strong> is a normal task. A <strong>spot request</strong> is a surprise visit: the guard must scan a
            checkpoint tag to prove they went. Both go to whichever guard is on shift at this Site.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
          </Button>
          {canSend && (
            <>
              <Button onClick={() => openCreate('standard')} className="bg-[#f36f0a] text-white hover:bg-[#d95e00]">
                <Plus />Send request
              </Button>
              <Button variant="outline" onClick={() => openCreate('spot_visit')}>
                <MapPin />Send spot request
              </Button>
            </>
          )}
        </div>
      </div>

      {error && !mode && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
      {success && <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><BadgeCheck className="size-4 shrink-0" />{success}</p>}
      {!canSend && (
        <p className="text-xs text-muted-foreground">Your role can view this Site&apos;s requests but cannot send a new one.</p>
      )}

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading requests…</p>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto" />
            <p className="mt-3 font-bold text-foreground">No requests sent yet</p>
            <p className="mt-1 text-sm">Requests you send for this Site will appear here with their status.</p>
          </div>
        ) : (
          <div className="divide-y">
            {requests.map((request) => {
              const steps = requestStatusSteps(request);
              return (
                <div key={request.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 font-bold">{request.title}</p>
                    {request.priority === 'urgent' && <Badge variant="destructive" className="gap-1 uppercase"><Siren className="size-3" />Urgent</Badge>}
                    <Badge variant="outline">{request.type === 'spot_visit' ? 'Spot request' : 'Request'}</Badge>
                    <Badge variant={request.status === 'completed' ? 'secondary' : 'outline'}>{requestStatusLabel(request.status)}</Badge>
                  </div>
                  {request.instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.instructions}</p>}
                  {request.type === 'spot_visit' && (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <MapPin className="size-3 text-[#e86405]" />
                      {request.target_checkpoints?.length > 0
                        ? <>Must scan: {request.target_checkpoints.map((c) => <Badge key={c.id} variant="secondary">{c.name}</Badge>)}</>
                        : <span className="text-muted-foreground">Any checkpoint at this Site</span>}
                    </p>
                  )}
                  <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {steps.map((step) => (
                      <li key={step.label}>
                        <span className="font-bold text-foreground">{step.label}</span>
                        {step.who && <> by {step.who}</>}
                        {step.at && <> · {when(step.at)}</>}
                        {step.note && <> · &ldquo;{step.note}&rdquo;</>}
                      </li>
                    ))}
                  </ol>
                  {request.needed_by && request.status !== 'completed' && (
                    <p className="mt-1 text-xs text-muted-foreground">Needed by {when(request.needed_by)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) setMode(null); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === 'spot_visit' ? 'Send spot request' : 'Send request'}</DialogTitle>
            <DialogDescription>
              {mode === 'spot_visit'
                ? 'The guard must go to a checkpoint and scan its NFC tag to complete this.'
                : 'The guard acknowledges it, does the task, and completes it with a selfie.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate}>
            <div className="grid gap-4">
              <label htmlFor="scr-title" className="grid gap-2 font-bold">
                What should the guard do?
                <Input id="scr-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={mode === 'spot_visit' ? 'e.g. Check the back gate' : 'e.g. Photograph the fire extinguishers'} />
              </label>
              <label htmlFor="scr-instructions" className="grid gap-2 font-bold">
                More details <span className="font-normal text-muted-foreground">(optional)</span>
                <Textarea id="scr-instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1000} />
              </label>
              <label htmlFor="scr-needed" className="grid gap-2 font-bold">
                Needed by <span className="font-normal text-muted-foreground">(optional - it expires after this time)</span>
                <Input id="scr-needed" type="datetime-local" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
              </label>
              <label className="flex items-center gap-3 text-sm font-bold">
                <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(v === true)} />
                Urgent
              </label>

              {mode === 'spot_visit' && (
                <div>
                  <p className="font-bold">Which checkpoint(s)?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tick the checkpoints the guard may scan - scanning any ONE of them completes it. Tick none to accept any checkpoint at this Site.
                  </p>
                  {activeCheckpoints.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">This Site has no active checkpoints yet - any tag will do.</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {activeCheckpoints.map((cp) => (
                        <label key={cp.id} className="flex items-center gap-3 text-sm">
                          <Checkbox checked={picked.includes(cp.id)} onCheckedChange={() => togglePick(cp.id)} />
                          {cp.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {picked.length > 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      The Guard app does not list the target checkpoints yet - if a guard scans the wrong tag it tells them which to scan.
                    </p>
                  )}
                </div>
              )}
              {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setMode(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Sending…' : 'Send'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
