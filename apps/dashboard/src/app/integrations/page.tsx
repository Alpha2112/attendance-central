'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Send,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  RefreshCw,
  ArrowUpRight,
  Sparkles,
  Zap,
  Lock,
} from 'lucide-react';
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

interface IntegrationItem {
  id: string;
  name: string;
  targetType: 'HRMS_WEBHOOK' | 'ERP_SYNC' | 'PAYROLL_API';
  endpointUrl: string;
  authType: string;
  secretRef: string;
  status: 'ACTIVE' | 'DEGRADED' | 'DISABLED';
  deliveriesToday: number;
  successRate: string;
  avgLatencyMs: number;
  lastDelivery: string;
}

const mockIntegrations: IntegrationItem[] = [
  {
    id: '1',
    name: 'Workday HRMS Primary Webhook',
    targetType: 'HRMS_WEBHOOK',
    endpointUrl: 'https://hrms.techive.internal/api/v1/attendance/events',
    authType: 'HMAC_SHA256',
    secretRef: 'env:WORKDAY_HMAC_SECRET',
    status: 'ACTIVE',
    deliveriesToday: 4812,
    successRate: '99.98%',
    avgLatencyMs: 65,
    lastDelivery: 'Just now',
  },
  {
    id: '2',
    name: 'SAP SuccessFactors Outbound Feeder',
    targetType: 'ERP_SYNC',
    endpointUrl: 'https://sap.techive.internal/rest/attendance_ingest',
    authType: 'HMAC_SHA256',
    secretRef: 'env:SAP_SECRET_KEY',
    status: 'ACTIVE',
    deliveriesToday: 2150,
    successRate: '100%',
    avgLatencyMs: 82,
    lastDelivery: '3 mins ago',
  },
];

export default function IntegrationsPage() {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestDispatch = (id: string) => {
    setTestingId(id);
    setTimeout(() => {
      setTestingId(null);
      setTestResult(
        'Test webhook dispatched successfully (HTTP 200 OK, HMAC-SHA256 verified in 42ms)',
      );
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Outbound Dispatch
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Send className="h-6 w-6 text-primary" />
            Outbound Integrations & Transactional Outbox
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Decoupled transactional outbox dispatches with HMAC SHA-256 signatures, exponential backoff, and DLQ routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="font-semibold shadow-xs">
            <Plus className="h-4 w-4 mr-1.5" />
            Register Subscription
          </Button>
        </div>
      </div>

      {testResult && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>{testResult}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Outbox State"
          value="0 Backlog"
          delta="Published"
          deltaType="positive"
          deltaLabel="Transactional Safety"
          subtext="No delayed webhook deliveries"
          icon={Send}
        />

        <MetricCard
          title="Deliveries (24h)"
          value="6,962"
          delta="+12.4%"
          deltaType="positive"
          deltaLabel="Workday & SAP"
          subtext="HMAC-SHA256 authenticated"
          icon={Sparkles}
        />

        <MetricCard
          title="Delivery Success Rate"
          value="99.98%"
          delta="Stable"
          deltaType="positive"
          deltaLabel="SLO > 99.9%"
          subtext="Exponential backoff retries"
          icon={CheckCircle2}
        />

        <MetricCard
          title="Avg Dispatch Latency"
          value="71ms"
          delta="Sub-100ms"
          deltaType="positive"
          deltaLabel="Fast Outbound"
          subtext="Dedicated dispatcher pool"
          icon={Clock}
        />
      </div>

      {/* Table */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Registered Subscriptions & Webhooks</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configured webhooks receive canonical normalized attendance events via HTTPS with signing.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {mockIntegrations.length} Active Endpoints
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/20 text-xs">
                <TableHead className="font-semibold">Integration Name</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Endpoint URL</TableHead>
                <TableHead className="font-semibold">Auth & Signing</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Today / Success</TableHead>
                <TableHead className="font-semibold">Avg Latency</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockIntegrations.map((item) => (
                <TableRow key={item.id} className="border-border/40 hover:bg-muted/30 transition-colors text-sm">
                  <TableCell className="py-3 font-semibold text-foreground">
                    {item.name}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {item.targetType}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {item.endpointUrl}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 text-[10px] font-semibold gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      {item.authType}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-xs">
                    <span className="font-semibold text-foreground">{item.deliveriesToday.toLocaleString()}</span>{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">({item.successRate})</span>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                    {item.avgLatencyMs}ms
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-medium"
                      disabled={testingId === item.id}
                      onClick={() => handleTestDispatch(item.id)}
                    >
                      <Zap className={`h-3 w-3 mr-1 ${testingId === item.id ? 'animate-pulse' : ''}`} />
                      {testingId === item.id ? 'Dispatching...' : 'Test Dispatch'}
                    </Button>
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
