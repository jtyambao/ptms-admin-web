'use client';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Lock,
  RefreshCw,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ApiRequestError } from '@/lib/authenticated-api';
import { canViewIncidents, canViewSitesOverview, isToday } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import { canViewPersonnel } from '@/lib/personnel-management';
import type { Incident, Personnel, Site } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// P1 Dashboard (2026-09-26) — replaces the prior page, which depended
// entirely on `GET /management/dashboard/summary`. That endpoint is not
// deployed on `origin/main` or current production (see ptms-api.ts's
// DashboardSiteRow comment and BACKEND_GAPS.md's "P1 Dashboard" section).
// This page instead sources three widgets independently from real,
// currently-deployed endpoints (Sites, Personnel, Incidents), each with its
// own loading/empty/unavailable/error state — a role lacking access to one
// widget, or a network failure on one, never blocks the others. No metric
// here is fabricated: an unavailable value is shown as unavailable, never
// as zero. "Today" is the viewer's own local calendar day (client-computed
// from `occurred_at`), not a per-Site-timezone boundary the way a real
// backend summary endpoint would compute it — stated as such in the UI.
type Widget<T> =
  | { kind: 'skipped' }
  | { kind: 'loading' }
  | { kind: 'loaded'; data: T }
  | { kind: 'error'; message: string };

function errorMessage(reason: unknown): string {
  return reason instanceof ApiRequestError ? reason.message : 'This widget could not be loaded.';
}

export default function DashboardPage() {
  const session = useSession();
  const role = session.user?.role ?? null;

  const [sites, setSites] = useState<Widget<Site[]>>({ kind: 'loading' });
  const [personnel, setPersonnel] = useState<Widget<Personnel[]>>({ kind: 'loading' });
  const [incidents, setIncidents] = useState<Widget<Incident[]>>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const loadSites = useCallback(async () => {
    if (!role || !canViewSitesOverview(role)) {
      setSites({ kind: 'skipped' });
      return;
    }
    setSites({ kind: 'loading' });
    try {
      setSites({ kind: 'loaded', data: await managementApi.listSites(session.api) });
    } catch (reason) {
      setSites({ kind: 'error', message: errorMessage(reason) });
    }
  }, [role, session.api]);

  const loadPersonnel = useCallback(async () => {
    if (!role || !canViewPersonnel(role)) {
      setPersonnel({ kind: 'skipped' });
      return;
    }
    setPersonnel({ kind: 'loading' });
    try {
      setPersonnel({ kind: 'loaded', data: await managementApi.listPersonnel(session.api) });
    } catch (reason) {
      setPersonnel({ kind: 'error', message: errorMessage(reason) });
    }
  }, [role, session.api]);

  const loadIncidents = useCallback(async () => {
    if (!role || !canViewIncidents(role)) {
      setIncidents({ kind: 'skipped' });
      return;
    }
    setIncidents({ kind: 'loading' });
    try {
      setIncidents({ kind: 'loaded', data: await managementApi.listIncidents(session.api) });
    } catch (reason) {
      setIncidents({ kind: 'error', message: errorMessage(reason) });
    }
  }, [role, session.api]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadSites(), loadPersonnel(), loadIncidents()]);
    setRefreshing(false);
  }, [loadSites, loadPersonnel, loadIncidents]);

  useEffect(() => {
    if (session.status !== 'authenticated') return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [session.status, refresh]);

  const siteNameFor = (siteId: number | null): string | null => {
    if (siteId === null) return null;
    if (sites.kind !== 'loaded') return null;
    return sites.data.find((s) => s.id === siteId)?.name ?? null;
  };

  return (
    <ProtectedPortal>
      <PortalShell active="dashboard">
        <div className="mx-auto max-w-6xl p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#e86405]">Live operations</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Dashboard</h1>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Each card below loads independently from a real, currently-deployed endpoint. A card
            unavailable for your role, or a card that fails to load, does not affect the others.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <SitesCard widget={sites} />
            <PersonnelCard widget={personnel} />
            <IncidentsCard widget={incidents} siteNameFor={siteNameFor} />
          </div>
        </div>
      </PortalShell>
    </ProtectedPortal>
  );
}

function CardShell({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-4 text-[#f36f0a]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Skipped({ reason }: { reason: string }) {
  return (
    <Empty className="rounded-xl border border-dashed py-6">
      <EmptyMedia variant="icon">
        <Lock className="size-4" />
      </EmptyMedia>
      <EmptyContent>
        <EmptyTitle>Unavailable for this role</EmptyTitle>
        <EmptyDescription>{reason}</EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
      <AlertTriangle className="size-4 shrink-0" />
      {message}
    </p>
  );
}

function Loading() {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}

function SitesCard({ widget }: { widget: Widget<Site[]> }) {
  return (
    <CardShell icon={Building2} title="Accessible Sites">
      {widget.kind === 'skipped' && (
        <Skipped reason="Your role does not have a Site listing endpoint under the current production access model." />
      )}
      {widget.kind === 'loading' && <Loading />}
      {widget.kind === 'error' && <Failed message={widget.message} />}
      {widget.kind === 'loaded' && (
        widget.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Sites are assigned to your account yet.</p>
        ) : (
          <div className="grid gap-3">
            <p className="text-3xl font-black">{widget.data.length}</p>
            <div className="grid gap-1.5">
              {widget.data.slice(0, 6).map((site) => (
                <Link
                  key={site.id}
                  href={`/sites/${site.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="truncate font-bold">{site.name}</span>
                  <Badge variant={site.status === 'active' ? 'secondary' : 'outline'}>{site.status}</Badge>
                </Link>
              ))}
            </div>
            {widget.data.length > 6 && (
              <Link href="/sites" className="text-xs font-bold text-[#e86405] hover:underline">
                View all {widget.data.length} Sites →
              </Link>
            )}
            <p className="text-xs text-muted-foreground">
              Per-Site patrol status, staffing, and checkpoint detail are on each Site&apos;s own page —
              showing them here for every Site would require one extra request per Site.
            </p>
          </div>
        )
      )}
    </CardShell>
  );
}

function PersonnelCard({ widget }: { widget: Widget<Personnel[]> }) {
  return (
    <CardShell icon={Users} title="Personnel">
      {widget.kind === 'skipped' && (
        <Skipped reason="Your role does not have a Personnel listing endpoint under the current production access model." />
      )}
      {widget.kind === 'loading' && <Loading />}
      {widget.kind === 'error' && <Failed message={widget.message} />}
      {widget.kind === 'loaded' && (
        widget.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Personnel records visible to your role yet.</p>
        ) : (
          (() => {
            const active = widget.data.filter((p) => p.status === 'active').length;
            return (
              <div className="grid gap-1">
                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{active}</p>
                <p className="text-sm text-muted-foreground">
                  active of {widget.data.length} total visible to your role
                </p>
              </div>
            );
          })()
        )
      )}
    </CardShell>
  );
}

function IncidentsCard({
  widget,
  siteNameFor,
}: {
  widget: Widget<Incident[]>;
  siteNameFor: (siteId: number | null) => string | null;
}) {
  return (
    <CardShell icon={ClipboardList} title="Incidents">
      {widget.kind === 'skipped' && (
        <Skipped reason="Incident visibility is limited to Super Admin, Organization Admin, Site Manager, and Supervisor under current production RBAC." />
      )}
      {widget.kind === 'loading' && <Loading />}
      {widget.kind === 'error' && <Failed message={widget.message} />}
      {widget.kind === 'loaded' && (
        widget.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Incidents reported yet.</p>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-baseline gap-4">
              <div>
                <p className={`text-3xl font-black ${widget.data.some((i) => isToday(i.occurred_at) && i.status !== 'resolved') ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                  {widget.data.filter((i) => isToday(i.occurred_at)).length}
                </p>
                <p className="text-xs text-muted-foreground">today (your local time)</p>
              </div>
              <div>
                <p className="text-lg font-bold text-muted-foreground">{widget.data.length}</p>
                <p className="text-xs text-muted-foreground">total visible to your role</p>
              </div>
            </div>
            <div className="grid gap-1.5">
              {widget.data.slice(0, 5).map((incident) => (
                <div key={incident.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-bold">{incident.title}</p>
                    <Badge variant="outline" className="uppercase">{incident.severity}</Badge>
                    <Badge variant={incident.status === 'resolved' ? 'outline' : 'secondary'} className="uppercase">
                      {incident.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {siteNameFor(incident.site_id) ?? (incident.site_id ? `Site #${incident.site_id}` : 'No Site on record')}
                    {' · '}
                    {new Date(incident.occurred_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </CardShell>
  );
}
