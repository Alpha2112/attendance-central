'use client';

import React from 'react';
import { Settings as SettingsIcon, Shield, Database, Radio, Server, Lock, CheckCircle2, Key, Cpu, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/ui/metric-card';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Configuration & Middleware
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Platform & Cluster Infrastructure Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Core middleware credentials, Kafka cluster state, Redlock parameters, and security encryption policies.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Cluster Topology"
          value="KRaft HA"
          delta="Active"
          deltaType="positive"
          deltaLabel="3 Core Middleware"
          subtext="MySQL 8.4 • Redis 7.2 • Kafka"
          icon={Server}
        />

        <MetricCard
          title="Secret Encryption"
          value="AES-256 GCM"
          delta="Enforced"
          deltaType="positive"
          deltaLabel="Zero Plaintext Storage"
          subtext="Dynamic env references & vault"
          icon={Shield}
        />

        <MetricCard
          title="API Gateway SLA"
          value="99.99%"
          delta="Healthy"
          deltaType="positive"
          deltaLabel="NestJS Core Engine"
          subtext="Port 4000 (OpenAPI 3.0)"
          icon={CheckCircle2}
        />
      </div>

      {/* Cluster Infrastructure Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MySQL */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-4 pb-2 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Database className="h-4 w-4 text-blue-500" />
                MySQL 8.4 Database
              </CardTitle>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                HEALTHY
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">Persistent authoritative storage</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Host & Port</span>
              <span className="font-mono text-foreground font-medium">127.0.0.1:3306</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Database Name</span>
              <span className="font-mono text-foreground font-medium">attendance_platform</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Active Pool</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">10 Connections (KeepAlive)</span>
            </div>
          </CardContent>
        </Card>

        {/* Redis */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-4 pb-2 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Server className="h-4 w-4 text-rose-500" />
                Redis Cache & Locks
              </CardTitle>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                HEALTHY
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">Distributed locks & device heartbeats</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Host & Port</span>
              <span className="font-mono text-foreground font-medium">127.0.0.1:6379</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Lock Manager</span>
              <span className="font-mono text-foreground font-medium">Redlock Distributed</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Cluster Ping</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">1.8ms latency</span>
            </div>
          </CardContent>
        </Card>

        {/* Kafka */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-4 pb-2 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Radio className="h-4 w-4 text-amber-500" />
                Kafka Event Backbone
              </CardTitle>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                HEALTHY
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">Durable streaming event backbone</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Broker Address</span>
              <span className="font-mono text-foreground font-medium">127.0.0.1:9092</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">Core Topics</span>
              <span className="font-mono text-primary font-medium">raw, normalized, dlq</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Producer Acks</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">acks: all (-1)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security & Secret Management */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-2 border-b border-border/60">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Shield className="h-4 w-4 text-emerald-500" />
            Security & Cryptographic Secret Policies
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Enterprise secret references, API key hashing, and RBAC authentication policies.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-3 space-y-3 text-xs">
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 flex items-start gap-3">
            <Lock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-foreground">Zero Plaintext Storage Guarantee</div>
              <div className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                All device credentials, communication keys, and webhook shared secrets are resolved via dynamic environment references (e.g.{' '}
                <code className="font-mono text-primary bg-muted px-1 py-0.5 rounded">env:HIK_PASS</code>) and redacted from all operational logs, JSON audit records, and API responses.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
