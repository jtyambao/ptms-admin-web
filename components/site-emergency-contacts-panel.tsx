'use client';

import { AlertTriangle, BadgeCheck, Pencil, Phone, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
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
import {
  CONTACT_NAME_MAX,
  CONTACT_NOTES_MAX,
  CONTACT_PHONE_MAX,
  canManageEmergencyContacts,
  canViewEmergencyContacts,
  validateEmergencyContact,
} from '@/lib/emergency-contacts';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import type { EmergencyContact } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

const genericError = 'Emergency contacts could not be loaded. Please try again.';

export function SiteEmergencyContactsPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role;
  const canView = !!role && canViewEmergencyContacts(role);
  // Add / edit / delete - Supervisor/Admin of this Site (policy section
  // 11), matching the backend's requireManageAccess - see
  // lib/emergency-contacts.ts.
  const canManage = !!role && canManageEmergencyContacts(role);

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  // null = adding a new contact; a contact = editing that one (same dialog).
  const [editTarget, setEditTarget] = useState<EmergencyContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | null>(null);
  const [category, setCategory] = useState<'internal' | 'external' | ''>('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!canView || session.status !== 'authenticated') return;
    setLoading(true);
    try {
      setContacts(await managementApi.listEmergencyContacts(session.api, siteId));
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setLoading(false);
    }
  }, [canView, session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function openEdit(contact: EmergencyContact) {
    setError('');
    setSuccess('');
    setEditTarget(contact);
    setCategory(contact.category);
    setName(contact.name);
    setPhoneNumber(contact.phone_number ?? '');
    setNotes(contact.notes ?? '');
    setCreateOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await managementApi.deleteEmergencyContact(session.api, deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
      setSuccess('Emergency contact deleted. Guards no longer see it.');
    } catch (reason) {
      setDeleteTarget(null);
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setSaving(false);
    }
  }

  function closeCreate() {
    setEditTarget(null);
    setCreateOpen(false);
    setCategory('');
    setName('');
    setPhoneNumber('');
    setNotes('');
  }

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const validationError = validateEmergencyContact({ category, name, phoneNumber, notes });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        // Blank phone/notes are sent as null so clearing a field really clears it.
        await managementApi.updateEmergencyContact(session.api, editTarget.id, {
          category: category as 'internal' | 'external',
          name: name.trim(),
          phoneNumber: phoneNumber.trim() ? phoneNumber.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
        });
      } else {
        await managementApi.createEmergencyContact(session.api, {
          siteId,
          category: category as 'internal' | 'external',
          name: name.trim(),
          ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
      }
      const wasEdit = !!editTarget;
      closeCreate();
      await refresh();
      setSuccess(wasEdit ? 'Emergency contact updated.' : 'Emergency contact added.');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5" aria-labelledby="emergency-contacts-heading">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Site safety</p>
        <h2 id="emergency-contacts-heading" className="mt-1 text-xl font-black">Emergency Contacts</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Emergency Contacts are unavailable for this role.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="emergency-contacts-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Site safety</p>
          <h2 id="emergency-contacts-heading" className="mt-1 text-xl font-black">Emergency Contacts</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            These are the contacts guards at this Site see in the Guard app. Changes show up for them right away.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
          {canManage && (
            <Button className="bg-[#f36f0a] text-white hover:bg-[#d95e00]" onClick={() => setCreateOpen(true)}>
              <Plus /> Add contact
            </Button>
          )}
        </div>
      </div>

      {!canManage && (
        <p className="mt-4 text-xs text-muted-foreground">
          Only a Supervisor or Admin of this Site can add, edit or delete contacts.
        </p>
      )}

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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading Emergency Contacts…</p>
        ) : contacts.length === 0 ? (
          <div className="p-10 text-center">
            <Phone className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-4 font-bold">No Emergency Contacts for this Site</p>
          </div>
        ) : (
          <div className="divide-y">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold">{contact.name}</p>
                    <Badge variant={contact.category === 'internal' ? 'secondary' : 'outline'}>{contact.category === 'internal' ? 'Our company' : 'Outside help'}</Badge>
                  </div>
                  {contact.notes && <p className="mt-1 text-xs text-muted-foreground">{contact.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {contact.phone_number && (
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <Phone className="size-4 text-[#e86405]" /> {contact.phone_number}
                    </p>
                  )}
                  {canManage && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(contact)}>
                        <Pencil /> Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(contact)}>
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeCreate(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Emergency Contact' : 'Add Emergency Contact'}</DialogTitle>
            <DialogDescription>Visible to guards at this Site immediately.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create}>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-bold">
                Category
                <select
                  className="h-10 rounded-lg border bg-background px-3 font-normal"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as 'internal' | 'external' | '')}
                  required
                >
                  <option value="">Select category</option>
                  <option value="internal">Our company (e.g. head office)</option>
                  <option value="external">Outside help (e.g. fire station, police)</option>
                </select>
              </label>
              <label htmlFor="contact-name" className="grid gap-2 text-sm font-bold">
                Name
                <Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={CONTACT_NAME_MAX} required />
              </label>
              <label htmlFor="contact-phone" className="grid gap-2 text-sm font-bold">
                Phone number <span className="font-normal text-muted-foreground">(optional)</span>
                <Input id="contact-phone" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} maxLength={CONTACT_PHONE_MAX} />
              </label>
              <label htmlFor="contact-notes" className="grid gap-2 text-sm font-bold">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
                <Input id="contact-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={CONTACT_NOTES_MAX} />
              </label>
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={closeCreate}>Cancel</Button>
              <Button type="submit" disabled={saving || !name.trim() || !category}>{saving ? 'Saving…' : editTarget ? 'Save' : 'Add contact'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Guards at this Site will no longer see this contact. You can add it again later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void confirmDelete()}>
              {saving ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
