'use client';

import { AlertTriangle, BadgeCheck, Plus, RefreshCw, ShieldAlert, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { PageContainer, PageHeader } from '@/components/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { roleLabel } from '@/lib/role-labels';
import {
  assignableRolesFor,
  canCreateUsers,
  canViewUsers,
  isValidEmail,
  isValidPassword,
  requiresOrganizationId,
} from '@/lib/user-management';
import type { User, UserRole } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

const genericError = 'Accounts could not be loaded. Please try again.';

export default function AccountsPage() {
  const session = useSession();
  const role = session.user?.role;
  const canView = !!role && canViewUsers(role);
  const canCreate = !!role && canCreateUsers(role);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | ''>('');
  const [saving, setSaving] = useState(false);

  const assignableRoles = role ? assignableRolesFor(role) : [];
  const needsOrganizationId = role ? requiresOrganizationId(role) : false;

  const refresh = useCallback(async () => {
    if (!canView || session.status !== 'authenticated') return;
    setLoading(true);
    try {
      setUsers(await managementApi.listUsers(session.api));
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setLoading(false);
    }
  }, [canView, session.api, session.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function closeCreate() {
    setShowCreate(false);
    setOrganizationId('');
    setEmail('');
    setPassword('');
    setFullName('');
    setSelectedRole('');
  }

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!isValidPassword(password)) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!fullName.trim()) {
      setError('Enter the full name.');
      return;
    }
    if (!selectedRole) {
      setError('Choose a role.');
      return;
    }
    const parsedOrganizationId = needsOrganizationId ? Number(organizationId) : undefined;
    if (needsOrganizationId && (!organizationId.trim() || !Number.isInteger(parsedOrganizationId) || parsedOrganizationId! < 1)) {
      setError('Enter the Organization ID (a number). Ask the platform team if you do not have it.');
      return;
    }
    setSaving(true);
    try {
      await managementApi.createUser(session.api, {
        ...(needsOrganizationId ? { organizationId: parsedOrganizationId } : {}),
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role: selectedRole as Exclude<UserRole, 'super_admin'>,
      });
      closeCreate();
      await refresh();
      setSuccess('Account added.');
    } catch (reason) {
      setPassword('');
      setError(
        reason instanceof ApiRequestError && reason.status === 409
          ? 'An account with this email already exists.'
          : reason instanceof ApiRequestError
            ? reason.message
            : genericError,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <ProtectedPortal>
        <PortalShell active="accounts">
          <PageContainer>
            <section className="rounded-2xl border bg-muted/20 p-5">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Platform accounts</p>
              <h1 className="mt-1 text-xl font-black">Accounts</h1>
              <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="size-4 shrink-0" />
                Your role cannot manage accounts. Ask the Owner or Engineer.
              </p>
            </section>
          </PageContainer>
        </PortalShell>
      </ProtectedPortal>
    );
  }

  return (
    <ProtectedPortal>
      <PortalShell active="accounts">
        <PageContainer>
          <PageHeader
            eyebrow="Who can sign in"
            title="Accounts"
            subtitle="Everyone who can sign in to this portal. A Site's Supervisor and Admins are added from that Site's People tab. To change or turn off an account, ask the platform team."
            actions={(
              <>
                <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
                  <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
                </Button>
                {canCreate && (
                  <Button className="bg-[#f36f0a] text-white hover:bg-[#d95e00]" onClick={() => setShowCreate(true)}>
                    <Plus /> Add account
                  </Button>
                )}
              </>
            )}
          />

          {error && (
            <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
              <AlertTriangle className="size-4 shrink-0" /> {error}
            </p>
          )}
          {success && (
            <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <BadgeCheck className="size-4 shrink-0" /> {success}
            </p>
          )}

          {showCreate && (
            <form className="rounded-2xl border bg-card p-5" onSubmit={create}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">New account</p>
                  <h2 className="mt-1 font-black">Add an account</h2>
                </div>
                <Button aria-label="Close" onClick={closeCreate} size="icon" type="button" variant="ghost">
                  <X />
                </Button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {needsOrganizationId && (
                  <label htmlFor="account-organization-id" className="text-sm font-bold md:col-span-2">
                    Organization ID
                    <Input
                      id="account-organization-id"
                      className="mt-2"
                      inputMode="numeric"
                      value={organizationId}
                      onChange={(event) => setOrganizationId(event.target.value)}
                      required
                    />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      A number that identifies the company. Ask the platform team if you do not know it.
                    </span>
                  </label>
                )}
                <label htmlFor="account-full-name" className="text-sm font-bold">
                  Full name
                  <Input id="account-full-name" className="mt-2" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={150} required />
                </label>
                <label htmlFor="account-email" className="text-sm font-bold">
                  Email
                  <Input id="account-email" className="mt-2" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                <label htmlFor="account-password" className="text-sm font-bold">
                  Temporary password
                  <Input id="account-password" className="mt-2" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">At least 8 characters. The person can change it from My Account after signing in.</span>
                </label>
                <label htmlFor="account-role" className="text-sm font-bold">
                  Role
                  <select
                    id="account-role"
                    className="mt-2 h-10 w-full rounded-lg border bg-background px-3 font-normal"
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value as UserRole)}
                    required
                  >
                    <option value="">Choose a role</option>
                    {assignableRoles.map((candidateRole) => (
                      <option key={candidateRole} value={candidateRole}>{roleLabel(candidateRole)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Button className="mt-5 bg-[#f36f0a] text-white" disabled={saving} type="submit">
                {saving ? 'Adding…' : 'Add account'}
              </Button>
            </form>
          )}

          <section className="overflow-hidden rounded-2xl border bg-card">
            {loading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Loading accounts…</p>
            ) : !error && users.length === 0 ? (
              <div className="p-10 text-center">
                <UserRound className="mx-auto size-9 text-muted-foreground" />
                <p className="mt-4 font-bold">No accounts yet</p>
              </div>
            ) : !error ? (
              <div className="divide-y">
                {users.map((user) => (
                  <div key={user.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-bold">{user.full_name}</p>
                        <Badge variant="outline">{roleLabel(user.role)}</Badge>
                        <Badge variant={user.status === 'active' ? 'secondary' : 'outline'}>{user.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </PageContainer>
      </PortalShell>
    </ProtectedPortal>
  );
}
