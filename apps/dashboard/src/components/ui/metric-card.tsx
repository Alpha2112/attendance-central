'use client';

import React from 'react';
import { Card, CardContent } from './card';
import { Badge } from './badge';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  deltaLabel?: string;
  subtext?: string;
  icon?: LucideIcon;
  className?: string;
}

export function MetricCard({
  title,
  value,
  delta,
  deltaType = 'positive',
  deltaLabel,
  subtext,
  icon: Icon,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all hover:border-border/80', className)}>
      <CardContent className="p-5 space-y-3">
        {/* Top row: Title and Delta Pill */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          {delta && (
            <Badge
              variant="outline"
              className={cn(
                'text-[11px] font-semibold px-2 py-0.5 rounded-full border gap-1',
                deltaType === 'positive' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                deltaType === 'negative' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                deltaType === 'neutral' && 'bg-muted text-muted-foreground border-border'
              )}
            >
              {deltaType === 'positive' && <TrendingUp className="h-3 w-3" />}
              {deltaType === 'negative' && <TrendingDown className="h-3 w-3" />}
              <span>{delta}</span>
            </Badge>
          )}
          {!delta && Icon && (
            <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Main Value */}
        <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          {value}
        </div>

        {/* Footer / Trend Subtitles */}
        {(deltaLabel || subtext) && (
          <div className="space-y-0.5 pt-1">
            {deltaLabel && (
              <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                <span>{deltaLabel}</span>
                {deltaType === 'positive' && <ArrowUpRight className="h-3 w-3 text-emerald-500 shrink-0" />}
                {deltaType === 'negative' && <ArrowDownRight className="h-3 w-3 text-rose-500 shrink-0" />}
              </div>
            )}
            {subtext && (
              <div className="text-[11px] text-muted-foreground leading-tight">{subtext}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
