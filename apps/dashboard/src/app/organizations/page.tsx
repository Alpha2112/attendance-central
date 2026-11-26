'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Boxes,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Link2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Can } from '@/components/can';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatTile } from '@/components/stat-tile';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Tenant {
  id: number;
  code: string;
  name: string;
  status: string;
  organizationCount: number;
  createdAt: string;
}

interface Organization {
  id: number;
  code: string;
  name: string;
  tenantId: number | null;
  tenantName: string | null;
  parentId: number | null;
  parentName: string | null;
  timezone: string;
  status: string;
  createdAt: string;
}

type Kind = 'tenant' | 'org';

export default function OrganizationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Kind>('tenant');
  const [tenantSearch, setTenantSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');

  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Modal state (create/edit)
  const [modal, setModal] = useState<{ kind: Kind; id: number | null } | null>(null);
  const [form, setForm] = useState<{
    code: string;
    name: string;
    status: string;
    tenantId: string;
    parentId: string;
  }>({ code: '', name: '', status: 'ACTIVE', tenantId: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirm state
  const [deleting, setDeleting] = useState<{ kind: Kind; id: number; label: string } | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [tRes, oRes] = await Promise.all([fetch('/api/tenants'), fetch('/api/organizations')]);
      if (tRes.ok) setTenants(await tRes.json());
      if (oRes.ok) setOrgs(await oRes.json());
    } catch {
      notify('Could not load registry data', 'error');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTenants = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase();
    return q
      ? tenants.filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(q))
      : tenants;
  }, [tenants, tenantSearch]);

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    return q
      ? orgs.filter((o) =>
          `${o.name} ${o.code} ${o.tenantName ?? ''} ${o.parentName ?? ''}`.toLowerCase().includes(q),
        )
      : orgs;
  }, [orgs, orgSearch]);

  // Pre-order flattening of the org tree: each root, then its children depth-first.
  // An org whose parent is missing from the set is treated as a root so nothing
  // is ever hidden. Guards against cycles from unexpected data.
  const orgTreeRows = useMemo<{ org: Organization; depth: number }[]>(() => {
    const ids = new Set(orgs.map((o) => o.id));
    const childrenOf = new Map<number | 'root', Organization[]>();
    for (const o of orgs) {
      const key: number | 'root' = o.parentId != null && ids.has(o.parentId) ? o.parentId : 'root';
      const list = childrenOf.get(key) ?? [];
      list.push(o);
      childrenOf.set(key, list);
    }
    for (const list of childrenOf.values()) list.sort((a, b) => a.name.localeCompare(b.name));

    const rows: { org: Organization; depth: number }[] = [];
    const seen = new Set<number>();
    const walk = (parentKey: number | 'root', depth: number) => {
      for (const o of childrenOf.get(parentKey) ?? []) {
        if (seen.has(o.id)) continue; // cycle guard
        seen.add(o.id);
        rows.push({ org: o, depth });
        walk(o.id, depth + 1);
      }
    };
    walk('root', 0);
    // Any orphans left by a cycle still get shown at the end.
    for (const o of orgs) if (!seen.has(o.id)) rows.push({ org: o, depth: 0 });
    return rows;
  }, [orgs]);

  // When editing an org, its own sub-tree (itself + all descendants) cannot be
  // chosen as the new parent — that would create a cycle.
  const parentOptions = useMemo<{ org: Organization; depth: number }[]>(() => {
    if (!modal || modal.kind !== 'org') return orgTreeRows;
    const editingId = modal.id;
    if (editingId == null) return orgTreeRows; // creating: any org may be the parent
    const banned = new Set<number>([editingId]);
    // Repeatedly sweep until no new descendants are found.
    let added = true;
    while (added) {
      added = false;
      for (const o of orgs) {
        if (o.parentId != null && banned.has(o.parentId) && !banned.has(o.id)) {
          banned.add(o.id);
          added = true;
        }
      }
    }
    return orgTreeRows.filter((r) => !banned.has(r.org.id));
  }, [orgTreeRows, orgs, modal]);

  const openCreate = (kind: Kind) => {
    setModal({ kind, id: null });
    setForm({ code: '', name: '', status: 'ACTIVE', tenantId: '', parentId: '' });
    setFormError(null);
  };

  const openEditTenant = (t: Tenant) => {
    setModal({ kind: 'tenant', id: t.id });
    setForm({ code: t.code, name: t.name, status: t.status, tenantId: '', parentId: '' });
    setFormError(null);
  };

  const openEditOrg = (o: Organization) => {
    setModal({ kind: 'org', id: o.id });
    setForm({
      code: o.code,
      name: o.name,
      status: o.status,
      tenantId: o.tenantId != null ? String(o.tenantId) : '',
      parentId: o.parentId != null ? String(o.parentId) : '',
    });
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Code and Name are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const kind = modal!.kind;
    const base = kind === 'tenant' ? '/api/tenants' : '/api/organizations';
    const url = modal!.id ? `${base}/${modal!.id}` : base;
    const method = modal!.id ? 'PATCH' : 'POST';
    const payload =
      kind === 'tenant'
        ? { code: form.code.trim(), name: form.name.trim(), status: form.status }
        : {
            code: form.code.trim(),
            name: form.name.trim(),
            status: form.status,
            tenantId: form.tenantId ? Number(form.tenantId) : null,
            parentId: form.parentId ? Number(form.parentId) : null,
          };
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        notify(
          `${kind === 'tenant' ? 'Tenant' : 'Organization'} ${modal!.id ? 'updated' : 'registered'} successfully.`,
        );
        setModal(null);
        await load(true);
      } else {
        const msg = data?.message || data?.error || 'Failed to save';
        setFormError(typeof msg === 'string' ? msg : 'Failed to save');
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    const base = deleting.kind === 'tenant' ? '/api/tenants' : '/api/organizations';
    try {
      const res = await fetch(`${base}/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        notify(`${deleting.kind === 'tenant' ? 'Tenant' : 'Organization'} deleted.`);
        setDeleting(null);
        await load(true);
      } else {
        notify(data?.message || data?.error || 'Delete failed', 'error');
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  const statusBadge = (status: string) => {
    const active = status?.toUpperCase() === 'ACTIVE';
    return (
      <Badge
        variant="outline"
        className={`text-[10px] font-medium ${
          active
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
            : 'bg-muted text-muted-foreground border-border'
        }`}
      >
        {status || 'ACTIVE'}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Organizations &amp; Tenants
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Register and manage the Tenants and Organizations used by Sender Webhooks.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-card hover:bg-muted font-medium"
          onClick={() => load()}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Metrics — compact, real registry counts */}
      {(() => {
        const activeTenants = tenants.filter((t) => (t.status || '').toUpperCase() === 'ACTIVE').length;
        const assignedOrgs = orgs.filter((o) => o.tenantId != null).length;
        return (
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              title="Tenants"
              value={String(tenants.length)}
              delta={tenants.length ? `${activeTenants} active` : undefined}
              deltaType="positive"
              hint="registered"
              icon={Boxes}
            />
            <StatTile
              title="Organizations"
              value={String(orgs.length)}
              delta={orgs.length ? `${assignedOrgs} assigned` : undefined}
              deltaType="neutral"
              hint="registered"
              icon={Building2}
            />
          </div>
        );
      })()}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList>
          <TabsTrigger value="tenant">Tenants</TabsTrigger>
          <TabsTrigger value="org">Organizations</TabsTrigger>
        </TabsList>

        {/* ---------------- Tenants ---------------- */}
        <TabsContent value="tenant">
          <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold">Tenants</CardTitle>
                  <CardDescription className="text-xs">
                    A Tenant owns one or more Organizations.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      placeholder="Search tenants..."
                      className="h-8 pl-8 text-xs w-44"
                    />
                  </div>
                  <Can perm="tenants.create">
                    <Button size="sm" className="h-8 text-xs font-semibold" onClick={() => openCreate('tenant')}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Register Tenant
                    </Button>
                  </Can>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <LoadingRow />
              ) : filteredTenants.length === 0 ? (
                <EmptyState
                  icon={Boxes}
                  title={tenants.length === 0 ? 'No tenants yet' : 'No matches'}
                  body={
                    tenants.length === 0
                      ? 'Register a tenant to start grouping organizations.'
                      : 'No tenants match your search.'
                  }
                  action={tenants.length === 0 ? () => openCreate('tenant') : undefined}
                  actionLabel="Register Tenant"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Organizations</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-semibold text-foreground">{t.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.code}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Link2 className="h-3 w-3" /> {t.organizationCount}
                          </span>
                        </TableCell>
                        <TableCell>{statusBadge(t.status)}</TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            onEdit={() => openEditTenant(t)}
                            onDelete={() => setDeleting({ kind: 'tenant', id: t.id, label: t.name })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Organizations ---------------- */}
        <TabsContent value="org">
          <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold">Organizations</CardTitle>
                  <CardDescription className="text-xs">
                    An unlimited-depth tree — nest organizations from the top root down to the deepest
                    child. Each may also belong to a Tenant.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                      placeholder="Search organizations..."
                      className="h-8 pl-8 text-xs w-48"
                    />
                  </div>
                  <Can perm="organizations.create">
                    <Button size="sm" className="h-8 text-xs font-semibold" onClick={() => openCreate('org')}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Register Organization
                    </Button>
                  </Can>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <LoadingRow />
              ) : filteredOrgs.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title={orgs.length === 0 ? 'No organizations yet' : 'No matches'}
                  body={
                    orgs.length === 0
                      ? 'Register an organization to use it in Sender Webhooks.'
                      : 'No organizations match your search.'
                  }
                  action={orgs.length === 0 ? () => openCreate('org') : undefined}
                  actionLabel="Register Organization"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(orgSearch.trim()
                      ? filteredOrgs.map((o) => ({ org: o, depth: 0 }))
                      : orgTreeRows
                    ).map(({ org: o, depth }) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-semibold text-foreground">
                          <div className="flex items-center" style={{ paddingLeft: depth * 20 }}>
                            {depth > 0 && (
                              <span className="text-muted-foreground mr-1.5 font-normal select-none">
                                └─
                              </span>
                            )}
                            {depth === 0 ? (
                              <Building2 className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                            ) : (
                              <Boxes className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                            )}
                            <span>{o.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{o.code}</TableCell>
                        <TableCell className="text-xs">
                          {o.tenantName ? (
                            <span className="text-foreground">{o.tenantName}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(o.status)}</TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            onEdit={() => openEditOrg(o)}
                            onDelete={() => setDeleting({ kind: 'org', id: o.id, label: o.name })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create / Edit modal */}
      {modal && (
        <Overlay onClose={() => setModal(null)}>
          <form onSubmit={submit}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground">
                {modal.id ? 'Edit' : 'Register'} {modal.kind === 'tenant' ? 'Tenant' : 'Organization'}
              </h2>
              <button type="button" onClick={() => setModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={modal.kind === 'tenant' ? 'Techive Group' : 'Techive HQ'}
                  autoFocus
                />
              </Field>
              <Field label="Code" required hint="Sent in the webhook payload; letters, numbers, - and _.">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder={modal.kind === 'tenant' ? 'TENANT-TECHIVE' : 'ORG-TECHIVE'}
                  className="font-mono"
                />
              </Field>

              {modal.kind === 'org' && (
                <Field
                  label="Parent organization"
                  hint="Nest this organization under another to build your structure (root → region → branch → …). Leave as a top-level root for no parent. Unlimited depth is supported."
                >
                  <select
                    value={form.parentId}
                    onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="">— Top-level (root) —</option>
                    {parentOptions.map(({ org: o, depth }) => (
                      <option key={o.id} value={o.id}>
                        {`${'  '.repeat(depth)}${depth > 0 ? '└ ' : ''}${o.name} (${o.code})`}
                      </option>
                    ))}
                  </select>
                  {modal.id != null && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Its own sub-tree is hidden here — an organization can&apos;t be moved under one of
                      its own descendants.
                    </p>
                  )}
                </Field>
              )}

              {modal.kind === 'org' && (
                <Field label="Tenant" hint="Which tenant this organization belongs to.">
                  <select
                    value={form.tenantId}
                    onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="">— Unassigned —</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                  {tenants.length === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      No tenants yet — register one in the Tenants tab first.
                    </p>
                  )}
                </Field>
              )}

              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>

              {formError && (
                <p className="text-xs text-rose-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {formError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="font-semibold">
                {saving ? 'Saving...' : modal.id ? 'Save Changes' : 'Register'}
              </Button>
            </div>
          </form>
        </Overlay>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Overlay onClose={() => setDeleting(null)}>
          <div className="flex items-center gap-2 mb-3 text-rose-600 dark:text-rose-400">
            <Trash2 className="h-5 w-5" />
            <h2 className="text-base font-bold">Delete {deleting.kind === 'tenant' ? 'Tenant' : 'Organization'}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{deleting.label}</span>? This cannot be undone.
            {deleting.kind === 'tenant' && ' Tenants with organizations cannot be deleted.'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deletingBusy}
              onClick={confirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {deletingBusy ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </Overlay>
      )}

      {/* Toast */}
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
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        title="Edit"
        className="p-1.5 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        className="p-1.5 rounded-md border border-border bg-card hover:bg-rose-500/10 text-rose-500 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="p-10 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
      <RefreshCw className="h-5 w-5 animate-spin text-primary" /> Loading...
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  actionLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="p-10 text-center space-y-3">
      <div className="p-3 rounded-full bg-muted/40 w-fit mx-auto text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{body}</p>
      </div>
      {action && actionLabel && (
        <Button size="sm" className="font-semibold" onClick={action}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {actionLabel}
        </Button>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-foreground mb-1 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
