// @ts-nocheck
// Node test: reads files from the repo tree to verify PWA shell wiring is intact.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');
const indexHtmlPath = resolve(__dirname, '../../index.html');

describe('pwa assets', () => {
  it('index.html links manifest and registers icons', () => {
    const html = readFileSync(indexHtmlPath, 'utf-8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('/manifest.webmanifest');
  });

  it('manifest references files that exist in public/', () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf-8'));
    expect(manifest.name).toBe('NebulaForge Creator Nebula');
    expect(manifest.start_url).toBe('/');
    expect(Array.isArray(manifest.icons)).toBe(true);
    for (const icon of manifest.icons) {
      const target = resolve(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(target), `icon missing: ${icon.src}`).toBe(true);
      expect(statSync(target).size).toBeGreaterThan(0);
    }
  });

  it('service-worker.js exists and caches the app shell', () => {
    const swPath = resolve(publicDir, 'service-worker.js');
    expect(existsSync(swPath)).toBe(true);
    const sw = readFileSync(swPath, 'utf-8');
    expect(sw).toContain('APP_SHELL');
    expect(sw).toContain("'/index.html'");
    expect(sw).toContain("'/manifest.webmanifest'");
    expect(sw).toContain("addEventListener('fetch'");
  });

  it('main.ts registers the service worker', () => {
    const mainPath = resolve(__dirname, '../../src/main.ts');
    const main = readFileSync(mainPath, 'utf-8');
    expect(main).toContain('serviceWorker.register');
    expect(main).toContain('/service-worker.js');
  });

  it('openapi spec is present for SDK docs', () => {
    const specPath = resolve(publicDir, 'sdk/openapi-v1.json');
    expect(existsSync(specPath)).toBe(true);
    const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
    expect(spec.info.version).toMatch(/^1\.\d+\.\d+$/);
    expect(spec.openapi).toMatch(/^3\./);
  });
});
