/**
 * The Components showcase's Knob panels (CE/panels/Components/Knob/, scripts/componentPanels.js),
 * opened as File > Open opens them and played in Preview: each knob wears one built-in preset
 * (utils/knobPresets.js), and this holds a few of each kind to what their captions say.
 *
 *   - Ticks: as the panel opens, the big ticks arrive a piece at a time, and are all there after.
 *   - Touch: the pointer over Lift raises its cap, about the dial's centre, and it settles back.
 *   - Numbers: Tip label shows the value at the pointer's tip while turning, and hides it after;
 *     MAX stamp says MAX at the top and MIN at the bottom; the name ↔ value Label shows one value
 *     while turning, not each new one pushed in over the last, and its name again after.
 *   - Turning: Snap lands on a new value at once, Glide eases into it.
 *   - Attention: Ring sweep draws past the value as the panel opens and hands back to it.
 *   - Gestures: a flick on Spin turns its whole cap, outline and all.
 *   - Together: the followers' drawings follow the first knob's value.
 *   - A readout at the tip of a knob that fills its box hangs past the box, whole.
 *
 * And the presets that needed the engine to learn something first (phase 2):
 *
 *   - Ticks: Fly away's ticks fly off on a double-click and fly back, one effect after the other;
 *     Fan in turns each tick about the dial's centre as the panel opens.
 *   - Numbers: Number stream throws values while turning, and they fade; the Odometer rolls only the
 *     digit that changed; Choice names pushes the next name in the way the value turned; Big number
 *     fills the dial while held; Units shows the unit only under the pointer; Delta throws how far
 *     the knob was turned as it is let go.
 *   - Turning: Detent pulses the pointer on a new step and not within one.
 *
 *   node browser-checks/knobShowcase.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 2600, height: 1400 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const PANELS = new URL('../../panels/Components/Knob/', import.meta.url);

/** Open a showcase panel as File > Open does; its controls' ids by name. Preview off. */
async function open(name) {
  await kit.preview(false);
  const path = new URL(`Knob ${name}.cepanel`, PANELS);
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
const centre = (id) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, inPreview(id));
const drawn = (id) => page.evaluate((sel) => Number(document.querySelector(`${sel} svg[data-drawn]`)?.getAttribute('data-drawn')), inPreview(id));
const readout = (id) => page.evaluate((sel) => {
  const label = document.querySelector(`${sel} .slider-label`);
  return label ? { text: label.textContent.trim(), opacity: Number(getComputedStyle(label).opacity), colour: getComputedStyle(label).color } : null;
}, inPreview(id));
const setValue = (id, value) => page.evaluate(async ({ id, value }) => {
  const { updatePanelPreviewSession } = await window.__ceImport('/src/CE_Application/stores/interactionPreview.js');
  updatePanelPreviewSession(id, { valueOverrideEnabled: true, valueOverride: value });
}, { id, value });
/** Sample `read` every `every` ms, `count` times. */
async function samples(read, count, every = 60) {
  const out = [];
  for (let i = 0; i < count; i += 1) { out.push(await read()); await page.waitForTimeout(every); }
  return out;
}

try {
  await kit.fresh();

  // --- Ticks ------------------------------------------------------------------------------------
  let ids = await open('Ticks');
  await kit.preview(true);
  const arriving = await page.evaluate((sel) => document.querySelector(sel).getAnimations({ subtree: true }).length, inPreview(ids.BigThenSmall));
  await kit.settle(3600);
  const after = await page.evaluate((sel) => ({
    running: document.querySelector(sel).getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    marks: document.querySelectorAll(`${sel} [data-scale-number]`).length,
  }), inPreview(ids.BigThenSmall));
  check('Ticks: as the panel opens the marks arrive a piece at a time, and stay', () => {
    assert.ok(arriving > 20, `every big and small tick and number has its piece (${arriving})`);
    assert.equal(after.running, 0, 'nothing still playing');
    assert.equal(after.marks, 6, 'the six numbers are there');
  });

  // Fan in played as the panel opened: about the dial's centre, not each tick's own.
  const fanned = await page.evaluate((sel) => {
    const tick = document.querySelector(`${sel} [data-tick]`).closest('[data-word-piece]');
    const r = document.querySelector(`${sel} svg[data-drawn]`).viewBox.baseVal;
    return { box: tick.style.transformBox, origin: tick.style.transformOrigin, centre: `${r.width / 2}px ${r.height / 2}px` };
  }, inPreview(ids.FanIn));
  check('Ticks: Fan in turns each tick about the dial\'s centre', () => {
    assert.equal(fanned.box, 'view-box');
    assert.equal(fanned.origin, fanned.centre);
  });

  // Fly away: the away flight first, then the flight back, never both at once.
  const flight = () => page.evaluate((sel) => {
    const tick = document.querySelector(`${sel} [data-tick]`).closest('[data-word-piece]');
    const [animation] = tick?.getAnimations() ?? [];
    const [first] = animation?.effect.getKeyframes() ?? [];
    return { count: tick?.getAnimations().length ?? 0, way: !animation ? 'none' : first?.opacity === '0' ? 'back' : 'away' };
  }, inPreview(ids.FlyAway));
  const [fx, fy] = await centre(ids.FlyAway);
  await page.mouse.dblclick(fx, fy);
  await page.waitForTimeout(150);
  const leaving = await flight();
  await page.waitForTimeout(800);
  const returning = await flight();
  await kit.settle(1400);
  const home = await page.evaluate((sel) => ({
    running: document.querySelector(sel).getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    ticks: document.querySelectorAll(`${sel} [data-tick]`).length,
  }), inPreview(ids.FlyAway));
  check('Ticks: Fly away flies the ticks off on a double-click, then back, one flight at a time', () => {
    assert.deepEqual(leaving, { count: 1, way: 'away' });
    assert.deepEqual(returning, { count: 1, way: 'back' });
    assert.equal(home.running, 0);
    assert.ok(home.ticks > 20, `${home.ticks}`);
  });

  // --- Touch ------------------------------------------------------------------------------------
  ids = await open('Touch');
  await kit.preview(true);
  await kit.settle(500);
  const capScale = () => page.evaluate((sel) => getComputedStyle(document.querySelector(`${sel} [data-plate="bodyCap"]`)).scale, inPreview(ids.Lift));
  const [lx, ly] = await centre(ids.Lift);
  await page.mouse.move(lx, ly - 10);
  await kit.settle(400);
  const lifted = await capScale();
  await page.mouse.move(5, 1390);
  await kit.settle(400);
  const settled = await capScale();
  check('Touch: the pointer over Lift raises its cap, and it settles back', () => {
    assert.equal(lifted, '1.07');
    assert.ok(settled === '1' || settled === 'none', settled);
  });

  // --- Numbers ----------------------------------------------------------------------------------
  ids = await open('Numbers');
  await kit.preview(true);
  await kit.settle(500);
  const [tx, ty] = await centre(ids.TipLabel);
  const atRest = await readout(ids.TipLabel);
  await page.mouse.move(tx, ty - 10);
  await page.mouse.down();
  await page.mouse.move(tx + 45, ty - 25, { steps: 8 });
  await kit.settle(300);
  const turning = await readout(ids.TipLabel);
  const value = await drawn(ids.TipLabel);
  await page.mouse.up();
  await kit.settle(400);
  const letGo = await readout(ids.TipLabel);
  check('Numbers: Tip label shows the value at the tip while turning, and hides it after', () => {
    assert.equal(atRest.opacity, 0);
    assert.equal(turning.opacity, 1);
    assert.equal(turning.text, value.toFixed(2));
    assert.equal(letGo.opacity, 0);
  });

  await setValue(ids.MaxStamp, 1);
  await kit.settle(500);
  const max = await readout(ids.MaxStamp);
  await setValue(ids.MaxStamp, 0);
  await kit.settle(500);
  const min = await readout(ids.MaxStamp);
  await setValue(ids.MaxStamp, 0.5);
  await kit.settle(400);
  const middle = await readout(ids.MaxStamp);
  check('Numbers: MAX stamps on at the top and MIN at the bottom, in red; neither in between', () => {
    assert.deepEqual([max.text, max.opacity, max.colour], ['MAX', 1, 'rgb(255, 77, 77)']);
    assert.deepEqual([min.text, min.opacity], ['MIN', 1]);
    assert.equal(middle.opacity, 0);
  });

  // Its words as drawn: a text effect's own <style> is in the Label too, and is not words.
  const label = () => page.evaluate((sel) => {
    const copy = document.querySelector(sel)?.cloneNode(true);
    copy?.querySelectorAll('style').forEach((node) => node.remove());
    return copy?.textContent.replace(/\s+/g, ' ').trim();
  }, inPreview(ids.CutoffName));
  const [cx, cy] = await centre(ids.Cutoff);
  await page.mouse.move(cx, cy - 10);
  await page.mouse.down();
  await page.mouse.move(cx - 40, cy - 30, { steps: 6 });
  await kit.settle(500);
  await page.mouse.move(cx - 50, cy + 10, { steps: 6 });
  await page.waitForTimeout(120);
  const following = await label();
  await page.mouse.up();
  await kit.settle(1200);
  const named = await label();
  check('Numbers: the name ↔ value Label shows one value while turning, and its name after', () => {
    assert.match(following, /^\d\.\d\d$/, `one value, not the last pushed over the next: "${following}"`);
    assert.equal(named, 'Cutoff');
  });

  // Number stream: words thrown while it turns, each a value, gone once they have flown.
  const words = () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-emitted-word]`)].map((n) => n.textContent.trim()), inPreview(ids.NumberStream));
  const [nx, ny] = await centre(ids.NumberStream);
  await page.mouse.move(nx, ny - 10);
  await page.mouse.down();
  await page.mouse.move(nx + 50, ny - 30, { steps: 10 });
  const streaming = await words();
  await page.mouse.up();
  await kit.settle(1200);
  const flown = await words();
  check('Numbers: Number stream throws values while it turns, and they fade', () => {
    assert.ok(streaming.length >= 2, `${streaming}`);
    for (const word of streaming) assert.match(word, /^\d+\.\d$/);
    assert.deepEqual(flown, []);
  });

  // Delta: how far it was turned, as it is let go.
  const [dx, dy] = await centre(ids.Delta);
  await page.mouse.move(dx, dy - 10);
  await page.mouse.down();
  await page.mouse.move(dx + 50, dy - 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const delta = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-emitted-word]`)].map((n) => n.textContent.trim()), inPreview(ids.Delta));
  check('Numbers: Delta throws how far it was turned as it is let go', () => {
    assert.equal(delta.length, 1);
    assert.match(delta[0], /^\+\d+\.\d$/);
  });

  // The odometer: only the digit that changed rolls.
  const digits = () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .slider-label span`)].map((n) => [n.textContent, n.getAnimations().length]), inPreview(ids.Odometer));
  await setValue(ids.Odometer, 67);
  await kit.settle(500);
  await setValue(ids.Odometer, 68);
  await page.waitForTimeout(60);
  const rolled = await digits();
  check('Numbers: the Odometer rolls only the digit that changed', () => {
    assert.deepEqual(rolled, [['6', 0], ['8', 1]]);
  });

  // Choice names: the next name in from the right going up, from the left going down.
  const pushedFrom = () => page.evaluate((sel) => {
    const span = document.querySelector(`${sel} .slider-label span`);
    const [animation] = span?.getAnimations() ?? [];
    return [span?.textContent, String(animation?.effect.getKeyframes()[0]?.transform ?? '')];
  }, inPreview(ids.ChoiceNames));
  await setValue(ids.ChoiceNames, 3);
  await page.waitForTimeout(60);
  const up = await pushedFrom();
  await kit.settle(500);
  await setValue(ids.ChoiceNames, 1);
  await page.waitForTimeout(60);
  const down = await pushedFrom();
  check('Numbers: Choice names pushes the next name in the way the value turned', () => {
    assert.deepEqual(up, ['Triangle', 'translateX(110%)']);
    assert.deepEqual(down, ['Square', 'translateX(-110%)']);
  });

  // Big number: in the middle of the dial, large, while held; gone after.
  const big = () => page.evaluate((sel) => {
    const label = document.querySelector(`${sel} .slider-label`);
    const box = document.querySelector(sel).getBoundingClientRect();
    const r = label.getBoundingClientRect();
    return { opacity: Number(getComputedStyle(label).opacity), size: getComputedStyle(label).fontSize, off: Math.round(Math.hypot(r.x + r.width / 2 - (box.x + box.width / 2), r.y + r.height / 2 - (box.y + box.height / 2))) };
  }, inPreview(ids.BigNumber));
  const [bx, by] = await centre(ids.BigNumber);
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await kit.settle(400);
  const held = await big();
  await page.mouse.up();
  await kit.settle(500);
  const released = await big();
  check('Numbers: Big number fills the dial while it is held', () => {
    assert.equal(held.opacity, 1);
    assert.equal(held.size, '34px');
    assert.ok(held.off <= 2, `in the middle: ${held.off} px off`);
    assert.equal(released.opacity, 0);
  });

  // Units: the unit only while the pointer is over the knob.
  const unitsText = () => page.evaluate((sel) => document.querySelector(`${sel} .slider-label`)?.textContent.replace(/\s+/g, ' ').trim(), inPreview(ids.Units));
  const resting = await unitsText();
  const [ux, uy] = await centre(ids.Units);
  await page.mouse.move(ux, uy);
  await kit.settle(500);
  const hovered = await unitsText();
  await page.mouse.move(5, 1390);
  await kit.settle(400);
  check('Numbers: Units shows the unit only under the pointer', () => {
    assert.equal(resting, '50');
    assert.equal(hovered, '50 ms');
  });

  // --- Turning ----------------------------------------------------------------------------------
  ids = await open('Turning');
  await kit.preview(true);
  await kit.settle(500);
  await setValue(ids.Snap, 0.9);
  await setValue(ids.Glide, 0.9);
  await page.waitForTimeout(90);
  const snap = await drawn(ids.Snap);
  const glide = await drawn(ids.Glide);
  await kit.settle(700);
  const glided = await drawn(ids.Glide);
  check('Turning: Snap lands on a new value at once; Glide eases into it', () => {
    assert.equal(snap, 0.9);
    assert.ok(glide > 0.5 && glide < 0.88, `part way at 90 ms: ${glide}`);
    assert.equal(glided, 0.9);
  });

  // Detent: a pulse on the pointer for a new step, none within one.
  const pulses = () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-pointer]`)].reduce((n, el) => n + el.getAnimations().filter((a) => a.playState === 'running').length, 0), inPreview(ids.Detent));
  await setValue(ids.Detent, 7);
  await page.waitForTimeout(40);
  const stepped = await pulses();
  await kit.settle(400);
  await setValue(ids.Detent, 7.3);
  await page.waitForTimeout(40);
  const within = await pulses();
  check('Turning: Detent pulses the pointer on a new step, and not within one', () => {
    assert.ok(stepped >= 1, `${stepped}`);
    assert.equal(within, 0);
  });

  // --- Attention --------------------------------------------------------------------------------
  ids = await open('Attention');
  await kit.preview(true);
  const sweep = await samples(() => drawn(ids.RingSweep), 34, 60);
  await kit.settle(400);
  const handedBack = await drawn(ids.RingSweep);
  check('Attention: Ring sweep draws to full as the panel opens, and hands back to the value', () => {
    assert.ok(Math.max(...sweep) > 0.97, `it reaches full: ${sweep.join(" ")}`);
    assert.equal(handedBack, 0.4);
  });

  // --- Gestures ---------------------------------------------------------------------------------
  ids = await open('Gestures');
  await kit.preview(true);
  await kit.settle(500);
  const [sx, sy] = await centre(ids.Spin);
  await page.mouse.move(sx - 30, sy - 14);
  await page.mouse.down();
  // A flick is 600 px/s over the last 100 ms (gestureEvents.js). Each move takes 15 to 40 ms to
  // arrive here, and 17.5 px a step came to about that speed: one run in three was no flick at all.
  for (let k = 1; k <= 4; k += 1) await page.mouse.move(sx - 30 + 32 * k, sy - 14 - 6 * k);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const spinning = await page.evaluate((sel) => {
    const plate = document.querySelector(`${sel} [data-plate="bodyCap"]`);
    return { onPlate: plate.getAnimations().length, rotate: getComputedStyle(plate).rotate };
  }, inPreview(ids.Spin));
  check('Gestures: a flick on Spin turns its whole cap, outline and all', () => {
    assert.equal(spinning.onPlate, 1);
    assert.notEqual(spinning.rotate, 'none');
  });

  // --- Together ---------------------------------------------------------------------------------
  ids = await open('Together');
  await kit.preview(true);
  await kit.settle(2200);
  await setValue(ids.Follow1, 0.9);
  await kit.settle(900);
  const followers = await Promise.all([2, 3, 4, 5].map((k) => drawn(ids[`Follow${k}`])));
  check('Together: the followers\' drawings follow the first knob\'s value', () => {
    for (const value of followers) assert.ok(Math.abs(value - 0.9) < 0.01, `${followers}`);
  });

  // A knob's readout at its pointer's tip stands 22 px past the dial, and a knob drawn in a tight
  // fit (Graphite's, a new panel's set) fills its box: at the top of its travel the readout stood
  // past the box, which cut it off. It hangs outside now, and the drawing is cut to the box as before.
  await kit.preview(false);
  await kit.fresh();
  const tipKnob = await kit.make('Knob', { 'Behavior.showHandleLabels': true, 'Behavior.defaultCurrentValue': 0.5, 'Transform.x': 400, 'Transform.y': 400 });
  await kit.preview(true);
  await kit.settle(600);
  const hang = await page.evaluate((sel) => {
    const control = document.querySelector(sel);
    const label = control.querySelector('.slider-label');
    const box = control.getBoundingClientRect();
    const at = label.getBoundingClientRect();
    return {
      text: label.textContent.trim(),
      past: Math.max(box.top - at.top, at.bottom - box.bottom, box.left - at.left, at.right - box.right),
      content: getComputedStyle(control.querySelector('.control-content')).overflow,
      drawing: getComputedStyle(control.querySelector('.slider-svg')).overflow,
    };
  }, inPreview(tipKnob));
  check('Numbers: a readout at the tip stands past a knob that fills its box, whole; the drawing stays cut to the box', () => {
    assert.equal(hang.text, '0.50');
    assert.ok(hang.past > 4, `the readout reaches past the box (${hang.past.toFixed(1)} px)`);
    assert.equal(hang.content, 'visible', 'the box lets it hang');
    assert.equal(hang.drawing, 'hidden', 'the drawing cut to the box, as the box cut it');
  });

  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('knobShowcase: all checks passed');
} finally {
  await kit.close();
}
