/**
 * The Components showcase's Meter panels (CE/panels/Components/Meter/, scripts/componentPanels.js),
 * opened as File > Open opens them and played in Preview: each meter wears one built-in preset
 * (utils/meterPresets.js), and this holds what the captions promise.
 *
 *   - Attention (the plain bar): Pop in is hidden as the panel opens and grows in; Pulse never stops;
 *     a click knocks Knock; Look here jumps under its script; Beat pulse swells on the beats.
 *   - Needle (a valve VU): Self-test and Wake up move the needle as the panel opens and hand it back
 *     to the level; a click sends Tap sweep up and back, a double-click drops Drop out; Shiver never
 *     settles; Beat kick kicks on the beats.
 *   - Readout (a ruler): a script moves each meter's level, and each reading, a Label showing its
 *     value, changes and plays its effect.
 *   - Together (rows of lamps): Power-on reaches each meter of its row in turn; Spectrum and Chase
 *     keep moving; Beat bounce kicks its row on the beats.
 *
 * Phase 2, each meter running a test signal (utils/meterMotion.js), nothing plugged in:
 *   - Parts (Anodised): Lamp flash's lamp is drawn and flares each time the level clips; Face glow
 *     and Needle glow light as the level crosses their lines; Scale light-up lights as the panel
 *     opens; a click makes Cover glint catch the light.
 *   - Level (Carbon Pro): as each burst clips, the lamps flash, the meter shakes, its case washes
 *     red and "OVER" rises from it; Peak flare swells it as the level crosses 80%.
 *   - Ballistics (Valve Console): one signal, five needles, each where its ballistics put it: the
 *     PPM reads higher than the lazy needle, which never catches a peak.
 *   - Segments (Gimbal Ring): Cascade's lamps come on along the row, Sparkle's in a scattered
 *     order, Ripple's out from the level as it clips; Peak drop's peak lamp drops as the level falls.
 *
 *   node browser-checks/meterShowcase.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 2200, height: 1200 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const PANELS = new URL('../../panels/Components/Meter/', import.meta.url);

/** Open a showcase panel as File > Open does; its controls' ids by name. Preview off. */
async function open(name) {
  await kit.preview(false);
  const path = new URL(`Meter ${name}.cepanel`, PANELS);
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
const centre = (id) => page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}, inPreview(id));

/**
 * One frame of each meter as drawn, sampled in the page from `startFrames` till `ms` later: its box
 * (a transform included) and opacity, and what its level draws: the plain look's position, else the
 * indicator part as drawn (a needle's turn, which lamps are lit).
 */
const startFrames = (ids, ms) => page.evaluate(({ sels, ms }) => {
  window.__frames = [];
  const t0 = performance.now();
  const snap = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const plain = el.querySelector('[data-drawn]');
    const indicator = el.querySelector('[data-part="indicator"]');
    return {
      x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, opacity: Number(getComputedStyle(el).opacity),
      drawn: plain ? Number(plain.dataset.drawn) : null,
      indicator: indicator ? indicator.outerHTML.replace(/\s+/g, ' ') : null,
    };
  };
  const sample = () => {
    window.__frames.push({ t: performance.now() - t0, groups: sels.map(snap) });
    if (performance.now() - t0 < ms) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}, { sels: ids.map(inPreview), ms });
const frames = async (ms) => { await page.waitForTimeout(ms + 80); return page.evaluate(() => window.__frames); };
const now = async (list) => { await startFrames(list, 0); return (await frames(0)).at(-1).groups; };
const groupOf = (run, n) => run.filter((f) => f.groups[n]).map((f) => ({ ...f.groups[n], t: f.t }));
/** How many different drawings of the level a run saw. */
const looks = (run) => new Set(run.map((g) => g.indicator ?? g.drawn)).size;
const fmt = (list) => list.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(' ');
async function trustScripts() {
  const button = page.getByRole('button', { name: 'Enable scripts for this session' });
  if (await button.count()) { await button.first().click(); await kit.settle(600); }
}
const scriptErrors = () => page.evaluate(async () => {
  const { scriptTrace } = await window.__ceImport('/src/CE_Application/stores/scriptConsole.js');
  let trace; scriptTrace.subscribe((v) => { trace = v; })();
  return (trace ?? []).filter((t) => t.kind === 'error').map((t) => String(t.message ?? ''));
});
const transport = (run) => page.evaluate(async (run) => {
  const { setTransportBpm, startTransport, stopTransport } = await window.__ceImport('/src/CE_Application/stores/transport.js');
  if (run) { setTransportBpm(120); startTransport(); } else stopTransport();
}, run);

try {
  await kit.fresh();

  // --- Needle --------------------------------------------------------------------------------------
  let ids = await open('Needle');
  await startFrames([ids.SelfTest, ids.WakeUp], 2600);
  await kit.preview(true);
  const opening = await frames(2600);
  const selfTest = groupOf(opening, 0);
  const wakeUp = groupOf(opening, 1);
  check('Needle: Self-test and Wake up move the needle as the panel opens, and hand it back to the level', () => {
    assert.ok(looks(selfTest) > 8, `Self-test drew ${looks(selfTest)} needles`);
    assert.ok(looks(wakeUp) > 8, `Wake up drew ${looks(wakeUp)} needles`);
    assert.equal(selfTest.at(-1).indicator, selfTest.at(-2).indicator, 'and is still at the end');
  });
  await kit.settle(400);
  const tapRest = (await now([ids.TapSweep]))[0].indicator;
  await startFrames([ids.TapSweep], 1100);
  await page.mouse.click(...(await centre(ids.TapSweep)));
  await page.mouse.move(5, 5);
  const tap = groupOf(await frames(1100), 0);
  check('Needle: a click sends Tap sweep up and back to where it was', () => {
    assert.ok(looks(tap) > 6, `${looks(tap)} needles`);
    assert.equal(tap.at(-1).indicator, tapRest, 'back on the level');
  });
  await kit.settle(300);
  const dropAt = await centre(ids.DropOut);
  await startFrames([ids.DropOut], 1300);
  await page.mouse.click(...dropAt);
  await page.waitForTimeout(90);
  await page.mouse.click(...dropAt);
  await page.mouse.move(5, 5);
  const drop = groupOf(await frames(1300), 0);
  check('Needle: a double-click drops Drop out and it climbs back', () => assert.ok(looks(drop) > 6, `${looks(drop)} needles`));
  await startFrames([ids.Shiver], 1200);
  const shiver = groupOf(await frames(1200), 0);
  check('Needle: Shiver never settles', () => assert.ok(looks(shiver) > 6, `${looks(shiver)} needles`));
  await startFrames([ids.BeatKick], 1400);
  await transport(true);
  const kick = groupOf(await frames(1400), 0);
  await transport(false);
  check('Needle: Beat kick kicks on the transport\'s beats', () => assert.ok(looks(kick) > 4, `${looks(kick)} needles`));

  // --- Attention -----------------------------------------------------------------------------------
  ids = await open('Attention');
  await startFrames([ids.PopIn, ids.Pulse], 1800);
  await kit.preview(true);
  const attention = await frames(1800);
  const popIn = groupOf(attention, 0).map((g) => g.opacity);
  const pulse = groupOf(attention, 1).map((g) => g.width);
  check('Attention: Pop in is hidden as the panel opens, then grows in; Pulse swells and settles', () => {
    assert.ok(Math.min(...popIn) < 0.4 && popIn.at(-1) > 0.95, fmt(popIn));
    assert.ok(Math.max(...pulse) / Math.min(...pulse) > 1.02, `${Math.min(...pulse)} to ${Math.max(...pulse)}`);
  });
  const knockRest = (await now([ids.Knock]))[0];
  await startFrames([ids.Knock], 600);
  await page.mouse.click(...(await centre(ids.Knock)));
  await page.mouse.move(5, 5);
  const knock = groupOf(await frames(600), 0).map((g) => g.width - knockRest.width);
  check('Attention: a click knocks Knock, and it settles', () => {
    assert.ok(Math.max(...knock.map(Math.abs)) > 0.5, fmt(knock));
    assert.ok(Math.abs(knock.at(-1)) < 0.3);
  });
  await trustScripts();
  const lookRest = (await now([ids.LookHere]))[0];
  await startFrames([ids.LookHere], 4600);
  const look = groupOf(await frames(4600), 0).map((g) => g.y - lookRest.y);
  check('Attention: Look here jumps when its script plays it', () => assert.ok(Math.min(...look) < -6, fmt([Math.min(...look)])));
  const beatRest = (await now([ids.BeatPulse]))[0];
  await startFrames([ids.BeatPulse], 1400);
  await transport(true);
  const beat = groupOf(await frames(1400), 0).map((g) => g.width / beatRest.width);
  await transport(false);
  check('Attention: Beat pulse swells on the transport\'s beats', () => assert.ok(Math.max(...beat) > 1.03, fmt([Math.max(...beat)])));

  // --- Readout -------------------------------------------------------------------------------------
  ids = await open('Readout');
  await kit.preview(true);
  await kit.settle(800);
  // Before the script moves anything: two readings by hand, and the swap caught half-way. The words
  // leaving fade where they were, centred as the new ones are, not set flush left beside them.
  const setLevel = (id, v) => page.evaluate(async ({ id, v }) => {
    const { updatePanelPreviewSession } = await window.__ceImport('/src/CE_Application/stores/interactionPreview.js');
    updatePanelPreviewSession(id, { valueOverrideEnabled: true, valueOverride: v });
  }, { id, v });
  await setLevel(ids.Crossfade, -8.9);
  await kit.settle(700);
  await setLevel(ids.Crossfade, -11.1);
  await page.waitForTimeout(120);
  const swap = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const range = document.createRange();
    return [...el.querySelectorAll('.text-span')].map((span) => {
      const nodes = [...span.querySelectorAll('.text-glyphs, .text-glyphs *')].flatMap((e) => [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()));
      const rs = nodes.map((n) => { range.selectNodeContents(n); return range.getBoundingClientRect(); }).filter((r) => r.width > 0);
      return { ghost: span.classList.contains('text-ghost'), centre: (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2 };
    });
  }, inPreview(ids.CrossfadeReading));
  check('Readout: a reading crossfades in place, the old words centred where they were', () => {
    const ghost = swap.find((w) => w.ghost);
    const live = swap.find((w) => !w.ghost);
    assert.ok(ghost && live, JSON.stringify(swap));
    assert.ok(Math.abs(ghost.centre - live.centre) < 2, `${ghost.centre.toFixed(1)} against ${live.centre.toFixed(1)}`);
  });
  // A level set by hand wins over a script's: let the script's through again.
  await page.evaluate(async (id) => {
    const { updatePanelPreviewSession } = await window.__ceImport('/src/CE_Application/stores/interactionPreview.js');
    updatePanelPreviewSession(id, { valueOverrideEnabled: false });
  }, ids.Crossfade);
  await trustScripts();
  const readings = ['Odometer', 'Reel', 'Roll', 'Push', 'Crossfade'];
  const words = () => page.evaluate((sels) => sels.map((sel) => {
    const el = document.querySelector(sel);
    const clone = el?.cloneNode(true);
    clone?.querySelectorAll('style').forEach((s) => s.remove());
    // Each play of an effect writes its keyframes under a fresh name (the two alternate).
    const played = [...new Set([...(el?.querySelectorAll('*') ?? [])].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== 'none'))].sort().join(' ');
    return { text: clone?.textContent?.replace(/\s+/g, ' ').trim() ?? '', played };
  }), readings.map((name) => inPreview(ids[`${name}Reading`])));
  await kit.settle(1500);
  // Each new reading starts its effect again; a Reel's words are columns of digits while they spin.
  const seen = readings.map(() => new Set());
  const starts = readings.map(() => 0);
  const was = readings.map(() => '');
  for (let k = 0; k < 50; k += 1) {
    (await words()).forEach((w, i) => {
      if (/dB$/.test(w.text)) seen[i].add(w.text);
      if (w.played && w.played !== was[i]) starts[i] += 1;
      if (w.played) was[i] = w.played;
    });
    await page.waitForTimeout(90);
  }
  check('Readout: each meter\'s level moves, and its reading changes and plays its effect each time', () => {
    readings.forEach((name, i) => {
      assert.ok(starts[i] >= 2, `${name} started ${starts[i]} times`);
      if (name !== 'Reel') assert.ok(seen[i].size >= 2, `${name}: ${[...seen[i]].join(' | ')}`);
    });
  });
  assert.deepEqual(await scriptErrors(), []);

  // --- Together ------------------------------------------------------------------------------------
  ids = await open('Together');
  const row = (key) => [1, 2, 3, 4, 5, 6].map((k) => ids[`${key}${k}`]);
  await startFrames(row('PowerOn'), 2400);
  await kit.preview(true);
  const power = await frames(2400);
  const firstMove = [0, 1, 2, 3, 4, 5].map((n) => {
    const run = groupOf(power, n);
    return run.find((g, j) => j > 0 && g.indicator !== run[j - 1].indicator)?.t ?? Infinity;
  });
  check('Together: Power-on reaches each meter of its row in turn', () => {
    assert.ok(firstMove.every((t, k) => k === 0 || t >= firstMove[k - 1]) && firstMove[5] - firstMove[0] > 300, fmt(firstMove));
  });
  await startFrames([...row('Spectrum'), ...row('Chase')], 2000);
  const moving = await frames(2000);
  check('Together: Spectrum and Chase keep moving', () => {
    for (let n = 0; n < 12; n += 1) assert.ok(looks(groupOf(moving, n)) > 2, `meter ${n + 1}`);
  });
  await startFrames(row('Bounce'), 1400);
  await transport(true);
  const bounce = await frames(1400);
  await transport(false);
  check('Together: Beat bounce kicks its row on the transport\'s beats', () => {
    for (let n = 0; n < 6; n += 1) assert.ok(looks(groupOf(bounce, n)) > 2, `meter ${n + 1}`);
  });

  // --- Phase 2 ------------------------------------------------------------------------------------
  // What plays on a part, each sample: the animation names on its elements (its moves and its paint),
  // so a play is a change of name (each play alternates between two).
  const playing = (list) => page.evaluate((list) => list.map(({ sel, part }) => {
    const root = document.querySelector(sel);
    const els = part ? [...(root?.querySelectorAll(`[data-part="${part}"], [data-part="${part}"] *`) ?? [])] : [root, ...(root?.querySelectorAll('*') ?? [])];
    return [...new Set(els.filter(Boolean).map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== 'none'))].sort().join(' ');
  }), list);
  /** How many times each place started something over `ms`, sampled every 60 ms. */
  async function plays(list, ms) {
    const starts = list.map(() => 0);
    const was = list.map(() => '');
    for (let t = 0; t < ms; t += 60) {
      (await playing(list)).forEach((names, i) => { if (names && names !== was[i]) starts[i] += 1; was[i] = names || was[i]; });
      await page.waitForTimeout(60);
    }
    return starts;
  }
  const at = (id, part = '') => ({ sel: inPreview(id), part });

  // Parts, on Anodised.
  ids = await open('Parts');
  await kit.preview(true);
  const scaleLit = await plays([at(ids.ScaleLightUp, 'scale')], 900);
  check('Parts: Scale light-up lights the scale as the panel opens', () => assert.ok(scaleLit[0] >= 1));
  const parts = await plays([at(ids.LampFlash, 'lamp'), at(ids.FaceGlow, 'face'), at(ids.NeedleGlow, 'indicator')], 9000);
  check('Parts: the clip lamp is drawn and flares each time the level clips; the face and the needle light as the level crosses their lines', () => {
    assert.ok(parts[0] >= 2, `Lamp flash ${parts[0]}`);
    assert.ok(parts[1] >= 1, `Face glow ${parts[1]}`);
    assert.ok(parts[2] >= 1, `Needle glow ${parts[2]}`);
  });
  const glintBefore = (await playing([at(ids.CoverGlint, 'cover')]))[0];
  await page.mouse.click(...(await centre(ids.CoverGlint)));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  const glint = (await playing([at(ids.CoverGlint, 'cover')]))[0];
  check('Parts: a click makes Cover glint catch the light', () => assert.ok(glint && glint !== glintBefore, `${glintBefore} → ${glint}`));

  // Level, on Carbon Pro: a burst every 2.4 s, each one a clip.
  ids = await open('Level');
  await kit.preview(true);
  await startFrames([ids.ClipShake, ids.PeakFlare], 5200);
  const level = await plays([at(ids.ClipFlash, 'indicator'), at(ids.RedWash, 'housing')], 5000);
  const levelRun = await frames(0);
  const shake = groupOf(levelRun, 0).map((g) => g.x);
  const flare = groupOf(levelRun, 1).map((g) => g.width);
  const over = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)].some((e) => !e.children.length && e.textContent === 'OVER'), inPreview(ids.OverThrown));
  check('Level: as each burst clips, the lamps flash, the meter shakes and its case washes red', () => {
    assert.ok(level[0] >= 2, `Clip flash ${level[0]}`);
    assert.ok(level[1] >= 2, `Red wash ${level[1]}`);
    assert.ok(Math.max(...shake) - Math.min(...shake) > 2, `Clip shake moved ${(Math.max(...shake) - Math.min(...shake)).toFixed(1)} px`);
    assert.ok(Math.max(...flare) / Math.min(...flare) > 1.02, 'Peak flare swells');
  });
  let thrown = over;
  for (let k = 0; k < 40 && !thrown; k += 1) {
    await page.waitForTimeout(60);
    thrown = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)].some((e) => !e.children.length && e.textContent === 'OVER'), inPreview(ids.OverThrown));
  }
  check('Level: "OVER" rises from the meter as it clips', () => assert.ok(thrown));

  // Ballistics, on Valve Console: one signal, five needles.
  ids = await open('Ballistics');
  await kit.preview(true);
  await kit.settle(1200);
  const needles = ['Vu', 'Ppm', 'Bouncy', 'Lazy', 'StickyPeak'];
  const angles = needles.map(() => []);
  for (let k = 0; k < 60; k += 1) {
    const now = await page.evaluate((sels) => sels.map((sel) => Number((/rotate\(([-\d.]+)/.exec(document.querySelector(`${sel} [data-part="indicator"]`)?.getAttribute('transform') ?? '') ?? [])[1])), needles.map((name) => inPreview(ids[name])));
    now.forEach((a, i) => angles[i].push(a));
    await page.waitForTimeout(50);
  }
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  check('Ballistics: one signal, five needles, each where its ballistics put it; the PPM reads higher than the lazy needle', () => {
    for (let i = 0; i < needles.length; i += 1) assert.ok(new Set(angles[i]).size > 4, `${needles[i]} moves`);
    const apart = angles[0].map((_, k) => new Set(angles.map((list) => list[k].toFixed(1))).size);
    assert.ok(mean(apart) > 3, `needles apart: ${mean(apart).toFixed(1)} of 5 on average`);
    assert.ok(mean(angles[1]) > mean(angles[3]) + 3, `PPM ${mean(angles[1]).toFixed(1)}°, Lazy ${mean(angles[3]).toFixed(1)}°`);
  });

  // Segments, on Gimbal Ring.
  ids = await open('Segments');
  await kit.preview(true);
  await page.waitForTimeout(400);
  const delays = (id) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-lamp]`)]
    .map((g) => [Number(g.dataset.lamp), parseFloat(getComputedStyle(g).animationDelay) || 0]), inPreview(id));
  const cascade = await delays(ids.Cascade);
  check('Segments: Cascade\'s lamps come on along the row, each after the last', () => {
    assert.ok(cascade.length >= 8, `${cascade.length} lamps`);
    const byIndex = new Map(cascade);
    const order = [...byIndex.keys()].sort((a, b) => a - b).map((i) => byIndex.get(i));
    assert.ok(order.every((d, i) => i === 0 || d > order[i - 1]), order.join(' '));
  });
  const sparkle = await delays(ids.Sparkle);
  check('Segments: Sparkle\'s lamps twinkle in a scattered order, each at a time of its own', () => {
    const byIndex = [...new Map(sparkle).entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
    assert.equal(new Set(byIndex).size, byIndex.length, byIndex.join(' '));
    assert.ok(byIndex.some((d, i) => i > 0 && d < byIndex[i - 1]), `not in order: ${byIndex.join(' ')}`);
  });
  const segs = await plays([at(ids.Ripple, 'indicator'), at(ids.PeakDrop, 'marker')], 5200);
  const ripple = await delays(ids.Ripple);
  check('Segments: Ripple runs out from the level as it clips; Peak drop\'s peak lamp drops as the level falls back', () => {
    assert.ok(segs[0] >= 1 && ripple.length >= 8, `Ripple ${segs[0]}, ${ripple.length} lamps`);
    assert.ok(new Set(ripple.map(([, d]) => d)).size >= 3, 'out from the level, a lamp at a time');
    assert.ok(segs[1] >= 1, `Peak drop ${segs[1]}`);
  });

  assert.deepEqual(kit.failures, [], 'no page errors');
  console.log('meterShowcase: all checks passed');
} finally {
  await kit.close();
}
