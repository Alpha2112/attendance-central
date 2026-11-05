'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  status: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const TOKEN_KEY = 'auth_token';
const COOKIE_MAX_AGE = 43200; // seconds; matches JWT default (12h)

const AuthContext = createContext<AuthContextValue | null>(null);

function setTokenCookie(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  // Same-origin cookie so the /api proxy can forward it automatically.
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = readToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        setUser((await res.json()) as AuthUser);
      } else {
        clearToken();
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || data?.message || 'Login failed.');
    }
    setTokenCookie(data.token);
    setUser(data.user as AuthUser);
  }, []);

  const logout = useCallback(() => {
    // Record the sign-out on the backend (fire-and-forget; the auth cookie is
    // still present so the proxy forwards it). Never block the logout on it.
    try {
      void fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearToken();
    setUser(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
  }, []);

  const can = useCallback(
    (permission: string) => !!user && user.permissions.includes(permission),
    [user],
  );
  const canAny = useCallback(
    (permissions: string[]) => !!user && permissions.some((p) => user.permissions.includes(p)),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, can, canAny }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
