'use client';

import React, { useEffect, useState } from 'react';
import {
  Database,
  Server,
  RefreshCw,
  Layers,
  AlertTriangle,
  XCircle,
  Activity,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
  brokers?: number;
  clusterId?: string;
}

interface ReadinessData {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  dependencies?: {
    database?: DependencyStatus;
    redis?: DependencyStatus;
    kafka?: DependencyStatus;
  };
}

export function SystemHealthCard() {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.status) {
        setData(json);
      } else {
        setError(json.error || 'Failed to contact backend API gateway on port 4000');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to contact API gateway on port 4000');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 8000);
    return () => clearInterval(interval);
  }, []);

  const renderBadge = (status?: 'up' | 'down') => {
    if (status === 'up') {
      return (
        <Badge variant="success" className="gap-1 px-2 py-0.5 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>ONLINE</span>
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1 px-2 py-0.5 text-[11px]">
        <XCircle className="w-3 h-3" />
        <span>OFFLINE</span>
      </Badge>
    );
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/80 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Infrastructure Telemetry & Cluster State
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Authoritative MySQL 8.4 • Redis 7.2 Cache • Apache Kafka KRaft Backbone
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data?.status && (
            <Badge
              variant={data.status === 'ok' ? 'success' : 'destructive'}
              className="uppercase tracking-wider text-[11px] px-2.5 py-1"
            >
              Cluster: {data.status}
            </Badge>
          )}

          <Button
            onClick={fetchHealth}
            disabled={loading}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {error ? (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* MySQL 8.4 */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-4 transition-all hover:bg-muted/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-xs text-foreground">MySQL 8.4</span>
                </div>
                {renderBadge(data?.dependencies?.database?.status)}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Latency</span>
                <span className="font-mono text-foreground font-medium">
                  {data?.dependencies?.database?.latencyMs !== undefined
                    ? `${data.dependencies.database.latencyMs} ms`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Role</span>
                <span className="text-foreground">Authoritative Store</span>
              </div>
            </div>

            {/* Redis 7.2 */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-4 transition-all hover:bg-muted/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-rose-400" />
                  <span className="font-semibold text-xs text-foreground">Redis 7.2</span>
                </div>
                {renderBadge(data?.dependencies?.redis?.status)}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Latency</span>
                <span className="font-mono text-foreground font-medium">
                  {data?.dependencies?.redis?.latencyMs !== undefined
                    ? `${data.dependencies.redis.latencyMs} ms`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Role</span>
                <span className="text-foreground">Distributed Locks & Cache</span>
              </div>
            </div>

            {/* Apache Kafka */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-4 transition-all hover:bg-muted/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-xs text-foreground">Apache Kafka 3.8</span>
                </div>
                {renderBadge(data?.dependencies?.kafka?.status)}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Latency</span>
                <span className="font-mono text-foreground font-medium">
                  {data?.dependencies?.kafka?.latencyMs !== undefined
                    ? `${data.dependencies.kafka.latencyMs} ms`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Brokers</span>
                <span className="text-foreground">
                  {data?.dependencies?.kafka?.brokers ?? 1} Broker (KRaft)
                </span>
              </div>
            </div>
          </div>
        )}

        {data && (
          <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span>Uptime:</span>
              <strong className="text-foreground font-mono">
                {Math.floor(data.uptimeSeconds / 3600)}h{' '}
                {Math.floor((data.uptimeSeconds % 3600) / 60)}m {data.uptimeSeconds % 60}s
              </strong>
            </span>

            <span>
              Telemetry Heartbeat:{' '}
              <strong className="text-foreground font-mono">
                {new Date(data.timestamp).toLocaleTimeString()}
              </strong>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
