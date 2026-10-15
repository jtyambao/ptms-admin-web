import type { SpecialCheckRequestDetailed } from './ptms-api';

// Plain-language status for the Requests list. The database/API keep the
// original lifecycle words (sent -> acknowledged -> completed, or
// expired); the UI says "Pending" for "sent" because that is how an admin
// thinks of a request nobody has picked up yet. A Spot request is an
// additional Checkpoint Due Soon (2026-10-15): it reads Scheduled until its
// time, Due now while the guard's alert is running, then Completed, or Missed
// when the timer ended with no tap.
export function requestStatusLabel(
  status: SpecialCheckRequestDetailed['status'],
  scheduledPending = false,
  type: SpecialCheckRequestDetailed['type'] = 'standard',
): string {
  if (scheduledPending && status === 'sent') return 'Scheduled';
  if (type === 'spot_visit') {
    switch (status) {
      case 'sent':
      case 'acknowledged': return 'Due now';
      case 'completed': return 'Completed';
      case 'expired': return 'Missed';
    }
  }
  switch (status) {
    case 'sent': return 'Pending';
    case 'acknowledged': return 'Acknowledged';
    case 'completed': return 'Completed';
    case 'expired': return 'Expired';
  }
}

export interface RequestStep {
  label: string;
  at: string | null;
  who: string | null;
  note: string | null;
}

// The who/when trail shown under each request. Only the SENDER is a
// person: the Guard app's acknowledge/complete record no user (one
// shared OIC login per Site), so those steps are honestly attributed to
// "the Site device" rather than guessing a name.
export function requestStatusSteps(request: SpecialCheckRequestDetailed): RequestStep[] {
  const sender = request.sender_name ?? 'an administrator';
  const spot = request.type === 'spot_visit';
  // Scheduled and not due yet: it has not been "sent" to the guard, so the trail says it was created.
  const steps: RequestStep[] = request.scheduled_pending
    ? [{ label: 'Created', at: request.created_at ?? null, who: sender, note: null }]
    : [{ label: spot ? 'Became due' : 'Sent', at: request.sent_at, who: sender, note: null }];
  if (spot) {
    // A spot is done from the guard's Checkpoint Due Soon alert; the request only mirrors the outcome.
    if (request.status === 'completed') {
      steps.push({ label: 'Completed', at: request.completed_at, who: 'the Site device', note: 'every checkpoint scanned' });
    } else if (request.status === 'expired') {
      steps.push({ label: 'Missed', at: null, who: null, note: 'the timer ended before every checkpoint was scanned' });
    }
    return steps;
  }
  if (request.acknowledged_at) {
    steps.push({ label: 'Acknowledged', at: request.acknowledged_at, who: 'the Site device', note: null });
  }
  if (request.completed_at) {
    steps.push({ label: 'Completed', at: request.completed_at, who: 'the Site device', note: request.completion_remarks });
  }
  if (request.status === 'expired') {
    steps.push({ label: 'Expired', at: request.needed_by, who: null, note: 'not completed before its "needed by" time' });
  }
  return steps;
}

// The list line for a scheduled request that is still waiting for its time, else null.
export function scheduledNotice(request: SpecialCheckRequestDetailed, format: (iso: string) => string): string | null {
  if (!request.scheduled_pending || !request.scheduled_at) return null;
  return `Scheduled for ${format(request.scheduled_at)} — not yet shown to the guard`;
}

// "Time allowed to finish" for a spot request = the tap timer after the guard presses Acknowledge on the
// regular Checkpoint Due Soon alert. 'regular' = no custom time (the regular Due Soon tap window).
export const ALLOWED_TIME_CHOICES: { value: string; label: string }[] = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: 'regular', label: 'Same as a regular Due Soon' },
];

/** The minutes to store for a choice, or null for the regular Due Soon time. */
export function allowedMinutesFromChoice(choice: string): number | null {
  const minutes = Number(choice);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** The choice that represents a stored value (for editing). */
export function choiceFromAllowedMinutes(minutes: number | null | undefined): string {
  return minutes && ALLOWED_TIME_CHOICES.some((c) => c.value === String(minutes)) ? String(minutes) : minutes ? String(minutes) : 'regular';
}

/** Plain words for a stored value. */
export function allowedTimeLabel(minutes: number | null | undefined): string {
  if (!minutes) return 'the regular Due Soon time';
  if (minutes === 60) return '1 hour';
  if (minutes % 60 === 0 && minutes < 1440) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

const MAX_SCHEDULE_DAYS = 30;

// Checks the two datetime-local values (local time, 'YYYY-MM-DDTHH:mm') before sending, in plain
// words, mirroring the backend rules. Returns the problem, or null when fine / nothing scheduled.
export function scheduleProblem(scheduledAt: string, neededBy: string, now: number = Date.now()): string | null {
  if (!scheduledAt) return null;
  const at = new Date(scheduledAt).getTime();
  if (Number.isNaN(at)) return 'Please pick a valid date and time to show the request to the guard.';
  if (at <= now) return 'The time to show the request to the guard must be in the future. Leave it empty to send now.';
  if (at > now + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) return `A request can be scheduled at most ${MAX_SCHEDULE_DAYS} days ahead.`;
  if (neededBy) {
    const needed = new Date(neededBy).getTime();
    if (!Number.isNaN(needed) && needed <= at) return '"Needed by" must be later than the time the request is shown to the guard.';
  }
  return null;
}
