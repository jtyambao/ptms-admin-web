'use client';

import { Route, ShieldAlert } from 'lucide-react';
import { useSession } from '@/lib/session-provider';
import { canManageSiteOperations } from '@/lib/site-operations';

// Batch 1 (2026-09-07): this panel previously called `GET/POST/PATCH
// /sites/:siteId/rounds`, a REST contract that has never existed on
// origin/main or in production — confirmed against both
// checkpoint-rounds.controller.ts (the real backend module, an
// unauthenticated, non-Site-scoped, create-only "admin bootstrap" endpoint
// under a completely different path, `/checkpoint-rounds`) and the live
// production Swagger spec. There is no safe way to "fix the call" to match:
// the real endpoint has no list/update/deactivate route at all, so there is
// nothing genuinely equivalent to read or write here yet. Rather than adapt
// this UI to that unrelated, differently-shaped contract now, this panel is
// disabled until a real Patrol Schedule model is designed in a dedicated
// later batch — see BACKEND_GAPS.md.
export function SiteRoundsPanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const allowed = !!session.user && canManageSiteOperations(session.user.role);
  void siteId;

  if (!allowed) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5">
        <h2 className="text-xl font-black">Rounds</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4" />
          Round controls are unavailable for this role. The backend remains authoritative.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Patrol configuration</p>
        <h2 className="mt-1 text-xl font-black">Rounds</h2>
      </div>
      <div className="rounded-2xl border p-10 text-center">
        <Route className="mx-auto text-muted-foreground" />
        <p className="mt-4 font-bold">Round management is not available yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The Site-scoped Round contract this panel used to call does not exist on the
          current backend. A real Patrol Schedule model — with Site assignment, checkpoint
          sequencing, and interval configuration — is planned as a dedicated later batch.
          Nothing here is disabled by role; it is not yet backed by a working contract for
          any role.
        </p>
      </div>
    </section>
  );
}
