'use client';

import { useEffect, useState } from 'react';
import type { AuthenticatedApiClient } from './authenticated-api';
import { managementApi } from './management-api';
import type { SosAlertEntry } from './ptms-api';

// An SOS from the Guard app carries no individual's name (one shared Site
// login), so the console shows who is in charge instead: the Site's current
// OIC and which registered phone sent it (Main / Backup).
export type SosSenderInfo = { oicName: string | null; phoneLabel: string | null };

type SiteInfo = {
  oicName: string | null;
  phones: Map<number, string>;
};

function phoneLabel(label: string, isPrimary: boolean): string {
  return `${label} (${isPrimary ? 'Main phone' : 'Backup phone'})`;
}

async function loadSiteInfo(api: AuthenticatedApiClient, siteId: number): Promise<SiteInfo> {
  const [staffing, devices] = await Promise.all([
    managementApi.getStaffing(api, siteId).catch(() => null),
    managementApi.listDevices(api, siteId).catch(() => []),
  ]);
  const phones = new Map<number, string>();
  for (const device of devices) phones.set(device.id, phoneLabel(device.label, device.is_primary));
  return { oicName: staffing?.oic?.full_name ?? null, phones };
}

export function useSosSenderInfo(api: AuthenticatedApiClient, alerts: SosAlertEntry[]): Record<number, SosSenderInfo> {
  const [sites, setSites] = useState<Record<number, SiteInfo>>({});
  const siteKey = [...new Set(alerts.map((a) => a.site_id).filter((id): id is number => id !== null))].sort().join(',');

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const ids = siteKey.split(',').map(Number);
    const refresh = () => {
      void Promise.all(ids.map(async (id) => [id, await loadSiteInfo(api, id)] as const)).then((entries) => {
        if (!cancelled) setSites(Object.fromEntries(entries));
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [api, siteKey]);

  const result: Record<number, SosSenderInfo> = {};
  for (const alert of alerts) {
    const site = alert.site_id !== null ? sites[alert.site_id] : undefined;
    result[alert.id] = {
      oicName: site?.oicName ?? null,
      phoneLabel: alert.triggering_site_device_id != null ? site?.phones.get(alert.triggering_site_device_id) ?? null : null,
    };
  }
  return result;
}

// One line for the Guard field: the named person if the alert has one,
// otherwise the OIC on duty and the phone that sent it.
export function describeSosSender(alert: SosAlertEntry, info: SosSenderInfo | undefined): string {
  if (alert.personnel_name) return alert.personnel_name;
  const parts: string[] = [];
  parts.push(info?.oicName ? `OIC: ${info.oicName}` : 'OIC not set');
  if (info?.phoneLabel) parts.push(info.phoneLabel);
  return parts.join(' · ');
}
