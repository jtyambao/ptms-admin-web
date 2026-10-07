'use client';

import { AlertTriangle, BadgeCheck, CheckCircle2, Phone, PhoneCall, ShieldAlert, Siren } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SosActionDialog, SosAlertCard, useSosActions } from '@/components/sos-alert-card';
import { callsFeatureEnabled } from '@/lib/calls-feature';
import { canRespondToSos, canViewSos } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import { callSenderUrl, canCallSosSender, formatElapsed, sosOutcome, splitSosAlerts, trackLocationChange } from '@/lib/sos-console';
import type { SosAlertEntry } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// SOS receiver console (user-authorized 2026-10-07). The global
// IncomingSosBanner (components/incoming-sos-banner.tsx) is what makes
// the loud, repeating alarm - it plays until every alert is acknowledged
// and is visible on every page. This page is where a responder HANDLES
// the emergency: details, Acknowledge -> Responding -> Resolve (with a
// note of what happened) or Cancel (false alarm), a call-back to the
// Site, and the history with outcomes.
//
// What the backend does NOT provide, so is not shown: a guard selfie
// (an SOS carries none), and push of location - the guard's phone
// patches latitude/longitude onto the same alert and this console
// re-reads the list every few seconds, so location "updates" are polled.
// "Missed SOS" and resolve-callback are the Guard device's own log
// (Guard Site Session), not something a staff console can see.
const POLL_MS = 5000;
const HISTORY_PAGE = 20;

function SosConsole() {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canView = !!role && canViewSos(role);
  const canRespond = !!role && canRespondToSos(role);
  const callsOn = callsFeatureEnabled();

  const [alerts, setAlerts] = useState<SosAlertEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE);
  const [locations, setLocations] = useState<Record<number, { key: string; changedAt: number }>>({});
  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  const poll = useCallback(async () => {
    if (session.status !== 'authenticated' || !canView) return;
    try {
      const all = await managementApi.listSosAlerts(session.api);
      setAlerts(all);
      setLocations(trackLocationChange(locationsRef.current, all));
      setPollError('');
    } catch {
      setPollError('Could not refresh SOS alerts - retrying.');
    } finally { setLoading(false); }
  }, [session.api, session.status, canView]);

  useEffect(() => {
    if (!canView) return;
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [canView, poll]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const actions = useSosActions(session.api, poll);
  const { actingOn, success } = actions;
  const error = actions.error || pollError;

  if (!canView) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5">
        <h2 className="text-xl font-black">SOS</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />SOS alerts are not available for this role.
        </p>
      </section>
    );
  }

  const { open, history } = splitSosAlerts(alerts);

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Emergency response</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-black"><Siren className="size-5 text-red-600" />SOS</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An alarm sounds on every page until each new SOS is acknowledged. Handle it here.
        </p>
      </div>

      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
      {success && <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><BadgeCheck className="size-4 shrink-0" />{success}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : open.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
          <p className="mt-3 font-bold">No active SOS</p>
          <p className="mt-1 text-sm text-muted-foreground">New alerts appear here and sound the alarm immediately.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {open.map((alert) => (
            <SosAlertCard
              key={alert.id}
              alert={alert}
              now={now}
              location={locations[alert.id]}
              canRespond={canRespond}
              actingOn={actingOn}
              onAcknowledge={(a) => void actions.acknowledge(a)}
              onOpenAction={actions.openAction}
              callSlot={callsOn && canCallSosSender(alert) ? (
                <Link
                  href={callSenderUrl(alert)}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-6 text-base font-bold text-white hover:bg-blue-700"
                >
                  <PhoneCall className="size-5" />Call sender now
                </Link>
              ) : callsOn && alert.site_id !== null ? (
                <Link
                  href={`/calls?siteId=${alert.site_id}`}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-5 text-sm font-medium hover:bg-muted"
                  title="This alert does not say which phone sent it, so the whole Site is called."
                >
                  <PhoneCall className="size-4" />Call the Site
                </Link>
              ) : null}
            />
          ))}
          {!callsOn && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" />Phone the Site directly - in-app calls are not enabled yet.</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        <p className="border-b p-4 font-black">History</p>
        {history.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No closed SOS alerts yet.</p>
        ) : (
          <div className="divide-y">
            {history.slice(0, historyShown).map((alert) => {
              const outcome = sosOutcome(alert);
              return (
                <div key={alert.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                  <Badge variant={outcome.tone === 'good' ? 'secondary' : 'outline'}>{outcome.label}</Badge>
                  <span className="font-bold">{alert.site_name ?? 'Unknown Site'}</span>
                  <span className="text-muted-foreground">{new Date(alert.triggered_at).toLocaleString()}</span>
                  {outcome.responseTime && <span className="text-xs text-muted-foreground">responded in {outcome.responseTime}</span>}
                  {outcome.detail && <span className="w-full text-xs text-muted-foreground">{outcome.detail}</span>}
                </div>
              );
            })}
          </div>
        )}
        {history.length > historyShown && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setHistoryShown((n) => n + HISTORY_PAGE)}>Show more</Button>
          </div>
        )}
      </div>

      <SosActionDialog actions={actions} />
    </section>
  );
}

export default function SosPage() {
  return (
    <ProtectedPortal>
      <PortalShell active="sos">
        <SosConsole />
      </PortalShell>
    </ProtectedPortal>
  );
}
