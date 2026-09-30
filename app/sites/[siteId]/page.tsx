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
import type { Site, StaffingStatus } from '@/lib/ptms-api';
import { useSession } from '@/lib/session-provider';

type Section = 'overview' | 'people' | 'devices' | 'checkpoints' | 'rounds' | 'emergency-contacts' | 'reports' | 'requests' | 'attendance';

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
        'This Site address is invalid. Return to Sites and choose an authorized Site.',
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
          : 'Site details could not be loaded.',
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
      setError('Enter both latitude and longitude, or leave both blank.');
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (hasLat && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
      setError('Latitude must be -90 to 90 and longitude must be -180 to 180.');
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
          : 'Site information could not be updated.',
      );
    } finally {
      setSaving(false);
    }
  }

  function goTo(next: Section) {
    setSection(next);
    void refreshSummary();
  }

  return (
    <ProtectedPortal>
      <PortalShell active="sites" siteName={site?.name}>
        <div className="mx-auto max-w-6xl p-5 sm:p-8">
          <Link className="text-sm font-bold text-[#e86405]" href="/sites">
            ← All Sites
          </Link>
          {error && (
            <div
              role="alert"
              className="mt-5 flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100 sm:flex-row sm:items-center"
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
              className="mt-8 text-sm text-muted-foreground"
            >
              Loading authorized Site…
            </p>
          ) : !site ? (
            <div className="mt-8 rounded-2xl border p-8 text-center">
              <p className="font-bold">Site unavailable</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Return to the Sites list and choose a Site in your authorized
                scope.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-black">{site.name}</h1>
                    <Badge
                      variant={
                        site.status === 'active' ? 'secondary' : 'outline'
                      }
                    >
                      {site.status}
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
                value={section}
                onValueChange={(value) => goTo(value as Section)}
                className="mt-6"
              >
                <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl p-1">
                  <TabsTrigger className="min-h-10 px-4" value="overview">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="people">
                    People
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="devices">
                    Devices
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="checkpoints">
                    Checkpoints
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="rounds">
                    Rounds
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="emergency-contacts">
                    Emergency Contacts
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="reports">
                    Reports
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="requests">
                    Requests
                  </TabsTrigger>
                  <TabsTrigger className="min-h-10 px-4" value="attendance">
                    Attendance
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-6 space-y-7">
                  <section>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">
                      Setup status
                    </p>
                    <h2 className="mt-1 text-xl font-black">
                      Site setup guide
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This guide shows configuration progress only. It does not
                      activate patrol operations.
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
                    <h2 className="text-xl font-black">Overview</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Summary
                        label="Location"
                        value={
                          hasCoordinates(site.latitude, site.longitude)
                            ? `${site.latitude}, ${site.longitude}`
                            : 'Coordinates not set'
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
                        label="Current OIC"
                        value={staffing?.oic?.full_name || 'Needs setup'}
                        complete={!!staffing?.oic}
                      />
                      <Summary
                        label="Active Personnel"
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
                        label="Devices"
                        value={
                          signals.activeDevices === null
                            ? 'Managed by Site team'
                            : `${signals.activeDevices} active · ${signals.hasPrimaryDevice ? 'Primary set' : 'No Primary'}`
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
                            : `${signals.activeCheckpoints} active`
                        }
                        complete={
                          signals.activeCheckpoints === null
                            ? null
                            : signals.activeCheckpoints > 0
                        }
                      />
                      <Summary
                        label="NFC"
                        value={
                          signals.nfcReadyCheckpoints === null
                            ? 'Managed by Site team'
                            : `${signals.nfcReadyCheckpoints} of ${signals.activeCheckpoints} ready`
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
                      <SiteShiftBriefingPanel siteId={siteId} />
                    </div>
                  </section>
                </TabsContent>
                <TabsContent value="people" className="mt-6 space-y-8">
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
                </TabsContent>
                <TabsContent value="devices">
                  <SiteOperationsPanel siteId={siteId} section="devices" />
                </TabsContent>
                <TabsContent value="checkpoints">
                  <SiteOperationsPanel siteId={siteId} section="checkpoints" />
                </TabsContent>
                <TabsContent value="rounds">
                  <SiteRoundsPanel siteId={siteId} />
                </TabsContent>
                <TabsContent value="emergency-contacts">
                  <SiteEmergencyContactsPanel siteId={siteId} />
                </TabsContent>
                <TabsContent value="reports">
                  <SiteReportsPanel siteId={siteId} />
                </TabsContent>
                <TabsContent value="requests">
                  <SiteSpecialCheckRequestsPanel siteId={siteId} />
                </TabsContent>
                <TabsContent value="attendance">
                  <SiteAttendancePanel siteId={siteId} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Site information</DialogTitle>
              <DialogDescription>
                Coordinates are optional, but latitude and longitude must be
                entered together.
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
                  Duty-end / catch-up cutoff time
                  <Input
                    id="edit-site-duty-end-time"
                    type="time"
                    value={dutyEndTime}
                    onChange={(e) => setDutyEndTime(e.target.value)}
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    Local time this Site&apos;s duty ends, in the
                    organization&apos;s own timezone. Leave blank to disable
                    Missed Checkpoint Random Catch-Up for this Site.
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
                  {saving ? 'Saving…' : 'Save changes'}
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
