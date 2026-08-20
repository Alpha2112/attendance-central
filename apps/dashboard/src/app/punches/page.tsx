'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  Download,
  Shield,
  RefreshCw,
  CheckCircle2,
  X,
  Copy,
  Check,
  Zap,
  Trash2,
  MoreVertical,
  ExternalLink,
  AlertTriangle,
  Radio,
  Fingerprint as FingerprintIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface PunchRecord {
  id: number;
  eventDate: string;
  employeeId: string;
  employeeName: string;
  department: string;
  deviceId: number;
  deviceCode: string;
  deviceName: string;
  vendor: string;
  punchType: string;
  verificationType: string;
  punchTime: string;
  punchTimeUtc: string;
  receivedAt: string;
  source: string;
  cardNo?: string;
  fingerprint: string;
}

export default function PunchesPage() {
  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const [selectedPunchType, setSelectedPunchType] = useState<string>('ALL');
  const [selectedPunch, setSelectedPunch] = useState<PunchRecord | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [bannerFeedback, setBannerFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Pagination state
  const [cursorTime, setCursorTime] = useState<string | undefined>(undefined);
  const [cursorId, setCursorId] = useState<number | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<{ punchTimeUtc: string; id: number } | undefined>(undefined);

  const fetchPunches = useCallback(async (cTime?: string, cId?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (cTime && cId) {
        params.set('cursorTime', cTime);
        params.set('cursorId', String(cId));
      }
      params.set('limit', '30');

      const res = await fetch(`/api/punches?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          setPunches(data.items);
          setNextCursor(data.nextCursor);
        }
      }
    } catch {
      // transient fetch fallback
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchPunches();
  }, [fetchPunches]);

  const showBanner = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setBannerFeedback({ text, type });
    setTimeout(() => {
      setBannerFeedback((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCursorTime(undefined);
    setCursorId(undefined);
    fetchPunches();
  };

  const handleSyncRealTerminal = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/punches/sync/DEV-HQ-HIK01', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showBanner(
          `⚡ Synced physical terminal (${data.deviceCode || 'Hikvision'}): ${data.newCount} new punch(es) ingested, ${data.duplicateCount} duplicates rejected.`,
          'success'
        );
        fetchPunches();
      } else {
        showBanner(`❌ Sync failed: ${data.message || 'Unknown error'}`, 'error');
      }
    } catch {
      showBanner('❌ Failed to connect to terminal for live event sync.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurgeAll = async () => {
    setIsPurging(true);
    try {
      const res = await fetch('/api/punches/purge', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setPunches([]);
        setIsPurgeModalOpen(false);
        showBanner('🗑 All punch logs purged. Terminal checkpoint reset so you can test fresh punches!', 'info');
        fetchPunches();
      } else {
        showBanner(`❌ Failed to purge logs: ${data.message || 'Unknown error'}`, 'error');
      }
    } catch {
      showBanner('❌ Network error while purging logs.', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const handleDeletePunch = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/punches/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPunches((prev) => prev.filter((p) => p.id !== id));
        showBanner(`✔ Punch log #${id} deleted from database.`, 'success');
      } else {
        showBanner(`❌ Failed to delete punch log #${id}.`, 'error');
      }
    } catch {
      showBanner(`❌ Network error deleting punch log #${id}.`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReemitToKafka = async (p: PunchRecord) => {
    try {
      const res = await fetch(`/api/punches/${p.id}?action=reemit`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showBanner(`⚡ Punch #${p.id} re-emitted to Kafka topic [attendance.normalized.v1]!`, 'success');
      } else {
        showBanner(`❌ Failed to re-emit punch #${p.id}.`, 'error');
      }
    } catch {
      showBanner(`❌ Network error re-emitting punch #${p.id}.`, 'error');
    }
  };

  const handleCopyFingerprint = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedFingerprint(true);
    showBanner('📋 Copied SHA-256 fingerprint hash to clipboard!', 'info');
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  const exportCSV = () => {
    const headers = [
      'ID',
      'Event Date',
      'Employee ID',
      'Employee Name',
      'Department',
      'Device Code',
      'Vendor',
      'Punch Type',
      'Verification Mode',
      'Punch Time Local',
      'Punch Time UTC',
      'Source',
      'SHA256 Fingerprint',
    ];

    const rows = punches.map((p) => [
      p.id,
      p.eventDate,
      p.employeeId,
      `"${p.employeeName}"`,
      `"${p.department}"`,
      p.deviceCode,
      p.vendor,
      p.punchType,
      p.verificationType,
      `"${p.punchTime}"`,
      p.punchTimeUtc,
      p.source,
      p.fingerprint,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showBanner('📥 Exported attendance logs to CSV.', 'info');
  };

  const filteredPunches = punches.filter((p) => {
    if (selectedVendor !== 'ALL' && p.vendor !== selectedVendor) return false;
    if (selectedPunchType !== 'ALL' && p.punchType !== selectedPunchType) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Historical Attendance Punch Logs
                </h1>
                <Badge variant="outline" className="text-xs bg-muted/40 font-mono text-muted-foreground">
                  Partition: p{new Date().toISOString().slice(0, 7).replace('-', '')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Authoritative partitioned MySQL records with immutable SHA-256 idempotency fingerprints.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsPurgeModalOpen(true)}
            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-medium"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Clear All Logs
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPunches()}
            disabled={loading}
            className="border-border bg-card hover:bg-muted font-medium"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncRealTerminal}
            disabled={isSyncing}
            className="bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium"
          >
            <Zap className={`h-4 w-4 mr-1.5 ${isSyncing ? 'animate-pulse' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Real Terminal'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={punches.length === 0}
            className="border-border bg-card hover:bg-muted font-medium"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Notification Banner */}
      {bannerFeedback && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-center justify-between animate-in slide-in-from-top-2 ${
            bannerFeedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : bannerFeedback.type === 'info'
              ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerFeedback.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            ) : bannerFeedback.type === 'info' ? (
              <Radio className="h-4 w-4 text-purple-400 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <span>{bannerFeedback.text}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBannerFeedback(null)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearch} className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by employee, device, or SHA-256 fingerprint..."
            className="pl-9 bg-card/60 border-border/60 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Vendor Filter */}
          <div className="flex items-center rounded-lg border border-border/60 bg-card/40 p-1 text-xs">
            <span className="px-2 text-muted-foreground font-semibold">Vendor:</span>
            {['ALL', 'HIKVISION', 'ZKTECO', 'SUPREMA'].map((v) => (
              <button
                key={v}
                onClick={() => setSelectedVendor(v)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedVendor === v
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Punch Type Filter */}
          <div className="flex items-center rounded-lg border border-border/60 bg-card/40 p-1 text-xs">
            <span className="px-2 text-muted-foreground font-semibold">Type:</span>
            {['ALL', 'IN', 'OUT'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedPunchType(t)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedPunchType === t
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Records Table */}
      <Card className="bg-card/40 backdrop-blur border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Normalized Attendance Records</CardTitle>
              <CardDescription className="text-xs">
                Keyset-paginated query over monthly partitioned table <code className="font-mono text-foreground">attendance_logs</code>.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs bg-muted/40">
              {filteredPunches.length} Records Shown
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent text-xs">
                <TableHead className="w-[220px]">Employee</TableHead>
                <TableHead>Terminal & Vendor</TableHead>
                <TableHead className="text-center">Verification</TableHead>
                <TableHead>Local Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead className="text-right w-[90px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
                    Querying partitioned records from database...
                  </TableCell>
                </TableRow>
              ) : filteredPunches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                    <div className="max-w-md mx-auto space-y-2">
                      <FingerprintIcon className="h-10 w-10 mx-auto text-muted-foreground/40" />
                      <div className="font-semibold text-foreground">No Punch Logs in Database</div>
                      <div className="text-xs text-muted-foreground">
                        Ready for testing! Present your face, card, or fingerprint on your physical Hikvision device (<code className="text-foreground font-mono">192.168.100.186</code>), then click <strong>Sync Real Terminal</strong> or watch the Live Stream.
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPunches.map((p) => (
                  <TableRow key={`${p.id}-${p.fingerprint}`} className="border-border/30 hover:bg-muted/20 text-sm">
                    <TableCell>
                      <div className="font-medium text-foreground">{p.employeeName}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {p.employeeId} <span className="opacity-40">•</span> {p.department}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            p.vendor === 'HIKVISION'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]'
                              : p.vendor === 'ZKTECO'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]'
                          }
                        >
                          {p.vendor}
                        </Badge>
                        <div>
                          <div className="text-xs font-semibold text-foreground">{p.deviceCode}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[150px]">{p.deviceName}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs bg-muted/40 font-mono">
                        {p.verificationType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-foreground font-medium">{p.punchTime}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{p.punchTimeUtc}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono bg-muted/30 text-muted-foreground">
                        {p.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.fingerprint ? `${p.fingerprint.slice(0, 16)}...` : '—'}
                      </span>
                    </TableCell>

                    {/* Action Buttons (Dropdown Menu) */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-card/95 backdrop-blur border-border/80 shadow-xl">
                          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                            Punch Record #{p.id}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-border/40" />

                          {/* Inspect Audit Record */}
                          <DropdownMenuItem
                            onClick={() => setSelectedPunch(p)}
                            className="text-xs cursor-pointer focus:bg-primary/10 focus:text-primary"
                          >
                            <Shield className="h-3.5 w-3.5 mr-2 text-primary" />
                            Inspect Audit Record
                          </DropdownMenuItem>

                          {/* Copy SHA-256 Hash */}
                          <DropdownMenuItem
                            onClick={() => handleCopyFingerprint(p.fingerprint)}
                            className="text-xs cursor-pointer focus:bg-muted"
                          >
                            <Copy className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            Copy SHA-256 Fingerprint
                          </DropdownMenuItem>

                          {/* View Identity Mapping */}
                          <DropdownMenuItem asChild className="text-xs cursor-pointer focus:bg-muted">
                            <Link href={`/mappings`}>
                              <ExternalLink className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              View Identity Mapping
                            </Link>
                          </DropdownMenuItem>

                          {/* Re-emit to Kafka */}
                          <DropdownMenuItem
                            onClick={() => handleReemitToKafka(p)}
                            className="text-xs cursor-pointer focus:bg-amber-500/10 focus:text-amber-400"
                          >
                            <Zap className="h-3.5 w-3.5 mr-2 text-amber-400" />
                            Re-emit to Kafka Backbone
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-border/40" />

                          {/* Delete Punch Log */}
                          <DropdownMenuItem
                            onClick={() => handleDeletePunch(p.id)}
                            disabled={deletingId === p.id}
                            className="text-xs cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-400" />
                            {deletingId === p.id ? 'Deleting...' : 'Delete Punch Record'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit Record Inspector Modal */}
      {selectedPunch && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">
                    Attendance Audit Record Inspector
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Row ID: <span className="font-mono text-foreground">{selectedPunch.id}</span> • Partition:{' '}
                    <span className="font-mono text-foreground">{selectedPunch.eventDate}</span>
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPunch(null)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                <div className="text-muted-foreground font-semibold">RESOLVED IDENTITY</div>
                <div className="font-bold text-foreground text-sm">{selectedPunch.employeeName}</div>
                <div className="text-muted-foreground font-mono">External ID: {selectedPunch.employeeId}</div>
                <div className="text-muted-foreground">Department: {selectedPunch.department}</div>
                {selectedPunch.cardNo && (
                  <div className="text-muted-foreground font-mono">Badge Card: {selectedPunch.cardNo}</div>
                )}
              </div>

              <div className="p-3.5 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                <div className="text-muted-foreground font-semibold">HARDWARE ORIGIN</div>
                <div className="font-bold text-foreground text-sm">{selectedPunch.deviceName}</div>
                <div className="text-muted-foreground font-mono">Device Code: {selectedPunch.deviceCode}</div>
                <div className="text-muted-foreground">Vendor: {selectedPunch.vendor} (ISAPI)</div>
                <div className="text-muted-foreground">Ingestion Mode: {selectedPunch.source}</div>
              </div>
            </div>

            {/* SHA-256 Hash Display */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">SHA-256 IDEMPOTENCY FINGERPRINT</span>
                <button
                  onClick={() => handleCopyFingerprint(selectedPunch.fingerprint)}
                  className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                >
                  {copiedFingerprint ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedFingerprint ? 'Copied' : 'Copy Hash'}
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-background font-mono text-[11px] text-emerald-400 break-all border border-emerald-500/20 select-all">
                {selectedPunch.fingerprint}
              </div>
            </div>

            {/* MySQL Normalized JSON Snapshot */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground">
                NORMALIZED MYSQL RECORD SNAPSHOT
              </div>
              <pre className="p-3 rounded-lg bg-background text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-48 border border-border/60">
                {JSON.stringify(
                  {
                    id: selectedPunch.id,
                    event_date: selectedPunch.eventDate,
                    employee_id: selectedPunch.employeeId,
                    device_id: selectedPunch.deviceId,
                    vendor: selectedPunch.vendor,
                    punch_type: selectedPunch.punchType,
                    verification_type: selectedPunch.verificationType,
                    punch_time_utc: selectedPunch.punchTimeUtc,
                    received_at: selectedPunch.receivedAt,
                    event_fingerprint: selectedPunch.fingerprint,
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReemitToKafka(selectedPunch)}
                className="text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                <Zap className="h-3.5 w-3.5 mr-1" />
                Replay to Kafka
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setSelectedPunch(null)}
                className="text-xs"
              >
                Close Audit Inspector
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear / Purge Confirmation Modal */}
      {isPurgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-foreground text-base">Clear All Punch Logs</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will purge all stored punch records from partitioned MySQL tables (<code className="text-foreground">attendance_logs</code> and <code className="text-foreground">raw_punch_logs</code>) and reset the terminal checkpoint.
              <br /><br />
              This gives you a completely clean slate to test fresh punches on your real Hikvision device.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPurgeModalOpen(false)}
                disabled={isPurging}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handlePurgeAll}
                disabled={isPurging}
                className="text-xs font-semibold"
              >
                {isPurging ? 'Purging...' : 'Yes, Purge All Logs'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
