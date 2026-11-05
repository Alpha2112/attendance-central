'use client';

import React from 'react';
import { Info } from 'lucide-react';

/**
 * A small info icon that reveals a description on hover/focus.
 * Uses a CSS group-hover tooltip (plus a native title as a fallback).
 */
export function InfoTip({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`relative inline-flex items-center group align-middle ${className}`}>
      <Info
        className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground cursor-help"
        tabIndex={0}
        aria-label={text}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-[70] mb-1.5 w-56 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] leading-snug text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
