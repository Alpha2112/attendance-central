'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Database,
  Radio,
  Server,
  Lock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/stat-tile';

interface Dep {
  status?: 'up' | 'down';
  latencyMs?: number;
  brokers?: number;
}
interface Health {
  status?: 'ok' | 'degraded' | 'error';
  dependencies?: { database?: Dep; redis?: Dep; kafka?: Dep };
}
interface Infra {
  api?: { host?: string; port?: number; version?: string; env?: string };
  database?: { host?: string; port?: number; name?: string; poolLimit?: number };
  redis?: { host?: string; port?: number; db?: number; keyPrefix?: string };
  kafka?: { brokers?: string[]; clientId?: string; groupId?: string };
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [infra, setInfra] = useState<Infra | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, i] = await Promise.all([
        fetch('/api/health', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/settings/infra', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (h) setHealth(h);
      if (i) setInfra(i);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  const deps = health?.dependencies;
  const online = deps ? ['database', 'redis', 'kafka'].filter((k) => deps[k as keyof typeof deps]?.status === 'up').length : 0;
  const gatewayLabel =
    health?.status === 'error' ? 'Down' : health?.status === 'degraded' ? 'Degraded' : health ? 'Healthy' : '—';
  const gatewayType = health?.status === 'error' ? 'negative' : health?.status === 'degraded' ? 'neutral' : 'positive';

  const services = [
    {
      key: 'database' as const,
      name: 'MySQL 8.4',
      role: 'Authoritative persistent storage',
      icon: Database,
      color: 'text-blue-500',
    },
    {
      key: 'redis' as const,
      name: 'Redis 7.2',
      role: 'Distributed locks & heartbeats',
      icon: Server,
      color: 'text-rose-500',
    },
    {
      key: 'kafka' as const,
      name: 'Kafka Backbone',
      role: 'Durable event streaming',
      icon: Radio,
      color: 'text-amber-500',
    },
  ];

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Configuration &amp; Middleware
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Platform &amp; Infrastructure Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live middleware status, cluster topology, and platform security policies.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="font-medium">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Compact platform summary (real) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          title="Core Middleware"
          value={`${online}/3`}
          delta={online === 3 ? 'all up' : 'degraded'}
          deltaType={online === 3 ? 'positive' : 'negative'}
          hint="mysql · redis · kafka"
          icon={Server}
        />
        <StatTile
          title="API Gateway"
          value={gatewayLabel}
          delta="NestJS"
          deltaType={gatewayType}
          hint="port 4000 · OpenAPI 3.0"
          icon={CheckCircle2}
        />
        <StatTile
          title="Auth Security"
          value="scrypt"
          delta="JWT HS256"
          deltaType="positive"
          hint="RBAC enforced"
          icon={Shield}
        />
      </div>

      {/* Middleware status cards (real status + latency) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {services.map((s) => {
          const dep = deps?.[s.key];
          const up = dep?.status === 'up';
          const Icon = s.icon;
          const rows: { label: string; value: string; accent?: boolean }[] = [];
          if (s.key === 'database' && infra?.database) {
            const d = infra.database;
            rows.push({ label: 'Host & Port', value: `${d.host}:${d.port}` });
            rows.push({ label: 'Database', value: d.name ?? '—' });
            rows.push({ label: 'Pool Limit', value: String(d.poolLimit ?? '—') });
          } else if (s.key === 'redis' && infra?.redis) {
            const r = infra.redis;
            rows.push({ label: 'Host & Port', value: `${r.host}:${r.port}` });
            rows.push({ label: 'DB Index', value: String(r.db ?? 0) });
            rows.push({ label: 'Key Prefix', value: r.keyPrefix ?? '—' });
          } else if (s.key === 'kafka' && infra?.kafka) {
            const k = infra.kafka;
            rows.push({ label: 'Brokers', value: (k.brokers ?? []).join(', ') || '—' });
            rows.push({ label: 'Client ID', value: k.clientId ?? '—' });
            rows.push({ label: 'Topics', value: 'raw · normalized · dlq', accent: true });
          }
          rows.push({
            label: 'Latency',
            value: dep?.latencyMs != null ? `${dep.latencyMs}ms` : '—',
            accent: true,
          });
          return (
            <Card key={s.key} className="border-border bg-card shadow-xs">
              <CardHeader className="p-3.5 pb-2.5 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Icon className={`h-4 w-4 ${s.color}`} />
                    {s.name}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono ${
                      up
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {loading && !health ? '…' : up ? 'HEALTHY' : 'DOWN'}
                  </Badge>
                </div>
                <CardDescription className="text-[11px] text-muted-foreground">{s.role}</CardDescription>
              </CardHeader>
              <CardContent className="p-3.5 pt-2.5 space-y-1.5 text-xs">
                {rows.map((row, idx) => (
                  <div
                    key={row.label}
                    className={`flex justify-between gap-3 ${idx < rows.length - 1 ? 'border-b border-border/40 pb-1.5' : ''}`}
                  >
                    <span className="text-muted-foreground shrink-0">{row.label}</span>
                    <span
                      className={`font-mono font-medium text-right truncate ${
                        row.accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Security policy (accurate) */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-3.5 pb-2.5 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Shield className="h-4 w-4 text-emerald-500" />
            Security &amp; Secret Policies
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground">
            How credentials, passwords, and secrets are handled across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3.5 pt-3 grid gap-2.5 sm:grid-cols-2 text-xs">
          <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-foreground">Password hashing</div>
              <div className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                User passwords are stored as salted <span className="font-mono">scrypt</span> hashes — never in
                plaintext.
              </div>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-start gap-2.5">
            <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-foreground">Secret handling</div>
              <div className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                Device credentials and webhook secrets come from environment config and are redacted from
                audit logs and API responses.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
