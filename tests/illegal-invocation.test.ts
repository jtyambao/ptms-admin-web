import assert from 'node:assert/strict';
import test from 'node:test';
import { CallSession, type PeerConnectionLike } from '../lib/webrtc/call-session.ts';
import { CallsSignalingClient, type SocketLike } from '../lib/webrtc/signaling-client.ts';
import { handleSessionLogin } from '../lib/server/session-gateway.ts';

// Chrome and Workers throw "Illegal invocation" when a built-in such as
// setTimeout/fetch is stored on an object and called as a method
// (obj.fn(...)) - Node does not, so ordinary unit tests pass while the
// real browser crashes (it took /calls down in production, 2026-10-07).
// These tests swap the globals for strict versions that behave like Chrome.
function strict<T extends (...args: never[]) => unknown>(name: string, impl: T): T {
  return function (this: unknown, ...args: never[]) {
    if (this !== undefined && this !== globalThis) throw new TypeError(`Illegal invocation (${name})`);
    return impl(...args);
  } as T;
}

test('CallSession uses timers the way Chrome allows (ring timeout and disconnect grace)', async () => {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const timers: { fn: () => void }[] = [];
  globalThis.setTimeout = strict('setTimeout', ((fn: () => void) => {
    timers.push({ fn });
    return timers.length as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
  globalThis.clearTimeout = strict('clearTimeout', (() => {}) as unknown as typeof clearTimeout);
  try {
    const socket: SocketLike = { connected: true, on() {}, off() {}, emit() {}, disconnect() {} };
    const pc = {
      connectionState: 'new', onconnectionstatechange: null, onicecandidate: null, ontrack: null,
      createOffer: async () => ({ type: 'offer', sdp: 's' }), createAnswer: async () => ({ type: 'answer', sdp: 's' }),
      setLocalDescription: async () => {}, setRemoteDescription: async () => {}, addIceCandidate: async () => {},
      addTrack() {}, close() {},
    } as unknown as PeerConnectionLike;
    const stream = { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
    const make = (direction: 'outgoing' | 'incoming') =>
      new CallSession(
        { signaling: new CallsSignalingClient(socket, () => 't'), createPeerConnection: () => pc, getUserMedia: async () => stream },
        { callId: 'c', callType: 'voice', direction },
      );
    // The outgoing path arms the ring timer in the constructor; the incoming
    // path runs setupLocalMedia on accept. Neither may throw in "Chrome".
    assert.doesNotThrow(() => make('outgoing'));
    assert.doesNotThrow(() => make('incoming'));
    assert.ok(timers.length >= 1, 'the outgoing ring timer was armed through setTimeout');
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

test('the session gateway default fetcher is not called as a method of its options object', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = strict('fetch', (async (input: unknown) => {
    const url = String(input);
    const body = url.endsWith('/auth/login')
      ? { data: { accessToken: 'a', refreshToken: 'r', user: { id: 1 } } }
      : { data: { id: 1, role: 'admin' } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch);
  try {
    const request = new Request('http://localhost/api/session/login', {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
    });
    const response = await handleSessionLogin(request, { apiBaseUrl: 'http://api.test/api/v1' });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
});
