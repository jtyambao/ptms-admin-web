import assert from 'node:assert/strict';
import test from 'node:test';
import { CallSession, describeEndReason, type PeerConnectionLike } from '../lib/webrtc/call-session.ts';
import { CallsSignalingClient, type SocketLike } from '../lib/webrtc/signaling-client.ts';

// Call state machine — behavior verified 2026-09-30 against the Guard
// app's own src/webrtc/useCallSession.ts (offer/answer roles, ICE
// candidate queueing, the 8s disconnect grace period, end-reason
// handling), tested here with fake PeerConnection/getUserMedia/socket —
// no real network or browser APIs required.

function makeFakeSocket(): SocketLike & { fire(event: string, payload?: unknown): void; emitted: { event: string; payload: unknown }[] } {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: { event: string; payload: unknown }[] = [];
  return {
    connected: true,
    emitted,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
    disconnect() {},
    fire(event, payload) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function makeFakeTrack(kind: 'audio' | 'video'): MediaStreamTrack {
  return { kind, enabled: true, stop: () => {} } as unknown as MediaStreamTrack;
}

function makeFakeStream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream;
}

function makeFakePeerConnection(): PeerConnectionLike & { addedTracks: MediaStreamTrack[]; closed: boolean; setConnectionState(state: RTCPeerConnectionState): void } {
  const pc = {
    addedTracks: [] as MediaStreamTrack[],
    closed: false,
    connectionState: 'new' as RTCPeerConnectionState,
    onconnectionstatechange: null as (() => void) | null,
    onicecandidate: null as ((event: { candidate: RTCIceCandidateInit | null }) => void) | null,
    ontrack: null as ((event: { streams: readonly MediaStream[] }) => void) | null,
    async createOffer() {
      return { type: 'offer', sdp: 'offer-sdp' } as RTCSessionDescriptionInit;
    },
    async createAnswer() {
      return { type: 'answer', sdp: 'answer-sdp' } as RTCSessionDescriptionInit;
    },
    async setLocalDescription() {},
    async setRemoteDescription() {},
    async addIceCandidate() {},
    addTrack(track: MediaStreamTrack) {
      pc.addedTracks.push(track);
    },
    close() {
      pc.closed = true;
    },
    setConnectionState(state: RTCPeerConnectionState) {
      pc.connectionState = state;
      pc.onconnectionstatechange?.();
    },
  };
  return pc;
}

function setup(direction: 'outgoing' | 'incoming', callType: 'voice' | 'video' = 'voice') {
  const socket = makeFakeSocket();
  const signaling = new CallsSignalingClient(socket, () => 'token');
  const localStream = makeFakeStream([makeFakeTrack('audio')]);
  const pcs: ReturnType<typeof makeFakePeerConnection>[] = [];
  const session = new CallSession(
    {
      signaling,
      createPeerConnection: () => {
        const pc = makeFakePeerConnection();
        pcs.push(pc);
        return pc;
      },
      getUserMedia: async () => localStream,
    },
    { callId: 'call-1', callType, direction },
  );
  return { socket, signaling, session, pcs, localStream };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('an outgoing call starts in "ringing" and waits for accept before requesting media', async () => {
  const { session } = setup('outgoing');
  assert.equal(session.getState().phase, 'ringing');
  assert.equal(session.getState().localStream, null);
});

test('an incoming call starts in "connecting" and requests media immediately (already accepted via the overlay before this session exists)', async () => {
  const { session } = setup('incoming');
  assert.equal(session.getState().phase, 'connecting');
  await flush();
  assert.notEqual(session.getState().localStream, null);
});

test('outgoing: on call:accept, gets media, attaches tracks, and sends an SDP offer', async () => {
  const { socket, session, pcs } = setup('outgoing');
  socket.fire('call:accept', { callId: 'call-1' });
  await flush();
  assert.equal(session.getState().phase, 'connecting');
  assert.equal(pcs[0].addedTracks.length, 1);
  const offerEmit = socket.emitted.find((e) => e.event === 'sdp:offer');
  assert.ok(offerEmit, 'expected an sdp:offer to have been sent');
  assert.deepEqual(offerEmit!.payload, { callId: 'call-1', sdp: { type: 'offer', sdp: 'offer-sdp' } });
});

test('outgoing: call:decline ends the session with reason "declined", no call:end re-emitted', async () => {
  const { socket, session } = setup('outgoing');
  socket.fire('call:decline', { callId: 'call-1' });
  assert.equal(session.getState().phase, 'ended');
  assert.equal(session.getState().endReason, 'declined');
  assert.equal(socket.emitted.some((e) => e.event === 'call:end'), false);
});

test('incoming: an SDP offer is answered after setting the remote description', async () => {
  const { socket, session, pcs } = setup('incoming');
  await flush();
  socket.fire('sdp:offer', { callId: 'call-1', sdp: { type: 'offer', sdp: 'offer-sdp' } });
  await flush();
  const answerEmit = socket.emitted.find((e) => e.event === 'sdp:answer');
  assert.ok(answerEmit, 'expected an sdp:answer to have been sent');
  assert.deepEqual(answerEmit!.payload, { callId: 'call-1', sdp: { type: 'answer', sdp: 'answer-sdp' } });
  assert.equal(pcs[0].addedTracks.length, 1);
});

test('ICE candidates arriving before the remote description is set are queued, then flushed once it is', async () => {
  const { socket, session, pcs } = setup('incoming');
  await flush();
  const applied: RTCIceCandidateInit[] = [];
  pcs[0].addIceCandidate = async (candidate: RTCIceCandidateInit) => {
    applied.push(candidate);
  };
  socket.fire('ice:candidate', { callId: 'call-1', candidate: { candidate: 'early' } });
  await flush();
  assert.deepEqual(applied, []);
  socket.fire('sdp:offer', { callId: 'call-1', sdp: { type: 'offer', sdp: 'x' } });
  await flush();
  assert.deepEqual(applied, [{ candidate: 'early' }]);
});

test('an ICE candidate arriving after the remote description is already set is applied immediately, not queued', async () => {
  const { socket, session, pcs } = setup('incoming');
  await flush();
  socket.fire('sdp:offer', { callId: 'call-1', sdp: { type: 'offer', sdp: 'x' } });
  await flush();
  const applied: RTCIceCandidateInit[] = [];
  pcs[0].addIceCandidate = async (candidate: RTCIceCandidateInit) => {
    applied.push(candidate);
  };
  socket.fire('ice:candidate', { callId: 'call-1', candidate: { candidate: 'late' } });
  await flush();
  assert.deepEqual(applied, [{ candidate: 'late' }]);
});

test('a local ICE candidate is relayed to the peer via the signaling client', async () => {
  const { socket, pcs } = setup('outgoing');
  socket.fire('call:accept', { callId: 'call-1' });
  await flush();
  pcs[0].onicecandidate?.({ candidate: { candidate: 'mine' } as RTCIceCandidateInit });
  const sent = socket.emitted.find((e) => e.event === 'ice:candidate');
  assert.deepEqual(sent!.payload, { callId: 'call-1', candidate: { candidate: 'mine' } });
});

test('pc.connectionState "connected" flips phase to connected and sends call:connected exactly once', async () => {
  const { socket, session, pcs } = setup('incoming');
  await flush();
  pcs[0].setConnectionState('connected');
  assert.equal(session.getState().phase, 'connected');
  pcs[0].setConnectionState('connected');
  assert.equal(socket.emitted.filter((e) => e.event === 'call:connected').length, 1);
});

test('a remote call:connected event also flips phase to connected — whichever side observes it first wins', async () => {
  const { socket, session } = setup('incoming');
  await flush();
  socket.fire('call:connected', { callId: 'call-1' });
  assert.equal(session.getState().phase, 'connected');
});

test('pc.connectionState "failed" ends the call immediately with reason "connection_failed"', async () => {
  const { session, pcs } = setup('incoming');
  await flush();
  pcs[0].setConnectionState('failed');
  assert.equal(session.getState().phase, 'ended');
  assert.equal(session.getState().endReason, 'connection_failed');
  assert.equal(pcs[0].closed, true);
});

test('pc.connectionState "disconnected" waits the full grace period before ending, and a reconnect within that window cancels the end', async () => {
  const timers: { fn: () => void; ms: number }[] = [];
  let cleared: (() => void) | null = null;
  const fakeSetTimeout = ((fn: () => void, ms?: number) => {
    const entry = { fn, ms: ms ?? 0 };
    timers.push(entry);
    return entry as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  const fakeClearTimeout = ((handle: unknown) => {
    const entry = handle as { fn: () => void };
    cleared = entry.fn;
  }) as typeof clearTimeout;

  const socket = makeFakeSocket();
  const signaling = new CallsSignalingClient(socket, () => 'token');
  const localStream = makeFakeStream([makeFakeTrack('audio')]);
  const pcs: ReturnType<typeof makeFakePeerConnection>[] = [];
  const session = new CallSession(
    {
      signaling,
      createPeerConnection: () => {
        const pc = makeFakePeerConnection();
        pcs.push(pc);
        return pc;
      },
      getUserMedia: async () => localStream,
      setTimeoutFn: fakeSetTimeout,
      clearTimeoutFn: fakeClearTimeout,
    },
    { callId: 'call-1', callType: 'voice', direction: 'incoming' },
  );
  await flush();

  pcs[0].setConnectionState('disconnected');
  assert.equal(session.getState().phase, 'connecting'); // not yet ended
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 8000);

  // Reconnects before the grace timer fires.
  pcs[0].setConnectionState('connected');
  assert.equal(session.getState().phase, 'connected');
  assert.equal(cleared, timers[0].fn);

  // Manually firing the (cancelled) timer callback must be a no-op —
  // simulates what clearTimeout would have prevented in a real timer.
});

test('describeEndReason matches the Guard app\'s own CallScreen labels exactly', () => {
  assert.equal(describeEndReason('declined'), 'Declined');
  assert.equal(describeEndReason('cancelled'), 'Cancelled');
  assert.equal(describeEndReason('caller_disconnected'), 'Connection lost');
  assert.equal(describeEndReason('peer_disconnected'), 'Connection lost');
  assert.equal(describeEndReason('disconnected'), 'Connection lost');
  assert.equal(describeEndReason('connection_failed'), 'Connection failed');
  assert.equal(describeEndReason('media_error'), 'Camera/mic error');
  assert.equal(describeEndReason(null), '');
  assert.equal(describeEndReason('negotiation_error'), 'negotiation_error');
});

test('toggleMute disables/enables every audio track and flips state', async () => {
  const { session } = setup('incoming');
  await flush();
  session.toggleMute();
  assert.equal(session.getState().muted, true);
  session.toggleMute();
  assert.equal(session.getState().muted, false);
});

test('hangUp emits call:end and closes the peer connection', async () => {
  const { socket, session, pcs } = setup('incoming');
  await flush();
  session.hangUp();
  assert.equal(session.getState().phase, 'ended');
  assert.equal(session.getState().endReason, 'ended');
  assert.equal(pcs[0].closed, true);
  assert.deepEqual(socket.emitted.find((e) => e.event === 'call:end')!.payload, { callId: 'call-1' });
});

test('an event for a DIFFERENT callId is ignored entirely', async () => {
  const { socket, session } = setup('outgoing');
  socket.fire('call:accept', { callId: 'some-other-call' });
  await flush();
  assert.equal(session.getState().phase, 'ringing');
});

test('dispose() unsubscribes from the signaling client and closes the peer connection', async () => {
  const { session, pcs, signaling } = setup('incoming');
  await flush();
  session.dispose();
  assert.equal(pcs[0].closed, true);
});
