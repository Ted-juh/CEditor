/**
 * The clip a slider part's fill is cut by covers what the part's stroke covered (utils/shapeClip.js).
 *
 * The fill used to be cut by an SVG mask holding the stroked shape; WebKit does not apply that mask
 * to the fill's positioned layers, so it is cut by a clip now, and a clip has no stroke: an arc, a
 * line or a ring is given as the outline its stroke covers. This draws each both ways with the
 * browser's own SVG renderer — the stroke, and the outline filled — and holds them to the same
 * pixels: arcs either way round, short and long, nearly whole circles, every cap; lines at every
 * angle; rings. The knobs the renderer draws are held by the checks that draw them (anatomyForms,
 * macroSetKnob, controlSetShot).
 */
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The module imports nothing, so it runs in the page as it is, its exports made globals.
const source = (await readFile(join(HERE, '../src/CE_Application/utils/shapeClip.js'), 'utf8')).replace(/^export /gm, '');

const browser = await chromium.launch(chromiumLaunchOptions());
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setContent('<!doctype html><meta charset="utf-8"><title>shape clip</title><body></body>');
  await page.addScriptTag({ content: `${source}\nwindow.__clip = { parseCircularArc, arcStrokeOutline, lineStrokeOutline, ringOutline, clipShapeFor };` });

  const results = await page.evaluate(async () => {
    const SIZE = 160;
    // A seeded random, so a failure names a case that comes back.
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const draw = async (body) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${body}</svg>`;
      const image = new Image();
      image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = new OffscreenCanvas(SIZE, SIZE);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, SIZE, SIZE).data;
    };
    // Coverage of each: the pixels one paints and the other does not (alpha apart by more than an
    // edge's antialiasing can account for), against the area painted.
    const compare = async (stroked, filled) => {
      const a = await draw(stroked);
      const b = await draw(filled);
      let painted = 0; let apart = 0;
      for (let i = 3; i < a.length; i += 4) {
        if (a[i] > 127) painted += 1;
        if (Math.abs(a[i] - b[i]) > 160) apart += 1;
      }
      return { painted, apart };
    };
    const cases = [];
    const caps = ['round', 'butt', 'square'];
    for (let n = 0; n < 60; n += 1) {
      const cx = 80; const cy = 80;
      const r = 20 + rand() * 45;
      const width = 1 + rand() * Math.min(24, r * 1.6);
      const start = rand() * 360;
      const sweep = n === 0 ? 359.999 : n === 1 ? 0.5 : 1 + rand() * 358;
      const cw = rand() > 0.5;
      const end = start + (cw ? sweep : -sweep);
      const p = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
      const [sx, sy] = p(start);
      const [ex, ey] = p(end);
      const d = `M ${sx.toFixed(3)} ${sy.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${sweep > 180 ? 1 : 0} ${cw ? 1 : 0} ${ex.toFixed(3)} ${ey.toFixed(3)}`;
      const cap = caps[n % 3];
      const clip = window.__clip.clipShapeFor({ kind: 'path', d, strokeWidth: width, lineCap: cap });
      if (!clip) { cases.push({ kind: 'arc', d, width, cap, missing: true }); continue; }
      const result = await compare(
        `<path d="${d}" fill="none" stroke="#000" stroke-width="${width}" stroke-linecap="${cap}"/>`,
        `<path d="${clip.d}" fill="#000" fill-rule="${clip.rule}"/>`,
      );
      cases.push({ kind: 'arc', d, width, cap, ...result });
    }
    for (let n = 0; n < 24; n += 1) {
      const x1 = 20 + rand() * 120; const y1 = 20 + rand() * 120;
      const x2 = 20 + rand() * 120; const y2 = 20 + rand() * 120;
      const width = 1 + rand() * 20;
      const cap = caps[n % 3];
      const clip = window.__clip.clipShapeFor({ kind: 'line', x1, y1, x2, y2, strokeWidth: width, lineCap: cap });
      const result = await compare(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${width}" stroke-linecap="${cap}"/>`,
        `<path d="${clip.d}" fill="#000" fill-rule="${clip.rule}"/>`,
      );
      cases.push({ kind: 'line', d: `${x1},${y1} ${x2},${y2}`, width, cap, ...result });
    }
    for (let n = 0; n < 8; n += 1) {
      const r = 10 + rand() * 50; const width = 1 + rand() * 30;
      const clip = window.__clip.clipShapeFor({ kind: 'circle-stroke', cx: 80, cy: 80, r, strokeWidth: width });
      const result = await compare(
        `<circle cx="80" cy="80" r="${r}" fill="none" stroke="#000" stroke-width="${width}"/>`,
        `<path d="${clip.d}" fill="#000" fill-rule="${clip.rule}"/>`,
      );
      cases.push({ kind: 'ring', d: `r ${r}`, width, cap: '', ...result });
    }
    return cases;
  });

  check('every stroked shape a slider draws has an outline', () => {
    assert.deepEqual(results.filter((c) => c.missing), []);
  });
  // An outline and a stroke differ only where an edge's antialiasing falls a little differently:
  // never more than a pixel along each edge.
  const off = results.filter((c) => !c.missing && c.apart > Math.max(4, c.painted * 0.01));
  check(`the outline covers what the stroke covered: ${results.length} arcs, lines and rings, every cap`, () => {
    assert.deepEqual(off.map(({ kind, d, width, cap, painted, apart }) => ({ kind, d, width: +width.toFixed(2), cap, painted, apart })), []);
  });
  assert.deepEqual(errors, []);
  console.log('shapeClip: arcs, lines and rings cut by their outlines cover what their strokes did');
} finally {
  await browser.close();
}
