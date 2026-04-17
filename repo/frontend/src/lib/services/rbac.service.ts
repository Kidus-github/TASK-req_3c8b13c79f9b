/**
 * Role-Based Access Control (RBAC)
 *
 * Defines roles, permissions, and route guards for the application.
 * Since this is a device-local app, RBAC is enforced client-side
 * via route guards and component-level permission checks.
 */

import { logger } from '$lib/logging';

export type Role = 'guest' | 'user';

export type Permission =
  | 'enter_app'
  | 'manage_cards'
  | 'import_cards'
  | 'manage_rules'
  | 'run_jobs'
  | 'export_data'
  | 'import_backups'
  | 'use_sdk'
  | 'change_preferences'
  | 'view_monitor';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  guest: [],
  user: [
    'enter_app',
    'manage_cards',
    'import_cards',
    'manage_rules',
    'run_jobs',
    'export_data',
    'import_backups',
    'use_sdk',
    'change_preferences',
    'view_monitor',
  ],
};

const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  '/': ['enter_app'],
  '/cards': ['manage_cards'],
  '/import': ['import_cards'],
  '/starmap': ['enter_app'],
  '/search': ['enter_app'],
  '/voyage': ['enter_app'],
  '/backup': ['export_data'],
  '/parser-rules': ['manage_rules'],
  '/sdk-docs': ['use_sdk'],
  '/jobs': ['view_monitor'],
  '/settings': ['change_preferences'],
};

export function getRoleForUser(isAuthenticated: boolean): Role {
  return isAuthenticated ? 'user' : 'guest';
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

export function canAccessRoute(role: Role, route: string): boolean {
  const required = ROUTE_PERMISSIONS[route];
  if (!required || required.length === 0) return true;
  const allowed = hasAllPermissions(role, required);
  if (!allowed) {
    logger.warn('rbac', 'route-guard', `Access denied to ${route}`, { role, requiredPermissions: required });
  }
  return allowed;
}

export function getPermissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function getRequiredPermissionsForRoute(route: string): Permission[] {
  return [...(ROUTE_PERMISSIONS[route] ?? [])];
}
