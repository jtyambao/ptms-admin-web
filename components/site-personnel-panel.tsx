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
  canManagePersonnel,
  canViewPersonnel,
  generatePersonnelMpin,
  isValidMpin,
} from '@/lib/personnel-management';
import type { Personnel, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type Props = {
  siteId: number;
  staffing: StaffingStatus | null;
  onStaffingChange: (staffing: StaffingStatus) => void;
};

const genericError = 'The Personnel operation could not be completed. Please try again.';

export function SitePersonnelPanel({ siteId, staffing, onStaffingChange }: Props) {
  const session = useSession();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [oicOpen, setOicOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [mpin, setMpin] = useState('');
  const [selectedOic, setSelectedOic] = useState('');
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Personnel | null>(null);
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
  const [siteMpinCopyConfirmed, setSiteMpinCopyConfirmed] = useState(false);

  const allowed = !!session.user && canManagePersonnel(session.user.role);
  // View is independent from manage: canViewPersonnel matches
  // PersonnelService.findAllForRequester() (super_admin/engineer/manager
  // org-wide, supervisor/site_admin assigned-site — server-scoped either
  // way), while only canManagePersonnel's narrower supervisor/site_admin
  // pair gets the create/deactivate/OIC/MPIN actions gated by `allowed`.
  const canView = !!session.user && canViewPersonnel(session.user.role);
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
      setError('Enter the Personnel name.');
      return;
    }
    if (!isValidMpin(mpin)) {
      setError('MPIN must contain 4 to 8 numeric digits.');
      return;
    }
    setSaving(true);
    try {
      await managementApi.createPersonnel(session.api, {
        siteId,
        fullName: fullName.trim(),
        mpin,
      });
      setMpin('');
      setFullName('');
      setCreateOpen(false);
      await refreshPersonnel();
      setSuccess('Personnel registered successfully. Communicate the MPIN now; it cannot be retrieved later.');
    } catch (reason) {
      setMpin('');
      setError(
        reason instanceof ApiRequestError && reason.status === 409
          ? 'This MPIN is already in use at this Site. Enter another MPIN or generate a new one.'
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
      setSuccess('Personnel deactivated. Historical records remain available.');
    } catch (reason) {
      setDeactivateTarget(null);
      setError(
        reason instanceof ApiRequestError && reason.status === 409
          ? 'This Personnel is currently the active OIC. Complete the OIC handover before deactivating this Personnel.'
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
          ? 'This Personnel is inactive and cannot receive a new MPIN.'
          : reason instanceof ApiRequestError && reason.status === 404
            ? 'This Personnel could not be found. The list has been refreshed.'
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

  async function changeOic(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const personnelId = Number(selectedOic);
    if (!activePersonnel.some((person) => person.id === personnelId)) {
      setError('Select eligible active Personnel from this Site.');
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
      setSuccess('Current OIC updated successfully.');
      setNewSiteMpin(result.newSiteMpin);
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setSaving(false);
    }
  }

  if (!canView) return (
    <section className="rounded-2xl border bg-muted/20 p-5" aria-labelledby="personnel-heading">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Personnel / Guards</p>
      <h2 id="personnel-heading" className="mt-1 text-xl font-black">Managed by the assigned Site team</h2>
      <p className="mt-2 text-sm text-muted-foreground">Managers and Engineers do not receive Personnel or OIC operational controls.</p>
    </section>
  );

  return (
    <section className="mt-8" aria-labelledby="personnel-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Site Personnel</p>
          <h2 id="personnel-heading" className="mt-1 text-xl font-black">Personnel and OIC</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Active and historical Personnel for this Site. MPINs are never displayed after registration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refreshPersonnel()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
          {allowed && (
            <>
              <Button variant="outline" onClick={() => setOicOpen(true)} disabled={activePersonnel.length === 0}>
                <ShieldCheck /> {staffing?.oic ? 'Change OIC' : 'Assign OIC'}
              </Button>
              <Button className="bg-[#f36f0a] text-white hover:bg-[#d95e00]" onClick={() => setCreateOpen(true)}>
                <Plus /> Register Personnel
              </Button>
            </>
          )}
        </div>
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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading Site Personnel…</p>
        ) : personnel.length === 0 ? (
          <div className="p-10 text-center">
            <UserRound className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-4 font-bold">No Personnel registered for this Site</p>
            <p className="mt-1 text-sm text-muted-foreground">Register Personnel before assigning an OIC.</p>
          </div>
        ) : (
          <div className="divide-y">
            {personnel.map((person) => {
              const isOic = person.id === currentOicId;
              return (
                <div key={person.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15">
                    {isOic ? <ShieldCheck /> : <UserRound />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold">{person.full_name}</p>
                      {isOic && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">Current OIC</Badge>}
                      <Badge variant={person.status === 'active' ? 'secondary' : 'outline'}>{person.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Personnel record · MPIN protected</p>
                  </div>
                  {allowed && person.status === 'active' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Dry-run fix (branch release/dry-run-ops): disabled for
                          tomorrow's dry run — feat/personnel-mpin-regenerate
                          (sql/029) is uncommitted WIP, not yet reviewed/run,
                          so the button is kept visible but inert rather than
                          risk a 404 against prod mid-demo. */}
                      <Button variant="outline" disabled title="Not available yet">
                        <KeyRound /> Regenerate MPIN
                      </Button>
                      <span className="text-xs text-muted-foreground">Not available yet</span>
                      <Button variant="destructive" onClick={() => setDeactivateTarget(person)}>
                        <UserRoundX /> Deactivate
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setMpin(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Personnel</DialogTitle>
            <DialogDescription>The Site is fixed to the current authorized Site. The MPIN cannot be retrieved later.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createPersonnel}>
            <div className="grid gap-4">
              <label htmlFor="personnel-name" className="grid gap-2 text-sm font-bold">
                Personnel Name
                <Input id="personnel-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={150} autoComplete="off" required />
              </label>
              <label htmlFor="personnel-mpin" className="grid gap-2 text-sm font-bold">
                MPIN
                <div className="flex gap-2">
                  <Input
                    id="personnel-mpin"
                    aria-describedby="mpin-help"
                    aria-invalid={mpin.length > 0 && !isValidMpin(mpin)}
                    autoComplete="new-password"
                    inputMode="numeric"
                    maxLength={8}
                    pattern="[0-9]{4,8}"
                    value={mpin}
                    onChange={(event) => setMpin(event.target.value)}
                    required
                  />
                  <Button type="button" variant="outline" onClick={() => setMpin(generatePersonnelMpin())}>
                    <KeyRound /> Generate
                  </Button>
                </div>
                <span id="mpin-help" className="font-normal text-muted-foreground">4–8 numeric digits. Communicate it during registration.</span>
              </label>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setMpin(''); }}>Cancel</Button>
              <Button type="submit" disabled={saving || !fullName.trim() || !isValidMpin(mpin)}>{saving ? 'Creating…' : 'Create Personnel'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={oicOpen} onOpenChange={setOicOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{staffing?.oic ? 'Change OIC' : 'Assign OIC'}</DialogTitle>
            <DialogDescription>Only active Personnel from this Site are eligible. The backend records the handover history.</DialogDescription>
          </DialogHeader>
          <form onSubmit={changeOic}>
            <label className="grid gap-2 text-sm font-bold">
              Active Personnel
              <select className="h-10 rounded-lg border bg-background px-3 font-normal" value={selectedOic} onChange={(event) => setSelectedOic(event.target.value)} required>
                <option value="">Select Personnel</option>
                {activePersonnel.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </select>
            </label>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setOicOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !selectedOic}>{saving ? 'Saving…' : 'Confirm OIC'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Personnel?</AlertDialogTitle>
            <AlertDialogDescription>
              This Personnel will no longer be able to sign in using the assigned MPIN. Historical records will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void deactivatePersonnel()}>
              {saving ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!regenerateTarget} onOpenChange={(open) => { if (!open) setRegenerateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate MPIN for {regenerateTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The current MPIN will stop working immediately. A new MPIN will be shown once — write it down before closing that dialog, since it cannot be retrieved again afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => void regenerateMpin()}>
              {saving ? 'Regenerating…' : 'Regenerate MPIN'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!regeneratedMpin} onOpenChange={(open) => { if (!open) closeMpinDisplay(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New MPIN — shown once</DialogTitle>
            <DialogDescription>
              This MPIN cannot be retrieved again after this dialog is closed. Communicate it to the Personnel now.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={regeneratedMpin ?? ''} className="font-mono text-lg tracking-widest" aria-label="New MPIN" />
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
            <DialogTitle>New Site MPIN — shown once</DialogTitle>
            <DialogDescription>
              OIC handover also rotates this Site&apos;s own Guard-facing credential. This MPIN cannot
              be retrieved again after this dialog is closed — communicate it to Guard staff at this
              Site now.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={newSiteMpin ?? ''} className="font-mono text-lg tracking-widest" aria-label="New Site MPIN" />
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
