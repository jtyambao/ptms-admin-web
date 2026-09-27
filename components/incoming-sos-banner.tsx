'use client';

import { PhoneCall, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/authenticated-api';
import { canRespondToSos } from '@/lib/dashboard';
import { managementApi } from '@/lib/management-api';
import type { SosAlertEntry } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

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
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [soundBlocked, setSoundBlocked] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const all = await managementApi.listSosAlerts(session.api);
      setAlerts(all.filter((a) => a.status === 'active' || a.status === 'acknowledged'));
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

  if (!enabled || alerts.length === 0) return null;

  return (
    <div className="space-y-2 bg-red-600 px-4 py-3 text-white shadow-lg sm:px-8" role="alert">
      <div className="flex flex-wrap items-center gap-2">
        <PhoneCall className="size-5 shrink-0 animate-pulse" />
        <p className="font-black uppercase tracking-wide">
          {alerts.length === 1 ? 'Incoming SOS' : `${alerts.length} Incoming SOS Alerts`}
        </p>
        {soundBlocked && hasActive && (
          <Button size="sm" variant="secondary" className="ml-auto gap-1" onClick={enableSound}>
            <VolumeX className="size-4" />Click to enable sound
          </Button>
        )}
        {!soundBlocked && hasActive && <Volume2 className="ml-auto size-4 shrink-0" aria-hidden="true" />}
      </div>
      {error && <p className="text-sm font-bold">{error}</p>}
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm">
            <span className="font-bold">{alert.site_name ?? 'Unknown Site'}</span>
            <span>{alert.personnel_name ?? 'Unknown Guard'}</span>
            <span className="text-white/80">{new Date(alert.triggered_at).toLocaleTimeString()}</span>
            {alert.latitude !== null && alert.longitude !== null && (
              <a
                className="underline"
                href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Location
              </a>
            )}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold uppercase">{alert.status}</span>
            <div className="ml-auto flex gap-2">
              {alert.status === 'active' && (
                <Button size="sm" variant="secondary" disabled={actingOn === alert.id} onClick={() => void respond(alert.id, 'acknowledge')}>
                  Acknowledge
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={actingOn === alert.id} onClick={() => void respond(alert.id, 'cancel')}>
                Cancel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
