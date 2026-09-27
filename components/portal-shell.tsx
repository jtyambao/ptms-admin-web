'use client';
import Image from 'next/image';
import Link from 'next/link';
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { roleLabel } from '@/lib/role-labels';
import { useSession } from '@/lib/session-provider';
export function OfficialBrand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        alt="Official PTMS logo"
        className="size-11 rounded-xl"
        height={160}
        priority
        src="/brand/ptms-official-logo.png"
        width={160}
      />
      <div>
        <p className="text-lg font-black leading-none">
          G<span className="text-[#f36f0a]">PTMS</span>
        </p>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#f36f0a]">
          Admin Portal
        </p>
      </div>
    </div>
  );
}
const links = [
  { href: '/dashboard', label: 'Operations', icon: LayoutDashboard, active: 'dashboard' as const },
  { href: '/sites', label: 'Sites', icon: Building2, active: 'sites' as const },
  // Batch 2: Accounts nav link is always shown, same as every other link —
  // role gating happens inside the page itself (matching how e.g. Rounds'
  // "unavailable for this role" message works), not by hiding navigation.
  { href: '/accounts', label: 'Accounts', icon: Users, active: 'accounts' as const },
  // Operational Settings (owner-authorized, 2026-09-17) — same
  // always-shown-nav/gate-inside-page convention as Accounts above; the
  // page itself shows a clear "your role cannot manage settings" message
  // for anything other than org_admin/super_admin.
  { href: '/settings', label: 'Settings', icon: Settings, active: 'settings' as const },
];
export function PortalShell({
  active,
  children,
  siteName,
}: {
  active: 'dashboard' | 'sites' | 'accounts' | 'settings';
  children: ReactNode;
  siteName?: string;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      (localStorage.getItem('ptms-theme') === 'dark' ||
        (!localStorage.getItem('ptms-theme') &&
          matchMedia('(prefers-color-scheme: dark)').matches)),
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('ptms-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return (
    <main className="min-h-screen bg-background text-foreground">
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-[#111] text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <OfficialBrand />
          <Button
            aria-label="Close navigation"
            className="text-white lg:hidden"
            onClick={() => setOpen(false)}
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        <nav className="space-y-1 p-3 pt-6">
          {links.map(({ href, label, icon: Icon, active: linkActive }) => (
            <Link
              aria-current={active === linkActive ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-bold ${active === linkActive ? 'bg-[#f36f0a]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
              href={href}
              key={href}
              onClick={() => setOpen(false)}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 p-4">
          <p className="truncate text-sm font-bold">
            {session.user?.full_name}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {session.user ? roleLabel(session.user.role) : ''}
          </p>
          <Button
            className="mt-4 w-full justify-start text-white/70"
            onClick={() => void session.logout()}
            variant="ghost"
          >
            <LogOut />
            Log out
          </Button>
        </div>
      </aside>
      <section className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center border-b bg-background/90 px-4 backdrop-blur sm:px-8">
          <Button
            aria-label="Open navigation"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Menu />
          </Button>
          <div className="ml-3 lg:ml-0">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">
              PTMS operations
            </p>
            <p className="text-sm font-black">
              {siteName ?? 'Operational console'}
            </p>
          </div>
          <Button
            aria-label={`Use ${dark ? 'light' : 'dark'} theme`}
            className="ml-auto"
            onClick={() => setDark(!dark)}
            size="icon"
            variant="outline"
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </header>
        {children}
      </section>
    </main>
  );
}
