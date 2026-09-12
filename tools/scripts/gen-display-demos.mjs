#!/usr/bin/env node
// gen-display-demos.mjs — four filled, moving displays, recorded from the real renderers.
//
//   node tools/scripts/gen-display-demos.mjs              → writes docs/media/display-*.gif
//   node tools/scripts/gen-display-demos.mjs --only pixel  → one scene, while iterating
//   node tools/scripts/gen-display-demos.mjs --check       → non-zero if any GIF is missing
//   node tools/scripts/gen-display-demos.mjs --png         → also keep frame 0 of each as a PNG
//   node tools/scripts/gen-display-demos.mjs --verify      → prove determinism and loop closure
//
// Sibling of gen-manual-media.mjs and the same bargain: it drives the actual Vite dev server, the
// actual LcdDisplayRenderer and PixelDisplayRenderer, and the actual preview machinery, so a
// recording cannot show a feature the components do not have. The scenes live in
// displayDemos/scenes.mjs; this file is only the recorder.
//
// THE PART WORTH READING: WHY THE CLOCK IS FAKE.
//
// These renderers animate on requestAnimationFrame — marquee scroll, meter smoothing, peak-hold
// decay, the oscillator's phase, the scope's rolling history — and LcdGraphicCanvas measures its
// own frame delta with performance.now(). Screenshotting that on the wall clock gives frames at
// whatever interval Chromium happened to take to encode the last PNG (30-150ms here, unevenly), so
// the motion in the GIF runs at a speed the renderer never intended and the loop never closes.
//
// So the recorder installs a virtual clock: requestAnimationFrame is queued rather than scheduled,
// performance.now() reads the virtual time, and the recorder advances both by exactly one frame
// interval per captured frame. Every animation in the page then runs on the recorder's clock, at
// exactly 1/20s per frame however long the screenshot took.
//
// `--verify` is what proves it paid off, and it checks two different things: that a second
// recording of the same scene is byte-identical (determinism), and that the frame one past the end
// of the loop matches frame 0 (closure — the GIF wraps without a visible jump).
//
// It also has to warm up. Peak-hold, smoothing and the scope's history are stateful: their first
// second is a settling transient from zero, which in a looping GIF reads as a glitch at the wrap.
// The recorder therefore runs WARMUP_LOOPS of the same signal before it starts recording, so the
// state is already on its periodic orbit when frame 0 is taken.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, encodeGif } from './lib/animatedGif.mjs';
import { LOOP_SECONDS, SCENES } from './displayDemos/scenes.mjs';
import { buildTorusGif } from './displayDemos/sourceAnimation.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const web = join(repo, 'CE', 'web');
const outDir = join(repo, 'docs', 'media');
const PORT = 5178; // not 5177: gen-manual-media's server, so the two can run at once

const FPS = 20;
const FRAMES = LOOP_SECONDS * FPS;          // 60 frames over a 3s loop
const FRAME_MS = 1000 / FPS;                // 50ms
const DELAY_CS = Math.round(100 / FPS);     // GIF delays are in centiseconds: 5
const WARMUP_LOOPS = 2;                     // settle smoothing / peak-hold / scope history
const SCALE = 2;                            // device pixel ratio — the glyphs have to survive it

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1] : null;
// A bare `--only` would otherwise fall through to "no filter" and quietly record all four, which
// reads as the flag being ignored.
if (onlyArg > 0 && !only) {
  console.error('gen-display-demos: --only needs a scene id');
  process.exit(1);
}
const checking = process.argv.includes('--check');
const keepPng = process.argv.includes('--png');
const verifying = process.argv.includes('--verify');

const scenes = SCENES.filter((s) => !only || s.id === only);
if (!scenes.length) {
  console.error(`gen-display-demos: no scene "${only}" (have: ${SCENES.map((s) => s.id).join(', ')})`);
  process.exit(1);
}

const nameOf = (scene) => `display-${scene.id}`;

if (checking) {
  const missing = scenes.filter((s) => !existsSync(join(outDir, `${nameOf(s)}.gif`)));
  if (missing.length) {
    console.error(`gen-display-demos: ${missing.length} recording(s) missing: ${missing.map(nameOf).join(', ')}`);
    process.exit(1);
  }
  console.log(`ok docs/media — ${scenes.length} recordings`);
  process.exit(0);
}

/* ------------------------------------------------------------------ the sampled signals ------ */

/**
 * Every source value for every frame, computed here rather than in the page.
 *
 * In Node because the motion is the part a reader is most likely to want to change, and having it
 * next to the scene that declares it beats having it inside a string that gets evaluated in a
 * browser. The page only ever receives numbers.
 */
function sampleMotion(scene, frames) {
  const out = [];
  for (let i = 0; i < frames; i += 1) {
    const t = i / frames; // 0 → just under 1: frame `frames` would be frame 0 again
    const values = {};
    for (const [key, fn] of Object.entries(scene.motion ?? {})) values[key] = fn(t);
    out.push(values);
  }
  return out;
}

/* ------------------------------------------------------------------ the dev server ----------- */

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

async function startServer() {
  const url = `http://localhost:${PORT}/`;
  if (await reachable(url)) return { url, stop: () => {} };
  const proc = spawn('npx', ['vite', '--port', String(PORT)], { cwd: web, stdio: 'ignore' });
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 500); });
    // eslint-disable-next-line no-await-in-loop
    if (await reachable(url)) return { url, stop: () => proc.kill() };
  }
  proc.kill();
  throw new Error(`the dev server did not come up on port ${PORT}`);
}

function chromiumPath() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const build = readdirSync(dir).find((d) => /^chromium-\d+$/.test(d));
  if (!build) throw new Error(`no chromium under ${dir}`);
  return join(dir, build, 'chrome-linux', 'chrome');
}

/* ------------------------------------------------------------------ the page side ------------ */

/**
 * Build the scene in the page and leave a `window.__demo` the recorder can step.
 *
 * Runs as a source STRING through an AsyncFunction with the app's own modules in scope — the same
 * shape gen-manual-media.mjs uses, and for the same reason: Vite serves one module instance per
 * specifier, so these ARE the stores the running editor holds.
 */
const PAGE_SETUP = `
  // --- the virtual clock, installed BEFORE the scene is built ---
  // Ordering, not taste. Each renderer's rAF loop records the timestamp of its FIRST callback as
  // the origin that frameTime counts from, and frameTime is what positions the marquee. Install
  // the clock after the loop has already started and that origin is a real timestamp while the
  // recorder's clock is a different one, so frame 0 lands at an arbitrary scroll offset — the
  // patch name opens mid-word, differently on every run. Installed first, the origin is the
  // recorder's own first tick, and a warm-up of whole loops leaves the marquee back at its start.
  // Starting from the real reading rather than 0, so nothing that captured a timestamp during
  // start-up sees the clock jump backwards.
  let virtualTime = performance.now();
  let queue = [];
  let nextHandle = 1;
  window.requestAnimationFrame = (cb) => {
    const handle = nextHandle++;
    queue.push({ handle, cb });
    return handle;
  };
  window.cancelAnimationFrame = (handle) => { queue = queue.filter((e) => e.handle !== handle); };
  // performance.now() as well as rAF, because LcdGraphicCanvas measures its own frame delta with
  // it — leave it real and the canvas's ballistics run on wall-clock dt while everything else runs
  // on the recorder's. Date.now() is deliberately NOT shimmed: nothing in the display path reads
  // it, and virtualTime is milliseconds since navigation, so anything expecting an epoch
  // timestamp would silently get 1970.
  window.performance.now = () => virtualTime;

  // One pass of whatever is queued. Callbacks that re-register land in the NEXT pass, which is
  // exactly the rAF contract — an infinite loop here would mean a renderer calling rAF inline.
  const runFrameCallbacks = () => {
    const due = queue;
    queue = [];
    for (const entry of due) {
      try { entry.cb(virtualTime); } catch (err) { window.__demoError = String(err); }
    }
  };

  // --- the source controls, created first so their ids exist to be linked to ---
  const ids = {};
  const controls = [];
  let y = scene.size[1] + 40;   // parked below the display; only the display is ever photographed
  for (const [key, spec] of Object.entries(scene.sources ?? {})) {
    const overrides = { Transform: { x: 0, y, width: 80, height: 40 } };
    if (spec.Behavior) overrides.Behavior = spec.Behavior;
    if (spec.Text) overrides.Text = spec.Text;
    const src = types.createControl(spec.type, overrides);
    ids[key] = src._children.Core.id;
    controls.push(src);
    y += 44;
  }

  // --- resolve every "src:<key>" link to the real Core.id ---
  const link = (node) => {
    if (Array.isArray(node)) return node.map(link);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = link(v);
      return out;
    }
    if (typeof node === 'string' && node.startsWith('src:')) {
      const id = ids[node.slice(4)];
      if (!id) throw new Error('scene links to an unknown source: ' + node);
      return id;
    }
    return node;
  };

  const display = types.createControl(scene.type, {
    Transform: { x: 0, y: 0, width: scene.size[0], height: scene.size[1] },
    [scene.section]: link(scene.data),
  });
  const displayId = display._children.Core.id;
  controls.unshift(display);

  panels.panels.update((list) => list.map((p) => ({ ...p, controls })));
  // An animation file has to be fetched and decoded frame by frame before the panel can draw it,
  // and that happens off the rAF clock. The warm-up loops below are seconds of real time and would
  // almost certainly cover it, but "almost certainly" is how a scene ends up recorded blank once
  // in twenty runs.
  await settle(scene.animSource ? 2000 : 400);

  window.__demo = {
    displayId,
    sourceIds: ids,
    /**
     * Advance the scene by one frame: new source values, then dtMs of virtual time.
     *
     * The order matters. Values go in first so the renderers' derived state is already updated
     * when their rAF callback runs, and the settles either side give Svelte's microtask flush a
     * chance to land before anything reads the DOM.
     */
    async step(values, dtMs) {
      for (const [key, value] of Object.entries(values)) {
        preview.updatePanelPreviewSession(ids[key], { valueOverrideEnabled: true, valueOverride: value });
      }
      await settle(0);
      virtualTime += dtMs;
      runFrameCallbacks();
      await settle(0);
      // A second empty pass: a renderer that reschedules from inside its own callback (the canvas
      // does) would otherwise paint one frame behind what was just computed.
      runFrameCallbacks();
      await settle(0);
    },
  };
`;

/**
 * Record one scene: build it, warm it up, then capture FRAMES screenshots of the display element.
 */
async function record(page, scene, extraFrames = 0) {
  // A fresh load per scene. Sharing a page means one scene whose renderer throws leaves Svelte's
  // tree broken and every later scene fails too — the lesson gen-manual-media.mjs already learnt.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.addStyleTag({
    content: '.editor-state-badge { display: none !important; } .zoom-container { outline: 0 !important; }',
  });

  await page.evaluate(async (payload) => {
    const panels = await import('/src/CE_Application/stores/panels.js');
    const model = await import('/src/CE_Application/stores/panelModel.js');
    const types = await import('/src/CE_Application/models/componentTypes.js');
    const preview = await import('/src/CE_Application/stores/interactionPreview.js');
    const api = await import('/src/CE_Application/scripting/panelApi.js');

    panels.panels.set([]);
    const panel = model.createPanel('Display demo');
    panel.width = payload.scene.size[0];
    panel.height = payload.scene.size[1] + 40 + Object.keys(payload.scene.sources ?? {}).length * 44;
    panel.gridEnabled = false;   // a panel property, so preview mode leaves it on unless told
    panel.scripting = { modules: api.MODULES.map((m) => m.id) };
    panel.controls = [];
    panels.addPanel(panel);
    preview.setPreviewModeEnabled(true);

    const settle = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction('scene', 'types', 'panels', 'preview', 'settle', payload.setup)(
      payload.scene, types, panels, preview, settle,
    );
  }, { scene: serialisableScene(scene), setup: PAGE_SETUP });

  const displayId = await page.evaluate(() => window.__demo.displayId);
  const target = page.locator(`[data-control-id="${displayId}"]`);
  await target.waitFor({ state: 'visible', timeout: 15000 });

  const signal = sampleMotion(scene, FRAMES);

  // Warm-up: the same signal, no screenshots. Peak-hold markers, meter smoothing and the scope's
  // history all need a run-up or frame 0 shows them mid-climb from zero.
  for (let loop = 0; loop < WARMUP_LOOPS; loop += 1) {
    for (const values of signal) {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate(([v, dt]) => window.__demo.step(v, dt), [values, FRAME_MS]);
    }
  }

  const frames = [];
  for (let i = 0; i < FRAMES + extraFrames; i += 1) {
    /* eslint-disable no-await-in-loop */
    // Past FRAMES the signal wraps, so frame FRAMES is frame 0 of the next lap — which is exactly
    // what --verify compares against frame 0 to measure the seam.
    await page.evaluate(([v, dt]) => window.__demo.step(v, dt), [signal[i % FRAMES], FRAME_MS]);
    const png = await target.screenshot({ type: 'png' });
    frames.push(decodePng(png));
    if (keepPng && i === 0) writeFileSync(join(outDir, `${nameOf(scene)}.png`), png);
    /* eslint-enable no-await-in-loop */
  }

  const pageError = await page.evaluate(() => window.__demoError ?? '');
  if (pageError) throw new Error(`the page threw while animating: ${pageError}`);

  return frames;
}

/**
 * Build a scene's loadable animation and hand it to the panel as a data URL.
 *
 * A data URL rather than a served file because that is what the app itself stores: an animation
 * uploaded in the inspector is kept in `animSrc` as a data URL inside the panel document, so the
 * panel stays one self-contained file. Feeding the demo the same way means the recording exercises
 * the path a user's own upload takes, rather than a shortcut only this script can use.
 *
 * The source GIF is also written to docs/media, because "a GIF plays on the panel" is a claim the
 * reader should be able to check against the GIF that was played.
 */
function attachSourceAnimation(scene) {
  if (scene.animSource !== 'torus') return scene;
  const gif = buildTorusGif();
  writeFileSync(join(outDir, `display-source-${scene.animSource}.gif`), gif);
  return {
    ...scene,
    data: { ...scene.data, animSrc: `data:image/gif;base64,${gif.toString('base64')}` },
  };
}

/**
 * Strip the scene down to what can cross into the page.
 *
 * `motion` holds functions, which structured-clone refuses; they are sampled in Node anyway, so
 * the page never needs them. Everything else is plain data by construction.
 */
function serialisableScene(scene) {
  const { motion, ...rest } = attachSourceAnimation(scene);
  return rest;
}

/* ------------------------------------------------------------------------ the run ------------ */

mkdirSync(outDir, { recursive: true });

const requireFromWeb = createRequire(join(web, 'package.json'));
const { chromium } = requireFromWeb('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: SCALE,
});
const thrown = [];
page.on('pageerror', (e) => thrown.push(String(e).slice(0, 200)));

await page.goto(server.url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const failures = [];
for (const scene of scenes) {
  const before = thrown.length;
  try {
    /* eslint-disable no-await-in-loop */
    const captured = await record(page, scene, verifying ? 1 : 0);
    const frames = captured.slice(0, FRAMES);

    if (verifying) {
      // TWO PROPERTIES, BOTH OF WHICH THE VIRTUAL CLOCK IS SUPPOSED TO BUY.
      //
      // Determinism: replay the whole scene and compare frame 0 byte for byte. On the wall clock
      // this fails, because the marquee and the ballistics depend on how long each screenshot took.
      //
      // Loop closure: frame FRAMES is the same point in the signal as frame 0, so if every
      // animation in the page is periodic over the loop the two images are the same and the GIF
      // wraps invisibly. Reported as a percentage because the scope's history and the oscillator's
      // phase are only approximately periodic — a few tenths of a percent is a seam nobody sees,
      // whole percent is one you do.
      const again = await record(page, scene);
      const identical = Buffer.from(frames[0].rgba).equals(Buffer.from(again[0].rgba));

      const first = frames[0].rgba;
      const wrap = captured[FRAMES].rgba;
      let differing = 0;
      for (let i = 0; i < first.length; i += 4) {
        if (first[i] !== wrap[i] || first[i + 1] !== wrap[i + 1] || first[i + 2] !== wrap[i + 2]) differing += 1;
      }
      const pct = (100 * differing) / (first.length / 4);
      console.log(`  ${nameOf(scene)} — replay ${identical ? 'identical' : 'DIFFERS'}, `
        + `loop seam ${pct.toFixed(2)}% of pixels`);
    }

    const gif = encodeGif(frames, { delayCs: DELAY_CS, loop: 0 });
    const file = join(outDir, `${nameOf(scene)}.gif`);
    writeFileSync(file, gif);
    console.log(`  ${nameOf(scene)}.gif — ${frames[0].width}x${frames[0].height}, `
      + `${frames.length} frames, ${(gif.length / 1024).toFixed(0)} KB`);
    /* eslint-enable no-await-in-loop */
  } catch (err) {
    failures.push(`${nameOf(scene)}: ${err.message}`);
    console.error(`  ${nameOf(scene)} — ${err.message}`);
  }
  if (thrown.length > before) {
    failures.push(`${nameOf(scene)}: page threw — ${thrown.at(-1)}`);
    console.error(`  ${nameOf(scene)} — page threw — ${thrown.at(-1)}`);
  }
}

await browser.close();
server.stop();

console.log(`wrote docs/media — ${scenes.length - failures.length} of ${scenes.length} recordings`);
if (failures.length) {
  console.error(`gen-display-demos: ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exitCode = 2;
}
