'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Cpu,
  Fingerprint,
  Link2,
  Send,
  ShieldAlert,
  Activity,
  FileText,
  Settings as SettingsIcon,
  Layers,
  Building2,
  Users,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'info';
  permission?: string;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Core Platform',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, permission: 'dashboard.view' },
      {
        name: 'Live Punch Stream',
        href: '/live',
        icon: Fingerprint,
        badge: 'Live',
        badgeVariant: 'success',
        permission: 'punches.view',
      },
      { name: 'Punch Logs', href: '/punches', icon: FileText, permission: 'punches.view' },
    ],
  },
  {
    title: 'Device Fleet',
    items: [
      { name: 'Device Registry', href: '/devices', icon: Cpu, permission: 'devices.view' },
      { name: 'Identity Mappings', href: '/mappings', icon: Link2, permission: 'mappings.view' },
    ],
  },
  {
    title: 'Outbound & Telemetry',
    items: [
      {
        name: 'Organizations & Tenants',
        href: '/organizations',
        icon: Building2,
        permission: 'organizations.view',
      },
      {
        name: 'Integrations & Outbox',
        href: '/integrations',
        icon: Send,
        permission: 'integrations.view',
      },
      { name: 'Alerts & DLQ', href: '/alerts', icon: ShieldAlert, permission: 'alerts.view' },
      { name: 'Audit Logs', href: '/audit', icon: Activity, permission: 'audit.view' },
      {
        name: 'Platform Settings',
        href: '/settings',
        icon: SettingsIcon,
        permission: 'settings.view',
      },
    ],
  },
  {
    title: 'Access Control',
    items: [
      { name: 'Users', href: '/users', icon: Users, permission: 'users.view' },
      { name: 'Roles & Permissions', href: '/roles', icon: ShieldCheck, permission: 'roles.view' },
    ],
  },
];

const STORAGE_KEY = 'sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const { can } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved preference; default to collapsed on narrow screens.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1') setCollapsed(true);
      else if (saved === '0') setCollapsed(false);
      else if (window.innerWidth < 768) setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });

  // Only show sections/items the current user is permitted to view.
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border bg-card/60 backdrop-blur-md flex flex-col h-screen select-none transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Header: brand + collapse toggle (always accessible) */}
      <div className="shrink-0 px-3 pt-3.5 pb-2">
        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
          <div
            className={cn(
              'flex items-center rounded-xl transition-colors',
              collapsed
                ? 'justify-center'
                : 'flex-1 min-w-0 gap-2.5 border border-border/80 bg-muted/40 px-2.5 py-2',
            )}
          >
            <div className="h-7 w-7 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-tight text-foreground truncate">
                  Techive Enterprise
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  ORG-TECHIVE · PROD
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation — independently scrollable */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        <div className="space-y-4">
          {visibleSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {collapsed ? (
                idx > 0 && <div className="mx-1 my-1 h-px bg-border/60" />
              ) : (
                <div className="text-[11px] font-semibold text-muted-foreground/90 px-2.5 py-1 tracking-tight">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname?.startsWith(item.href + '/');

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center rounded-lg text-xs font-medium transition-all group',
                        collapsed ? 'justify-center px-0 py-2' : 'justify-between px-2.5 py-1.5',
                        isActive
                          ? 'bg-secondary text-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      <div className={cn('flex items-center min-w-0', collapsed ? '' : 'gap-2.5')}>
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive
                              ? 'text-foreground'
                              : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        />
                        {!collapsed && <span className="truncate">{item.name}</span>}
                      </div>

                      {!collapsed && item.badge && (
                        <Badge
                          variant={
                            item.badgeVariant === 'success'
                              ? 'success'
                              : item.badgeVariant === 'info'
                                ? 'info'
                                : 'secondary'
                          }
                          className="text-[10px] px-1.5 py-0 font-semibold shrink-0"
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
      </nav>

      {/* Footer System Status */}
      <div className="shrink-0 px-3 pb-3.5 pt-2 border-t border-border/80">
        {collapsed ? (
          <div className="flex justify-center py-1.5" title="Engine Healthy · v1.0.0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/30 border border-border/60 text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-semibold text-foreground text-[11px]">Engine Healthy</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">v1.0.0</span>
          </div>
        )}
      </div>
    </aside>
  );
}
