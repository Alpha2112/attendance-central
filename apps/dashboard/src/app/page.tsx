'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SystemHealthCard } from '../components/system-health-card';
import {
  Cpu,
  Fingerprint,
  Link2,
  Send,
  Users as UsersIcon,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useAuth } from '@/lib/auth';
import { StatTile } from '@/components/stat-tile';

interface DeviceItem {
  id?: number;
  device_code?: string;
  deviceCode?: string;
  name?: string;
  vendor?: string;
  host?: string;
  port?: number;
  status?: string;
  last_seen_at?: string | null;
}
interface PunchItem {
  id: number;
  employeeId: string;
  employeeName?: string;
  deviceCode: string;
  vendor: string;
  punchType: string;
  verificationType: string;
  punchTime: string;
  punchTimeUtc: string;
}
interface IntStats {
  backlog: number;
  deliveries24h: number;
  successRate: number;
  avgLatencyMs: number;
  activeEndpoints: number;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]!;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const vendorColor: Record<string, string> = {
  HIKVISION: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  ZKTECO: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  SUPREMA: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  ANVIZ: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
};

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [recent, setRecent] = useState<PunchItem[]>([]);
  const [punchTotal, setPunchTotal] = useState<number | null>(null);
  const [punchToday, setPunchToday] = useState<number | null>(null);
  const [mappingCount, setMappingCount] = useState<number | null>(null);
  const [intStats, setIntStats] = useState<IntStats | null>(null);
  const [userStats, setUserStats] = useState<{ total: number; active: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const jobs: Promise<void>[] = [];

    if (can('devices.view')) {
      jobs.push(
        fetch('/api/devices', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => setDevices(Array.isArray(d) ? d : []))
          .catch(() => setDevices([])),
      );
    }
    if (can('punches.view')) {
      jobs.push(
        fetch('/api/punches?limit=8', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
          .then((d) => {
            setRecent(Array.isArray(d.items) ? d.items : []);
            setPunchTotal(typeof d.total === 'number' ? d.total : null);
          })
          .catch(() => {}),
      );
      jobs.push(
        fetch(`/api/punches?date=${todayISO()}&limit=1`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { total: 0 }))
          .then((d) => setPunchToday(typeof d.total === 'number' ? d.total : null))
          .catch(() => {}),
      );
    }
    if (can('mappings.view')) {
      jobs.push(
        fetch('/api/mappings', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => setMappingCount(Array.isArray(d) ? d.length : null))
          .catch(() => {}),
      );
    }
    if (can('integrations.view')) {
      jobs.push(
        fetch('/api/integrations/stats', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setIntStats(d && typeof d === 'object' ? d : null))
          .catch(() => {}),
      );
    }
    if (can('users.view')) {
      jobs.push(
        fetch('/api/users', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => {
            if (Array.isArray(d))
              setUserStats({
                total: d.length,
                active: d.filter((u: { status?: string }) => u.status === 'ACTIVE').length,
              });
          })
          .catch(() => {}),
      );
    }

    await Promise.allSettled(jobs);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  const onlineDevices = devices?.filter((d) => (d.status || '').toUpperCase() === 'ONLINE').length ?? 0;
  const deviceVendors = devices
    ? [...new Set(devices.map((d) => (d.vendor || '').toUpperCase()).filter(Boolean))]
    : [];

  const showKpis =
    can('devices.view') ||
    can('punches.view') ||
    can('mappings.view') ||
    can('integrations.view') ||
    can('users.view');

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground"
            >
              Production Control Plane
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Welcome back{user ? `, ${user.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Real-time overview of devices, attendance, webhook delivery, and infrastructure health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Updated {relTime(updatedAt.toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI cards — compact, all in one row on desktop; only those permitted */}
      {showKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {can('devices.view') && (
            <StatTile
              title="Device Fleet"
              value={devices ? String(devices.length) : '—'}
              delta={devices ? `${onlineDevices} online` : undefined}
              deltaType={devices && onlineDevices === devices.length ? 'positive' : 'neutral'}
              hint={deviceVendors.length ? deviceVendors.join(', ') : 'terminals'}
              icon={Cpu}
            />
          )}
          {can('punches.view') && (
            <StatTile
              title="Attendance Punches"
              value={punchTotal != null ? punchTotal.toLocaleString() : '—'}
              delta={punchToday != null ? `+${punchToday} today` : undefined}
              deltaType="positive"
              hint="all-time"
              icon={Fingerprint}
            />
          )}
          {can('mappings.view') && (
            <StatTile
              title="Identity Mappings"
              value={mappingCount != null ? String(mappingCount) : '—'}
              delta="active"
              deltaType="positive"
              hint="employee ↔ device"
              icon={Link2}
            />
          )}
          {can('integrations.view') && (
            <StatTile
              title="Webhook Delivery"
              value={intStats ? `${intStats.successRate}%` : '—'}
              delta={intStats ? `${intStats.deliveries24h} / 24h` : undefined}
              deltaType={intStats && intStats.backlog > 0 ? 'neutral' : 'positive'}
              hint={intStats ? `${intStats.activeEndpoints} endpoint(s), ${intStats.backlog} pending` : 'outbox'}
              icon={Send}
            />
          )}
          {can('users.view') && (
            <StatTile
              title="Platform Users"
              value={userStats ? String(userStats.total) : '—'}
              delta={userStats ? `${userStats.active} active` : undefined}
              deltaType="positive"
              hint="role-based"
              icon={UsersIcon}
            />
          )}
        </div>
      )}

      {/* Infrastructure health — real, public endpoint */}
      <SystemHealthCard />

      {/* Fleet + Recent attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {can('devices.view') && (
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2.5 border-b border-border/80">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">Device Fleet</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Registered biometric terminals and live status.
                </CardDescription>
              </div>
              <Link href="/devices" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {!devices ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Loading…</div>
              ) : devices.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No devices registered yet.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {devices.slice(0, 6).map((d, i) => {
                    const code = d.device_code || d.deviceCode || 'DEV-UNKNOWN';
                    const vendor = (d.vendor || '').toUpperCase();
                    const online = (d.status || '').toUpperCase() === 'ONLINE';
                    return (
                      <div key={d.id ?? i} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-foreground truncate">
                              {code}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-semibold ${vendorColor[vendor] || 'bg-muted text-muted-foreground border-border'}`}
                            >
                              {vendor || 'DEVICE'}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {d.name || 'Unnamed'} · {d.host || '—'}
                            {d.port ? `:${d.port}` : ''}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${
                            online ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                          {online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {can('punches.view') && (
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2.5 border-b border-border/80">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  Recent Attendance
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Latest normalized punch events.
                </CardDescription>
              </div>
              <Link href="/punches" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {loading ? 'Loading…' : 'No punches captured yet.'}
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {recent.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {p.employeeName || p.employeeId}
                          <span className="ml-2 font-normal text-muted-foreground">{p.employeeId}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {p.deviceCode} · {p.verificationType?.toLowerCase?.() || p.verificationType}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${
                            p.punchType === 'OUT'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {p.punchType}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          {relTime(p.punchTimeUtc || p.punchTime)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {!showKpis && !can('devices.view') && !can('punches.view') && (
        <Card className="border-border bg-card">
          <CardContent className="p-10 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Your role has limited dashboard visibility. Contact an administrator for more access.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
