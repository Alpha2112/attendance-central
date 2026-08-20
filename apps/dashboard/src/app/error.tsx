'use client';

import React, { useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // If it is a ChunkLoadError, auto-reload the page once to pull the fresh chunks
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('timeout:');

    if (isChunkError) {
      const storageKey = 'chunk_reload_retry';
      const lastRetry = sessionStorage.getItem(storageKey);
      const now = Date.now();

      // Only auto-reload if we haven't reloaded in the last 10 seconds (prevents infinite reload loops)
      if (!lastRetry || now - parseInt(lastRetry, 10) > 10000) {
        sessionStorage.setItem(storageKey, String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full border-border/80 bg-card/80 backdrop-blur-lg shadow-xl">
        <CardHeader className="p-5 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Dashboard Reconnection Required
              </CardTitle>
              <CardDescription className="text-xs">
                A client script chunk was refreshed by the server.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <p className="text-xs text-muted-foreground">
            {error?.message || 'An unexpected chunk loading error occurred during navigation.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs flex-1"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload Fresh Dashboard
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => reset()}>
              Retry Action
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
