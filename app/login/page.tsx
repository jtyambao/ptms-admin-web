'use client';
import Image from 'next/image';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session-provider';
export default function LoginPage() {
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (session.status === 'authenticated')
      window.location.replace('/dashboard');
  }, [session.status]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await session.login({ email, password });
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#111] p-5">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-background p-7 shadow-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-4">
          <Image
            alt="Official PTMS logo"
            className="size-16 rounded-2xl"
            height={160}
            priority
            src="/brand/ptms-official-logo.png"
            width={160}
          />
          <div>
            <h1 className="text-2xl font-black">PTMS Admin</h1>
            <p className="text-sm text-muted-foreground">
              Ground-test setup console
            </p>
          </div>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <label className="block text-sm font-bold">
            Email
            <input
              autoComplete="username"
              className="mt-2 h-12 w-full rounded-xl border bg-card px-4 font-normal outline-none focus:border-[#f36f0a]"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm font-bold">
            Password
            <input
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-xl border bg-card px-4 font-normal outline-none focus:border-[#f36f0a]"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <Button
            className="h-12 w-full bg-[#f36f0a] font-bold text-white hover:bg-[#d95e00]"
            disabled={busy || session.status === 'booting'}
            type="submit"
          >
            <LockKeyhole />
            {busy ? 'Signing in…' : 'Sign in securely'}
          </Button>
        </form>
        {error && (
          <p
            aria-live="polite"
            role="alert"
            className="mt-4 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100"
          >
            <AlertTriangle className="size-4 shrink-0" />
            Unable to sign in. Check your credentials and try again.
          </p>
        )}
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Protected session. Access tokens are never stored in browser storage.
        </p>
      </section>
    </main>
  );
}
