'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Link2,
  Search,
  Plus,
  FileSpreadsheet,
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
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Can } from '@/components/can';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatTile } from '@/components/stat-tile';
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

// Organization registry option used to populate the Department / Business Unit
// selector (an org IS the business unit). Shape mirrors the API's OrganizationView.
interface OrgOption {
  id: number;
  code: string;
  name: string;
  tenantId: number | null;
  tenantName: string | null;
  parentId: number | null;
}

interface MappingItem {
  id: string;
  externalEmployeeId: string;
  employeeName: string;
  department: string;
  organizationId: number;
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

/**
 * One credential the employee carries: a Biometric Vendor User ID + optional
 * card, applied to one or more terminals. An employee may hold several of these
 * (e.g. different vendor IDs on different terminals). Each (terminal) in a group
 * becomes its own mapping row.
 */
interface CredentialGroup {
  key: string;
  vendorUserId: string;
  cardNo: string;
  deviceIds: number[];
}

let groupSeq = 0;
const makeGroup = (): CredentialGroup => ({
  key: `g${Date.now()}-${groupSeq++}`,
  vendorUserId: '',
  cardNo: '',
  deviceIds: [],
});

export default function MappingsPage() {
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
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

  // Which employee groups are expanded (keyed by external employee id).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Form State
  const [formExternalId, setFormExternalId] = useState('EMP-1001');
  const [formEmployeeName, setFormEmployeeName] = useState('Sarah Jenkins');
  const [formDepartment, setFormDepartment] = useState('Engineering');
  // The selected organization (business unit) id, as a string for the <select>.
  const [formOrganizationId, setFormOrganizationId] = useState<string>('');
  const [formDeviceId, setFormDeviceId] = useState<string>('');
  const [formVendorUserId, setFormVendorUserId] = useState('1001');
  const [formCardNo, setFormCardNo] = useState('CRD-88910');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  // Register mode: one or more credentials, each applied to one or more terminals.
  const [credGroups, setCredGroups] = useState<CredentialGroup[]>([makeGroup()]);

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

  // Fetch the organization registry (tenants + org tree) for the
  // Department / Business Unit selector.
  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations', { cache: 'no-store' });
      if (res.ok) {
        const list = (await res.json()) as OrgOption[];
        if (Array.isArray(list)) setOrgs(list);
      }
    } catch {
      // non-fatal: the field simply falls back to any existing value
    }
  }, []);

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
              organizationId: m.organization_id,
              deviceId: m.device_id,
              deviceCode: m.device_code || `DEV-${m.device_id}`,
              deviceName: m.device_name || 'Biometric Terminal',
              vendor: (m.vendor || 'HIKVISION').toUpperCase(),
              vendorUserId: m.vendor_user_id,
              cardNo: meta.cardNo || undefined,
              status: (m.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
              syncedAt: m.updated_at ? new Date(m.updated_at).toLocaleDateString() : 'Recent',
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
    fetchOrgs();
  }, [fetchMappings, fetchDevices, fetchOrgs]);

  // Drawer UX: Escape closes it and the body scroll is locked while open.
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isModalOpen]);

  // Open modal for new mapping
  const handleOpenCreate = () => {
    setIsEditing(false);
    setEditingMappingId(null);
    setFormExternalId('EMP-1001');
    setFormEmployeeName('Sarah Jenkins');
    setFormDepartment('');
    setFormOrganizationId('');
    setFormVendorUserId('1001');
    setFormCardNo('CRD-88910');
    setFormStatus('ACTIVE');
    if (devices.length > 0 && devices[0]) {
      setFormDeviceId(String(devices[0].id));
    }
    // Start with a single empty credential — no terminal pre-selected.
    setCredGroups([makeGroup()]);
    setModalError(null);
    setIsModalOpen(true);
  };

  // ---- Credential-group editors (register mode) ----
  const updateGroup = (key: string, patch: Partial<CredentialGroup>) =>
    setCredGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const addGroup = () => setCredGroups((gs) => [...gs, makeGroup()]);
  const removeGroup = (key: string) =>
    setCredGroups((gs) => (gs.length > 1 ? gs.filter((g) => g.key !== key) : gs));
  const toggleGroupDevice = (key: string, id: number) =>
    setCredGroups((gs) =>
      gs.map((g) =>
        g.key === key
          ? {
              ...g,
              deviceIds: g.deviceIds.includes(id)
                ? g.deviceIds.filter((d) => d !== id)
                : [...g.deviceIds, id],
            }
          : g,
      ),
    );
  const totalMappingsToCreate = credGroups.reduce((n, g) => n + g.deviceIds.length, 0);

  // Open modal for editing existing mapping
  const handleOpenEdit = (m: MappingItem) => {
    setIsEditing(true);
    setEditingMappingId(m.id);
    setFormExternalId(m.externalEmployeeId);
    setFormEmployeeName(m.employeeName);
    setFormDepartment(m.department);
    setFormOrganizationId(m.organizationId ? String(m.organizationId) : '');
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
    setFormOrganizationId(m.organizationId ? String(m.organizationId) : '');
    setFormVendorUserId(m.vendorUserId);
    setFormCardNo(m.cardNo || '');
    setFormStatus('ACTIVE');
    // Pre-fill one credential (same vendor id + card); let the user pick which
    // additional terminal(s) to add it to.
    const otherDev = devices.find((d) => d.id !== m.deviceId);
    setCredGroups([
      {
        ...makeGroup(),
        vendorUserId: m.vendorUserId,
        cardNo: m.cardNo || '',
        deviceIds: otherDev ? [otherDev.id] : [m.deviceId],
      },
    ]);
    setModalError(null);
    setIsModalOpen(true);
    showToast(`📋 Copied credential for [${m.employeeName}] — pick terminal(s)`);
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

  // Activate / deactivate every terminal mapping for one employee at once.
  const handleSetGroupStatus = async (items: MappingItem[], nextStatus: 'ACTIVE' | 'INACTIVE') => {
    const targets = items.filter((i) => i.status !== nextStatus);
    if (targets.length === 0) return;
    const ids = new Set(targets.map((i) => i.id));
    try {
      const results = await Promise.all(
        targets.map((it) =>
          fetch(`/api/mappings/${it.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus }),
          }).then((r) => r.ok),
        ),
      );
      const ok = results.filter(Boolean).length;
      setMappings((prev) =>
        prev.map((item) => (ids.has(item.id) ? { ...item, status: nextStatus } : item)),
      );
      if (ok === targets.length) {
        showToast(`${ok} terminal(s) set ${nextStatus}`);
      } else {
        showToast(`${ok}/${targets.length} updated — some failed`, 'error');
        await fetchMappings();
      }
    } catch {
      showToast('Error updating mappings', 'error');
      await fetchMappings();
    }
  };

  // Submit form (Create or Update)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formExternalId.trim()) {
      setModalError('HRMS External ID is required.');
      return;
    }

    // The chosen organization (business unit). Its id binds the mapping to the
    // org; its name is also stored as the human-readable department label.
    const selectedOrg = orgs.find((o) => String(o.id) === formOrganizationId);
    const departmentLabel = selectedOrg ? selectedOrg.name : formDepartment.trim();

    // ---------- EDIT: a single existing mapping row (unchanged behavior) ----------
    if (isEditing && editingMappingId) {
      const numericDeviceId = parseInt(formDeviceId, 10);
      if (isNaN(numericDeviceId)) {
        setModalError('Please select a valid target terminal');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/mappings/${editingMappingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalEmployeeId: formExternalId.trim(),
            employeeName: formEmployeeName.trim(),
            department: departmentLabel || undefined,
            organizationId: formOrganizationId ? Number(formOrganizationId) : undefined,
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
          showToast(`✔ Mapping for [${formExternalId}] updated successfully!`);
        } else {
          const errorMsg = result?.error?.message || result?.message || 'Failed to update mapping';
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
      return;
    }

    // ---------- REGISTER: one or more credentials × one or more terminals ----------
    if (credGroups.some((g) => !g.vendorUserId.trim())) {
      setModalError('Each credential needs a Biometric Vendor User ID.');
      return;
    }
    if (credGroups.some((g) => g.deviceIds.length === 0)) {
      setModalError('Select at least one terminal for each credential.');
      return;
    }

    // Expand to one mapping row per (credential × terminal).
    const rows = credGroups.flatMap((g) =>
      g.deviceIds.map((deviceId) => ({
        externalEmployeeId: formExternalId.trim(),
        employeeName: formEmployeeName.trim() || undefined,
        organizationId: formOrganizationId ? Number(formOrganizationId) : undefined,
        vendorUserId: g.vendorUserId.trim(),
        cardNo: g.cardNo.trim() || undefined,
        deviceId,
        status: formStatus,
      })),
    );

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/mappings/bulk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const result = await res.json();
      if (res.ok) {
        await fetchMappings();
        const s = result?.summary ?? {};
        const saved = (s.imported ?? 0) + (s.updated ?? 0);
        const notSaved = (s.skipped ?? 0) + (s.failed ?? 0);
        if (notSaved > 0) {
          const firstBad = (result?.results ?? []).find(
            (r: { status: string; message: string }) =>
              r.status === 'skipped' || r.status === 'failed',
          );
          setModalError(
            `${saved} mapping(s) saved, ${notSaved} skipped${firstBad ? `: ${firstBad.message}` : ''}`,
          );
          showToast(`Saved ${saved}, ${notSaved} skipped`, 'error');
        } else {
          setIsModalOpen(false);
          showToast(`✔ ${saved} mapping(s) created for [${formExternalId}]`);
        }
      } else {
        const errorMsg = result?.error?.message || result?.message || 'Failed to save mappings';
        setModalError(errorMsg);
        showToast(`❌ ${errorMsg}`, 'error');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Network error saving mappings';
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

  // Group the (filtered) mappings by employee so one person with N terminals is
  // a single expandable row instead of N flat rows.
  interface EmployeeGroup {
    externalEmployeeId: string;
    employeeName: string;
    department: string;
    organizationId: number;
    items: MappingItem[];
    vendorUserIds: string[];
    vendors: string[];
    cards: string[];
    activeCount: number;
  }
  const groups: EmployeeGroup[] = (() => {
    const byEmp = new Map<string, MappingItem[]>();
    for (const m of filtered) {
      const arr = byEmp.get(m.externalEmployeeId) ?? [];
      arr.push(m);
      byEmp.set(m.externalEmployeeId, arr);
    }
    return [...byEmp.entries()]
      .map(([externalEmployeeId, items]) => {
        const first = items[0]!;
        return {
          externalEmployeeId,
          employeeName: first.employeeName,
          department: first.department,
          organizationId: first.organizationId,
          items: [...items].sort((a, b) => a.deviceCode.localeCompare(b.deviceCode)),
          vendorUserIds: [...new Set(items.map((i) => i.vendorUserId))],
          vendors: [...new Set(items.map((i) => i.vendor))],
          cards: [...new Set(items.map((i) => i.cardNo).filter(Boolean) as string[])],
          activeCount: items.filter((i) => i.status === 'ACTIVE').length,
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  })();

  // While searching, expand everything so matching terminals are visible.
  const searching = searchTerm.trim() !== '';
  const isExpanded = (id: string) => searching || expandedIds.has(id);
  const allExpanded =
    groups.length > 0 && groups.every((g) => expandedIds.has(g.externalEmployeeId));
  const expandAll = () => setExpandedIds(new Set(groups.map((g) => g.externalEmployeeId)));
  const collapseAll = () => setExpandedIds(new Set());

  // ---- Department / Business Unit options (from the organization registry) ----
  // Depth of each org in the tree (for indentation), grouped under its tenant.
  const orgById = new Map(orgs.map((o) => [o.id, o] as const));
  const depthById = new Map<number, number>();
  for (const o of orgs) {
    let depth = 0;
    let cursor: OrgOption | undefined = o;
    const seen = new Set<number>();
    while (
      cursor &&
      cursor.parentId != null &&
      orgById.has(cursor.parentId) &&
      !seen.has(cursor.id)
    ) {
      seen.add(cursor.id);
      cursor = orgById.get(cursor.parentId);
      depth += 1;
    }
    depthById.set(o.id, depth);
  }
  const deptGroups: [string, OrgOption[]][] = (() => {
    const grouped = new Map<string, OrgOption[]>();
    for (const o of orgs) {
      const key = o.tenantName || 'Unassigned';
      const arr = grouped.get(key) ?? [];
      arr.push(o);
      grouped.set(key, arr);
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    // Real tenants first (alphabetical), "Unassigned" last.
    return [...grouped.entries()].sort((a, b) => {
      if (a[0] === 'Unassigned') return 1;
      if (b[0] === 'Unassigned') return -1;
      return a[0].localeCompare(b[0]);
    });
  })();

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
            <Badge
              variant="outline"
              className="text-xs font-semibold px-2 py-0.5 bg-muted/60 text-muted-foreground"
            >
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
            Resolves canonical HRMS employee external IDs against hardware terminal biometric IDs
            with one-to-one precision per physical device.
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

          <Can perm="mappings.create">
            <Button variant="outline" size="sm" className="font-medium" asChild>
              <Link href="/mappings/import">
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                Bulk Import
              </Link>
            </Button>
          </Can>

          <Can perm="mappings.create">
            <Button size="sm" className="font-semibold shadow-xs" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Map Employee
            </Button>
          </Can>
        </div>
      </div>

      {/* Metrics Summary Row — compact, real identity-resolution telemetry */}
      {(() => {
        const total = mappings.length;
        const active = mappings.filter((m) => m.status === 'ACTIVE').length;
        const ratio = total > 0 ? Math.round((active / total) * 100) : 100;
        const mappedDevices = new Set(mappings.map((m) => m.deviceCode).filter(Boolean)).size;
        const vendors = [
          ...new Set(devices.map((d) => (d.vendor || '').toUpperCase()).filter(Boolean)),
        ];
        const vendorLabel = vendors.map((v) => v.charAt(0) + v.slice(1).toLowerCase()).join(', ');
        return (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              title="Total Mappings"
              value={`${total}`}
              delta={`${active} active`}
              deltaType="positive"
              hint="employee ↔ device"
              icon={Link2}
            />
            <StatTile
              title="Resolution Ratio"
              value={`${ratio}%`}
              delta={ratio === 100 ? 'resolved' : 'partial'}
              deltaType={ratio === 100 ? 'positive' : 'neutral'}
              hint="active / total"
              icon={CheckCircle2}
            />
            <StatTile
              title="Hardware Coverage"
              value={`${devices.length}`}
              delta={mappedDevices > 0 ? `${mappedDevices} mapped` : undefined}
              deltaType="neutral"
              hint={vendorLabel || 'devices'}
              icon={Cpu}
            />
          </div>
        );
      })()}

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
              {['ALL', 'HIKVISION', 'ZKTECO', 'SUPREMA', 'ANVIZ'].map((v) => (
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
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Active Device Employee Mappings</CardTitle>
            <div className="flex items-center gap-2">
              {groups.length > 0 && !searching && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={allExpanded ? collapseAll : expandAll}
                >
                  {allExpanded ? (
                    <>
                      <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
                    </>
                  ) : (
                    <>
                      <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
                    </>
                  )}
                </Button>
              )}
              <Badge variant="outline" className="text-[10px] font-mono">
                {groups.length} employee{groups.length === 1 ? '' : 's'} · {filtered.length}{' '}
                terminal
                {filtered.length === 1 ? '' : 's'}
              </Badge>
            </div>
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
                  Click &ldquo;Map Employee&rdquo; to bind an HRMS employee ID to a physical
                  biometric terminal user ID.
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
                  <TableHead className="w-8" />
                  <TableHead className="text-xs font-semibold">HRMS Employee</TableHead>
                  <TableHead className="text-xs font-semibold">External ID</TableHead>
                  <TableHead className="text-xs font-semibold">Terminal &amp; Vendor</TableHead>
                  <TableHead className="text-xs font-semibold">Biometric Vendor ID</TableHead>
                  <TableHead className="text-xs font-semibold">Card / Tag</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const open = isExpanded(group.externalEmployeeId);
                  const multi = group.items.length > 1;
                  const allActive = group.activeCount === group.items.length;
                  return (
                    <React.Fragment key={group.externalEmployeeId}>
                      {/* ---- Employee (parent) row ---- */}
                      <TableRow
                        className="border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(group.externalEmployeeId)}
                      >
                        <TableCell className="py-2.5 pl-3">
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              open ? 'rotate-90' : ''
                            }`}
                          />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="text-xs font-semibold text-foreground">
                            {group.employeeName}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {group.department}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-primary font-semibold">
                          {group.externalEmployeeId}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {multi ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant="outline"
                                className="text-[10px] gap-1 border-primary/30 text-primary"
                              >
                                <Cpu className="h-3 w-3" /> {group.items.length} terminals
                              </Badge>
                              {group.vendors.slice(0, 3).map((v) => (
                                <Badge key={v} variant="secondary" className="text-[9px] font-mono">
                                  {v}
                                </Badge>
                              ))}
                              {group.vendors.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{group.vendors.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px] font-mono">
                                {group.items[0]!.vendor}
                              </Badge>
                              <span className="text-xs font-medium text-foreground">
                                {group.items[0]!.deviceCode}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell
                          className="py-2.5 font-mono text-xs text-foreground font-medium"
                          title={group.vendorUserIds.join(', ')}
                        >
                          {group.vendorUserIds.length === 1
                            ? group.vendorUserIds[0]
                            : `${group.vendorUserIds.length} IDs`}
                        </TableCell>
                        <TableCell
                          className="py-2.5 font-mono text-xs text-muted-foreground"
                          title={group.cards.join(', ')}
                        >
                          {group.cards.length === 0
                            ? '—'
                            : group.cards.length === 1
                              ? group.cards[0]
                              : `${group.cards.length} cards`}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {allActive ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{' '}
                              {group.activeCount} active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{' '}
                              {group.activeCount}/{group.items.length} active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className="py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                                title="Employee options"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <Can perm="mappings.create">
                                <DropdownMenuItem
                                  className="gap-2.5 font-medium cursor-pointer"
                                  onClick={() => handleDuplicate(group.items[0]!)}
                                >
                                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>Add terminal</span>
                                </DropdownMenuItem>
                              </Can>
                              <DropdownMenuItem
                                className="gap-2.5 font-medium cursor-pointer"
                                onClick={() => {
                                  if (!open) toggleExpand(group.externalEmployeeId);
                                }}
                              >
                                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Show terminals</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2.5 font-medium cursor-pointer"
                                onClick={() => handleSetGroupStatus(group.items, 'ACTIVE')}
                              >
                                <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Activate all</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2.5 font-medium cursor-pointer"
                                onClick={() => handleSetGroupStatus(group.items, 'INACTIVE')}
                              >
                                <ToggleLeft className="h-3.5 w-3.5 text-amber-400" />
                                <span>Deactivate all</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>

                      {/* ---- Terminal (child) rows ---- */}
                      {open &&
                        group.items.map((m, idx) => (
                          <TableRow
                            key={m.id}
                            className="border-border/30 bg-muted/10 hover:bg-muted/25 transition-colors"
                          >
                            <TableCell className="py-2" />
                            <TableCell className="py-2" colSpan={2}>
                              <div className="flex items-center gap-2 pl-3">
                                <span className="w-3.5 h-3 border-l-2 border-b-2 border-border/50 rounded-bl-md" />
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                  Terminal {idx + 1}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-[10px] font-mono">
                                  {m.vendor}
                                </Badge>
                                <span className="text-xs font-medium text-foreground">
                                  {m.deviceCode}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                {m.deviceName}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 font-mono text-xs text-foreground font-medium">
                              {m.vendorUserId}
                            </TableCell>
                            <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                              {m.cardNo ?? '—'}
                            </TableCell>
                            <TableCell className="py-2">
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
                            <TableCell className="py-2 text-right">
                              <div className="flex items-center justify-end">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                                      title="Terminal options"
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
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Map / Edit Employee Drawer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Scrim — click to dismiss */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />
          {/* Right-side panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              isEditing ? 'Edit biometric identity mapping' : 'Map HRMS employee to terminal'
            }
            className="relative h-full w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right-[100%] duration-300 ease-out"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20 shrink-0">
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
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Form — scrollable body + sticky footer */}
            <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                    <select
                      value={formOrganizationId}
                      onChange={(e) => setFormOrganizationId(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-md border border-input bg-background/70 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">— Select organization / unit —</option>
                      {/* Fallback for a bound org that is not in the current list
                        (e.g. deleted) so editing never silently drops it. */}
                      {formOrganizationId &&
                        !orgs.some((o) => String(o.id) === formOrganizationId) && (
                          <option value={formOrganizationId}>
                            {formDepartment || `Organization #${formOrganizationId}`} (current)
                          </option>
                        )}
                      {deptGroups.map(([tenantName, list]) => (
                        <optgroup key={tenantName} label={tenantName}>
                          {list.map((o) => {
                            const depth = depthById.get(o.id) ?? 0;
                            return (
                              <option key={o.id} value={String(o.id)}>
                                {`${'  '.repeat(depth)}${depth > 0 ? '└ ' : ''}${o.name} (${o.code})`}
                              </option>
                            );
                          })}
                        </optgroup>
                      ))}
                    </select>
                    {orgs.length === 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                        No organizations registered yet — add them under Organizations &amp;
                        Tenants.
                      </p>
                    )}
                  </div>
                </div>

                {/* Hardware Biometric Terminal Target */}
                <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Cpu className="h-3.5 w-3.5 text-primary" /> Target Terminal & Hardware
                    Credentials
                  </div>

                  {isEditing ? (
                    /* ---- Edit: a single existing mapping (one terminal, one vendor id) ---- */
                    <>
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-1 block">
                          Target Hardware Terminal{' '}
                          <span className="text-rose-500 font-bold">*</span>
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
                            Biometric Vendor User ID{' '}
                            <span className="text-rose-500 font-bold">*</span>
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
                    </>
                  ) : (
                    /* ---- Register: one or more credentials, each on one or more terminals ---- */
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-muted-foreground">
                          Credentials &amp; Terminals{' '}
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <span className="text-[10px] text-muted-foreground">
                          {totalMappingsToCreate} mapping(s) will be created
                        </span>
                      </div>

                      {credGroups.map((g, gi) => (
                        <div
                          key={g.key}
                          className="rounded-lg border border-border/60 bg-background/40 p-2.5 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-muted-foreground mb-0.5 block">
                                Biometric Vendor User ID <span className="text-rose-500">*</span>
                              </label>
                              <Input
                                value={g.vendorUserId}
                                onChange={(e) =>
                                  updateGroup(g.key, { vendorUserId: e.target.value })
                                }
                                placeholder="1001"
                                className="h-8 text-xs font-mono bg-background/50"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-muted-foreground mb-0.5 block flex items-center gap-1">
                                <CreditCard className="h-3 w-3" /> Card / Tag
                              </label>
                              <Input
                                value={g.cardNo}
                                onChange={(e) => updateGroup(g.key, { cardNo: e.target.value })}
                                placeholder="CRD-88910"
                                className="h-8 text-xs font-mono bg-background/50"
                              />
                            </div>
                            {credGroups.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeGroup(g.key)}
                                title="Remove this credential"
                                className="mt-5 p-1.5 rounded-md text-rose-500 hover:bg-rose-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] text-muted-foreground">
                                Terminals using this vendor ID{' '}
                                <span className="text-rose-500">*</span>
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[10px] text-primary hover:underline"
                                  onClick={() =>
                                    updateGroup(g.key, {
                                      deviceIds: devices
                                        .filter(
                                          (d) =>
                                            !credGroups.some(
                                              (o) => o.key !== g.key && o.deviceIds.includes(d.id),
                                            ),
                                        )
                                        .map((d) => d.id),
                                    })
                                  }
                                >
                                  Select all
                                </button>
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:underline"
                                  onClick={() => updateGroup(g.key, { deviceIds: [] })}
                                >
                                  Deselect all
                                </button>
                              </div>
                            </div>
                            <div className="max-h-28 overflow-auto rounded-md border border-border/50 bg-background/50 divide-y divide-border/40">
                              {devices.length === 0 ? (
                                <div className="p-2 text-[11px] text-muted-foreground">
                                  No registered devices.
                                </div>
                              ) : (
                                devices.map((d) => {
                                  // A terminal can hold the employee under only one
                                  // vendor id, so block picking it in another credential.
                                  const usedElsewhere = credGroups.some(
                                    (other) =>
                                      other.key !== g.key && other.deviceIds.includes(d.id),
                                  );
                                  const checked = g.deviceIds.includes(d.id);
                                  return (
                                    <label
                                      key={d.id}
                                      title={
                                        usedElsewhere
                                          ? 'Already assigned to another credential for this employee'
                                          : undefined
                                      }
                                      className={`flex items-center gap-2 px-2 py-1.5 text-xs ${
                                        usedElsewhere
                                          ? 'opacity-40 cursor-not-allowed'
                                          : 'cursor-pointer hover:bg-muted/40'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={usedElsewhere}
                                        onChange={() => toggleGroupDevice(g.key, d.id)}
                                      />
                                      <span className="font-mono text-[11px] text-foreground">
                                        {d.device_code}
                                      </span>
                                      <span className="text-muted-foreground truncate">
                                        {d.name}
                                      </span>
                                      <Badge
                                        variant="secondary"
                                        className="ml-auto text-[9px] font-mono"
                                      >
                                        {d.vendor}
                                      </Badge>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">
                              Credential {gi + 1} · {g.deviceIds.length} terminal(s) selected
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addGroup}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add another vendor ID / credential
                      </button>

                      <div className="text-[10px] text-muted-foreground bg-background/50 p-2 rounded-md border border-border/50 flex items-start gap-1.5">
                        <span className="text-primary font-bold">⚡</span>
                        <span>
                          One mapping is created per terminal. Use the <b>same Vendor User ID</b>{' '}
                          across several terminals, or <b>add another credential</b> for a different
                          Vendor User ID — no need to re-register the employee each time.
                        </span>
                      </div>
                    </div>
                  )}

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
              </div>

              {/* Sticky footer: error banner + actions (outside the scroll area) */}
              <div className="border-t border-border/60 bg-muted/20 p-3 space-y-3 shrink-0">
                {modalError && (
                  <div className="p-2.5 rounded-lg border border-rose-500/50 bg-rose-950/50 text-rose-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span className="font-medium">{modalError}</span>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
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
                      `Register Employee${totalMappingsToCreate > 0 ? ` (${totalMappingsToCreate})` : ''}`
                    )}
                  </Button>
                </div>
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
