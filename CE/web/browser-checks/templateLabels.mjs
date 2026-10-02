/**
 * Every New Panel template under every built-in control set: no caption is cut off.
 *
 * The templates' labels were sized for Graphite's 12px Arial. A set's own lettering is often
 * bolder, wider or letter-spaced, and a word that fitted there wrapped onto a second line here,
 * which a 16px box cut off: 181 labels across all 78 sets at the template's own size, and 928 once
 * the dialog scaled a template down to the Control bar preset, where the unscaled padding left no
 * room at all. Whether text fits is a question about the real faces, so it is asked in a browser.
 *
 * For each template, set and size: every Label's text is one line, and its glyphs — measured as a
 * text range, not the span around them, which is sized to the box whatever it holds — sit inside
 * the control's box. One deliberately over-long caption must come back shrunk and inside its box,
 * or the measurement has gone blind and the green result means nothing.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, url));
    res.writeHead(200, { 'content-type': TYPES[extname(url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));

// Each Label's text: its line count, the shrink scale on its span, and how far its glyphs reach
// past the control's box (negative = inside).
function measureLabels(ids) {
  const scaleOf = (el) => {
    const m = el ? getComputedStyle(el).transform : 'none';
    return m && m.startsWith('matrix(') ? Math.hypot(...m.slice(7, -1).split(',').slice(0, 2).map(Number)) : 1;
  };
  return ids.map(({ id, text }) => {
    const control = document.querySelector(`.canvas-control[data-control-id="${CSS.escape(id)}"]`);
    const glyphs = control?.querySelector('.text-glyphs');
    if (!glyphs) return { id, text, missing: true };
    const box = control.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(glyphs);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const reach = rects.length ? Math.max(
      box.left - Math.min(...rects.map((r) => r.left)), Math.max(...rects.map((r) => r.right)) - box.right,
      box.top - Math.min(...rects.map((r) => r.top)), Math.max(...rects.map((r) => r.bottom)) - box.bottom,
    ) : 0;
    return {
      id, text,
      lines: glyphs.querySelectorAll('.text-line').length || 1,
      scale: scaleOf(glyphs) * scaleOf(glyphs.parentElement),
      reach: Math.round(reach * 10) / 10,
    };
  });
}

const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/controlSetShot.html`);
  await page.waitForFunction(() => !!window.__controlSetShot);
  const { templateIds, templateSizes, sizePresets, builtInSetIds } = await page.evaluate(() => {
    const h = window.__controlSetShot;
    return { templateIds: h.templateIds, templateSizes: h.templateSizes, sizePresets: h.sizePresets, builtInSetIds: h.builtInSetIds };
  });
  assert.ok(builtInSetIds.length >= 70, `expected the whole catalogue, got ${builtInSetIds.length} sets`);

  // Load every face once, up front: a measurement in the fallback face proves nothing.
  for (const setId of builtInSetIds) await page.evaluate((id) => window.__controlSetShot.show(id), setId);
  await page.evaluate(() => window.__controlSetShot.fontsReady());

  // The proof the check can see a caption that does not fit. Measured first, asserted last, so a
  // failing run reports the sweep as well.
  const shownLong = await page.evaluate(() => window.__controlSetShot.showTemplate('synth', 'tolex', { firstLabelText: 'A CAPTION FAR TOO LONG FOR ITS BOX' }));
  await settle();
  const [long] = await page.evaluate(measureLabels, shownLong.labels);

  // The dialog scales a template by min(1, width / its width, height / its height); the preset
  // that makes that smallest is a different one for a tall strip than for a wide synth.
  const scaleFor = (t, size) => Math.min(1, size.width / t.width, size.height / t.height);
  const mostShrinking = (t) => sizePresets.reduce((a, b) => (scaleFor(t, b) < scaleFor(t, a) ? b : a));
  const problems = [];
  let measured = 0;
  for (const templateId of templateIds) {
    // At the template's own size, and scaled down to the preset that shrinks it most.
    const own = templateSizes[templateId];
    const sizes = [own, mostShrinking(own)];
    for (const size of sizes) {
      for (const setId of builtInSetIds) {
        const shown = await page.evaluate(([t, s, z]) => window.__controlSetShot.showTemplate(t, s, z), [templateId, setId, size]);
        if (!shown.labels.length) break;
        await settle();
        for (const label of await page.evaluate(measureLabels, shown.labels)) {
          measured += 1;
          if (label.missing || label.lines > 1 || label.reach > 1) {
            problems.push(`${templateId} ${shown.width}x${shown.height} ${setId} "${label.text}": ${label.missing ? 'not rendered' : `${label.lines} lines, ${label.reach}px past its box`}`);
          }
        }
      }
    }
  }
  assert.ok(measured > 1000, `measured ${measured} labels`);
  assert.deepEqual(problems.slice(0, 20), [], `${problems.length} of ${measured} template captions are cut off`);
  console.log(`  ok  ${measured} template captions across ${builtInSetIds.length} sets, every one on one line and inside its box`);
  assert.ok(!long.missing, 'the over-long caption rendered');
  assert.ok(long.scale < 0.9, `an over-long caption shrinks (scale ${long.scale.toFixed(3)})`);
  assert.ok(long.reach <= 1, `and then fits its box (reaches ${long.reach}px past it)`);
  console.log(`  ok  an over-long caption shrinks to ${long.scale.toFixed(2)} and fits, so the sweep can see one that would not`);
  assert.deepEqual(errors, []);
  console.log('  ok  no page errors');
} finally {
  await browser.close();
  server.close();
}
