#!/usr/bin/env node
// A look inside the pages of a running WebView2 (or any Chromium) started with
// --remote-debugging-port=0, for as long as they live.
//
//   node tools/scripts/watch-webview-pages.mjs [--seconds 180] [--root <dir>]
//
// Why: the engine probe's minimise stage (tests/WebViewEngineProbe.cpp) found minimised player
// pages growing 12-18 MB a second on a third of their CPU, where the same page hidden in Chromium
// goes quiet and is collected. The probe sees processes; this sees the pages. With port 0 each
// browser picks a free port and writes it to DevToolsActivePort in its user data folder, so a
// second process started beside the first cannot collide with it; this finds those files under
// --root (the temp folder by default, where the player keeps its profile folders), attaches to every
// page, and every 5 s prints, with the UTC time:
//
//   - whether the page is hidden (document.visibilityState) and has focus,
//   - the frames it asked for and the timers it set since the last line,
//   - the events the native side pushed in (window.__JUCE__.backend.emitByBackend), by name, with
//     their size, and the events the page sent out (backend.emitEvent),
//   - the JS heap (used and allocated), DOM nodes and listeners, and its task and script time;
//
// and every 10 s, per browser, the functions that allocated the most in that time (V8's sampling
// heap profiler, garbage included), so a page that grows can be caught growing.
//
// Nothing is written to the pages beyond counters on window.__probeWatch; it uses Node's own
// WebSocket and fetch, so it needs nothing installed. It exits after --seconds, or 15 s after the
// last browser it found has gone.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const SECONDS = Number(option('--seconds', '180'));
const ROOT = option('--root', tmpdir());
const started = Date.now();

const stamp = () => new Date().toISOString().slice(11, 22);
const say = (line) => console.log(`${stamp()}  ${line}`);
const mb = (bytes) => (bytes / 1048576).toFixed(1);

// --- finding the browsers -------------------------------------------------------------------------

/** DevToolsActivePort files under `dir`, at most `depth` folders down, written since we started. */
function activePortFiles(dir, depth, found = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === 'DevToolsActivePort') {
      try { if (statSync(path).mtimeMs >= started - 5000) found.push(path); } catch { /* gone */ }
    } else if (entry.isDirectory() && depth > 0) {
      activePortFiles(path, depth - 1, found);
    }
  }
  return found;
}

const portsSeen = new Set();

function portsNow() {
  const ports = new Set();
  for (const file of activePortFiles(ROOT, 4)) {
    try {
      const port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      if (!(port > 0)) continue;
      ports.add(port);
      if (!portsSeen.has(port)) { portsSeen.add(port); say(`browser on port ${port} (${file})`); }
    } catch { /* being written */ }
  }
  return ports;
}

async function pageTargets(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
    return (await response.json()).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  } catch {
    return null;
  }
}

// --- one page -------------------------------------------------------------------------------------

class Page {
  constructor(port, target, name) {
    this.port = port;
    this.id = target.id;
    this.name = name;
    this.next = 1;
    this.waiting = new Map();
    this.closed = false;
    this.last = null;
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const waiter = message.id !== undefined ? this.waiting.get(message.id) : null;
      if (!waiter) return;
      this.waiting.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      this.closed = true;
      for (const waiter of this.waiting.values()) waiter.reject(new Error('closed'));
      this.waiting.clear();
    });
  }

  send(method, params = {}, timeoutMs = 5000) {
    if (this.closed) return Promise.reject(new Error('closed'));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.waiting.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description?.split('\n')[0] ?? result.exceptionDetails.text);
    return result.result.value;
  }
}

// Counters the page keeps for us. Safe to run again: a page that loaded again since (its counters
// gone) is instrumented afresh, and JUCE's backend is wrapped once it exists.
const INSTRUMENT = `(() => {
  let w = window.__probeWatch;
  if (!w) {
    w = window.__probeWatch = { raf: 0, timeouts: 0, intervals: 0, pushed: {}, sent: {}, visibility: [] };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => { w.raf += 1; return raf(fn); };
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => { w.timeouts += 1; return timeout(fn, ms, ...rest); };
    const interval = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...rest) => { w.intervals += 1; return interval(fn, ms, ...rest); };
    document.addEventListener('visibilitychange', () => w.visibility.push(new Date().toISOString().slice(11, 22) + ' ' + document.visibilityState));
  }
  const backend = window.__JUCE__ && window.__JUCE__.backend;
  if (backend && !backend.__probeWrapped) {
    backend.__probeWrapped = true;
    if (typeof backend.emitByBackend === 'function') {
      const fromNative = backend.emitByBackend.bind(backend);
      backend.emitByBackend = (id, object) => {
        const e = w.pushed[id] || (w.pushed[id] = { n: 0, bytes: 0 });
        e.n += 1; e.bytes += typeof object === 'string' ? object.length : 0;
        return fromNative(id, object);
      };
    }
    if (typeof backend.emitEvent === 'function') {
      const toNative = backend.emitEvent.bind(backend);
      backend.emitEvent = (id, object) => {
        const e = w.sent[id] || (w.sent[id] = { n: 0 });
        e.n += 1;
        return toNative(id, object);
      };
    }
  }
  return { url: location.href, bridge: !!backend };
})()`;

const SNAPSHOT = `(() => {
  const w = window.__probeWatch;
  if (!w || (window.__JUCE__ && window.__JUCE__.backend && !window.__JUCE__.backend.__probeWrapped)) return null;
  return { raf: w.raf, timeouts: w.timeouts, intervals: w.intervals, pushed: w.pushed, sent: w.sent,
           visibility: w.visibility.splice(0), state: document.visibilityState, focus: document.hasFocus() };
})()`;

function delta(now, before) {
  const out = [];
  for (const [id, e] of Object.entries(now)) {
    const n = e.n - (before?.[id]?.n ?? 0);
    const bytes = (e.bytes ?? 0) - (before?.[id]?.bytes ?? 0);
    if (n > 0) out.push({ id, n, bytes });
  }
  return out.sort((a, b) => b.n - a.n);
}

async function sample(page) {
  let counts = await page.evaluate(SNAPSHOT);
  if (counts === null) {
    // Loaded again since it was instrumented, or JUCE's backend arrived since: count from here.
    const what = await page.evaluate(INSTRUMENT);
    say(`${page.name}  instrumented ${what.url.slice(0, 80)}${what.bridge ? ', with JUCE\'s backend' : ', no JUCE backend'}`);
    page.last = null;
    counts = await page.evaluate(SNAPSHOT);
  }
  const metrics = Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const before = page.last;
  page.last = { counts, metrics };
  if (!before) page.lastAt = Date.now();
  for (const change of counts.visibility) say(`${page.name}  visibility -> ${change}`);
  if (!before) return;
  const seconds = (Date.now() - page.lastAt) / 1000;
  page.lastAt = Date.now();
  const pushed = delta(counts.pushed, before.counts.pushed);
  const sent = delta(counts.sent, before.counts.sent);
  const list = (items, withBytes) => items.length
    ? items.slice(0, 4).map((e) => `${e.id} ${e.n}${withBytes ? ` (${(e.bytes / 1024).toFixed(0)} KB)` : ''}`).join(', ')
    : 'none';
  say(`${page.name}  ${counts.state}${counts.focus ? ', focused' : ''}  JS ${mb(metrics.JSHeapUsedSize)}/${mb(metrics.JSHeapTotalSize)} MB`
      + `  nodes ${metrics.Nodes}  listeners ${metrics.JSEventListeners}`
      + `  task ${(metrics.TaskDuration - before.metrics.TaskDuration).toFixed(2)} s  script ${(metrics.ScriptDuration - before.metrics.ScriptDuration).toFixed(2)} s`
      + `  in ${seconds.toFixed(0)} s: frames ${counts.raf - before.counts.raf}, timeouts ${counts.timeouts - before.counts.timeouts}`
      + `, intervals ${counts.intervals - before.counts.intervals}`
      + `; pushed in: ${list(pushed, true)}; sent out: ${list(sent, false)}`);
}

// --- allocations, per browser ---------------------------------------------------------------------

/** The functions that allocated the most, a builtin's allocations charged to the script calling it. */
function topAllocators(profile, count) {
  const byFunction = new Map();
  let total = 0;
  (function walk(node, caller) {
    const f = node.callFrame;
    const where = f.url ? `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}` : null;
    const key = where ?? `${f.functionName || '(native)'} <- ${caller}`;
    if (node.selfSize) {
      byFunction.set(key, (byFunction.get(key) ?? 0) + node.selfSize);
      total += node.selfSize;
    }
    for (const child of node.children ?? []) walk(child, where ?? caller);
  })(profile.head, '(root)');
  return { total, top: [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, count) };
}

// --- the loop -------------------------------------------------------------------------------------

const pages = new Map();          // target id -> Page
const sampling = new Map();       // port -> Page doing that browser's heap sampling
let pageCount = 0;
let lastAlive = Date.now();
let seenAny = false;

const SAMPLING = { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };

/** One page per browser samples its allocations (the pages of a renderer share one heap). */
async function startSampling(port, page) {
  await page.send('HeapProfiler.enable');
  await page.send('HeapProfiler.startSampling', SAMPLING);
  sampling.set(port, page);
  page.samplingSince = Date.now();
}

async function attach(port, target) {
  const page = new Page(port, target, `page ${++pageCount} (port ${port})`);
  pages.set(target.id, page);
  try {
    await page.opened;
    await page.send('Performance.enable');
    page.lastAt = Date.now();
    say(`${page.name}  attached: ${target.url.slice(0, 80)}`);
    await sample(page);
  } catch (error) {
    say(`${page.name}  could not attach: ${error.message}`);
  }
}

async function reportAllocations(port, page) {
  try {
    const { profile } = await page.send('HeapProfiler.stopSampling', {}, 15000);
    const seconds = (Date.now() - page.samplingSince) / 1000;
    const { total, top } = topAllocators(profile, 6);
    say(`browser on port ${port}: ${mb(total)} MB allocated in ${seconds.toFixed(0)} s, most by`);
    for (const [where, bytes] of top) console.log(`              ${mb(bytes).padStart(7)} MB  ${where}`);
    await page.send('HeapProfiler.startSampling', SAMPLING);
    page.samplingSince = Date.now();
  } catch (error) {
    sampling.delete(port);
    if (!page.closed) say(`browser on port ${port}: allocation sampling stopped (${error.message})`);
  }
}

say(`watching ${ROOT} for browsers started with --remote-debugging-port=0, for up to ${SECONDS} s`);
let tick = 0;
while (Date.now() - started < SECONDS * 1000) {
  for (const port of portsNow()) {
    const targets = await pageTargets(port);
    if (!targets) continue;
    seenAny = true;
    lastAlive = Date.now();
    for (const target of targets)
      if (!pages.has(target.id)) await attach(port, target);
  }
  for (const [id, page] of pages) {
    if (page.closed) { say(`${page.name}  gone`); pages.delete(id); for (const [port, p] of sampling) if (p === page) sampling.delete(port); }
  }
  for (const page of pages.values())
    if (!page.closed && page.last && !sampling.has(page.port))
      await startSampling(page.port, page).catch((error) => say(`${page.name}  no allocation sampling: ${error.message}`));
  if (tick % 5 === 0)
    for (const page of pages.values())
      await sample(page).catch((error) => say(`${page.name}  no sample: ${error.message}`));
  if (tick % 10 === 9)
    for (const [port, page] of sampling) await reportAllocations(port, page);
  if (seenAny && pages.size === 0 && Date.now() - lastAlive > 15000) break;
  tick += 1;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
say(`stopped after ${((Date.now() - started) / 1000).toFixed(0)} s: ${portsSeen.size} browser(s), ${pageCount} page(s) seen`);
for (const page of pages.values()) page.socket.close();
process.exit(0);
