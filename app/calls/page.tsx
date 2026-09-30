'use client';

import { AlertTriangle, PhoneCall, ShieldAlert } from 'lucide-react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { callsFeatureEnabled } from '@/lib/calls-feature';
import { useCallsSocket, type CallsSocketStatus } from '@/lib/calls-socket';

/**
 * Voice/video call GROUNDWORK ONLY (item 4b, user-requested 2026-09-30).
 *
 * DESIGN + ESTIMATE, against the already-merged Socket.IO signaling
 * gateway (src/calls/calls.gateway.ts, PR #1):
 *
 * The gateway already implements the full signaling contract this page
 * would need: `register` (staff, by JWT) / `register:ok` / `register:error`,
 * `call:invite` / `call:accept` / `call:decline` / `call:ringing` /
 * `call:error`, `sdp:offer` / `sdp:answer` / `ice:candidate`,
 * `call:connected` / `call:end`. A staff caller places a call by emitting
 * `call:invite` with a target `siteId` (and, once a contact picker exists,
 * a `targetSiteDeviceId` — see calls.gateway.ts's own comment: today it
 * fans out to every guard device at the site and the first accept wins).
 * WebRTC media (getUserMedia + RTCPeerConnection, STUN-only in Phase 1,
 * per calls.gateway.ts's own header comment) is a BROWSER capability this
 * repo has never exercised at all — the Guard app's own ICE config
 * (public STUN, no TURN) is the only precedent to follow.
 *
 * Rough estimate for the REMAINING work beyond this page (a contact/site
 * picker, WebRTC media + peer connection wiring, a ringing/in-call/ended
 * UI, and a real two-device test — one browser tab, one physical Guard
 * phone): 3-5 focused days, most of it the WebRTC media path and its
 * physical-device verification, not the signaling (already built).
 *
 * WHAT THIS PAGE ACTUALLY IS: only the two lowest-risk, most mechanical
 * pieces of that — a socket CONNECTION using the staff JWT
 * (lib/calls-socket.ts) and this call-state UI SHELL — both behind
 * lib/calls-feature.ts's flag, OFF by default. Nothing here places or
 * receives a call. NEITHER PIECE HAS BEEN RUN AGAINST A REAL GUARD DEVICE,
 * or even against the gateway from a real browser — do not read a
 * "Registered" status below as proof this works end-to-end; it only means
 * the socket handshake itself completed.
 */

const STATUS_LABEL: Record<CallsSocketStatus, string> = {
  disabled: 'Disabled',
  connecting: 'Connecting…',
  connected: 'Connected — registering…',
  registered: 'Registered',
  error: 'Error',
};

const STATUS_VARIANT: Record<CallsSocketStatus, 'secondary' | 'outline' | 'destructive'> = {
  disabled: 'outline',
  connecting: 'outline',
  connected: 'outline',
  registered: 'secondary',
  error: 'destructive',
};

function CallsShell() {
  const enabled = callsFeatureEnabled();
  const { status, error } = useCallsSocket(enabled);

  if (!enabled) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Voice / Video</p>
        <h2 className="mt-1 text-xl font-black">Calls</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Not yet enabled. This is untested groundwork only — see the design note in this page&apos;s
          own source for what exists and what is still missing.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Voice / Video</p>
        <h2 className="mt-1 text-xl font-black">Calls</h2>
      </div>

      <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <AlertTriangle className="size-4 shrink-0" />
        Untested groundwork. This connects a socket and completes the staff registration
        handshake only — it does not place or receive calls, and has never been tried against a
        real Guard device.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="size-4 text-[#f36f0a]" />
            Signaling connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            {error && <span className="text-sm text-red-700 dark:text-red-400">{error}</span>}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default function CallsPage() {
  return (
    <ProtectedPortal>
      <PortalShell active="calls">
        <CallsShell />
      </PortalShell>
    </ProtectedPortal>
  );
}
