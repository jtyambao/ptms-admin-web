'use client';

import { AlertTriangle, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/authenticated-api';
import { deriveDailyOicCoverage } from '@/lib/attendance';
import { managementApi } from '@/lib/management-api';
import { canViewPersonnel } from '@/lib/personnel-management';
import { useSession } from '@/lib/session-provider';

const genericError = 'Attendance could not be loaded. Please try again.';

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysAgoKey(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

// Read-only "OIC Coverage" report (item 4c, owner-authorized 2026-09-30,
// see lib/attendance.ts's own header comment for exactly why it's scoped
// to OIC coverage and not full Guard attendance). Reuses the EXISTING
// GET /sites/:siteId/assignment-history endpoint (managementApi.
// getAssignmentHistory, already called elsewhere by SiteHierarchyPanel) —
// no new backend endpoint, no migration. View-gated the same as OIC/
// Personnel visibility (canViewPersonnel), since this is a read-only
// derivation of that exact same data.
export function SiteAttendancePanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canView = !!role && canViewPersonnel(role);

  const [fromDate, setFromDate] = useState(() => daysAgoKey(6));
  const [toDate, setToDate] = useState(() => todayKey());
  const [oicAssignments, setOicAssignments] = useState<import('@/lib/ptms-api').SiteOicAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!canView || session.status !== 'authenticated') return;
    setLoading(true);
    try {
      const history = await managementApi.getAssignmentHistory(session.api, siteId);
      setOicAssignments(history.oicAssignments);
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setLoading(false);
    }
  }, [canView, session.api, session.status, siteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  if (!canView) {
    return (
      <section className="mt-8 rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Attendance</p>
        <h2 className="mt-1 text-xl font-black">OIC Coverage</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Attendance is unavailable for this role. The backend remains authoritative.
        </p>
      </section>
    );
  }

  const days = fromDate <= toDate ? deriveDailyOicCoverage(oicAssignments, fromDate, toDate) : [];

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Attendance</p>
          <h2 className="mt-1 text-xl font-black">OIC Coverage</h2>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
        </Button>
      </div>

      <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <AlertTriangle className="size-4 shrink-0" />
        This is OIC handover coverage only, not a full Guard attendance/clock-in log — Guard
        personnel login (MPIN) is not historically recorded today, and device activity only shows
        the most recent login, not a history. Dates are shown in your own browser&apos;s local time.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor="attendance-from" className="grid gap-2 text-sm font-bold">
          From
          <input
            id="attendance-from"
            type="date"
            className="h-10 rounded-lg border bg-background px-3 font-normal"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label htmlFor="attendance-to" className="grid gap-2 text-sm font-bold">
          Thru
          <input
            id="attendance-to"
            type="date"
            className="h-10 rounded-lg border bg-background px-3 font-normal"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </p>
      )}

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading Attendance…</p>
        ) : fromDate > toDate ? (
          <p className="p-8 text-center text-sm text-muted-foreground">&quot;Thru&quot; must be on or after &quot;From&quot;.</p>
        ) : (
          <div className="divide-y">
            {days.map((day) => (
              <div key={day.date} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
                <p className="w-28 shrink-0 font-bold">
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}
                </p>
                {day.segments.length === 0 ? (
                  <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
                    No OIC coverage
                  </Badge>
                ) : (
                  <div className="flex flex-1 flex-wrap gap-2">
                    {day.segments.map((segment, i) => (
                      <Badge key={`${segment.personnelId}-${segment.startedAt}-${i}`} variant="secondary" className="gap-1.5">
                        <UserRound className="size-3" />
                        {segment.fullName}
                        <span className="font-normal text-muted-foreground">
                          {new Date(segment.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {' – '}
                          {segment.endedAt
                            ? new Date(segment.endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                            : 'now'}
                        </span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
