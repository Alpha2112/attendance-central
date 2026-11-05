'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FullPageLoader } from './full-page-loader';

/**
 * Shows the full-page loader during client-side route navigations. It reflects
 * the ACTUAL transition: it arms when a navigation starts (an internal link click
 * or a programmatic router push) and clears when the destination route has
 * rendered (pathname change).
 *
 * To avoid flicker, the overlay only appears if the transition takes longer than
 * a short threshold — instant/cached navigations never flash it. A safety timeout
 * guarantees it can never stick. Hard navigations (reload/refresh/address bar) are
 * handled by the server-rendered auth gate, so this only covers soft navigation.
 */
export function GlobalLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    pendingRef.current = false;
    if (showTimer.current) clearTimeout(showTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    showTimer.current = null;
    safetyTimer.current = null;
    setVisible(false);
  }, []);

  const start = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    showTimer.current = setTimeout(() => {
      if (pendingRef.current) setVisible(true);
    }, 140);
    safetyTimer.current = setTimeout(finish, 8000);
  }, [finish]);

  // Destination rendered → navigation finished.
  useEffect(() => {
    finish();
  }, [pathname, finish]);

  useEffect(() => {
    // Programmatic navigations (router.push) go through history.pushState.
    const origPush = history.pushState.bind(history);
    history.pushState = ((...args: Parameters<History['pushState']>) => {
      const url = args[2];
      if (url && String(url).split('?')[0].split('#')[0] !== pathname) start();
      return origPush(...args);
    }) as History['pushState'];

    // Internal link clicks — the earliest reliable "navigation starting" signal.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      const anchor = (e.target as HTMLElement)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank') return;
      if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (href.split('?')[0].split('#')[0] === pathname) return; // same page
      start();
    };

    document.addEventListener('click', onClick, true);
    return () => {
      history.pushState = origPush;
      document.removeEventListener('click', onClick, true);
    };
  }, [pathname, start]);

  if (!visible) return null;
  return <FullPageLoader />;
}
