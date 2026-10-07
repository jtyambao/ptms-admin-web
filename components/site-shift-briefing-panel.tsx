'use client';

import { AlertTriangle, BadgeCheck, NotebookPen } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Disclosure, ShowMore, useShowMore } from '@/components/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canManageSiteOperations } from '@/lib/site-operations';
import type { ShiftBriefing } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Pre-Shift Briefing - what the Guard app shows on its Home screen at the
// start of a shift. Audited as a user 2026-10-07: it used to be buried at
// the bottom of the Overview tab, with single-line inputs for a free-text
// note, no history, and no way to "edit". Now its own tab, with the
// CURRENT briefing up top, a form to publish a new one (edit = a new
// entry, pre-filled from the current one; the old one stays in History),
// and a History list. The write form is gated by canManageSiteOperations
// (matches the backend's requireManageAccess); reading is open to anyone
// who can see the Site (the history endpoint is requireReadAccess).
const SHORT_MAX = 255;

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return 'just now';
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function BriefingBody({ briefing }: { briefing: ShiftBriefing }) {
  const empty = !briefing.handover_note && !briefing.equipment_check_note && !briefing.weather_advisory;
  return (
    <div className="space-y-1 text-sm">
      {briefing.handover_note && <p className="whitespace-pre-wrap"><span className="font-bold">Handover:</span> {briefing.handover_note}</p>}
      {briefing.equipment_check_note && <p><span className="font-bold">Equipment:</span> {briefing.equipment_check_note}</p>}
      {briefing.weather_advisory && <p><span className="font-bold">Weather:</span> {briefing.weather_advisory}</p>}
      {empty && <p className="text-muted-foreground">(empty briefing)</p>}
    </div>
  );
}

export function SiteShiftBriefingPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canWrite = !!role && canManageSiteOperations(role);

  const [history, setHistory] = useState<ShiftBriefing[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [handoverNote, setHandoverNote] = useState('');
  const [equipmentCheckNote, setEquipmentCheckNote] = useState('');
  const [weatherAdvisory, setWeatherAdvisory] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      setHistory(await managementApi.listShiftBriefingHistory(session.api, siteId));
    } catch (reason) {
      setLoadError(reason instanceof ApiRequestError ? reason.message : 'The Pre-Shift Briefing could not be loaded.');
    } finally { setLoading(false); }
  }, [session.api, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const current = history[0] ?? null;
  const older = history.slice(1);
  const blank = !handoverNote.trim() && !equipmentCheckNote.trim() && !weatherAdvisory.trim();

  function startFromCurrent() {
    if (!current) return;
    setHandoverNote(current.handover_note ?? '');
    setEquipmentCheckNote(current.equipment_check_note ?? '');
    setWeatherAdvisory(current.weather_advisory ?? '');
    setSuccess(false);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blank) return;
    setSaving(true); setSaveError(''); setSuccess(false);
    try {
      const created = await managementApi.createShiftBriefing(session.api, siteId, {
        ...(handoverNote.trim() ? { handoverNote: handoverNote.trim() } : {}),
        ...(equipmentCheckNote.trim() ? { equipmentCheckNote: equipmentCheckNote.trim() } : {}),
        ...(weatherAdvisory.trim() ? { weatherAdvisory: weatherAdvisory.trim() } : {}),
      });
      setHistory((prev) => [created, ...prev]);
      setHandoverNote(''); setEquipmentCheckNote(''); setWeatherAdvisory('');
      setSuccess(true);
    } catch (reason) {
      setSaveError(reason instanceof ApiRequestError ? reason.message : 'The Pre-Shift Briefing could not be saved.');
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Guard Home screen</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-black"><NotebookPen className="size-5 text-[#f36f0a]" />Pre-Shift Briefing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The guards at this Site see the <strong>current</strong> briefing on the Home screen of the Guard app.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {loadError && (
        <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <AlertTriangle className="size-4 shrink-0" />{loadError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-2 flex items-center gap-2">
            <p className="font-black">Current briefing</p>
            {current && <Badge variant="secondary">{ago(current.created_at)}</Badge>}
          </div>
          {current ? (
            <>
              <BriefingBody briefing={current} />
              <p className="mt-2 text-xs text-muted-foreground">Published {new Date(current.created_at).toLocaleString()}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No briefing yet - guards see an empty card until one is published.</p>
          )}
        </div>
      )}

      {canWrite ? (
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-black">Publish a new briefing</p>
            {current && (
              <Button type="button" variant="outline" size="sm" onClick={startFromCurrent}>Start from current briefing</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            To change the briefing, publish a new one. The old one is kept under History - nothing is overwritten.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="briefing-handover">Handover note</Label>
            <Textarea id="briefing-handover" rows={3} value={handoverNote} placeholder="What the next shift needs to know" onChange={(e) => { setHandoverNote(e.target.value); setSuccess(false); }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="briefing-equipment">Equipment check <span className="font-normal text-muted-foreground">({equipmentCheckNote.length}/{SHORT_MAX})</span></Label>
            <Input id="briefing-equipment" value={equipmentCheckNote} placeholder="e.g. Flashlight at the gate is missing" onChange={(e) => { setEquipmentCheckNote(e.target.value); setSuccess(false); }} maxLength={SHORT_MAX} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="briefing-weather">Weather advisory <span className="font-normal text-muted-foreground">({weatherAdvisory.length}/{SHORT_MAX})</span></Label>
            <Input id="briefing-weather" value={weatherAdvisory} placeholder="e.g. Heavy rain expected after 6 PM" onChange={(e) => { setWeatherAdvisory(e.target.value); setSuccess(false); }} maxLength={SHORT_MAX} />
          </div>

          {saveError && (
            <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
              <AlertTriangle className="size-4 shrink-0" />{saveError}
            </p>
          )}
          {success && (
            <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <BadgeCheck className="size-4 shrink-0" />Published. Guards will see it on their Home screen.
            </p>
          )}
          <Button type="submit" disabled={saving || blank} className="w-fit bg-[#f36f0a] text-white hover:bg-[#d95e00]">
            {saving ? 'Publishing...' : 'Publish briefing'}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Your role can read the briefing but cannot publish one.</p>
      )}

      {older.length > 0 && <BriefingHistory older={older} />}
    </section>
  );
}

// Older briefings: collapsed by default, newest 5, "Show more" for the rest.
function BriefingHistory({ older }: { older: ShiftBriefing[] }) {
  const { visible, remaining, showMore, step } = useShowMore(older, 5, 10);
  return (
    <Disclosure title="History" count={older.length}>
      <div className="divide-y">
        {visible.map((briefing) => (
          <div key={briefing.id} className="p-4">
            <p className="mb-1 text-xs text-muted-foreground">{new Date(briefing.created_at).toLocaleString()}</p>
            <BriefingBody briefing={briefing} />
          </div>
        ))}
      </div>
      <ShowMore remaining={remaining} onClick={showMore} step={step} />
    </Disclosure>
  );
}
