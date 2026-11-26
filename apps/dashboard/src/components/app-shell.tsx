'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuth } from '@/lib/auth';
import { ForceChangePassword } from './force-change-password';
import { FullPageLoader } from './full-page-loader';
import { ShieldAlert } from 'lucide-react';

/** Maps a route to the permission required to view it (prefix match for details). */
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/': 'dashboard.view',
  '/live': 'punches.view',
  '/punches': 'punches.view',
  '/sync': 'punches.manual_sync',
  '/mappings/import': 'mappings.bulk_import',
  '/devices': 'devices.view',
  '/mappings': 'mappings.view',
  '/organizations': 'organizations.view',
  '/integrations': 'integrations.view',
  '/alerts': 'alerts.view',
  '/audit': 'audit.view',
  '/settings': 'settings.view',
  '/users': 'users.view',
  '/roles': 'roles.view',
};

function requiredPermissionFor(pathname: string): string | null {
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];
  // Longest matching prefix (e.g. /devices/123 -> devices.view).
  let best: string | null = null;
  let bestLen = -1;
  for (const [route, perm] of Object.entries(ROUTE_PERMISSIONS)) {
    if (route !== '/' && pathname.startsWith(route + '/') && route.length > bestLen) {
      best = perm;
      bestLen = route.length;
    }
  }
  return best;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      {children}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const pathname = usePathname() || '/';
  const router = useRouter();

  const isLoginRoute = pathname === '/login';

  // Redirect unauthenticated users to the login page.
  useEffect(() => {
    if (!loading && !user && !isLoginRoute) {
      router.replace('/login');
    }
    if (!loading && user && isLoginRoute) {
      router.replace('/');
    }
  }, [loading, user, isLoginRoute, router]);

  // The login page renders without the app shell.
  if (isLoginRoute) {
    return <>{children}</>;
  }

  // Initial load, session validation, or redirecting to login — show only the
  // branded full-page loader (sidebar/header/content stay hidden).
  if (loading) {
    return <FullPageLoader label="Loading" />;
  }

  if (!user) {
    return <FullPageLoader label="Redirecting" />;
  }

  // First-login / reset password enforcement.
  if (user.mustChangePassword) {
    return (
      <FullScreen>
        <ForceChangePassword />
      </FullScreen>
    );
  }

  const required = requiredPermissionFor(pathname);
  const allowed = !required || can(required);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background/50">
          {allowed ? (
            children
          ) : (
            <div className="max-w-md mx-auto mt-24 text-center space-y-3">
              <ShieldAlert className="h-12 w-12 mx-auto text-amber-500" />
              <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                You don&rsquo;t have permission to view this page. Ask an administrator to grant you
                the <code className="font-mono text-foreground">{required}</code> permission.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
