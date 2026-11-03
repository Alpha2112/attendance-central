'use client';

import React from 'react';
import { ShieldAlert, CheckCircle2, Layers, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AlertItem {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  source: string;
  title: string;
  detail: string;
  status: 'ACTIVE' | 'RESOLVED';
  timestamp: string;
}

const mockAlerts: AlertItem[] = [
  {
    id: 'alt-1',
    severity: 'INFO',
    source: 'COLLECTOR',
    title: 'Physical Terminal Live Verification Ingestion',
    detail: 'Terminal DS-K1T321MFWX authenticated and ingested 30 raw biometric punch logs.',
    status: 'RESOLVED',
    timestamp: '25 mins ago',
  },
  {
    id: 'alt-2',
    severity: 'INFO',
    source: 'NORMALIZER',
    title: 'Transactional Outbox Batch Dispatched',
    detail: 'Sample punch normalized, committed to MySQL outbox, and published to Kafka.',
    status: 'RESOLVED',
    timestamp: '3 mins ago',
  },
];

export default function AlertsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground"
            >
              Reliability & Quarantine
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Alerts & Dead-Letter Queue (DLQ)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            System anomalies, failed device heartbeats, poison-pill isolation, and dead-letter queue
            replay.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Active System Alerts"
          value="0 Active"
          delta="Nominal"
          deltaType="positive"
          deltaLabel="All Systems Healthy"
          subtext="2 Auto-resolved events"
          icon={CheckCircle2}
        />

        <MetricCard
          title="Kafka DLQ Backlog"
          value="0 Messages"
          delta="Clean"
          deltaType="positive"
          deltaLabel="attendance.dlq.v1"
          subtext="Zero poison pill events"
          icon={Layers}
        />

        <MetricCard
          title="Circuit Breakers"
          value="All Closed"
          delta="Operational"
          deltaType="positive"
          deltaLabel="Hikvision / ZKTeco / Suprema"
          subtext="Adaptive backoff standing by"
          icon={ShieldCheck}
        />
      </div>

      {/* Alert Feed Table */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Operational Event Feed
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Recent security, network, and data consistency events.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {mockAlerts.length} Events Logged
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/20 text-xs">
                <TableHead className="font-semibold">Severity</TableHead>
                <TableHead className="font-semibold">Source</TableHead>
                <TableHead className="font-semibold">Event</TableHead>
                <TableHead className="font-semibold">Detail</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAlerts.map((alt) => (
                <TableRow
                  key={alt.id}
                  className="border-border/40 hover:bg-muted/30 transition-colors text-sm"
                >
                  <TableCell className="py-3">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {alt.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-primary font-semibold">
                    {alt.source}
                  </TableCell>
                  <TableCell className="py-3 font-semibold text-foreground">{alt.title}</TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground max-w-[320px]">
                    {alt.detail}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold"
                    >
                      {alt.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs text-muted-foreground">
                    {alt.timestamp}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
