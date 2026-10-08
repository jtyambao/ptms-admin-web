'use client';

import { AlertTriangle, BadgeCheck, Clock, Plus, RefreshCw, Route, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ShowMore, useShowMore } from '@/components/page-layout';
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
const operationError = 'The round could not be saved. Please try again.';

// P1 friendly scheduling (branch feat/admin-oic-management) — the user's
// own explicit rule: never make a non-technical admin compute seconds or
// minutes, or enter a "magic number" (a raw 1440 rejected as meaningless
// on sight). Every preset here maps a plain-language label to the exact
// wire value the backend already accepts (dueIntervalMinutes / ack+tap
// seconds) — Custom is the only place a bare number ever appears, and
// only as a last resort so editing a pre-existing non-preset value never
// silently mangles it.
//
// "Once per window/day" = 1440 minutes (24h) is not arbitrary: with a
// daily window set, the next candidate (lastRevealedAt + 1440min) always
// lands exactly at the FOLLOWING day's window opening (see
// checkpoint-rounds.service.ts's getStatus, which takes
// min(adjustToWindow(candidate), nextWindowStart)) — i.e. exactly once
// per window, every day. With no window set, it's simply once every 24h
// from the last reveal. Same number, both correct "friendly" meanings.
const FREQUENCY_PRESETS = [
  { label: 'Once per window/day', minutes: 1440 },
  { label: 'Every 15 minutes', minutes: 15 },
  { label: 'Every 30 minutes', minutes: 30 },
  { label: 'Every 1 hour', minutes: 60 },
  { label: 'Every 2 hours', minutes: 120 },
  { label: 'Every 3 hours', minutes: 180 },
  { label: 'Every 4 hours', minutes: 240 },
] as const;

const SECONDS_PRESETS = [
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute', seconds: 60 },
  { label: '2 minutes', seconds: 120 },
  { label: '5 minutes', seconds: 300 },
] as const;

function FrequencyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preset = FREQUENCY_PRESETS.find((p) => String(p.minutes) === value);
  const isCustom = value.trim() !== '' && !preset;
  return (
    <div className="grid gap-2">
      <label htmlFor="round-frequency" className="font-bold">How often</label>
      <select
        id="round-frequency"
        className="h-10 rounded-lg border bg-background px-3 font-normal"
        value={preset ? String(preset.minutes) : 'custom'}
        onChange={(e) => onChange(e.target.value === 'custom' ? (isCustom ? value : '10') : e.target.value)}
      >
        {FREQUENCY_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
        <option value="custom">Custom</option>
      </select>
      {(isCustom || !preset) && (
        <label htmlFor="round-frequency-custom" className="grid gap-2 text-sm font-normal text-muted-foreground">
          Every this many minutes
          <input
            id="round-frequency-custom"
            type="number"
            min={1}
            className="h-10 rounded-lg border bg-background px-3 text-foreground"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
          />
        </label>
      )}
    </div>
  );
}

function SecondsPresetField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  const preset = SECONDS_PRESETS.find((p) => String(p.seconds) === value);
  const isDefault = value.trim() === '';
  const isCustom = !isDefault && !preset;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-bold">{label}</label>
      <select
        id={id}
        className="h-10 rounded-lg border bg-background px-3 font-normal"
        value={isDefault ? 'default' : preset ? String(preset.seconds) : 'custom'}
        onChange={(e) => {
          if (e.target.value === 'default') onChange('');
          else if (e.target.value === 'custom') onChange(isCustom ? value : '90');
          else onChange(e.target.value);
        }}
      >
        <option value="default">Default</option>
        {SECONDS_PRESETS.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
        <option value="custom">Custom</option>
      </select>
      {isCustom && (
        <label htmlFor={`${id}-custom`} className="grid gap-2 text-sm font-normal text-muted-foreground">
          Exact seconds
          <input
            id={`${id}-custom`}
            type="number"
            min={10}
            className="h-10 rounded-lg border bg-background px-3 text-foreground"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function frequencyBadgeLabel(minutes: number): string {
  const preset = FREQUENCY_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  return minutes % 60 === 0 ? `Every ${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `Every ${minutes} min`;
}

// P1 weekly/monthly recurrence (branch feat/admin-oic-management, backend
// sql/048) — Mon=1 (bit 0) .. Sun=64 (bit 6), matching round-window.util.ts
// exactly on the backend.
const WEEKDAYS = [
  { label: 'Mon', bit: 1 },
  { label: 'Tue', bit: 2 },
  { label: 'Wed', bit: 4 },
  { label: 'Thu', bit: 8 },
  { label: 'Fri', bit: 16 },
  { label: 'Sat', bit: 32 },
  { label: 'Sun', bit: 64 },
] as const;

type DaysMode = 'every_day' | 'weekdays';

// dayOfMonth is no longer settable from this form (replaced by DateRangeField
// below) — kept as a parameter only so a Round created before this change,
// which may still carry it, doesn't get silently treated as "weekdays" here.
function daysModeFor(daysOfWeek: string, dayOfMonth: string): DaysMode {
  if (daysOfWeek.trim() !== '' || dayOfMonth.trim() !== '') return 'weekdays';
  return 'every_day';
}

function DaysField({ daysOfWeek, onChange }: {
  daysOfWeek: string;
  onChange: (v: { daysOfWeek: string }) => void;
}) {
  const mode = daysModeFor(daysOfWeek, '');
  const mask = Number(daysOfWeek) || 0;

  function setMode(next: DaysMode) {
    onChange({ daysOfWeek: next === 'every_day' ? '' : mask > 0 ? String(mask) : '0' });
  }

  function toggleDay(bit: number) {
    const next = mask & bit ? mask & ~bit : mask | bit;
    onChange({ daysOfWeek: String(next) });
  }

  return (
    <div className="grid gap-2">
      <label htmlFor="round-days-mode" className="font-bold">Days</label>
      <select
        id="round-days-mode"
        className="h-10 rounded-lg border bg-background px-3 font-normal"
        value={mode}
        onChange={(e) => setMode(e.target.value as DaysMode)}
      >
        <option value="every_day">Every day</option>
        <option value="weekdays">Pick weekdays</option>
      </select>

      {mode === 'weekdays' && (
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <button
              key={d.bit}
              type="button"
              onClick={() => toggleDay(d.bit)}
              className={`h-9 rounded-lg border px-3 text-sm font-bold ${mask & d.bit ? 'border-transparent bg-[#f36f0a] text-white' : 'bg-background'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      {mode === 'weekdays' && mask === 0 && (
        <p className="text-xs text-red-700 dark:text-red-400">Select at least one day.</p>
      )}
    </div>
  );
}

// "Date From"/"Date Thru" (P1 follow-up, user-requested 2026-09-30) —
// replaces the prior "Monthly on a specific day" control, which the user
// found confusing. Independent of the Days control above: this bounds
// which calendar days the Round runs across AT ALL (e.g. "only during
// October"), not which of those days each week.
function DateRangeField({ activeFrom, activeThru, onChange }: {
  activeFrom: string;
  activeThru: string;
  onChange: (v: { activeFrom: string; activeThru: string }) => void;
}) {
  const invalid = activeFrom !== '' && activeThru !== '' && activeThru < activeFrom;
  return (
    <div className="grid gap-2">
      <p className="font-bold">Active dates</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor="round-active-from" className="grid gap-2 text-sm font-normal text-muted-foreground">
          Date From
          <input
            id="round-active-from"
            type="date"
            className="h-10 rounded-lg border bg-background px-3 text-foreground"
            value={activeFrom}
            onChange={(e) => onChange({ activeFrom: e.target.value, activeThru })}
          />
        </label>
        <label htmlFor="round-active-thru" className="grid gap-2 text-sm font-normal text-muted-foreground">
          Date Thru
          <input
            id="round-active-thru"
            type="date"
            className="h-10 rounded-lg border bg-background px-3 text-foreground"
            value={activeThru}
            onChange={(e) => onChange({ activeFrom, activeThru: e.target.value })}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Leave both empty to run with no date limit. Inclusive of both dates.</p>
      {invalid && <p className="text-xs text-red-700 dark:text-red-400">Date Thru must be on or after Date From.</p>}
    </div>
  );
}

function formatBadgeDate(dateStr: string): string {
  // 'YYYY-MM-DD' parsed as a plain calendar date, not a UTC instant — new
  // Date('YYYY-MM-DD') would shift a day off in timezones behind UTC.
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dateRangeBadgeLabel(round: { active_from: string | null; active_thru: string | null }): string | null {
  if (round.active_from && round.active_thru) return `${formatBadgeDate(round.active_from)} – ${formatBadgeDate(round.active_thru)}`;
  if (round.active_from) return `From ${formatBadgeDate(round.active_from)}`;
  if (round.active_thru) return `Until ${formatBadgeDate(round.active_thru)}`;
  return null;
}

function daysBadgeLabel(round: { days_of_week: number | null; day_of_month: number | null }): string | null {
  // day_of_month display only — a Round created before this form change may
  // still carry it; this form no longer writes it (see DateRangeField).
  if (round.day_of_month) return `Day ${round.day_of_month} of month`;
  if (round.days_of_week) {
    return WEEKDAYS.filter((d) => round.days_of_week! & d.bit).map((d) => d.label).join(', ');
  }
  return null;
}

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
      // A Round with a legacy day_of_month (this form no longer writes it —
      // see DateRangeField) has no "monthly" mode to reopen into; forcing
      // the weekdays picker open with none selected surfaces the ambiguity
      // and blocks Save (existing "select at least one day" validation)
      // until the admin makes an explicit choice, rather than silently
      // discarding day_of_month the moment they save any other change.
      daysOfWeek: round.days_of_week ? String(round.days_of_week) : round.day_of_month ? '0' : '',
      activeFrom: round.active_from ?? '',
      activeThru: round.active_thru ?? '',
    });
    setError('');
    setEditTarget(round);
  }

  function toggleCheckpoint(id: number) {
    setSelectedCheckpointIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // One click for the most common round: every active checkpoint, in list order.
  function selectAll() {
    setSelectedCheckpointIds(checkpoints.filter((c) => c.status === 'active').map((c) => c.id));
  }
  function clearAll() {
    setSelectedCheckpointIds([]);
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
      setSuccess('Round added.');
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
      setSuccess('Round saved.');
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
      setSuccess('Round deleted. Past patrols are kept.');
    } catch (reason) { setDeactivateTarget(null); showError(reason); }
    finally { setSaving(false); }
  }

  // Active rounds in one tab, everything else (deleted, or past its Date
  // Thru) in History - both newest first.
  const [roundsTab, setRoundsTab] = useState<'active' | 'history'>('active');
  const todayLocal = new Date().toLocaleDateString('en-CA');
  const isCurrent = (round: ManagedRound) => round.is_active && !(round.active_thru && round.active_thru < todayLocal);
  const newestFirst = (a: ManagedRound, b: ManagedRound) => b.id - a.id;
  const activeRounds = rounds.filter(isCurrent).sort(newestFirst);
  const historyRounds = rounds.filter((round) => !isCurrent(round)).sort(newestFirst);
  const shownRounds = roundsTab === 'active' ? activeRounds : historyRounds;
  const roundsMore = useShowMore(shownRounds, 5, 10);

  if (!canView) {
    return (
      <section className="rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Patrols</p>
        <h2 className="mt-1 text-xl font-black">Rounds</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Your role cannot manage Rounds for this Site.
        </p>
      </section>
    );
  }

  const activeCheckpoints = checkpoints.filter((c) => c.status === 'active');

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Patrols</p>
          <h2 className="mt-1 text-xl font-black">Rounds</h2>
          <p className="mt-2 text-sm text-muted-foreground">A round is a patrol route: which checkpoints the guard visits, how often, and when.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
          </Button>
          {canManage && (
            <Button onClick={openCreate} className="bg-[#f36f0a] text-white hover:bg-[#d95e00]">
              <Plus />Add round
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
              <p className="text-xs text-muted-foreground">Next patrol due</p>
              <p className="font-bold">{status.nextDueAt ? new Date(status.nextDueAt).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Repeats every</p>
              <p className="font-bold">{status.nextDueIntervalMinutes ? `${status.nextDueIntervalMinutes} min` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Missed checkpoints</p>
              <p className={`font-bold ${status.missedCount > 0 ? 'text-red-700 dark:text-red-400' : ''}`}>{status.missedCount}</p>
            </div>
          </div>
          {status.currentAlert !== null && (
            <p className="mt-3 flex gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="size-4 shrink-0" />A patrol reminder is waiting for the guard to respond.</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        <div className="flex gap-1 border-b p-2" role="tablist" aria-label="Rounds">
          {([['active', `Active (${activeRounds.length})`], ['history', `History (${historyRounds.length})`]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={roundsTab === key}
              onClick={() => setRoundsTab(key)}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${roundsTab === key ? 'bg-[#f36f0a] text-white' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading rounds…</p>
        ) : shownRounds.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Route className="mx-auto" />
            {roundsTab === 'active' ? (
              <>
                <p className="mt-3 font-bold text-foreground">No active rounds</p>
                <p className="mt-1 text-sm">Add a round to set which checkpoints guards visit and how often. Add the checkpoints first if you have not yet.</p>
              </>
            ) : (
              <p className="mt-3 font-bold text-foreground">No past rounds yet</p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {roundsMore.visible.map((round) => {
              const hasInactiveStop = round.stops.some((s) => s.checkpoint_status && s.checkpoint_status !== 'active');
              return (
                <div key={round.id} className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{round.name}</p>
                        <Badge variant={isCurrent(round) ? 'secondary' : 'outline'}>{isCurrent(round) ? 'Active' : round.is_active ? 'Ended' : 'Deleted'}</Badge>
                        <Badge variant="outline">{frequencyBadgeLabel(round.due_interval_minutes)}</Badge>
                        {formatTiming(round).map((part) => <Badge key={part} variant="outline">{part}</Badge>)}
                        {hasInactiveStop && (
                          <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
                            Includes a deleted checkpoint
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
                    {canManage && round.is_active && roundsTab === 'active' && (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openEdit(round)}>Edit</Button>
                        <Button variant="destructive" onClick={() => setDeactivateTarget(round)}>Delete</Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <ShowMore remaining={roundsMore.remaining} onClick={roundsMore.showMore} step={roundsMore.step} />
          </div>
        )}
      </div>

      <RoundFormDialog
        open={createOpen}
        title="Add a round"
        description="Pick the checkpoints the guard must visit, and when the patrol repeats."
        name={name} setName={setName}
        interval={interval} setInterval={setInterval_} timing={timing} setTiming={setTiming}
        activeCheckpoints={activeCheckpoints}
        selectedCheckpointIds={selectedCheckpointIds}
        toggleCheckpoint={toggleCheckpoint}
        selectAll={selectAll}
        clearAll={clearAll}
        saving={saving}
        onCancel={() => setCreateOpen(false)}
        onSubmit={submitCreate}
        submitLabel={saving ? 'Adding…' : 'Add round'}
      />

      <RoundFormDialog
        open={!!editTarget}
        title={`Edit ${editTarget?.name ?? ''}`}
        description="Change the checkpoints or timing. The checkpoint list you see here replaces the old one."
        name={name} setName={setName}
        interval={interval} setInterval={setInterval_} timing={timing} setTiming={setTiming}
        activeCheckpoints={activeCheckpoints}
        selectedCheckpointIds={selectedCheckpointIds}
        toggleCheckpoint={toggleCheckpoint}
        selectAll={selectAll}
        clearAll={clearAll}
        saving={saving}
        onCancel={() => setEditTarget(null)}
        onSubmit={submitEdit}
        submitLabel={saving ? 'Saving…' : 'Save'}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Guards will stop getting this round. Past patrols and visits are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void confirmDeactivate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// Round timing form state. Empty = organization default (seconds), all
// day (window), every day (days_of_week), or no date limit (active
// range). dayOfMonth is deliberately not form state — see openEdit's own
// comment; this form never writes it.
type RoundTiming = { start: string; end: string; ack: string; tap: string; daysOfWeek: string; activeFrom: string; activeThru: string };
const emptyTiming: RoundTiming = { start: '', end: '', ack: '', tap: '', daysOfWeek: '', activeFrom: '', activeThru: '' };

function timingRequest(timing: RoundTiming) {
  return {
    windowStartTime: timing.start || null,
    windowEndTime: timing.end || null,
    ackWindowSeconds: timing.ack ? Number(timing.ack) : null,
    tapWindowSeconds: timing.tap ? Number(timing.tap) : null,
    daysOfWeek: timing.daysOfWeek ? Number(timing.daysOfWeek) : null,
    dayOfMonth: null,
    activeFrom: timing.activeFrom || null,
    activeThru: timing.activeThru || null,
  };
}

function friendlySeconds(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} sec`;
}

function formatTiming(round: ManagedRound): string[] {
  const parts: string[] = [];
  parts.push(round.window_start_time && round.window_end_time
    ? `${round.window_start_time.slice(0, 5)}–${round.window_end_time.slice(0, 5)}`
    : 'All day');
  if (round.ack_window_seconds) parts.push(`Reminder shows ${friendlySeconds(round.ack_window_seconds)}`);
  if (round.tap_window_seconds) parts.push(`${friendlySeconds(round.tap_window_seconds)} to tap all`);
  const days = daysBadgeLabel(round);
  if (days) parts.push(days);
  const dateRange = dateRangeBadgeLabel(round);
  if (dateRange) parts.push(dateRange);
  return parts;
}

function RoundFormDialog({
  open, title, description, name, setName, interval, setInterval, timing, setTiming, activeCheckpoints,
  selectedCheckpointIds, toggleCheckpoint, selectAll, clearAll, saving, onCancel, onSubmit, submitLabel,
}: {
  open: boolean; title: string; description: string;
  name: string; setName: (v: string) => void;
  interval: string; setInterval: (v: string) => void;
  timing: RoundTiming; setTiming: (v: RoundTiming) => void;
  activeCheckpoints: ManagedCheckpoint[];
  selectedCheckpointIds: number[]; toggleCheckpoint: (id: number) => void;
  selectAll: () => void; clearAll: () => void;
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
            <FrequencyField value={interval} onChange={setInterval} />
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
            <DaysField
              daysOfWeek={timing.daysOfWeek}
              onChange={(v) => setTiming({ ...timing, ...v })}
            />
            <DateRangeField
              activeFrom={timing.activeFrom}
              activeThru={timing.activeThru}
              onChange={(v) => setTiming({ ...timing, ...v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SecondsPresetField
                id="round-ack"
                label="How long the “Check Due Soon” reminder shows"
                value={timing.ack}
                onChange={(v) => setTiming({ ...timing, ack: v })}
              />
              <SecondsPresetField
                id="round-tap"
                label="Time to tap all checkpoints"
                value={timing.tap}
                onChange={(v) => setTiming({ ...timing, tap: v })}
              />
            </div>
            <div className="lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">Checkpoints (in patrol order)</p>{activeCheckpoints.length > 0 && <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={selectAll}>Select all</Button><Button type="button" size="sm" variant="ghost" onClick={clearAll} disabled={selectedCheckpointIds.length === 0}>Clear</Button></div>}</div>
              {activeCheckpoints.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">This Site has no checkpoints yet. Add them first under Patrols &gt; Checkpoints.</p>
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
                Guards visit them in the order you tick them (see the numbers). Untick and tick again to move one to the end.
              </p>
            </div>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !name.trim() ||
                selectedCheckpointIds.length === 0 ||
                (daysModeFor(timing.daysOfWeek, '') === 'weekdays' && Number(timing.daysOfWeek) === 0) ||
                (timing.activeFrom !== '' && timing.activeThru !== '' && timing.activeThru < timing.activeFrom)
              }
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
