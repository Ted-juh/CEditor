// inlineStandalone.mjs — turn the specimen page into one file that works anywhere.
//
//   node tools/scripts/displayDemos/inlineStandalone.mjs <page.html> <out.html>
//
// The page references its recordings by relative path, which is right when they are published
// beside it and useless the moment the file is sent to somebody on its own — a recipient gets five
// broken images and no way to tell that the GIFs were ever fine. So this rewrites every local
// `src` as a data URI and adds the document wrapper the artifact host normally supplies.
//
// It costs about a third in size (base64 is 4 bytes per 3) and buys a file that can be mailed,
// dropped on a desktop, or opened from a USB stick with no server and no sibling directory. That
// is the trade a standalone build is: bigger, and it cannot be broken by being moved.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const MIME = {
  gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
};

const [, , pagePath, outPath] = process.argv;
if (!pagePath || !outPath) {
  console.error('usage: inlineStandalone.mjs <page.html> <out.html>');
  process.exit(1);
}

// Assets sit next to the page's own directory when it is written, but these recordings live in
// docs/media — so look in both, page directory first.
const here = dirname(new URL(import.meta.url).pathname);
const searchDirs = [dirname(pagePath), join(here, '..', '..', '..', 'docs', 'media')];

let html = readFileSync(pagePath, 'utf8');
const inlined = [];

html = html.replace(/src="([^"]+)"/g, (whole, src) => {
  // Absolute URLs are somebody else's to serve; only local files can be carried along.
  if (/^(https?:|data:|\/\/)/.test(src)) return whole;
  const ext = src.split('.').pop().toLowerCase();
  const mime = MIME[ext];
  if (!mime) return whole;
  for (const dir of searchDirs) {
    try {
      const bytes = readFileSync(join(dir, basename(src)));
      inlined.push(`${basename(src)} (${(bytes.length / 1024).toFixed(0)} KB)`);
      return `src="data:${mime};base64,${bytes.toString('base64')}"`;
    } catch { /* try the next directory */ }
  }
  console.error(`  ! could not find ${src}`);
  return whole;
});

if (!inlined.length) {
  console.error('inlineStandalone: nothing was inlined — check the paths');
  process.exit(1);
}

// The artifact host wraps the page in a document and a small reset; a standalone file needs both
// spelled out. The reset is the same one, so the page lays out identically either way.
const title = (html.match(/<title>([^<]*)<\/title>/) ?? [, 'Display Specimens'])[1];
const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; background: #fff; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
${html}
</body>
</html>
`;

writeFileSync(outPath, out);
console.log(`inlined ${inlined.length}: ${inlined.join(', ')}`);
console.log(`wrote ${outPath} — ${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MB, title "${title}"`);
