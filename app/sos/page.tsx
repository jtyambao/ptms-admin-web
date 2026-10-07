'use client';

import { AlertTriangle, BadgeCheck, CheckCircle2, MapPin, Phone, PhoneCall, ShieldAlert, Siren } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError } from '@/lib/authenticated-api';
import { callsFeatureEnabled } from '@/lib/calls-feature';
import { canRespondToSos, canViewSos } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import { formatElapsed, mapsUrl, sosOutcome, splitSosAlerts, trackLocationChange } from '@/lib/sos-console';
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

type Action = { kind: 'resolve' | 'cancel'; alert: SosAlertEntry };

function errorMessage(reason: unknown): string {
  return reason instanceof ApiRequestError ? reason.message : 'The action could not be completed.';
}

function SosConsole() {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canView = !!role && canViewSos(role);
  const canRespond = !!role && canRespondToSos(role);
  const callsOn = callsFeatureEnabled();

  const [alerts, setAlerts] = useState<SosAlertEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
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
      setError((prev) => (prev.startsWith('Could not refresh') ? '' : prev));
    } catch {
      setError((prev) => prev || 'Could not refresh SOS alerts - retrying.');
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

  async function acknowledge(alert: SosAlertEntry) {
    setActingOn(alert.id); setError(''); setSuccess('');
    try {
      await managementApi.acknowledgeSos(session.api, alert.id);
      setSuccess('Acknowledged - the guards at that Site can see someone is responding.');
      await poll();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setActingOn(null); }
  }

  function openAction(kind: Action['kind'], alert: SosAlertEntry) {
    setNote(''); setError(''); setAction({ kind, alert });
  }

  async function submitAction(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setActingOn(action.alert.id); setError(''); setSuccess('');
    try {
      if (action.kind === 'resolve') await managementApi.resolveSos(session.api, action.alert.id, note.trim() || undefined);
      else await managementApi.cancelSos(session.api, action.alert.id, note.trim() || undefined);
      setSuccess(action.kind === 'resolve' ? 'Marked resolved.' : 'Cancelled as a false alarm.');
      setAction(null);
      await poll();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setActingOn(null); }
  }

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
          {open.map((alert) => {
            const isNew = alert.status === 'active';
            const loc = locations[alert.id];
            const hasLocation = alert.latitude !== null && alert.longitude !== null;
            return (
              <div key={alert.id} className={`rounded-2xl border-2 p-5 ${isNew ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Siren className={`size-6 ${isNew ? 'animate-pulse text-red-600' : 'text-amber-600'}`} />
                  <p className="text-lg font-black">{alert.site_name ?? 'Unknown Site'}</p>
                  <Badge variant={isNew ? 'destructive' : 'secondary'} className="uppercase">{isNew ? 'New - needs a response' : 'Responding'}</Badge>
                  <p className="ml-auto text-2xl font-black tabular-nums">{formatElapsed(alert.triggered_at, now)}</p>
                </div>
                <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline font-bold">Guard: </dt><dd className="inline">{alert.personnel_name ?? 'The Site’s guard device (no individual named)'}</dd></div>
                  <div><dt className="inline font-bold">Triggered: </dt><dd className="inline">{new Date(alert.triggered_at).toLocaleString()}</dd></div>
                  {alert.acknowledged_at && (
                    <div><dt className="inline font-bold">Acknowledged: </dt><dd className="inline">{new Date(alert.acknowledged_at).toLocaleTimeString()}{alert.acknowledged_by_name ? ` by ${alert.acknowledged_by_name}` : ''}</dd></div>
                  )}
                  <div>
                    <dt className="inline font-bold">Location: </dt>
                    <dd className="inline">
                      {hasLocation ? (
                        <>
                          <a className="inline-flex items-center gap-1 font-bold underline" href={mapsUrl(alert.latitude!, alert.longitude!)} target="_blank" rel="noreferrer">
                            <MapPin className="size-3" />Open map
                          </a>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {alert.latitude!.toFixed(5)}, {alert.longitude!.toFixed(5)}
                            {loc && now - loc.changedAt > 2000 ? ` · last moved ${formatElapsed(new Date(loc.changedAt).toISOString(), now)} ago` : ' · just updated'}
                          </span>
                        </>
                      ) : <span className="text-muted-foreground">Waiting for the guard&apos;s GPS…</span>}
                    </dd>
                  </div>
                </dl>
                {canRespond && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isNew ? (
                      <Button size="lg" className="bg-red-600 text-white hover:bg-red-700" disabled={actingOn === alert.id} onClick={() => void acknowledge(alert)}>
                        <Siren />Acknowledge - I&apos;m responding
                      </Button>
                    ) : (
                      <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={actingOn === alert.id} onClick={() => openAction('resolve', alert)}>
                        <CheckCircle2 />Resolve
                      </Button>
                    )}
                    {callsOn && alert.site_id !== null && (
                      <Link
                        href={`/calls?siteId=${alert.site_id}`}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-5 text-sm font-medium hover:bg-muted"
                      >
                        <PhoneCall className="size-4" />Call the Site
                      </Link>
                    )}
                    {isNew && (
                      <Button size="lg" variant="outline" disabled={actingOn === alert.id} onClick={() => openAction('resolve', alert)}>
                        Resolve (already handled)
                      </Button>
                    )}
                    <Button size="lg" variant="outline" disabled={actingOn === alert.id} onClick={() => openAction('cancel', alert)}>
                      False alarm - cancel
                    </Button>
                  </div>
                )}
                {!callsOn && (
                  <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" />Phone the Site directly - in-app calls are not enabled yet.</p>
                )}
              </div>
            );
          })}
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

      <Dialog open={!!action} onOpenChange={(openState) => { if (!openState) setAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.kind === 'resolve' ? 'Resolve this SOS' : 'Cancel as a false alarm'}</DialogTitle>
            <DialogDescription>
              {action?.kind === 'resolve'
                ? 'Close it out as a real emergency that has been handled. Say what happened.'
                : 'Use this when there was no emergency. It is kept in the history as cancelled.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAction}>
            <label htmlFor="sos-note" className="grid gap-2 font-bold">
              {action?.kind === 'resolve' ? 'What happened / what was done' : 'Reason'} <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea id="sos-note" rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700 dark:text-red-400">{error}</p>}
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setAction(null)}>Back</Button>
              <Button type="submit" disabled={actingOn !== null} className={action?.kind === 'resolve' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}>
                {action?.kind === 'resolve' ? 'Mark resolved' : 'Cancel the alert'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
