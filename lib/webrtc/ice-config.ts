import type { AuthenticatedApiClient } from '../authenticated-api';

// ICE server config. STUN-only is the permanent fallback (matches the
// Guard app's own iceConfig.ts). TURN (user-authorized 2026-10-07):
// GET /calls/ice-servers returns STUN plus short-lived Cloudflare
// Realtime TURN credentials when the backend has them configured — see
// the backend's ice-servers.service.ts. Fetched before EACH call (the
// credentials are short-lived and never cached here); any failure falls
// back to STUN so a call never fails to start because TURN minting did.
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export function getIceConfiguration(): RTCConfiguration {
  return { iceServers: ICE_SERVERS };
}

export async function fetchIceConfiguration(api: AuthenticatedApiClient): Promise<RTCConfiguration> {
  try {
    const data = await api.request<{ iceServers: RTCIceServer[]; turn: boolean }>('/calls/ice-servers');
    if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
      return { iceServers: data.iceServers };
    }
  } catch {
    // fall through to STUN-only
  }
  return getIceConfiguration();
}
