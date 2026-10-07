'use client';
import { useEffect, type ReactNode } from 'react';
import { OfficialBrand } from './portal-shell';
import { canAccessOperationalPortal } from '@/lib/portal-access';
import { useSession } from '@/lib/session-provider';
export function ProtectedPortal({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  useEffect(() => {
    if (status === 'anonymous') window.location.replace('/login');
    if (
      status === 'authenticated' &&
      user &&
      !canAccessOperationalPortal(user.role)
    )
      window.location.replace('/unauthorized');
  }, [status, user]);
  if (
    status !== 'authenticated' ||
    !user ||
    !canAccessOperationalPortal(user.role)
  )
    return (
      <main
        aria-busy="true"
        className="grid min-h-screen place-items-center bg-background"
      >
        <output className="block text-center">
          <OfficialBrand />
          <p className="mt-5 text-sm text-muted-foreground">
            Loading, one moment…
          </p>
        </output>
      </main>
    );
  return children;
}
