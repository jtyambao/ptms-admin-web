'use client';

import { AlertTriangle, ClipboardList, Eye, ImageOff, Lock, PhoneCall, ShieldAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ApiRequestError } from '@/lib/authenticated-api';
import { canRespondToSos, canViewIncidents, canViewSos } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import type {
  GovernedMissedCheckpointTap,
  Incident,
  MissedCheckpointTap,
  SosAlertEntry,
  VisitorLogEntry,
  VoluntaryObservationReportEntry,
} from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Reports page (branch release/dry-run-ops) — read-only, per-Site,
// existing backend endpoints only; no new backend routes. Each widget
// loads independently (same pattern as the Dashboard page): a role that
// cannot reach one report, or a report that fails to load, never blocks
// the others. checkpoint visits/scans and a Site-scoped SOS list were
// asked for but do not exist as endpoints on the backend today — both
// are explicitly reported as "no endpoint" rather than silently omitted.
type Widget<T> =
  | { kind: 'skipped'; reason: string }
  | { kind: 'loading' }
  | { kind: 'loaded'; data: T }
  | { kind: 'error'; message: string };

function errorMessage(reason: unknown): string {
  return reason instanceof ApiRequestError ? reason.message : 'This report could not be loaded.';
}

export function SiteReportsPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;

  const [incidents, setIncidents] = useState<Widget<Incident[]>>({ kind: 'loading' });
  const [missed, setMissed] = useState<Widget<MissedCheckpointTap[]>>({ kind: 'loading' });
  const [governedMissed, setGovernedMissed] = useState<Widget<GovernedMissedCheckpointTap[]>>({ kind: 'loading' });
  const [visitorLogs, setVisitorLogs] = useState<Widget<VisitorLogEntry[]>>({ kind: 'loading' });
  const [vorReports, setVorReports] = useState<Widget<VoluntaryObservationReportEntry[]>>({ kind: 'loading' });
  const [sos, setSos] = useState<Widget<SosAlertEntry[]>>({ kind: 'loading' });
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    if (session.status !== 'authenticated') return;

    if (role && canViewIncidents(role)) {
      setIncidents({ kind: 'loading' });
      try {
        const all = await managementApi.listIncidents(session.api);
        setIncidents({ kind: 'loaded', data: all.filter((i) => i.site_id === siteId) });
      } catch (reason) { setIncidents({ kind: 'error', message: errorMessage(reason) }); }
    } else {
      setIncidents({ kind: 'skipped', reason: 'Your role does not have Incident read access.' });
    }

    setMissed({ kind: 'loading' });
    try {
      setMissed({ kind: 'loaded', data: await managementApi.listMissedCheckpoints(session.api, siteId) });
    } catch (reason) { setMissed({ kind: 'error', message: errorMessage(reason) }); }

    setGovernedMissed({ kind: 'loading' });
    try {
      setGovernedMissed({ kind: 'loaded', data: await managementApi.listGovernedMissedCheckpoints(session.api, siteId) });
    } catch (reason) { setGovernedMissed({ kind: 'error', message: errorMessage(reason) }); }

    setVisitorLogs({ kind: 'loading' });
    try {
      setVisitorLogs({ kind: 'loaded', data: await managementApi.listVisitorLogs(session.api, siteId) });
    } catch (reason) { setVisitorLogs({ kind: 'error', message: errorMessage(reason) }); }

    setVorReports({ kind: 'loading' });
    try {
      setVorReports({ kind: 'loaded', data: await managementApi.listVoluntaryObservationReports(session.api, siteId) });
    } catch (reason) { setVorReports({ kind: 'error', message: errorMessage(reason) }); }

    if (role && canViewSos(role)) {
      setSos({ kind: 'loading' });
      try {
        const all = await managementApi.listSosAlerts(session.api);
        setSos({ kind: 'loaded', data: all.filter((a) => a.site_id === siteId) });
      } catch (reason) { setSos({ kind: 'error', message: errorMessage(reason) }); }
    } else {
      setSos({ kind: 'skipped', reason: 'SOS visibility is limited to Super Admin, Organization Admin, Site Manager, and Supervisor under current production RBAC.' });
    }
  }, [role, session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Incident acknowledge/resolve + SOS acknowledge/cancel (P3, branch
  // release/dry-run-ops) — same "one shared action runner, reload the
  // one affected list" shape for both, since both actions are
  // server-side site-scoped already (IncidentsService.transition() /
  // SosService), so a 403 here means the assignment genuinely doesn't
  // cover this Site, not a UI bug to work around.
  async function runIncidentAction(id: number, action: 'acknowledge' | 'resolve') {
    setActingOn(`incident-${id}`); setActionError('');
    try {
      await (action === 'acknowledge' ? managementApi.acknowledgeIncident(session.api, id) : managementApi.resolveIncident(session.api, id));
      const all = await managementApi.listIncidents(session.api);
      setIncidents({ kind: 'loaded', data: all.filter((i) => i.site_id === siteId) });
    } catch (reason) {
      setActionError(errorMessage(reason));
    } finally { setActingOn(null); }
  }

  async function runSosAction(id: number, action: 'acknowledge' | 'cancel') {
    setActingOn(`sos-${id}`); setActionError('');
    try {
      await (action === 'acknowledge' ? managementApi.acknowledgeSos(session.api, id) : managementApi.cancelSos(session.api, id));
      const all = await managementApi.listSosAlerts(session.api);
      setSos({ kind: 'loaded', data: all.filter((a) => a.site_id === siteId) });
    } catch (reason) {
      setActionError(errorMessage(reason));
    } finally { setActingOn(null); }
  }

  return (
    <section className="mt-8 space-y-6" aria-labelledby="reports-heading">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Read-only</p>
        <h2 id="reports-heading" className="mt-1 text-xl font-black">Reports</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each report below loads independently from a real, currently-deployed endpoint.
        </p>
      </div>

      {actionError && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{actionError}</p>}

      <ReportSection title="Incidents" icon={ClipboardList} widget={incidents}>
        {(data) => data.length === 0 ? <EmptyRow text="No Incidents reported at this Site." /> : (
          <div className="divide-y">
            {data.map((incident) => (
              <div key={incident.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <p className="min-w-0 flex-1 truncate font-bold">{incident.title}</p>
                <Badge variant="outline" className="uppercase">{incident.severity}</Badge>
                <Badge variant={incident.status === 'resolved' ? 'outline' : 'secondary'} className="uppercase">{incident.status}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(incident.occurred_at).toLocaleString()}</span>
                {role && canViewIncidents(role) && incident.status === 'open' && (
                  <Button size="sm" variant="outline" disabled={actingOn === `incident-${incident.id}`} onClick={() => void runIncidentAction(incident.id, 'acknowledge')}>
                    Acknowledge
                  </Button>
                )}
                {role && canViewIncidents(role) && incident.status === 'acknowledged' && (
                  <Button size="sm" variant="outline" disabled={actingOn === `incident-${incident.id}`} onClick={() => void runIncidentAction(incident.id, 'resolve')}>
                    Resolve
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Missed Checkpoints" icon={ShieldAlert} widget={missed}>
        {(data) => data.length === 0 ? <EmptyRow text="No missed checkpoints at this Site." /> : (
          <div className="divide-y">
            {data.map((tap) => (
              <div key={tap.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <p className="min-w-0 flex-1 font-bold">{tap.checkpoint_name}</p>
                <Badge variant="outline">{tap.round_name}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(tap.missed_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Missed Checkpoints (governed / catch-up)" icon={ShieldAlert} widget={governedMissed}>
        {(data) => data.length === 0 ? <EmptyRow text="No governed missed checkpoints outside the active catch-up window." /> : (
          <div className="divide-y">
            {data.map((tap) => (
              <div key={tap.missedTapId} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <p className="min-w-0 flex-1 font-bold">{tap.checkpointName}</p>
                <Badge variant="outline" className="uppercase">{tap.catchUpStatus.replace('_', ' ')}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(tap.missedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Visitor Logs" icon={Users} widget={visitorLogs}>
        {(data) => data.length === 0 ? <EmptyRow text="No visitors logged at this Site." /> : (
          <div className="divide-y">
            {data.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <p className="min-w-0 flex-1 font-bold">{log.visitor_name}</p>
                <Badge variant="outline">{log.purpose}</Badge>
                <span className="text-xs text-muted-foreground">Host: {log.host_name}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.occurred_at).toLocaleString()}</span>
                <PhotoLink url={log.photo_view_url} />
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Voluntary Observation Reports" icon={Eye} widget={vorReports}>
        {(data) => data.length === 0 ? <EmptyRow text="No voluntary observation reports at this Site." /> : (
          <div className="divide-y">
            {data.map((report) => (
              <div key={report.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <p className="min-w-0 flex-1 truncate">{report.remarks ?? <span className="italic text-muted-foreground">No remarks</span>}</p>
                <span className="text-xs text-muted-foreground">{new Date(report.occurred_at).toLocaleString()}</span>
                <PhotoLink url={report.photo_view_url} />
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="SOS Alerts" icon={PhoneCall} widget={sos}>
        {(data) => data.length === 0 ? <EmptyRow text="No SOS alerts at this Site." /> : (
          <div className="divide-y">
            {data.map((alert) => (
              <div key={alert.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <p className="min-w-0 flex-1 font-bold">{alert.personnel_name ?? 'Unknown Personnel'}</p>
                <Badge variant={alert.status === 'resolved' || alert.status === 'cancelled' ? 'outline' : 'secondary'} className="uppercase">{alert.status}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(alert.triggered_at).toLocaleString()}</span>
                {role && canRespondToSos(role) && alert.status === 'active' && (
                  <Button size="sm" variant="outline" disabled={actingOn === `sos-${alert.id}`} onClick={() => void runSosAction(alert.id, 'acknowledge')}>
                    Acknowledge
                  </Button>
                )}
                {role && canRespondToSos(role) && (alert.status === 'active' || alert.status === 'acknowledged') && (
                  <Button size="sm" variant="outline" disabled={actingOn === `sos-${alert.id}`} onClick={() => void runSosAction(alert.id, 'cancel')}>
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        Checkpoint visit/scan history has no listing endpoint on the current backend yet — not shown here.
      </div>
    </section>
  );
}

function ReportSection<T>({
  title, icon: Icon, widget, children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  widget: Widget<T>;
  children: (data: T) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b p-4">
        <Icon className="size-4 text-[#f36f0a]" />
        <h3 className="font-black">{title}</h3>
      </div>
      <div className="p-4">
        {widget.kind === 'skipped' && (
          <Empty className="rounded-xl border border-dashed py-6">
            <EmptyMedia variant="icon"><Lock className="size-4" /></EmptyMedia>
            <EmptyContent>
              <EmptyTitle>Unavailable for this role</EmptyTitle>
              <EmptyDescription>{widget.reason}</EmptyDescription>
            </EmptyContent>
          </Empty>
        )}
        {widget.kind === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
        {widget.kind === 'error' && (
          <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
            <AlertTriangle className="size-4 shrink-0" />{widget.message}
          </p>
        )}
        {widget.kind === 'loaded' && children(widget.data)}
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function PhotoLink({ url }: { url: string | null }) {
  if (!url) {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><ImageOff className="size-3" />No photo</span>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#e86405] hover:underline">
      View photo
    </a>
  );
}
