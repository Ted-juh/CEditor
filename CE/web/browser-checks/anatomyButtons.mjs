/**
 * A button or switch drawn as an anatomy form reads at the sizes people give it
 * (utils/anatomyLayout.js), checked where it is drawn.
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
 *   - no caption in the drawing falls back to the page's serif.
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
  assert.deepEqual(errors, [], 'the page must render without throwing');
  console.log('anatomyButtons: anatomy buttons and switches read at the sizes people give them');
} finally {
  await browser.close();
  server.close();
}
