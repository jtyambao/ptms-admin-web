import type {
  DobEntry,
  Incident,
  RoundsDayHistory,
  StaffCallEntry,
  VisitorLogEntry,
  VoluntaryObservationReportEntry,
} from './ptms-api';

// Dashboard tiles and their detail sections (2026-10-08). Pure helpers only.
// "Today" always means the ORGANIZATION's calendar day - the server tells us
// which day that is (and its timezone) in every rounds/calls response.

/** True when the instant falls on the given org-local calendar day ("YYYY-MM-DD"). */
export function isOnDay(iso: string, day: string, timeZone: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) === day;
  } catch {
    return iso.slice(0, 10) === day;
  }
}

export type RoundsSummary = RoundsDayHistory['summary'];

export function sumRoundsSummaries(summaries: RoundsSummary[]): RoundsSummary {
  return summaries.reduce<RoundsSummary>(
    (total, item) => ({
      completed: total.completed + item.completed,
      failed: total.failed + item.failed,
      in_progress: total.in_progress + item.in_progress,
      missed: total.missed + item.missed,
      missed_open: total.missed_open + item.missed_open,
    }),
    { completed: 0, failed: 0, in_progress: 0, missed: 0, missed_open: 0 },
  );
}

// ---- Reports (Incidents, Daily Occurrence Book, Notify, Visitor Log) ----
// "Notify" is the Guard app's name for the Voluntary Observation Report.
export type ReportKind = 'incident' | 'dob' | 'notify' | 'visitor';

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  incident: 'Incident',
  dob: 'Daily Occurrence Book',
  notify: 'Notify',
  visitor: 'Visitor',
};

export interface ReportItem {
  key: string;
  kind: ReportKind;
  siteId: number | null;
  siteName: string;
  at: string;
  title: string;
  detail: string | null;
  photoUrl: string | null;
  badge: string | null;
}

export function incidentItem(incident: Incident, siteName: string): ReportItem {
  return {
    key: `incident-${incident.id}`,
    kind: 'incident',
    siteId: incident.site_id,
    siteName,
    at: incident.occurred_at,
    title: incident.title,
    detail: null,
    photoUrl: incident.photo_view_url ?? null,
    badge: `${incident.severity} - ${incident.status === 'open' ? 'open' : incident.status}`,
  };
}

export function dobItem(entry: DobEntry, siteName: string): ReportItem {
  return { key: `dob-${entry.id}`, kind: 'dob', siteId: entry.site_id, siteName, at: entry.occurred_at, title: entry.entry_text, detail: null, photoUrl: null, badge: null };
}

export function notifyItem(report: VoluntaryObservationReportEntry, siteName: string): ReportItem {
  return {
    key: `notify-${report.id}`,
    kind: 'notify',
    siteId: report.site_id,
    siteName,
    at: report.occurred_at,
    title: report.remarks?.trim() ? report.remarks : 'Notify (no remarks)',
    detail: null,
    photoUrl: report.photo_view_url,
    badge: null,
  };
}

export function visitorItem(log: VisitorLogEntry, siteName: string): ReportItem {
  return {
    key: `visitor-${log.id}`,
    kind: 'visitor',
    siteId: log.site_id,
    siteName,
    at: log.occurred_at,
    title: log.visitor_name,
    detail: `${log.purpose} - host: ${log.host_name}`,
    photoUrl: log.photo_view_url,
    badge: null,
  };
}

export function newestFirst<T extends { at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

// ---- Missed checkpoints ----
export const MISSED_STATE_LABEL: Record<'open' | 'caught_up' | 'catch_up_planned', string> = {
  open: 'Still missed',
  caught_up: 'Caught up',
  catch_up_planned: 'Catch-up planned',
};

// ---- Call log ----
export function callOutcomeLabel(entry: Pick<StaffCallEntry, 'outcome' | 'direction'>): { label: string; tone: 'good' | 'bad' | 'neutral' } {
  switch (entry.outcome) {
    case 'answered': return { label: 'Answered', tone: 'good' };
    case 'ringing': return { label: 'Ringing', tone: 'neutral' };
    case 'declined': return { label: 'Declined', tone: 'bad' };
    case 'cancelled': return { label: 'You hung up first', tone: 'neutral' };
    default: return { label: entry.direction === 'incoming' ? 'Missed call' : 'No answer', tone: 'bad' };
  }
}

export const callDirectionLabel = (entry: Pick<StaffCallEntry, 'direction'>) => (entry.direction === 'outgoing' ? 'You called the Site' : 'The Site called you');

/** "4 min 12 s" for an answered call that has ended; null otherwise. */
export function callDuration(entry: Pick<StaffCallEntry, 'outcome' | 'started_at' | 'ended_at'>): string | null {
  if (entry.outcome !== 'answered' || !entry.ended_at) return null;
  const seconds = Math.max(0, Math.round((new Date(entry.ended_at).getTime() - new Date(entry.started_at).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** Call back: straight to the phone when it is known, otherwise to the Site. */
export function callBackUrl(siteId: number, entry: Pick<StaffCallEntry, 'site_device_id' | 'call_type'>): string {
  const params = new URLSearchParams({ siteId: String(siteId), autostart: '1' });
  if (entry.site_device_id !== null) params.set('targetSiteDeviceId', String(entry.site_device_id));
  if (entry.call_type === 'video') params.set('callType', 'video');
  return `/calls?${params}`;
}

export function parseCallbackParams(search: string): { siteId: number; targetSiteDeviceId: number | null; callType: 'voice' | 'video' } | null {
  const params = new URLSearchParams(search);
  if (params.get('autostart') !== '1' || params.get('sosAlertId')) return null;
  const positive = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  const siteId = positive('siteId');
  if (siteId === null) return null;
  return { siteId, targetSiteDeviceId: positive('targetSiteDeviceId'), callType: params.get('callType') === 'video' ? 'video' : 'voice' };
}
