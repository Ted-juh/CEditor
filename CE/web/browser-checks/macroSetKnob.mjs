/**
 * A Macro's knob is its set's knob (utils/macroKnob.js), checked where it is drawn.
 *
 * The model tests prove the Macro hosts a Knob resolved through the set. They cannot see whether
 * the canvas draws it: inside the Macro, at the Macro's value, under the Macro's caption, without
 * becoming a control of its own that hit-testing, selection or the scenery could find. So for a
 * spread of knob forms this mounts a Macro beside a plain Knob and asserts:
 *
 *   - the Macro draws the same knob form the Knob does, and Graphite's Macro draws its own;
 *   - that knob sits at the Macro's value, not at a Knob's default;
 *   - it adds no `data-control-id` and takes no pointer events;
 *   - an author's 'own' keeps the Macro's knob under any set.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
// Slider-drawn (Ceramic), and anatomy forms with a body, a dial, line-work and a new-style form.
const SETS = ['ceramic', 'tolex', 'neon', 'machined', 'ivory', 'blueprint', 'chicken-head', 'atlas'];

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
const page = await browser.newPage({ viewport: { width: 600, height: 300 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));

// What the Macro and the Knob draw: the knob form (an anatomy's data-form, or 'slider' for a knob
// drawn by the slider renderer) and the anatomy's position.
async function look(shown) {
  await page.waitForFunction((n) => document.querySelectorAll('[data-control-id]').length >= n, shown.controls, { timeout: 30000 });
  await page.waitForTimeout(400);
  return page.evaluate(({ macroId, knobId }) => {
    const element = (id) => document.querySelector(`[data-control-id="${id}"]`);
    const form = (root) => {
      const anatomy = root?.querySelector('svg.anatomy');
      if (anatomy) return { form: anatomy.getAttribute('data-form'), position: Number(anatomy.getAttribute('data-position')) };
      return root?.querySelector('.slider-family-renderer') ? { form: 'slider', position: null } : null;
    };
    const macro = element(macroId);
    const hosted = macro?.querySelector('.canvas-control.embedded') ?? null;
    return {
      ids: document.querySelectorAll('[data-control-id]').length,
      hosted: hosted ? { ...form(hosted), pointerEvents: getComputedStyle(hosted).pointerEvents, id: hosted.getAttribute('data-control-id') } : null,
      knob: form(element(knobId)),
    };
  }, shown);
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/controlSetShot.html`);
  await page.waitForFunction(() => !!window.__controlSetShot, null, { timeout: 30000 });

  const graphite = await look(await page.evaluate(() => window.__controlSetShot.showMacro('graphite')));
  assert.equal(graphite.hosted, null, 'Graphite\'s Macro draws its own knob, as it always did');
  assert.equal(graphite.ids, 2);

  for (const id of SETS) {
    const seen = await look(await page.evaluate((set) => window.__controlSetShot.showMacro(set, { value: 0.62 }), id));
    assert.ok(seen.hosted, `${id}: the Macro hosts the set's knob`);
    assert.equal(seen.hosted.form, seen.knob?.form, `${id}: the Macro's knob is a ${seen.knob?.form}, the set's knob, not a ${seen.hosted.form}`);
    if (seen.hosted.position !== null) assert.ok(Math.abs(seen.hosted.position - 0.62) < 0.001, `${id}: the knob sits at the Macro's value, ${seen.hosted.position}`);
    assert.equal(seen.ids, 2, `${id}: the hosted knob is not a control anything can find`);
    assert.equal(seen.hosted.id, null);
    assert.equal(seen.hosted.pointerEvents, 'none', `${id}: the Macro, not its knob, takes the drag`);
    console.log(`  ok  ${id}: the Macro's knob is the set's ${seen.hosted.form}`);
  }

  const own = await look(await page.evaluate(() => window.__controlSetShot.showMacro('tolex', { knobDesign: 'own' })));
  assert.equal(own.hosted, null, 'an author\'s own knob stays under a set');
  const chosen = await look(await page.evaluate(() => window.__controlSetShot.showMacro('graphite', { knobDesign: 'set' })));
  assert.equal(chosen.hosted?.form, chosen.knob?.form, 'asking for the set\'s knob under Graphite draws Graphite\'s Knob');
  console.log('  ok  Graphite keeps its own knob; an author\'s choice wins either way');
  assert.deepEqual(errors, [], 'the page must render without throwing');
  console.log('macroSetKnob: the Macro hosts the set\'s knob in every form checked');
} finally {
  await browser.close();
  server.close();
}
