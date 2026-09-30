'use client';

import { useEffect, useRef, useState } from 'react';
import { getIceConfiguration } from './ice-config';
import { CallSession, type CallSessionState, type CallDirection, type PeerConnectionLike } from './call-session';
import type { CallType, CallsSignalingClient } from './signaling-client';

export interface UseCallSessionResult {
  state: CallSessionState | null;
  toggleMute(): void;
  toggleCamera(): void;
  hangUp(): void;
}

// Thin React binding over CallSession — the state machine itself
// (call-session.ts) is DOM/WebRTC-free and unit-tested directly; this
// hook's only job is wiring it to the REAL `window.RTCPeerConnection`/
// `navigator.mediaDevices.getUserMedia` and exposing reactive state +
// controls. A new CallSession is created whenever `call` (identified by
// its own callId) changes, and disposed on unmount or when it changes
// again — never reused across two different calls.
export function useCallSession(
  signaling: CallsSignalingClient | null,
  call: { callId: string; callType: CallType; direction: CallDirection } | null,
): UseCallSessionResult {
  const sessionRef = useRef<CallSession | null>(null);
  const [state, setState] = useState<CallSessionState | null>(null);

  useEffect(() => {
    if (!signaling || !call) {
      sessionRef.current = null;
      setState(null);
      return;
    }
    const session = new CallSession(
      {
        signaling,
        // A real RTCPeerConnection structurally provides everything
        // PeerConnectionLike declares; the cast is only needed because
        // its native event-handler property TYPES are more permissive
        // (accept a DOM Event argument) than this file's simplified,
        // browser-independent interface — never a runtime mismatch.
        createPeerConnection: () => new RTCPeerConnection(getIceConfiguration()) as unknown as PeerConnectionLike,
        getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      },
      call,
    );
    sessionRef.current = session;
    setState(session.getState());
    const unsubscribe = session.subscribe(setState);
    return () => {
      unsubscribe();
      session.dispose();
      sessionRef.current = null;
    };
    // call.callType/direction are fixed for the lifetime of a given
    // callId — only a callId change should ever re-create the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signaling, call?.callId]);

  return {
    state,
    toggleMute: () => sessionRef.current?.toggleMute(),
    toggleCamera: () => sessionRef.current?.toggleCamera(),
    hangUp: () => sessionRef.current?.hangUp(),
  };
}
