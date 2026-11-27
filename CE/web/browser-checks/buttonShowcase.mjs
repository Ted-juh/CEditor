/**
 * The Components showcase's Button panels (CE/panels/Components/Button/, scripts/componentPanels.js),
 * opened as File > Open opens them and played in Preview: each button wears one built-in preset
 * (utils/buttonPresets.js), drawn as its set draws a key, and this holds what the captions promise
 * of a key, which moves as a whole.
 *
 *   - Press: Sink sinks to 0.9 of its size while held. A button is made pressing to 0.985, and a
 *     preset's state used to keep that as though someone had chosen it (authorsStateValue.js).
 *     Lift grows under the pointer; Focus nod nods when Tab reaches it.
 *   - Gestures: a flick spins Spin round; the wheel bumps Wheel bump the way it turns.
 *   - Together: Pop in keeps each key hidden until its turn; a click on the first Ripple key runs a
 *     press along the row, the scene a click on a key plays.
 *
 *   node browser-checks/buttonShowcase.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 2200, height: 1200 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const PANELS = new URL('../../panels/Components/Button/', import.meta.url);

/** Open a showcase panel as File > Open does; its controls' ids by name. Preview off. */
async function open(name) {
  await kit.preview(false);
  const path = new URL(`Button ${name}.cepanel`, PANELS);
  const text = readFileSync(path, 'utf8');
  const ids = await page.evaluate(async ({ text, path }) => {
    const { deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const panel = deserializePanel(text, path, null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  }, { text, path: path.pathname });
  await kit.settle(600);
  return ids;
}
const inPreview = (id) => `.preview-surface [data-control-id="${id}"]`;
/** The key as drawn: its box on screen, its transform included, and its opacity. */
const box = (id) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, top: r.top, opacity: Number(getComputedStyle(el).opacity) };
}, inPreview(id));
/** Samples of one measure of a key, every `step` ms for `ms`. */
async function watch(id, measure, ms, step = 25) {
  const out = [];
  for (let t = 0; t < ms; t += step) { out.push(measure(await box(id))); await page.waitForTimeout(step); }
  return out;
}

try {
  await kit.fresh();

  // --- Press ------------------------------------------------------------------------------------
  let ids = await open('Press');
  await kit.preview(true);
  await kit.settle(800);
  await page.mouse.move(5, 5);
  const sinkRest = await box(ids.Sink);
  await page.mouse.move(sinkRest.x, sinkRest.y);
  await page.mouse.down();
  await kit.settle(300);
  const sunk = await box(ids.Sink);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await kit.settle(300);
  const risen = await box(ids.Sink);
  check('Press: Sink sinks to 0.9 of its size while held, not the 0.985 every button is made with', () => {
    assert.ok(Math.abs(sunk.width / sinkRest.width - 0.9) < 0.01, `${sunk.width} of ${sinkRest.width}`);
    assert.ok(Math.abs(risen.width - sinkRest.width) < 0.5, 'and rises as it is let go');
  });

  const liftRest = await box(ids.Lift);
  await page.mouse.move(liftRest.x, liftRest.y);
  await kit.settle(400);
  const lifted = await box(ids.Lift);
  await page.mouse.move(5, 5);
  check('Press: Lift grows toward you under the pointer, the whole key', () => {
    assert.ok(Math.abs(lifted.width / liftRest.width - 1.06) < 0.01, `${lifted.width} of ${liftRest.width}`);
  });

  // Tab from inside the panel: the keys are tab stops in their order, Focus nod the sixth.
  const surface = await page.evaluate(() => { const r = document.querySelector('.panel-surface.preview-surface').getBoundingClientRect(); return [r.right - 20, r.bottom - 10]; });
  await page.mouse.click(...surface);
  for (let k = 0; k < 5; k += 1) await page.keyboard.press('Tab');
  await kit.settle(300);
  const nodRest = await box(ids.FocusNod);
  await page.keyboard.press('Tab');
  const nod = await watch(ids.FocusNod, (b) => b.width, 420);
  await kit.settle(200);
  const nodAfter = await box(ids.FocusNod);
  check('Press: Focus nod nods once as Tab reaches it, and comes back to its size', () => {
    assert.ok(Math.max(...nod) / nodRest.width > 1.05, `${nod.map((w) => w.toFixed(0)).join(' ')}`);
    assert.ok(Math.abs(nodAfter.width - nodRest.width) < 0.5);
  });

  // --- Gestures ---------------------------------------------------------------------------------
  ids = await open('Gestures');
  await kit.preview(true);
  await kit.settle(800);
  const spin = await box(ids.Spin);
  await page.mouse.move(spin.x, spin.y);
  await page.mouse.down();
  // A flick is 600 px/s over the last 100 ms (gestureEvents.js).
  for (let k = 1; k <= 5; k += 1) { await page.mouse.move(spin.x + 18 * k, spin.y); await page.waitForTimeout(8); }
  await page.mouse.up();
  const turning = await watch(ids.Spin, (b) => b.height, 700, 30);
  check('Gestures: a flick spins Spin round, its box standing on end on the way', () => {
    // 200 by 100: turned a quarter, it stands 200 high, and more on the diagonal.
    assert.ok(Math.max(...turning) > 1.8 * spin.height, `${turning.map((h) => h.toFixed(0)).join(' ')}`);
    assert.ok(Math.abs(turning.at(-1) - spin.height) < 2, 'and comes round to rest');
  });

  const wheel = await box(ids.WheelBump);
  await page.mouse.move(wheel.x, wheel.y);
  await page.mouse.wheel(0, -100);
  const up = await watch(ids.WheelBump, (b) => b.top - wheel.top, 220, 15);
  check('Gestures: the wheel turned up bumps Wheel bump up', () => {
    assert.ok(Math.min(...up) < -3, `${up.map((d) => d.toFixed(1)).join(' ')}`);
  });

  // --- Together ---------------------------------------------------------------------------------
  ids = await open('Together');
  await kit.preview(true);
  await page.waitForTimeout(250);
  const early = await Promise.all([1, 6].map((k) => box(ids[`PopIn${k}`])));
  await kit.settle(1800);
  const settled = await Promise.all([1, 6].map((k) => box(ids[`PopIn${k}`])));
  check('Together: Pop in keeps each key hidden until its turn, then grows it in', () => {
    assert.ok(early[1].opacity < 0.05, `the last is still hidden at 250 ms: ${early[1].opacity}`);
    assert.ok(settled.every((b) => b.opacity > 0.99), 'all shown in the end');
    assert.ok(Math.abs(settled[0].width - settled[1].width) < 0.5, 'at their own size');
  });

  const ripple = await Promise.all([1, 4].map((k) => box(ids[`Ripple${k}`])));
  await page.mouse.click(ripple[0].x, ripple[0].y);
  const fourth = await watch(ids.Ripple4, (b) => b.width, 600, 20);
  check('Together: a click on the first Ripple key runs a press along the row', () => {
    assert.ok(Math.min(...fourth) < 0.93 * ripple[1].width, `${fourth.map((w) => w.toFixed(0)).join(' ')}`);
    assert.ok(Math.abs(fourth.at(-1) - ripple[1].width) < 0.5, 'and it settles');
  });

  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('buttonShowcase: all checks passed');
} finally {
  await kit.close();
}
