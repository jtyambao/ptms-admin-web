'use client';

import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canEditSiteOperationalSettings } from '@/lib/operational-settings';
import type { Site, SiteOperationalSettings } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Per-Site Operational Settings (P3, branch feat/admin-oic-management,
// per PTMS_FINAL_ROLE_PERMISSION_POLICY.md's own documented design) —
// friendly presets for the three Guard-timing fields explicitly named in
// this task (15s/30s/1min/2min, filtered to what each field's own range
// actually allows), so a non-technical admin never has to compute or
// enter a raw seconds value. "Default" is a whole-row Reset action
// (calls DELETE, shown only when this Site currently has an override) —
// the override table has no nullable columns, so a per-field "back to
// org default" can't be expressed as a stored null; a full reset is the
// honest equivalent. The other three settings (weather cache, orphan
// photo cleanup, Catch-Up window) keep plain number inputs — they were
// not named in this task's preset ask and are tuned far less often.
const SECONDS_PRESETS = [
  { label: '15 seconds', seconds: 15 },
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute', seconds: 60 },
  { label: '2 minutes', seconds: 120 },
] as const;

type PresetFieldKey = 'guardIdleTimeoutSeconds' | 'guardIdleWarningSeconds' | 'nfcScanTimeoutSeconds';

const PRESET_FIELDS: { key: PresetFieldKey; label: string; helper: string; min: number; max: number }[] = [
  {
    key: 'guardIdleTimeoutSeconds',
    label: 'Return to the Home screen after the guard is idle for',
    helper: 'If nobody touches the Guard phone for this long, it goes back to the Home screen.',
    min: 5,
    max: 120,
  },
  {
    key: 'guardIdleWarningSeconds',
    label: 'Show a warning during the last',
    helper: 'The warning the guard sees before the screen closes by itself. Must be shorter than the idle time above.',
    min: 1,
    max: 60,
  },
  {
    key: 'nfcScanTimeoutSeconds',
    label: 'Wait for an NFC tag scan for up to',
    helper: 'How long the app waits for the guard to hold the phone on a tag before giving up.',
    min: 5,
    max: 60,
  },
];

const OTHER_FIELDS: { key: 'weatherCacheFreshnessSeconds' | 'orphanPhotoCleanupIntervalSeconds' | 'catchupWindowSeconds'; label: string; unit: string; divisor: number; min: number; max: number }[] = [
  { key: 'weatherCacheFreshnessSeconds', label: 'Refresh the weather every', unit: 'minutes', divisor: 60, min: 1, max: 1440 },
  { key: 'orphanPhotoCleanupIntervalSeconds', label: 'Clean up unused photos every', unit: 'hours', divisor: 3600, min: 1, max: 168 },
  { key: 'catchupWindowSeconds', label: 'Time allowed to make up a missed checkpoint', unit: 'minutes', divisor: 60, min: 5, max: 240 },
];

function PresetField({ id, label, helper, min, max, value, onChange }: {
  id: string; label: string; helper: string; min: number; max: number;
  value: string; onChange: (v: string) => void;
}) {
  const options = SECONDS_PRESETS.filter((p) => p.seconds >= min && p.seconds <= max);
  const preset = options.find((p) => String(p.seconds) === value);
  const isCustom = value.trim() !== '' && !preset;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-10 rounded-lg border bg-background px-3 font-normal"
        value={preset ? String(preset.seconds) : 'custom'}
        onChange={(e) => onChange(e.target.value === 'custom' ? (isCustom ? value : String(options[0]?.seconds ?? min)) : e.target.value)}
      >
        {options.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
        <option value="custom">Custom</option>
      </select>
      {isCustom && (
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export function SiteOperationalSettingsPanel() {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canEdit = !!role && canEditSiteOperationalSettings(role);

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [settings, setSettings] = useState<SiteOperationalSettings | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [success, setSuccess] = useState('');

  const populateForm = useCallback((data: SiteOperationalSettings) => {
    setFormValues({
      guardIdleTimeoutSeconds: String(data.guardIdleTimeoutSeconds),
      guardIdleWarningSeconds: String(data.guardIdleWarningSeconds),
      nfcScanTimeoutSeconds: String(data.nfcScanTimeoutSeconds),
      weatherCacheFreshnessSeconds: String(Math.round((data.weatherCacheFreshnessSeconds / 60) * 100) / 100),
      orphanPhotoCleanupIntervalSeconds: String(Math.round((data.orphanPhotoCleanupIntervalSeconds / 3600) * 100) / 100),
      catchupWindowSeconds: String(Math.round((data.catchupWindowSeconds / 60) * 100) / 100),
    });
  }, []);

  const loadSettingsFor = useCallback(async (id: number) => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const data = await managementApi.getSiteOperationalSettings(session.api, id);
      setSettings(data);
      populateForm(data);
    } catch (reason) {
      setSettings(null);
      setError(reason instanceof ApiRequestError ? reason.message : 'Operational settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [session.api, populateForm]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    managementApi.listSites(session.api)
      .then((rows) => {
        if (!active) return;
        setSites(rows);
        if (rows.length > 0) {
          setSiteId(rows[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof ApiRequestError ? reason.message : 'Sites could not be loaded.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [session.api]);

  useEffect(() => {
    if (siteId !== null) void loadSettingsFor(siteId);
  }, [siteId, loadSettingsFor]);

  function validate(): string {
    for (const f of PRESET_FIELDS) {
      const n = Number(formValues[f.key]);
      if (formValues[f.key]?.trim() === '' || Number.isNaN(n)) return `Check "${f.label}": it must be a number.`;
      if (n < f.min || n > f.max) return `Check "${f.label}": it must be between ${f.min} and ${f.max} seconds.`;
    }
    for (const f of OTHER_FIELDS) {
      const n = Number(formValues[f.key]);
      if (formValues[f.key]?.trim() === '' || Number.isNaN(n)) return `Check "${f.label}": it must be a number.`;
      if (n < f.min || n > f.max) return `Check "${f.label}": it must be between ${f.min} and ${f.max} ${f.unit}.`;
    }
    const timeout = Number(formValues.guardIdleTimeoutSeconds);
    const warning = Number(formValues.guardIdleWarningSeconds);
    if (warning >= timeout) return 'The warning time must be shorter than the idle time.';
    return '';
  }

  async function handleSave() {
    if (siteId === null) return;
    const validationError = validate();
    setFieldError(validationError);
    if (validationError) return;

    setSaving(true); setError(''); setSuccess('');
    try {
      const updated = await managementApi.updateSiteOperationalSettings(session.api, siteId, {
        guardIdleTimeoutSeconds: Number(formValues.guardIdleTimeoutSeconds),
        guardIdleWarningSeconds: Number(formValues.guardIdleWarningSeconds),
        nfcScanTimeoutSeconds: Number(formValues.nfcScanTimeoutSeconds),
        weatherCacheFreshnessSeconds: Math.round(Number(formValues.weatherCacheFreshnessSeconds) * 60),
        orphanPhotoCleanupIntervalSeconds: Math.round(Number(formValues.orphanPhotoCleanupIntervalSeconds) * 3600),
        catchupWindowSeconds: Math.round(Number(formValues.catchupWindowSeconds) * 60),
      });
      setSettings(updated);
      populateForm(updated);
      setSuccess('Operational settings saved for this Site.');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : 'Operational settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (siteId === null) return;
    setResetting(true); setError(''); setSuccess('');
    try {
      const updated = await managementApi.resetSiteOperationalSettings(session.api, siteId);
      setSettings(updated);
      populateForm(updated);
      setSuccess('This Site follows the organization settings again.');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : 'The settings could not be reset. Please try again.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-[#f36f0a]" />
            Guard app timing for one Site
          </CardTitle>
          {settings && (
            <Badge variant={settings.hasOverride ? 'secondary' : 'outline'}>
              {settings.hasOverride ? 'Custom for this Site' : 'Same as the organization'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <p className="text-sm text-muted-foreground">
          These settings apply only to the Site chosen below. If you do not change them, the Site
          follows your organization&apos;s settings.
        </p>

        {sites.length > 1 && (
          <label htmlFor="site-operational-settings-site" className="grid gap-2 text-sm font-bold">
            Site
            <select
              id="site-operational-settings-site"
              className="h-10 max-w-sm rounded-lg border bg-background px-3 font-normal"
              value={siteId ?? ''}
              onChange={(e) => setSiteId(Number(e.target.value))}
            >
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        {sites.length === 1 && (
          <p className="text-sm font-bold">{sites[0].name}</p>
        )}
        {sites.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">You have no Sites yet.</p>
        )}

        {error && (
          <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            <AlertTriangle className="size-4 shrink-0" />{error}
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {settings && !loading && (
          <>
            {PRESET_FIELDS.map((f) => (
              <PresetField
                key={f.key}
                id={`site-${f.key}`}
                label={f.label}
                helper={f.helper}
                min={f.min}
                max={f.max}
                value={formValues[f.key] ?? ''}
                onChange={(v) => { setFormValues((prev) => ({ ...prev, [f.key]: v })); setSuccess(''); }}
              />
            ))}
            {OTHER_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`site-${f.key}`}>{f.label} <span className="font-normal text-muted-foreground">({f.unit})</span></Label>
                <Input
                  id={`site-${f.key}`}
                  type="number"
                  value={formValues[f.key] ?? ''}
                  onChange={(e) => { setFormValues((prev) => ({ ...prev, [f.key]: e.target.value })); setSuccess(''); }}
                  disabled={saving}
                />
              </div>
            ))}

            {fieldError && (
              <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                <AlertTriangle className="size-4 shrink-0" />{fieldError}
              </p>
            )}
            {success && (
              <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                <CheckCircle2 className="size-4 shrink-0" />{success}
              </p>
            )}

            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleSave()} disabled={saving} className="w-fit gap-2">
                  <Save className="size-4" />{saving ? 'Saving…' : 'Save for this Site'}
                </Button>
                {settings.hasOverride && (
                  <Button variant="outline" onClick={() => void handleReset()} disabled={resetting} className="w-fit gap-2">
                    <RotateCcw className="size-4" />{resetting ? 'Resetting…' : 'Go back to the organization settings'}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">You can see this Site&apos;s settings but cannot change them.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
