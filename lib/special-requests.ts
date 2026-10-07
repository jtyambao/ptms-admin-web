import type { SpecialCheckRequestDetailed } from './ptms-api';

// Plain-language status for the Requests list. The database/API keep the
// original lifecycle words (sent -> acknowledged -> completed, or
// expired); the UI says "Pending" for "sent" because that is how an admin
// thinks of a request nobody has picked up yet.
export function requestStatusLabel(status: SpecialCheckRequestDetailed['status']): string {
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
  const steps: RequestStep[] = [
    { label: 'Sent', at: request.sent_at, who: request.sender_name ?? 'an administrator', note: null },
  ];
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
