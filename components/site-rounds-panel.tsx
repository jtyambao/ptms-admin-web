'use client';

import { AlertTriangle, BadgeCheck, Clock, Plus, RefreshCw, Route, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canManageSiteOperations } from '@/lib/site-operations';
import type { ManagedCheckpoint, ManagedRound, RoundStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Dry-run fix (branch release/dry-run-ops) — replaces the prior "not yet
// available" placeholder now that a real, authenticated backend contract
// exists (GET/POST/PATCH sites/:siteId/rounds). Read access is broader
// than write access on the backend (Engineer/Manager can view org-wide but
// not edit), so this panel has its own read gate separate from
// canManageSiteOperations for the list/status view, and only shows
// create/edit/deactivate controls when canManageSiteOperations is true.
const operationError = 'The Round could not be saved. Please try again.';

export function SiteRoundsPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canManage = !!role && canManageSiteOperations(role);
  // Read access mirrors the backend's requireReadAccess: everyone who can
  // manage can also read, plus Engineer/Manager get org-wide read-only.
  const canView = canManage || role === 'engineer' || role === 'manager';

  const [rounds, setRounds] = useState<ManagedRound[]>([]);
  const [checkpoints, setCheckpoints] = useState<ManagedCheckpoint[]>([]);
  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedRound | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedRound | null>(null);
  const [name, setName] = useState('');
  const [interval, setInterval_] = useState('30');
  const [selectedCheckpointIds, setSelectedCheckpointIds] = useState<number[]>([]);
  const [timing, setTiming] = useState<RoundTiming>(emptyTiming);

  const refresh = useCallback(async () => {
    if (!canView || session.status !== 'authenticated') return;
    setLoading(true);
    try {
      const [roundRows, checkpointRows, statusRow] = await Promise.all([
        managementApi.listRounds(session.api, siteId),
        managementApi.listCheckpoints(session.api, siteId),
        managementApi.getRoundStatus(session.api, siteId),
      ]);
      setRounds(roundRows);
      setCheckpoints(checkpointRows);
      setStatus(statusRow);
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : operationError);
    } finally { setLoading(false); }
  }, [canView, session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function showError(reason: unknown) {
    setError(reason instanceof ApiRequestError ? reason.message : operationError);
  }

  function openCreate() {
    setName(''); setInterval_('30'); setSelectedCheckpointIds([]); setTiming(emptyTiming); setError(''); setCreateOpen(true);
  }

  function openEdit(round: ManagedRound) {
    setName(round.name);
    setInterval_(String(round.due_interval_minutes));
    setSelectedCheckpointIds(round.stops.map((s) => s.checkpoint_id));
    setTiming({
      start: round.window_start_time?.slice(0, 5) ?? '',
      end: round.window_end_time?.slice(0, 5) ?? '',
      ack: round.ack_window_seconds?.toString() ?? '',
      tap: round.tap_window_seconds?.toString() ?? '',
    });
    setError('');
    setEditTarget(round);
  }

  function toggleCheckpoint(id: number) {
    setSelectedCheckpointIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submitCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || selectedCheckpointIds.length === 0) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.createRound(session.api, siteId, {
        name: name.trim(),
        dueIntervalMinutes: Number(interval),
        checkpointIds: selectedCheckpointIds,
        ...timingRequest(timing),
      });
      setCreateOpen(false);
      await refresh();
      setSuccess('Round created.');
    } catch (reason) { showError(reason); }
    finally { setSaving(false); }
  }

  async function submitEdit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || !name.trim() || selectedCheckpointIds.length === 0) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.updateRound(session.api, siteId, editTarget.id, {
        name: name.trim(),
        dueIntervalMinutes: Number(interval),
        checkpointIds: selectedCheckpointIds,
        ...timingRequest(timing),
      });
      setEditTarget(null);
      await refresh();
      setSuccess('Round updated.');
    } catch (reason) { showError(reason); }
    finally { setSaving(false); }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await managementApi.deactivateRound(session.api, siteId, deactivateTarget.id);
      setDeactivateTarget(null);
      await refresh();
      setSuccess('Round deactivated.');
    } catch (reason) { setDeactivateTarget(null); showError(reason); }
    finally { setSaving(false); }
  }

  if (!canView) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Patrol configuration</p>
        <h2 className="mt-1 text-xl font-black">Rounds</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Round controls are unavailable for this role. The backend remains authoritative.
        </p>
      </section>
    );
  }

  const activeCheckpoints = checkpoints.filter((c) => c.status === 'active');

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Patrol configuration</p>
          <h2 className="mt-1 text-xl font-black">Rounds</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
          </Button>
          {canManage && (
            <Button onClick={openCreate} className="bg-[#f36f0a] text-white hover:bg-[#d95e00]">
              <Plus />New Round
            </Button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
      {success && <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><BadgeCheck className="size-4 shrink-0" />{success}</p>}

      {/* Schedules visibility — read-only, from the existing Guard-app-facing status endpoint */}
      {status && (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="flex items-center gap-2 font-black"><Clock className="size-4 text-[#e86405]" />Schedule status</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Next due</p>
              <p className="font-bold">{status.nextDueAt ? new Date(status.nextDueAt).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Interval</p>
              <p className="font-bold">{status.nextDueIntervalMinutes ? `${status.nextDueIntervalMinutes} min` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Missed (unresolved)</p>
              <p className={`font-bold ${status.missedCount > 0 ? 'text-red-700 dark:text-red-400' : ''}`}>{status.missedCount}</p>
            </div>
          </div>
          {status.currentAlert !== null && (
            <p className="mt-3 flex gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="size-4 shrink-0" />An acknowledgement is currently pending for this Site.</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading Rounds…</p>
        ) : rounds.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Route className="mx-auto" />
            <p className="mt-3 font-bold text-foreground">No Rounds configured</p>
            <p className="mt-1 text-sm">Create a Round to schedule patrol checkpoints.</p>
          </div>
        ) : (
          <div className="divide-y">
            {rounds.map((round) => {
              const hasInactiveStop = round.stops.some((s) => s.checkpoint_status && s.checkpoint_status !== 'active');
              return (
                <div key={round.id} className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{round.name}</p>
                        <Badge variant={round.is_active ? 'secondary' : 'outline'}>{round.is_active ? 'Active' : 'Inactive'}</Badge>
                        <Badge variant="outline">Every {round.due_interval_minutes} min</Badge>
                        {formatTiming(round).map((part) => <Badge key={part} variant="outline">{part}</Badge>)}
                        {hasInactiveStop && (
                          <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
                            Points at a deactivated checkpoint
                          </Badge>
                        )}
                      </div>
                      <ol className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {round.stops.map((stop) => (
                          <li key={stop.id} className={stop.checkpoint_status && stop.checkpoint_status !== 'active' ? 'text-red-700 line-through dark:text-red-400' : ''}>
                            {stop.tap_order}. {stop.checkpoint_name}
                          </li>
                        ))}
                      </ol>
                    </div>
                    {canManage && round.is_active && (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openEdit(round)}>Edit</Button>
                        <Button variant="destructive" onClick={() => setDeactivateTarget(round)}>Deactivate</Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RoundFormDialog
        open={createOpen}
        title="New Round"
        description="Ordered checkpoints define the patrol sequence. Only active checkpoints at this Site can be selected."
        name={name} setName={setName}
        interval={interval} setInterval={setInterval_} timing={timing} setTiming={setTiming}
        activeCheckpoints={activeCheckpoints}
        selectedCheckpointIds={selectedCheckpointIds}
        toggleCheckpoint={toggleCheckpoint}
        saving={saving}
        onCancel={() => setCreateOpen(false)}
        onSubmit={submitCreate}
        submitLabel={saving ? 'Creating…' : 'Create Round'}
      />

      <RoundFormDialog
        open={!!editTarget}
        title={`Edit ${editTarget?.name ?? ''}`}
        description="Saving replaces the entire checkpoint sequence for this Round."
        name={name} setName={setName}
        interval={interval} setInterval={setInterval_} timing={timing} setTiming={setTiming}
        activeCheckpoints={activeCheckpoints}
        selectedCheckpointIds={selectedCheckpointIds}
        toggleCheckpoint={toggleCheckpoint}
        saving={saving}
        onCancel={() => setEditTarget(null)}
        onSubmit={submitEdit}
        submitLabel={saving ? 'Saving…' : 'Save changes'}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This Round will stop generating due events. Historical due events and visits remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void confirmDeactivate()}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// Round timing form state. Empty = organization default (seconds) or all day.
type RoundTiming = { start: string; end: string; ack: string; tap: string };
const emptyTiming: RoundTiming = { start: '', end: '', ack: '', tap: '' };

function timingRequest(timing: RoundTiming) {
  return {
    windowStartTime: timing.start || null,
    windowEndTime: timing.end || null,
    ackWindowSeconds: timing.ack ? Number(timing.ack) : null,
    tapWindowSeconds: timing.tap ? Number(timing.tap) : null,
  };
}

function formatTiming(round: ManagedRound): string[] {
  const parts: string[] = [];
  parts.push(round.window_start_time && round.window_end_time
    ? `${round.window_start_time.slice(0, 5)}–${round.window_end_time.slice(0, 5)}`
    : 'All day');
  if (round.ack_window_seconds) parts.push(`Due Soon ${round.ack_window_seconds}s`);
  if (round.tap_window_seconds) parts.push(`Tap all ${round.tap_window_seconds}s`);
  return parts;
}

function RoundFormDialog({
  open, title, description, name, setName, interval, setInterval, timing, setTiming, activeCheckpoints,
  selectedCheckpointIds, toggleCheckpoint, saving, onCancel, onSubmit, submitLabel,
}: {
  open: boolean; title: string; description: string;
  name: string; setName: (v: string) => void;
  interval: string; setInterval: (v: string) => void;
  timing: RoundTiming; setTiming: (v: RoundTiming) => void;
  activeCheckpoints: ManagedCheckpoint[];
  selectedCheckpointIds: number[]; toggleCheckpoint: (id: number) => void;
  saving: boolean; onCancel: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-8">
            <label htmlFor="round-name" className="grid gap-2 font-bold">
              Round name
              <Input id="round-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required />
            </label>
            <label htmlFor="round-interval" className="grid gap-2 font-bold">
              Due interval (minutes)
              <Input id="round-interval" type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} required />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="round-start" className="grid gap-2 font-bold">
                Start time
                <Input id="round-start" type="time" value={timing.start} onChange={(e) => setTiming({ ...timing, start: e.target.value })} />
              </label>
              <label htmlFor="round-end" className="grid gap-2 font-bold">
                End time
                <Input id="round-end" type="time" value={timing.end} onChange={(e) => setTiming({ ...timing, end: e.target.value })} />
              </label>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground lg:col-span-2">Leave both empty to run all day. An end time earlier than the start time runs overnight (e.g. 18:00–06:00).</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="round-ack" className="grid gap-2 font-bold">
                Check Due Soon shows for (seconds)
                <Input id="round-ack" type="number" min={10} max={3600} placeholder="Default" value={timing.ack} onChange={(e) => setTiming({ ...timing, ack: e.target.value })} />
              </label>
              <label htmlFor="round-tap" className="grid gap-2 font-bold">
                Time to tap all checkpoints (seconds)
                <Input id="round-tap" type="number" min={10} max={7200} placeholder="Default" value={timing.tap} onChange={(e) => setTiming({ ...timing, tap: e.target.value })} />
              </label>
            </div>
            <div className="lg:col-span-2">
              <p className="font-bold">Checkpoints (in patrol order)</p>
              {activeCheckpoints.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No active checkpoints at this Site yet.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {activeCheckpoints.map((cp) => (
                    <div key={cp.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`cp-${cp.id}`}
                        checked={selectedCheckpointIds.includes(cp.id)}
                        onCheckedChange={() => toggleCheckpoint(cp.id)}
                      />
                      <label htmlFor={`cp-${cp.id}`}>{cp.name}</label>
                      {selectedCheckpointIds.includes(cp.id) && (
                        <Badge variant="outline">#{selectedCheckpointIds.indexOf(cp.id) + 1}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Order follows selection order. Deselect and reselect a checkpoint to move it to the end.
              </p>
            </div>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim() || selectedCheckpointIds.length === 0}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
