/**
 * Anatomy forms, checked where they are drawn: a button or switch reads at the sizes people give it
 * (utils/anatomyLayout.js), and the flat disc knob shows its value.
 *
 * The forms are drawn in a fixed 160 by 100 frame, device above caption. Scaled whole into a
 * button's usual 132 by 40, the frame met the box at 0.4: a sliver of a device and a 4px caption,
 * on every set that draws its buttons as forms. The layout unit test proves the arithmetic; this
 * proves the drawing, for a spread of forms across five sizes:
 *
 *   - a box too small for the frame sets its caption at 8px or more, inside the box;
 *   - the device is beside or above the caption, not under it, inside the box, and no smaller than
 *     the frame drew it;
 *   - a box the frame fits keeps the frame, caption and all, exactly as it was;
 *   - no caption in the drawing falls back to the page's serif;
 *   - Graphite's knob (the disc, drawn with the knob's own parts since the forms became parts,
 *     models/knobFormParts.js) draws its value as an arc on its track that ends where its pointer
 *     points, and one of no length at zero. The disc form drew only the pointer, once.
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
// Generic forms (Blueprint's crosskey and knife, Soft's cushion), additional ones (Arcade, Atlas),
// a physical one (Chicken-head) and Tolex's typewriter key and lever.
const SETS = ['blueprint', 'soft', 'tolex', 'arcade', 'atlas', 'chicken-head'];

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
const page = await browser.newPage({ viewport: { width: 920, height: 300 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));

function measure(ids) {
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  return ids.map((id, i) => {
    const root = document.querySelector(`[data-control-id="${id}"]`);
    const svg = root?.querySelector('svg.anatomy');
    if (!svg) return { id, form: null };
    // The caption is the text that carries the control's words, wherever the drawing put it.
    const words = i % 2 ? 'LEGATO' : 'TRIGGER';
    const caption = [...svg.querySelectorAll('text')].find((t) => t.textContent.trim().startsWith(words));
    const device = svg.querySelector(':scope > g');
    const serif = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim() && /serif/.test(getComputedStyle(t).fontFamily) && !/sans-serif|monospace/.test(getComputedStyle(t).fontFamily));
    return {
      id,
      form: svg.getAttribute('data-form'),
      control: box(root.getBoundingClientRect()),
      // Its size on screen: its font size in the drawing's units, times the drawing's scale.
      caption: caption ? { ...box(caption.getBoundingClientRect()), size: parseFloat(getComputedStyle(caption).fontSize) * caption.getScreenCTM().a, text: caption.textContent } : null,
      frame: (svg.getAttribute('viewBox') ?? '').startsWith('0 0 160 '),
      device: device ? box(device.getBoundingClientRect()) : null,
      scale: Number((device?.getAttribute('transform') ?? '').match(/scale\(([\d.]+)\)/)?.[1] ?? NaN),
      serif: serif.map((t) => t.textContent.trim()),
    };
  });
}

const inside = (inner, outer, slack = 1) => inner.x >= outer.x - slack && inner.y >= outer.y - slack
  && inner.x + inner.w <= outer.x + outer.w + slack && inner.y + inner.h <= outer.y + outer.h + slack;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/controlSetShot.html`);
  await page.waitForFunction(() => !!window.__controlSetShot, null, { timeout: 30000 });
  for (const id of SETS) {
    const shown = await page.evaluate((set) => window.__controlSetShot.showButtons(set), id);
    await page.waitForFunction((n) => document.querySelectorAll('[data-control-id]').length >= n, shown.controls, { timeout: 30000 });
    await page.evaluate(() => window.__controlSetShot.fontsReady());
    await page.waitForTimeout(300);
    const seen = await page.evaluate(measure, shown.ids);
    seen.forEach((c, i) => {
      const [w, h] = shown.sizes[Math.floor(i / 2)];
      const where = `${id} ${i % 2 ? 'switch' : 'button'} ${w}x${h} (${c.form})`;
      assert.ok(c.form, `${where}: drawn as an anatomy form`);
      assert.deepEqual(c.serif, [], `${where}: a caption in the page's serif`);
      assert.ok(c.caption, `${where}: a caption`);
      if (Math.min(w / 160, h / 100) >= 8 / 11) {
        assert.ok(c.frame, `${where}: the frame fits, and is kept`);
        return;
      }
      assert.ok(c.caption.size >= 8, `${where}: caption ${c.caption.size.toFixed(1)}px`);
      assert.ok(inside(c.caption, c.control), `${where}: caption inside the box`);
      assert.ok(overlap(c.caption, c.device) <= 0.05 * c.caption.w * c.caption.h, `${where}: the device sits on its caption`);
      // The caption grew; the device must not have shrunk for it. The frame drew it at the scale
      // that fitted the whole frame, caption and all, into the box.
      const before = Math.min(w / 160, h / 100);
      assert.ok(c.scale >= 0.9 * before, `${where}: device at ${c.scale}, the frame drew it at ${before.toFixed(3)}`);
      assert.ok(inside(c.device, c.control, 2), `${where}: device inside the box`);
    });
    console.log(`  ok  ${id}: buttons and switches read at ${shown.sizes.map(([w, h]) => `${w}x${h}`).join(', ')}`);
  }

  // Graphite's knob, at the specimen's values and at zero: the arc's end and the pointer line lie on
  // one ray from the centre.
  const knobs = async () => {
    await page.waitForTimeout(400);
    return page.evaluate(() => [...document.querySelectorAll('svg.slider-svg')].map((svg) => {
      const pointer = svg.querySelector('line[data-pointer="current"]');
      return {
        arc: svg.querySelector('mask[id$="-bodyTrackFillArc"] path')?.getAttribute('d') ?? null,
        pointer: pointer ? ['x1', 'y1', 'x2', 'y2'].map((key) => Number(pointer.getAttribute(key))) : null,
      };
    }).filter((knob) => knob.pointer));
  };
  const shownSpecimen = await page.evaluate(() => window.__controlSetShot.show('graphite-studio'));
  await page.waitForFunction((n) => document.querySelectorAll('[data-control-id]').length >= n, shownSpecimen.controls, { timeout: 30000 });
  const atValue = await knobs();
  assert.ok(atValue.length >= 3, `the designed Graphite draws its knobs with a pointer line (${atValue.length})`);
  for (const knob of atValue) {
    assert.ok(knob.arc, 'a knob above zero draws its value');
    const [x, y] = knob.arc.trim().split(/[\s,A]+/).slice(-2).map(Number);
    const [x1, y1, x2, y2] = knob.pointer;
    const [px, py, qx, qy] = [x2 - x1, y2 - y1, x - x1, y - y1];
    const sine = (px * qy - py * qx) / (Math.hypot(px, py) * Math.hypot(qx, qy));
    assert.ok(Math.abs(sine) < 0.02 && px * qx + py * qy > 0, `the arc ends where the pointer points (${sine.toFixed(3)})`);
  }
  await page.evaluate(() => window.__controlSetShot.showMacro('graphite-studio', { value: 0 }));
  await page.waitForFunction(() => document.querySelectorAll('[data-control-id]').length >= 2, null, { timeout: 30000 });
  const atZero = await knobs();
  // At zero the arc has no length: it starts where it ends.
  const noLength = (d) => {
    const n = String(d ?? '').trim().split(/[\s,AM]+/).filter(Boolean).map(Number);
    return n.length < 4 || Math.hypot(n[0] - n.at(-2), n[1] - n.at(-1)) < 0.01;
  };
  assert.ok(atZero.length >= 1 && atZero.every((knob) => noLength(knob.arc)), `a knob at zero draws no arc: ${JSON.stringify(atZero)}`);
  console.log('  ok  Graphite\'s knob draws its value as an arc that ends where its pointer points');
  assert.deepEqual(errors, [], 'the page must render without throwing');
  console.log('anatomyForms: buttons and switches read at the sizes people give them; the knob shows its value');
} finally {
  await browser.close();
  server.close();
}
