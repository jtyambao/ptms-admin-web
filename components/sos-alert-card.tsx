'use client';

import { CheckCircle2, MapPin, Siren } from 'lucide-react';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError, type AuthenticatedApiClient } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { formatElapsed, mapsUrl } from '@/lib/sos-console';
import type { SosAlertEntry } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';
import { describeSosSender, useSosSenderInfo } from '@/lib/sos-sender-info';

// One open SOS alert and the actions on it (Acknowledge -> Resolve / False
// alarm). Shared by the SOS page and by the Calls page, which keeps the
// alert on screen while "Call sender now" is ringing or connected.
export type SosAction = { kind: 'resolve' | 'cancel'; alert: SosAlertEntry };

function errorMessage(reason: unknown): string {
  return reason instanceof ApiRequestError ? reason.message : 'The action could not be completed.';
}

export function useSosActions(
  api: AuthenticatedApiClient,
  onChanged: () => Promise<void> | void,
  // Called after an SOS is resolved or cancelled (the Calls page ends the
  // call to the SOS phone at that point).
  onClosed?: (alert: SosAlertEntry) => void,
) {
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [action, setAction] = useState<SosAction | null>(null);
  const [note, setNote] = useState('');

  async function acknowledge(alert: SosAlertEntry) {
    setActingOn(alert.id); setError(''); setSuccess('');
    try {
      await managementApi.acknowledgeSos(api, alert.id);
      setSuccess('Acknowledged - the guards at that Site can see someone is responding.');
      await onChanged();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setActingOn(null); }
  }

  function openAction(kind: SosAction['kind'], alert: SosAlertEntry) {
    setNote(''); setError(''); setAction({ kind, alert });
  }

  async function submitAction(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setActingOn(action.alert.id); setError(''); setSuccess('');
    try {
      if (action.kind === 'resolve') await managementApi.resolveSos(api, action.alert.id, note.trim() || undefined);
      else await managementApi.cancelSos(api, action.alert.id, note.trim() || undefined);
      setSuccess(action.kind === 'resolve' ? 'Marked resolved.' : 'Cancelled as a false alarm.');
      onClosed?.(action.alert);
      setAction(null);
      await onChanged();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setActingOn(null); }
  }

  return { actingOn, error, success, action, note, setNote, setAction, acknowledge, openAction, submitAction };
}

export function SosAlertCard({
  alert, now, location, canRespond, actingOn, onAcknowledge, onOpenAction, callSlot,
}: {
  alert: SosAlertEntry;
  now: number;
  location?: { key: string; changedAt: number };
  canRespond: boolean;
  actingOn: number | null;
  onAcknowledge: (alert: SosAlertEntry) => void;
  onOpenAction: (kind: SosAction['kind'], alert: SosAlertEntry) => void;
  /** The call button(s): "Call sender now", or "Call the Site" when the alert names no phone. */
  callSlot?: ReactNode;
}) {
  const session = useSession();
  const senderInfo = useSosSenderInfo(session.api, [alert]);
  const isNew = alert.status === 'active';
  const hasLocation = alert.latitude !== null && alert.longitude !== null;
  return (
    <div className={`rounded-2xl border-2 p-5 ${isNew ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Siren className={`size-6 ${isNew ? 'animate-pulse text-red-600' : 'text-amber-600'}`} />
        <p className="text-lg font-black">{alert.site_name ?? 'Unknown Site'}</p>
        <Badge variant={isNew ? 'destructive' : 'secondary'} className="uppercase">{isNew ? 'New - needs a response' : 'Responding'}</Badge>
        <p className="ml-auto text-2xl font-black tabular-nums">{formatElapsed(alert.triggered_at, now)}</p>
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline font-bold">Sent by: </dt><dd className="inline">{describeSosSender(alert, senderInfo[alert.id])}</dd></div>
        <div><dt className="inline font-bold">Triggered: </dt><dd className="inline">{new Date(alert.triggered_at).toLocaleString()}</dd></div>
        {alert.acknowledged_at && (
          <div><dt className="inline font-bold">Acknowledged: </dt><dd className="inline">{new Date(alert.acknowledged_at).toLocaleTimeString()}{alert.acknowledged_by_name ? ` by ${alert.acknowledged_by_name}` : ''}</dd></div>
        )}
        <div>
          <dt className="inline font-bold">Location: </dt>
          <dd className="inline">
            {hasLocation ? (
              <>
                <a className="inline-flex items-center gap-1 font-bold underline" href={mapsUrl(alert.latitude!, alert.longitude!)} target="_blank" rel="noreferrer">
                  <MapPin className="size-3" />Open map
                </a>
                <span className="ml-2 text-xs text-muted-foreground">
                  {alert.latitude!.toFixed(5)}, {alert.longitude!.toFixed(5)}
                  {location && now - location.changedAt > 2000 ? ` · last moved ${formatElapsed(new Date(location.changedAt).toISOString(), now)} ago` : ' · just updated'}
                </span>
              </>
            ) : <span className="text-muted-foreground">Waiting for the guard&apos;s GPS…</span>}
          </dd>
        </div>
      </dl>
      {canRespond && (
        <div className="mt-4 flex flex-wrap gap-2">
          {callSlot}
          {isNew ? (
            <Button size="lg" className="bg-red-600 text-white hover:bg-red-700" disabled={actingOn === alert.id} onClick={() => onAcknowledge(alert)}>
              <Siren />Acknowledge - I&apos;m responding
            </Button>
          ) : (
            <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={actingOn === alert.id} onClick={() => onOpenAction('resolve', alert)}>
              <CheckCircle2 />Resolve
            </Button>
          )}
          {isNew && (
            <Button size="lg" variant="outline" disabled={actingOn === alert.id} onClick={() => onOpenAction('resolve', alert)}>
              Resolve (already handled)
            </Button>
          )}
          <Button size="lg" variant="outline" disabled={actingOn === alert.id} onClick={() => onOpenAction('cancel', alert)}>
            False alarm - cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export function SosActionDialog({ actions }: { actions: ReturnType<typeof useSosActions> }) {
  const { action, note, setNote, setAction, submitAction, actingOn, error } = actions;
  return (
    <Dialog open={!!action} onOpenChange={(openState) => { if (!openState) setAction(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.kind === 'resolve' ? 'Resolve this SOS' : 'Cancel as a false alarm'}</DialogTitle>
          <DialogDescription>
            {action?.kind === 'resolve'
              ? 'Close it out as a real emergency that has been handled. Say what happened.'
              : 'Use this when there was no emergency. It is kept in the history as cancelled.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitAction}>
          <label htmlFor="sos-note" className="grid gap-2 font-bold">
            {action?.kind === 'resolve' ? 'What happened / what was done' : 'Reason'} <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea id="sos-note" rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700 dark:text-red-400">{error}</p>}
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => setAction(null)}>Back</Button>
            <Button type="submit" disabled={actingOn !== null} className={action?.kind === 'resolve' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}>
              {action?.kind === 'resolve' ? 'Mark resolved' : 'Cancel the alert'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
