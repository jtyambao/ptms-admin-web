'use client';

import { AlertTriangle, Camera, ChevronLeft, ChevronRight, ExternalLink, ImageOff, Nfc, RefreshCw, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExpandableText, Section } from '@/components/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiRequestError } from '@/lib/authenticated-api';
import { addDays, scanRange, scanTimeLabel, type ScanPreset } from '@/lib/checkpoint-scans';
import { managementApi } from '@/lib/management-api';
import type { CheckpointScan, ManagedCheckpoint } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Checkpoint Scans (2026-10-08): "where can I see my tagged checkpoints and
// view the pictures?" - every tap at this Site, newest first, with the photo.
// The photo links are short-lived signed URLs (about 5 minutes), so the list
// is silently reloaded when the viewer opens on an old list, and a photo that
// has expired offers a Refresh instead of a broken image.
const PAGE_SIZE = 50;
const STALE_LINK_MS = 4 * 60 * 1000;

const PRESETS: { id: ScanPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'custom', label: 'Pick dates' },
];

export function SiteCheckpointScansPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const [preset, setPreset] = useState<ScanPreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [checkpointId, setCheckpointId] = useState<number | ''>('');
  const [checkpoints, setCheckpoints] = useState<ManagedCheckpoint[]>([]);
  const [today, setToday] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('Asia/Manila');
  const [items, setItems] = useState<CheckpointScan[]>([]);
  const [total, setTotal] = useState(0);
  const [rangeLabel, setRangeLabel] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const requestId = useRef(0);

  const range = useMemo(() => scanRange(preset, today, customFrom, customTo), [preset, today, customFrom, customTo]);

  const fetchPage = useCallback(
    (offset: number, limit: number) =>
      managementApi.listCheckpointScans(session.api, siteId, {
        ...(range.from ? { from: range.from, to: range.to } : {}),
        ...(checkpointId !== '' ? { checkpointId } : {}),
        limit,
        offset,
      }),
    [session.api, siteId, range.from, range.to, checkpointId],
  );

  // (Re)load from the top whenever the dates or the checkpoint filter change.
  const reload = useCallback(
    async (keep = PAGE_SIZE) => {
      if (session.status !== 'authenticated') return;
      if (range.invalid) { setLoading(false); setItems([]); setTotal(0); setError(''); return; }
      const mine = ++requestId.current;
      setLoading(true);
      try {
        const page = await fetchPage(0, Math.min(Math.max(keep, PAGE_SIZE), 100));
        if (mine !== requestId.current) return;
        setItems(page.items);
        setTotal(page.total);
        setTimezone(page.timezone);
        setRangeLabel({ from: page.from, to: page.to });
        if (!range.from && !today) setToday(page.to);
        setLoadedAt(Date.now());
        setError('');
        setPhotoFailed(false);
      } catch (reason) {
        if (mine !== requestId.current) return;
        setError(reason instanceof ApiRequestError ? reason.message : 'The scans could not be loaded. Check your connection and try again.');
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    },
    [session.status, range.invalid, range.from, today, fetchPage],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  // Names for the "which checkpoint" filter (best effort - the filter simply hides if unavailable).
  useEffect(() => {
    if (session.status !== 'authenticated') return;
    let active = true;
    managementApi.listCheckpoints(session.api, siteId).then((rows) => { if (active) setCheckpoints(rows); }).catch(() => undefined);
    return () => { active = false; };
  }, [session.api, session.status, siteId]);

  async function showMore() {
    setLoadingMore(true);
    try {
      const page = await fetchPage(items.length, PAGE_SIZE);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setTotal(page.total);
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : 'More scans could not be loaded. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }

  const photoIndexes = useMemo(() => items.map((item, index) => (item.photo_view_url ? index : -1)).filter((index) => index >= 0), [items]);

  function openViewer(index: number) {
    setPhotoFailed(false);
    setViewerIndex(index);
    // Signed links last ~5 minutes: refresh quietly if this list is old.
    if (Date.now() - loadedAt > STALE_LINK_MS) void reload(items.length);
  }

  function step(direction: 1 | -1) {
    if (viewerIndex === null) return;
    const position = photoIndexes.indexOf(viewerIndex);
    const next = photoIndexes[position + direction];
    if (next !== undefined) { setPhotoFailed(false); setViewerIndex(next); }
  }

  useEffect(() => {
    if (viewerIndex === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex, photoIndexes]);

  const touchStartX = useRef<number | null>(null);
  const multiDay = rangeLabel.from !== '' && rangeLabel.from !== rangeLabel.to;
  const viewing = viewerIndex !== null ? items[viewerIndex] : null;
  const viewerPosition = viewerIndex !== null ? photoIndexes.indexOf(viewerIndex) : -1;
  const remaining = Math.max(0, total - items.length);
  const dayLabel = rangeLabel.from
    ? multiDay ? `${prettyDay(rangeLabel.from)} to ${prettyDay(rangeLabel.to)}` : prettyDay(rangeLabel.from)
    : 'today';

  return (
    <Section
      eyebrow="Patrols"
      title="Checkpoint scans"
      subtitle="Every time a guard tapped a checkpoint tag - with the photo they took."
      actions={(
        <Button variant="outline" onClick={() => void reload(items.length)} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
        </Button>
      )}
    >
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which days">
          {PRESETS.map((option) => (
            <button
              aria-pressed={preset === option.id}
              className={`min-h-9 rounded-full border px-4 text-sm font-bold transition ${preset === option.id ? 'border-[#f36f0a] bg-[#f36f0a] text-white' : 'bg-background text-muted-foreground hover:border-orange-400'}`}
              disabled={option.id !== 'today' && option.id !== 'custom' && !today}
              key={option.id}
              onClick={() => {
                setPreset(option.id);
                if (option.id === 'custom' && !customFrom && today) { setCustomFrom(addDays(today, -1)); setCustomTo(today); }
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold" htmlFor="scans-from">
              From
              <input className="h-10 rounded-lg border bg-background px-3 font-normal" id="scans-from" max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} type="date" value={customFrom} />
            </label>
            <label className="grid gap-1 text-sm font-bold" htmlFor="scans-to">
              To
              <input className="h-10 rounded-lg border bg-background px-3 font-normal" id="scans-to" min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} type="date" value={customTo} />
            </label>
            {range.invalid && <p className="text-sm font-bold text-red-700 dark:text-red-400 sm:col-span-2">{range.invalid}</p>}
          </div>
        )}
        {checkpoints.length > 0 && (
          <label className="grid gap-1 text-sm font-bold sm:max-w-xs" htmlFor="scans-checkpoint">
            Checkpoint
            <select
              className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 font-normal"
              id="scans-checkpoint"
              onChange={(event) => setCheckpointId(event.target.value ? Number(event.target.value) : '')}
              value={checkpointId}
            >
              <option value="">All checkpoints</option>
              {checkpoints.map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}{checkpoint.status !== 'active' ? ' (deleted)' : ''}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => void reload()}>Try again</Button>
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        <p className="border-b p-4 text-sm font-bold">
          {loading && items.length === 0 ? 'Loading…' : `${total} ${total === 1 ? 'scan' : 'scans'} - ${dayLabel}`}
        </p>
        {!loading && !error && items.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Nfc className="mx-auto" />
            <p className="mt-3 font-bold text-foreground">No scans {multiDay ? 'in these days' : preset === 'today' ? 'yet today' : 'on this day'}</p>
            <p className="mt-1 text-sm">When a guard taps a checkpoint tag with the Guard app, it shows up here with the photo.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((scan, index) => (
              <li className="flex gap-3 p-4" key={scan.id}>
                {scan.photo_view_url ? (
                  <button
                    aria-label={`View photo from ${scan.checkpoint_name}`}
                    className="group relative size-16 shrink-0 overflow-hidden rounded-xl border bg-muted sm:size-20"
                    onClick={() => openViewer(index)}
                    type="button"
                  >
                    {/* Signed, short-lived storage link - a plain img is intentional (next/image would proxy and cache it). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" className="size-full object-cover transition group-hover:scale-105" loading="lazy" src={scan.photo_view_url} />
                  </button>
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed text-muted-foreground sm:size-20" title="No photo with this scan">
                    <ImageOff className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate font-black">{scan.checkpoint_name}</p>
                    {scan.round_name ? (
                      scan.is_late ? <Badge variant="destructive">Late</Badge> : <Badge variant="secondary">On time</Badge>
                    ) : scan.is_late ? <Badge variant="destructive">Late</Badge> : null}
                  </div>
                  <p className="text-sm font-bold tabular-nums">{scanTimeLabel(scan.visited_at, timezone, multiDay)}</p>
                  <p className="text-xs text-muted-foreground">
                    {scan.round_name ? `Round: ${scan.round_name}` : 'Not part of a round'}
                    {scan.synced_from_offline ? ' · sent after the phone was offline' : ''}
                  </p>
                  {(scan.oic_name || scan.personnel_name) && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound className="size-3" />
                      {scan.personnel_name ? `Guard: ${scan.personnel_name}` : `OIC on duty: ${scan.oic_name}`}
                    </p>
                  )}
                  {scan.remarks && <div className="text-sm"><ExpandableText text={scan.remarks} /></div>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {remaining > 0 && (
          <div className="border-t p-3 text-center">
            <Button disabled={loadingMore} onClick={() => void showMore()} size="sm" variant="ghost">
              {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE_SIZE, remaining)} more${remaining > PAGE_SIZE ? ` (${remaining} hidden)` : ''}`}
            </Button>
          </div>
        )}
      </div>

      <Dialog onOpenChange={(open) => { if (!open) setViewerIndex(null); }} open={viewerIndex !== null}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Camera className="size-4" />{viewing?.checkpoint_name ?? 'Photo'}</DialogTitle>
            <DialogDescription>
              {viewing ? scanTimeLabel(viewing.visited_at, timezone, true) : ''}
              {viewing?.round_name ? ` · ${viewing.round_name}` : ''}
              {photoIndexes.length > 1 && viewerPosition >= 0 ? ` · photo ${viewerPosition + 1} of ${photoIndexes.length}` : ''}
            </DialogDescription>
          </DialogHeader>
          {viewing?.photo_view_url && (
            <div
              className="grid place-items-center overflow-hidden rounded-xl border bg-black"
              onTouchEnd={(event) => {
                const start = touchStartX.current;
                touchStartX.current = null;
                if (start === null) return;
                const delta = event.changedTouches[0].clientX - start;
                if (Math.abs(delta) > 50) step(delta < 0 ? 1 : -1);
              }}
              onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
            >
              {photoFailed ? (
                <div className="grid gap-3 p-10 text-center text-sm text-white">
                  <p>This photo link has expired.</p>
                  <Button onClick={() => void reload(items.length)} variant="secondary">Refresh the photo</Button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={`Photo from ${viewing.checkpoint_name}`} className="max-h-[65dvh] w-auto max-w-full object-contain" onError={() => setPhotoFailed(true)} src={viewing.photo_view_url} />
              )}
            </div>
          )}
          {viewing?.remarks && <div className="text-sm"><ExpandableText text={viewing.remarks} /></div>}
          <div className="flex items-center justify-between gap-2">
            <Button disabled={viewerPosition <= 0} onClick={() => step(-1)} variant="outline"><ChevronLeft />Previous</Button>
            {viewing?.photo_view_url && (
              <a className="inline-flex items-center gap-1 text-sm font-bold text-[#e86405] hover:underline" href={viewing.photo_view_url} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />Open full size
              </a>
            )}
            <Button disabled={viewerPosition < 0 || viewerPosition >= photoIndexes.length - 1} onClick={() => step(1)} variant="outline">Next<ChevronRight /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function prettyDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
