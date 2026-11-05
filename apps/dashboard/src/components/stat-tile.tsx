'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/** Compact KPI tile — icon + title + delta on one row, value + hint below. */
export function StatTile({
  title,
  value,
  delta,
  deltaType = 'positive',
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[11px] font-medium text-muted-foreground">{title}</span>
        </div>
        {delta && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              deltaType === 'negative'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : deltaType === 'neutral'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight text-foreground">{value}</span>
        {hint && <span className="truncate text-[10px] text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
