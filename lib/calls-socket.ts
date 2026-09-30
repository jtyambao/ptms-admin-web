'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CallsSignalingClient, type SignalingEvent } from './webrtc/signaling-client';
import { API_BASE_URL } from './ptms-api';
import { useSession } from './session-provider';

// Voice/video calls (item 4b groundwork, extended into a real calling
// feature — item A, 2026-09-30). This hook owns exactly one concern: the
// underlying Socket.IO connection and its `register` handshake, wrapped
// in CallsSignalingClient (lib/webrtc/signaling-client.ts) — event names/
// payload shapes verified directly against the Guard app's own client.
// The actual call state machine lives in lib/webrtc/call-session.ts,
// built on top of the `client` this hook returns. NEITHER piece has been
// run against a real Guard device or a real browser session yet — see
// the design note in app/calls/page.tsx.

// CallsGateway is mounted on the SAME NestJS HTTP server as the REST API
// (@WebSocketGateway with no separate host/port), default Socket.IO
// namespace and path — so the socket origin is just the REST API's own
// origin, stripped of its /api/v1 path suffix.
function socketOrigin(): string {
  return new URL(API_BASE_URL).origin;
}

export type CallsSocketStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'registered'
  | 'error';

export interface CallsSocketState {
  status: CallsSocketStatus;
  error: string | null;
  client: CallsSignalingClient | null;
}

// `enabled` is passed in explicitly (from callsFeatureEnabled()) rather
// than read again here, so every consumer of this hook shares the exact
// same on/off decision — no risk of one call site's flag check drifting
// from another's.
export function useCallsSocket(enabled: boolean): CallsSocketState {
  const session = useSession();
  const [state, setState] = useState<CallsSocketState>({
    status: enabled ? 'connecting' : 'disabled',
    error: null,
    client: null,
  });
  const clientRef = useRef<CallsSignalingClient | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'disabled', error: null, client: null });
      return;
    }
    if (session.status !== 'authenticated') return;

    setState((current) => ({ ...current, status: 'connecting', error: null }));
    const socket: Socket = io(socketOrigin(), { transports: ['websocket'], reconnection: true });
    const client = new CallsSignalingClient(socket, () => session.getAccessToken());
    clientRef.current = client;

    const unsubscribe = client.on((event: SignalingEvent) => {
      if (event.type === 'registered') setState({ status: 'registered', error: null, client });
      else if (event.type === 'register-error') setState({ status: 'error', error: event.message, client });
      else if (event.type === 'disconnected')
        setState((current) => (current.status === 'error' ? current : { status: 'connecting', error: null, client }));
    });
    socket.on('connect', () => setState((current) => ({ ...current, status: 'connected', client })));
    socket.on('connect_error', (err: Error) => setState({ status: 'error', error: err.message, client }));

    return () => {
      unsubscribe();
      client.dispose();
      socket.disconnect();
      clientRef.current = null;
    };
  }, [enabled, session, session.status]);

  return state;
}
