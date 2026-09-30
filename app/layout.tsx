import type { Metadata } from 'next';
import { SessionProvider } from '@/lib/session-provider';
import './globals.css';

// P5 font fix (branch feat/admin-oic-management) — next/font/google's
// Geist/Geist_Mono loaders cache font files locally under .vinext/fonts
// at BUILD time and bake the build MACHINE's own absolute filesystem
// path into the generated CSS/JS (a known vinext limitation, not a
// next/font bug per se). That path never exists on the Cloudflare
// Workers runtime this app actually deploys to, so production requests
// for those fonts failed with file:// errors — the build machine's path
// isn't even guaranteed to be the SAME machine that built it. Removed
// entirely rather than patched: this is an internal ops/security tool,
// not a marketing site where exact typography is load-bearing, and the
// system font stack below has zero external dependency and zero
// build-time path baking, eliminating the whole bug class rather than
// swapping in a different externally-hosted font that could hit the
// same problem again. --font-geist-sans/--font-geist-mono are kept as
// the actual CSS variable NAMES (see globals.css's --font-sans/--font-
// mono) so no consumer needed to change.

export const metadata: Metadata = {
  title: 'PTMS Admin Command',
  description: 'Patrol operations, coverage, alerts, and reporting in one secure command center.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* vinext 1.0.0-beta.5's production client router throws on Link
            clicks ("navigateClientSide is not a function"), so every
            same-origin link does a normal full-page navigation instead. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||(a.target&&a.target!=='_self')||a.hasAttribute('download'))return;var u=new URL(a.href,location.href);if(u.origin!==location.origin)return;e.preventDefault();e.stopImmediatePropagation();location.assign(u.href);},true);`,
          }}
        />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
