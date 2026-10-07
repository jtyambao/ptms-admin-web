'use client';

import {
  AlertTriangle,
  BadgeCheck,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UserRoundX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import {
  canManageOic,
  canManagePersonnel,
  canViewPersonnel,
  generatePersonnelMpin,
} from '@/lib/personnel-management';
import type { Personnel, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type Props = {
  siteId: number;
  staffing: StaffingStatus | null;
  onStaffingChange: (staffing: StaffingStatus) => void;
};

const genericError = 'That could not be completed. Please try again.';

export function SitePersonnelPanel({ siteId, staffing, onStaffingChange }: Props) {
  const session = useSession();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [oicOpen, setOicOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [selectedOic, setSelectedOic] = useState('');
  // Fewer clicks (UI pass 2026-10-07): add a guard and make them Officer in Charge in one go.
  const [makeOicNow, setMakeOicNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Personnel | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<Personnel | null>(null);
  // The one-time plaintext MPIN, held only in memory for as long as its
  // display dialog is open — never persisted, never re-requested.
  const [regeneratedMpin, setRegeneratedMpin] = useState<string | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  // Dry-run fix (branch release/dry-run-ops) — every OIC handover also
  // rotates the Site's own Guard-facing credential in the same backend
  // transaction; this was always returned by the API but never surfaced
  // here. Kept as its own state (distinct from regeneratedMpin above,
  // which is a Personnel's own login MPIN, a different credential
  // entirely) so the dialog can label which credential just changed.
  const [newSiteMpin, setNewSiteMpin] = useState<string | null>(null);
  // Who the one-time OIC PIN is for, so the dialog can say "give this to <name>".
  const [newSiteMpinFor, setNewSiteMpinFor] = useState('');
  // "Generate new PIN" for the current OIC (user-requested 2026-10-07), in addition to the PIN made when the OIC changes.
  const [pinConfirmOpen, setPinConfirmOpen] = useState(false);
  const [siteMpinCopyConfirmed, setSiteMpinCopyConfirmed] = useState(false);

  const allowed = !!session.user && canManagePersonnel(session.user.role);
  // View is independent from manage: canViewPersonnel matches
  // PersonnelService.findAllForRequester() (super_admin/engineer/manager
  // org-wide, supervisor/site_admin assigned-site — server-scoped either
  // way), while canManagePersonnel's narrower supervisor/site_admin/admin
  // trio gets the create/deactivate actions gated by `allowed`. OIC
  // handover has its own, narrower gate — canManageOic below — since
  // Supervisor is view-only for OIC (policy alignment, 2026-09-30):
  // Supervisor still sees the current OIC (gated by `canView`, unchanged)
  // but no longer gets the button to change it.
  const canView = !!session.user && canViewPersonnel(session.user.role);
  const canChangeOic = !!session.user && canManageOic(session.user.role);
  const currentOicId = staffing?.oic?.personnel_id ?? null;

  const refreshPersonnel = useCallback(async () => {
    if (session.status !== 'authenticated' || !canView) return;
    setLoading(true);
    try {
      const rows = await managementApi.listPersonnel(session.api);
      setPersonnel(rows.filter((person) => person.site_id === siteId));
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setLoading(false);
    }
  }, [canView, session.api, session.status, siteId]);

  useEffect(() => {
    if (session.status !== 'authenticated' || !canView) {
      return;
    }
    let active = true;
    managementApi.listPersonnel(session.api)
      .then((rows) => {
        if (active) setPersonnel(rows.filter((person) => person.site_id === siteId));
      })
      .catch((reason) => {
        if (active) setError(reason instanceof ApiRequestError ? reason.message : genericError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canView, session.api, session.status, siteId]);

  const activePersonnel = useMemo(
    () => personnel.filter((person) => person.status === 'active'),
    [personnel],
  );

  async function createPersonnel(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!fullName.trim()) {
      setError('Type the guard\'s name.');
      return;
    }
    setSaving(true);
    try {
      // PINs are only for the Guard app. The personnel record still needs one,
      // so it is generated here (crypto-random, 6 digits), sent once and never
      // shown, stored or kept in state. A PIN already used at this Site is a
      // 409 - retry with a fresh value, up to 3 more times.
      let created: Personnel | null = null;
      for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
        try {
          created = await managementApi.createPersonnel(session.api, {
            siteId,
            fullName: fullName.trim(),
            mpin: generatePersonnelMpin(),
          });
        } catch (reason) {
          if (!(reason instanceof ApiRequestError && reason.status === 409) || attempt === 3) throw reason;
        }
      }
      const wantsOic = makeOicNow && canChangeOic && !!created?.id;
      const createdName = fullName.trim();
      setFullName('');
      setMakeOicNow(false);
      setCreateOpen(false);
      await refreshPersonnel();
      setSuccess('Guard added.');
      if (wantsOic && created) {
        try {
          const result = await managementApi.handoverOic(session.api, siteId, { personnelId: created.id });
          onStaffingChange(await managementApi.getStaffing(session.api, siteId));
          setSuccess('Guard added and made Officer in Charge.');
          setNewSiteMpinFor(createdName);
          setNewSiteMpin(result.newSiteMpin);
        } catch (reason) {
          setError(
            (reason instanceof ApiRequestError ? reason.message : genericError) +
              ' The guard was added; use Change OIC to make them Officer in Charge.',
          );
        }
      }
    } catch (reason) {
      setError(
        reason instanceof ApiRequestError && reason.status === 409
          ? 'The guard could not be added right now. Please try again.'
          : reason instanceof ApiRequestError
            ? reason.message
            : genericError,
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivatePersonnel() {
    if (!deactivateTarget) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await managementApi.deactivatePersonnel(session.api, deactivateTarget.id);
      setDeactivateTarget(null);
      await refreshPersonnel();
      setSuccess('Guard deleted. Their past records are kept.');
    } catch (reason) {
      setDeactivateTarget(null);
      setError(
        reason instanceof ApiRequestError && reason.status === 409
          ? 'This guard is the current Officer in Charge. Change the Officer in Charge first, then delete this guard.'
          : reason instanceof ApiRequestError
            ? reason.message
            : genericError,
      );
    } finally {
      setSaving(false);
    }
  }

  async function regenerateMpin() {
    if (!regenerateTarget) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await managementApi.regeneratePersonnelMpin(session.api, regenerateTarget.id);
      setRegenerateTarget(null);
      await refreshPersonnel();
      setRegeneratedMpin(result.mpin);
    } catch (reason) {
      setRegenerateTarget(null);
      setError(
        reason instanceof ApiRequestError && reason.status === 409
          ? 'This guard was deleted and cannot get a new PIN.'
          : reason instanceof ApiRequestError && reason.status === 404
            ? 'This guard could not be found. The list was refreshed.'
            : reason instanceof ApiRequestError
              ? reason.message
              : genericError,
      );
      if (reason instanceof ApiRequestError && reason.status === 404) {
        await refreshPersonnel();
      }
    } finally {
      setSaving(false);
    }
  }

  function closeMpinDisplay() {
    setRegeneratedMpin(null);
    setCopyConfirmed(false);
  }

  async function copyMpin() {
    if (!regeneratedMpin) return;
    try {
      await navigator.clipboard.writeText(regeneratedMpin);
      setCopyConfirmed(true);
    } catch {
      setCopyConfirmed(false);
    }
  }

  function closeSiteMpinDisplay() {
    setNewSiteMpin(null);
    setNewSiteMpinFor('');
    setSiteMpinCopyConfirmed(false);
  }

  async function copySiteMpin() {
    if (!newSiteMpin) return;
    try {
      await navigator.clipboard.writeText(newSiteMpin);
      setSiteMpinCopyConfirmed(true);
    } catch {
      setSiteMpinCopyConfirmed(false);
    }
  }

  async function generateOicPin() {
    const oicName = staffing?.oic?.full_name ?? 'the OIC';
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await managementApi.regenerateSiteCredential(session.api, siteId);
      setPinConfirmOpen(false);
      setNewSiteMpinFor(oicName);
      setNewSiteMpin(result.newSiteMpin);
    } catch (reason) {
      setPinConfirmOpen(false);
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setSaving(false);
    }
  }

  async function changeOic(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const personnelId = Number(selectedOic);
    if (!activePersonnel.some((person) => person.id === personnelId)) {
      setError('Pick a guard from this Site.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await managementApi.handoverOic(session.api, siteId, { personnelId });
      const refreshed = await managementApi.getStaffing(session.api, siteId);
      onStaffingChange(refreshed);
      setOicOpen(false);
      setSelectedOic('');
      setSuccess('Officer in Charge changed.');
      setNewSiteMpinFor(activePersonnel.find((person) => person.id === personnelId)?.full_name ?? 'the new OIC');
      setNewSiteMpin(result.newSiteMpin);
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setSaving(false);
    }
  }

  if (!canView) return (
    <section className="rounded-2xl border bg-muted/20 p-5" aria-labelledby="personnel-heading">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Guards</p>
      <h2 id="personnel-heading" className="mt-1 text-xl font-black">Managed by the Site team</h2>
      <p className="mt-2 text-sm text-muted-foreground">The guards at this Site are added and changed by the Site&apos;s own Supervisor or Admin.</p>
    </section>
  );

  return (
    <section aria-labelledby="personnel-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Guards</p>
          <h2 id="personnel-heading" className="mt-1 text-xl font-black">Guards and Officer in Charge (OIC)</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The guards who work at this Site. A guard&apos;s PIN is only shown when you add them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refreshPersonnel()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
          {canChangeOic && (
            <Button variant="outline" onClick={() => setOicOpen(true)} disabled={activePersonnel.length === 0}>
              <ShieldCheck /> {staffing?.oic ? 'Change OIC' : 'Choose OIC'}
            </Button>
          )}
          {allowed && (
            <Button className="bg-[#f36f0a] text-white hover:bg-[#d95e00]" onClick={() => setCreateOpen(true)}>
              <Plus /> Add guard
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 shrink-0 text-[#e86405]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Officer in Charge (OIC)</p>
            <p className="font-black">{staffing?.oic?.full_name ?? 'Not chosen yet'}</p>
          </div>
        </div>
        {canChangeOic && (staffing?.oic ? (
          <Button variant="outline" onClick={() => setPinConfirmOpen(true)} disabled={saving}>
            <KeyRound /> Generate new PIN
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Choose an OIC first</p>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </p>
      )}
      {success && (
        <p className="mt-4 flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <BadgeCheck className="size-4 shrink-0" /> {success}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading guards…</p>
        ) : personnel.length === 0 ? (
          <div className="p-10 text-center">
            <UserRound className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-4 font-bold">No guards at this Site yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add the first guard. You can make them Officer in Charge at the same time.</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Delete = deactivate + hide behind "Show deleted" (P0, branch
                feat/admin-oic-management) — same pattern as Checkpoints/
                Devices: full history is kept, this only changes what's
                visible by default. */}
            {personnel.some((p) => p.status !== 'active') && (
              <div className="px-5 py-3 text-right">
                <Button variant="ghost" size="sm" onClick={() => setShowDeleted((v) => !v)}>
                  {showDeleted ? 'Hide deleted' : `Show deleted (${personnel.filter((p) => p.status !== 'active').length})`}
                </Button>
              </div>
            )}
            {(showDeleted ? personnel : personnel.filter((p) => p.status === 'active')).map((person) => {
              const isOic = person.id === currentOicId;
              return (
                <div key={person.id} className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5 ${person.status === 'active' ? '' : 'opacity-60'}`}>
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15">
                    {isOic ? <ShieldCheck /> : <UserRound />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold">{person.full_name}</p>
                      {isOic && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">Officer in Charge</Badge>}
                      <Badge variant={person.status === 'active' ? 'secondary' : 'outline'}>{person.status === 'active' ? 'Active' : 'Deleted'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Added {new Date(person.created_at).toLocaleDateString()}</p>
                  </div>
                  {allowed && person.status === 'active' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* "Reset PIN" is not offered yet: it needs a backend route
                          that is not deployed. Hidden rather than shown dead (UI
                          pass 2026-10-07); the confirm dialogs below stay wired. */}
                      <Button variant="destructive" onClick={() => setDeactivateTarget(person)}>
                        <UserRoundX /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setMakeOicNow(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a guard</DialogTitle>
            <DialogDescription>The guard is added to this Site. Only the name is needed.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createPersonnel}>
            <div className="grid gap-4">
              <label htmlFor="personnel-name" className="grid gap-2 text-sm font-bold">
                Guard name
                <Input id="personnel-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={150} autoComplete="off" required />
              </label>
              {canChangeOic && (
                <label htmlFor="personnel-make-oic" className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                  <Checkbox
                    id="personnel-make-oic"
                    className="mt-1"
                    checked={makeOicNow}
                    onCheckedChange={(value) => setMakeOicNow(value === true)}
                  />
                  <span>
                    <span className="font-bold">Make this guard the Officer in Charge (OIC) now</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      This also makes a new PIN for the OIC. You will see it next - give it to this guard.
                    </span>
                  </span>
                </label>
              )}
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setMakeOicNow(false); }}>Cancel</Button>
              <Button type="submit" disabled={saving || !fullName.trim()}>{saving ? 'Adding…' : 'Add guard'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={oicOpen} onOpenChange={setOicOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{staffing?.oic ? 'Change Officer in Charge' : 'Choose Officer in Charge'}</DialogTitle>
            <DialogDescription>Pick the guard in charge of this Site. The change is saved in the handover history. The new Officer in Charge also gets a PIN for the Guard app, which you will see next.</DialogDescription>
          </DialogHeader>
          <form onSubmit={changeOic}>
            <label className="grid gap-2 text-sm font-bold">
              Guard
              <select className="h-10 rounded-lg border bg-background px-3 font-normal" value={selectedOic} onChange={(event) => setSelectedOic(event.target.value)} required>
                <option value="">Pick a guard</option>
                {activePersonnel.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </select>
            </label>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setOicOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !selectedOic}>{saving ? 'Saving…' : 'Make Officer in Charge'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pinConfirmOpen} onOpenChange={(open) => { if (!open) setPinConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a new PIN for {staffing?.oic?.full_name ?? 'the OIC'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the OIC&apos;s current PIN. The Guard phone will need the new PIN to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => void generateOicPin()}>
              {saving ? 'Please wait…' : 'Generate new PIN'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this guard?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.full_name} will no longer be able to sign in with their PIN. They are
              hidden from this list (tap &quot;Show deleted&quot; to see them) and their past records are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void deactivatePersonnel()}>
              {saving ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!regenerateTarget} onOpenChange={(open) => { if (!open) setRegenerateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Give {regenerateTarget?.full_name} a new PIN?</AlertDialogTitle>
            <AlertDialogDescription>
              Their current PIN stops working right away. The new PIN is shown once - write it down before closing, because it cannot be shown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => void regenerateMpin()}>
              {saving ? 'Please wait…' : 'Give new PIN'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!regeneratedMpin} onOpenChange={(open) => { if (!open) closeMpinDisplay(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PIN - shown once</DialogTitle>
            <DialogDescription>
              This PIN cannot be shown again after you close this window. Tell the guard now.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={regeneratedMpin ?? ''} className="font-mono text-lg tracking-widest" aria-label="New PIN" />
            <Button type="button" variant="outline" onClick={() => void copyMpin()}>
              <Copy /> {copyConfirmed ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" onClick={closeMpinDisplay}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newSiteMpin} onOpenChange={(open) => { if (!open) closeSiteMpinDisplay(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PIN for the OIC</DialogTitle>
            <DialogDescription>
              Give this to {newSiteMpinFor || 'the new OIC'}. They use it to sign in to the Guard app.
              It won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={newSiteMpin ?? ''} className="font-mono text-lg tracking-widest" aria-label="New PIN for the OIC" />
            <Button type="button" variant="outline" onClick={() => void copySiteMpin()}>
              <Copy /> {siteMpinCopyConfirmed ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" onClick={closeSiteMpinDisplay}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
