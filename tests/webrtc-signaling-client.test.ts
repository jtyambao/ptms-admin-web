import assert from 'node:assert/strict';
import test from 'node:test';
import { CallsSignalingClient, type SocketLike } from '../lib/webrtc/signaling-client.ts';

// Signaling client — event names/payloads verified 2026-09-30 directly
// against the Guard app's own client (signalingClient.ts) so both sides
// genuinely interoperate. Tested here with a plain fake socket, no real
// network — this class is deliberately DOM/socket.io-client-import-free.

function makeFakeSocket(): SocketLike & { handlers: Map<string, Set<(...args: unknown[]) => void>>; emitted: { event: string; payload: unknown }[]; fire(event: string, payload?: unknown): void } {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: { event: string; payload: unknown }[] = [];
  return {
    connected: false,
    handlers,
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

test('registers as staff with the current access token on construction when already connected', () => {
  const socket = makeFakeSocket();
  (socket as { connected: boolean }).connected = true;
  new CallsSignalingClient(socket, () => 'token-abc');
  assert.deepEqual(socket.emitted, [{ event: 'register', payload: { role: 'staff', accessToken: 'token-abc' } }]);
});

test('does not register when there is no access token yet', () => {
  const socket = makeFakeSocket();
  (socket as { connected: boolean }).connected = true;
  new CallsSignalingClient(socket, () => null);
  assert.deepEqual(socket.emitted, []);
});

test('re-registers on every connect event, including reconnects', () => {
  const socket = makeFakeSocket();
  new CallsSignalingClient(socket, () => 'token-abc');
  socket.fire('connect');
  socket.fire('connect');
  assert.equal(socket.emitted.filter((e) => e.event === 'register').length, 2);
});

test('dispatches register:ok as a registered event', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('register:ok', { party: { kind: 'staff' } });
  assert.deepEqual(events, [{ type: 'registered' }]);
});

test('dispatches register:error with the server message, or a fallback if absent', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('register:error', { message: 'nope' });
  socket.fire('register:error', {});
  assert.deepEqual(events, [
    { type: 'register-error', message: 'nope' },
    { type: 'register-error', message: 'Registration was denied.' },
  ]);
});

test('call:invite defaults `from` to guard and callerContext to null when the server omits both', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('call:invite', { callId: 'c1', callType: 'voice' });
  assert.deepEqual(events, [{ type: 'invite', callId: 'c1', callType: 'voice', from: 'guard', callerContext: null }]);
});

// Caller identity (owner-authorized 2026-09-30, follow-up to items A/B —
// closes gap 1) — additive fields the backend spreads onto call:invite,
// verified byte-for-byte against calls.service.ts's own
// resolveInviteCallerContext output shape.
test('call:invite folds a Guard caller\'s additive fields into a typed callerContext', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('call:invite', {
    callId: 'c1', callType: 'voice', from: 'guard',
    siteId: 3, siteName: 'Guanzon Corporate Center', deviceLabel: 'Galaxy A72', oicName: 'Juan Dela Cruz',
  });
  assert.deepEqual(events, [{
    type: 'invite', callId: 'c1', callType: 'voice', from: 'guard',
    callerContext: { kind: 'guard', siteId: 3, siteName: 'Guanzon Corporate Center', deviceLabel: 'Galaxy A72', oicName: 'Juan Dela Cruz' },
  }]);
});

test('call:invite folds a staff caller\'s additive fields into a typed callerContext', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('call:invite', { callId: 'c1', callType: 'voice', from: 'staff', userName: 'Maria Santos', role: 'org_admin' });
  assert.deepEqual(events, [{
    type: 'invite', callId: 'c1', callType: 'voice', from: 'staff',
    callerContext: { kind: 'staff', userName: 'Maria Santos', role: 'org_admin' },
  }]);
});

test('a Guard caller with no current OIC gets oicName: null in callerContext, not undefined', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('call:invite', { callId: 'c1', callType: 'voice', siteId: 3, siteName: 'Site X', deviceLabel: 'Device X' });
  assert.deepEqual((events[0] as { callerContext: { oicName: unknown } }).callerContext.oicName, null);
});

test('invite() emits call:invite with siteId (staff -> site fan-out) never targetSiteDeviceId (guard-only)', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  client.invite(4, 'video');
  assert.deepEqual(socket.emitted.at(-1), { event: 'call:invite', payload: { callType: 'video', siteId: 4 } });
});

test('accept/decline/end all emit with just { callId }', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  client.accept('c1');
  client.decline('c2');
  client.end('c3');
  assert.deepEqual(socket.emitted.map((e) => e), [
    { event: 'call:accept', payload: { callId: 'c1' } },
    { event: 'call:decline', payload: { callId: 'c2' } },
    { event: 'call:end', payload: { callId: 'c3' } },
  ]);
});

test('sendOffer/sendAnswer/sendIceCandidate/sendConnected match the exact byte-for-byte payload shapes the Guard app sends', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const sdp = { type: 'offer', sdp: 'v=0...' } as RTCSessionDescriptionInit;
  const candidate = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } as RTCIceCandidateInit;
  client.sendOffer('c1', sdp);
  client.sendAnswer('c1', sdp);
  client.sendIceCandidate('c1', candidate);
  client.sendConnected('c1');
  assert.deepEqual(socket.emitted, [
    { event: 'sdp:offer', payload: { callId: 'c1', sdp } },
    { event: 'sdp:answer', payload: { callId: 'c1', sdp } },
    { event: 'ice:candidate', payload: { callId: 'c1', candidate } },
    { event: 'call:connected', payload: { callId: 'c1' } },
  ]);
});

test('dispatches sdp-offer/sdp-answer/ice-candidate/connected/end/error from the server', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  const sdp = { type: 'answer', sdp: 'v=0...' } as RTCSessionDescriptionInit;
  const candidate = { candidate: 'candidate:1' } as RTCIceCandidateInit;
  socket.fire('sdp:offer', { callId: 'c1', sdp });
  socket.fire('sdp:answer', { callId: 'c1', sdp });
  socket.fire('ice:candidate', { callId: 'c1', candidate });
  socket.fire('call:connected', { callId: 'c1' });
  socket.fire('call:end', { callId: 'c1', reason: 'declined' });
  socket.fire('call:error', { message: 'No one available to answer right now.' });
  assert.deepEqual(events, [
    { type: 'sdp-offer', callId: 'c1', sdp },
    { type: 'sdp-answer', callId: 'c1', sdp },
    { type: 'ice-candidate', callId: 'c1', candidate },
    { type: 'connected', callId: 'c1' },
    { type: 'end', callId: 'c1', reason: 'declined' },
    { type: 'error', message: 'No one available to answer right now.' },
  ]);
});

test('call:end without a reason field defaults to "ended" — the server never sends a reason on the client-emitted variant', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('call:end', { callId: 'c1' });
  assert.deepEqual(events, [{ type: 'end', callId: 'c1', reason: 'ended' }]);
});

test('disconnect fires a disconnected event so a caller can distinguish socket loss from a WebRTC peer-connection disconnect', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  client.on((e) => events.push(e));
  socket.fire('disconnect');
  assert.deepEqual(events, [{ type: 'disconnected' }]);
});

test('dispose() removes every listener it registered — no leaked handlers on an old socket', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  client.dispose();
  for (const handlers of socket.handlers.values()) {
    assert.equal(handlers.size, 0);
  }
});

test('on() returns an unsubscribe function', () => {
  const socket = makeFakeSocket();
  const client = new CallsSignalingClient(socket, () => 'token');
  const events: unknown[] = [];
  const unsubscribe = client.on((e) => events.push(e));
  unsubscribe();
  socket.fire('call:connected', { callId: 'c1' });
  assert.deepEqual(events, []);
});
