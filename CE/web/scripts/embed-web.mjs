// embed-web.mjs — the part of the web build the player and Hostage carry inside them, compressed.
//
// The player plug-in, the standalone player and Hostage serve their page out of the PlayerWebData
// binary data (CMakeLists.txt), so it paints wherever a host loads the binary from. That data was
// every file in dist/: 21.6 MB, the editor's own entry, its lazy section editors and its help pages
// included, in every plug-in binary of every format of every exported panel, uncompressed. A plug-in
// was 37 MB, and 21.6 of it was web files.
//
// Two pages are ever served from it: player.html and host.html (the editor serves dist/ off disk,
// WebViewHost.cpp). So this writes the files those two pages can reach — the page, and every file a
// reached file names, followed to the end — gzip-compressed into dist-embed/, and CMake embeds that
// instead. PlayerHost.cpp and HostRuntimeShared.h inflate a file as its page asks for it.
//
// "Can reach" is two readings, and a file either of them reaches is embedded, because over-including
// costs bytes where missing one costs a blank or broken page:
//   - the files the built files name, followed from the page: a file a page loads is one some reached
//     file names, as a static import, a dynamic one, a worker, a stylesheet, a font or a wasm module,
//     because Vite writes every one of those as its hashed name. This is what finds the workers,
//     which the manifest leaves out;
//   - the page's closure in Vite's manifest (dist/.vite/manifest.json): imports, dynamic imports,
//     their CSS and assets. It lists one 196-byte quickjs stub no built file names, which the first
//     reading cannot find and nothing could load; it goes in all the same.
// A file in public/ is copied to dist/ under its own name and is included whatever names it.
//
// Run by every Vite build of dist/ (embedPlayerBundle in vite.config.js), which removes dist-embed/
// as it starts and writes it once dist/ is complete; also `node scripts/embed-web.mjs` on a built dist/.

import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pages served out of the embedded data (PlayerHost.cpp, HostRuntimeShared.h). */
export const EMBEDDED_PAGES = ['player.html', 'host.html'];

// A quoted, parenthesised or backticked file name of a kind a page loads, optionally led by ./ or
// ../ and a directory. What is captured is the name; it is looked for beside the page and in assets/.
const NAMED_FILE = /["'`(]\.{0,2}\/?((?:[\w.-]+\/)*[\w.-]+\.(?:js|mjs|css|wasm|woff2?|ttf|otf|png|svg|jpe?g|gif|webp|json))["'`)?#]/g;

const isText = (file) => /\.(?:html|js|mjs|css|json|svg)$/.test(file);

/** The files the pages' closure in Vite's manifest reaches, or none when there is no manifest. */
function manifestClosure(distDir, pages) {
  const file = path.join(distDir, '.vite', 'manifest.json');
  if (!existsSync(file)) return [];
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const out = new Set();
  const visit = (key) => {
    const entry = manifest[key];
    if (!entry || out.has(entry.file)) return;
    out.add(entry.file);
    for (const css of entry.css ?? []) out.add(css);
    for (const asset of entry.assets ?? []) out.add(asset);
    for (const next of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) visit(next);
  };
  pages.forEach(visit);
  return [...out];
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * The files of `distDir` the pages can reach, and the public files, as relative paths. Throws when a
 * page is missing: an embedded bundle without its page is a blank plug-in.
 */
export function reachableFiles(distDir, { pages = EMBEDDED_PAGES, publicDir = null } = {}) {
  // Vite's own bookkeeping (.vite/) is read, never served.
  const all = new Set(filesUnder(distDir).filter((file) => !file.startsWith('.vite/')));
  // Vite emits unique basenames, which is also why the C++ looks a file up by basename alone. A name
  // two built files share is refused when it is reached, not resolved to one of them.
  const byBasename = new Map();
  for (const file of all) {
    const name = path.posix.basename(file);
    byBasename.set(name, byBasename.has(name) ? null : file);
  }
  const resolve = (named) => {
    const name = path.posix.basename(named);
    if (byBasename.get(name) === null) throw new Error(`two built files are named ${name}; the player finds a file by its name alone`);
    return byBasename.get(name);
  };
  const seen = new Set();
  const queue = [];
  for (const page of pages) {
    if (!all.has(page)) throw new Error(`${page} is not in ${distDir}; run vite build first`);
    queue.push(page);
  }
  for (const file of manifestClosure(distDir, pages)) if (all.has(file)) queue.push(file);
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!isText(file)) continue;
    const text = readFileSync(path.join(distDir, file), 'utf8');
    for (const match of text.matchAll(NAMED_FILE)) {
      const named = resolve(match[1]);
      if (named && !seen.has(named)) queue.push(named);
    }
  }
  if (publicDir && existsSync(publicDir)) {
    for (const file of filesUnder(publicDir)) if (all.has(file)) seen.add(file);
  }
  return [...seen].sort();
}

/**
 * Writes each reachable file of `distDir` into `outDir` as `<basename>.gz`, after emptying it.
 * Returns `{ files, bytes, compressed }`.
 */
export function writeEmbeddedBundle(distDir, outDir, options = {}) {
  const files = reachableFiles(distDir, options);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  let compressed = 0;
  const names = new Set();
  for (const file of files) {
    const name = `${path.posix.basename(file)}.gz`;
    if (names.has(name)) throw new Error(`two embedded files are named ${path.posix.basename(file)}; the player finds a file by its name alone`);
    names.add(name);
    const data = readFileSync(path.join(distDir, file));
    // mtime 0 in the gzip header (zlib's default), so the same build writes the same bytes.
    const packed = gzipSync(data, { level: 9 });
    writeFileSync(path.join(outDir, name), packed);
    bytes += data.length;
    compressed += packed.length;
  }
  return { files, bytes, compressed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.join(web, 'dist');
  const out = path.join(web, 'dist-embed');
  const { files, bytes, compressed } = writeEmbeddedBundle(dist, out, { publicDir: path.join(web, 'public') });
  const total = filesUnder(dist).reduce((sum, file) => sum + statSync(path.join(dist, file)).size, 0);
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  console.log(`dist-embed: ${files.length} files the player and host pages reach, ${mb(bytes)} of dist's ${mb(total)}, ${mb(compressed)} compressed`);
}
