import { deviceOnlineStatus } from './dashboard.ts';
import { managementApi } from './management-api.ts';
import type { AuthenticatedApiClient } from './authenticated-api';
import type { Site } from './ptms-api';

// Calls contact picker (item A follow-up to item 4b's groundwork) — the
// signaling protocol (verified 2026-09-30 against calls.gateway.ts and
// the Guard app) has NO per-device targeting for a staff-initiated call:
// `call:invite({ callType, siteId })` fans out to EVERY connected guard
// device at that site; `targetSiteDeviceId` is guard-only (see
// signaling-client.ts's own invite() comment). So the real unit of "who
// to call" from Admin Web is a SITE, not an individual device — this
// picker presents sites, not devices, and is honest about that rather
// than implying a per-device dial that doesn't exist.
export interface CallableSite {
  siteId: number;
  siteName: string;
  onlineDeviceCount: number;
  activeDeviceCount: number;
  oicName: string | null;
}

export async function loadCallableSites(
  api: AuthenticatedApiClient,
  sites: Site[],
): Promise<CallableSite[]> {
  const results = await Promise.all(
    sites.map(async (site): Promise<CallableSite> => {
      const [devices, staffing] = await Promise.all([
        managementApi.listDevices(api, site.id).catch(() => []),
        managementApi.getStaffing(api, site.id).catch(() => null),
      ]);
      const active = devices.filter((d) => d.is_active);
      const onlineDeviceCount = active.filter((d) => deviceOnlineStatus(d.last_seen_at).online).length;
      return {
        siteId: site.id,
        siteName: site.name,
        onlineDeviceCount,
        activeDeviceCount: active.length,
        oicName: staffing?.oic?.full_name ?? null,
      };
    }),
  );
  // Online-first, then by name — a site with nothing currently reachable
  // is still listed (calling it fans out to zero recipients and the
  // caller gets the standard "No one available" error), just sorted last.
  return results.sort((a, b) => {
    if (a.onlineDeviceCount !== b.onlineDeviceCount) return b.onlineDeviceCount - a.onlineDeviceCount;
    return a.siteName.localeCompare(b.siteName);
  });
}
