'use client';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OfficialBrand } from '@/components/portal-shell';
import { useSession } from '@/lib/session-provider';
export default function UnauthorizedPage() {
  const session = useSession();
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="max-w-md text-center">
        <div className="mx-auto mb-7 w-fit">
          <OfficialBrand />
        </div>
        <ShieldX className="mx-auto size-12 text-[#f36f0a]" />
        <h1 className="mt-5 text-3xl font-black">You do not have access here</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your account is not set up to use the admin portal. Ask your administrator to check your role, then sign in again.
        </p>
        <Button
          className="mt-7"
          onClick={() => void session.logout()}
          variant="outline"
        >
          Log out
        </Button>
      </section>
    </main>
  );
}
