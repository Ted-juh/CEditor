/**
 * The Components showcase's Slider panels (CE/panels/Components/Slider/, scripts/componentPanels.js),
 * opened as File > Open opens them and played in Preview: each fader wears one built-in preset
 * (utils/sliderPresets.js), and this holds the ones a slider needed the engine to learn to what their
 * captions say.
 *
 *   - Ticks: Unfold slides each tick up the track from the first one, and they all arrive; Fly away
 *     flies them off the track on a double-click, then back, one flight at a time.
 *   - Touch: the pointer over Lift lifts its cap about its own centre, and pressing Grip squeezes
 *     it; at rest neither scales, as no slider's cap did before.
 *   - Numbers: a readout starts past the cap's edge, not under it; Number stream throws values out
 *     beside the cap while it moves; Delta throws how far it moved as it is let go; Choice names
 *     rolls the next name in up when the value rises and down when it falls.
 *   - Gestures: a flick on Throw sends the drawing past the value and back.
 *   - Together: the followers' drawings follow the first fader's value.
 *
 *   node browser-checks/sliderShowcase.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 2600, height: 1400 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const PANELS = new URL('../../panels/Components/Slider/', import.meta.url);

/** Open a showcase panel as File > Open does; its controls' ids by name. Preview off. */
async function open(name) {
  await kit.preview(false);
  const path = new URL(`Slider ${name}.cepanel`, PANELS);
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
/** The cap's centre on screen, and the scale its wrapper draws. */
const capOf = (id) => page.evaluate((sel) => {
  const el = document.querySelector(`${sel} [data-pointer="current"]`);
  const r = el.getBoundingClientRect();
  const wrap = el.closest('g[style]');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, right: r.right, scale: wrap ? getComputedStyle(wrap).scale : 'none' };
}, inPreview(id));
const drawn = (id) => page.evaluate((sel) => Number(document.querySelector(`${sel} svg[data-drawn]`)?.getAttribute('data-drawn')), inPreview(id));
const setValue = (id, value) => page.evaluate(async ({ id, value }) => {
  const { updatePanelPreviewSession } = await window.__ceImport('/src/CE_Application/stores/interactionPreview.js');
  updatePanelPreviewSession(id, { valueOverrideEnabled: true, valueOverride: value });
}, { id, value });
const words = (id) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-emitted-word]`)].map((n) => {
  const r = n.getBoundingClientRect();
  return { text: n.textContent.trim(), left: r.left };
}), inPreview(id));
/** Press on the cap and drag it up (negative dy) or down, in steps. */
async function drag(id, dy, steps = 10) {
  const cap = await capOf(id);
  await page.mouse.move(cap.x, cap.y);
  await page.mouse.down();
  await page.mouse.move(cap.x, cap.y + dy, { steps });
}

try {
  await kit.fresh();

  // --- Ticks ------------------------------------------------------------------------------------
  let ids = await open('Ticks');
  await kit.preview(true);
  await page.waitForTimeout(500);
  const unfolding = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-word-piece]`)]
    .map((piece) => [piece.style.getPropertyValue('--ce-fan-x'), piece.style.getPropertyValue('--ce-fan-y'), piece.style.getPropertyValue('--ce-fan-turn')]), inPreview(ids.Unfold));
  await kit.settle(2200);
  const unfolded = await page.evaluate((sel) => ({
    running: document.querySelector(sel).getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    ticks: document.querySelectorAll(`${sel} [data-tick]`).length,
  }), inPreview(ids.Unfold));
  check('Ticks: Unfold slides each tick up the track from the first one, unturned, and they all arrive', () => {
    assert.ok(unfolding.length > 20, `${unfolding.length} pieces`);
    // The big ticks and the small ones each unfold from their own first: two stay where they are.
    const still = unfolding.filter(([x, y]) => x === '0px' && y === '0px');
    assert.equal(still.length, 2, 'the first big tick and the first small one stay where they are');
    assert.ok(unfolding.every(([x, y, turn]) => turn === '0deg' && x === '0px' && Number.parseFloat(y) >= 0), 'the rest start below, at their first, unturned');
    assert.equal(unfolded.running, 0);
    assert.ok(unfolded.ticks > 20);
  });

  const flight = () => page.evaluate((sel) => {
    const piece = document.querySelector(`${sel} [data-tick]`).closest('[data-word-piece]');
    const [animation] = piece?.getAnimations() ?? [];
    const [first] = animation?.effect.getKeyframes() ?? [];
    return { count: piece?.getAnimations().length ?? 0, way: !animation ? 'none' : first?.opacity === '0' ? 'back' : 'away', sideways: piece?.style.getPropertyValue('--ce-fly-out-x') || piece?.style.getPropertyValue('--ce-fly-x') };
  }, inPreview(ids.FlyAway));
  const [fx, fy] = await centre(ids.FlyAway);
  await page.mouse.dblclick(fx, fy);
  await page.waitForTimeout(150);
  const leaving = await flight();
  await page.waitForTimeout(800);
  const returning = await flight();
  check('Ticks: Fly away flies the ticks off the track on a double-click, then back, one flight at a time', () => {
    assert.deepEqual([leaving.count, leaving.way], [1, 'away']);
    assert.equal(leaving.sideways, '40px', 'off to the side, 40 px');
    assert.deepEqual([returning.count, returning.way], [1, 'back']);
  });

  // --- Touch ------------------------------------------------------------------------------------
  ids = await open('Touch');
  await kit.preview(true);
  await kit.settle(500);
  const rest = await capOf(ids.Lift);
  await page.mouse.move(rest.x, rest.y);
  await kit.settle(400);
  const lifted = await capOf(ids.Lift);
  await page.mouse.move(5, 1390);
  await kit.settle(400);
  const gripCap = await capOf(ids.Grip);
  await page.mouse.move(gripCap.x, gripCap.y);
  await page.mouse.down();
  await kit.settle(300);
  const gripped = await capOf(ids.Grip);
  await page.mouse.up();
  await page.mouse.move(5, 1390);
  await kit.settle(300);
  const plain = await capOf(ids.Glow);
  check('Touch: Lift lifts its cap under the pointer and Grip squeezes it; a cap with no lift is drawn as ever', () => {
    assert.equal(rest.scale, '1', 'at rest, lifted by nothing');
    assert.equal(plain.scale, 'none', 'a cap with no lift has no group round it');
    assert.equal(lifted.scale, '1.12');
    assert.ok(Math.abs(lifted.x - rest.x) < 1 && Math.abs(lifted.y - rest.y) < 1, 'about its own centre');
    assert.equal(gripped.scale, '0.9');
  });

  // --- Numbers ----------------------------------------------------------------------------------
  ids = await open('Numbers');
  await kit.preview(true);
  await kit.settle(500);
  const beside = await page.evaluate((sel) => {
    const cap = document.querySelector(`${sel} [data-pointer="current"]`).getBoundingClientRect();
    const label = document.querySelector(`${sel} .slider-label`).getBoundingClientRect();
    return { capRight: cap.right, labelLeft: label.left, capMiddle: cap.top + cap.height / 2, labelMiddle: label.top + label.height / 2 };
  }, inPreview(ids.ChoiceNames));
  check('Numbers: a readout starts past the cap\'s edge, level with it', () => {
    assert.ok(beside.labelLeft >= beside.capRight + 3, `label at ${beside.labelLeft}, cap ends at ${beside.capRight}`);
    assert.ok(Math.abs(beside.labelMiddle - beside.capMiddle) < 2);
  });

  await drag(ids.NumberStream, -70);
  const streaming = await words(ids.NumberStream);
  const streamCap = await capOf(ids.NumberStream);
  await page.mouse.up();
  await kit.settle(1200);
  const flown = await words(ids.NumberStream);
  check('Numbers: Number stream throws values out beside the cap while it moves, and they fade', () => {
    assert.ok(streaming.length >= 2, `${streaming.map((w) => w.text)}`);
    for (const word of streaming) {
      assert.match(word.text, /^\d+\.\d$/);
      assert.ok(word.left > streamCap.right, `${word.text} beside the cap, not on it`);
    }
    assert.deepEqual(flown, []);
  });

  await drag(ids.Delta, -50, 6);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const delta = await words(ids.Delta);
  check('Numbers: Delta throws how far it moved as it is let go', () => {
    assert.equal(delta.length, 1);
    assert.match(delta[0].text, /^\+\d+\.\d$/);
  });

  const rolledFrom = () => page.evaluate((sel) => {
    const span = document.querySelector(`${sel} .slider-label span`);
    const [animation] = span?.getAnimations() ?? [];
    return [span?.textContent, String(animation?.effect.getKeyframes()[0]?.transform ?? '')];
  }, inPreview(ids.ChoiceNames));
  await setValue(ids.ChoiceNames, 3);
  await page.waitForTimeout(60);
  const up = await rolledFrom();
  await kit.settle(500);
  await setValue(ids.ChoiceNames, 1);
  await page.waitForTimeout(60);
  const down = await rolledFrom();
  check('Numbers: Choice names rolls the next name in up as the value rises, down as it falls', () => {
    assert.deepEqual(up, ['Triangle', 'translateY(110%)']);
    assert.deepEqual(down, ['Square', 'translateY(-110%)']);
  });

  // --- Gestures ---------------------------------------------------------------------------------
  ids = await open('Gestures');
  await kit.preview(true);
  await kit.settle(500);
  const before = await drawn(ids.Throw);
  const throwCap = await capOf(ids.Throw);
  await page.mouse.move(throwCap.x, throwCap.y);
  await page.mouse.down();
  // A flick is 600 px/s over the last 100 ms (gestureEvents.js): three quick 20 px steps, which
  // leave the value short of the top, where an overshoot has room to show.
  for (let k = 1; k <= 3; k += 1) await page.mouse.move(throwCap.x, throwCap.y - 20 * k);
  await page.mouse.up();
  const thrown = [];
  for (let k = 0; k < 14; k += 1) { thrown.push(await drawn(ids.Throw)); await page.waitForTimeout(50); }
  await kit.settle(500);
  const landed = await drawn(ids.Throw);
  check('Gestures: a flick on Throw sends the drawing past the value and back', () => {
    assert.ok(landed > before, `the flick moved it: ${before} → ${landed}`);
    assert.ok(Math.max(...thrown) > landed + 0.03, `past the value: ${thrown.join(' ')} then ${landed}`);
  });

  // --- Together ---------------------------------------------------------------------------------
  ids = await open('Together');
  await kit.preview(true);
  await kit.settle(2600);
  await setValue(ids.Follow1, 0.9);
  await kit.settle(900);
  const followers = await Promise.all([2, 3, 4, 5].map((k) => drawn(ids[`Follow${k}`])));
  check('Together: the followers\' drawings follow the first fader\'s value', () => {
    for (const value of followers) assert.ok(Math.abs(value - 0.9) < 0.01, `${followers}`);
  });

  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('sliderShowcase: all checks passed');
} finally {
  await kit.close();
}
