'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send,
  Plus,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  Lock,
  Copy,
  Check,
  Eye,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  AlertTriangle,
  KeyRound,
  Info,
  ChevronDown,
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

/** Small ⓘ icon that reveals a description on hover/focus (no dependency). */
function InfoTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  return (
    <span className="group relative inline-flex align-middle">
      <Info
        className="h-3.5 w-3.5 text-muted-foreground hover:text-primary cursor-help"
        tabIndex={0}
      />
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-1.5 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] font-normal leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        {text}
      </span>
    </span>
  );
}

/** Field label with an inline ⓘ tooltip. */
function LabelWithInfo({
  label,
  info,
  className,
  align = 'left',
}: {
  label: string;
  info: string;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <label
      className={`${className ?? 'text-xs font-semibold text-foreground'} mb-1 flex items-center gap-1`}
    >
      {label}
      <InfoTip text={info} align={align} />
    </label>
  );
}

interface IntegrationItem {
  id: number;
  name: string;
  targetType: string;
  endpointUrl: string;
  authType: string;
  status: string;
  eventTypes: string[];
  todayCount: number;
  todaySuccess: number;
  successRate: number;
  avgLatencyMs: number;
}

interface Stats {
  backlog: number;
  deliveries24h: number;
  successRate: number;
  avgLatencyMs: number;
  activeEndpoints: number;
}

interface IntegrationDetail {
  id: number;
  name: string;
  targetType: string;
  endpointUrl: string;
  tenantId?: string | null;
  organizationId?: string | null;
  authType: string;
  status: string;
  retryLimit: number;
  timeoutMs: number;
  eventTypes: string[];
  filterRules: Record<string, unknown> | null;
  signing: {
    mode: 'HMAC' | 'ASYMMETRIC' | 'NONE';
    algorithm: string;
    signingKey: string | null;
    publicKeyPem: string | null;
    publicKeyBase64: string | null;
    signatureHeader: string;
    timestampHeader: string;
    signedContent: string;
    exampleSignature: string | null;
  };
  exampleHeaders: Record<string, string>;
  exampleBody: string;
  verifySnippet: string;
}

interface TestResult {
  id: number;
  success: boolean;
  httpStatus: number | null;
  latencyMs: number;
  error?: string | null;
  signature?: string;
}

function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-border hover:bg-muted/50 transition-colors ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

/**
 * Right-side slide-over drawer: scrim-to-dismiss, Escape to close, body scroll
 * lock while open. The panel is a flex column so callers can place a scrollable
 * body and a sticky footer inside `children`.
 */
function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  width = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  width?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  const w = width === 'xl' ? 'max-w-2xl' : width === 'lg' ? 'max-w-lg' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative h-full w-full ${w} bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right-[100%] duration-300 ease-out`}
      >
        <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">{title}</h2>
              {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 min-h-0 flex-col">{children}</div>
      </div>
    </div>
  );
}

/**
 * Chip-summary dropdown multi-select for device codes. Works on a comma-separated
 * string value so the surrounding form/edit logic stays unchanged (the backend
 * splits the CSV into an array and the dispatcher matches string|array alike).
 */
function DeviceMultiSelect({
  devices,
  value,
  onChange,
}: {
  devices: Array<{ code: string; name: string }>;
  value: string;
  onChange: (csv: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const setSelected = (codes: string[]) => onChange(codes.join(','));
  const toggle = (code: string) =>
    setSelected(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const unknownSelected = selected.filter((c) => !devices.some((d) => d.code === c));

  const q = query.trim().toLowerCase();
  const shown = q
    ? devices.filter((d) => d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
    : devices;
  // Select-all targets the currently shown (filtered) devices, merged with the
  // existing selection so a filtered "select" never drops other picks.
  const selectAllShown = () =>
    setSelected(Array.from(new Set([...selected, ...shown.map((d) => d.code)])));

  // Flip the panel upward when there isn't enough room below (e.g. the field is
  // near the bottom of the side drawer) so the list is never clipped.
  const openMenu = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setDropUp(window.innerHeight - r.bottom < 320);
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={openMenu}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full min-h-9 px-2 py-1 rounded-md border border-border bg-background text-sm flex items-center gap-1.5"
      >
        <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0 text-left">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">All devices</span>
          ) : (
            <>
              {selected.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-mono"
                >
                  {c}
                  <X
                    className="h-2.5 w-2.5 cursor-pointer hover:text-rose-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(c);
                    }}
                  />
                </span>
              ))}
              {selected.length > 3 && (
                <span className="text-[11px] text-muted-foreground">
                  +{selected.length - 3} more
                </span>
              )}
            </>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div
          className={`absolute z-50 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {/* Search */}
          <div className="p-1.5 border-b border-border">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search devices…"
              className="w-full h-7 px-2 rounded border border-input bg-background text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border text-[10px] text-muted-foreground">
            <span>
              {selected.length} selected{q ? ` · ${shown.length} shown` : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="hover:text-foreground font-medium"
                onClick={selectAllShown}
              >
                {q ? 'Select shown' : 'Select all'}
              </button>
              <button
                type="button"
                className="hover:text-foreground font-medium"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {devices.length === 0 && unknownSelected.length === 0 ? (
              <div className="p-2 text-[11px] text-muted-foreground">No devices registered.</div>
            ) : shown.length === 0 &&
              unknownSelected.filter((c) => c.toLowerCase().includes(q)).length === 0 ? (
              <div className="p-2 text-[11px] text-muted-foreground">
                No devices match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <>
                {unknownSelected
                  .filter((c) => !q || c.toLowerCase().includes(q))
                  .map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggle(c)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-accent text-left"
                    >
                      <span className="h-3.5 w-3.5 rounded border bg-primary border-primary text-primary-foreground flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span className="font-mono text-foreground">{c}</span>
                      <span className="text-muted-foreground">(not in fleet)</span>
                    </button>
                  ))}
                {shown.map((d) => {
                  const on = selected.includes(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => toggle(d.code)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-accent text-left"
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                          on ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                        }`}
                      >
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="font-mono text-foreground">{d.code}</span>
                      {d.name && <span className="text-muted-foreground truncate">{d.name}</span>}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  name: '',
  endpointUrl: '',
  organizationId: '',
  tenantId: '',
  authType: 'HMAC_SHA256',
  deviceCode: '',
};

type FormState = typeof EMPTY_FORM;

export default function IntegrationsPage() {
  const [items, setItems] = useState<IntegrationItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Transient success/error toast (top-right).
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const [detail, setDetail] = useState<IntegrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Registered tenants/organizations for the webhook dropdowns.
  const [tenants, setTenants] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [orgs, setOrgs] = useState<
    Array<{ id: number; code: string; name: string; tenantId: number | null }>
  >([]);
  const [devices, setDevices] = useState<Array<{ code: string; name: string }>>([]);

  const loadRegistry = useCallback(async () => {
    try {
      const [tRes, oRes, dRes] = await Promise.all([
        fetch('/api/tenants', { cache: 'no-store' }),
        fetch('/api/organizations', { cache: 'no-store' }),
        fetch('/api/devices', { cache: 'no-store' }),
      ]);
      if (tRes.ok) setTenants(await tRes.json());
      if (oRes.ok) setOrgs(await oRes.json());
      if (dRes.ok) {
        const list = (await dRes.json()) as unknown;
        if (Array.isArray(list)) {
          setDevices(
            list
              .map((d) => {
                const row = d as { device_code?: string; deviceCode?: string; name?: string };
                return { code: row.device_code || row.deviceCode || '', name: row.name || '' };
              })
              .filter((x) => x.code),
          );
        }
      }
    } catch {
      /* keep previous */
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch('/api/integrations', { cache: 'no-store' }),
        fetch('/api/integrations/stats', { cache: 'no-store' }),
      ]);
      const list = (await listRes.json()) as unknown;
      const st = (await statsRes.json()) as unknown;
      if (Array.isArray(list)) setItems(list as IntegrationItem[]);
      if (st && typeof st === 'object' && 'deliveries24h' in st) setStats(st as Stats);
      void loadRegistry();
    } catch {
      /* keep previous state */
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadRegistry]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/integrations/${id}/test`, { method: 'POST' });
      const data = (await res.json()) as {
        success?: boolean;
        httpStatus?: number | null;
        latencyMs?: number;
        error?: string | null;
        sentRequest?: { headers?: Record<string, string> };
      };
      setTestResult({
        id,
        success: Boolean(data.success),
        httpStatus: data.httpStatus ?? null,
        latencyMs: data.latencyMs ?? 0,
        error: data.error,
        signature: data.sentRequest?.headers?.['X-Attendance-Signature'],
      });
      void fetchAll();
    } catch (err: unknown) {
      setTestResult({
        id,
        success: false,
        httpStatus: null,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Test dispatch failed',
      });
    } finally {
      setTestingId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    void loadRegistry();
    setShowForm(true);
  };

  const openEdit = (
    item: IntegrationItem,
    filterRules: Record<string, unknown> | null,
    tenantId: string | null = null,
    organizationId: string | null = null,
  ) => {
    const asCsv = (v: unknown): string =>
      Array.isArray(v) ? v.join(',') : v === undefined || v === null ? '' : String(v);
    setEditingId(item.id);
    setForm({
      name: item.name,
      endpointUrl: item.endpointUrl,
      organizationId: organizationId ?? '',
      tenantId: tenantId ?? '',
      authType: item.authType,
      deviceCode: asCsv(filterRules?.['deviceCode']),
    });
    setFormError(null);
    setDetail(null);
    void loadRegistry();
    setShowForm(true);
  };

  const handleEditClick = async (item: IntegrationItem) => {
    let filterRules: Record<string, unknown> | null = null;
    let tenantId: string | null = null;
    let organizationId: string | null = null;
    try {
      const res = await fetch(`/api/integrations/${item.id}`, { cache: 'no-store' });
      const d = (await res.json()) as IntegrationDetail;
      filterRules = d.filterRules ?? null;
      tenantId = d.tenantId ?? null;
      organizationId = d.organizationId ?? null;
    } catch {
      /* fall back to no filters */
    }
    openEdit(item, filterRules, tenantId, organizationId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/.+/i.test(form.endpointUrl.trim())) {
      setFormError('Endpoint URL must be a valid http(s) URL.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/integrations/${editingId}` : '/api/integrations';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, endpointUrl: form.endpointUrl.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string; message?: string };
        setFormError(d.error || d.message || 'Failed to save subscription');
        return;
      }
      const wasEdit = !!editingId;
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      showToast(
        wasEdit
          ? 'Webhook subscription updated successfully'
          : 'Webhook subscription registered successfully',
      );
      void fetchAll();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save subscription');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setRevealKey(false);
    setDetail(null);
    try {
      const res = await fetch(`/api/integrations/${id}`, { cache: 'no-store' });
      const data = (await res.json()) as IntegrationDetail;
      setDetail(data);
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: number, name?: string) => {
    if (
      !window.confirm(
        `Delete webhook subscription${name ? ` "${name}"` : ''}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
      setDetail(null);
      void fetchAll();
      showToast(
        res.ok ? 'Webhook subscription deleted' : 'Failed to delete subscription',
        res.ok ? 'success' : 'error',
      );
    } catch {
      showToast('Failed to delete subscription', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const fmtPct = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium border animate-in slide-in-from-top-4 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.text}</span>
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
            Real-time, per-company punch delivery via the transactional outbox — HMAC-SHA256 or
            Ed25519 signing, exponential backoff, and DLQ routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="font-semibold"
            onClick={() => void fetchAll()}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Can perm="integrations.create">
            <Button size="sm" className="font-semibold shadow-xs" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Register Subscription
            </Button>
          </Can>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-start gap-2 animate-in slide-in-from-top-2 ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <div className="font-semibold">
              {testResult.success
                ? `Test webhook delivered — HTTP ${testResult.httpStatus} in ${testResult.latencyMs}ms`
                : `Test webhook failed${testResult.httpStatus ? ` — HTTP ${testResult.httpStatus}` : ''} (${testResult.latencyMs}ms)`}
            </div>
            {testResult.signature && (
              <div className="font-mono text-[10px] opacity-80 break-all">
                X-Attendance-Signature: {testResult.signature}
              </div>
            )}
            {!testResult.success && testResult.error && (
              <div className="font-mono text-[10px] opacity-80 break-all">{testResult.error}</div>
            )}
          </div>
          <button
            className="ml-auto opacity-60 hover:opacity-100"
            onClick={() => setTestResult(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Metrics Row — compact, real outbox telemetry */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          title="Outbox State"
          value={stats ? `${stats.backlog}` : '—'}
          delta={stats ? (stats.backlog === 0 ? 'published' : 'pending') : undefined}
          deltaType={stats && stats.backlog === 0 ? 'positive' : 'neutral'}
          hint="backlog pending"
          icon={Send}
        />
        <StatTile
          title="Deliveries (24h)"
          value={stats ? stats.deliveries24h.toLocaleString() : '—'}
          delta={
            stats
              ? `${stats.activeEndpoints} endpoint${stats.activeEndpoints === 1 ? '' : 's'}`
              : undefined
          }
          deltaType="neutral"
          hint="signed dispatches"
          icon={Sparkles}
        />
        <StatTile
          title="Success Rate"
          value={stats ? fmtPct(stats.successRate) : '—'}
          delta={stats ? (stats.successRate >= 99 ? 'healthy' : 'degraded') : undefined}
          deltaType={stats && stats.successRate >= 99 ? 'positive' : 'negative'}
          hint="5xx / 429 retried"
          icon={CheckCircle2}
        />
        <StatTile
          title="Avg Latency"
          value={stats ? `${stats.avgLatencyMs}ms` : '—'}
          delta={stats ? (stats.avgLatencyMs < 100 ? 'sub-100ms' : 'nominal') : undefined}
          deltaType="positive"
          hint="dispatcher pool"
          icon={Clock}
        />
      </div>

      {/* Table */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Registered Subscriptions & Webhooks
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configured webhooks receive canonical normalized attendance events via HTTPS with
                signing.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {items.length} Active Endpoints
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
                <TableHead className="font-semibold">Auth &amp; Signing</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Today / Success</TableHead>
                <TableHead className="font-semibold">Avg Latency</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    Loading integrations…
                  </TableCell>
                </TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    No webhook subscriptions yet. Click <strong>Register Subscription</strong> to
                    add one.
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="border-border/40 hover:bg-muted/30 transition-colors text-sm"
                >
                  <TableCell className="py-3 font-semibold text-foreground">{item.name}</TableCell>
                  <TableCell className="py-3">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {item.targetType}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {item.endpointUrl}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 text-[10px] font-semibold gap-1"
                    >
                      <Lock className="w-2.5 h-2.5" />
                      {item.authType}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${
                        item.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-xs">
                    <span className="font-semibold text-foreground">
                      {item.todayCount.toLocaleString()}
                    </span>{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                      ({fmtPct(item.successRate)})
                    </span>
                  </TableCell>
                  <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                    {item.avgLatencyMs}ms
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs font-medium"
                        onClick={() => void openDetail(item.id)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs font-medium"
                        disabled={testingId === item.id}
                        onClick={() => void handleTest(item.id)}
                      >
                        <Zap
                          className={`h-3 w-3 mr-1 ${testingId === item.id ? 'animate-pulse' : ''}`}
                        />
                        {testingId === item.id ? 'Dispatching…' : 'Test'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs font-medium"
                        title="Edit"
                        onClick={() => void handleEditClick(item)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs font-medium text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                        title="Delete"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDelete(item.id, item.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Subscription drawer */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Edit Webhook Subscription' : 'Register Webhook Subscription'}
        subtitle="Delivers signed, normalized attendance punches to this company's endpoint in real time."
        icon={Send}
        width="md"
      >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <div>
              <LabelWithInfo
                label="Integration Name *"
                info="A label for your own reference — identifies this webhook in the list. Not sent to the receiver."
              />
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Workday HRMS Primary Webhook"
              />
            </div>
            <div>
              <LabelWithInfo
                label="Endpoint URL *"
                info="The receiver's HTTPS URL where each signed punch is POSTed in real time. For the HRMS receiver this is .../api/v1/integrations/attendance/webhook. Must be reachable from this server."
              />
              <Input
                required
                value={form.endpointUrl}
                onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                placeholder="https://hrms.example.com/api/attendance/events"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Tenant — selecting one filters the Organization list below it. */}
              <div>
                <LabelWithInfo
                  label="Tenant (optional)"
                  info="Select a registered Tenant. Its code is injected into each delivered payload as tenantId for the receiver to match on. Leave as None to omit tenantId."
                />
                <select
                  value={form.tenantId}
                  onChange={(e) => {
                    const code = e.target.value;
                    const t = tenants.find((x) => x.code === code);
                    const keepOrg =
                      !form.organizationId ||
                      !t ||
                      orgs.some((o) => o.code === form.organizationId && o.tenantId === t.id);
                    setForm({
                      ...form,
                      tenantId: code,
                      organizationId: keepOrg ? form.organizationId : '',
                    });
                  }}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">— None —</option>
                  {form.tenantId && !tenants.some((t) => t.code === form.tenantId) && (
                    <option value={form.tenantId}>{form.tenantId} (unregistered)</option>
                  )}
                  {tenants.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
                {tenants.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    No tenants yet.{' '}
                    <a href="/organizations" className="underline">
                      Register one
                    </a>
                    .
                  </p>
                )}
              </div>
              {/* Organization — filtered to the selected Tenant's organizations. */}
              <div>
                <LabelWithInfo
                  label="Organization (optional)"
                  align="right"
                  info="Select a registered Organization. Its code is injected as organizationId. Leave as Event organization to send the punch's own org. Filtered by the selected Tenant."
                />
                {(() => {
                  const selTenant = tenants.find((x) => x.code === form.tenantId);
                  const availableOrgs = selTenant
                    ? orgs.filter((o) => o.tenantId === selTenant.id)
                    : orgs;
                  const hasUnregisteredOrg =
                    !!form.organizationId && !orgs.some((o) => o.code === form.organizationId);
                  return (
                    <>
                      <select
                        value={form.organizationId}
                        onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                        className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                      >
                        <option value="">— Event organization —</option>
                        {hasUnregisteredOrg && (
                          <option value={form.organizationId}>
                            {form.organizationId} (unregistered)
                          </option>
                        )}
                        {availableOrgs.map((o) => (
                          <option key={o.id} value={o.code}>
                            {o.name} ({o.code})
                          </option>
                        ))}
                      </select>
                      {orgs.length === 0 ? (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                          No organizations yet.{' '}
                          <a href="/organizations" className="underline">
                            Register one
                          </a>
                          .
                        </p>
                      ) : selTenant && availableOrgs.length === 0 ? (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                          No organizations under &ldquo;{selTenant.name}&rdquo;.{' '}
                          <a href="/organizations" className="underline">
                            Add one
                          </a>
                          .
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Pick registered records (manage them on the{' '}
              <a href="/organizations" className="underline">
                Organizations &amp; Tenants
              </a>{' '}
              page). Their codes are injected into each delivered payload; the receiver must mirror
              them.
            </p>
            <div>
              <LabelWithInfo
                label="Signing Mode"
                info="How deliveries are signed so the receiver can verify them. HMAC-SHA256 uses a shared secret (shown in Details). Ed25519 signs with a private key the platform keeps; the receiver verifies with the public key (safer — the receiver can't forge events). None sends unsigned (not recommended). Must match what the receiver is configured for."
              />
              <select
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value })}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="HMAC_SHA256">HMAC-SHA256 (shared secret)</option>
                <option value="ED25519">Ed25519 (public / private key)</option>
                <option value="NONE">None</option>
              </select>
            </div>

            {/* Routing filters */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Delivery filter (optional) — leave blank to deliver all of this company&apos;s
                punches
              </p>
              <div>
                <LabelWithInfo
                  label="Device Code(s)"
                  className="text-[11px] font-medium text-foreground"
                  info="Only deliver punches from the selected device(s). Pick one or more registered terminals, or leave empty (All devices) to deliver punches from every device of this company."
                />
                <DeviceMultiSelect
                  devices={devices}
                  value={form.deviceCode}
                  onChange={(csv) => setForm({ ...form, deviceCode: csv })}
                />
              </div>
            </div>
          </div>
          <div className="border-t border-border/60 bg-muted/20 p-3 space-y-2.5 shrink-0">
            {formError && (
              <p className="text-xs text-rose-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {formError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting} className="font-semibold">
                {submitting
                  ? editingId
                    ? 'Saving…'
                    : 'Registering…'
                  : editingId
                    ? 'Save Changes'
                    : 'Register Subscription'}
              </Button>
            </div>
          </div>
        </form>
      </Drawer>

      {/* Detail drawer */}
      <Drawer
        open={!!(detail || detailLoading)}
        onClose={() => {
          setDetail(null);
          setDetailLoading(false);
        }}
        title={detail ? detail.name : 'Loading…'}
        subtitle="Webhook signing keys, headers, and verification."
        icon={Lock}
        width="xl"
      >
        {detailLoading && !detail && (
          <div className="flex-1 flex items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading webhook details…
          </div>
        )}
        {detail && (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
              {/* Endpoint + meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Endpoint URL" value={detail.endpointUrl} mono copy />
                <Field label="Signing Mode" value={detail.signing.algorithm} />
                <Field label="Status" value={detail.status} />
                <Field label="Event Types" value={detail.eventTypes.join(', ')} />
                {detail.filterRules && Object.keys(detail.filterRules).length > 0 && (
                  <Field
                    label="Delivery Filters"
                    value={Object.entries(detail.filterRules)
                      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : String(v)}`)
                      .join(', ')}
                    mono
                  />
                )}
              </div>

              {/* Signing material: HMAC shared secret, Ed25519 public key, or unsigned */}
              {detail.signing.mode === 'HMAC' && detail.signing.signingKey && (
                <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-indigo-500" /> HMAC Signing Key (
                      {detail.signing.algorithm})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRevealKey((v) => !v)}
                        className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted/50"
                      >
                        {revealKey ? 'Hide' : 'Reveal'}
                      </button>
                      <CopyButton value={detail.signing.signingKey} />
                    </div>
                  </div>
                  <code className="block font-mono text-[11px] break-all bg-background/70 rounded px-2 py-1.5">
                    {revealKey
                      ? detail.signing.signingKey
                      : `${detail.signing.signingKey.slice(0, 8)}${'•'.repeat(40)}`}
                  </code>
                  <p className="text-[11px] text-muted-foreground">
                    This is a <strong>shared secret</strong> — configure your receiver with it to
                    verify the <code className="font-mono">{detail.signing.signatureHeader}</code>{' '}
                    header.
                  </p>
                </div>
              )}

              {detail.signing.mode === 'ASYMMETRIC' && detail.signing.publicKeyPem && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-emerald-500" /> Ed25519 Public Key
                    </span>
                    <CopyButton value={detail.signing.publicKeyPem} />
                  </div>
                  <code className="block font-mono text-[10px] whitespace-pre-wrap break-all bg-background/70 rounded px-2 py-1.5">
                    {detail.signing.publicKeyPem}
                  </code>
                  {detail.signing.publicKeyBase64 && (
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[10px] break-all text-muted-foreground">
                        raw: {detail.signing.publicKeyBase64}
                      </code>
                      <CopyButton value={detail.signing.publicKeyBase64} className="scale-90" />
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Safe to store. Verify the{' '}
                    <code className="font-mono">{detail.signing.signatureHeader}</code> header
                    (prefix <code className="font-mono">ed25519=</code>) with this public key. The
                    private key is never stored or exposed.
                  </p>
                </div>
              )}

              {detail.signing.mode === 'NONE' && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Requests to this endpoint are <strong>not signed</strong>. Enable HMAC or
                    Ed25519 to let the receiver verify authenticity.
                  </p>
                </div>
              )}

              {/* Headers */}
              <Block
                title="Request Headers"
                copyValue={Object.entries(detail.exampleHeaders)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              >
                <div className="space-y-1">
                  {Object.entries(detail.exampleHeaders).map(([k, v]) => (
                    <div key={k} className="font-mono text-[11px] break-all">
                      <span className="text-indigo-500">{k}</span>
                      <span className="text-muted-foreground">: {v}</span>
                    </div>
                  ))}
                </div>
              </Block>

              {/* Body */}
              <Block title="Example Request Body" copyValue={detail.exampleBody}>
                <pre className="font-mono text-[11px] whitespace-pre-wrap break-all max-h-56 overflow-y-auto">
                  {detail.exampleBody}
                </pre>
              </Block>

              {/* Verify snippet */}
              <Block
                title="Verify Signature (Node.js)"
                copyValue={detail.verifySnippet}
                subtitle={`Signed content: ${detail.signing.signedContent}`}
              >
                <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-background/70 rounded p-2">
                  {detail.verifySnippet}
                </pre>
              </Block>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 p-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                onClick={() => void handleDelete(detail.id, detail.name)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openEdit(
                      {
                        id: detail.id,
                        name: detail.name,
                        targetType: detail.targetType,
                        endpointUrl: detail.endpointUrl,
                        authType: detail.authType,
                        status: detail.status,
                        eventTypes: detail.eventTypes,
                        todayCount: 0,
                        todaySuccess: 0,
                        successRate: 0,
                        avgLatencyMs: 0,
                      },
                      detail.filterRules,
                      detail.tenantId ?? null,
                      detail.organizationId ?? null,
                    )
                  }
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  className="font-semibold"
                  disabled={testingId === detail.id}
                  onClick={() => void handleTest(detail.id)}
                >
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  {testingId === detail.id ? 'Dispatching…' : 'Send Test Dispatch'}
                </Button>
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-2">
        {label}
        {copy && <CopyButton value={value} className="scale-90" />}
      </div>
      <div className={`text-xs text-foreground break-all ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function Block({
  title,
  subtitle,
  copyValue,
  children,
}: {
  title: string;
  subtitle?: string;
  copyValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <CopyButton value={copyValue} />
      </div>
      {subtitle && <p className="text-[10px] text-muted-foreground font-mono">{subtitle}</p>}
      {children}
    </div>
  );
}
