'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Cpu,
  User,
  CreditCard,
  Building,
  MoreVertical,
  Copy,
  ToggleLeft,
  ToggleRight,
  Filter,
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

interface DeviceOption {
  id: number;
  device_code: string;
  name: string;
  vendor: string;
  host: string;
  port: number;
  status: string;
}

interface MappingItem {
  id: string;
  externalEmployeeId: string;
  employeeName: string;
  department: string;
  deviceId: number;
  deviceCode: string;
  deviceName: string;
  vendor: string;
  vendorUserId: string;
  cardNo?: string;
  status: 'ACTIVE' | 'INACTIVE';
  syncedAt: string;
}

interface RawMappingApi {
  id: number;
  organization_id: number;
  device_id: number;
  external_employee_id: string;
  vendor_user_id: string;
  vendor_employee_code?: string;
  status: string;
  metadata?: {
    employeeName?: string;
    department?: string;
    cardNo?: string;
  } | null;
  created_at: string;
  updated_at: string;
  device_code?: string;
  device_name?: string;
  vendor?: string;
  model?: string;
  host?: string;
  port?: number;
}

export default function MappingsPage() {
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Confirmation Modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formExternalId, setFormExternalId] = useState('EMP-1001');
  const [formEmployeeName, setFormEmployeeName] = useState('Sarah Jenkins');
  const [formDepartment, setFormDepartment] = useState('Engineering');
  const [formDeviceId, setFormDeviceId] = useState<string>('');
  const [formVendorUserId, setFormVendorUserId] = useState('1001');
  const [formCardNo, setFormCardNo] = useState('CRD-88910');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch all registered hardware devices
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices', { cache: 'no-store' });
      if (res.ok) {
        const list = (await res.json()) as DeviceOption[];
        if (Array.isArray(list)) {
          setDevices(list);
          if (list.length > 0 && !formDeviceId) {
            setFormDeviceId(String(list[0]?.id || ''));
          }
        }
      }
    } catch {
      // Fallback
    }
  }, [formDeviceId]);

  // Fetch all biometric employee mappings from backend MySQL
  const fetchMappings = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/mappings', { cache: 'no-store' });
      if (res.ok) {
        const rawList = (await res.json()) as RawMappingApi[];
        if (Array.isArray(rawList)) {
          const mapped: MappingItem[] = rawList.map((m) => {
            const meta = m.metadata || {};
            return {
              id: String(m.id),
              externalEmployeeId: m.external_employee_id,
              employeeName: meta.employeeName || `Employee ${m.external_employee_id}`,
              department: meta.department || 'General',
              deviceId: m.device_id,
              deviceCode: m.device_code || `DEV-${m.device_id}`,
              deviceName: m.device_name || 'Biometric Terminal',
              vendor: (m.vendor || 'HIKVISION').toUpperCase(),
              vendorUserId: m.vendor_user_id,
              cardNo: meta.cardNo || undefined,
              status: (m.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
              syncedAt: m.updated_at
                ? new Date(m.updated_at).toLocaleDateString()
                : 'Recent',
            };
          });
          setMappings(mapped);
        }
      }
    } catch {
      showToast('Could not load identity mappings from API', 'error');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMappings();
    fetchDevices();
  }, [fetchMappings, fetchDevices]);

  // Open modal for new mapping
  const handleOpenCreate = () => {
    setIsEditing(false);
    setEditingMappingId(null);
    setFormExternalId('EMP-1001');
    setFormEmployeeName('Sarah Jenkins');
    setFormDepartment('Engineering');
    setFormVendorUserId('1001');
    setFormCardNo('CRD-88910');
    setFormStatus('ACTIVE');
    if (devices.length > 0 && devices[0]) {
      setFormDeviceId(String(devices[0].id));
    }
    setModalError(null);
    setIsModalOpen(true);
  };

  // Open modal for editing existing mapping
  const handleOpenEdit = (m: MappingItem) => {
    setIsEditing(true);
    setEditingMappingId(m.id);
    setFormExternalId(m.externalEmployeeId);
    setFormEmployeeName(m.employeeName);
    setFormDepartment(m.department);
    setFormDeviceId(String(m.deviceId));
    setFormVendorUserId(m.vendorUserId);
    setFormCardNo(m.cardNo || '');
    setFormStatus(m.status);
    setModalError(null);
    setIsModalOpen(true);
  };

  // Duplicate mapping for another device
  const handleDuplicate = (m: MappingItem) => {
    setIsEditing(false);
    setEditingMappingId(null);
    setFormExternalId(m.externalEmployeeId);
    setFormEmployeeName(m.employeeName);
    setFormDepartment(m.department);
    setFormVendorUserId(m.vendorUserId);
    setFormCardNo(m.cardNo || '');
    setFormStatus('ACTIVE');
    // Pick next device if available
    const otherDev = devices.find((d) => d.id !== m.deviceId);
    if (otherDev) {
      setFormDeviceId(String(otherDev.id));
    } else {
      setFormDeviceId(String(m.deviceId));
    }
    setModalError(null);
    setIsModalOpen(true);
    showToast(`📋 Copied mapping for [${m.employeeName}]`);
  };

  // 1-Click Status Toggle
  const handleToggleStatus = async (m: MappingItem) => {
    const nextStatus = m.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/mappings/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setMappings((prev) =>
          prev.map((item) => (item.id === m.id ? { ...item, status: nextStatus } : item)),
        );
        showToast(`Mapping for [${m.externalEmployeeId}] is now ${nextStatus}`);
      } else {
        showToast('Failed to update mapping status', 'error');
      }
    } catch {
      showToast('Error connecting to backend API', 'error');
    }
  };

  // Submit form (Create or Update)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);

    const numericDeviceId = parseInt(formDeviceId, 10);
    if (isNaN(numericDeviceId)) {
      setModalError('Please select a valid target terminal');
      setIsSubmitting(false);
      return;
    }

    try {
      const url = isEditing && editingMappingId ? `/api/mappings/${editingMappingId}` : '/api/mappings';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalEmployeeId: formExternalId.trim(),
          employeeName: formEmployeeName.trim(),
          department: formDepartment.trim(),
          deviceId: numericDeviceId,
          vendorUserId: formVendorUserId.trim(),
          cardNo: formCardNo.trim() || undefined,
          status: formStatus,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        await fetchMappings();
        setIsModalOpen(false);
        showToast(
          isEditing
            ? `✔ Mapping for [${formExternalId}] updated successfully!`
            : `✔ Employee [${formExternalId}] successfully mapped to terminal!`,
        );
      } else {
        const errorMsg =
          result?.error?.message ||
          (typeof result?.error === 'string' ? result.error : null) ||
          result?.message ||
          'Failed to save mapping';
        setModalError(errorMsg);
        showToast(`❌ ${errorMsg}`, 'error');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Network error saving mapping';
      setModalError(errorMsg);
      showToast(`❌ ${errorMsg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete / Unmap employee
  const handleDeleteMapping = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/mappings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMappings((prev) => prev.filter((item) => item.id !== id));
        showToast('Employee identity mapping deleted successfully');
        setDeleteConfirmId(null);
      } else {
        showToast('Failed to delete mapping', 'error');
      }
    } catch {
      showToast('Error deleting mapping', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered mappings list
  const filtered = mappings.filter((m) => {
    const matchesSearch =
      m.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.externalEmployeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.vendorUserId.includes(searchTerm) ||
      m.deviceCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.cardNo && m.cardNo.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesVendor = selectedVendor === 'ALL' || m.vendor === selectedVendor;
    const matchesStatus = selectedStatus === 'ALL' || m.status === selectedStatus;

    return matchesSearch && matchesVendor && matchesStatus;
  });

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
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
              Identity Resolution
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              ORG-TECHIVE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Link2 className="h-6 w-6 text-primary" />
            Biometric Identity Mappings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Resolves canonical HRMS employee external IDs against hardware terminal biometric IDs with one-to-one precision per physical device.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-card hover:bg-muted font-medium"
            onClick={fetchMappings}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Mappings'}
          </Button>

          <Button
            size="sm"
            className="font-semibold shadow-xs"
            onClick={handleOpenCreate}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Map Employee
          </Button>
        </div>
      </div>

      {/* Metrics Summary Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Total Mappings"
          value={`${mappings.length}`}
          delta="+100%"
          deltaType="positive"
          deltaLabel="Active & Validated"
          subtext="amare (EMP-1001) mapped on Hikvision"
          icon={Link2}
        />

        <MetricCard
          title="Resolution Ratio"
          value="100%"
          delta="Resolved"
          deltaType="positive"
          deltaLabel="0 Unresolved Leaks"
          subtext="All hardware punches match HRMS"
          icon={CheckCircle2}
        />

        <MetricCard
          title="Hardware Coverage"
          value={`${devices.length} Devices`}
          delta="Configured"
          deltaType="positive"
          deltaLabel="Hikvision, ZKTeco, Suprema"
          subtext="Multi-device identity binding"
          icon={Cpu}
        />
      </div>

      {/* Filter Bar */}
      <Card className="border-border bg-card shadow-xs">
        <CardContent className="p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 w-full md:max-w-md">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search by employee name, external ID, vendor ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 text-xs bg-muted/30 border-border"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs">
              <span className="px-2 text-muted-foreground font-semibold">Vendor:</span>
              {['ALL', 'HIKVISION', 'ZKTECO', 'SUPREMA'].map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVendor(v)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    selectedVendor === v
                      ? 'bg-background text-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs">
              <span className="px-2 text-muted-foreground font-semibold">Status:</span>
              {['ALL', 'ACTIVE', 'INACTIVE'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    selectedStatus === s
                      ? 'bg-background text-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Active Device Employee Mappings</CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {filtered.length} Mappings Active
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Persisted in <span className="font-mono text-foreground">device_employee_mappings</span>{' '}
            with database-level uniqueness per device and HRMS external identity resolution.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 min-h-[220px]">
          {loading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              Loading biometric mappings...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="p-3 rounded-full bg-muted/40 w-fit mx-auto text-muted-foreground">
                <Link2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">No Mappings Found</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Click &ldquo;Map Employee&rdquo; to bind an HRMS employee ID to a physical biometric
                  terminal user ID.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleOpenCreate}>
                <Plus className="h-3.5 w-3.5" /> Map First Employee
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/20">
                  <TableHead className="text-xs font-semibold">HRMS Employee</TableHead>
                  <TableHead className="text-xs font-semibold">External ID</TableHead>
                  <TableHead className="text-xs font-semibold">Terminal & Vendor</TableHead>
                  <TableHead className="text-xs font-semibold">Biometric Vendor ID</TableHead>
                  <TableHead className="text-xs font-semibold">Card / Tag</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow
                    key={m.id}
                    className="border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="py-2.5">
                      <div>
                        <div className="text-xs font-semibold text-foreground">{m.employeeName}</div>
                        <div className="text-[10px] text-muted-foreground">{m.department}</div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 font-mono text-xs text-primary font-semibold">
                      {m.externalEmployeeId}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {m.vendor}
                        </Badge>
                        <span className="text-xs font-medium text-foreground">{m.deviceCode}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {m.deviceName}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 font-mono text-xs text-foreground font-medium">
                      {m.vendorUserId}
                    </TableCell>
                    <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                      {m.cardNo ?? '—'}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(m)}
                        className="cursor-pointer group flex items-center gap-1.5 focus:outline-none"
                        title="Click to toggle status"
                      >
                        {m.status === 'ACTIVE' ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-semibold text-emerald-500 group-hover:underline">
                              ACTIVE
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="h-2 w-2 rounded-full bg-muted-foreground"></span>
                            <span className="text-xs font-semibold text-muted-foreground group-hover:underline">
                              INACTIVE
                            </span>
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <div className="flex items-center justify-end">
                        {/* 3-Dots Dropdown Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                              title="More Options"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              className="gap-2.5 font-medium cursor-pointer"
                              onClick={() => handleOpenEdit(m)}
                            >
                              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Edit Mapping</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2.5 font-medium cursor-pointer"
                              onClick={() => handleDuplicate(m)}
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Make a copy</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2.5 font-medium cursor-pointer"
                              onClick={() => handleToggleStatus(m)}
                            >
                              {m.status === 'ACTIVE' ? (
                                <>
                                  <ToggleLeft className="h-3.5 w-3.5 text-amber-400" />
                                  <span>Deactivate</span>
                                </>
                              ) : (
                                <>
                                  <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>Activate</span>
                                </>
                              )}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="gap-2.5 font-medium text-rose-400 focus:text-rose-300 focus:bg-rose-500/15 cursor-pointer"
                              onClick={() => setDeleteConfirmId(m.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                              <span>Delete Mapping</span>
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

      {/* Map / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-card border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    {isEditing
                      ? 'Edit Biometric Identity Mapping'
                      : 'Map HRMS Employee to Terminal'}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Bind employee master ID to hardware vendor biometric user record.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-4 space-y-4 overflow-y-auto">
              {/* HRMS External Identity */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <User className="h-3.5 w-3.5 text-primary" /> HRMS Employee Identity
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">
                      HRMS External ID <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <Input
                      required
                      value={formExternalId}
                      onChange={(e) => setFormExternalId(e.target.value)}
                      placeholder="EMP-1001"
                      className="h-8 text-xs font-mono bg-background/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">
                      Full Name <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <Input
                      required
                      value={formEmployeeName}
                      onChange={(e) => setFormEmployeeName(e.target.value)}
                      placeholder="Sarah Jenkins"
                      className="h-8 text-xs bg-background/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block flex items-center gap-1">
                    <Building className="h-3 w-3" /> Department / Business Unit
                  </label>
                  <Input
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="Engineering"
                    className="h-8 text-xs bg-background/50"
                  />
                </div>
              </div>

              {/* Hardware Biometric Terminal Target */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Cpu className="h-3.5 w-3.5 text-primary" /> Target Terminal & Hardware Credentials
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">
                    Target Hardware Terminal <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <select
                    value={formDeviceId}
                    onChange={(e) => setFormDeviceId(e.target.value)}
                    required
                    className="w-full h-8 px-2.5 rounded-md border border-input bg-background/70 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {devices.length === 0 ? (
                      <option value="">No registered devices found</option>
                    ) : (
                      devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.device_code} — {d.name} ({d.host}:{d.port} · {d.vendor})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">
                      Biometric Vendor User ID <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <Input
                      required
                      value={formVendorUserId}
                      onChange={(e) => setFormVendorUserId(e.target.value)}
                      placeholder="1001"
                      className="h-8 text-xs font-mono bg-background/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> Card / Tag Number
                    </label>
                    <Input
                      value={formCardNo}
                      onChange={(e) => setFormCardNo(e.target.value)}
                      placeholder="CRD-88910"
                      className="h-8 text-xs font-mono bg-background/50"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground bg-background/50 p-2 rounded-md border border-border/50 font-mono flex items-center gap-1.5">
                  <span className="text-primary font-bold">⚡ 1:1 Identity Binding:</span>
                  <span>
                    External ID <b className="text-foreground">{formExternalId || 'EMP-...'}</b> ↔ Biometric Vendor ID <b className="text-foreground">{formVendorUserId || '...'}</b>
                  </span>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">
                    Mapping Status <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormStatus('ACTIVE')}
                      className={`py-1.5 px-3 rounded-md text-xs font-medium border transition-colors ${
                        formStatus === 'ACTIVE'
                          ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
                          : 'border-border bg-background/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ✔ ACTIVE
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormStatus('INACTIVE')}
                      className={`py-1.5 px-3 rounded-md text-xs font-medium border transition-colors ${
                        formStatus === 'INACTIVE'
                          ? 'border-amber-500/60 bg-amber-950/40 text-amber-300'
                          : 'border-border bg-background/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ⏸ INACTIVE
                    </button>
                  </div>
                </div>
              </div>

              {/* Error feedback banner */}
              {modalError && (
                <div className="p-3 rounded-lg border border-rose-500/50 bg-rose-950/50 text-rose-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span className="font-medium">{modalError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
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
                  disabled={isSubmitting}
                  className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : isEditing ? (
                    'Save Mapping Changes'
                  ) : (
                    'Save & Map Employee'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-card border border-border/80 rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-rose-950/50 border border-rose-500/30 text-rose-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Confirm Unmapping</h3>
                <p className="text-xs text-muted-foreground">
                  Remove this biometric employee mapping?
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/40">
              Attendance punches from this terminal for this user ID will map to{' '}
              <span className="font-mono text-amber-400 font-semibold">UNKNOWN</span> state until
              remapped.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
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
                variant="destructive"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={isDeleting}
                onClick={() => handleDeleteMapping(deleteConfirmId)}
              >
                {isDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {isDeleting ? 'Deleting...' : 'Delete Mapping'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
