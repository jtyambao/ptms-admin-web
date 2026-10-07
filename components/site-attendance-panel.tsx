'use client';

import { AlertTriangle, Download, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/authenticated-api';
import { attendanceToCsv, deriveDailyOicCoverage } from '@/lib/attendance';
import { managementApi } from '@/lib/management-api';
import { canViewPersonnel } from '@/lib/personnel-management';
import type { SiteOicAssignment } from '@/lib/ptms-api';
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

// Attendance / OIC time-in-time-out (item 4c, extended into a real
// time-in/time-out ledger 2026-09-30 — see lib/attendance.ts's own header
// comment for exactly why site_oic_assignments is the right and only
// data source). Uses the dedicated, date-range-scoped
// GET /sites/:siteId/attendance endpoint (managementApi.getAttendance),
// not the unbounded assignment-history one. View-gated the same as OIC/
// Personnel visibility (canViewPersonnel), since this is a read-only
// derivation of that exact same data.
export function SiteAttendancePanel({ siteId }: { siteId: number }) {
  const session = useSession();
  const role = session.user?.role ?? null;
  const canView = !!role && canViewPersonnel(role);

  const [fromDate, setFromDate] = useState(() => daysAgoKey(6));
  const [toDate, setToDate] = useState(() => todayKey());
  const [oicAssignments, setOicAssignments] = useState<SiteOicAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!canView || session.status !== 'authenticated' || fromDate > toDate) return;
    setLoading(true);
    try {
      setOicAssignments(await managementApi.getAttendance(session.api, siteId, fromDate, toDate));
      setError('');
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : genericError);
    } finally {
      setLoading(false);
    }
  }, [canView, session.api, session.status, siteId, fromDate, toDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  if (!canView) {
    return (
      <section className="rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Attendance</p>
        <h2 className="mt-1 text-xl font-black">Officer in Charge: time in and out</h2>
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Your role cannot see Attendance for this Site.
        </p>
      </section>
    );
  }

  const days = fromDate <= toDate ? deriveDailyOicCoverage(oicAssignments, fromDate, toDate) : [];

  function exportCsv() {
    const blob = new Blob([attendanceToCsv(days)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-site-${siteId}-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">Attendance</p>
          <h2 className="mt-1 text-xl font-black">Officer in Charge: time in and out</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={loading || days.length === 0}>
            <Download />Export CSV
          </Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />Refresh
          </Button>
        </div>
      </div>

      <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <AlertTriangle className="size-4 shrink-0" />
        When the Officer in Charge (OIC) started and ended their duty at this Site. Other guards
        do not clock in one by one. Times are shown in your own local time.
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
          To
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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading attendance…</p>
        ) : fromDate > toDate ? (
          <p className="p-8 text-center text-sm text-muted-foreground">The end date must be on or after the start date.</p>
        ) : (
          <div className="divide-y">
            {days.map((day) => (
              <div key={day.date} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
                <p className="w-28 shrink-0 font-bold">
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}
                </p>
                {day.segments.length === 0 ? (
                  <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
                    No Officer in Charge
                  </Badge>
                ) : (
                  <div className="flex flex-1 flex-wrap gap-2">
                    {day.segments.map((segment, i) => (
                      <div key={`${segment.personnelId}-${segment.startedAt}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
                        <UserRound className="size-3" />
                        {segment.fullName}
                        <span className="font-normal text-muted-foreground">
                          {new Date(segment.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {' – '}
                          {segment.endedAt
                            ? new Date(segment.endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                            : 'now'}
                        </span>
                        <span className="font-normal text-muted-foreground">{segment.hoursThisDay.toFixed(1)}h</span>
                        {segment.missingTimeOut && (
                          <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
                            Missing time-out
                          </Badge>
                        )}
                      </div>
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
