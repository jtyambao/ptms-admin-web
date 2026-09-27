'use client';

import { AlertTriangle, BadgeCheck, NotebookPen } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canManageSiteOperations } from '@/lib/site-operations';
import type { ShiftBriefing } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Shift Briefing (P5(b), branch release/dry-run-ops) — closes the
// write-path gap sql/021/sites.service.ts's own comment documented
// ("there's no Admin Portal to write one yet"). The write form is gated
// by canManageSiteOperations, matching the backend's requireManageAccess
// exactly (supervisor/site_admin/admin own Site, org_admin org-wide,
// super_admin cross-tenant); the latest briefing itself is shown to
// anyone who can see this Site page (the GET is Guard-facing/
// unauthenticated at the backend, same as every other read-only report).
export function SiteShiftBriefingPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canWrite = !!role && canManageSiteOperations(role);

  const [latest, setLatest] = useState<ShiftBriefing | null>(null);
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
      setLatest(await managementApi.getLatestShiftBriefing(session.api, siteId));
    } catch (reason) {
      setLoadError(reason instanceof ApiRequestError ? reason.message : 'The latest Shift Briefing could not be loaded.');
    } finally { setLoading(false); }
  }, [session.api, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!handoverNote.trim() && !equipmentCheckNote.trim() && !weatherAdvisory.trim()) return;
    setSaving(true); setSaveError(''); setSuccess(false);
    try {
      const created = await managementApi.createShiftBriefing(session.api, siteId, {
        ...(handoverNote.trim() ? { handoverNote: handoverNote.trim() } : {}),
        ...(equipmentCheckNote.trim() ? { equipmentCheckNote: equipmentCheckNote.trim() } : {}),
        ...(weatherAdvisory.trim() ? { weatherAdvisory: weatherAdvisory.trim() } : {}),
      });
      setLatest(created);
      setHandoverNote(''); setEquipmentCheckNote(''); setWeatherAdvisory('');
      setSuccess(true);
    } catch (reason) {
      setSaveError(reason instanceof ApiRequestError ? reason.message : 'The Shift Briefing could not be saved.');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-4 text-[#f36f0a]" />
        <p className="font-black">Shift Briefing</p>
      </div>

      {loading && <p className="mt-3 text-sm text-muted-foreground">Loading latest Shift Briefing…</p>}
      {loadError && (
        <p role="alert" className="mt-3 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <AlertTriangle className="size-4 shrink-0" />{loadError}
        </p>
      )}
      {!loading && !loadError && (
        <div className="mt-3 rounded-xl border border-dashed p-3 text-sm">
          {latest ? (
            <div className="space-y-1">
              {latest.handover_note && <p><span className="font-bold">Handover:</span> {latest.handover_note}</p>}
              {latest.equipment_check_note && <p><span className="font-bold">Equipment:</span> {latest.equipment_check_note}</p>}
              {latest.weather_advisory && <p><span className="font-bold">Weather:</span> {latest.weather_advisory}</p>}
              <p className="text-xs text-muted-foreground">{new Date(latest.created_at).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">No Shift Briefing yet for this Site.</p>
          )}
        </div>
      )}

      {canWrite ? (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="briefing-handover">Handover note</Label>
            <Input id="briefing-handover" value={handoverNote} onChange={(e) => { setHandoverNote(e.target.value); setSuccess(false); }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="briefing-equipment">Equipment check</Label>
            <Input id="briefing-equipment" value={equipmentCheckNote} onChange={(e) => { setEquipmentCheckNote(e.target.value); setSuccess(false); }} maxLength={255} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="briefing-weather">Weather advisory</Label>
            <Input id="briefing-weather" value={weatherAdvisory} onChange={(e) => { setWeatherAdvisory(e.target.value); setSuccess(false); }} maxLength={255} />
          </div>

          {saveError && (
            <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
              <AlertTriangle className="size-4 shrink-0" />{saveError}
            </p>
          )}
          {success && (
            <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <BadgeCheck className="size-4 shrink-0" />Shift Briefing saved.
            </p>
          )}

          <Button
            type="submit"
            disabled={saving || (!handoverNote.trim() && !equipmentCheckNote.trim() && !weatherAdvisory.trim())}
            className="w-fit"
          >
            {saving ? 'Saving…' : 'Save Shift Briefing'}
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Your role cannot write a Shift Briefing under current production RBAC.</p>
      )}
    </div>
  );
}
