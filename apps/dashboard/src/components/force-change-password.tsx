'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/** Shown when a user must change their password (first login / admin reset). */
export function ForceChangePassword() {
  const { refresh, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('New passwords do not match.');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.message || 'Could not change password.');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Set a new password</h1>
          <p className="text-xs text-muted-foreground">You must change your password to continue.</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
          autoComplete="current-password"
        />
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
          autoComplete="new-password"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Update password
        </button>
        <button
          type="button"
          onClick={logout}
          className="w-full h-9 rounded-lg text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
