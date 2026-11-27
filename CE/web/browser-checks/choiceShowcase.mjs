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
 * Phase 2 animates the options themselves (choiceGroupLayout.js CHOICE_PARTS), and these hold what
 * each option, or the thumb, does:
 *
 *   - Thumb: a new choice sends the thumb across to it, through the options between, in every style
 *     (Slide, Underline glide, Dot hop, Lamp run); Stretch reaches ahead before its back edge follows.
 *   - The chosen: the option chosen pops, presses in, rolls its label in or flashes its ink, and the
 *     others do not.
 *   - Appear: the options come in one after another as the panel opens: in order, out from the one
 *     chosen, last first; Typewriter labels types each label after the one before.
 *   - Hover: the option under the pointer lifts or grows its label; Spotlight dims the others.
 *   - New options: choosing another section gives the three below its options, played in.
 *   - Together: Cascade in brings the groups in in turn, Wave lifts them in turn, Ripple runs along
 *     the row from a choice on the first.
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
/**
 * One frame of a group as drawn: its own box, the thumb's, and each option's (the box with its own
 * motion), its label's width, its pieces and its ink. Sampled in the page a frame at a time from
 * `startFrames` till `ms` later; `frames` hands them back.
 */
const startFrames = (ids, ms) => page.evaluate(({ sels, ms }) => {
  window.__frames = [];
  const t0 = performance.now();
  const snap = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const thumb = el.querySelector('[data-choice-thumb]')?.getBoundingClientRect();
    const options = [...el.querySelectorAll('[data-choice-key]')].map((o) => {
      const or = o.getBoundingClientRect();
      const label = o.querySelector('.choice-label');
      const ink = label?.querySelector('.choice-ink') ?? label;
      return {
        key: o.dataset.choiceKey, x: or.x + or.width / 2, y: or.y + or.height / 2, width: or.width,
        opacity: Number(getComputedStyle(o).opacity), labelWidth: label?.getBoundingClientRect().width ?? 0,
        text: label?.textContent ?? '', pieces: label?.querySelectorAll('.choice-piece').length ?? 0,
        shown: [...(label?.querySelectorAll('.choice-piece') ?? [])].filter((p) => Number(getComputedStyle(p).opacity) > 0.5).length,
        ink: ink ? getComputedStyle(ink).color : '',
      };
    });
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, opacity: Number(getComputedStyle(el).opacity), thumb: thumb ? { left: thumb.left, right: thumb.right, width: thumb.width } : null, options };
  };
  const sample = () => {
    window.__frames.push({ t: performance.now() - t0, groups: sels.map(snap) });
    if (performance.now() - t0 < ms) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}, { sels: ids.map(inPreview), ms });
const frames = async (ms) => {
  await page.waitForTimeout(ms + 80);
  return page.evaluate(() => window.__frames);
};
/** The groups as drawn now. */
const now = async (list) => { await startFrames(list, 0); return (await frames(0)).at(-1).groups; };
/** Frames of one group, from a run sampled over several. */
const groupOf = (run, n) => run.filter((f) => f.groups[n]).map((f) => ({ ...f.groups[n], t: f.t }));
const option = (frame, key) => frame.options.find((o) => o.key === key);
const fmt = (list) => list.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(' ');

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

  // --- Thumb -------------------------------------------------------------------------------------
  ids = await open('Thumb');
  await kit.preview(true);
  await kit.settle(1200);
  await page.mouse.move(5, 5);
  for (const [name, key] of [['Slide', 'opt_4'], ['UnderlineGlide', 'opt_4'], ['DotHop', 'opt_4'], ['LampRun', 'opt_6']]) {
    const [rest] = await now([ids[name]]);
    const target = option(rest, key);
    await startFrames([ids[name]], 900);
    await page.mouse.click(target.x, target.y);
    const run = groupOf(await frames(900), 0);
    const centres = run.map((f) => (f.thumb.left + f.thumb.right) / 2);
    const from = (rest.thumb.left + rest.thumb.right) / 2;
    const [start, end] = [target.x - target.width / 2, target.x + target.width / 2];
    check(`Thumb: ${name}'s thumb travels across to the option chosen, through those between`, () => {
      assert.ok(rest.thumb, 'drawn apart, on its own layer');
      assert.ok(centres.some((c) => c > from + 8 && c < start - 2), `from ${from.toFixed(0)} to ${start.toFixed(0)}: ${fmt(centres)}`);
      assert.ok(centres.at(-1) > start && centres.at(-1) < end, `ends on it: ${centres.at(-1).toFixed(1)} in ${start.toFixed(0)}-${end.toFixed(0)}`);
    });
    await page.mouse.move(5, 5);
  }
  {
    const [rest] = await now([ids.Stretch]);
    const target = option(rest, 'opt_5');
    await startFrames([ids.Stretch], 900);
    await page.mouse.click(target.x, target.y);
    const run = groupOf(await frames(900), 0);
    const widths = run.map((f) => f.thumb.width);
    check('Thumb: Stretch reaches ahead to the new option before its back edge follows', () => {
      assert.ok(Math.max(...widths) > rest.thumb.width * 2, `${rest.thumb.width.toFixed(0)}: ${fmt(widths)}`);
      assert.ok(Math.abs(widths.at(-1) - rest.thumb.width) < 2, 'and comes back to one option\'s width');
    });
    await page.mouse.move(5, 5);
  }

  // --- The chosen --------------------------------------------------------------------------------
  ids = await open('The chosen');
  await kit.preview(true);
  await kit.settle(1200);
  await page.mouse.move(5, 5);
  const chosenRun = async (name, key, ms = 500) => {
    const [rest] = await now([ids[name]]);
    await startFrames([ids[name]], ms);
    await page.mouse.click(option(rest, key).x, option(rest, key).y);
    await page.mouse.move(5, 5);
    const run = groupOf(await frames(ms), 0);
    await kit.settle(300);
    return { rest, run };
  };
  {
    const { rest, run } = await chosenRun('Pop', 'opt_3');
    const grown = run.map((f) => option(f, 'opt_3').width / option(rest, 'opt_3').width);
    const others = run.map((f) => option(f, 'opt_1').width / option(rest, 'opt_1').width);
    check('The chosen: Pop grows the option chosen and leaves the others', () => {
      assert.ok(Math.max(...grown) > 1.06, fmt(grown));
      assert.ok(Math.max(...others) < 1.01 && Math.min(...others) > 0.99, fmt(others));
    });
  }
  {
    const { rest, run } = await chosenRun('PressIn', 'opt_2');
    const pressed = run.map((f) => option(f, 'opt_2').width / option(rest, 'opt_2').width);
    check('The chosen: Press in sinks the option chosen', () => assert.ok(Math.min(...pressed) < 0.95, fmt(pressed)));
  }
  {
    const { run } = await chosenRun('LabelRoll', 'opt_3', 700);
    const pieces = run.map((f) => option(f, 'opt_3').pieces);
    check('The chosen: Label roll rolls the chosen label in, in pieces', () => {
      assert.ok(Math.max(...pieces) > 1, fmt(pieces));
      assert.ok(run.every((f) => option(f, 'opt_1').pieces === 0), 'and no other label');
    });
  }
  {
    const { rest, run } = await chosenRun('InkFlash', 'opt_2');
    const inks = new Set(run.map((f) => option(f, 'opt_2').ink));
    check('The chosen: Ink flash flashes the chosen label\'s ink', () => {
      assert.ok([...inks].some((ink) => ink !== option(rest, 'opt_2').ink), [...inks].join(' | '));
    });
  }

  // --- Appear ------------------------------------------------------------------------------------
  ids = await open('Appear');
  await startFrames([ids.Cascade, ids.FanOut, ids.DropIn, ids.TypewriterLabels], 2400);
  await kit.preview(true);
  const appear = await frames(2400);
  /** The frame at which each option is first at least half there. */
  const arrivals = (run) => run[0].options.map((o) => run.find((f) => option(f, o.key)?.opacity > 0.5)?.t ?? Infinity);
  const ascending = (list) => list.every((t, k) => k === 0 || t >= list[k - 1]);
  {
    const cascade = arrivals(groupOf(appear, 0));
    const fan = arrivals(groupOf(appear, 1));
    const drop = arrivals(groupOf(appear, 2));
    check('Appear: Cascade brings the options in one after another, in order', () => {
      assert.ok(ascending(cascade) && cascade.at(-1) - cascade[0] > 200, fmt(cascade));
      assert.ok(Number.isFinite(cascade.at(-1)), 'and all of them');
    });
    check('Appear: Fan out starts from the option chosen and goes out both ways', () => {
      assert.ok(fan[2] < fan[1] && fan[2] < fan[3] && fan[1] < fan[0] && fan[3] < fan[4], fmt(fan));
    });
    check('Appear: Drop in brings the last in first', () => {
      assert.ok(ascending([...drop].reverse()) && drop[0] - drop.at(-1) > 150, fmt(drop));
    });
    const typed = groupOf(appear, 3);
    const firstWhole = typed.find((f) => f.options[0].pieces && f.options[0].shown === f.options[0].pieces);
    check('Appear: Typewriter labels types the first label out before the next has begun', () => {
      assert.ok(firstWhole, 'the first label is typed out');
      assert.ok(firstWhole.options.at(-1).shown < firstWhole.options.at(-1).pieces, `${firstWhole.options.map((o) => `${o.shown}/${o.pieces}`).join(' ')}`);
    });
  }

  // --- Hover -------------------------------------------------------------------------------------
  ids = await open('Hover');
  await kit.preview(true);
  await kit.settle(1200);
  await page.mouse.move(5, 5);
  const hovered = async (name, key) => {
    const [rest] = await now([ids[name]]);
    await page.mouse.move(option(rest, key).x, option(rest, key).y);
    await page.waitForTimeout(450);
    const [after] = await now([ids[name]]);
    await page.mouse.move(5, 5);
    await kit.settle(400);
    return { rest, now: after };
  };
  {
    const { rest, now } = await hovered('Lift', 'opt_1');
    check('Hover: Lift grows the option under the pointer, and it alone', () => {
      assert.ok(option(now, 'opt_1').width / option(rest, 'opt_1').width > 1.06);
      assert.ok(Math.abs(option(now, 'opt_3').width - option(rest, 'opt_3').width) < 0.5);
    });
  }
  {
    const { now } = await hovered('Spotlight', 'opt_2');
    check('Hover: Spotlight dims the other options, not the one under the pointer', () => {
      assert.ok(option(now, 'opt_2').opacity > 0.95, fmt(now.options.map((o) => o.opacity)));
      assert.ok(['opt_1', 'opt_3', 'opt_4'].every((key) => option(now, key).opacity < 0.6), fmt(now.options.map((o) => o.opacity)));
    });
  }
  {
    const { rest, now } = await hovered('GrowLabel', 'opt_3');
    check('Hover: Grow label grows the label under the pointer', () => {
      assert.ok(option(now, 'opt_3').labelWidth / option(rest, 'opt_3').labelWidth > 1.12);
      assert.ok(Math.abs(option(now, 'opt_1').labelWidth - option(rest, 'opt_1').labelWidth) < 0.5);
    });
  }

  // --- New options -------------------------------------------------------------------------------
  ids = await open('New options');
  await kit.preview(true);
  await kit.settle(1200);
  const children = [ids.RollOver, ids.Crossfade, ids.CascadeNew];
  const before = await now(children);
  const filterAt = await optionAt(ids.Section, 'filter');
  await startFrames(children, 900);
  await page.mouse.click(...filterAt);
  await page.mouse.move(5, 5);
  const newRun = await frames(900);
  check('New options: choosing another section gives the three below its options', () => {
    assert.deepEqual(before.map((g) => g.options.map((o) => o.text).join(' ')), ['Saw Square Noise', 'Saw Square Noise', 'Saw Square Noise']);
    assert.deepEqual(newRun.at(-1).groups.map((g) => g.options.map((o) => o.text).join(' ')), ['LP BP HP', 'LP BP HP', 'LP BP HP']);
  });
  check('New options: Roll over and Crossfade play over the new labels, Cascade the new brings them in in turn', () => {
    assert.ok(groupOf(newRun, 0).some((g) => g.options.some((o) => o.pieces > 0)), 'Roll over rolls');
    assert.ok(groupOf(newRun, 1).some((g) => g.options.some((o) => o.pieces > 0 || o.opacity < 0.9)), 'Crossfade fades');
    const cascadeNew = arrivals(groupOf(newRun, 2).filter((g) => g.options[0].text === 'LP'));
    assert.ok(ascending(cascadeNew) && cascadeNew.at(-1) > cascadeNew[0], fmt(cascadeNew));
  });

  // --- Together ----------------------------------------------------------------------------------
  ids = await open('Together');
  const lane = (key) => [1, 2, 3, 4, 5].map((k) => ids[`${key}${k}`]);
  await startFrames(lane('CascadeIn'), 2000);
  await kit.preview(true);
  const cascadeIn = await frames(2000);
  const groupArrivals = (run, count) => Array.from({ length: count }, (_, n) => run.find((f) => f.groups[n]?.opacity > 0.5)?.t ?? Infinity);
  check('Together: Cascade in brings each group in after the last as the panel opens', () => {
    const at = groupArrivals(cascadeIn, 5);
    assert.ok(ascending(at) && at[4] - at[0] > 300, fmt(at));
  });
  await startFrames(lane('Wave'), 2700);
  const wave = await frames(2700);
  check('Together: Wave lifts the groups in turn', () => {
    const lows = [0, 1, 2, 3, 4].map((n) => {
      const run = groupOf(wave, n);
      const ys = run.map((g) => g.y);
      return run[ys.indexOf(Math.min(...ys))].t;
    });
    const rises = [0, 1, 2, 3, 4].map((n) => Math.max(...groupOf(wave, n).map((g) => g.y)) - Math.min(...groupOf(wave, n).map((g) => g.y)));
    assert.ok(rises.every((r) => r > 5), fmt(rises));
    assert.ok(new Set(lows.map((t) => Math.round(t / 60))).size > 2, `not all at once: ${fmt(lows)}`);
  });
  const rippleRest = await now(lane('Ripple'));
  await startFrames(lane('Ripple'), 1000);
  await page.mouse.click(...(await optionAt(ids.Ripple1, 'opt_2')));
  await page.mouse.move(5, 5);
  const ripple = await frames(1000);
  check('Together: Ripple runs a pulse along the row from a choice on the first', () => {
    const peaks = [0, 1, 2, 3, 4].map((n) => {
      const run = groupOf(ripple, n);
      const widths = run.map((g) => g.width / rippleRest[n].width);
      return { grow: Math.max(...widths), at: run[widths.indexOf(Math.max(...widths))].t };
    });
    assert.ok(peaks.every((p) => p.grow > 1.04), fmt(peaks.map((p) => p.grow)));
    assert.ok(ascending(peaks.map((p) => p.at)) && peaks[4].at - peaks[0].at > 250, fmt(peaks.map((p) => p.at)));
  });

  assert.deepEqual(kit.failures, [], 'no page errors');
  console.log('choiceShowcase: all checks passed');
} finally {
  await kit.close();
}
