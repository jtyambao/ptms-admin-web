'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './ptms-api';
import { useSession } from './session-provider';

// Voice/video call groundwork (item 4b, user-requested 2026-09-30) — a
// socket CONNECTION shell only. This has never been run against the
// merged Socket.IO signaling gateway (src/calls/calls.gateway.ts, PR #1)
// from a real browser, and never against a real Guard device — see the
// design note in app/calls/page.tsx for what is and isn't covered. Do not
// read this as "calling works"; it only proves (once someone actually
// flips the feature flag and tries it) whether a staff socket can reach
// the gateway and complete its `register` handshake.

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
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'disabled', error: null });
      return;
    }
    if (session.status !== 'authenticated') return;
    const accessToken = session.getAccessToken();
    if (!accessToken) return;

    setState({ status: 'connecting', error: null });
    const socket: Socket = io(socketOrigin(), { transports: ['websocket'] });

    socket.on('connect', () => {
      setState({ status: 'connected', error: null });
      socket.emit('register', { role: 'staff', accessToken });
    });
    socket.on('register:ok', () => setState({ status: 'registered', error: null }));
    socket.on('register:error', (payload: { message?: string }) => {
      setState({ status: 'error', error: payload?.message ?? 'Registration was denied.' });
    });
    socket.on('connect_error', (err: Error) => {
      setState({ status: 'error', error: err.message });
    });
    socket.on('disconnect', () => {
      setState((current) => (current.status === 'error' ? current : { status: 'connecting', error: null }));
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, session, session.status]);

  return state;
}
