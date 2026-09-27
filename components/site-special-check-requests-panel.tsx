'use client';

import { AlertTriangle, BadgeCheck, ClipboardCheck, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { canSendSpecialCheckRequest } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import type { SpecialCheckRequest } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Special Check Requests create page (branch release/dry-run-ops) —
// GET is Guard-facing/unauthenticated at the backend, so the list is
// shown to any authenticated portal user; only canSendSpecialCheckRequest
// roles get the create form, matching SENDER_ROLES on the backend
// exactly. Acknowledge/complete are Guard-app actions, not shown here.
const operationError = 'The Special Check Request could not be sent. Please try again.';

export function SiteSpecialCheckRequestsPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canSend = !!role && canSendSpecialCheckRequest(role);

  const [requests, setRequests] = useState<SpecialCheckRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [type, setType] = useState<'standard' | 'spot_visit'>('standard');

  const refresh = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    setLoading(true);
    try {
      setRequests(await managementApi.listSpecialCheckRequests(session.api, siteId));
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : operationError);
    } finally { setLoading(false); }
  }, [session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function openCreate() {
    setTitle(''); setInstructions(''); setPriority('normal'); setType('standard'); setError(''); setCreateOpen(true);
  }

  async function submitCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.createSpecialCheckRequest(session.api, {
        siteId,
        title: title.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        priority,
        type,
      });
      setCreateOpen(false);
      await refresh();
      setSuccess('Special Check Request sent.');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : operationError);
    } finally { setSaving(false); }
  }

  return (
    <section className="mt-8 space-y-5" aria-labelledby="requests-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Ad hoc tasking</p>
          <h2 id="requests-heading" className="mt-1 text-xl font-black">Special Check Requests</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sent to whichever Guard is on shift at this Site (OIC-anchored login, not an individual Guard).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
          </Button>
          {canSend && (
            <Button onClick={openCreate} className="bg-[#f36f0a] text-white hover:bg-[#d95e00]">
              <Plus />New Request
            </Button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
      {success && <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><BadgeCheck className="size-4 shrink-0" />{success}</p>}
      {!canSend && (
        <p className="text-xs text-muted-foreground">
          Your role can view this Site&apos;s requests but cannot send a new one under current production RBAC.
        </p>
      )}

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading Special Check Requests…</p>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto" />
            <p className="mt-3 font-bold text-foreground">No Special Check Requests</p>
            <p className="mt-1 text-sm">Sent requests for this Site will appear here.</p>
          </div>
        ) : (
          <div className="divide-y">
            {requests.map((request) => (
              <div key={request.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 font-bold">{request.title}</p>
                  <Badge variant={request.priority === 'urgent' ? 'destructive' : 'outline'} className="uppercase">{request.priority}</Badge>
                  <Badge variant="outline" className="uppercase">{request.type === 'spot_visit' ? 'Spot Visit' : 'Standard'}</Badge>
                  <Badge variant={request.status === 'completed' ? 'secondary' : request.status === 'expired' ? 'outline' : 'secondary'} className="uppercase">{request.status}</Badge>
                </div>
                {request.instructions && <p className="mt-2 text-sm text-muted-foreground">{request.instructions}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  Sent {new Date(request.sent_at).toLocaleString()}
                  {request.needed_by && ` · Needed by ${new Date(request.needed_by).toLocaleString()}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Special Check Request</DialogTitle>
            <DialogDescription>
              Spot Visit requires the same NFC-tap proof as a real checkpoint tap to complete, not just a selfie.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate}>
            <div className="grid gap-4">
              <label htmlFor="scr-title" className="grid gap-2 font-bold">
                Title
                <Input id="scr-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
              </label>
              <label htmlFor="scr-instructions" className="grid gap-2 font-bold">
                Instructions (optional)
                <Input id="scr-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1000} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label htmlFor="scr-priority" className="grid gap-2 font-bold">
                  Priority
                  <select
                    id="scr-priority"
                    className="h-10 rounded-lg border bg-background px-3 font-normal"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof priority)}
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label htmlFor="scr-type" className="grid gap-2 font-bold">
                  Type
                  <select
                    id="scr-type"
                    className="h-10 rounded-lg border bg-background px-3 font-normal"
                    value={type}
                    onChange={(e) => setType(e.target.value as typeof type)}
                  >
                    <option value="standard">Standard</option>
                    <option value="spot_visit">Spot Site Visit</option>
                  </select>
                </label>
              </div>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Sending…' : 'Send Request'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
