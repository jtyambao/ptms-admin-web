// ICE server config — MUST match the Guard app's own iceConfig.ts exactly
// (verified 2026-09-30 against ptms-guard-app-v1.1-volume-worktree's
// src/webrtc/iceConfig.ts): Phase 1 is STUN-only, no TURN server exists.
// A call between two clients behind restrictive/symmetric NATs (common on
// mobile carrier networks) can fail to connect with no TURN relay to fall
// back to — that is a real, current limitation of the signaling
// architecture itself, not something either client can fix alone. If
// mobile-network call reliability becomes a real problem, a TURN server
// (e.g. coturn) would need to be provisioned and its credentials added
// here AND on the Guard app side — out of scope for this groundwork.
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export function getIceConfiguration(): RTCConfiguration {
  return { iceServers: ICE_SERVERS };
}
