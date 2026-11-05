'use client';

import React from 'react';
import { Layers, Loader2 } from 'lucide-react';

/**
 * Full-viewport, branded loading screen. Opaque so nothing behind it (sidebar,
 * header, page content) is visible — only the centered indicator. Used both as
 * the auth/initial gate and as the route-navigation overlay.
 */
export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 rounded-2xl bg-primary/10 animate-ping" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Layers className="h-6 w-6" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">{label}…</span>
        </div>
      </div>
    </div>
  );
}
