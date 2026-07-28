/**
 * Copies the pdf.js worker into `public/` so the browser can load it from a
 * stable URL.
 *
 * Bundling the worker through `new URL(...)` behaves differently across
 * bundlers and Next versions; serving it as a static asset does not. Runs
 * automatically before `dev` and `build`, so the copy always matches the
 * installed pdfjs-dist.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const source = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'legacy',
  'build',
  'pdf.worker.min.mjs',
);
const target = path.join(ROOT, 'public', 'pdf.worker.min.mjs');

await mkdir(path.dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`pdf worker -> ${path.relative(ROOT, target)}`);
