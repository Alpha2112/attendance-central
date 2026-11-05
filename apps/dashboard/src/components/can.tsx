'use client';

import React from 'react';
import { useAuth } from '@/lib/auth';

/**
 * Renders children only when the current user holds the given permission.
 * Use to hide action buttons / menu items the user is not authorized for.
 *
 *   <Can perm="users.create"><Button>Add User</Button></Can>
 *   <Can perm={["roles.edit","roles.create"]} mode="any">...</Can>
 */
export function Can({
  perm,
  mode = 'all',
  fallback = null,
  children,
}: {
  perm: string | string[];
  mode?: 'all' | 'any';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const perms = Array.isArray(perm) ? perm : [perm];
  const granted = user
    ? mode === 'any'
      ? perms.some((p) => user.permissions.includes(p))
      : perms.every((p) => user.permissions.includes(p))
    : false;
  return <>{granted ? children : fallback}</>;
}
