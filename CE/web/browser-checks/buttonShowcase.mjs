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
 *   - The second half, on a key's own parts (editor/ButtonDeviceParts.svelte): Lamp fade eases the
 *     lamp up rather than snapping it; Flare grows the lamp and whitens it; From the synth flashes
 *     when its script switches it, the script loaded and running; Key lights eases the key off;
 *     the O / I legend rolls; Ink flash colours the caption; Alert's script blinks the lamp red.
 *   - Thrown: a click throws "+1" up from the key, fading as it rises; a click on Count throws how
 *     many there have been.
 *   - Hold: held, a timed button's lamp fills green over its hold and flashes as it fires; let go
 *     early, it goes straight back; held to the end, Confirmed throws OK.
 *   - Together: Pop in keeps each key hidden until its turn; a click on the first Ripple key runs a
 *     press along the row, the scene a click on a key plays; Chase lights one key's bar at a time.
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
/** A part of a key as drawn: the fill it paints, and its moving group's scale. */
const partOf = (id, name) => page.evaluate(({ sel, name }) => {
  const part = document.querySelector(`${sel} [data-part="${name}"]`);
  const shape = part?.querySelector('path, text');
  const moves = part?.querySelector('[data-part-moves]');
  const scale = moves ? getComputedStyle(moves).scale : 'none';
  return { fill: shape ? getComputedStyle(shape).fill : '', scale: scale === 'none' ? 1 : Number(scale), animated: shape ? shape.getAnimations().length > 0 : false };
}, { sel: inPreview(id), name });
const captionOf = (id) => page.evaluate((sel) => {
  const text = [...document.querySelectorAll(`${sel} svg text`)].at(-1);
  return { colour: getComputedStyle(text).color, animated: text.getAnimations().length > 0 };
}, inPreview(id));
async function partSeries(id, name, ms, step = 40) {
  const out = [];
  for (let t = 0; t < ms; t += step) { out.push(await partOf(id, name)); await page.waitForTimeout(step); }
  return out;
}
/** Its scripts trusted for the session, as the bar at the foot of the window offers. */
async function trustScripts() {
  const button = page.getByRole('button', { name: 'Enable scripts for this session' });
  if (await button.count()) { await button.first().click(); await kit.settle(600); }
}
const scriptErrors = () => page.evaluate(async () => {
  const { scriptTrace } = await window.__ceImport('/src/CE_Application/stores/scriptConsole.js');
  let trace; scriptTrace.subscribe((v) => { trace = v; })();
  return (trace ?? []).filter((t) => t.kind === 'error').map((t) => String(t.message ?? ''));
});

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

  // --- Light ------------------------------------------------------------------------------------
  ids = await open('Light');
  await kit.preview(true);
  await kit.settle(800);
  await trustScripts();
  await page.mouse.move(5, 5);
  const fade = await box(ids.LampFade);
  const unlit = (await partOf(ids.LampFade, 'indicator')).fill;
  await page.mouse.click(fade.x, fade.y - fade.height * 0.15);
  const fading = (await partSeries(ids.LampFade, 'indicator', 560)).map((p) => p.fill);
  check('Light: Lamp fade eases the lamp up rather than snapping it', () => {
    assert.ok(new Set(fading).size >= 4, `${unlit} then ${[...new Set(fading)].join(' / ')}`);
    assert.notEqual(fading.at(-1), unlit, 'and it ends lit');
  });
  const flare = await box(ids.Flare);
  await page.mouse.move(flare.x, flare.y - flare.height * 0.15);
  await page.mouse.down();
  const flaring = await partSeries(ids.Flare, 'indicator', 420, 25);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  check('Light: Flare grows the lamp and whitens it as it lights', () => {
    assert.ok(Math.max(...flaring.map((p) => p.scale)) > 1.35, flaring.map((p) => p.scale).join(' '));
    assert.ok(flaring.some((p) => p.animated));
  });
  const synth = await partSeries(ids.FromTheSynth, 'indicator', 3600, 50);
  const lightErrors = await scriptErrors();
  check('Light: From the synth flashes when its script switches it, the script loaded', () => {
    assert.deepEqual(lightErrors, []);
    assert.ok(Math.max(...synth.map((p) => p.scale)) > 1.5, 'a flash within one switch');
  });

  // --- Switch -----------------------------------------------------------------------------------
  ids = await open('Switch');
  await kit.preview(true);
  await kit.settle(800);
  await page.mouse.move(5, 5);
  const lit = (await partOf(ids.KeyLights, 'key')).fill;
  const keyLights = await box(ids.KeyLights);
  await page.mouse.click(keyLights.x, keyLights.y - keyLights.height * 0.15);
  const easing = (await partSeries(ids.KeyLights, 'key', 420)).map((p) => p.fill);
  check('Switch: Key lights starts on, lit, and eases the key back as it goes off', () => {
    assert.ok(new Set(easing).size >= 4, `${lit} then ${[...new Set(easing)].join(' / ')}`);
    assert.notEqual(easing.at(-1), lit);
  });

  // --- Words ------------------------------------------------------------------------------------
  ids = await open('Words');
  await kit.preview(true);
  await kit.settle(800);
  await page.mouse.move(5, 5);
  const oi = await box(ids.OIRoll);
  await page.mouse.click(oi.x, oi.y - oi.height * 0.15);
  await page.waitForTimeout(60);
  const rolling = await partOf(ids.OIRoll, 'legend');
  await page.mouse.move(5, 5);
  const ink = await box(ids.InkFlash);
  const inkRest = (await captionOf(ids.InkFlash)).colour;
  await page.mouse.click(ink.x, ink.y - ink.height * 0.15);
  await page.waitForTimeout(80);
  const inked = await captionOf(ids.InkFlash);
  check('Words: the O / I legend rolls as it switches, and Ink flash colours the caption', () => {
    assert.ok(rolling.animated, 'the legend\'s words move');
    assert.ok(inked.animated && inked.colour !== inkRest, `${inkRest} → ${inked.colour}`);
  });

  // --- Signals ----------------------------------------------------------------------------------
  ids = await open('Signals');
  await kit.preview(true);
  await kit.settle(600);
  await trustScripts();
  const alerting = await partSeries(ids.Alert, 'indicator', 5200, 80);
  const signalErrors = await scriptErrors();
  check('Signals: Alert\'s script blinks the lamp red', () => {
    assert.deepEqual(signalErrors, []);
    assert.ok(alerting.some((p) => p.fill === 'rgb(229, 72, 77)'), [...new Set(alerting.map((p) => p.fill))].join(' / '));
  });

  // --- Thrown -----------------------------------------------------------------------------------
  const wordsOf = (id) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .key-word`)].map((word) => {
    const r = word.getBoundingClientRect();
    return { text: word.textContent.trim(), y: r.y, opacity: Number(getComputedStyle(word).opacity) };
  }), inPreview(id));
  ids = await open('Thrown');
  await kit.preview(true);
  await kit.settle(800);
  await page.mouse.move(5, 5);
  const plus = await box(ids.PlusOne);
  await page.mouse.click(plus.x, plus.y - plus.height * 0.15);
  await page.waitForTimeout(60);
  const thrownEarly = await wordsOf(ids.PlusOne);
  await page.waitForTimeout(600);
  const thrownLate = await wordsOf(ids.PlusOne);
  const tally = await box(ids.Count);
  for (let k = 0; k < 3; k += 1) { await page.mouse.click(tally.x, tally.y - tally.height * 0.15); await page.waitForTimeout(120); }
  const counted = (await wordsOf(ids.Count)).map((word) => word.text);
  check('Thrown: a click throws "+1" up from the key, fading as it rises; Count counts', () => {
    assert.deepEqual(thrownEarly.map((word) => word.text), ['+1']);
    assert.ok(thrownLate[0].y < thrownEarly[0].y - 15, `it rises: ${thrownEarly[0].y} → ${thrownLate[0].y}`);
    assert.ok(thrownLate[0].opacity < thrownEarly[0].opacity, 'and fades');
    assert.deepEqual(counted, ['1', '2', '3']);
  });

  // --- Hold -------------------------------------------------------------------------------------
  ids = await open('Hold');
  await kit.preview(true);
  await kit.settle(800);
  await page.mouse.move(5, 5);
  const fills = await box(ids.LampFills);
  const restLamp = await partOf(ids.LampFills, 'indicator');
  await page.mouse.move(fills.x, fills.y - fills.height * 0.15);
  await page.mouse.down();
  const filling = await partSeries(ids.LampFills, 'indicator', 1400, 100);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await kit.settle(900);
  await page.mouse.move(fills.x, fills.y - fills.height * 0.15);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(80);
  const letGo = await partOf(ids.LampFills, 'indicator');
  await page.mouse.move(5, 5);
  const confirm = await box(ids.Confirmed);
  await page.mouse.move(confirm.x, confirm.y - confirm.height * 0.15);
  await page.mouse.down();
  await page.waitForTimeout(1650);
  await page.mouse.up();
  const ok = (await wordsOf(ids.Confirmed)).map((word) => word.text);
  check('Hold: the lamp fills over the hold, goes back if let go early, and Confirmed throws OK when it fires', () => {
    const scales = filling.map((p) => p.scale);
    assert.ok(scales.every((scale, i) => i === 0 || scale >= scales[i - 1] - 0.001), `it grows steadily: ${scales.join(' ')}`);
    assert.ok(Math.max(...scales) > 1.2, 'most of the way by the end of the hold');
    assert.equal(new Set(filling.map((p) => p.fill)).size > 4, true, 'its colour moves toward green');
    assert.equal(letGo.fill, restLamp.fill, 'let go early, the lamp is as it was');
    assert.equal(letGo.scale, 1);
    assert.deepEqual(ok, ['OK']);
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

  const lights = [];
  for (let t = 0; t < 1500; t += 50) {
    lights.push(await page.evaluate((sels) => sels.filter((sel) => getComputedStyle(document.querySelector(`${sel} [data-part="symbol"] path`)).fill === 'rgb(255, 179, 71)').length,
      [1, 2, 3, 4, 5, 6].map((k) => inPreview(ids[`Chase${k}`]))));
    await page.waitForTimeout(50);
  }
  check('Together: Chase lights the keys\' bars in turn, never all at once', () => {
    assert.ok(Math.max(...lights) >= 1, lights.join(' '));
    assert.ok(Math.max(...lights) <= 3, `at most a few at a time: ${lights.join(' ')}`);
  });

  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('buttonShowcase: all checks passed');
} finally {
  await kit.close();
}
