import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../..');

function read(rel: string): string {
  return readFileSync(path.join(frontendRoot, rel), 'utf8');
}

describe('SDK bundle wiring', () => {
  it('vite.sdk.config.ts declares a library build for the embed entry', () => {
    const cfg = read('vite.sdk.config.ts');
    expect(cfg).toMatch(/lib:\s*{[\s\S]*embed\.ts[\s\S]*}/);
    expect(cfg).toMatch(/fileName:\s*\(\)\s*=>\s*'nebulaforge-sdk\.js'/);
    expect(cfg).toMatch(/outDir:\s*'public\/sdk'/);
    expect(cfg).toMatch(/name:\s*'NebulaForge'/);
  });

  it('package.json exposes build:sdk and chains it in the main build', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['build:sdk']).toMatch(/vite build --config vite\.sdk\.config\.ts/);
    expect(pkg.scripts.build).toMatch(/build:sdk/);
  });

  it('sample embed references the real built SDK artifact', () => {
    const html = read('sdk/sample-embed.html');
    expect(html).toMatch(/nebulaforge-sdk\.js/);
    // Must NOT directly import source TS anymore.
    expect(html).not.toMatch(/\.\.\/src\/lib\/sdk\/embed\.ts/);
  });

  it('SDK Docs route points users at /sdk/nebulaforge-sdk.js', () => {
    const docs = read('src/routes/SDKDocs.svelte');
    expect(docs).toMatch(/\/sdk\/nebulaforge-sdk\.js/);
  });

  it('if the bundle has been built, it exposes the NebulaForge UMD global', () => {
    const artifact = path.join(frontendRoot, 'public/sdk/nebulaforge-sdk.js');
    if (!existsSync(artifact)) {
      // Build hasn't run in this environment; the config/script check above is
      // the load-bearing test for that case. Skip the artifact read.
      return;
    }
    const contents = readFileSync(artifact, 'utf8');
    expect(contents).toMatch(/NebulaForge/);
    expect(contents).toMatch(/embed/);
  });
});
