'use client';

import { AlertTriangle, ClipboardCheck, FileText, PhoneCall, ShieldAlert, Siren, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { Panel } from '@/components/page-layout';
import {
  CallsDetail, MissedDetail, OicDetail, ReportsDetail, RoundsDetail, SosDetail,
} from '@/components/dashboard-details';
import { canRespondToSos, canViewIncidents } from '@/lib/dashboard';
import {
  dobItem, incidentItem, isOnDay, newestFirst, notifyItem, sumRoundsSummaries, visitorItem, type ReportItem,
} from '@/lib/dashboard-details';
import { managementApi } from '@/lib/management-api';
import type { RoundsDayHistory, Site, SosAlertEntry, StaffCallEntry, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Dashboard "Today" tiles (2026-10-08). Every tile opens its detail BELOW the
// tiles (one at a time). Everything is per the organization's calendar day,
// which the server reports with each answer. A tile that can't be loaded for
// this role says so instead of showing a wrong number.
export type TileId = 'rounds' | 'missed' | 'sos' | 'oic' | 'reports' | 'calls';

export type Loaded<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'unavailable'; reason: string };

export interface SiteCalls { site: Site; calls: StaffCallEntry[] }

export function DashboardOverview({ sites, refreshKey }: { sites: Site[]; refreshKey: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canSos = !!role && canRespondToSos(role);
  const canIncidents = !!role && canViewIncidents(role);

  const [selected, setSelected] = useState<TileId | null>(null);
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null);
  const [summaries, setSummaries] = useState<Loaded<{ perSite: { site: Site; history: RoundsDayHistory }[] }>>({ state: 'loading' });
  const [guardCounters, setGuardCounters] = useState<{ done: number; missed: number } | null>(null);
  const [staffing, setStaffing] = useState<Record<number, StaffingStatus>>({});
  const [sos, setSos] = useState<Loaded<SosAlertEntry[]>>(canSos ? { state: 'loading' } : { state: 'unavailable', reason: 'Not available to your role.' });
  const [calls, setCalls] = useState<Loaded<SiteCalls[]>>({ state: 'loading' });
  const [reports, setReports] = useState<Loaded<ReportItem[]>>({ state: 'loading' });
  const [reportErrors, setReportErrors] = useState(0);

  const day = summaries.state === 'ready' ? summaries.data.perSite[0]?.history.date ?? null : null;
  const timezone = summaries.state === 'ready' ? summaries.data.perSite[0]?.history.timezone ?? 'Asia/Manila' : 'Asia/Manila';

  const loadSos = useCallback(async () => {
    if (!canSos) return;
    try {
      setSos({ state: 'ready', data: await managementApi.listSosAlerts(session.api) });
    } catch {
      setSos({ state: 'unavailable', reason: 'SOS alerts could not be loaded.' });
    }
  }, [canSos, session.api]);

  // Everything for the tiles, loaded in parallel and independently.
  useEffect(() => {
    if (session.status !== 'authenticated' || sites.length === 0) return;
    let active = true;
    const api = session.api;

    Promise.allSettled(sites.map((site) => managementApi.roundsHistory(api, site.id, { summary: true }).then((history) => ({ site, history }))))
      .then((results) => {
        if (!active) return;
        const perSite = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
        setSummaries(perSite.length > 0 || results.length === 0
          ? { state: 'ready', data: { perSite } }
          : { state: 'unavailable', reason: 'Rounds could not be loaded.' });
      });

    // The two counters the Guard app shows, read from the same endpoints so
    // both screens always agree: Checkpoints Done and Missed Checkpoints.
    Promise.allSettled(sites.map(async (site) => {
      const [done, status] = await Promise.all([
        managementApi.checkpointsDoneToday(api, site.id),
        managementApi.getRoundStatus(api, site.id),
      ]);
      return { done, missed: status.missedCount };
    })).then((results) => {
      if (!active) return;
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      setGuardCounters(ok.length > 0
        ? { done: ok.reduce((sum, c) => sum + c.done, 0), missed: ok.reduce((sum, c) => sum + c.missed, 0) }
        : null);
    });

    Promise.allSettled(sites.map((site) => managementApi.getStaffing(api, site.id).then((data) => [site.id, data] as const)))
      .then((results) => {
        if (!active) return;
        setStaffing(Object.fromEntries(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))));
      });

    void loadSos();

    Promise.allSettled(sites.map((site) => managementApi.listStaffCalls(api, site.id, { limit: 100 }).then((page) => ({ site, calls: page.items }))))
      .then((results) => {
        if (!active) return;
        const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
        setCalls(ok.length > 0 ? { state: 'ready', data: ok } : { state: 'unavailable', reason: 'The call log could not be loaded.' });
      });

    const names = new Map(sites.map((site) => [site.id, site.name]));
    const nameOf = (id: number | null) => (id !== null ? names.get(id) ?? 'Site' : 'Site');
    const jobs: Promise<ReportItem[]>[] = sites.flatMap((site) => [
      managementApi.listDailyOccurrenceBook(api, site.id).then((rows) => rows.map((row) => dobItem(row, site.name))),
      managementApi.listVoluntaryObservationReports(api, site.id).then((rows) => rows.map((row) => notifyItem(row, site.name))),
      managementApi.listVisitorLogs(api, site.id).then((rows) => rows.map((row) => visitorItem(row, site.name))),
    ]);
    if (canIncidents) {
      jobs.push(managementApi.listIncidents(api).then((rows) => rows.filter((row) => row.site_id !== null && names.has(row.site_id)).map((row) => incidentItem(row, nameOf(row.site_id)))));
    }
    Promise.allSettled(jobs).then((results) => {
      if (!active) return;
      setReportErrors(results.filter((r) => r.status === 'rejected').length);
      setReports({ state: 'ready', data: results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])) });
    });

    return () => { active = false; };
  }, [session.api, session.status, sites, refreshKey, canIncidents, loadSos]);

  const totals = summaries.state === 'ready' ? sumRoundsSummaries(summaries.data.perSite.map((entry) => entry.history.summary)) : null;
  const openSos = sos.state === 'ready' ? sos.data.filter((a) => a.status === 'active' || a.status === 'acknowledged') : [];
  const todayReports = useMemo(
    () => (reports.state === 'ready' && day ? newestFirst(reports.data.filter((item) => isOnDay(item.at, day, timezone))) : []),
    [reports, day, timezone],
  );
  const todayCalls = useMemo(() => {
    if (calls.state !== 'ready') return [];
    return calls.data.flatMap(({ site, calls: list }) => list.map((entry) => ({ site, entry })));
  }, [calls]);
  const missedCalls = todayCalls.filter(({ entry }) => entry.direction === 'incoming' && entry.outcome === 'no_answer').length;
  const oicOnDuty = sites.filter((site) => staffing[site.id]?.oic).length;
  const staffingLoaded = Object.keys(staffing).length;

  function toggle(id: TileId) {
    setSelected((current) => (current === id ? null : id));
  }

  const tiles: { id: TileId; label: string; icon: ComponentType<{ className?: string }>; value: string; note: string | null; tone?: 'alert' | 'ok'; hidden?: boolean }[] = [
    {
      id: 'rounds', label: 'Checkpoints done', icon: ClipboardCheck,
      value: guardCounters ? String(guardCounters.done) : '…',
      note: totals ? `${totals.completed} round${totals.completed === 1 ? '' : 's'} finished today` : null,
      tone: 'ok',
    },
    {
      id: 'missed', label: 'Missed checkpoints', icon: ShieldAlert,
      value: guardCounters ? String(guardCounters.missed) : '…',
      note: guardCounters ? (guardCounters.missed > 0 ? 'Not yet caught up today' : 'None today') : null,
      tone: guardCounters && guardCounters.missed > 0 ? 'alert' : 'ok',
    },
    {
      id: 'sos', label: 'SOS right now', icon: Siren, hidden: !canSos,
      value: sos.state === 'ready' ? String(openSos.length) : sos.state === 'loading' ? '…' : '—',
      note: sos.state === 'ready' ? (openSos.length > 0 ? 'Needs attention' : 'None') : null,
      tone: openSos.length > 0 ? 'alert' : 'ok',
    },
    {
      id: 'oic', label: 'Officer in Charge', icon: UserRound,
      value: staffingLoaded > 0 ? `${oicOnDuty} of ${sites.length}` : '…',
      note: staffingLoaded > 0 ? (oicOnDuty === sites.length ? 'Sites have an OIC' : 'Some Sites have none') : null,
      tone: staffingLoaded > 0 && oicOnDuty < sites.length ? 'alert' : 'ok',
    },
    {
      id: 'reports', label: 'Reports today', icon: FileText,
      value: reports.state === 'ready' && day ? String(todayReports.length) : '…',
      note: reportErrors > 0 ? 'Some could not load' : 'Incidents, logbook, notify, visitors',
    },
    {
      id: 'calls', label: 'Calls today', icon: PhoneCall,
      value: calls.state === 'ready' ? String(todayCalls.length) : calls.state === 'loading' ? '…' : '—',
      note: calls.state === 'ready' ? (missedCalls > 0 ? `${missedCalls} missed` : 'None missed') : null,
      tone: missedCalls > 0 ? 'alert' : 'ok',
    },
  ];

  if (sites.length === 0) return null;

  return (
    <section aria-label="Today at a glance" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.filter((tile) => !tile.hidden).map((tile) => {
          const open = selected === tile.id;
          const Icon = tile.icon;
          return (
            <button
              aria-expanded={open}
              className={`flex min-h-28 flex-col items-start gap-1 rounded-2xl border bg-card p-4 text-left transition hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f36f0a] ${open ? 'border-[#f36f0a] ring-2 ring-[#f36f0a]/30' : ''}`}
              key={tile.id}
              onClick={() => toggle(tile.id)}
              type="button"
            >
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3.5" />{tile.label}
              </span>
              <span className={`text-3xl font-black tabular-nums ${tile.tone === 'alert' && tile.value !== '0' && tile.value !== '…' ? 'text-red-700 dark:text-red-400' : ''}`}>{tile.value}</span>
              {tile.note && <span className="text-xs text-muted-foreground">{tile.note}</span>}
              <span className="mt-auto text-[11px] font-bold text-[#e86405]">{open ? 'Hide details' : 'Show details'}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <Panel className="p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-black">{tiles.find((tile) => tile.id === selected)?.label}</h2>
            <button aria-label="Close details" className="rounded-lg p-1 text-muted-foreground hover:bg-muted" onClick={() => setSelected(null)} type="button"><X className="size-4" /></button>
          </div>
          {summaries.state === 'unavailable' && (selected === 'rounds' || selected === 'missed') && (
            <p className="mb-3 flex gap-2 text-sm text-red-700 dark:text-red-400" role="alert"><AlertTriangle className="size-4 shrink-0" />{summaries.reason}</p>
          )}
          {selected === 'rounds' && <RoundsDetail day={day} onPhotos={(photos, index) => setViewer({ photos, index })} sites={sites} timezone={timezone} />}
          {selected === 'missed' && <MissedDetail day={day} sites={sites} timezone={timezone} />}
          {selected === 'sos' && <SosDetail alerts={sos.state === 'ready' ? sos.data : []} day={day} onChanged={loadSos} timezone={timezone} unavailable={sos.state === 'unavailable' ? sos.reason : null} />}
          {selected === 'oic' && <OicDetail onPhotos={(photos, index) => setViewer({ photos, index })} sites={sites} staffing={staffing} timezone={timezone} />}
          {selected === 'reports' && <ReportsDetail errors={reportErrors} items={todayReports} onPhotos={(photos, index) => setViewer({ photos, index })} timezone={timezone} />}
          {selected === 'calls' && <CallsDetail calls={calls.state === 'ready' ? todayCalls : []} timezone={timezone} unavailable={calls.state === 'unavailable' ? calls.reason : null} />}
        </Panel>
      )}

      <PhotoViewer
        index={viewer?.index ?? null}
        onClose={() => setViewer(null)}
        onIndexChange={(index) => setViewer((current) => (current ? { ...current, index } : current))}
        photos={viewer?.photos ?? []}
      />
    </section>
  );
}
