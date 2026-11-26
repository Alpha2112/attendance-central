'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  DownloadCloud,
  Cpu,
  CalendarRange,
  Eye,
  ClipboardCheck,
  ListChecks,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  WifiOff,
  Search,
  History,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ----------------------------- Types -----------------------------

type Step = 'configure' | 'fetching' | 'preview' | 'review' | 'committing' | 'results';
type Period = 'daily' | 'weekly' | 'monthly' | 'custom';
type RowLevel = 'valid' | 'warning' | 'error';

interface DeviceOption {
  id: number;
  device_code: string;
  name: string;
  vendor: string;
  host: string;
  port: number;
  status: string;
}
interface SyncRowIssue {
  field: string;
  level: 'error' | 'warning';
  message: string;
}
interface SyncCandidate {
  rowId: string;
  vendorUserId: string;
  externalEmployeeId: string;
  employeeName: string | null;
  mapped: boolean;
  deviceRecordId: string;
  punchTimeUtc: string;
  punchTimeLocal: string;
  eventDate: string;
  punchType: string;
  verificationType: string;
  cardNo: string | null;
  fingerprint: string;
  level: RowLevel;
  alreadySynced: boolean;
  duplicateInBatch: boolean;
  willImport: boolean;
  issues: SyncRowIssue[];
}
interface FetchResult {
  jobId: number;
  deviceId: number;
  deviceCode: string;
  deviceName: string;
  vendor: string;
  from: string;
  to: string;
  dateRangeSupported: boolean;
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    duplicatesInBatch: number;
    alreadySynced: number;
    willImport: number;
  };
  candidates: SyncCandidate[];
}
interface CommitRowResult {
  externalEmployeeId: string;
  deviceRecordId: string;
  status: 'imported' | 'duplicate' | 'skipped' | 'failed';
  message: string;
}
interface CommitResult {
  jobId: number;
  summary: { total: number; imported: number; duplicates: number; skipped: number; failed: number };
  durationMs: number;
  results: CommitRowResult[];
}
interface SyncJob {
  id: number;
  deviceId: number;
  deviceCode: string;
  deviceName: string | null;
  vendor: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  requestedBy: string;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  recordsReceived: number;
  recordsInserted: number;
  duplicates: number;
  errors: number;
  errorMessage: string | null;
}

const STEPS: { key: Step; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'configure', label: 'Configure', icon: CalendarRange },
  { key: 'fetching', label: 'Fetch', icon: DownloadCloud },
  { key: 'preview', label: 'Preview & Validate', icon: Eye },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'results', label: 'Results', icon: ListChecks },
];

// ----------------------------- Date helpers -----------------------------

const ymd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
function rangeFor(period: Period): { from: string; to: string } {
  const today = new Date();
  const to = ymd(today);
  if (period === 'daily') return { from: to, to };
  if (period === 'weekly') {
    const f = new Date(today);
    f.setDate(f.getDate() - 6);
    return { from: ymd(f), to };
  }
  if (period === 'monthly') {
    const f = new Date(today);
    f.setDate(f.getDate() - 29);
    return { from: ymd(f), to };
  }
  return { from: to, to };
}

function dayCount(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function vendorBadgeCls(vendor: string): string {
  const v = (vendor || '').toUpperCase();
  if (v === 'HIKVISION')
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
  if (v === 'ZKTECO')
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
  if (v === 'SUPREMA')
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  if (v === 'ANVIZ')
    return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}
function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----------------------------- Component -----------------------------

export default function ManualSyncPage() {
  const router = useRouter();
  const [view, setView] = useState<'wizard' | 'history'>('wizard');
  const [step, setStep] = useState<Step>('configure');
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('daily');
  const [from, setFrom] = useState<string>(rangeFor('daily').from);
  const [to, setTo] = useState<string>(rangeFor('daily').to);

  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'import' | 'warning' | 'error' | 'synced'>(
    'all',
  );
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // History tab
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/devices', { cache: 'no-store' });
        if (res.ok) {
          const list = (await res.json()) as DeviceOption[];
          if (Array.isArray(list)) {
            setDevices(list);
            if (list.length && !deviceId) setDeviceId(String(list[0]!.id));
          }
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      const res = await fetch(`/api/punches/sync/jobs?${qs.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const list = (await res.json()) as SyncJob[];
        if (Array.isArray(list)) setJobs(list);
      }
    } catch {
      /* non-fatal */
    } finally {
      setJobsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (view === 'history') void fetchJobs();
  }, [view, fetchJobs]);

  const selectPeriod = (p: Period) => {
    setPeriod(p);
    if (p !== 'custom') {
      const r = rangeFor(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const selectedDevice = devices.find((d) => String(d.id) === deviceId) || null;

  // -------- Fetch --------
  const runFetch = useCallback(async () => {
    if (!deviceId) {
      notify('Select a terminal first.', 'error');
      return;
    }
    if (from > to) {
      notify('"From" date must be on or before "To" date.', 'error');
      return;
    }
    setError(null);
    setStep('fetching');
    try {
      const res = await fetch('/api/punches/sync/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: Number(deviceId), from, to }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || data?.message || 'Fetch failed');
        setStep('configure');
        return;
      }
      const result = data as FetchResult;
      setFetchResult(result);
      // Pre-select everything importable.
      setSelected(new Set(result.candidates.filter((c) => c.willImport).map((c) => c.rowId)));
      setStep('preview');
    } catch {
      setError('Could not reach the sync API.');
      setStep('configure');
    }
  }, [deviceId, from, to]);

  // -------- Selection --------
  const toggleRow = (rowId: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(rowId)) n.delete(rowId);
      else n.add(rowId);
      return n;
    });
  const importable = fetchResult?.candidates.filter((c) => c.willImport) ?? [];
  const allSelected = importable.length > 0 && importable.every((c) => selected.has(c.rowId));
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size >= importable.length ? new Set() : new Set(importable.map((c) => c.rowId)),
    );

  const filteredCandidates = useMemo(() => {
    const list = fetchResult?.candidates ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (levelFilter === 'import' && !c.willImport) return false;
      if (levelFilter === 'warning' && c.level !== 'warning') return false;
      if (levelFilter === 'error' && c.level !== 'error') return false;
      if (levelFilter === 'synced' && !c.alreadySynced) return false;
      if (!q) return true;
      return (
        c.externalEmployeeId.toLowerCase().includes(q) ||
        (c.employeeName || '').toLowerCase().includes(q) ||
        c.vendorUserId.toLowerCase().includes(q) ||
        c.deviceRecordId.toLowerCase().includes(q)
      );
    });
  }, [fetchResult, search, levelFilter]);

  // -------- Commit --------
  const runCommit = useCallback(async () => {
    if (!fetchResult) return;
    const rows = fetchResult.candidates
      .filter((c) => selected.has(c.rowId) && c.willImport)
      .map((c) => ({
        vendorUserId: c.vendorUserId,
        punchTimeUtc: c.punchTimeUtc,
        punchType: c.punchType,
        verificationType: c.verificationType,
        deviceRecordId: c.deviceRecordId,
        cardNo: c.cardNo ?? undefined,
        userName: c.employeeName ?? undefined,
      }));
    if (rows.length === 0) {
      notify('Select at least one record to import.', 'error');
      return;
    }
    setError(null);
    setStep('committing');
    try {
      const res = await fetch('/api/punches/sync/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: fetchResult.jobId, rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || data?.message || 'Commit failed');
        setStep('review');
        return;
      }
      setCommitResult(data as CommitResult);
      setStep('results');
    } catch {
      setError('Could not reach the sync API.');
      setStep('review');
    }
  }, [fetchResult, selected]);

  const selectedCount = fetchResult
    ? fetchResult.candidates.filter((c) => selected.has(c.rowId) && c.willImport).length
    : 0;

  const downloadResults = (onlyFailed: boolean) => {
    if (!commitResult) return;
    const rows = commitResult.results.filter((r) =>
      onlyFailed ? r.status === 'failed' || r.status === 'skipped' : true,
    );
    downloadCsv(
      onlyFailed ? 'manual-sync-failed.csv' : 'manual-sync-results.csv',
      toCsv(
        ['employeeId', 'deviceRecordId', 'outcome', 'detail'],
        rows.map((r) => [r.externalEmployeeId, r.deviceRecordId, r.status, r.message]),
      ),
    );
  };

  const resetAll = () => {
    setStep('configure');
    setFetchResult(null);
    setCommitResult(null);
    setSelected(new Set());
    setSearch('');
    setLevelFilter('all');
    setError(null);
  };

  // ----------------------------- Render -----------------------------
  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium border ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <DownloadCloud className="h-6 w-6 text-primary" />
            Manual Terminal Sync
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pull historical punch logs from a terminal for a date range, review &amp; validate them,
            then commit — safely and idempotently. Automatic sync keeps running untouched.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/punches')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Punch Logs
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-md border border-input bg-background p-0.5">
        <button
          type="button"
          onClick={() => setView('wizard')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            view === 'wizard'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <DownloadCloud className="h-3.5 w-3.5" /> New Sync
        </button>
        <button
          type="button"
          onClick={() => setView('history')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            view === 'history'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-3.5 w-3.5" /> History
        </button>
      </div>

      {view === 'wizard' && (
        <>
          <Stepper current={step} />

          {error && (
            <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {/* Step 1: Configure */}
          {step === 'configure' && (
            <Card className="border-border bg-card">
              <CardContent className="p-5 sm:p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 md:divide-x md:divide-border">
                  {/* ---- Source Terminal ---- */}
                  <section className="space-y-3 md:pr-8">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Cpu className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground leading-none">
                          Source Terminal
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Which terminal to pull punches from
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <select
                        value={deviceId}
                        onChange={(e) => setDeviceId(e.target.value)}
                        className="w-full h-10 pl-3 pr-9 rounded-lg border border-input bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {devices.length === 0 ? (
                          <option value="">No devices registered</option>
                        ) : (
                          devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.device_code} — {d.name} ({d.vendor})
                            </option>
                          ))
                        )}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>

                    {selectedDevice && (
                      <div className="rounded-xl border border-border bg-muted/20 p-3.5 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Cpu className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-foreground text-sm truncate">
                              {selectedDevice.device_code}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-semibold ${vendorBadgeCls(selectedDevice.vendor)}`}
                            >
                              {selectedDevice.vendor}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {selectedDevice.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {selectedDevice.host}:{selectedDevice.port}
                          </div>
                        </div>
                        {selectedDevice.status === 'ONLINE' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 text-[11px] font-semibold shrink-0">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                            Online
                          </span>
                        ) : (
                          <span
                            title="The fetch will still try, but may fail if the terminal is unreachable"
                            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-2.5 py-1 text-[11px] font-semibold shrink-0"
                          >
                            <WifiOff className="h-3 w-3" /> {selectedDevice.status || 'Offline'}
                          </span>
                        )}
                      </div>
                    )}
                    {selectedDevice && selectedDevice.status !== 'ONLINE' && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> This terminal is{' '}
                        {(selectedDevice.status || 'offline').toLowerCase()} — the fetch will try
                        anyway but may fail if it can&apos;t be reached.
                      </p>
                    )}
                  </section>

                  {/* ---- Synchronization Period ---- */}
                  <section className="space-y-3 md:pl-8">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <CalendarRange className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground leading-none">
                          Synchronization Period
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Date range of punches to retrieve
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {(['daily', 'weekly', 'monthly', 'custom'] as Period[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => selectPeriod(p)}
                          className={`h-9 rounded-lg text-xs font-medium capitalize border transition-colors ${
                            period === p
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-background text-muted-foreground border-input hover:text-foreground hover:border-primary/40'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    {period === 'custom' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-muted-foreground mb-1 block">
                            From date
                          </label>
                          <input
                            type="date"
                            value={from}
                            max={to}
                            onChange={(e) => {
                              setFrom(e.target.value);
                              setPeriod('custom');
                            }}
                            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground mb-1 block">
                            To date
                          </label>
                          <input
                            type="date"
                            value={to}
                            min={from}
                            onChange={(e) => {
                              setTo(e.target.value);
                              setPeriod('custom');
                            }}
                            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </div>
                    )}

                    {/* Range preview */}
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
                      <CalendarRange className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-xs text-foreground flex items-center gap-1.5">
                        <span className="font-mono font-semibold">{from}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono font-semibold">{to}</span>
                      </div>
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {dayCount(from, to)} day{dayCount(from, to) === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </section>
                </div>

                <div className="flex justify-end pt-3 border-t border-border">
                  <Button disabled={!deviceId} onClick={runFetch}>
                    <DownloadCloud className="h-4 w-4 mr-1.5" /> Fetch Punch Logs
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Fetching */}
          {step === 'fetching' && (
            <Card className="border-border bg-card">
              <CardContent className="p-12 text-center space-y-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                <h3 className="text-sm font-semibold text-foreground">
                  Connecting to {selectedDevice?.device_code} and retrieving punches…
                </h3>
                <p className="text-xs text-muted-foreground">
                  Reading the terminal buffer for {from} → {to}. Nothing is saved yet.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview & Validate */}
          {(step === 'preview' || step === 'review') && fetchResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <SummaryTile
                  label="Fetched"
                  value={fetchResult.summary.total}
                  tone="neutral"
                  icon={ListChecks}
                />
                <SummaryTile
                  label="Valid"
                  value={fetchResult.summary.valid}
                  tone="good"
                  icon={CheckCircle2}
                />
                <SummaryTile
                  label="Warnings"
                  value={fetchResult.summary.warnings}
                  tone="warn"
                  icon={AlertTriangle}
                />
                <SummaryTile
                  label="Errors"
                  value={fetchResult.summary.errors}
                  tone="bad"
                  icon={XCircle}
                />
                <SummaryTile
                  label="Already synced"
                  value={fetchResult.summary.alreadySynced}
                  tone="neutral"
                  icon={RefreshCw}
                />
                <SummaryTile
                  label="Will import"
                  value={fetchResult.summary.willImport}
                  tone="good"
                  icon={DownloadCloud}
                />
              </div>

              {!fetchResult.dateRangeSupported && (
                <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {fetchResult.vendor} terminals
                  don&apos;t support a precise historical date-range pull — results are best-effort
                  for the selected window.
                </div>
              )}

              {step === 'preview' && (
                <Card className="border-border bg-card">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border-b border-border">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search employee, vendor id, device record…"
                          className="h-8 flex-1 min-w-0 px-2 rounded-md border border-input bg-background text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {(
                          [
                            ['all', 'All'],
                            ['import', 'Will import'],
                            ['warning', 'Warnings'],
                            ['error', 'Errors'],
                            ['synced', 'Already synced'],
                          ] as [typeof levelFilter, string][]
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setLevelFilter(key)}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                              levelFilter === key
                                ? 'bg-primary/10 text-primary border border-primary/30'
                                : 'text-muted-foreground hover:text-foreground border border-transparent'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-[48vh] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead className="w-8">
                              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                            </TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Employee</TableHead>
                            <TableHead className="text-xs">Vendor ID</TableHead>
                            <TableHead className="text-xs">Punch Time</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Device Record</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCandidates.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                className="h-24 text-center text-xs text-muted-foreground"
                              >
                                No records match this filter.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredCandidates.map((c) => (
                              <TableRow key={c.rowId} className="align-top">
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    disabled={!c.willImport}
                                    checked={selected.has(c.rowId)}
                                    onChange={() => toggleRow(c.rowId)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <LevelBadge candidate={c} />
                                </TableCell>
                                <TableCell className="text-xs">
                                  <div className="font-medium text-foreground">
                                    {c.employeeName || c.externalEmployeeId}
                                  </div>
                                  <div className="font-mono text-[10px] text-muted-foreground">
                                    {c.externalEmployeeId}
                                    {!c.mapped && (
                                      <span className="text-amber-500"> · unmapped</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {c.vendorUserId}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <div className="text-foreground">{c.punchTimeLocal}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {c.punchTimeUtc}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {c.punchType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-muted-foreground">
                                  {c.deviceRecordId || '—'}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'review' && (
                <Card className="border-border bg-card">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-primary" /> Review &amp; Confirm
                    </h3>
                    <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
                      <div>
                        Terminal:{' '}
                        <span className="text-foreground font-medium">
                          {fetchResult.deviceCode} ({fetchResult.vendor})
                        </span>{' '}
                        · Range:{' '}
                        <span className="text-foreground font-medium">
                          {fetchResult.from} → {fetchResult.to}
                        </span>
                      </div>
                      <div>
                        <span className="text-foreground font-semibold">{selectedCount}</span>{' '}
                        record(s) will be imported as{' '}
                        <span className="text-foreground font-medium">Manual</span> attendance rows.
                        Errors, already-synced and unselected rows are skipped.
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Idempotent — re-running never
                        creates duplicates (fingerprint + device-record guards).
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(step === 'review' ? 'preview' : 'configure')}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={resetAll}>
                    Start over
                  </Button>
                  {step === 'preview' ? (
                    <Button
                      size="sm"
                      disabled={selectedCount === 0}
                      onClick={() => setStep('review')}
                    >
                      Review {selectedCount} selected <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  ) : (
                    <Button size="sm" disabled={selectedCount === 0} onClick={runCommit}>
                      <DownloadCloud className="h-3.5 w-3.5 mr-1.5" /> Import {selectedCount}{' '}
                      record(s)
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Step 5: Committing */}
          {step === 'committing' && (
            <Card className="border-border bg-card">
              <CardContent className="p-12 text-center space-y-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                <h3 className="text-sm font-semibold text-foreground">
                  Importing {selectedCount} record(s)…
                </h3>
                <p className="text-xs text-muted-foreground">
                  Writing manual attendance rows idempotently.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Step 6: Results */}
          {step === 'results' && commitResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <SummaryTile
                  label="Total"
                  value={commitResult.summary.total}
                  tone="neutral"
                  icon={ListChecks}
                />
                <SummaryTile
                  label="Imported"
                  value={commitResult.summary.imported}
                  tone="good"
                  icon={CheckCircle2}
                />
                <SummaryTile
                  label="Duplicates"
                  value={commitResult.summary.duplicates}
                  tone="warn"
                  icon={RefreshCw}
                />
                <SummaryTile
                  label="Skipped"
                  value={commitResult.summary.skipped}
                  tone="neutral"
                  icon={AlertTriangle}
                />
                <SummaryTile
                  label="Failed"
                  value={commitResult.summary.failed}
                  tone="bad"
                  icon={XCircle}
                />
              </div>

              <Card className="border-border bg-card">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">
                      Import report · {commitResult.durationMs}ms
                    </h3>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadResults(false)}>
                        <Download className="h-3.5 w-3.5 mr-1.5" /> All
                      </Button>
                      {commitResult.summary.failed + commitResult.summary.skipped > 0 && (
                        <Button variant="outline" size="sm" onClick={() => downloadResults(true)}>
                          <Download className="h-3.5 w-3.5 mr-1.5" /> Failed/skipped
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[48vh] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                          <TableHead className="text-xs">Outcome</TableHead>
                          <TableHead className="text-xs">Employee</TableHead>
                          <TableHead className="text-xs">Device Record</TableHead>
                          <TableHead className="text-xs">Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commitResult.results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <ResultBadge status={r.status} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.externalEmployeeId}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {r.deviceRecordId || '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetAll}>
                  Sync another
                </Button>
                <Button size="sm" onClick={() => router.push('/punches')}>
                  Done — view punches
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {view === 'history' && (
        <HistorySection
          jobs={jobs}
          loading={jobsLoading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onRefresh={fetchJobs}
          expanded={expandedJob}
          setExpanded={setExpandedJob}
        />
      )}
    </div>
  );
}

// ----------------------------- Sub-components -----------------------------

function Stepper({ current }: { current: Step }) {
  // 'fetching'/'committing' collapse onto their neighbours in the 5-dot rail.
  const normalized: Step = current === 'committing' ? 'review' : current;
  const activeIndex = STEPS.findIndex((s) => s.key === normalized);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <React.Fragment key={s.key}>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
                active
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : done
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-3 bg-border shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneCls = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-foreground',
  }[tone];
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-3.5 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold ${toneCls}`}>{value}</div>
        </div>
        <Icon className={`h-5 w-5 ${toneCls} opacity-70`} />
      </CardContent>
    </Card>
  );
}

function LevelBadge({ candidate }: { candidate: SyncCandidate }) {
  const title =
    candidate.issues.map((i) => `${i.level.toUpperCase()}: ${i.message}`).join('\n') || undefined;
  if (candidate.level === 'error')
    return (
      <Badge
        variant="outline"
        title={title}
        className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1"
      >
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  if (candidate.alreadySynced)
    return (
      <Badge
        variant="outline"
        title={title}
        className="text-[10px] bg-muted text-muted-foreground border-border gap-1"
      >
        <RefreshCw className="h-3 w-3" /> Synced
      </Badge>
    );
  if (candidate.level === 'warning')
    return (
      <Badge
        variant="outline"
        title={title}
        className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1"
      >
        <AlertTriangle className="h-3 w-3" /> {candidate.duplicateInBatch ? 'Duplicate' : 'Warning'}
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
    >
      <CheckCircle2 className="h-3 w-3" /> Valid
    </Badge>
  );
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US');
}
function fmtDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    FETCHED: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    RUNNING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    QUEUED: 'bg-muted text-muted-foreground border-border',
    FAILED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${map[status] ?? map.QUEUED}`}>
      {status}
    </Badge>
  );
}

function HistorySection({
  jobs,
  loading,
  statusFilter,
  setStatusFilter,
  onRefresh,
  expanded,
  setExpanded,
}: {
  jobs: SyncJob[];
  loading: boolean;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  onRefresh: () => void;
  expanded: number | null;
  setExpanded: (id: number | null) => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border-b border-border">
          <div className="flex items-center gap-1 flex-wrap">
            {['ALL', 'COMPLETED', 'FETCHED', 'RUNNING', 'FAILED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Terminal</TableHead>
                <TableHead className="text-xs">Range</TableHead>
                <TableHead className="text-xs text-right">Received</TableHead>
                <TableHead className="text-xs text-right">Imported</TableHead>
                <TableHead className="text-xs">By</TableHead>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 opacity-50" /> Loading
                    sync history…
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                    No manual sync runs yet.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((j) => {
                  const open = expanded === j.id;
                  return (
                    <React.Fragment key={j.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpanded(open ? null : j.id)}
                      >
                        <TableCell>
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              open ? 'rotate-90' : ''
                            }`}
                          />
                        </TableCell>
                        <TableCell>
                          <JobStatusBadge status={j.status} />
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono text-foreground">{j.deviceCode}</div>
                          {j.vendor && (
                            <div className="text-[10px] text-muted-foreground">{j.vendor}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {j.dateFrom && j.dateTo ? `${j.dateFrom} → ${j.dateTo}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {j.recordsReceived}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {j.recordsInserted}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {j.requestedBy}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {fmtDateTime(j.requestedAt)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">
                          {fmtDuration(j.durationMs)}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={9}>
                            <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
                              <Detail label="Job ID" value={`#${j.id}`} />
                              <Detail
                                label="Terminal"
                                value={`${j.deviceCode}${j.deviceName ? ` · ${j.deviceName}` : ''}`}
                              />
                              <Detail label="Requested" value={fmtDateTime(j.requestedAt)} />
                              <Detail label="Started" value={fmtDateTime(j.startedAt)} />
                              <Detail label="Completed" value={fmtDateTime(j.completedAt)} />
                              <Detail label="Duration" value={fmtDuration(j.durationMs)} />
                              <Detail label="Records received" value={String(j.recordsReceived)} />
                              <Detail label="Imported" value={String(j.recordsInserted)} />
                              <Detail label="Duplicates" value={String(j.duplicates)} />
                              <Detail label="Errors" value={String(j.errors)} />
                              <Detail label="Initiated by" value={j.requestedBy} />
                              <Detail label="Status" value={j.status} />
                              {j.errorMessage && (
                                <div className="col-span-2 sm:col-span-4">
                                  <div className="text-muted-foreground mb-0.5">Error</div>
                                  <div className="font-mono text-rose-600 dark:text-rose-400 break-all">
                                    {j.errorMessage}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground mb-0.5">{label}</div>
      <div className="text-foreground font-medium break-all">{value}</div>
    </div>
  );
}

function ResultBadge({ status }: { status: CommitRowResult['status'] }) {
  const map = {
    imported: {
      cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Imported',
    },
    duplicate: {
      cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
      icon: RefreshCw,
      label: 'Duplicate',
    },
    skipped: {
      cls: 'bg-muted text-muted-foreground border-border',
      icon: AlertTriangle,
      label: 'Skipped',
    },
    failed: {
      cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
      icon: XCircle,
      label: 'Failed',
    },
  }[status];
  const Icon = map.icon;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${map.cls}`}>
      <Icon className="h-3 w-3" /> {map.label}
    </Badge>
  );
}
