'use client';

import {
  AlertTriangle,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/authenticated-api';
import { callsFeatureEnabled } from '@/lib/calls-feature';
import { useCallsSocket, type CallsSocketStatus } from '@/lib/calls-socket';
import { loadCallableSites, type CallableSite } from '@/lib/calls-contacts';
import { managementApi } from '@/lib/management-api';
import { describeEndReason } from '@/lib/webrtc/call-session';
import { useCallSession } from '@/lib/webrtc/use-call-session';
import { Ringtone } from '@/lib/webrtc/ringtone';
import { fetchIceConfiguration, getIceConfiguration } from '@/lib/webrtc/ice-config';
import type { CallerContext, CallsSignalingClient, CallType, SignalingEvent } from '@/lib/webrtc/signaling-client';
import { useSession } from '@/lib/session-provider';

/**
 * Voice/video calls (item A, 2026-09-30 — full build on top of item 4b's
 * groundwork). Flag still OFF everywhere until a real device test passes
 * (see lib/calls-feature.ts) — NOTHING in this feature has been run
 * against a real Guard device, or even against the gateway from a real
 * browser session. Read every "Registered"/"Connected" status here as
 * "the handshake completed," never as proof the feature works.
 *
 * PROTOCOL, verified 2026-09-30 directly against BOTH the backend gateway
 * (src/calls/calls.gateway.ts, PR #1) AND the Guard app's own client
 * (ptms-guard-app-v1.1-volume-worktree's src/webrtc/signalingClient.ts +
 * useCallSession.ts) so this interoperates with the real other side, not
 * just the backend's own types:
 *
 * - register: { role:'staff', accessToken } -> register:ok/register:error.
 *   Re-sent on every reconnect (lib/webrtc/signaling-client.ts).
 * - Outgoing: call:invite({ callType, siteId }) fans out to EVERY
 *   connected guard device at that site — there is NO per-device staff
 *   targeting (targetSiteDeviceId is guard-only). The caller gets
 *   call:ringing{callId,callType} back, then call:accept{callId} once
 *   any candidate answers (first to accept wins; losers/no-answer
 *   collapse to the same generic call:error{message} — "busy",
 *   "no one online", and "unauthorized" are indistinguishable by design,
 *   see calls.gateway.ts's own comment).
 * - Incoming: call:invite{callId,callType,from,...callerContext}. `from`
 *   is 'guard'|'staff'. Caller identity (fixed 2026-09-30, backend
 *   commit 150cd03 — was a real gap, not a client bug: the server always
 *   resolved the caller's identity internally, it just never included it
 *   in the emitted payload) is spread additively: a Guard caller adds
 *   {siteId,siteName,deviceLabel,oicName}, a staff caller adds
 *   {userName,role}. lib/webrtc/signaling-client.ts folds these into a
 *   typed `callerContext` (null when the backend didn't send them —
 *   an older deployment, or its own lookup found nothing).
 * - Once accepted: sdp:offer/sdp:answer/ice:candidate relay, silently
 *   dropped server-side before call:accept completes — never send SDP
 *   before observing accept (lib/webrtc/call-session.ts enforces this).
 *   ICE candidates arriving before the remote description is set are
 *   queued and flushed right after, matching the Guard app exactly.
 * - call:connected is a LOCAL "my WebRTC finished connecting" signal
 *   relayed for UI purposes only — either side's own ICE connect or the
 *   peer's relayed signal flips the UI to Connected, whichever is first.
 * - ICE servers: STUN-only ({ urls:'stun:stun.l.google.com:19302' }), no
 *   TURN server exists anywhere in this system yet (Phase 1, matches the
 *   Guard app's own iceConfig.ts exactly — see lib/webrtc/ice-config.ts).
 *   A call between two clients behind restrictive/symmetric NATs (common
 *   on mobile carrier networks) can simply fail to connect with nothing
 *   client-side able to fix it — if that turns out to matter in practice,
 *   the user would need to provision a TURN server (e.g. coturn) and its
 *   credentials would need adding on BOTH this client and the Guard app.
 * - A WebRTC 'disconnected' state gets an 8s grace period before treating
 *   it as a real end (matches the Guard app), 'failed' ends immediately.
 * - Call log: call_sessions is written ONLY for the Guard-device side of
 *   a call (site_device_id-keyed) — there is no staff-facing call-log
 *   read endpoint and this feature does not add one. A call Admin Web
 *   places/receives is therefore not recorded anywhere staff can browse
 *   later; the Guard side of it still shows in that device's own
 *   Call Log as usual.
 *
 * WHAT STILL NEEDS A REAL DEVICE TEST (an A72 or similar + a real
 * browser) before this flag can ever go on for real use: the full
 * register -> invite -> accept -> SDP/ICE -> connected round trip
 * end-to-end; whether STUN alone is enough on the actual networks guards
 * use; audio/video quality and echo; the 8s disconnect grace period
 * against a real flaky connection; and the incoming-call ringtone/
 * click-to-enable flow on an actual second monitor or tab a dispatcher
 * would realistically be watching.
 */

const STATUS_LABEL: Record<CallsSocketStatus, string> = {
  disabled: 'Turned off',
  connecting: 'Connecting…',
  connected: 'Almost ready…',
  registered: 'Ready to call',
  error: 'Not connected',
};

const STATUS_VARIANT: Record<CallsSocketStatus, 'secondary' | 'outline' | 'destructive'> = {
  disabled: 'outline',
  connecting: 'outline',
  connected: 'outline',
  registered: 'secondary',
  error: 'destructive',
};

type ActiveCall = { callId: string; callType: CallType; direction: 'outgoing' | 'incoming' };
type IncomingInvite = { callId: string; callType: CallType; callerContext: CallerContext | null };
type MissedCall = IncomingInvite & { at: number };

// Caller identity (owner-authorized 2026-09-30, follow-up to items A/B —
// closes gap 1) — e.g. "Guanzon Corporate Center · Galaxy A72" for a
// Guard caller, with the current OIC's name when one is on record.
// `callerContext` is null when the backend didn't send it (an older
// deployment, or its own lookup found nothing) — shown as a plain
// "From a Guard device" fallback in that case, never a blank/broken UI.
function CallerIdentityLine({ callerContext }: { callerContext: CallerContext | null }) {
  if (!callerContext) {
    return <>From a Guard phone. We could not tell which Site it is calling from.</>;
  }
  if (callerContext.kind === 'guard') {
    return (
      <>
        From <span className="font-bold text-foreground">{callerContext.siteName}</span> ·{' '}
        {callerContext.deviceLabel}
        {callerContext.oicName ? ` · OIC: ${callerContext.oicName}` : ''}
      </>
    );
  }
  return (
    <>
      From <span className="font-bold text-foreground">{callerContext.userName}</span> ({callerContext.role})
    </>
  );
}

function IncomingCallOverlay({
  invite,
  soundEnabled,
  onEnableSound,
  onAccept,
  onDecline,
}: {
  invite: IncomingInvite;
  soundEnabled: boolean;
  onEnableSound: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="size-5 text-[#f36f0a]" />
            Incoming {invite.callType === 'video' ? 'video' : 'voice'} call
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <CallerIdentityLine callerContext={invite.callerContext} />
          </p>
          {!soundEnabled && (
            <Button type="button" variant="outline" className="w-full" onClick={onEnableSound}>
              <Volume2 />Enable ringtone sound
            </Button>
          )}
          <div className="flex gap-3">
            <Button type="button" variant="destructive" className="flex-1" onClick={onDecline}>
              <PhoneOff />Decline
            </Button>
            <Button type="button" className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onAccept}>
              <Phone />Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InCallPanel({
  call,
  client,
  iceConfiguration,
  onEnded,
}: {
  call: ActiveCall;
  client: CallsSignalingClient | null;
  iceConfiguration: RTCConfiguration;
  onEnded: () => void;
}) {
  const { state, toggleMute, toggleCamera, hangUp, getAudioStats, turnOnCamera } = useCallSession(client, call, iceConfiguration);
  const showVideo = call.callType === 'video' || !!state?.remoteHasVideo || !!state?.localHasVideo;
  // Live audio check while connected: shows whether this browser's mic is
  // picking up sound and whether audio is actually flowing each way, so a
  // one-way-audio problem can be pinned to this side or the Guard phone.
  const [audioStats, setAudioStats] = useState<Awaited<ReturnType<typeof getAudioStats>>>(null);
  const isConnected = state?.phase === 'connected';
  useEffect(() => {
    if (!isConnected) {
      setAudioStats(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      void getAudioStats().then((next) => {
        if (!cancelled) setAudioStats(next);
      }).catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // getAudioStats reads the current session through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (state?.phase === 'ended') {
      const timer = window.setTimeout(onEnded, 2500);
      return () => window.clearTimeout(timer);
    }
  }, [state?.phase, onEnded]);

  if (!state) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneCall className="size-4 text-[#f36f0a]" />
          {call.callType === 'video' ? 'Video' : 'Voice'} call — {call.direction}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge variant={state.phase === 'connected' ? 'secondary' : 'outline'}>
          {state.phase === 'ringing' && 'Ringing…'}
          {state.phase === 'connecting' && 'Connecting…'}
          {state.phase === 'connected' && 'Connected'}
          {state.phase === 'ended' && `Ended — ${describeEndReason(state.endReason)}`}
        </Badge>
        {state.error && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
        {audioStats && (
          <div className="grid gap-1 rounded-lg border p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-28 font-bold">Your microphone</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-2 bg-green-600 transition-all"
                  style={{ width: `${Math.min(100, Math.round((audioStats.micLevel ?? 0) * 300))}%` }}
                />
              </div>
            </div>
            <p>
              Sending audio: {audioStats.sentKb.toFixed(0)} KB · Receiving audio: {audioStats.receivedKb.toFixed(0)} KB
              {state.muted && ' · You are muted'}
            </p>
          </div>
        )}

        {/* Voice calls had no media element at all, so the remote voice was
            never played. The video element below carries audio for video
            calls; this hidden audio element does it for voice calls. */}
        {!showVideo && (
          <audio
            autoPlay
            ref={(el) => {
              if (el && state.remoteStream && el.srcObject !== state.remoteStream) {
                el.srcObject = state.remoteStream;
                void el.play().catch(() => undefined);
              }
            }}
          />
        )}
        {/* Shown for video calls and also when either side turns a voice
            call into video mid-call. The remote video carries the audio. */}
        {showVideo && (
          <div className="grid gap-3 sm:grid-cols-2">
            <video
              autoPlay
              playsInline
              ref={(el) => {
                if (el && state.remoteStream && el.srcObject !== state.remoteStream) {
                  el.srcObject = state.remoteStream;
                  void el.play().catch(() => undefined);
                }
              }}
              className="aspect-video w-full rounded-lg bg-black"
            />
            {state.localHasVideo && (
              <video
                autoPlay
                playsInline
                muted
                ref={(el) => {
                  if (el && state.localStream && el.srcObject !== state.localStream) el.srcObject = state.localStream;
                }}
                className="aspect-video w-full rounded-lg bg-black"
              />
            )}
          </div>
        )}

        {state.phase !== 'ended' && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={toggleMute}>
              {state.muted ? <MicOff /> : <Mic />}
              {state.muted ? 'Unmute' : 'Mute'}
            </Button>
            {state.localHasVideo ? (
              <Button type="button" variant="outline" onClick={toggleCamera}>
                {state.cameraOff ? <VideoOff /> : <Video />}
                {state.cameraOff ? 'Camera on' : 'Camera off'}
              </Button>
            ) : (
              state.phase === 'connected' && (
                <Button type="button" variant="outline" onClick={() => void turnOnCamera()}>
                  <Video />Turn on my camera
                </Button>
              )
            )}
            <Button type="button" variant="destructive" onClick={hangUp}>
              <PhoneOff />End call
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CallsShell() {
  const enabled = callsFeatureEnabled();
  const session = useSession();
  const { status, error, client } = useCallsSocket(enabled);

  const [sites, setSites] = useState<CallableSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState('');
  const [dialSiteId, setDialSiteId] = useState<number | null>(null);
  const [dialCallType, setDialCallType] = useState<CallType>('voice');
  const [dialing, setDialing] = useState(false);
  const [dialError, setDialError] = useState('');

  const [incomingInvite, setIncomingInvite] = useState<IncomingInvite | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  // Session-only (in memory): the backend keeps no staff call log, so a
  // call that stopped ringing before it was answered is remembered here
  // until the page is closed.
  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([]);
  const [ringtone] = useState(() => new Ringtone());
  const [soundEnabled, setSoundEnabled] = useState(false);
  // ICE servers (STUN + short-lived TURN when the backend has it) are
  // fetched BEFORE each call and always resolve (falls back to STUN) —
  // for an incoming call the fetch starts the moment it rings, so it is
  // ready by the time the dispatcher accepts and no early SDP offer is
  // missed waiting on it.
  const [iceConfiguration, setIceConfiguration] = useState<RTCConfiguration>(getIceConfiguration());
  const icePrefetch = useRef<Promise<RTCConfiguration> | null>(null);

  const refreshSites = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    setSitesLoading(true);
    try {
      const allSites = await managementApi.listSites(session.api);
      setSites(await loadCallableSites(session.api, allSites));
      setSitesError('');
    } catch (reason) {
      setSitesError(reason instanceof ApiRequestError ? reason.message : 'Sites could not be loaded.');
    } finally {
      setSitesLoading(false);
    }
  }, [session.api, session.status]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void refreshSites(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, refreshSites]);

  // Top-level signaling events — an incoming invite (only while not
  // already on a call; the server's own busy backstop means we simply
  // won't receive a second one otherwise) and the caller-only events for
  // OUR OWN outgoing dial (call:ringing carries the server-assigned
  // callId; there is at most one dial in flight at a time, since the
  // dial button disables itself while dialing).
  useEffect(() => {
    if (!client) return;
    return client.on((event: SignalingEvent) => {
      if (event.type === 'invite' && !activeCall && !incomingInvite) {
        setIncomingInvite({ callId: event.callId, callType: event.callType, callerContext: event.callerContext });
        icePrefetch.current = fetchIceConfiguration(session.api);
        ringtone.start();
      } else if (event.type === 'end' && incomingInvite && event.callId === incomingInvite.callId) {
        // The caller hung up (or another dispatcher answered) while this
        // was still ringing — stop the ringtone and keep a Missed entry.
        ringtone.stop();
        setMissedCalls((prev) => [{ ...incomingInvite, at: Date.now() }, ...prev].slice(0, 20));
        setIncomingInvite(null);
      } else if (event.type === 'ringing' && dialing && !activeCall) {
        setActiveCall({ callId: event.callId, callType: event.callType, direction: 'outgoing' });
        setDialing(false);
      } else if (event.type === 'error' && dialing && !activeCall) {
        setDialError(event.message);
        setDialing(false);
      }
    });
  }, [client, activeCall, incomingInvite, dialing, ringtone]);

  // /calls?siteId=N (the SOS console's "Call the Site" button) preselects
  // that Site once the list has loaded - once only, so it never fights the
  // dispatcher's own choice afterwards.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || sites.length === 0) return;
    preselected.current = true;
    const wanted = Number(new URLSearchParams(window.location.search).get('siteId'));
    if (wanted && sites.some((site) => site.siteId === wanted)) setDialSiteId(wanted);
  }, [sites]);

  useEffect(() => () => ringtone.dispose(), [ringtone]);

  function enableSound() {
    void ringtone.enableSound().then(() => setSoundEnabled(true));
  }

  async function acceptIncoming() {
    if (!incomingInvite || !client) return;
    ringtone.stop();
    const configuration = await (icePrefetch.current ?? fetchIceConfiguration(session.api));
    setIceConfiguration(configuration);
    client.accept(incomingInvite.callId);
    setActiveCall({ callId: incomingInvite.callId, callType: incomingInvite.callType, direction: 'incoming' });
    setIncomingInvite(null);
  }

  function declineIncoming() {
    if (!incomingInvite || !client) return;
    ringtone.stop();
    client.decline(incomingInvite.callId);
    setIncomingInvite(null);
  }

  async function placeCall() {
    if (!client || dialSiteId === null) return;
    setDialError('');
    setDialing(true);
    setIceConfiguration(await fetchIceConfiguration(session.api));
    client.invite(dialSiteId, dialCallType);
    // If the call service never answers the invite (no ringing, no error),
    // don't leave the button stuck on "Calling…" with nothing happening.
    window.setTimeout(() => {
      setDialing((still) => {
        if (still) setDialError('The call did not go through. Reload the page and try again. If it keeps happening, the Guard phone may still be busy with an SOS or a previous call.');
        return false;
      });
    }, 12000);
  }

  if (!enabled) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Voice and video</p>
        <h2 className="mt-1 text-xl font-black">Calls</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Calls are not turned on yet. They still need to be switched on and tried with real phones first.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Voice and video</p>
        <h2 className="mt-1 text-xl font-black">Calls</h2>
      </div>

      <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <AlertTriangle className="size-4 shrink-0" />
        Calls are still being tested with real phones. If a call does not connect, phone the guards the normal way.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="size-4 text-[#f36f0a]" />
            Call connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            {error && <span className="text-sm text-red-700 dark:text-red-400">{error}</span>}
          </div>
        </CardContent>
      </Card>

      {activeCall ? (
        <InCallPanel call={activeCall} client={client} iceConfiguration={iceConfiguration} onEnded={() => setActiveCall(null)} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call a Site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              The call rings every Guard phone that is online at the chosen Site. You cannot pick
              one phone from here (only a guard can call one specific phone).
            </p>
            {sitesError && <p className="text-sm text-red-700 dark:text-red-400">{sitesError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="h-10 rounded-lg border bg-background px-3"
                value={dialSiteId ?? ''}
                onChange={(e) => setDialSiteId(e.target.value ? Number(e.target.value) : null)}
                disabled={sitesLoading || dialing}
              >
                <option value="">{sitesLoading ? 'Loading Sites…' : 'Select a Site'}</option>
                {sites.map((site) => (
                  <option key={site.siteId} value={site.siteId}>
                    {site.siteName} — {site.onlineDeviceCount}/{site.activeDeviceCount} online
                    {site.oicName ? ` · OIC: ${site.oicName}` : ''}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-lg border bg-background px-3"
                value={dialCallType}
                onChange={(e) => setDialCallType(e.target.value as CallType)}
                disabled={dialing}
              >
                <option value="voice">Voice</option>
                <option value="video">Video</option>
              </select>
            </div>
            {dialError && <p className="text-sm text-red-700 dark:text-red-400">{dialError}</p>}
            {status !== 'registered' && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Not connected to the call service right now ({STATUS_LABEL[status]}
                {error ? `: ${error}` : ''}). The Call button turns on when it reconnects — reload the page if it doesn't.
              </p>
            )}
            <Button
              type="button"
              onClick={() => void placeCall()}
              disabled={dialSiteId === null || dialing || status !== 'registered'}
              className="bg-[#f36f0a] text-white hover:bg-[#d95e00]"
            >
              <Phone />{dialing ? 'Calling…' : 'Call'}
            </Button>
          </CardContent>
        </Card>
      )}

      {missedCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Missed calls (this session)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {missedCalls.map((missed) => (
              <div key={`${missed.callId}-${missed.at}`} className="flex flex-wrap items-center justify-between gap-2">
                <span><CallerIdentityLine callerContext={missed.callerContext} /></span>
                <span className="text-xs text-muted-foreground">
                  {missed.callType} · {new Date(missed.at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {incomingInvite && (
        <IncomingCallOverlay
          invite={incomingInvite}
          soundEnabled={soundEnabled}
          onEnableSound={enableSound}
          onAccept={() => void acceptIncoming()}
          onDecline={declineIncoming}
        />
      )}
    </section>
  );
}

export default function CallsPage() {
  return (
    <ProtectedPortal>
      <PortalShell active="calls">
        <SectionErrorBoundary title="Calls">
          <CallsShell />
        </SectionErrorBoundary>
      </PortalShell>
    </ProtectedPortal>
  );
}
