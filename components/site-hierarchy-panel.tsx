'use client';

import { AlertTriangle, BadgeCheck, History, Plus, ShieldCheck, UserCog, UserX } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canSetUpAdmin, canSetUpSupervisor } from '@/lib/site-setup';
import type { AssignmentHistory, SiteUserAssignment, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type Tier = 'supervisor' | 'admin';

// P4 fix (branch release/dry-run-ops backend commit 06cb63e) —
// getStaffingStatus now surfaces the `admin` assignment as its own field,
// closing the gap this panel's own prior comment documented. Switched
// creation/assignment to the final-role-model `admin` tier
// (createAdminAccount/assignAdmin); a Site whose Admin tier still shows a
// legacy `site_admin` assignment (created before this cutover) keeps
// showing it, read-only — this panel no longer creates or reassigns
// site_admin, but does not hide or touch an existing one.
export function SiteHierarchyPanel({ siteId, staffing, onStaffingChange }: {
  siteId: number;
  staffing: StaffingStatus | null;
  onStaffingChange: (value: StaffingStatus) => void;
}) {
  const session = useSession();
  const role = session.user?.role;
  const canSupervisor = !!role && canSetUpSupervisor(role);
  const canAdmin = !!role && canSetUpAdmin(role);
  const [tier, setTier] = useState<Tier | null>(null);
  const [history, setHistory] = useState<AssignmentHistory | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<SiteUserAssignment | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => () => setPassword(''), []);

  function close() {
    setTier(null); setPendingUserId(null); setFullName(''); setEmail(''); setPassword(''); setReason('');
  }

  async function createAndAssign(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tier || (!pendingUserId && (!fullName.trim() || !email.trim() || password.length < 8))) return;
    setSaving(true); setError(''); setSuccess('');
    let assignmentUserId = pendingUserId;
    try {
      assignmentUserId = pendingUserId ?? (tier === 'supervisor'
        ? (await managementApi.createSupervisorAccount(session.api, { fullName: fullName.trim(), email: email.trim(), password })).id
        : (await managementApi.createAdminAccount(session.api, siteId, { fullName: fullName.trim(), email: email.trim(), password })).id);
      setPendingUserId(assignmentUserId);
      if (tier === 'supervisor') {
        await managementApi.assignSupervisor(session.api, siteId, { userId: assignmentUserId, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      } else {
        // Add Admin (P4, sql/049) — additive, never closes an existing
        // active admin. This dialog is now always "Add", never "Change/
        // Replace", for the Admin tier.
        await managementApi.addAdmin(session.api, siteId, { userId: assignmentUserId, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      }
      setPassword('');
      onStaffingChange(await managementApi.getStaffing(session.api, siteId));
      setSuccess(`${tier === 'supervisor' ? 'Supervisor' : 'Admin'} account created and assigned.`);
      close();
    } catch (cause) {
      setPassword('');
      setError(assignmentUserId ? 'The account exists, but assignment did not complete. Retry the assignment.' : cause instanceof ApiRequestError ? cause.message : 'The assignment could not be completed.');
    } finally { setSaving(false); }
  }

  function openDeactivate(target: SiteUserAssignment) {
    setDeactivateReason(''); setError(''); setDeactivateTarget(target);
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true); setError('');
    try {
      await managementApi.deactivateAdminAccount(session.api, siteId, deactivateTarget.user_id, deactivateReason.trim() || undefined);
      onStaffingChange(await managementApi.getStaffing(session.api, siteId));
      setSuccess('Admin account deactivated.');
      setDeactivateTarget(null);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'The Admin account could not be deactivated.');
    } finally { setDeactivating(false); }
  }

  async function openHistory() {
    setError('');
    try {
      setHistory(await managementApi.getAssignmentHistory(session.api, siteId));
      setHistoryOpen(true);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Assignment history could not be loaded.');
    }
  }

  return (
    <section aria-labelledby="hierarchy-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Site team</p><h2 id="hierarchy-heading" className="mt-1 text-xl font-black">Supervisor and Site Admin</h2></div>
        <Button variant="outline" onClick={() => void openHistory()}><History />View history</Button>
      </div>
      {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100"><AlertTriangle className="size-4" />{error}</p>}
      {success && <p className="mt-4 flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><BadgeCheck className="size-4" />{success}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TierCard icon={<ShieldCheck />} title="Supervisor" name={staffing?.supervisor?.full_name} allowed={canSupervisor} action={() => setTier('supervisor')} />
        <AdminTierCard
          admins={staffing?.admins ?? []}
          legacyName={(staffing?.admins?.length ?? 0) === 0 ? staffing?.siteAdmin?.full_name : undefined}
          allowed={canAdmin}
          onAdd={() => setTier('admin')}
          onDeactivate={openDeactivate}
        />
      </div>

      <Dialog open={tier !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tier === 'supervisor' ? (staffing?.supervisor ? 'Change Supervisor' : 'Assign Supervisor') : 'Add Admin'}</DialogTitle>
            <DialogDescription>
              {tier === 'supervisor'
                ? 'Create the authorized account and assign it to this Site. Any previous assignment is closed and retained in history.'
                : 'Create the authorized account and add it as an Admin for this Site — existing Admins are unaffected.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createAndAssign}>
            <div className="grid gap-4">
              <label htmlFor="hierarchy-full-name" className="grid gap-2 font-bold">Full name<Input id="hierarchy-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={pendingUserId !== null} required /></label>
              <label htmlFor="hierarchy-email" className="grid gap-2 font-bold">Email<Input id="hierarchy-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pendingUserId !== null} required /></label>
              <label htmlFor="hierarchy-password" className="grid gap-2 font-bold">Temporary password<Input id="hierarchy-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={pendingUserId !== null} required={pendingUserId === null} /><span className="text-xs font-normal text-muted-foreground">At least 8 characters. It is never saved by the portal.</span></label>
              <label htmlFor="hierarchy-reason" className="grid gap-2 font-bold">Assignment note (optional)<Input id="hierarchy-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
            </div>
            <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" disabled={saving || (!pendingUserId && password.length < 8)}>{saving ? 'Assigning…' : pendingUserId ? 'Retry assignment' : 'Create and assign'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Assignment history</DialogTitle><DialogDescription>Previous assignments remain visible for accountability.</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {history?.userAssignments.length ? history.userAssignments.map((item) => <div className="rounded-xl border p-3" key={item.id}><div className="flex items-center justify-between gap-3"><p className="font-bold">{item.full_name}</p><Badge variant={item.ended_at ? 'outline' : 'secondary'}>{item.ended_at ? 'Previous' : 'Current'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.assignment_role === 'supervisor' ? 'Supervisor' : item.assignment_role === 'site_admin' ? 'Site Admin' : 'Admin'} · Assigned {new Date(item.started_at).toLocaleDateString()}</p></div>) : <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No assignment history yet.</p>}
          </div>
          <DialogFooter><Button onClick={() => setHistoryOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Admin account</DialogTitle>
            <DialogDescription>
              {deactivateTarget?.full_name} will no longer be able to sign in, and their assignment to this
              Site ends immediately. This cannot be undone from here — a new Admin would need to be added again.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="deactivate-reason" className="grid gap-2 text-sm font-bold">
            Reason (optional)
            <Input id="deactivate-reason" value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} maxLength={500} />
          </label>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={deactivating} onClick={() => void confirmDeactivate()}>
              {deactivating ? 'Deactivating…' : 'Deactivate account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TierCard({ icon, title, name, legacyName, allowed, action, secondaryAction }: {
  icon: React.ReactNode;
  title: string;
  name?: string;
  // A legacy site_admin assignment shown read-only when there is no
  // current `admin` one — this panel never creates/reassigns it, only
  // displays it so it isn't silently hidden.
  legacyName?: string;
  allowed: boolean;
  action: () => void;
  secondaryAction?: { label: string; icon: React.ReactNode; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 truncate font-black">{name || legacyName || 'Needs setup'}</p>
          {legacyName && <p className="mt-0.5 text-xs text-muted-foreground">Legacy Site Admin assignment (read-only)</p>}
        </div>
      </div>
      {allowed && <Button className="mt-4 w-full" variant="outline" onClick={action}>{name ? 'Change assignment' : `Set up ${title}`}</Button>}
      {secondaryAction && (
        <Button className="mt-2 w-full" variant="outline" onClick={secondaryAction.onClick}>
          {secondaryAction.icon}{secondaryAction.label}
        </Button>
      )}
    </div>
  );
}

// Multi-Admin per Site (P4, branch feat/admin-oic-management, sql/049) —
// a Site may now have any number of simultaneously active Admins, so this
// replaces the single-name TierCard for the Admin tier with a list + an
// always-additive "Add Admin" action (never "Change assignment" — that
// replace-semantics flow still exists on the backend via assignAdmin, but
// nothing in this panel calls it anymore).
function AdminTierCard({ admins, legacyName, allowed, onAdd, onDeactivate }: {
  admins: SiteUserAssignment[];
  legacyName?: string;
  allowed: boolean;
  onAdd: () => void;
  onDeactivate: (admin: SiteUserAssignment) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15"><UserCog /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Admin</p>
          {admins.length === 0 && !legacyName && <p className="mt-1 font-black">Needs setup</p>}
          {admins.length === 0 && legacyName && (
            <>
              <p className="mt-1 truncate font-black">{legacyName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Legacy Site Admin assignment (read-only)</p>
            </>
          )}
          {admins.map((admin) => (
            <div key={admin.id} className="mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 first:mt-1">
              <p className="min-w-0 truncate font-black">{admin.full_name}</p>
              {allowed && (
                <Button size="sm" variant="outline" onClick={() => onDeactivate(admin)}>
                  <UserX className="size-3.5" />Deactivate
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      {allowed && (
        <Button className="mt-4 w-full" variant="outline" onClick={onAdd}>
          <Plus className="size-4" />Add Admin
        </Button>
      )}
    </div>
  );
}
