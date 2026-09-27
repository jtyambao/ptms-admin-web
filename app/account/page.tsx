'use client';
import { AlertTriangle, BadgeCheck, KeyRound, Save, UserCircle } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { useSession } from '@/lib/session-provider';

// My Account page (P4(b), branch release/dry-run-ops) — any authenticated
// role, self only. Two independent forms/requests (profile, password),
// each with its own loading/success/error state, matching this app's
// established "one widget/form failing never blocks another" convention
// (see site-reports-panel.tsx). Keeps the existing Settings (operational
// settings) page untouched — this is a separate resource entirely.
export default function MyAccountPage() {
  const session = useSession();
  const user = session.user;

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function saveProfile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fullName.trim()) return;
    setProfileSaving(true); setProfileError(''); setProfileSuccess(false);
    try {
      await managementApi.updateOwnProfile(session.api, { fullName: fullName.trim() });
      setProfileSuccess(true);
    } catch (reason) {
      setProfileError(reason instanceof ApiRequestError ? reason.message : 'Your profile could not be saved.');
    } finally { setProfileSaving(false); }
  }

  async function changePassword(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(''); setPasswordSuccess(false);
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('New password and confirmation do not match.'); return; }
    if (newPassword === currentPassword) { setPasswordError('New password must be different from your current password.'); return; }
    setPasswordSaving(true);
    try {
      await managementApi.changeOwnPassword(session.api, { currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordSuccess(true);
    } catch (reason) {
      // A wrong currentPassword comes back as a generic 400 ("validation")
      // — this endpoint has exactly one server-side validation failure
      // beyond what's already checked above client-side, so it's safe to
      // name it directly here rather than show the generic fallback.
      setPasswordError(reason instanceof ApiRequestError && reason.kind === 'validation' ? 'Current password is incorrect.' : reason instanceof ApiRequestError ? reason.message : 'Your password could not be changed.');
    } finally { setPasswordSaving(false); }
  }

  return (
    <ProtectedPortal>
      <PortalShell active="account">
        <div className="mx-auto max-w-2xl space-y-6 p-5 sm:p-8">
          <div>
            <p className="text-sm font-bold text-[#e86405]">Your account</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">My Account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Update your own name and password. This never affects your role, organization, email, or account status.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCircle className="size-4 text-[#f36f0a]" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="account-email">Email</Label>
                  <Input id="account-email" value={user?.email ?? ''} disabled />
                  <p className="text-xs text-muted-foreground">Email cannot be changed from this page.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="account-full-name">Full name</Label>
                  <Input
                    id="account-full-name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setProfileSuccess(false); }}
                    maxLength={150}
                    required
                  />
                </div>

                {profileError && (
                  <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                    <AlertTriangle className="size-4 shrink-0" />{profileError}
                  </p>
                )}
                {profileSuccess && (
                  <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                    <BadgeCheck className="size-4 shrink-0" />Profile saved.
                  </p>
                )}

                <Button type="submit" disabled={profileSaving || !fullName.trim()} className="w-fit gap-2">
                  <Save className="size-4" />{profileSaving ? 'Saving…' : 'Save profile'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-[#f36f0a]" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="account-current-password">Current password</Label>
                  <Input
                    id="account-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordSuccess(false); }}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="account-new-password">New password</Label>
                  <Input
                    id="account-new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false); }}
                    required
                  />
                  <p className="text-xs text-muted-foreground">At least 8 characters, different from your current password.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="account-confirm-password">Confirm new password</Label>
                  <Input
                    id="account-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSuccess(false); }}
                    required
                  />
                </div>

                {passwordError && (
                  <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                    <AlertTriangle className="size-4 shrink-0" />{passwordError}
                  </p>
                )}
                {passwordSuccess && (
                  <p className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                    <BadgeCheck className="size-4 shrink-0" />Password changed.
                  </p>
                )}

                <Button type="submit" disabled={passwordSaving || !currentPassword || newPassword.length < 8 || !confirmPassword} className="w-fit gap-2">
                  <KeyRound className="size-4" />{passwordSaving ? 'Changing…' : 'Change password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PortalShell>
    </ProtectedPortal>
  );
}
