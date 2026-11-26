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

  // --- Attention --------------------------------------------------------------------------------
  ids = await open('Attention');
  await kit.preview(true);
  const sweep = await samples(() => drawn(ids.RingSweep), 34, 60);
  await kit.settle(400);
  const handedBack = await drawn(ids.RingSweep);
  check('Attention: Ring sweep draws to full as the panel opens, and hands back to the value', () => {
    assert.ok(Math.max(...sweep) > 0.97, `it reaches full: ${Math.max(...sweep)}`);
    assert.equal(handedBack, 0.4);
  });

  // --- Gestures ---------------------------------------------------------------------------------
  ids = await open('Gestures');
  await kit.preview(true);
  await kit.settle(500);
  const [sx, sy] = await centre(ids.Spin);
  await page.mouse.move(sx - 30, sy - 14);
  await page.mouse.down();
  for (let k = 1; k <= 4; k += 1) await page.mouse.move(sx - 30 + 17.5 * k, sy - 14 - 4 * k);
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

  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('knobShowcase: all checks passed');
} finally {
  await kit.close();
}
