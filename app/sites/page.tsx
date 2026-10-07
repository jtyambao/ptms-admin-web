'use client';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { PageContainer, PageHeader } from '@/components/page-layout';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canCreateSite } from '@/lib/portal-access';
import type { Site } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';
export default function SitesPage() {
  const session = useSession();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [saving, setSaving] = useState(false);
  const loadSites = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    setLoading(true);
    try {
      setSites(await managementApi.listSites(session.api));
      setError('');
    } catch (reason) {
      setError(
        reason instanceof ApiRequestError
          ? reason.message
          : 'Sites could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [session.api, session.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSites(), 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadSites]);
  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const hasLatitude = latitude.trim() !== '';
    const hasLongitude = longitude.trim() !== '';
    if (hasLatitude !== hasLongitude) {
      setError('Enter both latitude and longitude, or leave both blank.');
      return;
    }
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (
      hasLatitude &&
      (parsedLatitude < -90 ||
        parsedLatitude > 90 ||
        parsedLongitude < -180 ||
        parsedLongitude > 180)
    ) {
      setError('Latitude must be -90 to 90 and longitude must be -180 to 180.');
      return;
    }
    setSaving(true);
    try {
      const created = await managementApi.createSite(session.api, {
        name: name.trim(),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(hasLatitude
          ? { latitude: parsedLatitude, longitude: parsedLongitude }
          : {}),
      });
      // Full-page navigation: see the vinext router note in app/layout.tsx.
      window.location.assign(`/sites/${created.id}?setup=1`);
    } catch (reason) {
      setError(
        reason instanceof ApiRequestError
          ? reason.message
          : 'The Site could not be added. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  const allowed = session.user ? canCreateSite(session.user.role) : false;
  return (
    <ProtectedPortal>
      <PortalShell active="sites">
        <PageContainer>
          <PageHeader
            eyebrow="Your Sites"
            title="Sites"
            subtitle="Pick a Site to manage its guards, phones, patrols and reports."
            actions={allowed ? (
              <Button
                className="bg-[#f36f0a] text-white hover:bg-[#d95e00]"
                onClick={() => setShowCreate(true)}
              >
                <Plus />
                Add Site
              </Button>
            ) : undefined}
          />
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100 sm:flex-row sm:items-center"
            >
              <p className="flex flex-1 gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadSites()}
                disabled={loading}
              >
                <RefreshCw className={loading ? 'animate-spin' : ''} /> Retry
              </Button>
            </div>
          )}
          {showCreate && (
            <form
              className="rounded-2xl border bg-card p-5"
              onSubmit={create}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">
                    Site information
                  </p>
                  <h2 className="mt-1 font-black">Add a Site</h2>
                </div>
                <Button
                  aria-label="Close"
                  onClick={() => setShowCreate(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X />
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Start with the basics. Next you will choose a Supervisor and set
                the Site up. The map location is optional - in Google Maps,
                right-click the spot and tap the two numbers to copy them.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold">
                  Site name
                  <input
                    className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"
                    maxLength={150}
                    onChange={(e) => setName(e.target.value)}
                    required
                    value={name}
                  />
                </label>
                <label className="text-sm font-bold">
                  Address{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"
                    maxLength={255}
                    onChange={(e) => setAddress(e.target.value)}
                    value={address}
                  />
                </label>
                <label className="text-sm font-bold">
                  Latitude{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"
                    type="number"
                    inputMode="decimal"
                    min={-90}
                    max={90}
                    step="any"
                    placeholder="14.5995"
                    onChange={(e) => setLatitude(e.target.value)}
                    value={latitude}
                  />
                </label>
                <label className="text-sm font-bold">
                  Longitude{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"
                    type="number"
                    inputMode="decimal"
                    min={-180}
                    max={180}
                    step="any"
                    placeholder="120.9842"
                    onChange={(e) => setLongitude(e.target.value)}
                    value={longitude}
                  />
                </label>
              </div>
              <Button
                className="mt-5 bg-[#f36f0a] text-white"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Adding…' : 'Add Site and continue'}
              </Button>
            </form>
          )}
          <section className="grid gap-4">
            {loading ? (
              <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
                Loading your Sites…
              </p>
            ) : !error && sites.length === 0 ? (
              <div className="rounded-2xl border p-10 text-center">
                <Building2 className="mx-auto size-9 text-muted-foreground" />
                <p className="mt-4 font-bold">No Sites yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {allowed
                    ? 'Add the first Site to get started.'
                    : 'You do not have access to any Site yet. Ask the Owner or Engineer to give you access.'}
                </p>
              </div>
            ) : !error ? (
              sites.map((site) => (
                <Link
                  className="flex items-center gap-4 rounded-2xl border bg-card p-5 transition hover:border-orange-400"
                  href={`/sites/${site.id}`}
                  key={site.id}
                >
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-[#e86405] dark:bg-orange-500/15">
                    <Building2 />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-black">{site.name}</h2>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {site.address || 'No address yet'}
                    </p>
                  </div>
                  <span className="ml-auto hidden rounded-full border px-3 py-1 text-xs font-bold capitalize sm:block">
                    {site.status}
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              ))
            ) : null}
          </section>
        </PageContainer>
      </PortalShell>
    </ProtectedPortal>
  );
}
