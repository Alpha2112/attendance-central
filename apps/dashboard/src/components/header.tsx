'use client';

import React from 'react';
import { Bell, ArrowUpRight, Search, Sun, Moon, Laptop, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useTheme } from './theme-provider';
import { useAuth } from '@/lib/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

function userInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'U'
  );
}

export function Header() {
  const { setTheme, resolvedTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20 transition-colors">
      {/* Left: Breadcrumbs & Search */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span className="hover:text-foreground transition-colors cursor-pointer">
            Enterprise Attendance
          </span>
          <span className="text-border">/</span>
          <span className="text-foreground font-semibold">Control Plane</span>
        </div>

        <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/80 text-xs text-muted-foreground w-72 focus-within:border-primary/50 focus-within:bg-background transition-all">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <input
            type="text"
            placeholder="Search devices, punches, logs..."
            className="bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground w-full"
          />
          <kbd className="hidden lg:inline-flex h-4 select-none items-center gap-1 rounded bg-background px-1.5 font-mono text-[10px] text-muted-foreground border border-border">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Telemetry, Theme Toggle & User */}
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="gap-1.5 py-1 px-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Cluster Active</span>
        </Badge>

        <a href="http://localhost:4000/docs" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 font-medium">
            <span>OpenAPI 3.0</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </a>

        {/* Theme Mode Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {resolvedTheme === 'dark' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer gap-2">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light Mode</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer gap-2">
              <Moon className="w-3.5 h-3.5" />
              <span>Dark Mode</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer gap-2">
              <Laptop className="w-3.5 h-3.5 text-muted-foreground" />
              <span>System Default</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 pl-3 border-l border-border cursor-pointer">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                  {user ? userInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-foreground leading-tight">
                  {user?.fullName ?? 'Account'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {user?.roles?.[0] ?? 'Signed in'}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs w-56">
            {user && (
              <div className="px-2 py-1.5 border-b border-border/60 mb-1">
                <p className="text-xs font-semibold text-foreground">{user.fullName}</p>
                <p className="text-[10px] text-muted-foreground">{user.email}</p>
              </div>
            )}
            <DropdownMenuItem onClick={logout} className="cursor-pointer gap-2 text-red-500">
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
