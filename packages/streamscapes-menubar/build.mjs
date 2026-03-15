import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: false,
};

// Main process
await build({
  ...shared,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  external: ['electron'],
});

// Preload script
await build({
  ...shared,
  entryPoints: ['src/preload.ts'],
  outfile: 'dist/preload.js',
  external: ['electron'],
});

// Copy renderer files (HTML is loaded directly, no bundling needed)
import { copyFileSync, mkdirSync } from 'fs';
mkdirSync('dist/renderer', { recursive: true });
copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');

// Bundle renderer JS for browser
await build({
  entryPoints: ['src/renderer/renderer.ts'],
  outfile: 'dist/renderer/renderer.js',
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  sourcemap: false,
});

console.log('Build complete');
