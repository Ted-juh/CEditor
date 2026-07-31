#!/usr/bin/env node
// gen-manual-media.mjs — the pictures the manual was missing.
//
// The manual described 28 components and four tutorials in words and showed none of them. A reader
// deciding whether the Turing Machine is the thing they want had a paragraph and 16 verb names, and
// no way to see what it IS; a reader half-way through a tutorial had no way to check that what they
// had built looked like what the tutorial meant.
//
// So these are photographed rather than drawn. The script drives the REAL editor — the Vite dev
// server, the real renderers, the real component engines — and captures the panel surface. Nothing
// here is an illustration of the app; it is the app. Two consequences worth having: a component
// that changes how it looks changes its picture on the next run, and a picture cannot show a
// feature the component does not have.
//
// The tutorial captures go further: the listings are extracted from the PUBLISHED page and executed
// against the real scripting runtime, so each tutorial's picture is what that tutorial's own code
// actually builds. The same source manualWalkthrough.test.js runs, producing the same panel.
//
//   node tools/scripts/gen-manual-media.mjs            → writes docs/media/*.png
//   node tools/scripts/gen-manual-media.mjs --check     → non-zero if any capture is missing
//   node tools/scripts/gen-manual-media.mjs --only arp  → one capture, while iterating
//
// Needs Chromium (PLAYWRIGHT_BROWSERS_PATH) and a free port. It starts and stops its own dev
// server. It is NOT part of `npm test`: it is slow, it needs a browser, and the page falls back to
// prose when a capture is absent — a missing picture must not be able to fail a build that has
// nothing to do with it.
//
// One thing to know: a full run takes minutes, and it is photographing the app AS IT IS ON DISK.
// Editing the source while it runs breaks the captures still to come — a half-saved file is a
// syntax error to the dev server, and every remaining shot fails on the import. Re-run the ones
// that failed with --only; the manifest merges rather than replaces, so the rest survive.

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const web = join(repo, 'CE', 'web');
const outDir = join(repo, 'docs', 'media');
const PORT = 5177;

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1] : null;
const checking = process.argv.includes('--check');

/* --------------------------------------------------------------- what to capture ------------- */

// One entry per component module. `type` is the controlType the palette uses; `size` is the box the
// component is given, chosen so the thing the component IS is what fills the frame — a Drum Pads at
// 90x90 is a grey square, and an LCD at 400x300 is mostly empty bezel.
//
// `seed` runs against the created control before the shot, through the same component verbs the
// module documents. That is deliberate: a component in its default state is often blank (a Meter
// reads zero, a Matrix has no cells patched), and a picture of a blank component teaches nothing
// about what the module does to it. Seeding through the public verbs also means a seed that stops
// working is a verb that stopped working.
const COMPONENTS = [
  { id: 'arp', type: 'Arp', size: [300, 170] },
  { id: 'chordpad', type: 'ChordPad', size: [320, 190] },
  { id: 'noteribbon', type: 'NoteRibbon', size: [340, 130] },
  { id: 'drumpads', type: 'DrumPads', size: [260, 260] },
  { id: 'phrase', type: 'Phrase', size: [360, 200] },
  { id: 'recorder', type: 'Recorder', size: [340, 170] },
  { id: 'harmony', type: 'Harmoniser', size: [320, 200] },
  { id: 'turing', type: 'Turing', size: [320, 180] },
  { id: 'looper', type: 'Looper', size: [330, 180] },
  { id: 'orbit', type: 'Orbit', size: [260, 260] },
  { id: 'kinetic', type: 'Kinetic', size: [260, 260] },
  { id: 'constellation', type: 'Constellation', size: [260, 260] },
  { id: 'timbre', type: 'Timbre', size: [260, 260] },
  { id: 'router', type: 'Router', size: [340, 220] },
  { id: 'macro', type: 'Macro', size: [260, 200] },
  { id: 'matrix', type: 'Matrix', size: [320, 240] },
  { id: 'constraint', type: 'Constraint', size: [300, 200] },
  { id: 'envelope', type: 'Envelope', size: [340, 190] },
  { id: 'split', type: 'SplitZone', size: [380, 150] },
  { id: 'ribbon', type: 'Ribbon', size: [340, 110] },
  { id: 'crossfader', type: 'Crossfader', size: [320, 120] },
  { id: 'joystick', type: 'VectorJoystick', size: [240, 240] },
  { id: 'meter', type: 'Meter', size: [140, 240] },
  { id: 'lcd', type: 'LcdDisplay', size: [360, 160] },
  { id: 'pixel', type: 'PixelDisplay', size: [300, 220] },
  { id: 'transport', type: 'Transport', size: [340, 110] },
  { id: 'panic', type: 'Panic', size: [180, 90] },
  { id: 'setlist', type: 'Setlist', size: [340, 190] },
];

// The four tutorials. No size here: a tutorial's panel is whatever its own script builds, and a
// declared size is a guess that crops the picture the moment the tutorial changes — which is
// exactly what it did. The frame is measured from the controls instead.
const TUTORIALS = [
  { id: 'walkthrough' },
  { id: 'from-data' },
  { id: 'drumkit' },
  { id: 'wiring' },
];

/** The box a set of built controls occupies, plus a margin, so nothing is cropped. */
function boundsOf(controls, margin = 24) {
  let right = 0;
  let bottom = 0;
  const walk = (list) => {
    for (const c of list ?? []) {
      const t = c._children?.Transform;
      if (t) {
        right = Math.max(right, Number(t.x ?? 0) + Number(t.width ?? 0));
        bottom = Math.max(bottom, Number(t.y ?? 0) + Number(t.height ?? 0));
      }
      walk(c._children?.Children?.items ?? c._children?.Children?.controls ?? []);
    }
  };
  walk(controls);
  return [Math.ceil(right) + margin, Math.ceil(bottom) + margin];
}

// What to do to a component before photographing it, as calls on ce.components.<id>. These run
// through the PUBLIC verbs — the ones the module documents — so a seed is also a small test that
// the module still drives its component. A verb that stops applying shows up as a blank picture.
//
// `C` is the name of the created control, which the runner substitutes.
const SEEDS = {
  arp: ['pattern(C, "updown")', 'octaves(C, 2)', 'gate(C, 0.7)', 'run(C, true)'],
  turing: ['length(C, 8)', 'fill(C, "step", [0.2, 0.8, 0.45, 1, 0.1, 0.65, 0.3, 0.9])'],
  envelope: ['preset(C, "adsr")'],
  matrix: ['cell(C, 1, 2, 0.8)', 'cell(C, 2, 1, -0.5)', 'cell(C, 3, 3, 0.35)'],
  meter: ['value(C, 0.72)', 'showValue(C, true)'],
  lcd: ['backlight(C, true)', 'text(C, 1, "SYNTH A")', 'text(C, 2, "CUTOFF  8000")'],
  pixel: ['backlight(C, true)', 'brightness(C, 0.9)'],
  orbit: ['run(C, true)'],
  kinetic: ['run(C, true)'],
  looper: ['run(C, true)'],
  crossfader: ['mix(C, 0.35)'],
  joystick: ['move(C, -0.4, 0.55)'],
  ribbon: ['value(C, 0.62)'],
  timbre: ['move(C, 0.3, -0.25)'],
  constellation: ['probe(C, 0.4, 0.2)'],
  macro: ['value(C, 0.6)'],
  // No transport seed. Its verbs write PANEL-level state rather than the control's own, and doing
  // that mid-capture rebuilds the panel and takes the control being photographed with it. The
  // default Transport already shows what it is.
};

/**
 * The page-side body for one component: create it at the panel's size, then seed it through the
 * module's own verbs.
 *
 * This is a source STRING evaluated in the page against the app's live modules, which the runner
 * puts in scope as `types`, `panels`, `runtime` and `api`.
 */
function buildComponent(id, type, size, seed) {
  const calls = (seed ?? []).map((call) => `verbs.${call};`).join('\n    ');
  return `
    // Geometry lives in the Transform SECTION. Passed flat, as { x, y, width, height }, the
    // overrides are silently dropped and every component comes out at its own default size.
    const control = types.createControl(${JSON.stringify(type)}, {
      Transform: { x: 0, y: 0, width: ${size[0]}, height: ${size[1]} },
    });
    panels.panels.update((list) => list.map((p) => ({ ...p, controls: [control] })));
    await settle(350);
    const C = control._children.Core.name;
    const verbs = runtime.scriptApiForTesting('', 'media').ce.components[${JSON.stringify(id)}];
    if (!verbs) throw new Error('ce.components.${id} is not in the runtime');
    ${calls}
  `;
}

/**
 * Run one tutorial's listing HERE, in Node, and return the controls it built.
 *
 * Not in the page, though that was the first shape of this. A tutorial measures the text of a
 * control it has just created, inside one ce.panel.batch — and in a browser that control has no
 * rendered element yet, so ce.text.measure answers with nothing and the script dies half-built.
 * In Node there is no canvas at all, so measure takes its estimate path and the script runs to the
 * end. That is the path manualWalkthrough.test.js already exercises and asserts the geometry of,
 * which makes it the better one to photograph: the picture is then of the panel the tests pin.
 *
 * Controls are plain data, so they cross into the page as JSON.
 */
async function runTutorial(source) {
  // In a CHILD node, with the test suite's own loader. panelRuntime.js reaches wasmoon, which
  // imports a .wasm through a Vite-only specifier — so importing the runtime from a plain Node
  // process fails on the import, not on anything to do with the tutorial. `register-svelte.mjs` is
  // what the test run already uses to make these modules loadable outside the bundler.
  const runner = `
    import { readFileSync } from 'node:fs';
    import { get } from 'svelte/store';
    import { scriptApiForTesting } from '${join(web, 'src/CE_Application/scripting/panelRuntime.js')}';
    import { createControl } from '${join(web, 'src/CE_Application/models/componentTypes.js')}';
    import { panels, activePanelId } from '${join(web, 'src/CE_Application/stores/panels.js')}';
    import { MODULES } from '${join(web, 'src/CE_Application/scripting/panelApi.js')}';

    const source = readFileSync(process.argv[2], 'utf8');
    panels.set([{ id: 'p', name: 'P', controls: [createControl('Label', { name: 'Seed' })],
      scripting: { modules: MODULES.map((m) => m.id) } }]);
    activePanelId.set('p');
    const api = scriptApiForTesting('', 'media');
    const names = ['ce', 'set', 'get', 'log', 'logWarn', 'logError', 'on', 'sendNote', 'state'];
    const onPanelBuild = new Function(...names,
      source + "\\nreturn typeof onPanelBuild === 'function' ? onPanelBuild : null;")(
      ...names.map((n) => api[n]));
    if (!onPanelBuild) throw new Error('the listing no longer declares onPanelBuild');
    onPanelBuild();
    const built = get(panels)[0].controls.filter((c) => c._children.Core.name !== 'Seed');
    process.stdout.write(JSON.stringify(built));
  `;
  // Under CE/web, because the runner imports `svelte` by bare specifier and Node resolves that
  // from the importing FILE's directory — a runner written to docs/ resolves nothing.
  const scratch = join(web, 'node_modules', '.ce-manual-media');
  mkdirSync(scratch, { recursive: true });
  const runnerFile = join(scratch, 'tutorial-runner.mjs');
  const sourceFile = join(scratch, 'tutorial-source.js');
  writeFileSync(runnerFile, runner);
  writeFileSync(sourceFile, source);

  const out = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [
      '--import', join(web, 'test', 'support', 'register-svelte.mjs'), runnerFile, sourceFile,
    ], { cwd: web });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => (code === 0
      ? resolve(stdout)
      : reject(new Error(stderr.split('\n').find((l) => /Error/.test(l)) ?? `exit ${code}`))));
  });
  return JSON.parse(out);
}

/** The page-side body for one tutorial: render controls that were already built. */
function buildTutorial(controls) {
  return `
    const built = ${JSON.stringify(controls)};
    panels.panels.update((list) => list.map((p) => ({ ...p, controls: built })));
    await settle(400);
  `;
}

/* --------------------------------------------------- the tutorial listings, from the page ----- */

const UNESCAPE = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const unescapeHtml = (s) => s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (m) => UNESCAPE[m]);

/** Every JavaScript listing in one tutorial, in order — the same extraction the test does, and
 *  from the same file, so a picture cannot be built from source the tests never saw. */
function listings(page, lessonId) {
  const start = page.indexOf(`id="${lessonId}"`);
  if (start < 0) throw new Error(`the manual has no lesson "${lessonId}"`);
  const mine = page.indexOf('<p class="lesson-n">', start);
  const next = page.indexOf('<p class="lesson-n">', mine + 10);
  const close = page.indexOf('</section>', mine);
  const end = Math.min(...[next, close].filter((i) => i > 0));
  const html = page.slice(start, Number.isFinite(end) ? end : undefined);

  const out = [];
  const re = /<pre data-js[^>]*><code>([\s\S]*?)<\/code><\/pre>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push(unescapeHtml(m[1]));
  if (!out.length) throw new Error(`lesson "${lessonId}" has no JavaScript listing`);
  return out.join('\n');
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

/* ------------------------------------------------------------------ the capturing ------------ */

function chromiumPath() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const build = readdirSync(dir).find((d) => /^chromium-\d+$/.test(d));
  if (!build) throw new Error(`no chromium under ${dir}`);
  return join(dir, build, 'chrome-linux', 'chrome');
}

/**
 * Put a panel on screen and photograph its surface.
 *
 * `build` runs in the page with the app's own modules — the same instances the running editor
 * holds, because Vite serves one module per specifier. Preview mode goes on first so the shot is
 * of the component rather than of the editor: no grid, no selection outline, no rulers.
 */
async function capture(page, { name, size, build, single = false }) {
  // A fresh load per capture. Sharing one page was faster and turned out to be a trap: one
  // component whose renderer throws leaves Svelte's tree broken, and every capture AFTER it then
  // fails too — so a single bad component reads as "the whole run is broken". Reloading costs a
  // few seconds and makes each failure exactly as big as it really is.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.addStyleTag({
    content: '.editor-state-badge { display: none !important; }'
      + ' .zoom-container { outline: 0 !important; }',
  });

  await page.evaluate(async ({ size, build }) => {
    const panels = await import('/src/CE_Application/stores/panels.js');
    const model = await import('/src/CE_Application/stores/panelModel.js');
    const types = await import('/src/CE_Application/models/componentTypes.js');
    const preview = await import('/src/CE_Application/stores/interactionPreview.js');
    const runtime = await import('/src/CE_Application/scripting/panelRuntime.js');
    const api = await import('/src/CE_Application/scripting/panelApi.js');

    // One panel at a time: leaving the previous one open would photograph the wrong tab.
    panels.panels.set([]);
    const panel = model.createPanel('Capture');
    panel.width = size[0];
    panel.height = size[1];
    // The design grid is a panel property, not an editor one, so preview mode leaves it on. In a
    // picture of what a component looks like it reads as part of the component.
    panel.gridEnabled = false;
    panel.scripting = { modules: api.MODULES.map((m) => m.id) };
    panel.controls = [];
    panels.addPanel(panel);
    preview.setPreviewModeEnabled(true);

    const settle = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction('types', 'panels', 'runtime', 'api', 'settle', build)(
      types, panels, runtime, api, settle,
    );
  }, { size, build });

  // Wait for the canvas to hold what this capture built. Without it the locator can still be
  // pointing at the PREVIOUS capture's element as Svelte tears it down, and screenshotting a
  // detaching node just times out — which is what made every capture after the first failure fail
  // too, and made a per-component problem look like a cascade.
  await page.waitForFunction(
    (want) => document.querySelectorAll('.canvas-control').length >= want,
    single ? 1 : 1,
    { timeout: 15000 },
  );
  // The component engines animate on a timer; a beat of settling avoids catching one mid-frame.
  await page.waitForTimeout(900);

  // A component is photographed as itself — its own element, not the panel it sits on, which would
  // frame it in however much empty grid the panel happened to have. A tutorial IS its panel, so
  // that one is shot whole.
  const target = single ? page.locator('.canvas-control').first() : page.locator('.zoom-container').first();
  await target.screenshot({ path: join(outDir, `${name}.png`) });
}

/* ------------------------------------------------------------------------ the run ------------ */

const wanted = [
  ...COMPONENTS.map((c) => ({ kind: 'component', ...c, name: `component-${c.id}` })),
  ...TUTORIALS.map((t) => ({ kind: 'tutorial', ...t, name: `tutorial-${t.id}` })),
].filter((job) => !only || job.id === only);

if (checking) {
  const missing = wanted.filter((job) => !existsSync(join(outDir, `${job.name}.png`)));
  if (missing.length) {
    console.error(`gen-manual-media: ${missing.length} capture(s) missing: `
      + `${missing.slice(0, 8).map((m) => m.name).join(', ')}`
      + (missing.length > 8 ? ` … and ${missing.length - 8} more` : ''));
    process.exitCode = 1;
  } else {
    console.log(`ok docs/media — ${wanted.length} captures`);
  }
} else {
  mkdirSync(outDir, { recursive: true });
  const pageHtml = readFileSync(join(repo, 'docs', 'api-explorer.html'), 'utf8');
  // Resolved from CE/web, where it is declared: tools/scripts has no node_modules of its own, so a
  // bare specifier here would only ever work by accident of the working directory.
  // …and via require, not import: playwright-core is CommonJS, so a dynamic import hands back a
  // module namespace whose named exports are on `.default`.
  const requireFromWeb = createRequire(join(web, 'package.json'));
  const { chromium } = requireFromWeb('playwright-core');
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage({
    // Deviceless 2x, so the pictures stay sharp where the manual scales them down.
    viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2,
  });
  const failures = [];
  page.on('pageerror', (e) => failures.push(String(e).slice(0, 200)));

  // Editor furniture is taken out of the way per capture, in `capture` — the reload there drops
  // any style tag added here.
  await page.goto(server.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Merged, not replaced. `--only` is the normal way to iterate on one capture, and a manifest
  // rewritten from scratch each time would silently drop the other 31 — which reads on the page as
  // "those pictures were never taken".
  const manifest = {};
  try {
    Object.assign(manifest, JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')));
  } catch { /* no manifest yet */ }
  for (const job of wanted) {
    const before = failures.length;
    try {
      if (job.kind === 'component') {
        /* eslint-disable no-await-in-loop */
        await capture(page, {
          name: job.name,
          size: job.size,
          single: true,
          build: buildComponent(job.id, job.type, job.size, SEEDS[job.id]),
        });
      } else {
        const controls = await runTutorial(listings(pageHtml, job.id));
        job.size = boundsOf(controls);
        await capture(page, { name: job.name, size: job.size, build: buildTutorial(controls) });
      }
      manifest[job.name] = { kind: job.kind, id: job.id, width: job.size[0], height: job.size[1] };
      console.log(`  ${job.name}`);
    } catch (err) {
      failures.push(`${job.name}: ${err.message}`);
    }
    if (failures.length > before) console.error(`  ${job.name} — ${failures.at(-1)}`);
    /* eslint-enable no-await-in-loop */
  }

  // What actually got captured, for the page generator to read. A picture the run failed to take
  // is simply absent from this, and the manual falls back to prose rather than to a broken image.
  // An entry whose file has since gone is dropped, so the manifest cannot promise one either.
  for (const key of Object.keys(manifest)) {
    if (!existsSync(join(outDir, `${key}.png`))) delete manifest[key];
  }
  writeFileSync(join(outDir, 'manifest.json'),
    `${JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2)}\n`);

  await browser.close();
  server.stop();

  console.log(`wrote docs/media — ${Object.keys(manifest).length} of ${wanted.length} captures`);
  if (failures.length) {
    console.error(`gen-manual-media: ${failures.length} problem(s):`);
    for (const f of failures.slice(0, 12)) console.error(`  ${f}`);
    process.exitCode = 2;
  }
}
