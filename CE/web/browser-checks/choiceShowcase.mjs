/**
 * The Components showcase's Choice group panels (CE/panels/Components/Choice group/,
 * scripts/componentPanels.js), opened as File > Open opens them and played in Preview: each group
 * wears one built-in preset (utils/choicePresets.js), and this holds what the captions promise of a
 * group, which moves as a whole.
 *
 *   - Attention: Pop in is hidden as the panel opens and grows in; Look here jumps when its script
 *     plays it, the script loaded and running; Beat pulse swells on the transport's beats; Pulse
 *     never stops.
 *   - Choosing: a click on a later option leans Lean to the right, on an earlier one to the left
 *     (keyframeAnimation.js followTurn); Blink dims and comes back at a new choice; Tick knocks down
 *     a little at each.
 *
 *   node browser-checks/choiceShowcase.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 2200, height: 1200 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const PANELS = new URL('../../panels/Components/Choice group/', import.meta.url);

/** Open a showcase panel as File > Open does; its controls' ids by name. Preview off. */
async function open(name) {
  await kit.preview(false);
  const path = new URL(`Choice group ${name}.cepanel`, PANELS);
  const text = readFileSync(path, 'utf8');
  const ids = await page.evaluate(async ({ text, path }) => {
    const { deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const panel = deserializePanel(text, path, null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  }, { text, path: decodeURIComponent(path.pathname) });
  await kit.settle(600);
  return ids;
}
const inPreview = (id) => `.preview-surface [data-control-id="${id}"]`;
/** The group as drawn: its box on screen, its transform included, and its opacity. */
const box = (id) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, opacity: Number(getComputedStyle(el).opacity) };
}, inPreview(id));
/** Where one of a group's options is drawn, to click it. */
const optionAt = (id, key) => page.evaluate(({ sel, key }) => {
  const r = document.querySelector(`${sel} [data-choice-key="${key}"]`).getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}, { sel: inPreview(id), key });
async function watch(id, measure, ms, step = 25) {
  const out = [];
  for (let t = 0; t < ms; t += step) { out.push(measure(await box(id))); await page.waitForTimeout(step); }
  return out;
}
async function trustScripts() {
  const button = page.getByRole('button', { name: 'Enable scripts for this session' });
  if (await button.count()) { await button.first().click(); await kit.settle(600); }
}
const scriptErrors = () => page.evaluate(async () => {
  const { scriptTrace } = await window.__ceImport('/src/CE_Application/stores/scriptConsole.js');
  let trace; scriptTrace.subscribe((v) => { trace = v; })();
  return (trace ?? []).filter((t) => t.kind === 'error').map((t) => String(t.message ?? ''));
});

try {
  await kit.fresh();

  // --- Choosing ----------------------------------------------------------------------------------
  let ids = await open('Choosing');
  await kit.preview(true);
  await kit.settle(800);
  await page.mouse.move(5, 5);
  // Lean starts on its middle option: on to a later one, then back to an earlier one.
  const leanRest = await box(ids.Lean);
  await page.mouse.click(...(await optionAt(ids.Lean, 'opt_4')));
  const onward = await watch(ids.Lean, (b) => b.x - leanRest.x, 420);
  await kit.settle(200);
  await page.mouse.click(...(await optionAt(ids.Lean, 'opt_2')));
  const back = await watch(ids.Lean, (b) => b.x - leanRest.x, 420);
  await kit.settle(200);
  const leanAfter = await box(ids.Lean);
  check('Choosing: Lean leans right toward a later option, and left toward an earlier one', () => {
    assert.ok(Math.max(...onward) > 2.5, `on: ${onward.map((d) => d.toFixed(1)).join(' ')}`);
    assert.ok(Math.min(...onward) > -1.5, 'never far the other way going on');
    assert.ok(Math.min(...back) < -2.5, `back: ${back.map((d) => d.toFixed(1)).join(' ')}`);
    assert.ok(Math.max(...back) < 1.5, 'never far the other way going back');
    assert.ok(Math.abs(leanAfter.x - leanRest.x) < 0.5, 'and settles where it was');
  });

  await page.mouse.click(...(await optionAt(ids.Blink, 'opt_3')));
  const blink = await watch(ids.Blink, (b) => b.opacity, 360, 20);
  await kit.settle(200);
  check('Choosing: Blink dims at a new choice and comes back', () => {
    assert.ok(Math.min(...blink) < 0.6, `${blink.map((o) => o.toFixed(2)).join(' ')}`);
    assert.ok(blink.at(-1) > 0.95);
  });

  const tickRest = await box(ids.Tick);
  await page.mouse.click(...(await optionAt(ids.Tick, 'opt_4')));
  const tick = await watch(ids.Tick, (b) => b.y - tickRest.y, 200, 15);
  check('Choosing: Tick knocks down a little at the choice', () => {
    assert.ok(Math.max(...tick) > 0.8, `${tick.map((d) => d.toFixed(2)).join(' ')}`);
  });

  // --- Attention ---------------------------------------------------------------------------------
  ids = await open('Attention');
  // Watched in the page from before Preview starts, a frame at a time: by the time switching it on
  // has returned, the group is half grown.
  await page.evaluate((sel) => {
    window.__popIn = [];
    const t0 = performance.now();
    const sample = () => {
      const el = document.querySelector(sel);
      if (el) window.__popIn.push(Number(getComputedStyle(el).opacity));
      if (performance.now() - t0 < 2500) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, inPreview(ids.PopIn));
  await kit.preview(true);
  await page.waitForTimeout(2600);
  const popIn = await page.evaluate(() => window.__popIn);
  check('Attention: Pop in is hidden as the panel opens, then grows in', () => {
    assert.ok(popIn.length > 0 && Math.min(...popIn) < 0.4, `${popIn.map((o) => o.toFixed(2)).join(' ')}`);
    assert.ok(popIn.at(-1) > 0.95);
  });
  const pulse = await watch(ids.Pulse, (b) => b.width, 1700, 50);
  check('Attention: Pulse swells and settles, and keeps on', () => {
    assert.ok(Math.max(...pulse) / Math.min(...pulse) > 1.025, `${Math.min(...pulse)} to ${Math.max(...pulse)}`);
  });

  await trustScripts();
  const lookRest = await box(ids.LookHere);
  const look = await watch(ids.LookHere, (b) => b.y - lookRest.y, 4600, 40);
  check('Attention: Look here jumps when its script plays it, the script loaded and running', () => {
    assert.ok(Math.min(...look) < -6, `${Math.min(...look).toFixed(1)}`);
  });
  assert.deepEqual(await scriptErrors(), []);

  const beatRest = await box(ids.BeatPulse);
  await page.evaluate(async () => {
    const { setTransportBpm, startTransport } = await window.__ceImport('/src/CE_Application/stores/transport.js');
    setTransportBpm(120); startTransport();
  });
  const beat = await watch(ids.BeatPulse, (b) => b.width / beatRest.width, 1400, 20);
  await page.evaluate(async () => {
    const { stopTransport } = await window.__ceImport('/src/CE_Application/stores/transport.js');
    stopTransport();
  });
  check('Attention: Beat pulse swells on the transport\'s beats', () => {
    assert.ok(Math.max(...beat) > 1.03, `${Math.max(...beat).toFixed(3)}`);
  });

  assert.deepEqual(kit.failures, [], 'no page errors');
  console.log('choiceShowcase: all checks passed');
} finally {
  await kit.close();
}
