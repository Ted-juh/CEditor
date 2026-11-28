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
 *   - Words (Reel): Type on writes "SIGNAL" a letter at a time as the panel opens, each where the word
 *     had it; Shimmer keeps running along it; Shatter bursts it as the level clips, Roll call rolls it
 *     as the level passes 70%; Numbers in turn writes the scale's numbers round the dial.
 *   And on a key built here (utils/svgWords.js is shared): its legend typed a letter at a time.
 *   And built here, words that keep their part's colour while an effect plays on them, and Reel on
 *   SVG letters: a meter's legend typed in its colour frames' red and blue, a shimmer's light on its
 *   letters, its letters and a key's spun through other glyphs, each in a window of its own.
 *   And on meters drawn plain (Graphite) in LED segments, built here: a bar's, a column's and an
 *   arc's segments are lamps Cascade reaches in turn and Sparkle in a scattered order.
 *   And a value effect through a needle's ballistics, built here: Self-test on a Lazy needle (Valve)
 *   lags the same sweep on one that jumps, and hands back to the level without a jump.
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

  // --- Words, on Reel ----------------------------------------------------------------------------
  ids = await open('Words');
  await kit.preview(true);
  await page.waitForTimeout(500);
  const pieces = (id, attr = '[data-word-piece]') => page.evaluate(({ sel, attr }) => [...document.querySelectorAll(`${sel} ${attr}`)]
    .map((t) => ({ text: t.textContent, x: Number(t.getAttribute('x')), delay: parseFloat(getComputedStyle(t).animationDelay) || 0, name: getComputedStyle(t).animationName, loops: getComputedStyle(t).animationIterationCount })), { sel: inPreview(id), attr });
  const typed = await pieces(ids.TypeOn);
  check('Words: Type on writes "SIGNAL" a letter at a time as the panel opens, each where the word had it', () => {
    assert.deepEqual(typed.map((p) => p.text), ['S', 'I', 'G', 'N', 'A', 'L']);
    assert.ok(typed.every((p, i) => p.name !== 'none' && (i === 0 || (p.x > typed[i - 1].x && p.delay > typed[i - 1].delay))), JSON.stringify(typed));
  });
  const numbers = await pieces(ids.NumbersInTurn);
  check('Words: Numbers in turn turns the scale\'s numbers on and writes them round the dial', () => {
    assert.ok(numbers.length >= 5, `${numbers.length} numbers`);
    assert.equal(numbers[0].text, '-60');
    assert.equal(new Set(numbers.map((p) => p.delay)).size, numbers.length);
  });
  const shimmer = await pieces(ids.Shimmer);
  check('Words: Shimmer keeps running along the legend', () => assert.ok(shimmer.length === 6 && shimmer.every((p) => p.loops === 'infinite'), JSON.stringify(shimmer)));
  const wordPlays = await plays([at(ids.Shatter, 'legend'), at(ids.RollCall, 'legend')], 8500);
  check('Words: Shatter bursts the legend as the level clips; Roll call rolls it as the level passes 70%', () => {
    assert.ok(wordPlays[0] >= 2, `Shatter ${wordPlays[0]}`);
    assert.ok(wordPlays[1] >= 1, `Roll call ${wordPlays[1]}`);
  });

  // --- A meter's words keep their part's colour under an effect; Reel on its letters --------------
  await kit.preview(false);
  ids = await page.evaluate(async () => {
    const { panelMaker } = await window.__ceImport('/scripts/festivalKit.js');
    const { serializePanel, deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const { words, keyframes } = await window.__ceImport('/src/CE_Application/utils/componentPresetKit.js');
    const f = panelMaker('meter-word-colour', 'Meter word colour', { set: 'reel', bg: 'FF5E6A5E', width: 900, height: 260, fields: { gridEnabled: false } });
    const meter = (name, x, animations) => {
      const c = f.add('Meter', name, x, 40, 260, 160);
      c._children.Meter.value = 0.4;
      c._children.Animations = { _type: 'Animations', enabled: true, _children: animations };
    };
    const forever = { iterations: 'infinite' };
    meter('Painted', 20, {
      colour: keyframes('colour', { type: 'always' }, 'legend', [{ at: 0, fill: 'FFFF0000' }, { at: 0.5, fill: 'FF0000FF' }, { at: 1, fill: 'FFFF0000' }], 1000, { easing: 'linear', ...forever }),
      typed: words('typed', { type: 'always' }, 'legend', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 80, duration: 300, ...forever }),
    });
    meter('Shine', 310, { shine: words('shine', { type: 'always' }, 'legend', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 500, colour: 'FFFF2D2D', ...forever }) });
    meter('Spin', 600, { spin: words('spin', { type: 'always' }, 'legend', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 60, duration: 700, ...forever }) });
    const panel = deserializePanel(serializePanel(f.scenes([])), '/tmp/meter-word-colour.cepanel', null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  });
  await kit.settle(500);
  await kit.preview(true);
  await page.waitForTimeout(500);
  const meterWordSamples = async (id, times = 20, every = 50) => {
    const out = [];
    for (let k = 0; k < times; k += 1) {
      out.push(await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-word-piece]`)].map((t) => ({
        text: t.textContent, fill: getComputedStyle(t).fill, transform: getComputedStyle(t).transform, lines: t.querySelectorAll('tspan').length,
        clipped: !!t.closest('[clip-path]'),
      })), inPreview(id)));
      await page.waitForTimeout(every);
    }
    return out;
  };
  const rgb = (fill) => (/rgb\((\d+), (\d+), (\d+)/.exec(fill) ?? []).slice(1).map(Number);
  const painted = await meterWordSamples(ids.Painted);
  check('Words: a meter\'s legend typed under its colour frames keeps them, red to blue, where it once took the effect\'s colour', () => {
    assert.ok(painted.every((list) => list.length === 6), `${painted[0].length} letters`);
    const fills = painted.map((list) => rgb(list[0].fill));
    assert.ok(fills.some(([r, , b]) => r > 200 && b < 60), `red: ${painted.map((l) => l[0].fill).join(' | ')}`);
    assert.ok(fills.some(([r, , b]) => b > 200 && r < 60), `blue: ${painted.map((l) => l[0].fill).join(' | ')}`);
  });
  const shine = await meterWordSamples(ids.Shine);
  check('Words: a shimmer\'s light still runs along a meter\'s letters, on their fill', () => {
    const fills = shine.flat().map((p) => rgb(p.fill));
    assert.ok(fills.some(([r, g, b]) => r > 240 && g < 80 && b < 80), [...new Set(shine.flat().map((p) => p.fill))].join(' | '));
  });
  const spin = await meterWordSamples(ids.Spin);
  check('Words: Reel spins a meter\'s legend a letter at a time through other glyphs, each in a window of its own', () => {
    assert.ok(spin.every((list) => list.length === 6 && list.every((p) => p.lines === 7 && p.clipped)), JSON.stringify(spin[0]));
    assert.ok(spin.every((list) => list.map((p) => p.text[0]).join('') === 'SIGNAL'), 'each column starts on its own letter');
    assert.ok(new Set(spin.map((list) => list[2].transform)).size > 3, 'its columns roll');
  });

  // --- A key's legend, a letter at a time (the same pieces) -----------------------------------------
  await kit.preview(false);
  ids = await page.evaluate(async () => {
    const { panelMaker } = await window.__ceImport('/scripts/festivalKit.js');
    const { serializePanel, deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const { words } = await window.__ceImport('/src/CE_Application/utils/componentPresetKit.js');
    const f = panelMaker('key-words', 'Key words', { set: 'neon', bg: 'FF101218', width: 600, height: 300, fields: { gridEnabled: false } });
    const key = f.add('ToggleButton', 'Key', 60, 60, 200, 140);
    Object.assign(key._children.Parts._children.legend, { offText: 'MUTE', onText: 'LIVE', fontSize: 16 });
    key._children.Animations = { _type: 'Animations', enabled: true, _children: {
      typed: words('typed', { type: 'always' }, 'legend', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 120, duration: 300, iterations: 1 }),
    } };
    const spinKey = f.add('ToggleButton', 'SpinKey', 300, 60, 200, 140);
    Object.assign(spinKey._children.Parts._children.legend, { offText: 'MUTE', onText: 'LIVE', fontSize: 16 });
    spinKey._children.Animations = { _type: 'Animations', enabled: true, _children: {
      spin: words('spin', { type: 'always' }, 'legend', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 60, duration: 700, iterations: 'infinite' }),
    } };
    const shineKey = f.add('ToggleButton', 'ShineKey', 60, 200, 200, 90);
    Object.assign(shineKey._children.Parts._children.legend, { offText: 'SOLO', onText: 'SOLO', fontSize: 16 });
    shineKey._children.Animations = { _type: 'Animations', enabled: true, _children: {
      shine: words('shine', { type: 'always' }, 'legend', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 500, colour: 'FFFF2D2D', iterations: 'infinite' }),
    } };
    const panel = deserializePanel(serializePanel(f.scenes([])), '/tmp/key-words.cepanel', null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  });
  await kit.settle(500);
  await kit.preview(true);
  await page.waitForTimeout(500);
  const keyLetters = await pieces(ids.Key);
  check('Words: a key\'s legend types a letter at a time too, each where the word had it', () => {
    assert.deepEqual(keyLetters.map((p) => p.text), ['M', 'U', 'T', 'E']);
    assert.ok(keyLetters.every((p, i) => i === 0 || (p.x > keyLetters[i - 1].x && p.delay > keyLetters[i - 1].delay)), JSON.stringify(keyLetters));
  });
  // What each piece draws, a few times a second: its fill, its transform, its column's lines.
  const sampleWords = async (id, times = 16, every = 70) => {
    const out = [];
    for (let k = 0; k < times; k += 1) {
      out.push(await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-word-piece]`)].map((t) => ({
        fill: getComputedStyle(t).fill, transform: getComputedStyle(t).transform, lines: t.querySelectorAll('tspan').length,
        clipped: !!t.closest('[clip-path]'),
      })), inPreview(id)));
      await page.waitForTimeout(every);
    }
    return out;
  };
  const spinKeyFrames = await sampleWords(ids.SpinKey);
  check('Words: Reel spins a key\'s legend a letter at a time through other glyphs, each in a window of its own', () => {
    assert.ok(spinKeyFrames.every((list) => list.length === 4 && list.every((p) => p.lines === 7 && p.clipped)), JSON.stringify(spinKeyFrames[0]));
    assert.ok(new Set(spinKeyFrames.map((list) => list[0].transform)).size > 3, 'its column rolls');
  });
  const shineKeyFrames = await sampleWords(ids.ShineKey, 20, 50);
  check('Words: a shimmer\'s light shows on a key\'s letters, which filled with the legend\'s paint lost it', () => {
    const fills = new Set(shineKeyFrames.flat().map((p) => p.fill));
    assert.ok([...fills].some((f) => /rgb\(25[0-5], 4\d, 4\d\)|rgb\(255, 45, 45\)/.test(f)), [...fills].join(' | '));
    assert.ok(fills.size > 2, 'from the legend\'s colour to the light and back');
  });

  // --- Every lamp on the plain look's LED segments (editor/MeterRenderer.svelte) -------------------
  await kit.preview(false);
  ids = await page.evaluate(async () => {
    const { panelMaker } = await window.__ceImport('/scripts/festivalKit.js');
    const { serializePanel, deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const { METER_PRESETS } = await window.__ceImport('/src/CE_Application/utils/meterPresets.js');
    const { applyPresetPatch } = await window.__ceImport('/src/CE_Application/utils/animationPresetModel.js');
    const { getControlSet } = await window.__ceImport('/src/CE_Application/models/controlSets.js');
    const { resolveControlForSet } = await window.__ceImport('/src/CE_Application/models/controlSetFamilies.js');
    const { setNestedValue } = await window.__ceImport('/src/CE_Application/stores/controlTreeUtils.js');
    const preset = (id) => METER_PRESETS.find((p) => p.id === `ce:meter:${id}`).preset;
    const f = panelMaker('plain-lamps', 'Plain lamps', { set: 'graphite', bg: 'FF202326', width: 900, height: 320, fields: { gridEnabled: false } });
    const wear = (name, x, y, w, h, meter, id) => {
      const c = f.add('Meter', name, x, y, w, h);
      Object.assign(c._children.Meter, { value: 0.6, ...meter });
      const { patch, reason } = applyPresetPatch(c, preset(id), { drawn: resolveControlForSet(c, getControlSet('graphite')) });
      if (!patch) throw new Error(`${id} on ${name}: ${reason}`);
      for (const [path, value] of Object.entries(patch)) setNestedValue(c, path, value);
    };
    wear('Bar', 40, 40, 360, 40, { segments: 12, orientation: 'horizontal' }, 'cascade');
    wear('Column', 440, 30, 50, 240, { segments: 10, orientation: 'vertical' }, 'cascade');
    wear('Arc', 540, 40, 200, 200, { segments: 16, orientation: 'arc' }, 'cascade');
    wear('Twinkle', 40, 140, 360, 40, { segments: 12, orientation: 'horizontal' }, 'sparkle');
    const panel = deserializePanel(serializePanel(f.scenes([])), '/tmp/plain-lamps.cepanel', null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  });
  await kit.settle(500);
  await kit.preview(true);
  await page.waitForTimeout(400);
  const inOrder = (list) => [...new Map(list).entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
  const plainBar = await delays(ids.Bar);
  const plainColumn = await delays(ids.Column);
  const plainArc = await delays(ids.Arc);
  const plainTwinkle = await delays(ids.Twinkle);
  check('Every lamp on the plain look: Cascade reaches a bar\'s, a column\'s and an arc\'s segments in turn along the row', () => {
    for (const [name, list, count] of [['bar', plainBar, 12], ['column', plainColumn, 10], ['arc', plainArc, 16]]) {
      assert.equal(list.length, count, `${name}: ${list.length} lamps`);
      const order = inOrder(list);
      assert.ok(order.every((d, i) => i === 0 || d > order[i - 1]), `${name}: ${order.join(' ')}`);
    }
  });
  check('Every lamp on the plain look: Sparkle twinkles a bar\'s segments in a scattered order', () => {
    const order = inOrder(plainTwinkle);
    assert.equal(new Set(order).size, 12, order.join(' '));
    assert.ok(order.some((d, i) => i > 0 && d < order[i - 1]), `not in order: ${order.join(' ')}`);
  });

  // --- A value effect through a needle's ballistics (editor/CanvasControl.svelte) ------------------
  await kit.preview(false);
  ids = await page.evaluate(async () => {
    const { panelMaker } = await window.__ceImport('/scripts/festivalKit.js');
    const { serializePanel, deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const { METER_PRESETS } = await window.__ceImport('/src/CE_Application/utils/meterPresets.js');
    const { applyPresetPatch } = await window.__ceImport('/src/CE_Application/utils/animationPresetModel.js');
    const { getControlSet } = await window.__ceImport('/src/CE_Application/models/controlSets.js');
    const { resolveControlForSet } = await window.__ceImport('/src/CE_Application/models/controlSetFamilies.js');
    const { setNestedValue } = await window.__ceImport('/src/CE_Application/stores/controlTreeUtils.js');
    const preset = (id) => METER_PRESETS.find((p) => p.id === `ce:meter:${id}`).preset;
    const f = panelMaker('needle-ballistics', 'Needle ballistics', { set: 'valve', bg: 'FF1E1A16', width: 700, height: 260, fields: { gridEnabled: false } });
    const meter = (name, x, ...presets) => {
      const c = f.add('Meter', name, x, 40, 260, 160);
      Object.assign(c._children.Meter, { value: 0.3 });
      for (const id of presets) {
        const { patch, reason } = applyPresetPatch(c, preset(id), { drawn: resolveControlForSet(c, getControlSet('valve')) });
        if (!patch) throw new Error(`${id} on ${name}: ${reason}`);
        for (const [path, value] of Object.entries(patch)) setNestedValue(c, path, value);
      }
    };
    meter('Jumps', 40, 'self-test');
    meter('Lazy', 380, 'lazy', 'self-test');
    const panel = deserializePanel(serializePanel(f.scenes([])), '/tmp/needle-ballistics.cepanel', null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  });
  await kit.settle(500);
  await kit.preview(true);
  const swing = [[], []];
  for (let k = 0; k < 90; k += 1) {
    const now = await page.evaluate((sels) => sels.map((sel) => Number((/rotate\(([-\d.]+)/.exec(document.querySelector(`${sel} [data-part="indicator"]`)?.getAttribute('transform') ?? '') ?? [])[1])), [inPreview(ids.Jumps), inPreview(ids.Lazy)]);
    now.forEach((a, i) => swing[i].push(a));
    await page.waitForTimeout(30);
  }
  check('Ballistics: Self-test on a Lazy needle lags the sweep it draws on one that jumps, and settles where the other does, without a jump', () => {
    const [jumps, lazy] = swing;
    const span = (list) => Math.max(...list) - Math.min(...list);
    assert.ok(span(jumps) > 30, `the sweep: ${span(jumps).toFixed(1)}°`);
    assert.ok(span(lazy) < span(jumps) - 10, `the lazy needle never catches it: ${span(lazy).toFixed(1)}° of ${span(jumps).toFixed(1)}°`);
    const steps = lazy.slice(1).map((a, i) => Math.abs(a - lazy[i]));
    assert.ok(Math.max(...steps) < span(jumps) / 3, `no jump: at most ${Math.max(...steps).toFixed(1)}° between samples`);
    assert.ok(Math.abs(lazy.at(-1) - jumps.at(-1)) < 1.5, `both on the level at the end: ${lazy.at(-1)} and ${jumps.at(-1)}`);
  });

  assert.deepEqual(kit.failures, [], 'no page errors');
  console.log('meterShowcase: all checks passed');
} finally {
  await kit.close();
}
