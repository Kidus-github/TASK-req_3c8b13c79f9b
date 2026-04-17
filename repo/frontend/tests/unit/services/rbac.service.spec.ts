import { describe, it, expect } from 'vitest';
import {
  canAccessRoute,
  getRoleForUser,
  getPermissionsForRole,
  getRequiredPermissionsForRoute,
  hasAllPermissions,
  hasPermission,
  type Permission,
} from '$lib/services/rbac.service';

describe('rbac.service', () => {
  describe('getRoleForUser', () => {
    it('returns user when authenticated', () => {
      expect(getRoleForUser(true)).toBe('user');
    });
    it('returns guest when not authenticated', () => {
      expect(getRoleForUser(false)).toBe('guest');
    });
  });

  describe('hasPermission', () => {
    it('user has enter_app', () => {
      expect(hasPermission('user', 'enter_app')).toBe(true);
    });
    it('guest has no permissions', () => {
      const perms: Permission[] = [
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
      ];
      for (const p of perms) {
        expect(hasPermission('guest', p)).toBe(false);
      }
    });

    it('handles an unknown role defensively', () => {
      expect(hasPermission('nobody' as unknown as 'user', 'enter_app')).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('user has the full set of declared permissions', () => {
      const required: Permission[] = ['manage_cards', 'import_cards', 'manage_rules'];
      expect(hasAllPermissions('user', required)).toBe(true);
    });
    it('guest fails even a single required permission', () => {
      expect(hasAllPermissions('guest', ['enter_app'])).toBe(false);
    });
    it('empty required list is vacuously true', () => {
      expect(hasAllPermissions('guest', [])).toBe(true);
    });
  });

  describe('canAccessRoute', () => {
    const userRoutes = [
      '/',
      '/cards',
      '/import',
      '/starmap',
      '/search',
      '/voyage',
      '/backup',
      '/parser-rules',
      '/sdk-docs',
      '/jobs',
      '/settings',
    ];

    it('allows user on every mapped route', () => {
      for (const route of userRoutes) {
        expect(canAccessRoute('user', route)).toBe(true);
      }
    });

    it('blocks guest on every mapped route that requires a permission', () => {
      for (const route of userRoutes) {
        expect(canAccessRoute('guest', route)).toBe(false);
      }
    });

    it('allows any role on unknown routes (no permission declared)', () => {
      expect(canAccessRoute('guest', '/does-not-exist')).toBe(true);
      expect(canAccessRoute('user', '/does-not-exist')).toBe(true);
    });
  });

  describe('introspection helpers', () => {
    it('getPermissionsForRole returns a copy, not a reference', () => {
      const a = getPermissionsForRole('user');
      const b = getPermissionsForRole('user');
      expect(a).toEqual(b);
      a.pop();
      expect(getPermissionsForRole('user')).toEqual(b);
    });
    it('getRequiredPermissionsForRoute lists permissions per route', () => {
      expect(getRequiredPermissionsForRoute('/backup')).toEqual(['export_data']);
      expect(getRequiredPermissionsForRoute('/parser-rules')).toEqual(['manage_rules']);
      expect(getRequiredPermissionsForRoute('/nope')).toEqual([]);
    });
  });
});
