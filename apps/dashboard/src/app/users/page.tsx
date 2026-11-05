'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  UserPlus,
  Search,
  KeyRound,
  Trash2,
  Pencil,
  ShieldCheck,
  Power,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Can } from '@/components/can';

interface RoleLite {
  id: number;
  code: string;
  name: string;
}
interface UserRow {
  id: number;
  email: string;
  fullName: string;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roles: RoleLite[];
  createdAt: string;
}

type Toast = { text: string; type: 'success' | 'error' };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: me, can } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    status: 'ACTIVE',
    roleIds: [] as number[],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deleteFor, setDeleteFor] = useState<UserRow | null>(null);

  const flash = (text: string, type: Toast['type']) => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      const [uRes, rRes] = await Promise.all([
        fetch('/api/users', { cache: 'no-store' }),
        fetch('/api/roles', { cache: 'no-store' }),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (rRes.ok) {
        const data = await rRes.json();
        setRoles(data.map((r: { id: number; code: string; name: string }) => ({ id: r.id, code: r.code, name: r.name })));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ fullName: '', email: '', password: '', status: 'ACTIVE', roleIds: [] });
    setFormError(null);
    setShowForm(true);
  };
  const openEdit = (u: UserRow) => {
    setEditing(u);
    setForm({
      fullName: u.fullName,
      email: u.email,
      password: '',
      status: u.status,
      roleIds: u.roles.map((r) => r.id),
    });
    setFormError(null);
    setShowForm(true);
  };

  const toggleRole = (id: number) =>
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter((r) => r !== id) : [...f.roleIds, id],
    }));

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/users/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: form.fullName, email: form.email, status: form.status }),
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Update failed.');
        if (can('users.assign_roles')) {
          await fetch(`/api/users/${editing.id}/roles`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleIds: form.roleIds }),
          });
        }
        flash('User updated.', 'success');
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Create failed.');
        flash('User created. They must change their password on first login.', 'success');
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const doReset = async () => {
    if (!resetFor) return;
    try {
      const res = await fetch(`/api/users/${resetFor.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Reset failed.');
      flash(`Password reset for ${resetFor.fullName}.`, 'success');
      setResetFor(null);
      setResetPassword('');
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Reset failed.', 'error');
    }
  };

  const toggleStatus = async (u: UserRow) => {
    try {
      const res = await fetch(`/api/users/${u.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: u.status !== 'ACTIVE' }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Update failed.');
      flash(`${u.fullName} ${u.status === 'ACTIVE' ? 'deactivated' : 'activated'}.`, 'success');
      await load();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    try {
      const res = await fetch(`/api/users/${deleteFor.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Delete failed.');
      flash(`${deleteFor.fullName} deleted.`, 'success');
      setDeleteFor(null);
      await load();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const filtered = users.filter(
    (u) =>
      !query ||
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()),
  );

  const inputCls = 'w-full h-10 rounded-lg border border-border bg-background px-3 text-sm';

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
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Users Management
            <span className="text-sm font-normal text-muted-foreground">{users.length}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage application users, their status, and assigned roles.
          </p>
        </div>
        <Can perm="users.create">
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 h-9 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" /> Add New User
          </button>
        </Can>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full h-10 rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/80 bg-muted/20 text-xs text-muted-foreground">
              <th className="text-left font-semibold px-4 py-3">Name</th>
              <th className="text-left font-semibold px-4 py-3">Roles</th>
              <th className="text-left font-semibold px-4 py-3">Status</th>
              <th className="text-left font-semibold px-4 py-3">Last Login</th>
              <th className="text-right font-semibold px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground text-xs">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {initials(u.fullName)}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          {u.fullName}
                          {me?.id === u.id && (
                            <span className="text-[10px] text-muted-foreground font-normal">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground"
                          >
                            {r.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        u.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          u.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-muted-foreground'
                        }`}
                      />
                      {u.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <Can perm="users.edit">
                        <button title="Edit" onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-muted hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </Can>
                      <Can perm="users.assign_roles">
                        <button title="Assign roles" onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-muted hover:text-foreground">
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      </Can>
                      <Can perm="users.activate">
                        <button
                          title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          onClick={() => toggleStatus(u)}
                          className="p-1.5 rounded hover:bg-muted hover:text-foreground"
                        >
                          <Power className={`h-4 w-4 ${u.status === 'ACTIVE' ? 'text-emerald-500' : ''}`} />
                        </button>
                      </Can>
                      <Can perm="users.reset_password">
                        <button title="Reset password" onClick={() => setResetFor(u)} className="p-1.5 rounded hover:bg-muted hover:text-foreground">
                          <KeyRound className="h-4 w-4" />
                        </button>
                      </Can>
                      <Can perm="users.delete">
                        <button title="Delete" onClick={() => setDeleteFor(u)} className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <Overlay onClose={() => setShowForm(false)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">
              {editing ? 'Edit User' : 'Add New User'}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={submitForm} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Full name</label>
              <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            {!editing && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Temporary password (min 8 chars)</label>
                <input type="text" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="They change it on first login" required />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Roles</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted/40">
                    <input type="checkbox" checked={form.roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create user'}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {/* Reset password modal */}
      {resetFor && (
        <Overlay onClose={() => setResetFor(null)}>
          <h2 className="text-base font-semibold text-foreground mb-1">Reset Password</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Set a new temporary password for <strong>{resetFor.fullName}</strong>. They will be asked to change it at next login.
          </p>
          <input type="text" className={inputCls} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="New password (min 8 chars)" />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setResetFor(null)} className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={doReset} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Reset</button>
          </div>
        </Overlay>
      )}

      {/* Delete confirm */}
      {deleteFor && (
        <Overlay onClose={() => setDeleteFor(null)}>
          <h2 className="text-base font-semibold text-foreground mb-1">Delete User</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Permanently delete <strong>{deleteFor.fullName}</strong> ({deleteFor.email})? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteFor(null)} className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={doDelete} className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Delete</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
