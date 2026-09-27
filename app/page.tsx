'use client';
import { useEffect } from 'react';
import { useSession } from '@/lib/session-provider';
export default function Home() {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'authenticated') window.location.replace('/dashboard');
    if (status === 'anonymous') window.location.replace('/login');
  }, [status]);
  return (
    <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
      Opening PTMS…
    </main>
  );
}
