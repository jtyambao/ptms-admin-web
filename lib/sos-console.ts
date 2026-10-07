import type { SosAlertEntry } from './ptms-api';

// SOS receiver console helpers (user-authorized 2026-10-07).

export const isOpenSos = (alert: SosAlertEntry) => alert.status === 'active' || alert.status === 'acknowledged';

export function splitSosAlerts(alerts: SosAlertEntry[]): { open: SosAlertEntry[]; history: SosAlertEntry[] } {
  const byTriggeredDesc = (a: SosAlertEntry, b: SosAlertEntry) =>
    new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime();
  return {
    // Unacknowledged first - the one that needs a person right now.
    open: alerts
      .filter(isOpenSos)
      .sort((a, b) => (a.status === b.status ? byTriggeredDesc(a, b) : a.status === 'active' ? -1 : 1)),
    history: alerts.filter((a) => !isOpenSos(a)).sort(byTriggeredDesc),
  };
}

export function formatElapsed(fromIso: string, now: number = Date.now()): string {
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(fromIso: string, toIso: string): string {
  const seconds = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  return `${Math.round(minutes / 6) / 10} h`;
}

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

export interface SosOutcome {
  label: string;
  tone: 'good' | 'neutral';
  detail: string | null;
  responseTime: string | null;
}

// What happened to a closed alert, in words. A resolved alert is a REAL
// emergency that was handled; a cancelled one is a false alarm / closed
// out. `responseTime` is trigger -> first acknowledgement.
export function sosOutcome(alert: SosAlertEntry): SosOutcome {
  const responseTime = alert.acknowledged_at ? formatDuration(alert.triggered_at, alert.acknowledged_at) : null;
  if (alert.status === 'resolved') {
    return {
      label: 'Resolved',
      tone: 'good',
      detail: [
        alert.acknowledged_by_name ? `handled by ${alert.acknowledged_by_name}` : null,
        alert.resolution_note ? `"${alert.resolution_note}"` : null,
      ].filter(Boolean).join(' · ') || null,
      responseTime,
    };
  }
  return {
    label: 'Cancelled',
    tone: 'neutral',
    detail: [
      alert.cancelled_by_name ? `by ${alert.cancelled_by_name}` : alert.cancelled_at ? 'by the guard' : null,
      alert.cancel_reason ? `"${alert.cancel_reason}"` : null,
    ].filter(Boolean).join(' · ') || null,
    responseTime,
  };
}

// Live location: the guard's phone patches latitude/longitude onto the
// SAME alert while GPS settles/moves, and the console re-reads the list
// every few seconds. This remembers when a given alert's coordinates last
// CHANGED so the UI can say how fresh they are, never claiming "live"
// for coordinates that stopped updating.
export function trackLocationChange(
  previous: Record<number, { key: string; changedAt: number }>,
  alerts: SosAlertEntry[],
  now: number = Date.now(),
): Record<number, { key: string; changedAt: number }> {
  const next: Record<number, { key: string; changedAt: number }> = {};
  for (const alert of alerts) {
    const key = `${alert.latitude ?? ''},${alert.longitude ?? ''}`;
    const before = previous[alert.id];
    next[alert.id] = before && before.key === key ? before : { key, changedAt: now };
  }
  return next;
}
