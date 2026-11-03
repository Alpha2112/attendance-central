'use client';

import React, { useState } from 'react';
import { RefreshCw, Play, CheckCircle2, Clock, Sparkles, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SyncJobItem {
  id: string;
  deviceCode: string;
  jobType: 'INCREMENTAL' | 'RECONCILIATION' | 'FULL_SYNC';
  status: 'COMPLETED' | 'RUNNING' | 'QUEUED' | 'FAILED';
  recordsReceived: number;
  recordsInserted: number;
  duplicates: number;
  durationMs: number;
  requestedBy: string;
  completedAt: string;
}

const mockSyncJobs: SyncJobItem[] = [
  {
    id: 'job-991',
    deviceCode: 'DEV-HQ-HIK01',
    jobType: 'INCREMENTAL',
    status: 'COMPLETED',
    recordsReceived: 30,
    recordsInserted: 30,
    duplicates: 0,
    durationMs: 340,
    requestedBy: 'SYSTEM_SCHEDULER',
    completedAt: '2 mins ago',
  },
  {
    id: 'job-990',
    deviceCode: 'DEV-HQ-SUP01',
    jobType: 'INCREMENTAL',
    status: 'COMPLETED',
    recordsReceived: 5,
    recordsInserted: 5,
    duplicates: 0,
    durationMs: 120,
    requestedBy: 'SYSTEM_SCHEDULER',
    completedAt: '5 mins ago',
  },
  {
    id: 'job-989',
    deviceCode: 'DEV-HQ-ZK01',
    jobType: 'INCREMENTAL',
    status: 'COMPLETED',
    recordsReceived: 12,
    recordsInserted: 12,
    duplicates: 0,
    durationMs: 280,
    requestedBy: 'SYSTEM_SCHEDULER',
    completedAt: '8 mins ago',
  },
  {
    id: 'job-988',
    deviceCode: 'DEV-HQ-HIK01',
    jobType: 'RECONCILIATION',
    status: 'COMPLETED',
    recordsReceived: 50,
    recordsInserted: 0,
    duplicates: 50,
    durationMs: 510,
    requestedBy: 'ADMIN',
    completedAt: '25 mins ago',
  },
];

export default function SyncPage() {
  const [triggering, setTriggering] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRunSync = () => {
    setTriggering(true);
    setTimeout(() => {
      setTriggering(false);
      setSuccessMsg('Fleet sync triggered: 3 devices polled, 47 total records synced');
    }, 700);
  };

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
              Scheduler & Telemetry
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-primary" />
            Device Synchronization Orchestrator
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Distributed checkpoint tracking, incremental sync locks, and historical reconciliation
            jobs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="font-semibold shadow-xs"
            disabled={triggering}
            onClick={handleRunSync}
          >
            <Play className={`h-3.5 w-3.5 mr-1.5 ${triggering ? 'animate-spin' : ''}`} />
            Run Fleet Synchronization
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sync Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Active Scheduler"
          value="Every 4s"
          delta="Continuous"
          deltaType="positive"
          deltaLabel="Redlock Distributed"
          subtext="No race condition overlap"
          icon={RefreshCw}
        />

        <MetricCard
          title="Records Ingested (24h)"
          value="14,920"
          delta="+8.4%"
          deltaType="positive"
          deltaLabel="100% Normalized"
          subtext="0 Unrecoverable Sync Errors"
          icon={Sparkles}
        />

        <MetricCard
          title="Duplicate Shielding"
          value="412 Filtered"
          delta="100% Unique"
          deltaType="positive"
          deltaLabel="Idempotency Barrier"
          subtext="Checkpoint event filter"
          icon={ShieldCheck}
        />

        <MetricCard
          title="Avg Batch Duration"
          value="245ms"
          delta="Sub-second"
          deltaType="positive"
          deltaLabel="Parallel Execution"
          subtext="Hikvision ISAPI + ZKTeco"
          icon={Clock}
        />
      </div>

      {/* Sync Jobs Table */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Synchronization Job History
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Persisted in <code className="font-mono text-foreground">sync_jobs</code> and{' '}
                <code className="font-mono text-foreground">sync_checkpoints</code>.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {mockSyncJobs.length} Jobs Executed
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/20 text-xs">
                <TableHead className="font-semibold">Job ID</TableHead>
                <TableHead className="font-semibold">Device</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Ingested</TableHead>
                <TableHead className="font-semibold">Duplicates</TableHead>
                <TableHead className="font-semibold">Duration</TableHead>
                <TableHead className="font-semibold">Triggered By</TableHead>
                <TableHead className="font-semibold text-right">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockSyncJobs.map((job) => (
                <TableRow
                  key={job.id}
                  className="border-border/40 hover:bg-muted/30 transition-colors text-sm"
                >
                  <TableCell className="py-3 font-mono text-xs font-semibold text-foreground">
                    {job.id}
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-primary font-semibold">
                    {job.deviceCode}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {job.jobType}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold"
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    +{job.recordsInserted}
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                    {job.duplicates}
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                    {job.durationMs}ms
                  </TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground font-mono">
                    {job.requestedBy}
                  </TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs text-muted-foreground">
                    {job.completedAt}
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
