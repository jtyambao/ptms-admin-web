'use client';

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canTogglePatrolActivation } from '@/lib/site-operations';
import type { Site } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

// Patrol activation toggle (P5(c), branch release/dry-run-ops) — wires
// the existing PUT /sites/:siteId/patrol-activation. Per
// SiteAssignmentsService.setPatrolActivation's own requireRole: only
// supervisor/site_admin/super_admin may toggle it (NOT `admin` or
// org_admin today — a real, current backend limitation, not widened
// here per this task's own scope). Every other role that can reach this
// Site page still sees the current state, read-only, matching this
// app's "show state to everyone, only render the control for roles it
// allows" convention used elsewhere (e.g. Requests tab's send button).
export function SitePatrolActivationToggle({ siteId, site, onSiteChange }: {
  siteId: number;
  site: Pick<Site, 'patrol_operations_active'>;
  onSiteChange: (site: Site) => void;
}) {
  const session = useSession();
  const role = session.user?.role;
  const canToggle = !!role && canTogglePatrolActivation(role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function toggle(active: boolean) {
    setSaving(true); setError('');
    try {
      onSiteChange(await managementApi.setPatrolActivation(session.api, siteId, { active }));
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : 'Patrols could not be switched. Please try again.');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Patrols at this Site</p>
          <p className="mt-1 font-black">{site.patrol_operations_active ? 'On' : 'Off'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Switch on when the Site is ready for guards to start patrols.</p>
        </div>
        <Switch
          checked={site.patrol_operations_active}
          onCheckedChange={(checked) => void toggle(checked)}
          disabled={!canToggle || saving}
          aria-label="Turn patrols on or off"
        />
      </div>
      {!canToggle && (
        <p className="mt-3 text-xs text-muted-foreground">Ask the Site Supervisor to turn patrols on or off.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <AlertTriangle className="size-3.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
