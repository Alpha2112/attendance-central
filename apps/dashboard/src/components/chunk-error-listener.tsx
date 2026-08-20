'use client';

import { useEffect } from 'react';

export function ChunkErrorListener() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event?.reason;
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        (typeof error?.message === 'string' &&
          (error.message.includes('Loading chunk') ||
            error.message.includes('timeout:') ||
            error.message.includes('failed to fetch dynamically imported module')));

      if (isChunkError) {
        event.preventDefault();
        const storageKey = 'chunk_reload_retry';
        const lastRetry = sessionStorage.getItem(storageKey);
        const now = Date.now();

        if (!lastRetry || now - parseInt(lastRetry, 10) > 8000) {
          sessionStorage.setItem(storageKey, String(now));
          window.location.reload();
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
