#!/usr/bin/env node
/**
 * measure-loop-budget.mjs — what a looping pattern or gradient costs to draw, in the two engines a
 * panel is drawn by off the editor: Chromium (WebView2's engine, the plug-in on Windows) and
 * WebKitGTK (the plug-in and the app on Linux). The Animation Designer's step 3 promised the owner a
 * number for "how much looping is too much"; this is how it was got, and how to get it again.
 *
 *   node tools/scripts/measure-loop-budget.mjs [--browser chromium|webkit|both] [--counts 0,1,10,50]
 *                                              [--seconds 8] [--kinds pattern,gradient] [--json out.json]
 *
 * WHAT IT DRAWS. Pages of N labels, 200 x 60 like the owner's "Wave", each with one looping thing,
 * written by the same functions the renderers use — utils/patternLayers.js patternStyles and
 * utils/gradientPaint.js gradientPaint — inside the same structure PatternLayers.svelte and
 * BackgroundRenderer.svelte make, with their keyframes. Not the editor: what a frame costs is the
 * browser's work, and Svelte does nothing per frame for a CSS loop.
 *
 *   still         a pattern that does not move (the baseline a pattern costs at all)
 *   pattern       a sine row moving at 64 px/s, by translate — what the Pattern engine does
 *   pattern30     the same, capped at 30 frames a second (steps)
 *   diagonal      dots moving diagonally: two movers
 *   gradient      a conic gradient turning on a loop (a registered property, repainted every frame)
 *   maskPosition  the same row moved by animating mask-position instead — the way NOT taken, for
 *                 comparison: it repaints the layer every frame
 *
 * WHAT IT MEASURES. CPU time of the browser's whole process tree (browser, renderer, GPU/compositor;
 * WebKit's web process) over the window, as a percentage of one core, read from /proc — so Linux
 * only. And how many animation frames the page saw a second. Both engines here draw in software
 * (no GPU in a container), which makes compositing dearer than on a desktop with a GPU: read the
 * numbers as an upper bound for the same machine class, and the ratios as what carries over.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB = join(ROOT, 'CE/web');
const { patternStyles } = await import(pathToFileURL(join(WEB, 'src/CE_Application/utils/patternLayers.js')));
const { gradientPaint, GRADIENT_PROPERTY_DEFINITIONS } = await import(pathToFileURL(join(WEB, 'src/CE_Application/utils/gradientPaint.js')));

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return pairs;
}, []));
const browsers = (args.browser ?? 'both') === 'both' ? ['chromium', 'webkit'] : [args.browser];
const counts = String(args.counts ?? '0,1,10,50').split(',').map(Number);
const seconds = Number(args.seconds ?? 8);
const KINDS = ['still', 'pattern', 'pattern30', 'diagonal', 'gradient', 'maskPosition'];
const kinds = args.kinds ? String(args.kinds).split(',') : KINDS;
const TICK = Number(execFileSync('getconf', ['CLK_TCK']).toString().trim()) || 100;

// --- The pages -----------------------------------------------------------------------------------

const BOX = { width: 200, height: 60 };
const SINE = { width: 64, height: 24 };
const DOTS = { width: 16, height: 16 };

const STYLE = `
  body { margin: 0; background: #1E1E1E; font: 600 18px system-ui, sans-serif; }
  .grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; }
  .canvas-control { position: relative; width: ${BOX.width}px; height: ${BOX.height}px; }
  .control-content { position: absolute; inset: 0; overflow: hidden; border-radius: 6px; background: #2A3036; }
  .text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #E8EEF3; }
  /* PatternLayers.svelte */
  .pattern-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; box-sizing: border-box; }
  .pattern-move-x, .pattern-move-y { position: absolute; left: 0; top: 0; animation-iteration-count: infinite; }
  .pattern-move-x { animation-name: ce-pattern-x; }
  .pattern-move-y { animation-name: ce-pattern-y; }
  @keyframes ce-pattern-x { from { translate: 0 0; } to { translate: 100% 0; } }
  @keyframes ce-pattern-y { from { translate: 0 0; } to { translate: 0 100%; } }
  .pattern-paint { position: absolute; }
  /* BackgroundRenderer.svelte, a gradient layer with a keyframe loop on its turn */
  .bg-fill-layer { position: absolute; inset: 0; }
  @keyframes spin { from { --ce-g-turn: 0deg; } to { --ce-g-turn: 360deg; } }
  .bg-fill-layer.gradient { animation: spin 3000ms linear infinite; }
  /* The way not taken: the mask's own position, animated */
  @keyframes slide-mask { from { -webkit-mask-position: 0 0; mask-position: 0 0; } to { -webkit-mask-position: 64px 0; mask-position: 64px 0; } }
  .mask-slide { animation: slide-mask 1000ms linear infinite; }
`;

const REGISTER = `<script>
  for (const d of ${JSON.stringify(GRADIENT_PROPERTY_DEFINITIONS)}) { try { CSS.registerProperty({ ...d, inherits: false }); } catch {} }
</script>`;

function patternMarkup(node, natural, options = {}) {
  const s = patternStyles(node, natural, BOX, options);
  const paint = `<div class="pattern-paint${options.maskSlide ? ' mask-slide' : ''}" style='${s.paint}'></div>`;
  let inner = paint;
  if (s.moveY) inner = `<div class="pattern-move-y" style="${s.moveY}">${inner}</div>`;
  if (s.moveX) inner = `<div class="pattern-move-x" style="${s.moveX}">${inner}</div>`;
  return `<div class="pattern-layer" style="${s.layer}">${inner}</div>`;
}

function controlMarkup(kind) {
  const row = { src: 'builtin:sine', repeat: 'x', speed: 64, direction: 0, tint: 'FF14B8A6' };
  let layer = '';
  if (kind === 'still') layer = patternMarkup({ ...row, speed: 0 }, SINE);
  if (kind === 'pattern') layer = patternMarkup(row, SINE);
  if (kind === 'pattern30') layer = patternMarkup(row, SINE, { fps: 30 });
  if (kind === 'diagonal') layer = patternMarkup({ src: 'builtin:dots', repeat: 'both', speed: 40, direction: 45, tint: 'B3FFFFFF' }, DOTS);
  if (kind === 'maskPosition') layer = patternMarkup({ ...row, speed: 0 }, SINE, { maskSlide: true });
  if (kind === 'gradient') {
    const paint = gradientPaint({ type: 'conical', angle: 0, centerX: 50, centerY: 50, stops: [{ color: '333A40', position: 0 }, { color: 'E8EEF3', position: 50 }, { color: '333A40', position: 100 }] });
    layer = `<div class="bg-fill-layer gradient" style="background: ${paint.image}; ${paint.vars}"></div>`;
  }
  return `<div class="canvas-control"><div class="control-content">${layer}<div class="text">Wave</div></div></div>`;
}

function page(kind, count) {
  const controls = Array.from({ length: count }, () => controlMarkup(kind)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style>${REGISTER}</head>
<body><div class="grid">${controls}</div>
<script>
  let frames = 0;
  const tick = () => { frames += 1; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__frames = () => frames;
  window.__report = (ms) => { const start = frames; setTimeout(() => { document.title = 'DONE:' + JSON.stringify({ fps: (frames - start) / (ms / 1000) }); }, ms); };
</script></body></html>`;
}

// --- CPU of a process tree, from /proc ----------------------------------------------------------

function treeTicks(rootPid) {
  const children = new Map();
  const ticks = new Map();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const ppid = Number(fields[1]);
      ticks.set(Number(entry), Number(fields[11]) + Number(fields[12]));
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(Number(entry));
    } catch { /* gone */ }
  }
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    total += ticks.get(pid) ?? 0;
    stack.push(...(children.get(pid) ?? []));
  }
  return total;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sample(rootPid, ms) {
  const before = treeTicks(rootPid);
  const t0 = Date.now();
  await sleep(ms);
  const after = treeTicks(rootPid);
  return ((after - before) / TICK) / ((Date.now() - t0) / 1000) * 100;
}

// --- The two engines -----------------------------------------------------------------------------

async function measureChromium(file) {
  const require = createRequire(join(WEB, 'package.json'));
  const { chromium } = require('playwright-core');
  const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  // A server, not a plain launch: it hands back the browser's process, whose tree is sampled.
  const server = await chromium.launchServer({ executablePath, args: ['--no-sandbox'] });
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const pageHandle = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await pageHandle.goto(pathToFileURL(file).href);
    await sleep(2000);
    const startFrames = await pageHandle.evaluate(() => window.__frames());
    const cpu = await sample(server.process().pid, seconds * 1000);
    const fps = ((await pageHandle.evaluate(() => window.__frames())) - startFrames) / seconds;
    return { cpu, fps };
  } finally {
    await browser.close();
    await server.close();
  }
}

const WEBKIT_RUNNER = `
import sys, json, gi
gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, GLib, WebKit2
path, warm, ms = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
window = Gtk.Window(); window.set_default_size(1280, 900)
view = WebKit2.WebView(); window.add(view); window.show_all()
def started():
    view.evaluate_javascript('window.__report(%d); 0' % ms, -1, None, None, None, None, None)
    print('MEASURE', flush=True)
    return False
def on_title(*_):
    title = view.get_title() or ''
    if title.startswith('DONE:'):
        print(title[5:], flush=True); Gtk.main_quit()
view.connect('notify::title', on_title)
GLib.timeout_add(int(warm * 1000), started)
GLib.timeout_add(int((warm + ms / 1000 + 20) * 1000), Gtk.main_quit)
view.load_uri('file://' + path)
Gtk.main()
`;

async function measureWebkit(file, runnerPath) {
  const env = { ...process.env, WEBKIT_DISABLE_DMABUF_RENDERER: '1', LIBGL_ALWAYS_SOFTWARE: '1' };
  const python = process.env.WEBKIT_PYTHON ?? '/usr/bin/python3.12';
  const child = spawn(python, ['-I', runnerPath, file, '2', String(seconds * 1000)], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  let resolveStart;
  const started = new Promise((resolve) => { resolveStart = resolve; });
  child.stdout.on('data', (chunk) => {
    output += chunk;
    if (output.includes('MEASURE')) resolveStart();
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  await Promise.race([started, exited]);
  const cpu = await sample(child.pid, seconds * 1000);
  await exited;
  const line = output.split('\n').find((text) => text.startsWith('{'));
  return { cpu, fps: line ? JSON.parse(line).fps : NaN };
}

// --- Run -----------------------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'ce-loop-budget-'));
const runner = join(dir, 'webkit_runner.py');
writeFileSync(runner, WEBKIT_RUNNER);
const results = [];
console.log(`${cpus().length} logical processors; ${seconds} s a sample; CPU is % of one core, the whole browser.`);
for (const engine of browsers) {
  for (const kind of kinds) {
    for (const count of counts) {
      if (count === 0 && kind !== kinds[0]) continue;
      const file = join(dir, `${kind}-${count}.html`);
      writeFileSync(file, page(kind, count));
      const { cpu, fps } = engine === 'chromium' ? await measureChromium(file) : await measureWebkit(file, runner);
      const row = { engine, kind: count === 0 ? 'nothing' : kind, count, cpu: Math.round(cpu * 10) / 10, fps: Math.round(fps * 10) / 10 };
      results.push(row);
      console.log(`${engine.padEnd(9)} ${row.kind.padEnd(13)} ${String(count).padStart(3)}  cpu ${String(row.cpu).padStart(6)}%  frames ${row.fps}/s`);
    }
  }
}
if (args.json) writeFileSync(args.json, JSON.stringify({ when: new Date().toISOString(), seconds, processors: cpus().length, results }, null, 2));
