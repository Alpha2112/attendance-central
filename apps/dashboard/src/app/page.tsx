'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SystemHealthCard } from '../components/system-health-card';
import { MetricCard } from '../components/ui/metric-card';
import {
  Cpu,
  Fingerprint,
  Link2,
  Zap,
  ArrowUpRight,
  GitBranch,
  Terminal,
  Server,
  Sparkles,
  Clock,
  Radio,
  CheckCircle2,
  Layers,
  Shield,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Enterprise Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Production Control Plane
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Attendance Integration & Dispatch
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Real-time biometric ingestion backbone bridging heterogeneous physical terminals (Hikvision, ZKTeco, Suprema) to canonical attendance streams with transactional outbox safety.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/mappings">
            <Button variant="default" size="sm" className="font-semibold shadow-xs">
              <Plus className="h-4 w-4 mr-1.5" />
              Map Employee
            </Button>
          </Link>

          <Link href="/live">
            <Button variant="outline" size="sm" className="font-medium">
              <Radio className="h-3.5 w-3.5 mr-1.5 text-emerald-500 animate-pulse" />
              Live Stream
            </Button>
          </Link>

          <a href="http://localhost:4000/docs" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="font-medium text-xs">
              <ArrowUpRight className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              Swagger API
            </Button>
          </a>
        </div>
      </div>

      {/* High-Level Operational Metric Cards (Matching Enterprise Standards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Device Fleet */}
        <MetricCard
          title="Active Device Fleet"
          value="3"
          delta="+50%"
          deltaType="positive"
          deltaLabel="3 Online Terminals"
          subtext="Hikvision (ISAPI), ZKTeco, Suprema"
          icon={Cpu}
        />

        {/* Metric 2: Mapped Identities */}
        <MetricCard
          title="Identity Mappings"
          value="100%"
          delta="+100%"
          deltaType="positive"
          deltaLabel="Active & Resolved"
          subtext="amare (EMP-1001) mapped on Hikvision"
          icon={Link2}
        />

        {/* Metric 3: Live Ingestion Latency */}
        <MetricCard
          title="Ingestion Latency"
          value="38ms"
          delta="Sub-second"
          deltaType="positive"
          deltaLabel="ISAPI & Kafka Push"
          subtext="Direct terminal stream processing"
          icon={Fingerprint}
        />

        {/* Metric 4: Idempotency Deduplication */}
        <MetricCard
          title="Deduplication Guard"
          value="100%"
          delta="SHA-256"
          deltaType="positive"
          deltaLabel="0 Duplicate Leaks"
          subtext="Authoritative partitioned MySQL safety"
          icon={Zap}
        />
      </div>

      {/* Infrastructure Telemetry State */}
      <SystemHealthCard />

      {/* Data & Telemetry Section with Segmented Controls */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border/80 gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Hardware Fleet & Stream Telemetry
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Operational overview of registered edge devices, protocol adapters, and Kafka event topics.
            </CardDescription>
          </div>

          {/* Segmented Control / Time Range Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs">
            <button
              onClick={() => setTimeRange('24h')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${
                timeRange === '24h'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Last 24 hours
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${
                timeRange === '7d'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Last 7 days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${
                timeRange === '30d'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Last 30 days
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs defaultValue="fleet" className="w-full">
            <TabsList className="bg-muted/50 border border-border/80 mb-4">
              <TabsTrigger value="fleet" className="text-xs gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                <span>Connected Fleet</span>
              </TabsTrigger>
              <TabsTrigger value="topics" className="text-xs gap-1.5">
                <Server className="w-3.5 h-3.5" />
                <span>Kafka Topics</span>
              </TabsTrigger>
              <TabsTrigger value="architecture" className="text-xs gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Outbox Architecture</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Connected Fleet Table */}
            <TabsContent value="fleet" className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-4">Terminal Code</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Vendor & Model</th>
                      <th className="py-2.5 px-4">IP Endpoint</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">DEV-HQ-HIK01</td>
                      <td className="py-3 px-4 font-medium text-foreground">HQ Turnstile 02 (Exit Face Term)</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-semibold">
                          HIKVISION • DS-K1T321MFWX
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">192.168.100.186:80</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                          ONLINE
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">ISAPI Active</td>
                    </tr>

                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">DEV-HQ-ZK01</td>
                      <td className="py-3 px-4 font-medium text-foreground">HQ Main Entrance Turnstile</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold">
                          ZKTECO • Standalone ADMS
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">192.168.1.201:4370</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                          ONLINE
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">Active</td>
                    </tr>

                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">DEV-SUP-01</td>
                      <td className="py-3 px-4 font-medium text-foreground">Executive Wing Biostation 3</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold">
                          SUPREMA • BioStar 2 REST
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">192.168.1.210:443</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                          ONLINE
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">Active</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Tab 2: Kafka Topics */}
            <TabsContent value="topics" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="text-xs font-semibold text-foreground">attendance.raw.v1</div>
                  <div className="text-[11px] text-muted-foreground">Raw vendor payload buffer with full envelope metadata.</div>
                  <Badge variant="outline" className="text-[10px] mt-2 font-mono">Partitions: 3</Badge>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="text-xs font-semibold text-foreground">attendance.normalized.v1</div>
                  <div className="text-[11px] text-muted-foreground">Canonical employee attendance event stream.</div>
                  <Badge variant="outline" className="text-[10px] mt-2 font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Active Stream</Badge>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="text-xs font-semibold text-foreground">attendance.dlq.v1</div>
                  <div className="text-[11px] text-muted-foreground">Dead-letter queue for corrupted or unmapped events.</div>
                  <Badge variant="outline" className="text-[10px] mt-2 font-mono">0 Failed</Badge>
                </div>
              </div>
            </TabsContent>

            {/* Tab 3: Outbox Architecture */}
            <TabsContent value="architecture" className="space-y-3">
              <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <div className="font-semibold text-foreground">Transactional Outbox Pattern Guarantee</div>
                <p>
                  All normalized punch records are written authoritatively to monthly partitioned MySQL tables (<code className="text-foreground font-mono">attendance_logs</code>) before being published to Kafka (<code className="text-foreground font-mono">attendance.normalized.v1</code>). Outbound HRMS webhooks and third-party ERP connectors process asynchronously without blocking hardware collectors.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
