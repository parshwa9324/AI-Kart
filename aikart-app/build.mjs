/**
 * build.mjs — AI-Kart SDK esbuild pipeline
 *
 * Produces a self-contained IIFE bundle for <script> tag embedding.
 * MediaPipe WASM (~6MB) is NOT bundled — it loads from CDN at runtime.
 * Only the JS runtime wrapper from @mediapipe/tasks-vision is included.
 *
 * Usage:
 *   node build.mjs           → production build
 *   node build.mjs --watch   → watch mode (dev)
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version || '1.0.0';
const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ['src/ar-engine/AIKartSDK.ts'],
  bundle: true,
  minify: !isWatch,
  format: 'iife',
  globalName: 'AIKartSDK',
  outfile: 'dist/aikart.v1.min.js',
  sourcemap: true,
  target: ['chrome90', 'firefox88', 'safari15'],
  define: {
    'process.env.NODE_ENV': '"production"',
    '__AIKART_VERSION__': `"${version}"`,
  },
  banner: {
    js: `/* AI-Kart AR Engine v${version} | aikart.com */`,
  },
  // MediaPipe JS wrapper is bundled; WASM loads from CDN at runtime.
  // No external packages — everything inlined for script-tag usage.
  metafile: true,
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log(`\n  👁  Watching for changes...  (Ctrl+C to stop)\n`);
} else {
  const result = await esbuild.build(config);

  // ── Size Report ──
  const outputs = result.metafile?.outputs ?? {};
  const mainKey = Object.keys(outputs).find((k) => k.endsWith('.min.js'));
  if (mainKey) {
    const bytes = outputs[mainKey].bytes;
    const kb = (bytes / 1024).toFixed(1);
    console.log(`\n  ✅ Built → dist/aikart.v1.min.js`);
    console.log(`     Raw size   : ${kb} KB`);
    console.log(`     Source map : dist/aikart.v1.min.js.map`);
  }

  // ── Gzip + Brotli size estimate ──
  try {
    const { gzipSync, brotliCompressSync, constants } = await import('zlib');
    const { writeFileSync } = await import('fs');
    const bundle = readFileSync('dist/aikart.v1.min.js');

    const gzipped = gzipSync(bundle, { level: 9 });
    const brotli = brotliCompressSync(bundle, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    });

    writeFileSync('dist/aikart.v1.min.js.gz', gzipped);
    writeFileSync('dist/aikart.v1.min.js.br', brotli);

    console.log(`     Gzip       : ${(gzipped.length / 1024).toFixed(1)} KB`);
    console.log(`     Brotli     : ${(brotli.length / 1024).toFixed(1)} KB`);
    console.log(`     .gz file   : dist/aikart.v1.min.js.gz`);
    console.log(`     .br file   : dist/aikart.v1.min.js.br`);
  } catch {
    console.log('     (zlib compression skipped)');
  }

  // ── Write metafile for esbuild-visualizer ──
  if (result.metafile) {
    const { writeFileSync: wf } = await import('fs');
    wf('dist/meta.json', JSON.stringify(result.metafile));
    console.log('     Metafile   : dist/meta.json');
  }

  // ── Top modules by size ──
  if (result.metafile) {
    const inputs = result.metafile.inputs;
    const sorted = Object.entries(inputs)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 10);
    console.log('\n  📊 Top 10 modules by source size:');
    sorted.forEach(([path, info], i) => {
      const kb = (info.bytes / 1024).toFixed(1);
      console.log(`     ${i + 1}. ${kb.padStart(7)} KB  ${path}`);
    });
  }

  console.log('');
}
