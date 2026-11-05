'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Layers, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/stat-tile';
import { useAuth } from '@/lib/auth';

interface AlertRow {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  source: string;
  title: string;
  detail: string;
}

interface Health {
  status?: 'ok' | 'degraded' | 'error';
  dependencies?: Record<string, { status?: 'up' | 'down' } | undefined>;
}
interface IntStats {
  backlog: number;
  deliveries24h: number;
  successRate: number;
}
interface DeviceItem {
  device_code?: string;
  deviceCode?: string;
  vendor?: string;
  status?: string;
}

export default function AlertsPage() {
  const { can } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<IntStats | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const jobs: Promise<void>[] = [
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setHealth(d))
        .catch(() => {}),
    ];
    if (can('integrations.view')) {
      jobs.push(
        fetch('/api/integrations/stats', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setStats(d))
          .catch(() => {}),
      );
    }
    if (can('devices.view')) {
      jobs.push(
        fetch('/api/devices', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => setDevices(Array.isArray(d) ? d : []))
          .catch(() => {}),
      );
    }
    await Promise.allSettled(jobs);
    setLoading(false);
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived real values.
  const downDeps = health?.dependencies
    ? Object.entries(health.dependencies)
        .filter(([, v]) => v && v.status !== 'up')
        .map(([k]) => k)
    : [];
  const offline = devices.filter((d) => (d.status || '').toUpperCase() !== 'ONLINE');
  const backlog = stats?.backlog ?? 0;
  const failures =
    stats != null ? Math.max(0, Math.round(stats.deliveries24h * (1 - stats.successRate / 100))) : 0;

  // Build the live alert feed from real conditions.
  const alerts: AlertRow[] = [];
  for (const dep of downDeps) {
    alerts.push({
      severity: 'CRITICAL',
      source: 'INFRA',
      title: `${dep} dependency unreachable`,
      detail: `The ${dep} health check is failing.`,
    });
  }
  for (const d of offline) {
    alerts.push({
      severity: 'WARNING',
      source: 'DEVICE',
      title: 'Terminal offline',
      detail: `${d.device_code || d.deviceCode} (${(d.vendor || '').toUpperCase()}) is not reachable.`,
    });
  }
  if (backlog > 0) {
    alerts.push({
      severity: 'WARNING',
      source: 'OUTBOX',
      title: 'Webhook backlog',
      detail: `${backlog} event(s) pending delivery in the transactional outbox.`,
    });
  }
  if (failures > 0) {
    alerts.push({
      severity: 'WARNING',
      source: 'WEBHOOK',
      title: 'Delivery failures',
      detail: `${failures} failed webhook delivery attempt(s) in the last 24h.`,
    });
  }

  const statusLabel =
    health?.status === 'error' ? 'Down' : health?.status === 'degraded' ? 'Degraded' : 'Healthy';
  const statusDeltaType =
    health?.status === 'error' ? 'negative' : health?.status === 'degraded' ? 'neutral' : 'positive';

  const severityCls: Record<string, string> = {
    CRITICAL: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    WARNING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    INFO: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Reliability & Quarantine
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Alerts &amp; Dead-Letter Queue
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live reliability signals — infrastructure health, offline terminals, and webhook backlog.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="font-medium">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Compact real metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile
          title="System Status"
          value={statusLabel}
          delta={downDeps.length ? `${downDeps.length} down` : 'nominal'}
          deltaType={statusDeltaType}
          hint="mysql · redis · kafka"
          icon={ShieldCheck}
        />
        {can('integrations.view') && (
          <StatTile
            title="Outbox Backlog"
            value={`${backlog}`}
            delta={backlog === 0 ? 'clean' : 'pending'}
            deltaType={backlog === 0 ? 'positive' : 'neutral'}
            hint="events awaiting delivery"
            icon={Layers}
          />
        )}
        {can('integrations.view') && (
          <StatTile
            title="Delivery Failures"
            value={`${failures}`}
            delta={failures === 0 ? 'none' : 'attention'}
            deltaType={failures === 0 ? 'positive' : 'negative'}
            hint="webhooks, last 24h"
            icon={ShieldAlert}
          />
        )}
      </div>

      {/* Live alert feed (derived from real conditions) */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-2.5 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Active Alerts</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Current reliability issues across infrastructure, devices, and delivery.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {alerts.length} active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <div className="text-sm font-semibold text-foreground">All systems healthy</div>
              <div className="text-xs text-muted-foreground">
                {loading ? 'Checking…' : 'No active alerts. Infrastructure, terminals, and webhook delivery are nominal.'}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <Badge variant="outline" className={`mt-0.5 text-[10px] font-semibold ${severityCls[a.severity]}`}>
                    {a.severity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{a.title}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{a.source}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{a.detail}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold"
                  >
                    ACTIVE
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
