import type { CallType, CallsSignalingClient, SignalingEvent } from './signaling-client';

// Call state machine — DOM/WebRTC-free by design (see this file's own
// PeerConnectionLike/MediaFactory interfaces below): takes factories for
// RTCPeerConnection and getUserMedia so it's fully unit-testable with
// plain fakes, no real browser APIs or a real network. A thin React hook
// (lib/webrtc/use-call-session.ts) wires this to the REAL
// `window.RTCPeerConnection`/`navigator.mediaDevices.getUserMedia`.
//
// Every behavior below (offer/answer roles, ICE queueing, the
// disconnect grace period, end-reason handling) was verified 2026-09-30
// against the Guard app's own src/webrtc/useCallSession.ts so an
// Admin Web call and a Guard app call actually interoperate and agree on
// when a call is "really" over — see app/calls/page.tsx's design note
// for the full protocol writeup this was built from.

export type CallPhase = 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallDirection = 'outgoing' | 'incoming';

// The subset of RTCPeerConnection this state machine actually calls —
// real `RTCPeerConnection` already satisfies this structurally.
export interface PeerConnectionLike {
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  addTrack(track: MediaStreamTrack, stream: MediaStream): void;
  close(): void;
  connectionState: RTCPeerConnectionState;
  onconnectionstatechange: (() => void) | null;
  onicecandidate: ((event: { candidate: RTCIceCandidateInit | null }) => void) | null;
  ontrack: ((event: { streams: readonly MediaStream[] }) => void) | null;
}

export type PeerConnectionFactory = () => PeerConnectionLike;
export type MediaFactory = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

// Grace period before a transient WebRTC 'disconnected' state is treated
// as a real call end — WebRTC's own spec documents 'disconnected' as
// often momentary (a brief network blip), and the Guard app already
// waits this long before tearing down; matching it keeps both sides'
// idea of "the call really ended" in agreement.
const DISCONNECT_GRACE_MS = 8000;

// The gateway has NO ringing timeout (verified): an unanswered outgoing
// call would ring until someone gives up. After this long without an
// accept, cancel it ourselves (call:end -> candidates get 'cancelled').
const NO_ANSWER_MS = 45000;

export interface CallSessionState {
  phase: CallPhase;
  callId: string;
  callType: CallType;
  direction: CallDirection;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  endReason: string | null;
  error: string | null;
}

export type CallSessionListener = (state: CallSessionState) => void;

export interface CallSessionDeps {
  signaling: CallsSignalingClient;
  createPeerConnection: PeerConnectionFactory;
  getUserMedia: MediaFactory;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export class CallSession {
  private readonly signaling: CallsSignalingClient;
  private readonly createPeerConnection: PeerConnectionFactory;
  private readonly getUserMedia: MediaFactory;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;

  private pc: PeerConnectionLike | null = null;
  private readonly pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private hasSentConnected = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeSignaling: (() => void) | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;

  private state: CallSessionState;
  private readonly listeners = new Set<CallSessionListener>();

  constructor(
    deps: CallSessionDeps,
    params: { callId: string; callType: CallType; direction: CallDirection },
  ) {
    this.signaling = deps.signaling;
    this.createPeerConnection = deps.createPeerConnection;
    this.getUserMedia = deps.getUserMedia;
    this.setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;

    this.state = {
      phase: params.direction === 'outgoing' ? 'ringing' : 'connecting',
      callId: params.callId,
      callType: params.callType,
      direction: params.direction,
      localStream: null,
      remoteStream: null,
      muted: false,
      cameraOff: false,
      endReason: null,
      error: null,
    };

    this.unsubscribeSignaling = this.signaling.on((event) => this.handleSignalingEvent(event));

    // Replay any SDP/ICE that arrived before this session existed.
    for (const early of this.signaling.takeBufferedSignals(params.callId)) {
      void this.handleSignalingEvent(early);
    }

    if (params.direction === 'outgoing') {
      this.ringTimer = this.setTimeoutFn(() => {
        if (this.state.phase === 'ringing') this.endLocally('no_answer', true);
      }, NO_ANSWER_MS);
    }

    // An incoming call has already been accepted (via the ringing overlay)
    // before this session is constructed — see app/calls/page.tsx — so it
    // goes straight to setting up media and waiting for the offer.
    if (params.direction === 'incoming') void this.setupLocalMedia();
  }

  getState(): CallSessionState {
    return this.state;
  }

  subscribe(listener: CallSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(partial: Partial<CallSessionState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  private async setupLocalMedia(): Promise<void> {
    try {
      const stream = await this.getUserMedia({
        audio: true,
        video: this.state.callType === 'video',
      });
      this.setState({ localStream: stream });
      this.ensurePeerConnection();
      for (const track of stream.getTracks()) {
        this.pc!.addTrack(track, stream);
      }
      if (this.state.direction === 'outgoing') {
        // The caller only creates its offer once BOTH local media is
        // attached AND call:accept has already been observed — whichever
        // happens second triggers it (see handleSignalingEvent's 'accept'
        // branch for the other half of this race guard).
        if (this.acceptObserved) await this.createAndSendOffer();
      }
    } catch (err) {
      this.setState({ error: (err as Error).message || 'Camera/microphone access failed.' });
    }
  }

  private acceptObserved = false;

  private ensurePeerConnection(): PeerConnectionLike {
    if (this.pc) return this.pc;
    const pc = this.createPeerConnection();
    pc.onicecandidate = (event) => {
      if (event.candidate) this.signaling.sendIceCandidate(this.state.callId, event.candidate);
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) this.setState({ remoteStream: stream });
    };
    pc.onconnectionstatechange = () => this.handleConnectionStateChange(pc.connectionState);
    this.pc = pc;
    return pc;
  }

  private handleConnectionStateChange(connectionState: RTCPeerConnectionState): void {
    if (connectionState === 'connected') {
      this.clearDisconnectTimer();
      if (this.state.phase !== 'connected') this.setState({ phase: 'connected' });
      if (!this.hasSentConnected) {
        this.hasSentConnected = true;
        this.signaling.sendConnected(this.state.callId);
      }
      return;
    }
    if (connectionState === 'disconnected') {
      // Transient per the WebRTC spec — wait rather than tearing down
      // immediately, matching the Guard app's own grace period exactly.
      this.disconnectTimer = this.setTimeoutFn(() => this.endLocally('disconnected', true), DISCONNECT_GRACE_MS);
      return;
    }
    if (connectionState === 'failed') {
      this.endLocally('connection_failed', true);
    }
  }

  private clearRingTimer(): void {
    if (this.ringTimer) {
      this.clearTimeoutFn(this.ringTimer);
      this.ringTimer = null;
    }
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) {
      this.clearTimeoutFn(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private async createAndSendOffer(): Promise<void> {
    const pc = this.ensurePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.sendOffer(this.state.callId, offer);
  }

  private async flushPendingCandidates(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    for (const candidate of this.pendingCandidates.splice(0)) {
      await pc.addIceCandidate(candidate);
    }
  }

  private async handleSignalingEvent(event: SignalingEvent): Promise<void> {
    if ('callId' in event && event.callId !== this.state.callId) return;

    switch (event.type) {
      case 'accept': {
        this.clearRingTimer();
        this.acceptObserved = true;
        this.setState({ phase: 'connecting' });
        // The other half of the race guard in setupLocalMedia — if media
        // was already attached before this accept arrived, send the
        // offer now instead of waiting for media that's already ready.
        if (this.state.localStream) await this.createAndSendOffer();
        else await this.setupLocalMedia();
        return;
      }
      case 'decline':
        this.endLocally('declined', false);
        return;
      case 'sdp-offer': {
        // Callee role: create the peer connection/media (if not already
        // set up — it is, for an incoming call, see the constructor),
        // apply the remote offer, answer. KNOWN EDGE CASE (untested
        // against a real device): if the offer arrives before this
        // session's own getUserMedia() call has resolved, the answer
        // below may not yet reflect our own media tracks, which could
        // require renegotiation the caller doesn't expect. In practice
        // the caller only sends its offer after ITS OWN accept+media
        // round trip, giving the callee's media a head start — but this
        // is exactly the kind of timing this groundwork has not been
        // exercised against a real network for.
        this.ensurePeerConnection();
        const pc = this.pc!;
        await pc.setRemoteDescription(event.sdp);
        this.remoteDescriptionSet = true;
        await this.flushPendingCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.sendAnswer(this.state.callId, answer);
        return;
      }
      case 'sdp-answer': {
        const pc = this.pc;
        if (!pc) return;
        await pc.setRemoteDescription(event.sdp);
        this.remoteDescriptionSet = true;
        await this.flushPendingCandidates();
        return;
      }
      case 'ice-candidate': {
        if (this.remoteDescriptionSet && this.pc) await this.pc.addIceCandidate(event.candidate);
        else this.pendingCandidates.push(event.candidate);
        return;
      }
      case 'connected':
        // Either side's own ICE connect, or the peer's relayed signal,
        // whichever arrives first, flips the UI to Connected.
        this.clearDisconnectTimer();
        if (this.state.phase !== 'connected') this.setState({ phase: 'connected' });
        return;
      case 'end':
        // Remote-initiated — tear down locally WITHOUT re-emitting
        // call:end (avoids an echo loop with the peer).
        this.endLocally(event.reason, false);
        return;
      case 'error':
        this.setState({ error: event.message });
        return;
      case 'disconnected':
        // Signaling socket itself dropped — distinct from the WebRTC
        // peer connection's own 'disconnected' state above.
        return;
      default:
        return;
    }
  }

  private endLocally(reason: string, notifyPeer: boolean): void {
    if (this.state.phase === 'ended') return;
    this.clearDisconnectTimer();
    this.clearRingTimer();
    if (notifyPeer) this.signaling.end(this.state.callId);
    this.teardownMedia();
    this.setState({ phase: 'ended', endReason: reason });
  }

  private teardownMedia(): void {
    this.pc?.close();
    this.pc = null;
    this.state.localStream?.getTracks().forEach((track) => track.stop());
  }

  // Public controls — called from the in-call UI.

  toggleMute(): void {
    const next = !this.state.muted;
    this.state.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    this.setState({ muted: next });
  }

  toggleCamera(): void {
    const next = !this.state.cameraOff;
    this.state.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    this.setState({ cameraOff: next });
  }

  hangUp(): void {
    this.endLocally('ended', true);
  }

  dispose(): void {
    this.clearDisconnectTimer();
    this.clearRingTimer();
    this.teardownMedia();
    this.unsubscribeSignaling?.();
    this.unsubscribeSignaling = null;
  }
}

// Human-readable end-reason mapping — matches the Guard app's own
// CallScreen.tsx labels exactly, so the same underlying event reads the
// same way on both sides of a call.
export function describeEndReason(reason: string | null): string {
  switch (reason) {
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'no_answer':
      return 'No answer';
    case 'caller_disconnected':
    case 'peer_disconnected':
    case 'disconnected':
      return 'Connection lost';
    case 'connection_failed':
      return 'Connection failed';
    case 'media_error':
      return 'Camera/mic error';
    case null:
      return '';
    default:
      return reason;
  }
}
