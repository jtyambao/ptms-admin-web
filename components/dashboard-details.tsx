'use client';

import { ImageOff, Phone, PhoneCall, Smartphone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Disclosure, ExpandableText, ShowMore, useShowMore } from '@/components/page-layout';
import type { ViewerPhoto } from '@/components/photo-viewer';
import { SosActionDialog, SosAlertCard, useSosActions } from '@/components/sos-alert-card';
import { Badge } from '@/components/ui/badge';
import { callsFeatureEnabled } from '@/lib/calls-feature';
import { scanTimeLabel } from '@/lib/checkpoint-scans';
import { canRespondToSos, deviceOnlineStatus } from '@/lib/dashboard';
import {
  MISSED_STATE_LABEL, REPORT_KIND_LABEL, callBackUrl, callDirectionLabel, callDuration, callOutcomeLabel, isOnDay,
  type ReportItem, type ReportKind,
} from '@/lib/dashboard-details';
import { managementApi } from '@/lib/management-api';
import { callSenderUrl, canCallSosSender, isOpenSos } from '@/lib/sos-console';
import type { RoundsDayHistory, Site, SiteDevice, SiteLatestPhoto, SosAlertEntry, StaffCallEntry, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// The detail sections under the Dashboard's tiles (2026-10-08). Plain
// English, lists capped with "Show more", photos open the shared viewer.
type OpenPhotos = (photos: ViewerPhoto[], index: number) => void;

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Thumb({ url, label, onClick }: { url: string | null; label: string; onClick?: () => void }) {
  if (!url) {
    return <div className="grid size-14 shrink-0 place-items-center rounded-xl border border-dashed text-muted-foreground" title="No photo"><ImageOff className="size-4" /></div>;
  }
  return (
    <button aria-label={label} className="size-14 shrink-0 overflow-hidden rounded-xl border bg-muted" onClick={onClick} type="button">
      {/* Short-lived signed link - a plain img is intentional. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="size-full object-cover" loading="lazy" src={url} />
    </button>
  );
}

// ---- one day of rounds + missed checkpoints for each Site (cached for a short while) ----
const dayCache = new Map<string, { at: number; value: RoundsDayHistory }>();
const CACHE_MS = 20_000; // shorter than the dashboard's 30s auto-refresh, so an open detail updates too

function useDayHistory(sites: Site[], day: string | null) {
  const session = useSession();
  const [state, setState] = useState<{ loading: boolean; error: boolean; perSite: { site: Site; history: RoundsDayHistory }[] }>({ loading: true, error: false, perSite: [] });
  useEffect(() => {
    let active = true;
    Promise.allSettled(sites.map(async (site) => {
      const key = `${site.id}:${day ?? 'today'}`;
      const hit = dayCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return { site, history: hit.value };
      const history = await managementApi.roundsHistory(session.api, site.id, day ? { date: day } : {});
      dayCache.set(key, { at: Date.now(), value: history });
      return { site, history };
    })).then((results) => {
      if (!active) return;
      const perSite = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      setState({ loading: false, error: results.some((r) => r.status === 'rejected'), perSite });
    });
    return () => { active = false; };
  }, [session.api, sites, day]);
  return state;
}

// ---------------- 1. Rounds completed today ----------------
export function RoundsDetail({ sites, day, timezone, onPhotos }: { sites: Site[]; day: string | null; timezone: string; onPhotos: OpenPhotos }) {
  const { loading, error, perSite } = useDayHistory(sites, day);
  const events = useMemo(
    () => perSite
      .flatMap(({ site, history }) => history.events.filter((event) => event.status === 'completed').map((event) => ({ site, event })))
      .sort((a, b) => (a.event.revealed_at < b.event.revealed_at ? 1 : -1)),
    [perSite],
  );
  const failed = perSite.reduce((sum, { history }) => sum + history.summary.failed, 0);
  const more = useShowMore(events, 5, 10);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-700 dark:text-red-400">Some Sites could not be loaded.</p>}
      <p className="text-sm text-muted-foreground">
        {events.length === 0 ? 'No rounds finished yet today.' : `${events.length} round${events.length === 1 ? '' : 's'} finished today, newest first.`}
        {failed > 0 ? ` ${failed} round${failed === 1 ? ' was' : 's were'} missed.` : ''}
      </p>
      {events.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {more.visible.map(({ site, event }) => {
              const photos: ViewerPhoto[] = event.visits.filter((v) => v.photo_view_url).map((v) => ({
                url: v.photo_view_url as string, title: v.checkpoint_name, subtitle: `${scanTimeLabel(v.visited_at, timezone, true)} · ${event.round_name}`, note: v.remarks,
              }));
              return (
                <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start" key={event.id}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{event.round_name}</p>
                      {event.any_late ? <Badge variant="destructive">Late</Badge> : <Badge variant="secondary">On time</Badge>}
                    </div>
                    <p className="text-sm font-bold tabular-nums">{scanTimeLabel(event.revealed_at, timezone, false)} · {site.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.oic_name ? `OIC on duty: ${event.oic_name} · ` : ""}{event.visits.length} {event.visits.length === 1 ? "scan" : "scans"}
                    </p>
                  </div>
                  {/* Scan photos shown straight away on the right - tap one to open the viewer. */}
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {event.visits.length === 0 && <p className="text-xs text-muted-foreground">No scans recorded.</p>}
                    {event.visits.map((visit) => {
                      const photoIndex = photos.findIndex((p) => p.url === visit.photo_view_url);
                      return (
                        <div className="flex w-20 flex-col items-center text-center" key={visit.id}>
                          <Thumb label={`View photo from ${visit.checkpoint_name}`} onClick={() => onPhotos(photos, photoIndex)} url={visit.photo_view_url} />
                          <p className="mt-1 truncate text-[11px] font-bold" title={visit.checkpoint_name}>{visit.checkpoint_name}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">{scanTimeLabel(visit.visited_at, timezone, false)}{visit.is_late ? " · Late" : ""}</p>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          <ShowMore onClick={more.showMore} remaining={more.remaining} step={more.step} />
        </div>
      )}
    </div>
  );
}

// ---------------- 2. Missed checkpoints today ----------------
export function MissedDetail({ sites, day, timezone }: { sites: Site[]; day: string | null; timezone: string }) {
  const { loading, error, perSite } = useDayHistory(sites, day);
  const missed = useMemo(
    () => perSite.flatMap(({ site, history }) => history.missed.map((item) => ({ site, item }))).sort((a, b) => (a.item.missed_at < b.item.missed_at ? 1 : -1)),
    [perSite],
  );
  const more = useShowMore(missed, 5, 10);
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-700 dark:text-red-400">Some Sites could not be loaded.</p>}
      {missed.length === 0 ? <Note>No checkpoints were missed today.</Note> : (
        <div className="overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {more.visible.map(({ site, item }) => (
              <li className="space-y-1 p-4" key={item.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{item.checkpoint_name}</p>
                  <Badge variant={item.state === 'open' ? 'destructive' : item.state === 'caught_up' ? 'secondary' : 'outline'}>{MISSED_STATE_LABEL[item.state]}</Badge>
                </div>
                <p className="text-sm font-bold tabular-nums">Due {scanTimeLabel(item.missed_at, timezone, false)} · {site.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.round_name ? `Round: ${item.round_name}` : 'Not part of a round'}
                  {item.oic_name ? ` · OIC on duty: ${item.oic_name}` : ''}
                  {item.resolved_at ? ` · tapped ${scanTimeLabel(item.resolved_at, timezone, false)}` : ''}
                </p>
                {item.late_reason && <div className="text-sm"><ExpandableText text={`Reason: ${item.late_reason}`} /></div>}
              </li>
            ))}
          </ul>
          <ShowMore onClick={more.showMore} remaining={more.remaining} step={more.step} />
        </div>
      )}
    </div>
  );
}

// ---------------- 3. SOS ----------------
export function SosDetail({ alerts, day, timezone, onChanged, unavailable }: { alerts: SosAlertEntry[]; day: string | null; timezone: string; onChanged: () => Promise<void>; unavailable: string | null }) {
  const session = useSession();
  const actions = useSosActions(session.api, onChanged);
  const [now, setNow] = useState(() => Date.now());
  const callsOn = callsFeatureEnabled();
  const canRespond = !!session.user && canRespondToSos(session.user.role);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const open = alerts.filter(isOpenSos);
  const closedToday = alerts.filter((a) => !isOpenSos(a) && day && isOnDay(a.triggered_at, day, timezone));
  const closedMore = useShowMore(closedToday, 5, 10);
  if (unavailable) return <Note>{unavailable}</Note>;
  return (
    <div className="space-y-4">
      {open.length === 0 ? <Note>No SOS alert is open right now.</Note> : open.map((alert) => (
        <SosAlertCard
          actingOn={actions.actingOn}
          alert={alert}
          callSlot={callsOn && canCallSosSender(alert) ? (
            <Link className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-6 text-base font-bold text-white hover:bg-blue-700" href={callSenderUrl(alert)}>
              <PhoneCall className="size-5" />Call sender now
            </Link>
          ) : callsOn && alert.site_id !== null ? (
            <Link className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-5 text-sm font-medium hover:bg-muted" href={`/calls?siteId=${alert.site_id}`} title="This alert does not say which phone sent it, so the whole Site is called.">
              <PhoneCall className="size-4" />Call the Site
            </Link>
          ) : null}
          canRespond={canRespond}
          key={alert.id}
          now={now}
          onAcknowledge={(a) => void actions.acknowledge(a)}
          onOpenAction={actions.openAction}
        />
      ))}
      {actions.success && <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{actions.success}</p>}
      {actions.error && <p className="text-sm font-bold text-red-700 dark:text-red-400" role="alert">{actions.error}</p>}
      <Disclosure count={closedToday.length} title="Closed today">
        {closedToday.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing was closed today.</p> : (
          <ul className="divide-y">
            {closedMore.visible.map((alert) => (
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm" key={alert.id}>
                <Badge variant="outline">{alert.status === 'resolved' ? 'Resolved' : 'False alarm'}</Badge>
                <span className="font-bold">{alert.site_name ?? 'Unknown Site'}</span>
                <span className="text-muted-foreground tabular-nums">{scanTimeLabel(alert.triggered_at, timezone, false)}</span>
                {alert.resolution_note && <span className="w-full text-xs text-muted-foreground">{alert.resolution_note}</span>}
              </li>
            ))}
          </ul>
        )}
        <ShowMore onClick={closedMore.showMore} remaining={closedMore.remaining} step={closedMore.step} />
      </Disclosure>
      <SosActionDialog actions={actions} />
    </div>
  );
}

// ---------------- 4. Officer in Charge ----------------
export function OicDetail({ sites, staffing, timezone, onPhotos }: { sites: Site[]; staffing: Record<number, StaffingStatus>; timezone: string; onPhotos: OpenPhotos }) {
  const session = useSession();
  const [photos, setPhotos] = useState<Record<number, SiteLatestPhoto | null>>({});
  const [devices, setDevices] = useState<Record<number, SiteDevice[] | null>>({});
  useEffect(() => {
    let active = true;
    for (const site of sites) {
      managementApi.latestSitePhoto(session.api, site.id).then((photo) => { if (active) setPhotos((cur) => ({ ...cur, [site.id]: photo })); }).catch(() => { if (active) setPhotos((cur) => ({ ...cur, [site.id]: null })); });
      managementApi.listDevices(session.api, site.id).then((rows) => { if (active) setDevices((cur) => ({ ...cur, [site.id]: rows })); }).catch(() => { if (active) setDevices((cur) => ({ ...cur, [site.id]: null })); });
    }
    return () => { active = false; };
  }, [session.api, sites]);
  const more = useShowMore(sites, 5, 10);
  return (
    <div className="space-y-3">
      <ul className="divide-y overflow-hidden rounded-xl border">
        {more.visible.map((site) => {
          const oic = staffing[site.id]?.oic ?? null;
          const photo = photos[site.id];
          const rows = (devices[site.id] ?? []).filter((d) => d.is_active);
          const main = rows.find((d) => d.is_primary);
          const backups = rows.filter((d) => !d.is_primary);
          return (
            <li className="flex gap-3 p-4" key={site.id}>
              <div className="shrink-0">
                {photo?.photo_view_url ? (
                  <button
                    aria-label={`View the latest photo from ${site.name}`}
                    className="size-20 overflow-hidden rounded-xl border bg-muted"
                    onClick={() => onPhotos([{ url: photo.photo_view_url as string, title: site.name, subtitle: `${photo.label} · ${scanTimeLabel(photo.taken_at, timezone, true)}` }], 0)}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" className="size-full object-cover" loading="lazy" src={photo.photo_view_url} />
                  </button>
                ) : (
                  <div className="grid size-20 place-items-center rounded-xl border border-dashed text-muted-foreground" title="No photo yet"><UserRound className="size-6" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{site.name}</p>
                <p className="font-black">{oic ? oic.full_name : 'No Officer in Charge chosen'}</p>
                {oic && <p className="text-xs text-muted-foreground">On duty since {scanTimeLabel(oic.started_at, timezone, true)}</p>}
                <p className="text-xs text-muted-foreground">
                  {photo ? `Latest photo from this Site: ${photo.label}, ${scanTimeLabel(photo.taken_at, timezone, true)}` : photo === null ? 'No photo has been sent from this Site yet.' : 'Looking for a photo…'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <PhoneChip label="Main phone" device={main} />
                  {backups.length > 0 ? backups.map((d) => <PhoneChip device={d} key={d.id} label="Backup phone" />) : <PhoneChip device={undefined} label="Backup phone" />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <ShowMore onClick={more.showMore} remaining={more.remaining} step={more.step} />
    </div>
  );
}

function PhoneChip({ label, device }: { label: string; device: SiteDevice | undefined }) {
  if (!device) return <Badge variant="outline"><Smartphone className="size-3" />{label}: none</Badge>;
  const status = deviceOnlineStatus(device.last_seen_at);
  return (
    <Badge variant={status.online ? 'secondary' : 'outline'} title={status.label}>
      <Smartphone className="size-3" />{label}: {status.online ? 'online' : 'offline'}
    </Badge>
  );
}

// ---------------- 5. Reports today ----------------
const KIND_FILTERS: { id: ReportKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'incident', label: 'Incidents' }, { id: 'dob', label: 'Daily log' }, { id: 'notify', label: 'Notify' }, { id: 'visitor', label: 'Visitors' },
];

export function ReportsDetail({ items, errors, timezone, onPhotos }: { items: ReportItem[]; errors: number; timezone: string; onPhotos: OpenPhotos }) {
  const [filter, setFilter] = useState<ReportKind | 'all'>('all');
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((item) => item.kind === filter)), [items, filter]);
  const more = useShowMore(shown, 5, 10);
  const photos: ViewerPhoto[] = useMemo(
    () => shown.filter((item) => item.photoUrl).map((item) => ({ url: item.photoUrl as string, title: `${REPORT_KIND_LABEL[item.kind]} · ${item.siteName}`, subtitle: scanTimeLabel(item.at, timezone, true), note: item.title })),
    [shown, timezone],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Report type">
        {KIND_FILTERS.map((option) => (
          <button
            aria-pressed={filter === option.id}
            className={`min-h-9 rounded-full border px-4 text-sm font-bold ${filter === option.id ? 'border-[#f36f0a] bg-[#f36f0a] text-white' : 'bg-background text-muted-foreground hover:border-orange-400'}`}
            key={option.id}
            onClick={() => setFilter(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {errors > 0 && <p className="text-xs text-red-700 dark:text-red-400">Some reports could not be loaded.</p>}
      {shown.length === 0 ? <Note>No reports yet today.</Note> : (
        <div className="overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {more.visible.map((item) => {
              const photoIndex = photos.findIndex((p) => p.url === item.photoUrl);
              return (
                <li className="flex gap-3 p-4" key={item.key}>
                  <Thumb label={`View photo: ${REPORT_KIND_LABEL[item.kind]}`} onClick={() => onPhotos(photos, photoIndex)} url={item.photoUrl} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.kind === 'incident' ? 'destructive' : 'secondary'}>{REPORT_KIND_LABEL[item.kind]}</Badge>
                      {item.badge && <Badge className="capitalize" variant="outline">{item.badge}</Badge>}
                      <span className="text-xs text-muted-foreground tabular-nums">{scanTimeLabel(item.at, timezone, false)} · {item.siteName}</span>
                    </div>
                    <div className="text-sm"><ExpandableText text={item.title} /></div>
                    {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <ShowMore onClick={more.showMore} remaining={more.remaining} step={more.step} />
        </div>
      )}
    </div>
  );
}

// ---------------- 6. Calls today ----------------
export function CallsDetail({ calls, timezone, unavailable }: { calls: { site: Site; entry: StaffCallEntry }[]; timezone: string; unavailable: string | null }) {
  const sorted = useMemo(() => [...calls].sort((a, b) => (a.entry.started_at < b.entry.started_at ? 1 : -1)), [calls]);
  const more = useShowMore(sorted, 5, 10);
  const callsOn = callsFeatureEnabled();
  if (unavailable) return <Note>{unavailable}</Note>;
  if (sorted.length === 0) return <Note>No calls with the Sites yet today.</Note>;
  return (
    <div className="overflow-hidden rounded-xl border">
      <ul className="divide-y">
        {more.visible.map(({ site, entry }) => {
          const outcome = callOutcomeLabel(entry);
          const duration = callDuration(entry);
          return (
            <li className="flex flex-wrap items-center gap-3 p-4" key={entry.call_id}>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{site.name}</p>
                  <Badge variant={outcome.tone === 'good' ? 'secondary' : outcome.tone === 'bad' ? 'destructive' : 'outline'}>{outcome.label}</Badge>
                </div>
                <p className="text-sm tabular-nums">{scanTimeLabel(entry.started_at, timezone, false)} · {callDirectionLabel(entry)} · {entry.call_type === 'video' ? 'Video' : 'Voice'}{duration ? ` · ${duration}` : ''}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.device_label ? `${entry.is_primary ? 'Main phone' : 'Phone'}: ${entry.device_label}` : entry.devices_rung > 1 ? `Rang ${entry.devices_rung} phones` : 'Phone not recorded'}
                </p>
              </div>
              {callsOn && (
                <Link className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-bold hover:bg-muted" href={callBackUrl(site.id, entry)}>
                  <Phone className="size-4" />Call back
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <ShowMore onClick={more.showMore} remaining={more.remaining} step={more.step} />
    </div>
  );
}
