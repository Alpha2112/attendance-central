'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Lock,
  SlidersHorizontal,
  Loader2,
  X,
  Users as UsersIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Can } from '@/components/can';

interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}
interface Permission {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  page: string;
  action: string;
}
type Toast = { text: string; type: 'success' | 'error' };

function Overlay({
  children,
  onClose,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  // Side-drawer chrome: Escape closes it and the body scroll is locked while open.
  useEffect(() => {
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
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative h-full w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto border-l border-border bg-card p-5 shadow-2xl animate-in slide-in-from-right-[100%] duration-300 ease-out`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function RolesPage() {
  const { can } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [permFor, setPermFor] = useState<RoleRow | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<number>>(new Set());
  const [permSaving, setPermSaving] = useState(false);
  const [deleteFor, setDeleteFor] = useState<RoleRow | null>(null);

  const flash = (text: string, type: Toast['type']) => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      const [rRes, cRes] = await Promise.all([
        fetch('/api/roles', { cache: 'no-store' }),
        fetch('/api/roles/permissions/catalog', { cache: 'no-store' }),
      ]);
      if (rRes.ok) setRoles(await rRes.json());
      if (cRes.ok) setCatalog(await cRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Group catalog by module -> page.
  const grouped = useMemo(() => {
    const byModule = new Map<string, Map<string, Permission[]>>();
    for (const p of catalog) {
      if (!byModule.has(p.module)) byModule.set(p.module, new Map());
      const pages = byModule.get(p.module)!;
      if (!pages.has(p.page)) pages.set(p.page, []);
      pages.get(p.page)!.push(p);
    }
    return byModule;
  }, [catalog]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', description: '' });
    setFormError(null);
    setShowForm(true);
  };
  const openEdit = (r: RoleRow) => {
    setEditing(r);
    setForm({ code: r.code, name: r.name, description: r.description || '' });
    setFormError(null);
    setShowForm(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/roles/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, description: form.description }),
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Update failed.');
        flash('Role updated.', 'success');
      } else {
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            description: form.description,
            permissionIds: [],
          }),
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Create failed.');
        flash('Role created. Assign its permissions next.', 'success');
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const openPermissions = async (r: RoleRow) => {
    setPermFor(r);
    setSelectedPerms(new Set());
    try {
      const res = await fetch(`/api/roles/${r.id}`, { cache: 'no-store' });
      if (res.ok) {
        const detail = await res.json();
        setSelectedPerms(new Set<number>(detail.permissionIds || []));
      }
    } catch {
      /* ignore */
    }
  };

  const togglePerm = (id: number) =>
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = (perms: Permission[], on: boolean) =>
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });

  const savePermissions = async () => {
    if (!permFor) return;
    setPermSaving(true);
    try {
      const res = await fetch(`/api/roles/${permFor.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionIds: [...selectedPerms] }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Save failed.');
      flash(`Permissions updated for ${permFor.name}.`, 'success');
      setPermFor(null);
      await load();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setPermSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    try {
      const res = await fetch(`/api/roles/${deleteFor.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Delete failed.');
      flash(`Role ${deleteFor.name} deleted.`, 'success');
      setDeleteFor(null);
      await load();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const inputCls = 'w-full h-10 rounded-lg border border-border bg-background px-3 text-sm';
  const isSuperAdmin = permFor?.code === 'SUPER_ADMIN';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[60] flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs shadow-lg ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Roles &amp; Permissions
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define roles and the granular permissions they grant across the platform.
          </p>
        </div>
        <Can perm="roles.create">
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 h-9 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Create Role
          </button>
        </Can>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{r.name}</h3>
                    {r.isSystem && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Lock className="h-3 w-3" /> System
                      </span>
                    )}
                  </div>
                  <code className="text-[11px] text-muted-foreground font-mono">{r.code}</code>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground flex-1 min-h-[2.5rem]">
                {r.description || '—'}
              </p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> {r.permissionCount} perms
                </span>
                <span className="inline-flex items-center gap-1">
                  <UsersIcon className="h-3.5 w-3.5" /> {r.userCount} users
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-3">
                <Can perm="roles.assign_permissions">
                  <button
                    onClick={() => openPermissions(r)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 h-8 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Permissions
                  </button>
                </Can>
                <Can perm="roles.edit">
                  <button
                    onClick={() => openEdit(r)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 h-8 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </Can>
                {!r.isSystem && (
                  <Can perm="roles.delete">
                    <button
                      onClick={() => setDeleteFor(r)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 h-8 text-xs font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Can>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit role */}
      {showForm && (
        <Overlay onClose={() => setShowForm(false)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">
              {editing ? 'Edit Role' : 'Create Role'}
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={submitForm} className="space-y-3">
            {!editing && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Code (unique)</label>
                <input
                  className={inputCls}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. AUDITOR"
                  required
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {/* Permissions editor */}
      {permFor && (
        <Overlay onClose={() => setPermFor(null)} wide>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-foreground">
              Permissions — {permFor.name}
            </h2>
            <button
              onClick={() => setPermFor(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Tick the actions this role may perform. Each permission names the page it guards and the
            action it unlocks.
          </p>
          {isSuperAdmin && (
            <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Super Admin always holds every permission and cannot be narrowed.
            </div>
          )}
          <div className="space-y-4">
            {[...grouped.entries()].map(([module, pages]) => (
              <div key={module} className="rounded-lg border border-border">
                <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-foreground rounded-t-lg">
                  {module}
                </div>
                <div className="divide-y divide-border/60">
                  {[...pages.entries()].map(([page, perms]) => {
                    const allOn = perms.every((p) => selectedPerms.has(p.id));
                    return (
                      <div key={page} className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {page}
                          </span>
                          {!isSuperAdmin && (
                            <button
                              onClick={() => togglePage(perms, !allOn)}
                              className="text-[11px] text-primary hover:underline"
                            >
                              {allOn ? 'Clear all' : 'Select all'}
                            </button>
                          )}
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {perms.map((p) => (
                            <label
                              key={p.id}
                              className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${isSuperAdmin ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                disabled={isSuperAdmin}
                                checked={isSuperAdmin || selectedPerms.has(p.id)}
                                onChange={() => togglePerm(p.id)}
                              />
                              <span>
                                <span className="font-medium text-foreground">{p.name}</span>
                                <span className="block text-[11px] text-muted-foreground leading-tight">
                                  {p.description}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {isSuperAdmin ? catalog.length : selectedPerms.size} of {catalog.length} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPermFor(null)}
                className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              {!isSuperAdmin && (
                <button
                  onClick={savePermissions}
                  disabled={permSaving}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {permSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save permissions
                </button>
              )}
            </div>
          </div>
        </Overlay>
      )}

      {/* Delete role */}
      {deleteFor && (
        <Overlay onClose={() => setDeleteFor(null)}>
          <h2 className="text-base font-semibold text-foreground mb-1">Delete Role</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Delete <strong>{deleteFor.name}</strong>? Users holding only this role will lose its
            access. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteFor(null)}
              className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
