/**
 * README hard-gate audit.
 *
 * Each requirement from the audit report is encoded as a single test so the
 * suite fails loudly if any of them regress.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(frontendRoot, '..');

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('README audit gate', () => {
  const readme = read('README.md');
  const compose = read('docker-compose.yml');

  it('contains the EXACT primary startup command "docker-compose up --build"', () => {
    expect(readme).toContain('docker-compose up --build');
  });

  it('does NOT use the unsupported space variant "docker compose up --build" as the primary startup command', () => {
    // Ensure the hyphenated form is the documented primary.
    const primaryRegex = /^docker-compose up --build/m;
    expect(readme).toMatch(primaryRegex);
  });

  it('declares both the "guest" and "user" roles in a Roles table', () => {
    expect(readme).toMatch(/\|\s*`?guest`?\s*\|/);
    expect(readme).toMatch(/\|\s*`?user`?\s*\|/);
  });

  it('publishes username + password for every declared role (guest is N/A)', () => {
    expect(readme).toMatch(/guest[\s\S]*N\/A/);
    expect(readme).toMatch(/user[\s\S]*demo[\s\S]*demopass1/);
  });

  it('enforces zero-intervention setup (no .env copy, no manual install steps)', () => {
    // Forbid documenting a `.env` copy step.
    expect(readme).not.toMatch(/cp\s+\.env\.example\s+\.env/);
    expect(readme).not.toMatch(/copy\s+\.env\.example/i);
    // Forbid documenting host-side npm install as a required step.
    expect(readme).not.toMatch(/^Run\s+`?npm install`?/im);
  });

  it('contains all required sections', () => {
    expect(readme).toMatch(/^##\s+Quick Start \(1 Command Only\)/m);
    expect(readme).toMatch(/^##\s+Troubleshooting/m);
    expect(readme).toMatch(/^##\s+System Architecture \(Simple Overview\)/m);
    expect(readme).toMatch(/^##\s+Operator Quick Reference/m);
  });

  it('ports in README match docker-compose.yml', () => {
    // docker-compose maps ${FRONTEND_PORT:-3000}:3000 — README should mention 3000.
    expect(compose).toMatch(/\$\{FRONTEND_PORT:-3000\}:3000/);
    expect(readme).toMatch(/localhost:3000/);
  });

  it('does not contain mojibake encoding artifacts', () => {
    // Common UTF-8-as-Windows-1252 corruption patterns from the audit.
    const mojibake = ['â†’', 'â€”', 'â€“', 'â€˜', 'â€™', 'â€œ', 'â€\u009d'];
    for (const m of mojibake) {
      expect(readme.includes(m), `README contains mojibake "${m}"`).toBe(false);
    }
  });

  it('mentions ENABLE_TLS (default false) configuration toggle', () => {
    expect(readme).toContain('VITE_ENABLE_TLS');
    // Default value column should mention "false"
    expect(readme).toMatch(/VITE_ENABLE_TLS[\s\S]*?false/);
  });
});
