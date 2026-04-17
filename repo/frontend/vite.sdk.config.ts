import { defineConfig } from 'vite';
import path from 'path';

/**
 * Offline Star Map SDK library build. Produces a self-contained UMD bundle
 * at `public/sdk/nebulaforge-sdk.js` so the sample embed page can reference
 * a real built artifact instead of importing source TS files. Three.js is
 * bundled inline so the SDK works fully offline.
 */
export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  build: {
    outDir: 'public/sdk',
    emptyOutDir: false,
    lib: {
      entry: path.resolve('./src/lib/sdk/embed.ts'),
      name: 'NebulaForge',
      fileName: () => 'nebulaforge-sdk.js',
      formats: ['umd'],
    },
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        // Bundle three.js inline (no externals) for true offline support.
        globals: {},
      },
    },
  },
});
