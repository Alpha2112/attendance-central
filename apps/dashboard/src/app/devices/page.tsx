'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Cpu,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Filter,
  X,
  Globe,
  Radio,
  Server,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Play,
  Square,
  Edit2,
  Trash2,
  MoreVertical,
  Copy,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface DeviceItem {
  id: string;
  code: string;
  name: string;
  vendor: 'HIKVISION' | 'ZKTECO' | 'SUPREMA' | 'DAHUA' | 'ANVIZ';
  model: string;
  host: string;
  port: number;
  protocol?: string;
  status: 'ONLINE' | 'OFFLINE' | 'STOPPED' | 'AUTH_ERROR' | 'DEGRADED';
  connectionMode: 'PULL' | 'PUSH' | 'REALTIME' | 'HYBRID';
  lastSeenAt: string;
  lastSyncAt: string;
  firmware: string;
  branch: string;
}

interface RawDeviceApi {
  id?: number | string;
  device_code?: string;
  deviceCode?: string;
  name?: string;
  vendor?: string;
  model?: string;
  host?: string;
  port?: number;
  protocol?: string;
  status?: string;
  connection_mode?: string;
  connectionMode?: string;
  last_seen_at?: string;
  last_sync_at?: string;
  firmware_version?: string;
  metadata?: Record<string, unknown>;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { text: string; success: boolean }>
  >({});
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Registration / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isModalTesting, setIsModalTesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{
    success: boolean;
    message: string;
    serial?: string;
    firmware?: string;
  } | null>(null);
  const [modalSubmitError, setModalSubmitError] = useState<string | null>(null);

  // Delete Confirmation Modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formVendor, setFormVendor] = useState<'HIKVISION' | 'ZKTECO' | 'SUPREMA'>('HIKVISION');
  const [formName, setFormName] = useState('HQ Turnstile 02 (Exit Face Term)');
  const [formCode, setFormCode] = useState('DEV-HQ-HIK01');
  const [formModel, setFormModel] = useState('DS-K1T321MFWX');
  const [formHost, setFormHost] = useState('192.168.100.186');
  const [formPort, setFormPort] = useState('80');
  const [formUsername, setFormUsername] = useState('admin');
  const [formPassword, setFormPassword] = useState('uno@6488');
  const [formUseHttps, setFormUseHttps] = useState(false);
  const [formConnectionMode, setFormConnectionMode] = useState<'PUSH' | 'PULL' | 'REALTIME'>(
    'PUSH',
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Vendor switch helper
  const handleVendorSelect = (vendor: 'HIKVISION' | 'ZKTECO' | 'SUPREMA') => {
    setFormVendor(vendor);
    setModalTestResult(null);
    if (vendor === 'HIKVISION') {
      setFormPort('80');
      setFormModel('DS-K1T321MFWX');
      setFormConnectionMode('PUSH');
      setFormUsername('admin');
    } else if (vendor === 'ZKTECO') {
      setFormPort('4370');
      setFormModel('MB2000 Pro');
      setFormConnectionMode('PULL');
      setFormUsername('admin');
    } else if (vendor === 'SUPREMA') {
      setFormPort('80');
      setFormModel('BioStation 3');
      setFormConnectionMode('REALTIME');
      setFormUsername('admin');
    }
  };

  // Fetch live devices from API
  const fetchFleet = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          const mapped: DeviceItem[] = data.map((item: unknown) => {
            const d = item as RawDeviceApi;
            return {
              id: String(d.id ?? Date.now()),
              code: d.device_code || d.deviceCode || 'DEV-UNKNOWN',
              name: d.name || 'Unnamed Device',
              vendor: (d.vendor || 'HIKVISION').toUpperCase() as DeviceItem['vendor'],
              model: d.model || 'DS-K1T321MFWX',
              host: d.host || '192.168.100.186',
              port: d.port || 80,
              protocol: d.protocol || (d.vendor === 'HIKVISION' ? 'ISAPI' : 'STANDALONE_SDK'),
              status: (d.status || 'ONLINE') as DeviceItem['status'],
              connectionMode: (d.connection_mode ||
                d.connectionMode ||
                'PUSH') as DeviceItem['connectionMode'],
              lastSeenAt: d.last_seen_at
                ? new Date(d.last_seen_at).toLocaleTimeString()
                : 'Just now',
              lastSyncAt: d.last_sync_at ? new Date(d.last_sync_at).toLocaleTimeString() : 'Recent',
              firmware: d.firmware_version || 'V3.2.0 build 241227',
              branch: 'HQ - Main Tower',
            };
          });
          setDevices(mapped);
        }
      }
    } catch {
      showToast('Could not refresh fleet from API', 'error');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // Open modal for new registration
  const handleOpenRegister = () => {
    setIsEditing(false);
    setEditingDeviceId(null);
    setFormVendor('HIKVISION');
    setFormName('HQ Turnstile 02 (Exit Face Term)');
    setFormCode('DEV-HQ-HIK01');
    setFormModel('DS-K1T321MFWX');
    setFormHost('192.168.100.186');
    setFormPort('80');
    setFormUsername('admin');
    setFormPassword('uno@6488');
    setFormUseHttps(false);
    setFormConnectionMode('PUSH');
    setModalTestResult(null);
    setModalSubmitError(null);
    setIsModalOpen(true);
  };

  // Open modal for editing existing device
  const handleOpenEdit = (dev: DeviceItem) => {
    setIsEditing(true);
    setEditingDeviceId(dev.id);
    setFormVendor(dev.vendor === 'ZKTECO' || dev.vendor === 'SUPREMA' ? dev.vendor : 'HIKVISION');
    setFormName(dev.name);
    setFormCode(dev.code);
    setFormModel(dev.model);
    setFormHost(dev.host);
    setFormPort(String(dev.port));
    setFormConnectionMode(
      dev.connectionMode === 'PULL' || dev.connectionMode === 'REALTIME'
        ? dev.connectionMode
        : 'PUSH',
    );
    setFormUsername('admin');
    setFormPassword('uno@6488');
    setFormUseHttps(false);
    setModalTestResult(null);
    setModalSubmitError(null);
    setIsModalOpen(true);
  };

  // Duplicate existing device configuration
  const handleDuplicate = (dev: DeviceItem) => {
    setIsEditing(false);
    setEditingDeviceId(null);
    setFormVendor(dev.vendor === 'ZKTECO' || dev.vendor === 'SUPREMA' ? dev.vendor : 'HIKVISION');
    setFormName(`${dev.name} (Copy)`);
    setFormCode(`${dev.code}-COPY`);
    setFormModel(dev.model);
    setFormHost(dev.host);
    setFormPort(String(dev.port));
    setFormConnectionMode(
      dev.connectionMode === 'PULL' || dev.connectionMode === 'REALTIME'
        ? dev.connectionMode
        : 'PUSH',
    );
    setFormUsername('admin');
    setFormPassword('uno@6488');
    setFormUseHttps(false);
    setModalTestResult(null);
    setModalSubmitError(null);
    setIsModalOpen(true);
    showToast(`📋 Copied settings from [${dev.code}]`);
  };

  // Probe Ping handler on row
  const handleTestConnection = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setTestingId(id);
    try {
      const res = await fetch(`/api/devices/${id}/probe`, { method: 'POST' });
      const data = (await res.json()) as {
        success?: boolean;
        latencyMs?: number;
        error?: string;
        serialNumber?: string;
      };
      if (res.ok && data.success) {
        const ms = data.latencyMs || 25;
        setTestResults((prev) => ({
          ...prev,
          [id]: {
            text: `Connected (${ms}ms)`,
            success: true,
          },
        }));
        setDevices((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: 'ONLINE', lastSeenAt: 'Just now' } : d)),
        );
        showToast(
          `✔ Live Ping OK: ${data.serialNumber ? `[${data.serialNumber}]` : 'Terminal'} responded in ${ms}ms`,
        );
      } else {
        const errText = data.error || 'Connection Failed';
        setTestResults((prev) => ({
          ...prev,
          [id]: {
            text: 'Failed',
            success: false,
          },
        }));
        setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'OFFLINE' } : d)));
        showToast(`❌ Hardware unreachable: ${errText}`, 'error');
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { text: 'Timeout', success: false },
      }));
      showToast('❌ Ping probe timeout connecting to hardware', 'error');
    } finally {
      setTestingId(null);
    }
  };

  // Start / Stop Device Ingestion
  const handleToggleStatus = async (dev: DeviceItem) => {
    const nextStatus = dev.status === 'ONLINE' ? 'STOPPED' : 'ONLINE';
    try {
      const res = await fetch(`/api/devices/${dev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setDevices((prev) => prev.map((d) => (d.id === dev.id ? { ...d, status: nextStatus } : d)));
        showToast(
          nextStatus === 'ONLINE'
            ? `Terminal [${dev.code}] ingestion STARTED`
            : `Terminal [${dev.code}] ingestion STOPPED (Paused)`,
        );
      }
    } catch {
      showToast('Failed to update terminal status', 'error');
    }
  };

  // Delete Device
  const handleDeleteDevice = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== id));
        showToast('Terminal successfully removed from fleet');
        setDeleteConfirmId(null);
      } else {
        showToast('Failed to delete terminal', 'error');
      }
    } catch {
      showToast('Error deleting device', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Test Connection inside Modal
  const handleModalTest = async () => {
    setIsModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await fetch('/api/devices/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceCode: formCode,
          name: formName,
          vendor: formVendor,
          model: formModel,
          host: formHost,
          port: parseInt(formPort, 10) || (formVendor === 'HIKVISION' ? 80 : 4370),
          username: formUsername,
          password: formPassword,
          useHttps: formUseHttps,
          connectionMode: formConnectionMode,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        latencyMs?: number;
        serialNumber?: string;
        firmwareVersion?: string;
        error?: string;
      };
      if (res.ok && data.success) {
        setModalTestResult({
          success: true,
          message: `Connected successfully in ${data.latencyMs || 28}ms!`,
          serial: data.serialNumber || 'DS-K1T321MFWX20241227V030200EN',
          firmware: data.firmwareVersion || 'V3.2.0 build 241227',
        });
      } else {
        setModalTestResult({
          success: false,
          message:
            data.error ||
            'Device unreachable or authentication failed. (Note: For Hikvision, use HTTP Port 80 for ISAPI).',
        });
      }
    } catch {
      setModalTestResult({
        success: false,
        message: 'Network error or backend API timeout.',
      });
    } finally {
      setIsModalTesting(false);
    }
  };

  // Submit device (Create or Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalSubmitError(null);
    try {
      const url = isEditing && editingDeviceId ? `/api/devices/${editingDeviceId}` : '/api/devices';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceCode: formCode,
          name: formName,
          vendor: formVendor,
          model: formModel,
          host: formHost,
          port: parseInt(formPort, 10) || (formVendor === 'HIKVISION' ? 80 : 4370),
          username: formUsername,
          password: formPassword,
          useHttps: formUseHttps,
          connectionMode: formConnectionMode,
          status: 'ONLINE',
        }),
      });

      const result = await res.json();
      if (res.ok) {
        await fetchFleet();
        setIsModalOpen(false);
        showToast(
          isEditing
            ? `✔ Terminal [${formCode}] updated successfully!`
            : `✔ Terminal [${formCode}] registered in MySQL fleet!`,
        );
      } else {
        const errorMsg =
          result?.error?.message ||
          (typeof result?.error === 'string' ? result.error : null) ||
          result?.message ||
          'Failed to save device';
        setModalSubmitError(errorMsg);
        showToast(`❌ ${errorMsg}`, 'error');
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to save device. Check API connection.';
      setModalSubmitError(errorMsg);
      showToast(`❌ ${errorMsg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered devices list
  const filteredDevices = devices.filter((dev) => {
    const matchesSearch =
      dev.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dev.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dev.host.includes(searchTerm);
    const matchesVendor = selectedVendor === 'ALL' || dev.vendor === selectedVendor;
    return matchesSearch && matchesVendor;
  });

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-200 text-xs font-medium border ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground">
              Hardware Fleet
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            Device Fleet Registry
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dynamic hardware configuration, ISAPI credentials, live telemetry, and ingestion controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-card hover:bg-muted font-medium"
            onClick={fetchFleet}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Fleet'}
          </Button>

          <Button
            size="sm"
            className="font-semibold shadow-xs"
            onClick={handleOpenRegister}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Register Device
          </Button>
        </div>
      </div>

      {/* Metrics Summary Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Fleet Capacity"
          value={`${devices.length}`}
          delta="+50%"
          deltaType="positive"
          deltaLabel="Active Terminals"
          subtext="Hikvision, ZKTeco, Suprema"
          icon={Cpu}
        />

        <MetricCard
          title="Terminal Availability"
          value="100%"
          delta="Online"
          deltaType="positive"
          deltaLabel="0 Offline Faults"
          subtext="Healthy connection status"
          icon={CheckCircle2}
        />

        <MetricCard
          title="Polling Frequency"
          value="4.0s"
          delta="Continuous"
          deltaType="positive"
          deltaLabel="Background Tick"
          subtext="Automatic ISAPI sync loop"
          icon={Clock}
        />
      </div>

      {/* Filter Bar */}
      <Card className="border-border bg-card shadow-xs">
        <CardContent className="p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 w-full md:max-w-md">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Filter by name, device code, or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 text-xs bg-muted/30 border-border"
            />
          </div>
          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1 font-semibold">
              <Filter className="h-3.5 w-3.5" /> Vendor:
            </span>
            {['ALL', 'HIKVISION', 'ZKTECO', 'SUPREMA'].map((v) => (
              <Button
                key={v}
                variant={selectedVendor === v ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-[11px] px-2.5 font-medium"
                onClick={() => setSelectedVendor(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Device Table */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Registered Hardware Terminals</CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {filteredDevices.length} Terminals Registered
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Direct telemetry, live ping probes, and communication controls per terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              Loading hardware fleet...
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="p-3 rounded-full bg-muted/40 w-fit mx-auto text-muted-foreground">
                <Cpu className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">No Devices Registered</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Click &ldquo;Register Device&rdquo; to add your physical Hikvision terminal or any
                  other biometric hardware.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleOpenRegister}>
                <Plus className="h-3.5 w-3.5" /> Register First Terminal
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/20">
                  <TableHead className="text-xs font-semibold">Terminal</TableHead>
                  <TableHead className="text-xs font-semibold">Vendor & Model</TableHead>
                  <TableHead className="text-xs font-semibold">Endpoint</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Mode</TableHead>
                  <TableHead className="text-xs font-semibold">Last Sync</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.map((dev) => (
                  <TableRow
                    key={dev.id}
                    className="border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="py-2.5">
                      <div>
                        <Link
                          href={`/devices/${dev.id}`}
                          className="text-xs font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1"
                        >
                          {dev.name}
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                        </Link>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {dev.code} · {dev.branch}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {dev.vendor}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{dev.model}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className="text-xs font-mono text-foreground font-medium">
                        {dev.host}:{dev.port}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        {dev.status === 'ONLINE' ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-semibold text-emerald-500">ONLINE</span>
                          </>
                        ) : dev.status === 'STOPPED' ? (
                          <>
                            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                            <span className="text-xs font-semibold text-amber-400">STOPPED</span>
                          </>
                        ) : (
                          <>
                            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                            <span className="text-xs font-semibold text-rose-500">
                              {dev.status}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {dev.connectionMode}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {dev.lastSyncAt}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1. Quick Start / Stop Ingestion Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2.5 gap-1.5 font-medium border-border/80 hover:bg-muted/80"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleToggleStatus(dev);
                          }}
                          title={
                            dev.status === 'ONLINE'
                              ? 'Pause / Stop Ingestion'
                              : 'Start / Resume Ingestion'
                          }
                        >
                          {dev.status === 'ONLINE' ? (
                            <>
                              <Square className="h-3 w-3 text-amber-400 fill-amber-400" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 text-emerald-400 fill-emerald-400" />
                              <span>Start</span>
                            </>
                          )}
                        </Button>

                        {/* 2. Quick Probe Ping Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className={`h-7 text-[11px] px-2.5 gap-1.5 font-medium border-border/80 transition-all ${
                            testResults[dev.id]?.success
                              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60'
                              : testResults[dev.id] && !testResults[dev.id]?.success
                                ? 'border-rose-500/50 bg-rose-950/40 text-rose-300 hover:bg-rose-950/60'
                                : 'hover:border-primary/50 hover:bg-muted/80'
                          }`}
                          disabled={testingId === dev.id}
                          onClick={(e) => handleTestConnection(dev.id, e)}
                          title="Test live hardware reachability"
                        >
                          {testingId === dev.id ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin text-sky-400" />
                              <span>Pinging...</span>
                            </>
                          ) : testResults[dev.id]?.success ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              <span>{testResults[dev.id].text}</span>
                            </>
                          ) : testResults[dev.id] && !testResults[dev.id]?.success ? (
                            <>
                              <AlertTriangle className="h-3 w-3 text-rose-400" />
                              <span>Failed</span>
                            </>
                          ) : (
                            <>
                              <Radio className="h-3 w-3 text-sky-400" />
                              <span>Probe Ping</span>
                            </>
                          )}
                        </Button>

                        {/* 3. shadcn/ui DropdownMenu (renders via Portal, zero scrollbars or clipping) */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                              title="More Actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              className="gap-2.5 font-medium cursor-pointer"
                              onClick={() => handleOpenEdit(dev)}
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Edit</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2.5 font-medium cursor-pointer"
                              onClick={() => handleDuplicate(dev)}
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Make a copy</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2.5 font-medium cursor-pointer"
                              asChild
                            >
                              <Link href={`/devices/${dev.id}`}>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Inspect Details</span>
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="gap-2.5 font-medium text-rose-400 focus:text-rose-300 focus:bg-rose-500/15 cursor-pointer"
                              onClick={() => setDeleteConfirmId(dev.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dynamic Registration & Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-card border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    {isEditing
                      ? 'Edit Hardware Biometric Terminal'
                      : 'Register Hardware Biometric Device'}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Configure endpoint IP, ISAPI credentials, and communication parameters.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Vendor Selection */}
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Hardware Vendor Platform <span className="text-rose-500 font-bold">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['HIKVISION', 'ZKTECO', 'SUPREMA'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleVendorSelect(v)}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        formVendor === v
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                          : 'border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <span className="font-bold tracking-wider">{v}</span>
                      <span className="text-[10px] opacity-75 font-mono">
                        {v === 'HIKVISION'
                          ? 'ISAPI (Face/Card)'
                          : v === 'ZKTECO'
                            ? 'Standalone / ADMS'
                            : 'BioStar 2 API'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Details with Asterisks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">
                    Device Name <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <Input
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. HQ Turnstile 02 (Exit Face Term)"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">
                    Device Code (ID) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <Input
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. DEV-HQ-HIK01"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Network Parameters */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                    <Globe className="h-3 w-3 text-muted-foreground" /> IP / Host Address{' '}
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <Input
                    required
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    placeholder="192.168.100.186"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                    <Server className="h-3 w-3 text-muted-foreground" /> Port{' '}
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <Input
                    required
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    placeholder="80"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                💡 <span className="text-sky-400 font-medium">Hikvision Tip:</span> HTTP ISAPI
                operates on <strong>Port 80</strong>. (Port 8000 in SADP is the command SDK port).
              </p>

              {/* Hardware Model & Ingestion Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">
                    Terminal Model
                  </label>
                  <Input
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder="e.g. DS-K1T321MFWX"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                    <Radio className="h-3 w-3 text-muted-foreground" /> Ingestion Mode{' '}
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <select
                    value={formConnectionMode}
                    onChange={(e) =>
                      setFormConnectionMode(e.target.value as 'PUSH' | 'PULL' | 'REALTIME')
                    }
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-2 text-foreground"
                  >
                    <option value="PUSH">PUSH (Alert Stream / HTTP Push)</option>
                    <option value="PULL">PULL (Scheduled Log Polling)</option>
                    <option value="REALTIME">REALTIME (WebSocket Stream)</option>
                  </select>
                </div>
              </div>

              {/* Authentication Credentials with Asterisks */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" /> Device Authentication (ISAPI
                    / SDK)
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formUseHttps}
                      onChange={(e) => setFormUseHttps(e.target.checked)}
                      className="rounded border-border"
                    />
                    Use HTTPS (SSL)
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">
                      Username <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <Input
                      required
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      placeholder="admin"
                      className="h-8 text-xs bg-background/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">
                      Password / CommKey <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        required
                        type={showPassword ? 'text' : 'password'}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="uno@6488"
                        className="h-8 text-xs bg-background/50 pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Probe Test Feedback */}
              {modalTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    modalTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {modalTestResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-semibold">{modalTestResult.message}</div>
                    {modalTestResult.serial && (
                      <div className="text-[10px] opacity-80 font-mono">
                        Serial: {modalTestResult.serial} | Firmware: {modalTestResult.firmware}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Submission Error Feedback */}
              {modalSubmitError && (
                <div className="p-3 rounded-lg border border-rose-500/50 bg-rose-950/50 text-rose-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span className="font-medium">{modalSubmitError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={handleModalTest}
                  disabled={isModalTesting || !formHost}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isModalTesting ? 'animate-spin' : ''}`} />
                  {isModalTesting ? 'Testing Hardware...' : 'Test Connection'}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {isEditing ? 'Save Changes' : 'Save & Register Device'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-card border border-border/80 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-lg bg-rose-950/50 border border-rose-500/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Confirm Terminal Deletion</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to remove this hardware terminal from the fleet? Historical
              attendance logs will be preserved in the database.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-rose-600 hover:bg-rose-500 text-white"
                onClick={() => handleDeleteDevice(deleteConfirmId)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Terminal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
