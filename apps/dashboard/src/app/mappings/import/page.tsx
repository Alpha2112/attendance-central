'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileSpreadsheet,
  Columns3,
  Eye,
  Cpu,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  ArrowLeft,
  ArrowRight,
  Trash2,
  RefreshCw,
  Link2,
  ListChecks,
  FileWarning,
  ChevronDown,
  Check,
  X,
  Building2,
  ToggleLeft,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ----------------------------- Types & constants -----------------------------

type Step = 'upload' | 'map' | 'preview' | 'assign' | 'review' | 'import' | 'results';

const STEPS: { key: Step; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'upload', label: 'Upload CSV', icon: Upload },
  { key: 'map', label: 'Map Columns', icon: Columns3 },
  { key: 'preview', label: 'Preview & Validate', icon: Eye },
  { key: 'assign', label: 'Assign Terminal', icon: Cpu },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'import', label: 'Import', icon: RefreshCw },
  { key: 'results', label: 'Results', icon: ListChecks },
];

// System fields the importer understands, with header aliases for auto-detection.
const SYSTEM_FIELDS: {
  key: keyof WizRow;
  label: string;
  required: boolean;
  aliases: string[];
}[] = [
  {
    key: 'externalEmployeeId',
    label: 'Employee ID',
    required: true,
    aliases: ['employeeid', 'empid', 'externalid', 'externalemployeeid', 'hrmsid', 'id'],
  },
  {
    key: 'employeeName',
    label: 'Full Name',
    required: false,
    aliases: ['name', 'fullname', 'employeename'],
  },
  {
    key: 'organizationRef',
    label: 'Organization',
    required: false,
    aliases: [
      'organization',
      'org',
      'organizationid',
      'orgcode',
      'department',
      'businessunit',
      'unit',
    ],
  },
  {
    key: 'vendorUserId',
    label: 'Vendor User ID',
    required: true,
    aliases: [
      'vendoruserid',
      'biometricid',
      'deviceuserid',
      'vendorid',
      'userid',
      'biometricvendoruserid',
    ],
  },
  {
    key: 'cardNo',
    label: 'Card / Tag No.',
    required: false,
    aliases: ['card', 'cardno', 'cardnumber', 'tag', 'badge', 'rfid'],
  },
  {
    key: 'deviceCode',
    label: 'Terminal Code(s)',
    required: false,
    aliases: ['device', 'terminal', 'terminals', 'devicecode', 'devicecodes', 'targetterminal'],
  },
  { key: 'status', label: 'Status', required: false, aliases: ['status', 'active'] },
];

interface WizRow {
  rowId: string;
  externalEmployeeId: string;
  employeeName: string;
  organizationRef: string; // org code or id from CSV, or an org id set via assignment
  vendorUserId: string;
  cardNo: string;
  deviceCode: string; // raw CSV cell (may list several terminals: ; | separated)
  deviceIds: number[]; // the terminal set this employee's vendor id maps to
  unresolvedCodes: string[]; // CSV terminal codes that did not match a device
  status: string;
}

/** Split a CSV terminal cell into individual codes (supports ; | , and whitespace). */
function splitCodes(raw: string): string[] {
  return (raw || '')
    .split(/[;|,\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface DeviceOption {
  id: number;
  device_code: string;
  name: string;
  vendor: string;
  host: string;
  port: number;
}
interface OrgOption {
  id: number;
  code: string;
  name: string;
  tenantName: string | null;
  parentId: number | null;
}

type IssueLevel = 'error' | 'warning';
type RowLevel = 'valid' | 'warning' | 'error';
interface RowIssue {
  field: string;
  level: IssueLevel;
  message: string;
}
interface ValidatedRow {
  rowId?: string;
  level: RowLevel;
  willUpdate: boolean;
  normalized: {
    externalEmployeeId: string;
    employeeName: string | null;
    organizationId: number | null;
    organizationName: string | null;
    vendorUserId: string;
    cardNo: string | null;
    deviceId: number | null;
    deviceName: string | null;
    status: string;
  };
  issues: RowIssue[];
}
interface ValidateResult {
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    willCreate: number;
    willUpdate: number;
  };
  rows: ValidatedRow[];
}
interface ImportRowResult {
  rowId?: string;
  externalEmployeeId: string;
  status: 'imported' | 'updated' | 'skipped' | 'failed';
  message: string;
  mappingId?: number;
}
interface ImportResult {
  summary: { total: number; imported: number; updated: number; skipped: number; failed: number };
  results: ImportRowResult[];
}

// ----------------------------- CSV helpers -----------------------------

/** Minimal RFC-4180-ish CSV parser: quotes, escaped quotes, CRLF, commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\n') pushRow();
    else if (c === '\r') {
      /* ignore; handled by \n */
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ----------------------------- Component -----------------------------

export default function BulkImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Parsed CSV
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  // Column mapping: system field -> csv column index (or -1 = unmapped)
  const [colMap, setColMap] = useState<Record<string, number>>({});
  // Working rows
  const [rows, setRows] = useState<WizRow[]>([]);
  // Global assignment defaults
  const [globalDeviceIds, setGlobalDeviceIds] = useState<number[]>([]);
  const [globalOrgId, setGlobalOrgId] = useState('');
  const [globalStatus, setGlobalStatus] = useState('ACTIVE');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Scope the three bulk actions target: every row, or only ticked rows.
  const [applyScope, setApplyScope] = useState<'all' | 'selected'>('all');
  // If the selection is cleared, fall back to the "all rows" scope.
  useEffect(() => {
    if (applyScope === 'selected' && selected.size === 0) setApplyScope('all');
  }, [applyScope, selected]);
  // Which row's inline terminal picker is open (assign step).
  const [openTermRow, setOpenTermRow] = useState<string | null>(null);
  // Validation + import
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importMeta, setImportMeta] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, o] = await Promise.all([
          fetch('/api/devices', { cache: 'no-store' }),
          fetch('/api/organizations', { cache: 'no-store' }),
        ]);
        if (d.ok) setDevices(await d.json());
        if (o.ok) setOrgs(await o.json());
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const deviceById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const deviceByCode = useMemo(
    () => new Map(devices.map((d) => [d.device_code.toLowerCase(), d])),
    [devices],
  );
  const orgByCode = useMemo(() => new Map(orgs.map((o) => [o.code.toLowerCase(), o])), [orgs]);
  // Resolve a row's org ref (numeric id or org code) to a known org, or undefined.
  const resolveOrgRef = useCallback(
    (ref: string): OrgOption | undefined => {
      if (!ref) return undefined;
      if (/^\d+$/.test(ref)) return orgs.find((o) => String(o.id) === ref);
      return orgByCode.get(ref.toLowerCase());
    },
    [orgs, orgByCode],
  );

  // Aggregate the flat (per-terminal) validation results back to one entry per
  // employee row. A row's level is the worst of its terminals; issues are unioned.
  interface RowAgg {
    level: RowLevel;
    willUpdate: boolean;
    issues: RowIssue[];
    organizationName: string | null;
    terminals: { label: string; level: RowLevel }[];
  }
  const rowAgg = useMemo(() => {
    const m = new Map<string, RowAgg>();
    const rank = { valid: 0, warning: 1, error: 2 } as const;
    validation?.rows.forEach((r) => {
      const base = String(r.rowId ?? '').split('::')[0];
      if (!base) return;
      const cur =
        m.get(base) ??
        ({
          level: 'valid',
          willUpdate: false,
          issues: [],
          organizationName: null,
          terminals: [],
        } as RowAgg);
      if (rank[r.level] > rank[cur.level]) cur.level = r.level;
      cur.willUpdate = cur.willUpdate || r.willUpdate;
      if (!cur.organizationName && r.normalized.organizationName)
        cur.organizationName = r.normalized.organizationName;
      for (const iss of r.issues)
        if (!cur.issues.some((x) => x.field === iss.field && x.message === iss.message))
          cur.issues.push(iss);
      cur.terminals.push({ label: r.normalized.deviceName || '(no terminal)', level: r.level });
      m.set(base, cur);
    });
    return m;
  }, [validation]);

  // -------- Upload + parse --------
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        notify('The CSV needs a header row and at least one data row.', 'error');
        return;
      }
      const hdr = parsed[0]!.map((h) => h.trim());
      const body = parsed.slice(1);
      setFileName(file.name);
      setHeaders(hdr);
      setCsvRows(body);
      // Auto-detect column mapping.
      const auto: Record<string, number> = {};
      for (const f of SYSTEM_FIELDS) {
        const idx = hdr.findIndex((h) => f.aliases.includes(norm(h)) || norm(h) === norm(f.label));
        auto[f.key] = idx;
      }
      setColMap(auto);
      setValidation(null);
      setImportResult(null);
      setStep('map');
    };
    reader.onerror = () => notify('Could not read the file.', 'error');
    reader.readAsText(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = () => {
    const tmplHeaders = [
      'externalEmployeeId',
      'employeeName',
      'organizationId',
      'vendorUserId',
      'cardNo',
      'deviceCode',
      'status',
    ];
    // One terminal, or several separated by ";" (same vendor id on each).
    const twoTerminals = [devices[0]?.device_code, devices[1]?.device_code]
      .filter(Boolean)
      .join(';');
    const sample = [
      [
        'EMP-1001',
        'Sarah Jenkins',
        orgs[0]?.code || 'ORG-TECHIVE',
        '1001',
        'CRD-88910',
        twoTerminals || 'DEV-HQ-ZK01;DEV-HQ-HIK01',
        'ACTIVE',
      ],
      [
        'EMP-1002',
        'John Carter',
        orgs[0]?.code || 'ORG-TECHIVE',
        '1002',
        'CRD-88911',
        devices[0]?.device_code || 'DEV-HQ-ZK01',
        'ACTIVE',
      ],
    ];
    downloadCsv('employee-mapping-template.csv', toCsv(tmplHeaders, sample));
  };

  // -------- Build rows from mapping --------
  const requiredMapped = SYSTEM_FIELDS.filter((f) => f.required).every(
    (f) => (colMap[f.key] ?? -1) >= 0,
  );

  const buildRows = () => {
    const built: WizRow[] = csvRows.map((r, i) => {
      const get = (key: string) => {
        const idx = colMap[key] ?? -1;
        return idx >= 0 ? (r[idx] ?? '').trim() : '';
      };
      const rawTerminals = get('deviceCode');
      const ids: number[] = [];
      const unresolved: string[] = [];
      for (const code of splitCodes(rawTerminals)) {
        const d = deviceByCode.get(code.toLowerCase());
        if (d) {
          if (!ids.includes(d.id)) ids.push(d.id);
        } else unresolved.push(code);
      }
      return {
        rowId: `r${i}`,
        externalEmployeeId: get('externalEmployeeId'),
        employeeName: get('employeeName'),
        organizationRef: get('organizationRef'),
        vendorUserId: get('vendorUserId'),
        cardNo: get('cardNo'),
        deviceCode: rawTerminals,
        deviceIds: ids,
        unresolvedCodes: unresolved,
        status: (get('status') || 'ACTIVE').toUpperCase(),
      };
    });
    setRows(built);
    setSelected(new Set());
    setStep('preview');
    void validate(built);
  };

  // Expand one employee row into the flat (one-terminal) rows the backend
  // validates/imports. Each gets a `${rowId}::i` id so results map back.
  const expandRow = useCallback((r: WizRow) => {
    const base = {
      externalEmployeeId: r.externalEmployeeId || undefined,
      employeeName: r.employeeName || undefined,
      organizationId: r.organizationRef || undefined,
      vendorUserId: r.vendorUserId || undefined,
      cardNo: r.cardNo || undefined,
      status: r.status || undefined,
    };
    const targets: { deviceId?: number; deviceCode?: string }[] = [
      ...r.deviceIds.map((id) => ({ deviceId: id })),
      ...r.unresolvedCodes.map((c) => ({ deviceCode: c })),
    ];
    if (targets.length === 0) targets.push({}); // no terminal -> backend flags "required"
    return targets.map((t, i) => ({ rowId: `${r.rowId}::${i}`, ...base, ...t }));
  }, []);

  // -------- Validation (server-side) --------
  const validate = useCallback(
    async (rowsToCheck: WizRow[]) => {
      setBusy(true);
      try {
        const payload = {
          rows: rowsToCheck.flatMap((r) => expandRow(r)),
          defaults: {
            organizationId: globalOrgId || undefined,
            status: globalStatus || undefined,
          },
        };
        const res = await fetch('/api/mappings/bulk/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          notify(e?.error?.message || e?.message || 'Validation failed', 'error');
          return;
        }
        setValidation(await res.json());
      } catch {
        notify('Could not reach the validation API.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [globalOrgId, globalStatus, expandRow],
  );

  // -------- Row edits --------
  const removeRow = (rowId: string) => {
    const next = rows.filter((r) => r.rowId !== rowId);
    setRows(next);
    void validate(next);
  };
  const toggleSelect = (rowId: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(rowId)) n.delete(rowId);
      else n.add(rowId);
      return n;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.rowId)),
    );
  };

  // Toggle one terminal in a single employee row's set.
  const toggleRowDevice = (rowId: string, id: number) =>
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              deviceIds: r.deviceIds.includes(id)
                ? r.deviceIds.filter((x) => x !== id)
                : [...r.deviceIds, id],
            }
          : r,
      ),
    );
  const toggleGlobalDevice = (id: number) =>
    setGlobalDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // Per-row organization edit (single select). Re-validates because org
  // resolution is checked server-side.
  const setRowOrg = (rowId: string, orgRef: string) => {
    const next = rows.map((r) => (r.rowId === rowId ? { ...r, organizationRef: orgRef } : r));
    setRows(next);
    void validate(next);
  };
  // Per-row ACTIVE/INACTIVE edit (no re-validation needed — both are valid).
  const setRowStatus = (rowId: string, status: string) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, status } : r)));

  const applyGlobalTerminal = (scope: 'all' | 'selected') => {
    if (globalDeviceIds.length === 0) {
      notify('Pick at least one terminal first.', 'error');
      return;
    }
    const next = rows.map((r) =>
      scope === 'all' || selected.has(r.rowId)
        ? { ...r, deviceIds: [...globalDeviceIds], unresolvedCodes: [] }
        : r,
    );
    setRows(next);
    void validate(next);
    notify(
      `${globalDeviceIds.length} terminal(s) assigned to ${scope === 'all' ? 'all' : selected.size} row(s).`,
    );
  };
  const applyGlobalStatus = (scope: 'all' | 'selected') => {
    setRows((prev) =>
      prev.map((r) =>
        scope === 'all' || selected.has(r.rowId) ? { ...r, status: globalStatus } : r,
      ),
    );
    notify(`Status ${globalStatus} applied to ${scope === 'all' ? 'all' : selected.size} row(s).`);
  };
  const applyGlobalOrg = (scope: 'all' | 'selected') => {
    if (!globalOrgId) {
      notify('Pick an organization first.', 'error');
      return;
    }
    const next = rows.map((r) =>
      scope === 'all' || selected.has(r.rowId) ? { ...r, organizationRef: globalOrgId } : r,
    );
    setRows(next);
    void validate(next);
    const name = orgs.find((o) => String(o.id) === globalOrgId)?.name ?? 'Organization';
    notify(`${name} applied to ${scope === 'all' ? 'all' : selected.size} row(s).`);
  };

  // -------- Import --------
  const runImport = async () => {
    setBusy(true);
    setStep('import');
    try {
      const flatRows = rows.flatMap((r) => expandRow(r));
      // Remember which terminal each flat row targeted, for the results report.
      const meta = new Map<string, string>();
      for (const fr of flatRows) {
        const label =
          (fr.deviceId ? deviceById.get(fr.deviceId)?.device_code : fr.deviceCode) ||
          '(no terminal)';
        meta.set(String(fr.rowId), label);
      }
      setImportMeta(meta);
      const payload = {
        rows: flatRows,
        defaults: {
          organizationId: globalOrgId || undefined,
          status: globalStatus || undefined,
        },
      };
      const res = await fetch('/api/mappings/bulk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        notify(e?.error?.message || e?.message || 'Import failed', 'error');
        setStep('review');
        return;
      }
      setImportResult(await res.json());
      setStep('results');
    } catch {
      notify('Could not reach the import API.', 'error');
      setStep('review');
    } finally {
      setBusy(false);
    }
  };

  const downloadFailedRows = () => {
    if (!importResult) return;
    const failed = importResult.results.filter(
      (r) => r.status === 'failed' || r.status === 'skipped',
    );
    const byId = new Map(rows.map((r) => [r.rowId, r]));
    const out = failed.map((f) => {
      const base = String(f.rowId ?? '').split('::')[0];
      const src = base ? byId.get(base) : undefined;
      return [
        src?.externalEmployeeId ?? f.externalEmployeeId,
        src?.employeeName ?? '',
        src?.organizationRef ?? '',
        src?.vendorUserId ?? '',
        src?.cardNo ?? '',
        importMeta.get(String(f.rowId)) ?? '',
        src?.status ?? '',
        f.status,
        f.message,
      ];
    });
    downloadCsv(
      'failed-employee-mappings.csv',
      toCsv(
        [
          'externalEmployeeId',
          'employeeName',
          'organizationId',
          'vendorUserId',
          'cardNo',
          'terminal',
          'status',
          'outcome',
          'reason',
        ],
        out,
      ),
    );
  };

  const resetAll = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setCsvRows([]);
    setRows([]);
    setValidation(null);
    setImportResult(null);
    setImportMeta(new Map());
    setSelected(new Set());
    setGlobalDeviceIds([]);
    setOpenTermRow(null);
  };

  // valid + warning count at the mapping (terminal) level.
  const importableCount = validation ? validation.summary.valid + validation.summary.warnings : 0;
  // total terminals the employee rows currently resolve to.
  const totalTerminals = rows.reduce(
    (n, r) => n + Math.max(r.deviceIds.length + r.unresolvedCodes.length, 0),
    0,
  );

  // ----------------------------- Render -----------------------------
  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium border ${
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
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Bulk Import Employee Mappings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload a CSV, map columns, validate, assign terminals, and import thousands of employees
            at once.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/mappings')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Mappings
        </Button>
      </div>

      {/* Stepper */}
      <Stepper current={step} />

      {/* Step body */}
      {step === 'upload' && (
        <Card className="border-border bg-card">
          <CardContent className="p-6 space-y-5">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
            >
              <div className="p-3 rounded-full bg-primary/10 w-fit mx-auto text-primary mb-3">
                <Upload className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Drop your CSV here, or click to browse
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                UTF-8 CSV, one employee per row. Large files supported.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileWarning className="h-4 w-4 text-primary" />
                Not sure about the format? Download a ready-to-fill template with sample data.
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'map' && (
        <Card className="border-border bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Match your columns</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono text-foreground">{fileName}</span> · {csvRows.length}{' '}
                  rows · {headers.length} columns. We auto-matched where we could.
                </p>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SYSTEM_FIELDS.map((f) => {
                const idx = colMap[f.key] ?? -1;
                const sample = idx >= 0 ? (csvRows[0]?.[idx] ?? '') : '';
                return (
                  <div
                    key={f.key}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2.5"
                  >
                    <div className="w-40 shrink-0">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1">
                        {f.label}
                        {f.required && <span className="text-rose-500">*</span>}
                      </div>
                      {sample && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          e.g. {sample}
                        </div>
                      )}
                    </div>
                    <select
                      value={idx}
                      onChange={(e) =>
                        setColMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))
                      }
                      className="flex-1 h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value={-1}>— Not mapped —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {!requiredMapped && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Map the required fields (Employee ID,
                Vendor User ID) to continue.
              </p>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Start over
              </Button>
              <Button size="sm" disabled={!requiredMapped} onClick={buildRows}>
                Preview & Validate <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(step === 'preview' || step === 'assign') && (
        <>
          {/* Validation summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryTile
              label={`Mappings (${rows.length} emp.)`}
              value={validation?.summary.total ?? totalTerminals}
              tone="neutral"
              icon={ListChecks}
            />
            <SummaryTile
              label="Valid"
              value={validation?.summary.valid ?? 0}
              tone="good"
              icon={CheckCircle2}
            />
            <SummaryTile
              label="Warnings"
              value={validation?.summary.warnings ?? 0}
              tone="warn"
              icon={AlertTriangle}
            />
            <SummaryTile
              label="Errors"
              value={validation?.summary.errors ?? 0}
              tone="bad"
              icon={XCircle}
            />
          </div>

          {step === 'assign' && (
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Cpu className="h-3.5 w-3.5 text-primary" /> Bulk assignment
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Apply to</span>
                    <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                      <button
                        type="button"
                        onClick={() => setApplyScope('all')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                          applyScope === 'all'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        All rows ({rows.length})
                      </button>
                      <button
                        type="button"
                        disabled={selected.size === 0}
                        onClick={() => setApplyScope('selected')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          applyScope === 'selected'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Selected ({selected.size})
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Terminals */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      <Cpu className="h-3.5 w-3.5 text-primary" /> Terminals
                      <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                        {globalDeviceIds.length} selected
                      </span>
                    </div>
                    <TerminalMultiSelect
                      devices={devices}
                      selectedIds={globalDeviceIds}
                      onToggle={toggleGlobalDevice}
                      onSetAll={setGlobalDeviceIds}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={
                        globalDeviceIds.length === 0 ||
                        (applyScope === 'selected' && selected.size === 0)
                      }
                      onClick={() => applyGlobalTerminal(applyScope)}
                    >
                      Apply terminals
                    </Button>
                  </div>

                  {/* Organization */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-primary" /> Organization
                    </div>
                    <select
                      value={globalOrgId}
                      onChange={(e) => setGlobalOrgId(e.target.value)}
                      className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value="">— From CSV only —</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.code})
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!globalOrgId || (applyScope === 'selected' && selected.size === 0)}
                      onClick={() => applyGlobalOrg(applyScope)}
                    >
                      Apply organization
                    </Button>
                  </div>

                  {/* Status */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      <ToggleLeft className="h-3.5 w-3.5 text-primary" /> Status
                    </div>
                    <select
                      value={globalStatus}
                      onChange={(e) => setGlobalStatus(e.target.value)}
                      className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={applyScope === 'selected' && selected.size === 0}
                      onClick={() => applyGlobalStatus(applyScope)}
                    >
                      Apply status
                    </Button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Pick a <b>scope</b> at the top, then apply terminals, organization, or status to
                  those rows. Each employee&apos;s vendor ID can map to <b>several terminals</b> —
                  one mapping is created per terminal. You can also edit any field inline per row in
                  the table below; the CSV terminal column may list several codes separated by{' '}
                  <span className="font-mono">;</span>.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Rows table */}
          <Card className="border-border bg-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="text-xs text-muted-foreground">
                  {busy ? (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Validating…
                    </span>
                  ) : (
                    <>
                      {importableCount} importable · {validation?.summary.errors ?? 0} blocked ·{' '}
                      {validation?.summary.willUpdate ?? 0} will update existing
                    </>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => validate(rows)} disabled={busy}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy ? 'animate-spin' : ''}`} />{' '}
                  Re-validate
                </Button>
              </div>
              <div className="max-h-[48vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      {step === 'assign' && (
                        <TableHead className="w-8">
                          <input
                            type="checkbox"
                            checked={selected.size === rows.length && rows.length > 0}
                            onChange={toggleSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead className="text-xs">Check</TableHead>
                      <TableHead className="text-xs">Employee ID</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Organization</TableHead>
                      <TableHead className="text-xs">Vendor ID</TableHead>
                      <TableHead className="text-xs">Card</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Target Terminal</TableHead>
                      <TableHead className="text-xs text-right">·</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const agg = rowAgg.get(r.rowId);
                      const level = agg?.level ?? 'valid';
                      const termNames = [
                        ...r.deviceIds.map((id) => deviceById.get(id)?.device_code || `#${id}`),
                        ...r.unresolvedCodes.map((c) => `${c}?`),
                      ];
                      const termCount = r.deviceIds.length + r.unresolvedCodes.length;
                      const colCount = step === 'assign' ? 10 : 9;
                      return (
                        <React.Fragment key={r.rowId}>
                          <TableRow className="align-top">
                            {step === 'assign' && (
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selected.has(r.rowId)}
                                  onChange={() => toggleSelect(r.rowId)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <LevelBadge
                                level={level}
                                willUpdate={agg?.willUpdate}
                                issues={agg?.issues}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs text-foreground">
                              {r.externalEmployeeId || '—'}
                            </TableCell>
                            <TableCell className="text-xs">{r.employeeName || '—'}</TableCell>
                            <TableCell className="text-xs">
                              {step === 'assign'
                                ? (() => {
                                    const sel = resolveOrgRef(r.organizationRef);
                                    const orgVal = sel ? String(sel.id) : r.organizationRef;
                                    return (
                                      <select
                                        value={orgVal}
                                        onChange={(e) => setRowOrg(r.rowId, e.target.value)}
                                        className={`h-7 px-1.5 rounded-md border border-input bg-background text-[11px] max-w-[170px] ${
                                          r.organizationRef && !sel
                                            ? 'border-rose-500/60 text-rose-500'
                                            : ''
                                        }`}
                                      >
                                        <option value="">— Default —</option>
                                        {r.organizationRef && !sel && (
                                          <option value={r.organizationRef}>
                                            {r.organizationRef} (unknown)
                                          </option>
                                        )}
                                        {orgs.map((o) => (
                                          <option key={o.id} value={o.id}>
                                            {o.code} — {o.name}
                                          </option>
                                        ))}
                                      </select>
                                    );
                                  })()
                                : agg?.organizationName ||
                                  r.organizationRef || (
                                    <span className="text-muted-foreground italic">default</span>
                                  )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.vendorUserId || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {r.cardNo || '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {step === 'assign' ? (
                                <select
                                  value={r.status}
                                  onChange={(e) => setRowStatus(r.rowId, e.target.value)}
                                  className={`h-7 px-1.5 rounded-md border border-input bg-background text-[11px] ${
                                    r.status === 'INACTIVE'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  <option value="ACTIVE">ACTIVE</option>
                                  <option value="INACTIVE">INACTIVE</option>
                                </select>
                              ) : (
                                <span
                                  className={
                                    r.status === 'INACTIVE'
                                      ? 'text-amber-600 dark:text-amber-400 text-[11px]'
                                      : 'text-muted-foreground text-[11px]'
                                  }
                                >
                                  {r.status || 'ACTIVE'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {step === 'assign' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (openTermRow === r.rowId) {
                                      setOpenTermRow(null);
                                      void validate(rows);
                                    } else setOpenTermRow(r.rowId);
                                  }}
                                  className="h-7 px-2 rounded-md border border-input bg-background text-[11px] inline-flex items-center gap-1 max-w-[220px]"
                                >
                                  <span
                                    className={
                                      termCount === 0
                                        ? 'text-muted-foreground italic'
                                        : r.unresolvedCodes.length
                                          ? 'text-rose-500'
                                          : ''
                                    }
                                  >
                                    {termCount === 0
                                      ? 'Pick terminals'
                                      : `${termCount} terminal${termCount > 1 ? 's' : ''}`}
                                  </span>
                                  <span className="text-muted-foreground">▾</span>
                                </button>
                              ) : termNames.length ? (
                                <span className="text-[11px]">
                                  {termNames.slice(0, 2).join(', ')}
                                  {termNames.length > 2 ? ` +${termNames.length - 2}` : ''}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">unset</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <button
                                onClick={() => removeRow(r.rowId)}
                                title="Remove row"
                                className="p-1 rounded-md text-rose-500 hover:bg-rose-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>

                          {step === 'assign' && openTermRow === r.rowId && (
                            <TableRow>
                              <TableCell colSpan={colCount} className="bg-muted/20">
                                <div className="p-2 space-y-2">
                                  <div className="text-[10px] text-muted-foreground">
                                    Terminals for{' '}
                                    <b className="text-foreground">
                                      {r.externalEmployeeId || 'this employee'}
                                    </b>{' '}
                                    (vendor {r.vendorUserId || '—'}) — one mapping is created per
                                    terminal.
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                                    {devices.map((d) => (
                                      <label
                                        key={d.id}
                                        className="flex items-center gap-2 text-[11px] cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={r.deviceIds.includes(d.id)}
                                          onChange={() => toggleRowDevice(r.rowId, d.id)}
                                        />
                                        <span className="font-mono text-foreground">
                                          {d.device_code}
                                        </span>
                                        <span className="text-muted-foreground truncate">
                                          {d.name}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                  {r.unresolvedCodes.length > 0 && (
                                    <div className="text-[10px] text-rose-500">
                                      Unmatched CSV terminals: {r.unresolvedCodes.join(', ')} — tick
                                      the correct terminal(s) above (the unmatched ones will error).
                                    </div>
                                  )}
                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setOpenTermRow(null);
                                        void validate(rows);
                                      }}
                                    >
                                      Done
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(step === 'assign' ? 'preview' : 'map')}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetAll}>
                Re-upload
              </Button>
              {step === 'preview' ? (
                <Button size="sm" disabled={rows.length === 0} onClick={() => setStep('assign')}>
                  Configure Assignments <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void validate(rows).then(() => setStep('review'));
                  }}
                >
                  Review & Confirm <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {step === 'review' && (
        <Card className="border-border bg-card">
          <CardContent className="p-6 space-y-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Review & Confirm
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryTile
                label="To import"
                value={importableCount}
                tone="good"
                icon={CheckCircle2}
              />
              <SummaryTile
                label="New"
                value={validation?.summary.willCreate ?? 0}
                tone="neutral"
                icon={Link2}
              />
              <SummaryTile
                label="Updates"
                value={validation?.summary.willUpdate ?? 0}
                tone="warn"
                icon={RefreshCw}
              />
              <SummaryTile
                label="Skipped (errors)"
                value={validation?.summary.errors ?? 0}
                tone="bad"
                icon={XCircle}
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
              <div>
                <span className="text-foreground font-semibold">{importableCount}</span> mapping(s)
                across <span className="text-foreground font-semibold">{rows.length}</span>{' '}
                employee(s) will be imported. Mappings with errors are skipped automatically.
              </div>
              <div>
                Default organization:{' '}
                <span className="text-foreground font-medium">
                  {globalOrgId
                    ? orgs.find((o) => String(o.id) === globalOrgId)?.name
                    : 'from CSV only'}
                </span>{' '}
                · Default status:{' '}
                <span className="text-foreground font-medium">{globalStatus}</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Imports are idempotent — re-running
                won&apos;t create duplicates; matching records are updated.
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setStep('assign')}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
              </Button>
              <Button size="sm" disabled={busy || importableCount === 0} onClick={runImport}>
                Import {importableCount} record(s) <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'import' && (
        <Card className="border-border bg-card">
          <CardContent className="p-12 text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">
              Importing {importableCount} employee mapping(s)…
            </h3>
            <p className="text-xs text-muted-foreground">
              Validating and upserting records. This stays safe to retry.
            </p>
            <div className="h-1.5 w-full max-w-sm mx-auto rounded-full bg-muted overflow-hidden">
              <div className="h-full w-1/2 bg-primary animate-pulse rounded-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'results' && importResult && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryTile
              label="Total"
              value={importResult.summary.total}
              tone="neutral"
              icon={ListChecks}
            />
            <SummaryTile
              label="Imported"
              value={importResult.summary.imported}
              tone="good"
              icon={CheckCircle2}
            />
            <SummaryTile
              label="Updated"
              value={importResult.summary.updated}
              tone="warn"
              icon={RefreshCw}
            />
            <SummaryTile
              label="Skipped"
              value={importResult.summary.skipped}
              tone="neutral"
              icon={AlertTriangle}
            />
            <SummaryTile
              label="Failed"
              value={importResult.summary.failed}
              tone="bad"
              icon={XCircle}
            />
          </div>

          <Card className="border-border bg-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Import report</h3>
                <div className="flex items-center gap-2">
                  {importResult.summary.failed + importResult.summary.skipped > 0 && (
                    <Button variant="outline" size="sm" onClick={downloadFailedRows}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Download failed rows
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[48vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="text-xs">Outcome</TableHead>
                      <TableHead className="text-xs">Employee ID</TableHead>
                      <TableHead className="text-xs">Terminal</TableHead>
                      <TableHead className="text-xs">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <ResultBadge status={r.status} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.externalEmployeeId}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {importMeta.get(String(r.rowId)) ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetAll}>
              Import another file
            </Button>
            <Button size="sm" onClick={() => router.push('/mappings')}>
              Done — view mappings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------- Sub-components -----------------------------

/** Chip-summary dropdown multi-select for terminals (closes on outside click). */
function TerminalMultiSelect({
  devices,
  selectedIds,
  onToggle,
  onSetAll,
}: {
  devices: DeviceOption[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onSetAll: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
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

  const chosen = devices.filter((d) => selectedIds.includes(d.id));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full min-h-8 px-2 py-1 rounded-md border border-input bg-background text-xs flex items-center gap-1.5"
      >
        <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0">
          {chosen.length === 0 ? (
            <span className="text-muted-foreground">Select terminals…</span>
          ) : (
            <>
              {chosen.slice(0, 2).map((d) => (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-mono"
                >
                  {d.device_code}
                  <X
                    className="h-2.5 w-2.5 cursor-pointer hover:text-rose-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(d.id);
                    }}
                  />
                </span>
              ))}
              {chosen.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{chosen.length - 2} more</span>
              )}
            </>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border text-[10px] text-muted-foreground">
            <span>{selectedIds.length} selected</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="hover:text-foreground font-medium"
                onClick={() => onSetAll(devices.map((d) => d.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="hover:text-foreground font-medium"
                onClick={() => onSetAll([])}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-52 overflow-auto py-1">
            {devices.length === 0 ? (
              <div className="p-2 text-[11px] text-muted-foreground">No devices available</div>
            ) : (
              devices.map((d) => {
                const on = selectedIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onToggle(d.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-accent text-left"
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                        on ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                      }`}
                    >
                      {on && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="font-mono text-foreground">{d.device_code}</span>
                    <span className="text-muted-foreground truncate">{d.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const activeIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <React.Fragment key={s.key}>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
                active
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : done
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-3 bg-border shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneCls = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-foreground',
  }[tone];
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-3.5 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold ${toneCls}`}>{value}</div>
        </div>
        <Icon className={`h-5 w-5 ${toneCls} opacity-70`} />
      </CardContent>
    </Card>
  );
}

function LevelBadge({
  level,
  willUpdate,
  issues,
}: {
  level: RowLevel;
  willUpdate?: boolean;
  issues?: RowIssue[];
}) {
  const title =
    (issues ?? []).map((i) => `${i.level.toUpperCase()}: ${i.message}`).join('\n') || undefined;
  if (level === 'error')
    return (
      <Badge
        variant="outline"
        title={title}
        className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1"
      >
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  if (level === 'warning')
    return (
      <Badge
        variant="outline"
        title={title}
        className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1"
      >
        <AlertTriangle className="h-3 w-3" /> {willUpdate ? 'Update' : 'Warning'}
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
    >
      <CheckCircle2 className="h-3 w-3" /> Valid
    </Badge>
  );
}

function ResultBadge({ status }: { status: ImportRowResult['status'] }) {
  const map = {
    imported: {
      cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Imported',
    },
    updated: {
      cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
      icon: RefreshCw,
      label: 'Updated',
    },
    skipped: {
      cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
      icon: AlertTriangle,
      label: 'Skipped',
    },
    failed: {
      cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
      icon: XCircle,
      label: 'Failed',
    },
  }[status];
  const Icon = map.icon;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${map.cls}`}>
      <Icon className="h-3 w-3" /> {map.label}
    </Badge>
  );
}
