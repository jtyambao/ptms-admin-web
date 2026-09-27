import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SessionProvider } from '@/lib/session-provider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
