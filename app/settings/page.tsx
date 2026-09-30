'use client';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Save } from 'lucide-react';
import { useState } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SiteOperationalSettingsPanel } from '@/components/site-operational-settings-panel';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canViewOperationalSettings, canViewSiteOperationalSettings, requiresOrganizationIdForSettings } from '@/lib/operational-settings';
import type { OperationalSettings } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Operational Settings management page (2026-09-17, corrected 2026-09-26) —
// the Admin Web half of migration 038's organization_settings timing
// columns. Backend remains authoritative: this page only ever reads/writes
// through GET/PATCH /management/operational-settings (management-api.ts),
// never talks to the database directly.
//
// Corrected 2026-09-26: an earlier "PER-SITE ALIGNMENT" version of this
// page assumed a `siteId`-scoped contract and a Supervisor/Admin-editable
// role model. Verified against a fresh origin/main read
// (management-operational-settings.controller.ts +
// operational-settings.service.ts): this resource is ORGANIZATION-scoped
// (the `organization_settings` table), not Site-scoped — there is no
// `siteId` on this route at all — and is authorized for exactly
// `super_admin` (must supply `organizationId`, no default — there is no
// "current org" for a platform-wide role) or `org_admin` (always their own
// org; a client-supplied organizationId is never trusted for them). No
// other role can reach this endpoint. Note: `org_admin` is not currently
// in PORTAL_ROLES (see BACKEND_GAPS.md), so in practice only `super_admin`
// can reach this page today — a real, current limitation, not hidden here.
const FIELDS: {
  key: keyof OperationalSettings;
  label: string;
  unit: string;
  helper: string;
  min: number;
  max: number;
}[] = [
  {
    key: 'guardIdleTimeoutSeconds',
    label: 'Guard inactivity timeout',
    unit: 'seconds',
    helper: 'How long a guard screen may sit idle before automatically returning to Home.',
    min: 5,
    max: 120,
  },
  {
    key: 'guardIdleWarningSeconds',
    label: 'Warning before auto-close',
    unit: 'seconds',
    helper: 'How many seconds of the countdown show a visible warning. Must be less than the timeout above.',
    min: 1,
    max: 60,
  },
  {
    key: 'nfcScanTimeoutSeconds',
    label: 'NFC reading timeout',
    unit: 'seconds',
    helper: 'How long the app waits for an NFC tag read attempt before giving up (never longer than the real checkpoint deadline).',
    min: 5,
    max: 60,
  },
  {
    key: 'weatherCacheFreshnessSeconds',
    label: 'Weather refresh / cache freshness',
    unit: 'minutes',
    helper: 'How old cached weather may get before the app fetches a fresh reading.',
    min: 1,
    max: 1440,
  },
  {
    key: 'orphanPhotoCleanupIntervalSeconds',
    label: 'Orphan evidence/photo cleanup check interval',
    unit: 'hours',
    helper: 'How often the app checks for and removes locally-stored photos no longer referenced by any queued submission.',
    min: 1,
    max: 168,
  },
  {
    key: 'catchupWindowSeconds',
    label: 'Catch-Up Window',
    unit: 'minutes',
    helper: 'How long a missed checkpoint remains available for authorized Catch-Up. Applies to newly scheduled opportunities only — a window already scheduled or active keeps its original deadline.',
    min: 5,
    max: 240,
  },
];

// weatherCacheFreshnessSeconds and orphanPhotoCleanupIntervalSeconds are
// stored/sent in seconds (matching the DB columns exactly) but are far more
// readable to an admin as minutes/hours respectively — converted only at
// this page's edges, never changing the wire contract.
const DISPLAY_UNIT_SECONDS: Partial<Record<keyof OperationalSettings, number>> = {
  weatherCacheFreshnessSeconds: 60,
  orphanPhotoCleanupIntervalSeconds: 3600,
  catchupWindowSeconds: 60,
};

function toDisplay(key: keyof OperationalSettings, seconds: number): number {
  const divisor = DISPLAY_UNIT_SECONDS[key] ?? 1;
  return Math.round((seconds / divisor) * 100) / 100;
}
function toSeconds(key: keyof OperationalSettings, displayValue: number): number {
  const divisor = DISPLAY_UNIT_SECONDS[key] ?? 1;
  return Math.round(displayValue * divisor);
}

export default function OperationalSettingsPage() {
  const session = useSession();
  const role = session.user?.role;
  const canView = !!role && canViewOperationalSettings(role);
  const canViewSite = !!role && canViewSiteOperationalSettings(role);
  const needsOrganizationId = !!role && requiresOrganizationIdForSettings(role);

  const [organizationId, setOrganizationId] = useState('');
  const [settings, setSettings] = useState<OperationalSettings | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [success, setSuccess] = useState(false);

  async function load() {
    const parsedOrganizationId = needsOrganizationId ? Number(organizationId) : undefined;
    if (needsOrganizationId && (!organizationId.trim() || !Number.isInteger(parsedOrganizationId) || parsedOrganizationId! < 1)) {
      setError('Enter a valid Organization ID. There is no Organization directory yet — this must be a known numeric id.');
      return;
    }
    setLoading(true);
    setError('');
    setFieldError('');
    setSuccess(false);
    try {
      const data = await managementApi.getOperationalSettings(session.api, parsedOrganizationId);
      setSettings(data);
      setFormValues(
        Object.fromEntries(FIELDS.map((f) => [f.key, String(toDisplay(f.key, data[f.key]))])),
      );
    } catch (reason) {
      setSettings(null);
      setError(reason instanceof ApiRequestError ? reason.message : 'Operational settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(key: keyof OperationalSettings, value: string) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  // Client-side validation is a UX convenience only — the backend
  // (UpdateOperationalSettingsDto + OperationalSettingsService's merged-
  // result check) is the real authority and re-validates everything
  // independently, including the cross-field warning-vs-timeout rule
  // against whatever is ALREADY saved for fields this form doesn't change.
  function validate(): string {
    for (const f of FIELDS) {
      const raw = formValues[f.key];
      const n = Number(raw);
      if (raw.trim() === '' || Number.isNaN(n)) return `${f.label} must be a number.`;
      if (n < f.min || n > f.max) {
        return `${f.label} must be between ${f.min} and ${f.max} ${f.unit}.`;
      }
    }
    const timeout = Number(formValues.guardIdleTimeoutSeconds);
    const warning = Number(formValues.guardIdleWarningSeconds);
    if (warning >= timeout) {
      return 'Warning before auto-close must be less than the Guard inactivity timeout.';
    }
    return '';
  }

  async function handleSave() {
    const validationError = validate();
    setFieldError(validationError);
    if (validationError) return;

    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const body = Object.fromEntries(
        FIELDS.map((f) => [f.key, toSeconds(f.key, Number(formValues[f.key]))]),
      );
      const updated = await managementApi.updateOperationalSettings(session.api, {
        ...body,
        ...(needsOrganizationId ? { organizationId: Number(organizationId) } : {}),
      });
      setSettings(updated);
      setFormValues(
        Object.fromEntries(FIELDS.map((f) => [f.key, String(toDisplay(f.key, updated[f.key]))])),
      );
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : 'Operational settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (!canView && !canViewSite) {
    return (
      <ProtectedPortal>
        <PortalShell active="settings">
          <div className="mx-auto max-w-2xl p-5 sm:p-8">
            <section className="rounded-2xl border bg-muted/20 p-5">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Configuration</p>
              <h1 className="mt-1 text-xl font-black">Operational Settings</h1>
              <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="size-4 shrink-0" />
                Operational Settings are unavailable for this role.
              </p>
            </section>
          </div>
        </PortalShell>
      </ProtectedPortal>
    );
  }

  return (
    <ProtectedPortal>
      <PortalShell active="settings">
        <div className="mx-auto max-w-2xl space-y-8 p-5 sm:p-8">
          <div>
            <p className="text-sm font-bold text-[#e86405]">Configuration</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Operational Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Guard App timing behavior, either for one Site or for your whole organization.
              Technical/safety timers (network timeouts, animations, hardware safety limits) are
              not shown here — they remain code-controlled.
            </p>
          </div>

          {canViewSite && <SiteOperationalSettingsPanel />}

          {canView && needsOrganizationId && (
            <label htmlFor="settings-organization-id" className="mt-6 grid gap-2 text-sm font-bold">
              Organization ID
              <div className="flex gap-2">
                <Input
                  id="settings-organization-id"
                  className="max-w-xs"
                  inputMode="numeric"
                  value={organizationId}
                  onChange={(e) => { setOrganizationId(e.target.value); setSettings(null); }}
                />
                <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={loading ? 'animate-spin' : ''} /> Load
                </Button>
              </div>
              <span className="font-normal text-muted-foreground">
                No Organization directory exists yet — enter a known numeric id.
              </span>
            </label>
          )}

          {canView && (
            <div>
              {canViewSite && (
                <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Organization-wide</p>
              )}

              {!needsOrganizationId && !settings && !loading && !error && (
                <Button type="button" variant="outline" onClick={() => void load()}>
                  <RefreshCw /> Load Operational Settings
                </Button>
              )}

              {error && (
                <p role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </p>
              )}

              {loading && !settings && (
                <p className="mt-8 text-sm text-muted-foreground">Loading Operational Settings…</p>
              )}

              {settings && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Clock className="size-4 text-[#f36f0a]" />
                      Guard App Timing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                    {FIELDS.map((f) => (
                      <div key={f.key} className="grid gap-1.5">
                        <Label htmlFor={f.key}>
                          {f.label} <span className="font-normal text-muted-foreground">({f.unit})</span>
                        </Label>
                        <Input
                          id={f.key}
                          type="number"
                          value={formValues[f.key] ?? ''}
                          onChange={(e) => handleChange(f.key, e.target.value)}
                          disabled={saving}
                        />
                        <p className="text-xs text-muted-foreground">{f.helper}</p>
                      </div>
                    ))}

                    {fieldError && (
                      <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
                        <AlertTriangle className="size-4 shrink-0" />
                        {fieldError}
                      </p>
                    )}
                    {success && !fieldError && (
                      <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                        <CheckCircle2 className="size-4 shrink-0" />
                        Operational settings saved.
                      </p>
                    )}

                    <Button onClick={() => void handleSave()} disabled={saving} className="w-fit gap-2">
                      <Save className="size-4" />
                      {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </PortalShell>
    </ProtectedPortal>
  );
}
