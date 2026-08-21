/**
 * Where text lands inside a control, checked against the rule rather than against a baseline.
 *
 * Text placement is measured, not computed. `.text-span` is positioned from `domTextGlyphSize`,
 * read off the rendered glyph element, so the whole thing is a render-measure-reposition loop and
 * a server render cannot tell you where a single glyph ended up. Only a browser can, which is why
 * this lives outside `npm test`.
 *
 * NOT a pixel baseline. Font metrics differ between machines and a committed set of coordinates
 * would fail on the first box without this exact Arial. What is asserted instead is the contract
 * the placement code claims to implement:
 *
 *   - top justifications put the text block's top edge at the top padding
 *   - middle justifications centre it in the padded box
 *   - bottom justifications put its bottom edge at the bottom padding
 *   - left/centre/right order the text across the box, and never overlap the padding
 *
 * which holds whatever the font measures. This is the test the comment on textAxisCenter asked for
 * — "stay off this anchor math unless the text-position system is being redesigned" was a warning
 * from experience with nothing behind it, and the thing it warned about (Top/Center/Bottom drifting)
 * is exactly what these assertions catch.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

// The specimen box and its Label-default padding, mirrored from TextPlacement.svelte.
const BOX = { width: 160, height: 40 };
const PAD = { left: 8, right: 8, top: 4, bottom: 4 };
const TOL = 0.75;                       // sub-pixel: line boxes land on fractional heights

const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    res.writeHead(200, { 'content-type': TYPES[extname(req.url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/textPlacement.html`);
  await page.waitForFunction(() => !!window.__textPlacement, null, { timeout: 30000 });
  await page.waitForTimeout(600);          // let the measure-then-reposition loop settle

  const { rects, anchors, nodes } = await page.evaluate(() => ({
    rects: window.__textPlacement(),
    anchors: window.__anchorCount(),
    nodes: window.__nodeCount(),
  }));

  // Variants whose text fits the box on one line, so the contract's arithmetic is unambiguous.
  // `offset` carries its own Text.Position nudge, which the contract has to account for.
  const SIMPLE = { plain: { x: 0, y: 0 }, spaced: { x: 0, y: 0 }, underlined: { x: 0, y: 0 }, offset: { x: 7, y: -5 } };
  const failures = [];

  for (const [variant, nudge] of Object.entries(SIMPLE)) {
    for (const justification of ['topLeft', 'top', 'topRight', 'left', 'centred', 'right',
                                 'bottomLeft', 'bottom', 'bottomRight']) {
      const entry = rects[`${variant}__${justification}`];
      assert.ok(entry?.glyphBox, `no measurement for ${variant}__${justification}`);
      const [, top, , height] = entry.glyphBox;

      const inner = BOX.height - PAD.top - PAD.bottom;
      let want;
      if (justification.startsWith('top')) want = PAD.top;
      else if (justification.startsWith('bottom')) want = BOX.height - PAD.bottom - height;
      else want = PAD.top + (inner - height) / 2;
      want += nudge.y;

      if (Math.abs(top - want) > TOL) {
        failures.push(`${variant}__${justification}: text top at ${top}, contract says ${Math.round(want * 100) / 100}`);
      }
    }
  }

  // Horizontal ordering, for every variant — cheaper than reproducing each one's text metrics, and
  // it still catches a justification that stopped working or flipped.
  for (const variant of new Set(Object.keys(rects).map((k) => k.split('__')[0]))) {
    const inkX = (j) => rects[`${variant}__${j}`]?.ink?.[0];
    for (const [l, c, r] of [['topLeft', 'top', 'topRight'], ['left', 'centred', 'right'], ['bottomLeft', 'bottom', 'bottomRight']]) {
      const [a, b, d] = [inkX(l), inkX(c), inkX(r)];
      if (a === undefined || b === undefined || d === undefined) continue;
      if (!(a <= b + TOL && b <= d + TOL)) failures.push(`${variant}: ${l}/${c}/${r} are out of order across the box (${a}, ${b}, ${d})`);
      if (a < PAD.left - TOL) failures.push(`${variant}__${l}: text starts at ${a}, inside the ${PAD.left}px padding`);
    }
  }

  assert.deepEqual(failures, [], `text placement broke its own contract:\n  ${failures.join('\n  ')}`);

  // Checked after the contract, so that reintroducing the separate anchor fails on what it does to
  // the text rather than on its mere existence. A wrapper that placed text correctly would be fine.
  assert.equal(anchors, 0,
    'a separate .text-anchor element is back — an inline-block inside it is baseline-shifted, which '
    + 'pushes short single-line text down inside its own box');
  assert.deepEqual(errors, [], `the page logged errors: ${errors.join(' | ')}`);
  console.log(`text placement: ok (${Object.keys(rects).length} cases, ${nodes} nodes, no separate anchor element)`);
} catch (error) {
  failed = true;
  console.error('text placement: FAILED\n', error.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
