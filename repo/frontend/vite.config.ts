import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte()
  ],
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib')
    }
  },
  worker: {
    format: 'es'
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['tests/setup.ts'],
    // v8 coverage instrumentation roughly doubles per-test runtime; bump the
    // default test timeout so legitimate slow cases (real Dexie I/O + Svelte
    // mount) don't trip the 5s default during a coverage run.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Svelte 5 ships split server/client entries. Vitest's default node
    // resolver picks the server entry, which disables mount() and breaks
    // @testing-library/svelte. Pin svelte to its client entry under tests.
    alias: [
      {
        find: /^svelte$/,
        replacement: path.resolve('./node_modules/svelte/src/index-client.js')
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/config/**/*.ts',
        'src/lib/services/**/*.ts',
        'src/lib/stores/**/*.ts',
        'src/lib/utils/**/*.ts',
        'src/lib/logging/**/*.ts'
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'src/**/*.svelte',
        'src/lib/three/**',
        'src/lib/workers/**',
        'src/lib/types/**',
        'src/lib/db/**',
        // SDK embed module renders with Three.js in a real WebGL context;
        // jsdom can't host it, so it's excluded from threshold accounting
        // (it has its own integration coverage in tests/unit/sdk-*.spec.ts
        // and Playwright E2E).
        'src/lib/sdk/**',
        'src/main.ts',
        'src/App.svelte'
      ],
      // Hard-gated coverage thresholds (audit requirement: >= 92).
      // CI MUST FAIL if any of these falls below the configured floor.
      thresholds: {
        lines: 92,
        functions: 92,
        branches: 90,
        statements: 92
      }
    }
  }
});
