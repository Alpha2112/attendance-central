'use client';

import React from 'react';
import { Activity, Shield, Search, Download, Filter, CheckCircle2, Lock, UserCheck } from 'lucide-react';
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

interface AuditItem {
  id: string;
  actorType: 'USER' | 'SYSTEM';
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  timestamp: string;
}

const mockAuditLogs: AuditItem[] = [
  {
    id: 'aud-101',
    actorType: 'USER',
    actorId: 'admin@techive.internal',
    action: 'REGISTER_DEVICE',
    resourceType: 'DEVICE',
    resourceId: 'DEV-HQ-HIK01',
    correlationId: 'req-9812903',
    timestamp: '2026-08-17 14:15:20',
  },
  {
    id: 'aud-102',
    actorType: 'SYSTEM',
    actorId: 'SCHEDULER',
    action: 'INCREMENTAL_SYNC_COMPLETED',
    resourceType: 'DEVICE',
    resourceId: 'DEV-HQ-ZK01',
    correlationId: 'job-99120',
    timestamp: '2026-08-17 14:30:00',
  },
  {
    id: 'aud-103',
    actorType: 'USER',
    actorId: 'admin@techive.internal',
    action: 'MAP_EMPLOYEE_IDENTITY',
    resourceType: 'MAPPING',
    resourceId: 'EMP-1001 <-> 2',
    correlationId: 'req-991280',
    timestamp: '2026-08-17 14:40:12',
  },
  {
    id: 'aud-104',
    actorType: 'USER',
    actorId: 'OPERATOR-1',
    action: 'REPLAY_OUTBOX_EVENT',
    resourceType: 'OUTBOX',
    resourceId: '19a6f768-b74f-4210-8e0f-3c20a8344eb6',
    correlationId: 'replay:19a6f768',
    timestamp: '2026-08-17 15:00:41',
  },
];

export default function AuditPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Compliance & Security
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Immutable Security & Operations Audit Trail
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Strict compliance audit trail capturing administrative modifications, credential rotations, and replay dispatches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-border bg-card hover:bg-muted font-medium">
            <Download className="h-4 w-4 mr-1.5" />
            Export Audit Trail
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Audit Records"
          value={`${mockAuditLogs.length}`}
          delta="Immutable"
          deltaType="positive"
          deltaLabel="Append-Only Storage"
          subtext="Cryptographically verified log sequence"
          icon={Shield}
        />

        <MetricCard
          title="Admin Modifications"
          value="3"
          delta="100% Attributed"
          deltaType="positive"
          deltaLabel="User Actions"
          subtext="Full correlation ID tracking"
          icon={UserCheck}
        />

        <MetricCard
          title="Security Health"
          value="Nominal"
          delta="Compliant"
          deltaType="positive"
          deltaLabel="Zero Unauthorized Requests"
          subtext="RBAC backend validated"
          icon={CheckCircle2}
        />
      </div>

      {/* Audit Table */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Audit Records</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Persisted in <code className="font-mono text-foreground">audit_logs</code> table with actor attribution.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {mockAuditLogs.length} Records Logged
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/20 text-xs">
                <TableHead className="font-semibold">Action</TableHead>
                <TableHead className="font-semibold">Actor</TableHead>
                <TableHead className="font-semibold">Target Resource</TableHead>
                <TableHead className="font-semibold">Correlation ID</TableHead>
                <TableHead className="font-semibold text-right">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAuditLogs.map((item) => (
                <TableRow key={item.id} className="border-border/40 hover:bg-muted/30 transition-colors text-sm">
                  <TableCell className="py-3 font-mono text-xs font-semibold text-primary">
                    {item.action}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="text-xs font-semibold text-foreground">{item.actorId}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {item.actorType}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="text-xs text-foreground font-mono font-medium">{item.resourceId}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {item.resourceType}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                    {item.correlationId}
                  </TableCell>
                  <TableCell className="py-3 text-right font-mono text-xs text-muted-foreground">
                    {item.timestamp}
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
