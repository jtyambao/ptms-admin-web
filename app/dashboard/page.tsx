'use client';
import {
  AlertTriangle,
  Building2,
  Clock,
  Lock,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
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
import { canRespondToSos, canViewIncidents, canViewSitesOverview, deviceOnlineStatus, isToday } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import type { MissedCheckpointTap, RoundStatus, Site, SiteDevice, StaffingStatus, UserRole } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// P2 Dashboard redesign (branch feat/admin-oic-management) — replaces
// the P1 Dashboard's abstract org-wide counts (Sites/Personnel/Incidents
// cards) with one big, plain-language status card PER accessible Site —
// patrol status/next due, missed today, active SOS, incidents today,
// current OIC, and device presence — matching what an admin actually
// needs to see "at a glance" for the Site(s) they run, not a directory.
// Each metric loads independently per Site (same "one failing widget
// never blocks the others" convention as the Reports tab); a metric a
// role can't see shows a plain "not available to your role" note
// instead of a blocking error.
type Widget<T> =
  | { kind: 'skipped'; reason: string }
  | { kind: 'loading' }
  | { kind: 'loaded'; data: T }
  | { kind: 'error'; message: string };

function errorMessage(reason: unknown): string {
  return reason instanceof ApiRequestError ? reason.message : 'This could not be loaded.';
}

export default function DashboardPage() {
  const session = useSession();
  const role = session.user?.role ?? null;

  const [sites, setSites] = useState<Widget<Site[]>>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!role || !canViewSitesOverview(role)) {
      setSites({ kind: 'skipped', reason: 'Your role does not have a Site listing endpoint under the current production access model.' });
      return;
    }
    setSites({ kind: 'loading' });
    try {
      setSites({ kind: 'loaded', data: await managementApi.listSites(session.api) });
    } catch (reason) {
      setSites({ kind: 'error', message: errorMessage(reason) });
    }
  }, [role, session.api]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (session.status !== 'authenticated') return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

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

          <div className="mt-6 space-y-5">
            {sites.kind === 'skipped' && <SkippedCard reason={sites.reason} />}
            {sites.kind === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
            {sites.kind === 'error' && <Failed message={sites.message} />}
            {sites.kind === 'loaded' && sites.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No Sites are assigned to your account yet.</p>
            )}
            {sites.kind === 'loaded' && sites.data.map((site) => (
              <SiteStatusCard key={`${site.id}-${refreshKey}`} site={site} role={role} />
            ))}
          </div>
        </div>
      </PortalShell>
    </ProtectedPortal>
  );
}

function SkippedCard({ reason }: { reason: string }) {
  return (
    <Empty className="rounded-2xl border border-dashed py-8">
      <EmptyMedia variant="icon"><Lock className="size-4" /></EmptyMedia>
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

function SiteStatusCard({ site, role }: { site: Site; role: UserRole | null }) {
  const session = useSession();

  const [staffing, setStaffing] = useState<Widget<StaffingStatus>>({ kind: 'loading' });
  const [roundStatus, setRoundStatus] = useState<Widget<RoundStatus>>({ kind: 'loading' });
  const [missed, setMissed] = useState<Widget<MissedCheckpointTap[]>>({ kind: 'loading' });
  const [devices, setDevices] = useState<Widget<SiteDevice[]>>({ kind: 'loading' });
  const [incidentsToday, setIncidentsToday] = useState<Widget<number>>({ kind: 'loading' });
  const [activeSos, setActiveSos] = useState<Widget<number>>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    const siteId = site.id;

    managementApi.getStaffing(session.api, siteId)
      .then((data) => { if (active) setStaffing({ kind: 'loaded', data }); })
      .catch((reason) => { if (active) setStaffing({ kind: 'error', message: errorMessage(reason) }); });

    managementApi.getRoundStatus(session.api, siteId)
      .then((data) => { if (active) setRoundStatus({ kind: 'loaded', data }); })
      .catch((reason) => { if (active) setRoundStatus({ kind: 'error', message: errorMessage(reason) }); });

    managementApi.listMissedCheckpoints(session.api, siteId)
      .then((data) => { if (active) setMissed({ kind: 'loaded', data }); })
      .catch((reason) => { if (active) setMissed({ kind: 'error', message: errorMessage(reason) }); });

    managementApi.listDevices(session.api, siteId)
      .then((data) => { if (active) setDevices({ kind: 'loaded', data }); })
      .catch((reason) => { if (active) setDevices({ kind: 'error', message: errorMessage(reason) }); });

    if (role && canViewIncidents(role)) {
      managementApi.listIncidents(session.api)
        .then((data) => { if (active) setIncidentsToday({ kind: 'loaded', data: data.filter((i) => i.site_id === siteId && isToday(i.occurred_at)).length }); })
        .catch((reason) => { if (active) setIncidentsToday({ kind: 'error', message: errorMessage(reason) }); });
    } else {
      setIncidentsToday({ kind: 'skipped', reason: 'Not available to your role.' });
    }

    if (role && canRespondToSos(role)) {
      managementApi.listSosAlerts(session.api)
        .then((data) => { if (active) setActiveSos({ kind: 'loaded', data: data.filter((a) => a.site_id === siteId && (a.status === 'active' || a.status === 'acknowledged')).length }); })
        .catch((reason) => { if (active) setActiveSos({ kind: 'error', message: errorMessage(reason) }); });
    } else {
      setActiveSos({ kind: 'skipped', reason: 'Not available to your role.' });
    }

    return () => { active = false; };
  }, [session.api, site.id, role]);

  const activeDevices = devices.kind === 'loaded' ? devices.data.filter((d) => d.is_active) : [];
  const mostRecentDeviceActivity = activeDevices
    .map((d) => d.last_seen_at)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1) ?? null;
  const onlineDeviceCount = activeDevices.filter((d) => deviceOnlineStatus(d.last_seen_at).online).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-[#f36f0a]" />
            <Link href={`/sites/${site.id}`} className="hover:underline">{site.name}</Link>
          </CardTitle>
          <Badge variant={site.status === 'active' ? 'secondary' : 'outline'}>{site.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Tile
            icon={ShieldCheck}
            label="Patrol"
            value={site.patrol_operations_active ? 'Active' : 'Inactive'}
            valueClassName={site.patrol_operations_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}
            detail={
              roundStatus.kind === 'loaded'
                ? roundStatus.data.nextDueAt
                  ? `Next due ${new Date(roundStatus.data.nextDueAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                  : 'No round scheduled'
                : roundStatus.kind === 'loading' ? 'Loading…' : null
            }
          />
          <Tile
            icon={ShieldAlert}
            label="Missed today"
            value={missed.kind === 'loaded' ? String(missed.data.filter((m) => isToday(m.missed_at)).length) : missed.kind === 'loading' ? '…' : '—'}
            valueClassName={missed.kind === 'loaded' && missed.data.some((m) => isToday(m.missed_at)) ? 'text-amber-700 dark:text-amber-400' : undefined}
            error={missed.kind === 'error' ? missed.message : undefined}
          />
          <Tile
            icon={PhoneCall}
            label="Active SOS"
            value={activeSos.kind === 'loaded' ? String(activeSos.data) : activeSos.kind === 'skipped' ? '—' : activeSos.kind === 'loading' ? '…' : '—'}
            valueClassName={activeSos.kind === 'loaded' && activeSos.data > 0 ? 'text-red-700 dark:text-red-400' : undefined}
            skipped={activeSos.kind === 'skipped' ? activeSos.reason : undefined}
            error={activeSos.kind === 'error' ? activeSos.message : undefined}
          />
          <Tile
            icon={AlertTriangle}
            label="Incidents today"
            value={incidentsToday.kind === 'loaded' ? String(incidentsToday.data) : incidentsToday.kind === 'skipped' ? '—' : incidentsToday.kind === 'loading' ? '…' : '—'}
            valueClassName={incidentsToday.kind === 'loaded' && incidentsToday.data > 0 ? 'text-amber-700 dark:text-amber-400' : undefined}
            skipped={incidentsToday.kind === 'skipped' ? incidentsToday.reason : undefined}
            error={incidentsToday.kind === 'error' ? incidentsToday.message : undefined}
          />
          <Tile
            icon={UserRound}
            label="On duty (OIC)"
            value={staffing.kind === 'loaded' ? (staffing.data.oic?.full_name ?? 'None assigned') : staffing.kind === 'loading' ? '…' : '—'}
            error={staffing.kind === 'error' ? staffing.message : undefined}
          />
          <Tile
            icon={Smartphone}
            label="Devices"
            value={devices.kind === 'loaded' ? `${onlineDeviceCount}/${activeDevices.length} online` : devices.kind === 'loading' ? '…' : '—'}
            valueClassName={devices.kind === 'loaded' && onlineDeviceCount > 0 ? 'text-emerald-700 dark:text-emerald-400' : undefined}
            detail={devices.kind === 'loaded' ? deviceOnlineStatus(mostRecentDeviceActivity).label : undefined}
            error={devices.kind === 'error' ? devices.message : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ icon: Icon, label, value, detail, valueClassName, skipped, error }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string | null;
  valueClassName?: string;
  skipped?: string;
  error?: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      {skipped ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" />{skipped}</p>
      ) : error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-700 dark:text-red-400"><AlertTriangle className="size-3" />{error}</p>
      ) : (
        <>
          <p className={`mt-1 truncate text-xl font-black ${valueClassName ?? ''}`}>{value}</p>
          {detail && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3 shrink-0" />{detail}</p>}
        </>
      )}
    </div>
  );
}
