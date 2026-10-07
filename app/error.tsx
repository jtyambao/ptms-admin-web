'use client';

import { useEffect } from 'react';
import { describeError } from '@/lib/describe-error';

// Page-level safety net: shows what actually failed (instead of the
// framework's generic "This page couldn't load") and logs it, so a crash
// that only happens on the live site can be reported precisely.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page] crashed:', error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground">
      <section role="alert" className="w-full max-w-md rounded-2xl border p-6">
        <h1 className="text-2xl font-black">This page could not be shown</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again, or go back to Operations. If it keeps happening, send the
          details below to support.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="h-10 rounded-lg bg-[#f36f0a] px-4 text-sm font-bold text-white" onClick={reset} type="button">
            Try again
          </button>
          <button className="h-10 rounded-lg border px-4 text-sm font-bold" onClick={() => window.location.assign('/dashboard')} type="button">
            Go to Operations
          </button>
        </div>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-bold">Details for support</summary>
          <p className="mt-2 break-words font-mono text-xs">
            {describeError(error)}
            {error?.digest ? ` (ref ${error.digest})` : ''}
          </p>
        </details>
      </section>
    </main>
  );
}
