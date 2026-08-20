'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Cpu,
  Fingerprint,
  Link2,
  RefreshCw,
  Send,
  ShieldAlert,
  Activity,
  FileText,
  Settings as SettingsIcon,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'info';
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Core Platform',
    items: [
      {
        name: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
      },
      {
        name: 'Live Punch Stream',
        href: '/live',
        icon: Fingerprint,
        badge: 'Live',
        badgeVariant: 'success',
      },
      {
        name: 'Punch Logs',
        href: '/punches',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Device Fleet',
    items: [
      {
        name: 'Device Registry',
        href: '/devices',
        icon: Cpu,
        badge: '3 Fleet',
        badgeVariant: 'info',
      },
      {
        name: 'Identity Mappings',
        href: '/mappings',
        icon: Link2,
      },
      {
        name: 'Sync Jobs',
        href: '/sync',
        icon: RefreshCw,
      },
    ],
  },
  {
    title: 'Outbound & Telemetry',
    items: [
      {
        name: 'Integrations & Outbox',
        href: '/integrations',
        icon: Send,
      },
      {
        name: 'Alerts & DLQ',
        href: '/alerts',
        icon: ShieldAlert,
        badge: '0 DLQ',
        badgeVariant: 'secondary',
      },
      {
        name: 'Audit Logs',
        href: '/audit',
        icon: Activity,
      },
      {
        name: 'Platform Settings',
        href: '/settings',
        icon: SettingsIcon,
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md flex flex-col justify-between h-screen p-3.5 select-none transition-colors">
      <div className="space-y-5">
        {/* Organization Brand Header */}
        <div className="flex items-center justify-between px-2.5 py-2 rounded-xl border border-border/80 bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-tight text-foreground">
                Techive Enterprise
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">ORG-TECHIVE · PROD</div>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        {/* Navigation Sections */}
        <div className="space-y-4">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-[11px] font-semibold text-muted-foreground/90 px-2.5 py-1 tracking-tight">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname?.startsWith(item.href + '/');

                  return (
                    <Link
                      key={itemIdx}
                      href={item.href}
                      className={cn(
                        'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all group',
                        isActive
                          ? 'bg-secondary text-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        />
                        <span>{item.name}</span>
                      </div>

                      {item.badge && (
                        <Badge
                          variant={
                            item.badgeVariant === 'success'
                              ? 'success'
                              : item.badgeVariant === 'info'
                              ? 'info'
                              : 'secondary'
                          }
                          className="text-[10px] px-1.5 py-0 font-semibold"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer System Status */}
      <div className="pt-3 border-t border-border/80">
        <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/30 border border-border/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-foreground text-[11px]">Engine Healthy</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
