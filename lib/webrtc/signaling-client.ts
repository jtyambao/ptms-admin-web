// Signaling client for CallsGateway (src/calls/calls.gateway.ts, PR #1) —
// event names/payload shapes verified 2026-09-30 directly against the
// Guard app's own client (ptms-guard-app-v1.1-volume-worktree's
// src/webrtc/signalingClient.ts) so both sides genuinely interoperate,
// not just against the backend's own types. See the design note in
// app/calls/page.tsx for the full protocol writeup and known gaps.
//
// Deliberately framework-agnostic and DOM-free (no socket.io-client
// import, no RTCPeerConnection) — takes a minimal `SocketLike` the caller
// already connected, so this class is fully unit-testable with a plain
// fake object, no real network or browser APIs required.

export type CallType = 'voice' | 'video';

// Caller identity on call:invite (owner-authorized 2026-09-30, follow-up
// to items A/B) — additive fields the backend now resolves fresh at
// invite time (site-assignments... no, calls.service.ts's
// resolveInviteCallerContext) and spreads onto the existing payload.
// Absent (both undefined) when the backend hasn't sent it (an older
// deployment, or the lookup found nothing) — never assume it's there.
export type CallerContext =
  | { kind: 'guard'; siteId: number; siteName: string; deviceLabel: string; oicName: string | null }
  | { kind: 'staff'; userName: string; role: string };

export interface SocketLike {
  readonly connected: boolean;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, payload?: unknown): void;
  disconnect(): void;
}

// Mirrors the Guard app's own local event union exactly in spirit
// (signalingClient.ts's `emit({ type: ... })` calls) so the two codebases
// stay easy to compare side by side.
export type SignalingEvent =
  | { type: 'registered' }
  | { type: 'register-error'; message: string }
  | { type: 'invite'; callId: string; callType: CallType; from: 'guard' | 'staff'; callerContext: CallerContext | null }
  | { type: 'ringing'; callId: string; callType: CallType }
  | { type: 'accept'; callId: string }
  | { type: 'decline'; callId: string }
  | { type: 'sdp-offer'; callId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'sdp-answer'; callId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; callId: string; candidate: RTCIceCandidateInit }
  | { type: 'connected'; callId: string }
  | { type: 'end'; callId: string; reason: string }
  | { type: 'error'; message: string }
  | { type: 'disconnected' };

type Listener = (event: SignalingEvent) => void;

export class CallsSignalingClient {
  private readonly socket: SocketLike;
  private readonly getAccessToken: () => string | null;
  private readonly listeners = new Set<Listener>();
  // SDP/ICE events are also kept briefly so a CallSession created a beat
  // AFTER they arrive (e.g. the caller's offer landing between our
  // call:accept and the React effect that builds the session) can replay
  // them — the gateway relays them exactly once and does not retry.
  private recentSignals: SignalingEvent[] = [];
  // Bound once so `off()` in dispose() removes the exact same reference
  // `on()` registered — an inline arrow per call would never be removable.
  private readonly boundHandlers: Record<string, (...args: unknown[]) => void>;

  constructor(socket: SocketLike, getAccessToken: () => string | null) {
    this.socket = socket;
    this.getAccessToken = getAccessToken;
    this.boundHandlers = {
      connect: () => this.register(),
      disconnect: () => this.dispatch({ type: 'disconnected' }),
      'register:ok': () => this.dispatch({ type: 'registered' }),
      'register:error': (payload) => this.dispatch({ type: 'register-error', message: (payload as { message?: string })?.message ?? 'Registration was denied.' }),
      'call:invite': (payload) => {
        const p = payload as {
          callId: string;
          callType: CallType;
          from?: 'guard' | 'staff';
          siteId?: number;
          siteName?: string;
          deviceLabel?: string;
          oicName?: string | null;
          userName?: string;
          role?: string;
        };
        let callerContext: CallerContext | null = null;
        if (p.siteName !== undefined && p.deviceLabel !== undefined) {
          callerContext = { kind: 'guard', siteId: p.siteId!, siteName: p.siteName, deviceLabel: p.deviceLabel, oicName: p.oicName ?? null };
        } else if (p.userName !== undefined && p.role !== undefined) {
          callerContext = { kind: 'staff', userName: p.userName, role: p.role };
        }
        this.dispatch({ type: 'invite', callId: p.callId, callType: p.callType, from: p.from ?? 'guard', callerContext });
      },
      'call:ringing': (payload) => {
        const p = payload as { callId: string; callType: CallType };
        this.dispatch({ type: 'ringing', callId: p.callId, callType: p.callType });
      },
      'call:accept': (payload) => this.dispatch({ type: 'accept', callId: (payload as { callId: string }).callId }),
      'call:decline': (payload) => this.dispatch({ type: 'decline', callId: (payload as { callId: string }).callId }),
      'sdp:offer': (payload) => {
        const p = payload as { callId: string; sdp: RTCSessionDescriptionInit };
        this.dispatch({ type: 'sdp-offer', callId: p.callId, sdp: p.sdp });
      },
      'sdp:answer': (payload) => {
        const p = payload as { callId: string; sdp: RTCSessionDescriptionInit };
        this.dispatch({ type: 'sdp-answer', callId: p.callId, sdp: p.sdp });
      },
      'ice:candidate': (payload) => {
        const p = payload as { callId: string; candidate: RTCIceCandidateInit };
        this.dispatch({ type: 'ice-candidate', callId: p.callId, candidate: p.candidate });
      },
      'call:connected': (payload) => this.dispatch({ type: 'connected', callId: (payload as { callId: string }).callId }),
      'call:end': (payload) => {
        const p = payload as { callId: string; reason?: string };
        this.dispatch({ type: 'end', callId: p.callId, reason: p.reason ?? 'ended' });
      },
      'call:error': (payload) => this.dispatch({ type: 'error', message: (payload as { message?: string })?.message ?? 'Call error.' }),
    };
    for (const [event, handler] of Object.entries(this.boundHandlers)) {
      this.socket.on(event, handler);
    }
    if (this.socket.connected) this.register();
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(event: SignalingEvent): void {
    if (event.type === 'sdp-offer' || event.type === 'sdp-answer' || event.type === 'ice-candidate') {
      this.recentSignals.push(event);
      if (this.recentSignals.length > 64) this.recentSignals.shift();
    } else if (event.type === 'end') {
      this.recentSignals = this.recentSignals.filter((e) => !('callId' in e) || e.callId !== event.callId);
    }
    for (const listener of this.listeners) listener(event);
  }

  // Re-emitted on every `connect`, including reconnects — the gateway's
  // connection registry is keyed by the live socket id, so a reconnected
  // socket is unregistered until this runs again (matches the Guard
  // app's own re-register-on-connect behavior).
  private register(): void {
    const accessToken = this.getAccessToken();
    if (!accessToken) return;
    this.socket.emit('register', { role: 'staff', accessToken });
  }

  // Untargeted by default (site-wide fan-out to every connected guard device
  // at the site). "Call the SOS sender" (2026-10-08) may name the exact
  // phone: `sosAlertId` and/or `targetSiteDeviceId` - the backend then rings
  // ONLY that device (after the normal site authorization check).
  invite(siteId: number, callType: CallType, target?: { sosAlertId?: number; targetSiteDeviceId?: number }): void {
    this.socket.emit('call:invite', {
      callType,
      siteId,
      ...(target?.sosAlertId != null ? { sosAlertId: target.sosAlertId } : {}),
      ...(target?.targetSiteDeviceId != null ? { targetSiteDeviceId: target.targetSiteDeviceId } : {}),
    });
  }

  accept(callId: string): void {
    this.socket.emit('call:accept', { callId });
  }

  decline(callId: string): void {
    this.socket.emit('call:decline', { callId });
  }

  sendOffer(callId: string, sdp: RTCSessionDescriptionInit): void {
    this.socket.emit('sdp:offer', { callId, sdp });
  }

  sendAnswer(callId: string, sdp: RTCSessionDescriptionInit): void {
    this.socket.emit('sdp:answer', { callId, sdp });
  }

  sendIceCandidate(callId: string, candidate: RTCIceCandidateInit): void {
    this.socket.emit('ice:candidate', { callId, candidate });
  }

  sendConnected(callId: string): void {
    this.socket.emit('call:connected', { callId });
  }

  end(callId: string): void {
    this.socket.emit('call:end', { callId });
  }

  // Removes and returns buffered SDP/ICE events for one call, oldest first.
  takeBufferedSignals(callId: string): SignalingEvent[] {
    const mine = this.recentSignals.filter((e) => 'callId' in e && e.callId === callId);
    this.recentSignals = this.recentSignals.filter((e) => !('callId' in e) || e.callId !== callId);
    return mine;
  }

  dispose(): void {
    for (const [event, handler] of Object.entries(this.boundHandlers)) {
      this.socket.off(event, handler);
    }
    this.listeners.clear();
  }
}
