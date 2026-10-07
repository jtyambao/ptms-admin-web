'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Edit3,
  MapPin,
  MinusCircle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react';
import { ProtectedPortal } from '@/components/protected-portal';
import { PortalShell } from '@/components/portal-shell';
import { PageContainer } from '@/components/page-layout';
import { SiteHierarchyPanel } from '@/components/site-hierarchy-panel';
import { SitePersonnelPanel } from '@/components/site-personnel-panel';
import { SiteOperationsPanel } from '@/components/site-operations-panel';
import { SiteRoundsPanel } from '@/components/site-rounds-panel';
import { SitePatrolActivationToggle } from '@/components/site-patrol-activation-toggle';
import { SiteShiftBriefingPanel } from '@/components/site-shift-briefing-panel';
import { SiteEmergencyContactsPanel } from '@/components/site-emergency-contacts-panel';
import { SiteReportsPanel } from '@/components/site-reports-panel';
import { SiteSpecialCheckRequestsPanel } from '@/components/site-special-check-requests-panel';
import { SiteAttendancePanel } from '@/components/site-attendance-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiRequestError } from '@/lib/authenticated-api';
import { managementApi } from '@/lib/management-api';
import { canViewPersonnel } from '@/lib/personnel-management';
import { canManageSiteOperations } from '@/lib/site-operations';
import {
  canEditSiteInformation,
  hasCoordinates,
  setupSteps,
  type SetupSignals,
} from '@/lib/site-setup';
import { SITE_GROUPS, groupOf, sectionFromTab, type SiteSection } from '@/lib/site-tabs';
import type { Site, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type Section = SiteSection;

export default function SiteDetailPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = Number(params.siteId);
  const session = useSession();
  const [site, setSite] = useState<Site | null>(null);
  const [staffing, setStaffing] = useState<StaffingStatus | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [signals, setSignals] = useState<SetupSignals>({
    staffing: null,
    activePersonnel: null,
    activeDevices: null,
    hasPrimaryDevice: null,
    activeCheckpoints: null,
    nfcReadyCheckpoints: null,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [dutyEndTime, setDutyEndTime] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshSummary = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    if (!Number.isInteger(siteId) || siteId < 1) {
      setError(
        'This Site link is not valid. Go back to Sites and pick a Site from the list.',
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [siteResult, staffingResult] = await Promise.all([
        managementApi.getSite(session.api, siteId),
        managementApi.getStaffing(session.api, siteId),
      ]);
      setSite(siteResult);
      setStaffing(staffingResult);
      setError('');
      const role = session.user?.role;
      const canReadOperations = !!role && canManageSiteOperations(role);
      // Batch 3 correction (2026-09-26): reverted a 2026-09-24 inline
      // duplicate of this check that used 'owner' (the approved future
      // business role — real as a design target, but not yet part of the
      // currently deployed UserRole type this `role` variable actually
      // holds) and included 'admin' where current production excludes it.
      // Uses the shared canViewPersonnel predicate (lib/personnel-management.ts)
      // instead of a second, independently-driftable inline copy — verified
      // against a fresh origin/main read of PersonnelService.findAllForRequester():
      // super_admin/engineer/manager org-wide, supervisor/site_admin
      // assigned-site scoped server-side; admin/org_admin excluded under
      // current production RBAC.
      const canReadPersonnel = !!role && canViewPersonnel(role);
      const [personnel, devices, checkpoints] = await Promise.all([
        canReadPersonnel
          ? managementApi.listPersonnel(session.api).catch(() => null)
          : Promise.resolve(null),
        canReadOperations
          ? managementApi.listDevices(session.api, siteId).catch(() => null)
          : Promise.resolve(null),
        canReadOperations
          ? managementApi.listCheckpoints(session.api, siteId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const activePersonnel =
        personnel?.filter(
          (item) => item.site_id === siteId && item.status === 'active',
        ) ?? null;
      const activeDevices = devices?.filter((item) => item.is_active) ?? null;
      const activeCheckpoints =
        checkpoints?.filter((item) => item.status === 'active') ?? null;
      setSignals({
        staffing: staffingResult,
        activePersonnel: activePersonnel?.length ?? null,
        activeDevices: activeDevices?.length ?? null,
        hasPrimaryDevice: activeDevices
          ? activeDevices.some((item) => item.is_primary)
          : null,
        activeCheckpoints: activeCheckpoints?.length ?? null,
        nfcReadyCheckpoints:
          activeCheckpoints?.filter((item) => !!item.tag_uid).length ?? null,
      });
    } catch (reason) {
      setError(
        reason instanceof ApiRequestError
          ? reason.message
          : 'This Site could not be loaded. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [session.api, session.status, session.user, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshSummary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshSummary]);

  const steps = useMemo(
    () => setupSteps({ ...signals, staffing }),
    [signals, staffing],
  );
  const role = session.user?.role;
  // Batch 1 (2026-09-07) found production had no PATCH/PUT/update route for
  // a Site at all, so this form was left wired to a `false` gate until a
  // real update endpoint existed. Missed Checkpoint Random Catch-Up
  // (owner-approved, 2026-09-11) added `PATCH /management/sites/:id`
  // (management-sites.controller.ts) to let admins set the new
  // `duty_end_time` cutoff — the form below is now reachable again.
  const editable = !!role && canEditSiteInformation(role);

  function beginEdit() {
    if (!site) return;
    setName(site.name);
    setAddress(site.address ?? '');
    setLatitude(site.latitude?.toString() ?? '');
    setLongitude(site.longitude?.toString() ?? '');
    setDutyEndTime(site.duty_end_time?.slice(0, 5) ?? '');
    setEditOpen(true);
  }

  async function updateSite(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const hasLat = latitude.trim() !== '';
    const hasLng = longitude.trim() !== '';
    if (hasLat !== hasLng) {
      setError('Fill in both the latitude and the longitude, or leave both empty.');
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (hasLat && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
      setError('Latitude must be between -90 and 90, and longitude between -180 and 180.');
      return;
    }
    setSaving(true);
    try {
      const updated = await managementApi.updateSite(session.api, siteId, {
        name: name.trim(),
        address: address.trim(),
        ...(hasLat ? { latitude: lat, longitude: lng } : {}),
        dutyEndTime: dutyEndTime.trim() === '' ? null : dutyEndTime,
      });
      setSite(updated);
      setEditOpen(false);
    } catch (reason) {
      setError(
        reason instanceof ApiRequestError
          ? reason.message
          : 'The Site information could not be saved. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  // /sites/4?tab=rounds (an old section id) or ?tab=patrols (a group) opens
  // that part directly; the address bar follows the admin's choice so a page
  // can be bookmarked or shared.
  useEffect(() => {
    const wanted = sectionFromTab(new URLSearchParams(window.location.search).get('tab'));
    if (wanted) setSection(wanted);
  }, []);

  function goTo(next: Section) {
    setSection(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'overview') url.searchParams.delete('tab');
      else url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url);
    } catch {
      // The address bar is a convenience only.
    }
    void refreshSummary();
  }
  const activeGroup = groupOf(section);

  return (
    <ProtectedPortal>
      <PortalShell active="sites" siteName={site?.name}>
        <PageContainer>
          <Link className="text-sm font-bold text-[#e86405]" href="/sites">
            ← All Sites
          </Link>
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100 sm:flex-row sm:items-center"
            >
              <p className="flex flex-1 gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </p>
              {Number.isInteger(siteId) && siteId > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshSummary()}
                  disabled={loading}
                >
                  <RefreshCw className={loading ? 'animate-spin' : ''} />
                  Retry
                </Button>
              )}
            </div>
          )}
          {!site && loading ? (
            <p
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              Loading this Site…
            </p>
          ) : !site ? (
            <div className="rounded-2xl border p-8 text-center">
              <p className="font-bold">Site unavailable</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Go back to the Sites list and pick a Site you have access to.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-black">{site.name}</h1>
                    <Badge
                      variant={
                        site.status === 'active' ? 'secondary' : 'outline'
                      }
                    >
                      {site.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4" />
                    {site.address || 'Address not set'}
                  </p>
                </div>
                {editable && (
                  <Button variant="outline" onClick={beginEdit}>
                    <Edit3 />
                    Edit Site information
                  </Button>
                )}
              </div>
              <Tabs
                value={activeGroup.id}
                onValueChange={(value) => {
                  const group = SITE_GROUPS.find((candidate) => candidate.id === value);
                  if (group) goTo(group.items[0].section);
                }}
              >
                <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl p-1">
                  {SITE_GROUPS.map((group) => (
                    <TabsTrigger className="min-h-10 shrink-0 px-4" key={group.id} value={group.id}>
                      {group.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {activeGroup.items.length > 1 && (
                  <div
                    aria-label={`${activeGroup.label} sections`}
                    className="mt-4 flex flex-wrap gap-2"
                    role="group"
                  >
                    {activeGroup.items.map((item) => (
                      <button
                        aria-pressed={section === item.section}
                        className={`min-h-9 rounded-full border px-4 text-sm font-bold transition ${section === item.section ? 'border-[#f36f0a] bg-[#f36f0a] text-white' : 'bg-card text-muted-foreground hover:border-orange-400'}`}
                        key={item.section}
                        onClick={() => goTo(item.section)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                <TabsContent value="overview" className="mt-6 space-y-7">
                  <section>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">
                      Getting started
                    </p>
                    <h2 className="mt-1 text-xl font-black">
                      Site setup guide
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Tick off each step to get this Site ready. Finishing the steps
                      does not start patrols by itself.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {steps.map((step, index) => (
                        <button
                          type="button"
                          onClick={() =>
                            goTo(
                              index < 1
                                ? 'overview'
                                : index < 5
                                  ? 'people'
                                  : index === 5
                                    ? 'devices'
                                    : 'checkpoints',
                            )
                          }
                          className="flex min-h-24 items-start gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-orange-400"
                          key={step.label}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-black">
                            {index + 1}
                          </span>
                          <span>
                            <span className="font-bold">{step.label}</span>
                            <span className="mt-2 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                              {step.complete === true ? (
                                <>
                                  <CheckCircle2 className="size-4 text-emerald-600" />
                                  Completed
                                </>
                              ) : step.complete === false ? (
                                <>
                                  <CircleDashed className="size-4 text-amber-600" />
                                  Needs setup
                                </>
                              ) : (
                                <>
                                  <MinusCircle className="size-4" />
                                  Managed by Site team
                                </>
                              )}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h2 className="text-xl font-black">At a glance</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Summary
                        label="Location"
                        value={
                          hasCoordinates(site.latitude, site.longitude)
                            ? `${site.latitude}, ${site.longitude}`
                            : 'Map location not set'
                        }
                        complete={hasCoordinates(site.latitude, site.longitude)}
                      />
                      <Summary
                        label="Supervisor"
                        value={staffing?.supervisor?.full_name || 'Needs setup'}
                        complete={!!staffing?.supervisor}
                      />
                      <Summary
                        label="Admin"
                        value={
                          (staffing?.admins.length ?? 0) > 1
                            ? `${staffing!.admins[0].full_name} +${staffing!.admins.length - 1} more`
                            : staffing?.admin?.full_name || staffing?.siteAdmin?.full_name || 'Needs setup'
                        }
                        complete={!!(staffing?.admin || staffing?.siteAdmin)}
                      />
                      <Summary
                        label="Officer in Charge"
                        value={staffing?.oic?.full_name || 'Needs setup'}
                        complete={!!staffing?.oic}
                      />
                      <Summary
                        label="Guards"
                        value={
                          signals.activePersonnel === null
                            ? 'Managed by Site team'
                            : String(signals.activePersonnel)
                        }
                        complete={
                          signals.activePersonnel === null
                            ? null
                            : signals.activePersonnel > 0
                        }
                      />
                      <Summary
                        label="Guard phones"
                        value={
                          signals.activeDevices === null
                            ? 'Managed by Site team'
                            : `${signals.activeDevices} added · ${signals.hasPrimaryDevice ? 'main phone set' : 'no main phone yet'}`
                        }
                        complete={
                          signals.activeDevices === null
                            ? null
                            : signals.activeDevices > 0 &&
                              signals.hasPrimaryDevice === true
                        }
                      />
                      <Summary
                        label="Checkpoints"
                        value={
                          signals.activeCheckpoints === null
                            ? 'Managed by Site team'
                            : `${signals.activeCheckpoints} added`
                        }
                        complete={
                          signals.activeCheckpoints === null
                            ? null
                            : signals.activeCheckpoints > 0
                        }
                      />
                      <Summary
                        label="NFC tags"
                        value={
                          signals.nfcReadyCheckpoints === null
                            ? 'Managed by Site team'
                            : `${signals.nfcReadyCheckpoints} of ${signals.activeCheckpoints} checkpoints ready`
                        }
                        complete={
                          signals.activeCheckpoints === null
                            ? null
                            : signals.activeCheckpoints > 0 &&
                              signals.nfcReadyCheckpoints ===
                                signals.activeCheckpoints
                        }
                      />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {site && (
                        <SitePatrolActivationToggle
                          siteId={siteId}
                          site={site}
                          onSiteChange={setSite}
                        />
                      )}
                    </div>
                  </section>
                </TabsContent>
                <TabsContent value="people" className="mt-6 space-y-8">
                  {section === 'people' && (
                    <>
                      <SiteHierarchyPanel
                        siteId={siteId}
                        staffing={staffing}
                        onStaffingChange={(next) => {
                          setStaffing(next);
                          setSignals((current) => ({ ...current, staffing: next }));
                        }}
                      />
                      <SitePersonnelPanel
                        siteId={siteId}
                        staffing={staffing}
                        onStaffingChange={setStaffing}
                      />
                    </>
                  )}
                  {section === 'devices' && <SiteOperationsPanel siteId={siteId} section="devices" />}
                </TabsContent>
                <TabsContent value="patrols" className="mt-6">
                  {section === 'checkpoints' && <SiteOperationsPanel siteId={siteId} section="checkpoints" />}
                  {section === 'rounds' && <SiteRoundsPanel siteId={siteId} />}
                </TabsContent>
                <TabsContent value="handover" className="mt-6">
                  {section === 'briefing' && <SiteShiftBriefingPanel siteId={siteId} />}
                  {section === 'emergency-contacts' && <SiteEmergencyContactsPanel siteId={siteId} />}
                </TabsContent>
                <TabsContent value="requests" className="mt-6">
                  {section === 'requests' && <SiteSpecialCheckRequestsPanel siteId={siteId} />}
                  {section === 'reports' && <SiteReportsPanel siteId={siteId} />}
                  {section === 'attendance' && <SiteAttendancePanel siteId={siteId} />}
                </TabsContent>
              </Tabs>
            </>
          )}
        </PageContainer>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Site information</DialogTitle>
              <DialogDescription>
                The map location is optional. If you fill it in, enter both the
                latitude and the longitude.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={updateSite}>
              <div className="grid gap-4">
                <label
                  htmlFor="edit-site-name"
                  className="grid gap-2 font-bold"
                >
                  Site name
                  <Input
                    id="edit-site-name"
                    value={name}
                    maxLength={150}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
                <label
                  htmlFor="edit-site-address"
                  className="grid gap-2 font-bold"
                >
                  Address
                  <Input
                    id="edit-site-address"
                    value={address}
                    maxLength={255}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    htmlFor="edit-site-latitude"
                    className="grid gap-2 font-bold"
                  >
                    Latitude
                    <Input
                      id="edit-site-latitude"
                      type="number"
                      inputMode="decimal"
                      min={-90}
                      max={90}
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                    />
                  </label>
                  <label
                    htmlFor="edit-site-longitude"
                    className="grid gap-2 font-bold"
                  >
                    Longitude
                    <Input
                      id="edit-site-longitude"
                      type="number"
                      inputMode="decimal"
                      min={-180}
                      max={180}
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                    />
                  </label>
                </div>
                <label
                  htmlFor="edit-site-duty-end-time"
                  className="grid gap-2 font-bold"
                >
                  Time the shift ends
                  <Input
                    id="edit-site-duty-end-time"
                    type="time"
                    value={dutyEndTime}
                    onChange={(e) => setDutyEndTime(e.target.value)}
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    When the guards&apos; shift ends at this Site (local time). Missed
                    checkpoints can be made up before this time. Leave empty to
                    turn that off.
                  </span>
                </label>
              </div>
              <DialogFooter className="mt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PortalShell>
    </ProtectedPortal>
  );
}

function Summary({
  label,
  value,
  complete,
}: {
  label: string;
  value: string;
  complete: boolean | null;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        {complete === true ? (
          <CheckCircle2 className="size-5 text-emerald-600" />
        ) : complete === false ? (
          <CircleDashed className="size-5 text-amber-600" />
        ) : (
          <MinusCircle className="size-5 text-muted-foreground" />
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-3 break-words font-black">{value}</p>
    </div>
  );
}
