/**
 * Create Component from Selection, driven in Chromium: `node browser-checks/fromSelection.mjs` after
 * `vite build --config browser-checks/vite.config.mjs`. The harness entry has the scenario; this
 * compares the panel before and after the command, pixel by pixel.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const QA = join(dirname(fileURLToPath(import.meta.url)), '../../qa');
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const body = await readFile(path.startsWith('/qa/') ? join(QA, path.slice(4)) : join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(req.url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// --disable-lcd-text: Chromium draws text in a composited layer with greyscale anti-aliasing and
// other text with sub-pixel (coloured) anti-aliasing. A component's text can land in such a layer,
// so the same glyphs would compare as different colours. One smoothing mode for both shots keeps the
// comparison about the design, not about which layer the compositor picked.
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));

await page.goto(`http://127.0.0.1:${server.address().port}/fromSelection.html`);
await page.waitForFunction(() => window.__fromSelection);
await page.waitForTimeout(800);
const state = await page.evaluate(() => window.__fromSelection);
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

check('the selection becomes one linked component, saved to the library and selected', () => {
  assert.equal(state.ok, true, JSON.stringify(state.refused));
  assert.deepEqual(state.afterControls, ['CustomComponent:Plate']);
  assert.deepEqual(state.library, ['Plate@1.0.0']);
  assert.equal(state.linked, true);
  assert.equal(state.selected.length, 1);
});

/** Two element screenshots compared in the page; the diff image goes beside them. */
async function compare(pageRef, label) {
  const before = await pageRef.locator('#before .panel').screenshot();
  const after = await pageRef.locator('#after .panel').screenshot();
  await writeFile(join(ROOT, `${label}-before.png`), before);
  await writeFile(join(ROOT, `${label}-after.png`), after);
  const diff = await pageRef.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.min(ia.width, ib.width);
    const h = Math.min(ia.height, ib.height);
    const pixels = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const pa = pixels(ia);
    const pb = pixels(ib);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d'); const img = ctx.createImageData(w, h);
    // STRICT counts every pixel that differs. SHIFTED forgives a pixel whose value appears within one
    // pixel of the same place in the other image: the label renderer centres text in a measured 1.2
    // line box and the part renderer in a 1.0 one, and the two round a half-pixel differently at some
    // sizes. A wrong colour, missing glyphs or another font still fails SHIFTED; a rounding does not.
    const near = (p, q, i) => Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) <= 48;
    const matchesAround = (p, q, x, y) => {
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (Math.max(Math.abs(p[(y * w + x) * 4] - q[j]), Math.abs(p[(y * w + x) * 4 + 1] - q[j + 1]), Math.abs(p[(y * w + x) * 4 + 2] - q[j + 2])) <= 48) return true;
      }
      return false;
    };
    let strict = 0;
    let bad = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const differs = !near(pa, pb, i);
        const off = differs && (!matchesAround(pa, pb, x, y) || !matchesAround(pb, pa, x, y));
        if (differs) strict += 1;
        if (off) bad += 1;
        img.data[i] = off ? 255 : (differs ? 255 : pa[i] / 3);
        img.data[i + 1] = off ? 0 : (differs ? 200 : pa[i + 1] / 3);
        img.data[i + 2] = off ? 0 : (differs ? 0 : pa[i + 2] / 3);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { bad, strict, total: w * h, size: [ia.width, ia.height, ib.width, ib.height], png: out.toDataURL('image/png') };
  }, [`data:image/png;base64,${before.toString('base64')}`, `data:image/png;base64,${after.toString('base64')}`]);
  await writeFile(join(ROOT, `${label}-diff.png`), Buffer.from(diff.png.split(',')[1], 'base64'));
  return { ...diff, share: diff.bad / diff.total };
}

const diff = await compare(page, 'fromSelection');
console.log(`      ${diff.bad} of ${diff.total} pixels differ beyond a 1px shift (${(diff.share * 100).toFixed(3)}%); ${diff.strict} strictly`);
check('and the component looks like what was selected, pixel for pixel', () => {
  assert.deepEqual(diff.size.slice(0, 2), diff.size.slice(2), 'same size');
  assert.ok(diff.share < 0.0005, `${(diff.share * 100).toFixed(3)}% of pixels differ — see dist-scenery/fromSelection-diff.png`);
});

// --- Real panels ------------------------------------------------------------------------------------

for (const file of ['QA-06-roland-gaia.cepanel', 'QA-04-scripting.cepanel', 'QA-03-states.cepanel']) {
  const qa = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  qa.on('pageerror', (error) => failures.push(`${file}: ${error}`));
  await qa.goto(`http://127.0.0.1:${server.address().port}/fromSelectionQa.html`);
  await qa.waitForFunction(() => window.__qa);
  const run = await qa.evaluate((f) => window.__qa.run(f), file);
  await qa.waitForTimeout(1500);
  const result = await compare(qa, `fromSelection-${file.replace('.cepanel', '')}`);
  console.log(`      ${file}: ${run.converted} of ${run.offered} labels into one component; ${result.bad} of ${result.total} pixels differ beyond a 1px shift (${(result.share * 100).toFixed(3)}%); ${result.strict} strictly`);
  if (Object.keys(run.reasons).length) console.log(`        refused: ${JSON.stringify(run.reasons)}`);
  check(`${file}: the labels it accepts become one component that looks the same`, () => {
    assert.equal(run.ok, true);
    assert.ok(run.converted > 0);
    assert.equal(run.after, run.before - run.converted + 1);
    assert.deepEqual(result.size.slice(0, 2), result.size.slice(2));
    assert.ok(result.share < 0.0005, `${(result.share * 100).toFixed(3)}% differ — see dist-scenery/fromSelection-${file.replace('.cepanel', '')}-diff.png`);
  });
  await qa.close();
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('component from selection: all checks passed');
