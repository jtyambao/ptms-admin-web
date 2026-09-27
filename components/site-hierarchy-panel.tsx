'use client';

import { AlertTriangle, BadgeCheck, History, ShieldCheck, UserCog } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canSetUpSiteAdmin, canSetUpSupervisor } from '@/lib/site-setup';
import type { AssignmentHistory, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type Tier = 'supervisor' | 'site_admin';

export function SiteHierarchyPanel({ siteId, staffing, onStaffingChange }: {
  siteId: number;
  staffing: StaffingStatus | null;
  onStaffingChange: (value: StaffingStatus) => void;
}) {
  const session = useSession();
  const role = session.user?.role;
  const canSupervisor = !!role && canSetUpSupervisor(role);
  const canSiteAdmin = !!role && canSetUpSiteAdmin(role);
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
      // Batch 3 correction (2026-09-26): a 2026-09-24 edit incorrectly
      // claimed the site_admin routes had been deleted and switched this
      // panel to the newer bare `admin` role — current production has not
      // undergone that cutover yet. Verified against a fresh origin/main
      // read: both
      // routes are live, but getStaffingStatus() only recognizes
      // `assignment_role === 'site_admin'` for its `siteAdmin` field —
      // assigning `admin` here would leave this card stuck on "Needs setup"
      // forever even after a successful assignment. Reverted to site_admin,
      // which the staffing-status contract actually reads. (Backend gap:
      // getStaffingStatus not yet recognizing `admin` — not fixed here,
      // this is a read-only reference worktree.)
      assignmentUserId = pendingUserId ?? (tier === 'supervisor'
        ? (await managementApi.createSupervisorAccount(session.api, { fullName: fullName.trim(), email: email.trim(), password })).id
        : (await managementApi.createSiteAdminAccount(session.api, siteId, { fullName: fullName.trim(), email: email.trim(), password })).id);
      setPendingUserId(assignmentUserId);
      if (tier === 'supervisor') {
        await managementApi.assignSupervisor(session.api, siteId, { userId: assignmentUserId, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      } else {
        await managementApi.assignSiteAdmin(session.api, siteId, { userId: assignmentUserId, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      }
      setPassword('');
      onStaffingChange(await managementApi.getStaffing(session.api, siteId));
      setSuccess(`${tier === 'supervisor' ? 'Supervisor' : 'Site Admin'} account created and assigned.`);
      close();
    } catch (cause) {
      setPassword('');
      setError(assignmentUserId ? 'The account exists, but assignment did not complete. Retry the assignment.' : cause instanceof ApiRequestError ? cause.message : 'The assignment could not be completed.');
    } finally { setSaving(false); }
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
        <TierCard icon={<UserCog />} title="Site Admin" name={staffing?.siteAdmin?.full_name} allowed={canSiteAdmin} action={() => setTier('site_admin')} />
      </div>

      <Dialog open={tier !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{staffing?.[tier === 'supervisor' ? 'supervisor' : 'siteAdmin'] ? 'Change' : 'Assign'} {tier === 'supervisor' ? 'Supervisor' : 'Site Admin'}</DialogTitle><DialogDescription>Create the authorized account and assign it to this Site. Any previous assignment is closed and retained in history.</DialogDescription></DialogHeader>
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
    </section>
  );
}

function TierCard({ icon, title, name, allowed, action }: { icon: React.ReactNode; title: string; name?: string; allowed: boolean; action: () => void }) {
  return <div className="rounded-2xl border bg-card p-5"><div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15">{icon}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-1 truncate font-black">{name || 'Needs setup'}</p></div></div>{allowed && <Button className="mt-4 w-full" variant="outline" onClick={action}>{name ? 'Change assignment' : `Set up ${title}`}</Button>}</div>;
}
