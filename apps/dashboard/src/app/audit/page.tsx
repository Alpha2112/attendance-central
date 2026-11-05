'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Download,
  Search,
  RefreshCw,
  X,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/stat-tile';
import { useAuth } from '@/lib/auth';
import { Can } from '@/components/can';

interface AuditLog {
  id: number;
  actorType: string;
  actorId: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  module: string | null;
  description: string | null;
  resourceType: string | null;
  resourceId: string | null;
  beforeState: unknown;
  afterState: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  status: string;
  createdAt: string | null;
}

interface Filters {
  search: string;
  action: string;
  module: string;
  status: string;
  role: string;
  ip: string;
  dateFrom: string;
  dateTo: string;
  sort: 'desc' | 'asc';
  page: number;
  pageSize: number;
}

const EMPTY: Filters = {
  search: '',
  action: '',
  module: '',
  status: '',
  role: '',
  ip: '',
  dateFrom: '',
  dateTo: '',
  sort: 'desc',
  page: 1,
  pageSize: 25,
};

const statusStyle: Record<string, string> = {
  SUCCESS: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  WARNING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  UNAUTHORIZED: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
};

function qs(f: Filters): string {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.action) p.set('action', f.action);
  if (f.module) p.set('module', f.module);
  if (f.status) p.set('status', f.status);
  if (f.role) p.set('role', f.role);
  if (f.ip) p.set('ip', f.ip);
  if (f.dateFrom) p.set('dateFrom', f.dateFrom.replace('T', ' '));
  if (f.dateTo) p.set('dateTo', f.dateTo.replace('T', ' '));
  p.set('sort', f.sort);
  p.set('page', String(f.page));
  p.set('pageSize', String(f.pageSize));
  return p.toString();
}

export default function AuditPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [data, setData] = useState<{ items: AuditLog[]; total: number; page: number; pageSize: number }>(
    { items: [], total: 0, page: 1, pageSize: 25 },
  );
  const [facets, setFacets] = useState<{ actions: string[]; modules: string[]; roles: string[] }>({
    actions: [],
    modules: [],
    roles: [],
  });
  const [summary, setSummary] = useState<{ total: number; failed: number; unauthorized: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?${qs(f)}`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  useEffect(() => {
    fetch('/api/audit-logs/facets', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFacets(d))
      .catch(() => {});
    const counts = async () => {
      const one = async (status?: string) => {
        const p = new URLSearchParams({ pageSize: '1', page: '1' });
        if (status) p.set('status', status);
        try {
          const r = await fetch(`/api/audit-logs?${p.toString()}`, { cache: 'no-store' });
          return r.ok ? (await r.json()).total ?? 0 : 0;
        } catch {
          return 0;
        }
      };
      const [total, failed, unauthorized] = await Promise.all([
        one(),
        one('FAILED'),
        one('UNAUTHORIZED'),
      ]);
      setSummary({ total, failed, unauthorized });
    };
    void counts();
  }, []);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const clear = () => setFilters(EMPTY);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/audit-logs?${qs({ ...filters, page: 1, pageSize: 1000 })}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      const rows: AuditLog[] = json.items || [];
      const header = [
        'id',
        'time',
        'actor',
        'role',
        'action',
        'module',
        'status',
        'resource',
        'ip',
        'description',
      ];
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.id,
            r.createdAt,
            r.actorName || r.actorId,
            r.actorRole,
            r.action,
            r.module,
            r.status,
            `${r.resourceType || ''} ${r.resourceId || ''}`.trim(),
            r.ipAddress,
            r.description,
          ]
            .map(esc)
            .join(','),
        ),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  };

  const selectCls = 'h-9 rounded-lg border border-border bg-background px-2 text-xs';

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Compliance &amp; Security
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            System Activity &amp; Audit Logs
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centralized, append-only trail of authentication, access, and administrative actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(filters)} disabled={loading} className="font-medium">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Can perm="audit.export">
            <Button size="sm" onClick={exportCsv} disabled={exporting} className="font-semibold">
              <Download className={`h-3.5 w-3.5 mr-1.5 ${exporting ? 'animate-pulse' : ''}`} />
              Export CSV
            </Button>
          </Can>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile title="Total Events" value={summary ? summary.total.toLocaleString() : '—'} delta="append-only" deltaType="positive" hint="recorded" icon={Activity} />
        <StatTile title="Failed Events" value={summary ? String(summary.failed) : '—'} delta={summary && summary.failed > 0 ? 'review' : 'clean'} deltaType={summary && summary.failed > 0 ? 'negative' : 'positive'} hint="errors / rejections" icon={ShieldAlert} />
        <StatTile title="Unauthorized" value={summary ? String(summary.unauthorized) : '—'} delta={summary && summary.unauthorized > 0 ? 'attention' : 'none'} deltaType={summary && summary.unauthorized > 0 ? 'negative' : 'positive'} hint="denied attempts" icon={ShieldX} />
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Search by user name or ID…"
              className="w-full h-9 rounded-lg border border-border bg-background pl-8 pr-2 text-xs"
            />
          </div>
          <select className={selectCls} value={filters.action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">All actions</option>
            {facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className={selectCls} value={filters.module} onChange={(e) => set({ module: e.target.value })}>
            <option value="">All modules</option>
            {facets.modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={selectCls} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All statuses</option>
            {['SUCCESS', 'FAILED', 'WARNING', 'UNAUTHORIZED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={filters.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="">All roles</option>
            {facets.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filters.ip}
            onChange={(e) => set({ ip: e.target.value })}
            placeholder="IP address"
            className="h-9 w-32 rounded-lg border border-border bg-background px-2 text-xs"
          />
          <label className="text-[11px] text-muted-foreground">From</label>
          <input type="datetime-local" className={selectCls} value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
          <label className="text-[11px] text-muted-foreground">To</label>
          <input type="datetime-local" className={selectCls} value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
          <select className={selectCls} value={filters.sort} onChange={(e) => set({ sort: e.target.value as 'asc' | 'desc' })}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
          <select className={selectCls} value={filters.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button onClick={clear} className="inline-flex items-center gap-1 rounded-lg px-2 h-9 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/80 bg-muted/20 text-muted-foreground">
                <th className="text-left font-semibold px-3 py-2.5">Time</th>
                <th className="text-left font-semibold px-3 py-2.5">Actor</th>
                <th className="text-left font-semibold px-3 py-2.5">Action</th>
                <th className="text-left font-semibold px-3 py-2.5">Module</th>
                <th className="text-left font-semibold px-3 py-2.5">Description</th>
                <th className="text-left font-semibold px-3 py-2.5">Status</th>
                <th className="text-right font-semibold px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">No audit events match these filters.</td></tr>
              ) : (
                data.items.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-foreground">{r.actorName || r.actorId}</div>
                      <div className="text-[10px] text-muted-foreground">{r.actorRole || r.actorType}</div>
                    </td>
                    <td className="px-3 py-2.5"><span className="font-mono text-[11px] font-semibold text-foreground">{r.action}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.module || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[340px] truncate">{r.description || '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={`text-[10px] font-semibold ${statusStyle[r.status] || 'bg-muted text-muted-foreground border-border'}`}>
                        {r.status === 'SUCCESS' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button className="text-[11px] text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>Details</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {data.total === 0 ? '0' : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)}`} of {data.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button disabled={filters.page <= 1} onClick={() => set({ page: filters.page - 1 })} className="inline-flex items-center gap-0.5 rounded-md px-2 h-7 disabled:opacity-40 hover:bg-muted">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2">Page {data.page} / {totalPages}</span>
            <button disabled={filters.page >= totalPages} onClick={() => set({ page: filters.page + 1 })} className="inline-flex items-center gap-0.5 rounded-md px-2 h-7 disabled:opacity-40 hover:bg-muted">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="font-mono">{selected.action}</span>
                <Badge variant="outline" className={`text-[10px] font-semibold ${statusStyle[selected.status] || ''}`}>{selected.status}</Badge>
              </h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[
                ['Log ID', String(selected.id)],
                ['Time', selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'],
                ['Actor', `${selected.actorName || ''} (${selected.actorId})`],
                ['Role', selected.actorRole || '—'],
                ['Module', selected.module || '—'],
                ['Resource', `${selected.resourceType || '-'} ${selected.resourceId || ''}`.trim()],
                ['IP address', selected.ipAddress || '—'],
                ['Correlation ID', selected.correlationId || '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  <div className="text-foreground break-words">{v}</div>
                </div>
              ))}
            </div>
            {selected.description && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Description</div>
                <div className="text-xs text-foreground">{selected.description}</div>
              </div>
            )}
            {selected.userAgent && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">User agent</div>
                <div className="text-[11px] text-muted-foreground break-words">{selected.userAgent}</div>
              </div>
            )}
            {(selected.beforeState != null || selected.afterState != null) && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selected.beforeState != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Before</div>
                    <pre className="text-[10px] bg-muted/40 rounded-lg p-2 overflow-x-auto max-h-48">{JSON.stringify(selected.beforeState, null, 2)}</pre>
                  </div>
                )}
                {selected.afterState != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">After / payload</div>
                    <pre className="text-[10px] bg-muted/40 rounded-lg p-2 overflow-x-auto max-h-48">{JSON.stringify(selected.afterState, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
