'use client';

import { PhoneCall, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/authenticated-api';
import { callsFeatureEnabled } from '@/lib/calls-feature';
import { canRespondToSos } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import { callSenderUrl, canCallSosSender } from '@/lib/sos-console';
import type { SosAlertEntry } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';
import { describeSosSender, useSosSenderInfo } from '@/lib/sos-sender-info';

// Incoming SOS banner (P3(d), branch release/dry-run-ops) — global, lives
// in PortalShell so it's visible from any authenticated page, not just the
// Reports tab of the Site the alert happens to be at. Polls the same
// GET /sos-alerts findAll() the Reports page uses: already Site-scoped
// server-side for admin/site_admin (P3(a)), org-wide for
// super_admin/org_admin/site_manager/supervisor (matches
// canRespondToSos exactly — see lib/dashboard.ts).
//
// Sound uses a synthesized WebAudio beep (no bundled audio asset to keep
// track of) and only plays while at least one alert is still 'active'
// (unacknowledged) — acknowledging silences it immediately even if the
// banner itself stays up for a 'acknowledged'-but-not-yet-cancelled alert.
// Autoplay policies can block the AudioContext until a user gesture
// happens anywhere on the page; that first gesture (a click) resumes it,
// and a visible "Enable sound" fallback covers a user who never happens
// to click anything else first.
const POLL_MS = 5000;

function errorMessage(reason: unknown): string {
  return reason instanceof ApiRequestError ? reason.message : 'The action could not be completed.';
}

export function IncomingSosBanner() {
  const session = useSession();
  const role = session.user?.role ?? null;
  const enabled = session.status === 'authenticated' && !!role && canRespondToSos(role);

  const [alerts, setAlerts] = useState<SosAlertEntry[]>([]);
  const senderInfo = useSosSenderInfo(session.api, alerts);
  const [actingOn, setActingOn] = useState<number | null>(null);
  // Inline "Resolve" for an SOS someone is already responding to.
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [error, setError] = useState('');
  const [soundBlocked, setSoundBlocked] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const all = await managementApi.listSosAlerts(session.api);
      // Only SOS alerts nobody has responded to yet. Once someone presses
      // "I'm responding" the banner goes away; calling back and resolving
      // continue on the SOS page.
      setAlerts(all.filter((a) => a.status === 'active'));
    } catch {
      // A poll failure (network blip, token refresh in flight) is silent —
      // the next tick tries again; this banner must never itself be the
      // thing that breaks the page it floats over.
    }
  }, [session.api]);

  useEffect(() => {
    if (!enabled) { setAlerts([]); return; }
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, poll]);

  const hasActive = alerts.some((a) => a.status === 'active');

  const stopBeep = useCallback(() => {
    if (beepTimerRef.current !== null) {
      window.clearInterval(beepTimerRef.current);
      beepTimerRef.current = null;
    }
  }, []);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextCtor();
    return audioCtxRef.current;
  }, []);

  const playBeep = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
    }
    if (ctx.state !== 'running') { setSoundBlocked(true); return; }
    setSoundBlocked(false);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  }, [ensureAudioContext]);

  useEffect(() => {
    if (!hasActive) { stopBeep(); return; }
    playBeep();
    beepTimerRef.current = window.setInterval(playBeep, 1500);
    return stopBeep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive]);

  useEffect(() => stopBeep, [stopBeep]);

  // A browser tab in the background can't beep loudly enough to be missed
  // - flash the tab title too, so a dispatcher working in another tab sees it.
  useEffect(() => {
    if (!hasActive) return;
    const original = document.title;
    let on = false;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? 'SOS - ACTION NEEDED' : original;
    }, 1000);
    return () => { window.clearInterval(timer); document.title = original; };
  }, [hasActive]);

  function enableSound() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    void ctx.resume().then(() => { setSoundBlocked(false); if (hasActive) playBeep(); }).catch(() => setSoundBlocked(true));
  }

  async function respond(id: number, action: 'acknowledge' | 'cancel') {
    setActingOn(id); setError('');
    try {
      await (action === 'acknowledge' ? managementApi.acknowledgeSos(session.api, id) : managementApi.cancelSos(session.api, id));
      await poll();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally { setActingOn(null); }
  }

  async function resolve(id: number) {
    setActingOn(id); setError('');
    try {
      await managementApi.resolveSos(session.api, id, resolveNote.trim() || undefined);
      setResolvingId(null); setResolveNote('');
      await poll();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally { setActingOn(null); }
  }

  if (!enabled || alerts.length === 0) return null;

  // On the Calls page the SOS card there owns the call button (it shows
  // "On a call" while connected), so the banner never offers a second dial.
  const onCallsPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/calls');

  // Red while any SOS still needs a response; calmer orange once every open
  // SOS has someone responding (it stays until Resolved or False alarm).
  return (
    <div className={`max-h-[45vh] space-y-2 overflow-y-auto px-4 py-2 text-white shadow-lg sm:px-8 sm:py-3 ${hasActive ? 'bg-red-600' : 'bg-orange-600'}`} role="alert">
      <div className="flex flex-wrap items-center gap-2">
        <PhoneCall className={`size-5 shrink-0 ${hasActive ? 'animate-pulse' : ''}`} />
        <p className="font-black uppercase tracking-wide">
          {alerts.length === 1 ? 'SOS alert' : `${alerts.length} SOS alerts`}
        </p>
        <Link href="/sos" className="ml-auto rounded-md bg-white/20 px-3 py-1 text-sm font-bold hover:bg-white/30">
          Open SOS page
        </Link>
        {soundBlocked && hasActive && (
          <Button size="sm" variant="secondary" className="gap-1" onClick={enableSound}>
            <VolumeX className="size-4" />Turn on alarm sound
          </Button>
        )}
        {!soundBlocked && hasActive && <Volume2 className="size-4 shrink-0" aria-hidden="true" />}
      </div>
      {error && <p className="text-sm font-bold">{error}</p>}
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm">
            <span className="font-bold">{alert.site_name ?? 'Unknown Site'}</span>
            <span>{describeSosSender(alert, senderInfo[alert.id])}</span>
            <span className="text-white/80">{new Date(alert.triggered_at).toLocaleTimeString()}</span>
            {alert.latitude !== null && alert.longitude !== null && (
              <a
                className="underline"
                href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                See on map
              </a>
            )}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold uppercase">{alert.status === 'active' ? 'New' : alert.status === 'acknowledged' ? 'Responding' : alert.status}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {onCallsPage ? null : callsFeatureEnabled() && canCallSosSender(alert) ? (
                <Link href={callSenderUrl(alert)} className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-3 text-sm font-bold text-red-700 hover:bg-red-50">
                  <PhoneCall className="size-4" />Call sender now
                </Link>
              ) : callsFeatureEnabled() && alert.site_id !== null ? (
                // The alert didn't record which phone sent it, so ring the
                // whole Site; the SOS phone auto-answers while its SOS is on.
                <Link href={`/calls?siteId=${alert.site_id}&autostart=1`} className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-3 text-sm font-bold text-red-700 hover:bg-red-50">
                  <PhoneCall className="size-4" />Call the Site
                </Link>
              ) : null}
              {alert.status === 'active' && (
                <Button size="sm" variant="secondary" disabled={actingOn === alert.id} onClick={() => void respond(alert.id, 'acknowledge')}>
                  I&apos;m responding
                </Button>
              )}
              {alert.status === 'acknowledged' && resolvingId !== alert.id && (
                <Button size="sm" className="bg-green-700 text-white hover:bg-green-800" disabled={actingOn === alert.id} onClick={() => { setResolvingId(alert.id); setResolveNote(''); }}>
                  Resolve
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={actingOn === alert.id} onClick={() => void respond(alert.id, 'cancel')}>
                False alarm
              </Button>
            </div>
            {resolvingId === alert.id && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border-0 px-3 text-sm text-foreground"
                  placeholder="What happened / what was done (optional)"
                  maxLength={500}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  autoFocus
                />
                <Button size="sm" className="bg-green-700 text-white hover:bg-green-800" disabled={actingOn === alert.id} onClick={() => void resolve(alert.id)}>
                  Mark resolved
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setResolvingId(null)}>Back</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
