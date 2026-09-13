/**
 * behaviourKit.mjs — the measurement primitives for the deep behavioural pass.
 *
 * WHY THIS FILE EXISTS. The first QA pass proved that properties can be written and that controls
 * mount. Neither is behaviour, and the user said so. Writing `Envelope.curve = 'exponential'` and
 * observing that the DOM changed proves the renderer re-ran; it does not prove the curve bends. A
 * hash of innerHTML is the worst of both: it goes green for a change of any kind, including a wrong
 * one, and it cannot say what it saw.
 *
 * So everything here returns STRUCTURE with numbers in it, which a check then asserts exact
 * expectations against:
 *
 *   geo()    the control's SVG as a list of shapes, each with its numeric attributes and resolved
 *            paint. Comparable, diffable, and specific enough to say "the third rect is 42px wide".
 *   pixel()  the rasterised colour at a point, for properties whose effect is paint rather than
 *            shape. Real rasterisation — the SVG is serialised and drawn into a canvas — because a
 *            fill attribute is what was ASKED for and a pixel is what happened.
 *   ports()  the fan-out values a multi-port control currently exposes: the actual numbers that
 *            reach a device parameter.
 *   notes()  every note the panel played, from the one funnel they all pass through.
 *   reopen() serialise the panel to the on-disk format, deserialise it, and OPEN IT AS A PANEL, so
 *            the measurement afterwards goes through the real renderer over a real reload. A model
 *            round-trip that never reaches a renderer is not evidence that anything still works.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function boot({ width = 1700, height = 1000 } = {}) {
  const server = process.env.CE_BEHAVIOUR_URL ? null : await createServer({
    root, configFile: join(root, 'vite.config.js'),
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  if (server) await server.listen();
  const url = process.env.CE_BEHAVIOUR_URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : process.platform === 'win32' ? { channel: 'msedge' }
      : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const failures = [];
  page.on('pageerror', (error) => failures.push(String(error).split('\n')[0]));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app', { timeout: 60000 });
  await page.waitForTimeout(150);

  // One tap on every note the panel plays, installed before anything is inserted.
  await page.evaluate(async () => {
    const { noteOutputEvents } = await import('/src/CE_Application/stores/noteOutput.js');
    window.__notes = [];
    noteOutputEvents.subscribe((v) => { for (const e of v.events ?? []) window.__notes.push(e); });
  });

  const kit = new Kit(page, failures);
  kit.close = async () => { await browser.close(); if (server) await server.close(); };
  return kit;
}

class Kit {
  constructor(page, failures) { this.page = page; this.failures = failures; }

  settle(ms = 110) { return this.page.waitForTimeout(ms); }

  /** A panel of its own. Isolation is not tidiness: clocks, the note funnel and the fan-out bus are
   *  all panel-wide, so a control left running three checks ago is indistinguishable from the one
   *  under test. */
  async fresh() {
    await this.page.evaluate(async () => {
      const { addPanel } = await import('/src/CE_Application/stores/panels.js');
      addPanel();
    });
    await this.settle();
  }

  async preview(on) {
    await this.page.evaluate(async (on) => {
      const { setPreviewModeEnabled } = await import('/src/CE_Application/stores/interactionPreview.js');
      setPreviewModeEnabled(on);
    }, on);
    await this.settle();
  }

  /** Insert a control and apply a property patch. Returns its id. */
  async make(type, patch = {}) {
    const id = await this.page.evaluate(async ({ type }) => {
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const { addControl } = await import('/src/CE_Application/stores/controls.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      const all = () => flat(get(panels).flatMap((p) => p.controls ?? []));
      const before = new Set(all().map((c) => c._children.Core.id));
      addControl(type);
      const made = all().find((c) => !before.has(c._children.Core.id));
      return made ? made._children.Core.id : '';
    }, { type });
    if (!id) throw new Error(`${type}: addControl produced nothing`);
    await this.settle();
    if (Object.keys(patch).length) await this.set(id, patch);
    return id;
  }

  async set(id, patch) {
    await this.page.evaluate(async ({ id, patch }) => {
      const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
      for (const [path, value] of Object.entries(patch)) updateControlProperty(id, path, value);
    }, { id, patch });
    await this.settle();
  }

  read(id, path) {
    return this.page.evaluate(async ({ id, path }) => {
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      // THE ACTIVE PANEL FIRST. Reopening a saved panel keeps every control id, so two open panels
      // hold controls with the SAME id — and a search across all panels returns the one that is not
      // on screen. Reading the old copy while dragging the new one reports a working control as
      // broken, which is exactly what it did before this line existed.
      const { activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const pool = live ? flat(live.controls ?? []) : [];
      const c = pool.find((x) => x._children.Core.id === id)
        ?? flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      let node = c?._children;
      for (const part of String(path).split('.')) node = node?.[part] ?? node?._children?.[part];
      return node === undefined ? null : JSON.parse(JSON.stringify(node));
    }, { id, path });
  }

  /**
   * The control's SVG as comparable structure: every shape with its numeric attributes and the
   * paint that actually resolved. `text` carries the glyphs, because a label IS the behaviour for
   * every `show…` and `format…` property in the catalogue.
   */
  geo(id) {
    return this.page.evaluate((id) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      if (!el) return null;
      const KEYS = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
        'x1', 'y1', 'x2', 'y2', 'points', 'd', 'transform', 'stroke-width', 'stroke-dasharray',
        'font-size', 'text-anchor', 'fill-opacity', 'stroke-opacity'];
      const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
      return [...el.querySelectorAll('svg, svg *')].map((n) => {
        const a = {};
        for (const k of KEYS) { const v = n.getAttribute(k); if (v != null) a[k] = num(v); }
        const cs = getComputedStyle(n);
        return {
          tag: n.tagName,
          cls: String(n.getAttribute('class') ?? '').split(/\s+/).filter((c) => c && !c.startsWith('s-')).join(' '),
          fill: n.getAttribute('fill') ?? cs.fill,
          stroke: n.getAttribute('stroke') ?? cs.stroke,
          opacity: n.getAttribute('opacity') ?? '',
          text: n.tagName === 'text' ? (n.textContent ?? '').trim() : undefined,
          ...a,
        };
      });
    }, id);
  }

  /**
   * The control's HTML children as comparable structure. Several renderers — the Mod Matrix, every
   * custom component — draw with positioned divs rather than SVG, and `geo()` cannot see them. Each
   * entry carries the class, the glyphs, the box RELATIVE TO THE CONTROL (so it is comparable
   * across runs and after a reopen) and the paint that actually resolved.
   */
  dom(id, selector = '*') {
    return this.page.evaluate(({ id, selector }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      if (!el) return null;
      const host = el.getBoundingClientRect();
      const r1 = (v) => Math.round(v * 10) / 10;
      return [...el.querySelectorAll(selector)].map((n) => {
        const b = n.getBoundingClientRect();
        const cs = getComputedStyle(n);
        return {
          cls: String(n.getAttribute('class') ?? '').split(/\s+/).filter((c) => c && !c.startsWith('s-')).join(' '),
          text: (n.childElementCount === 0 ? (n.textContent ?? '').trim() : ''),
          x: r1(b.x - host.x), y: r1(b.y - host.y), w: r1(b.width), h: r1(b.height),
          bg: cs.backgroundColor, colour: cs.color, opacity: cs.opacity,
          font: r1(parseFloat(cs.fontSize) || 0), shadow: cs.boxShadow,
        };
      });
    }, { id, selector });
  }

  /** Every glyph the control draws, in document order. */
  async texts(id) {
    return (await this.geo(id) ?? []).filter((n) => n.tag === 'text').map((n) => n.text);
  }

  /** Shapes of one tag, optionally filtered, so a check can say "the fourth bar". */
  async shapes(id, tag, where = () => true) {
    return (await this.geo(id) ?? []).filter((n) => n.tag === tag && where(n));
  }

  /**
   * The RASTERISED colour at a fraction of the control's box, as [r,g,b,a].
   * The SVG is serialised and drawn into a canvas, so what comes back is what a pixel would be —
   * gradients, opacity stacking and overlap included, none of which an attribute read can see.
   */
  pixel(id, fx, fy) {
    return this.page.evaluate(async ({ id, fx, fy }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      const svg = el?.querySelector('svg');
      if (!svg) return null;
      const box = svg.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.width));
      const h = Math.max(1, Math.round(box.height));
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(h));
      const markup = new XMLSerializer().serializeToString(clone);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve; img.onerror = () => reject(new Error('svg did not rasterise'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(
        Math.min(w - 1, Math.max(0, Math.round(w * fx))),
        Math.min(h - 1, Math.max(0, Math.round(h * fy))), 1, 1).data;
      return [px[0], px[1], px[2], px[3]];
    }, { id, fx, fy });
  }

  /** The fan-out values this control currently offers a device parameter. */
  ports(id) {
    return this.page.evaluate(async ({ id }) => {
      const { controlPortValues } = await import('/src/CE_Application/utils/controlPortValues.js');
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      // THE ACTIVE PANEL FIRST. Reopening a saved panel keeps every control id, so two open panels
      // hold controls with the SAME id — and a search across all panels returns the one that is not
      // on screen. Reading the old copy while dragging the new one reports a working control as
      // broken, which is exactly what it did before this line existed.
      const { activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const pool = live ? flat(live.controls ?? []) : [];
      const c = pool.find((x) => x._children.Core.id === id)
        ?? flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      return c ? controlPortValues(c) : null;
    }, { id });
  }

  session(id) {
    return this.page.evaluate(async (id) => {
      const { panelPreviewSessions } = await import('/src/CE_Application/stores/interactionPreview.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      return get(panelPreviewSessions)?.[id] ?? null;
    }, id);
  }

  notes() { return this.page.evaluate(() => window.__notes.slice()); }
  forget() { return this.page.evaluate(() => { window.__notes.length = 0; }); }

  box(id) {
    return this.page.evaluate((id) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, id);
  }

  /** The centre of the nth element matching a selector inside the control, in page coordinates. */
  spot(id, selector, index = 0, fy = 0.5) {
    return this.page.evaluate(({ id, selector, index, fy }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      const h = el?.querySelectorAll(selector)?.[index];
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height * fy };
    }, { id, selector, index, fy });
  }

  /** A press-and-release at a point, with the settle a drag needs between down and move. */
  async drag(from, to) {
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.settle();
    if (to) await this.page.mouse.move(to.x, to.y, { steps: 8 });
    await this.page.mouse.up();
    await this.settle();
  }

  async click(at) {
    await this.page.mouse.move(at.x, at.y);
    await this.page.mouse.down();
    await this.settle(40);
    await this.page.mouse.up();
    await this.settle();
  }

  /**
   * SAVE AND REOPEN, for real: the active panel is serialised to the on-disk `.cepanel` format,
   * parsed back, and opened as a new panel. Returns the reopened control's id, so the SAME
   * behavioural assertion can be run again against a renderer that has never seen the original.
   */
  async reopen(id) {
    const newId = await this.page.evaluate(async ({ id }) => {
      const { serializePanel, deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
      const { panels, activePanelId, addPanel } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      const list = get(panels);
      const panel = list.find((p) => p.id === get(activePanelId)) ?? list[list.length - 1];
      const index = flat(panel.controls ?? []).findIndex((c) => c._children.Core.id === id);
      if (index < 0) return '';
      const json = serializePanel(panel);
      const reopened = deserializePanel(typeof json === 'string' ? json : JSON.stringify(json), '', 'reopened');
      addPanel(reopened);
      const now = get(panels);
      const opened = now[now.length - 1];
      const again = flat(opened.controls ?? [])[index];
      return again ? again._children.Core.id : '';
    }, { id });
    if (!newId) throw new Error('reopen: the control did not come back');
    await this.settle(260);
    return newId;
  }
}

/** Round every number in a geometry list, so a sub-pixel layout wobble is not a failure. */
export function rounded(shapes, places = 1) {
  const f = 10 ** places;
  return (shapes ?? []).map((s) => {
    const out = {};
    for (const [k, v] of Object.entries(s)) out[k] = typeof v === 'number' ? Math.round(v * f) / f : v;
    return out;
  });
}

/**
 * The per-property ledger, written BY THE RUN rather than by hand.
 *
 * A hand-written coverage table is a claim; this one is a transcript. Every row carries the
 * property, what its declaration promises, the expectation that was asserted and the value actually
 * measured — so a row cannot say "verified" unless an assertion ran and passed, and an unsupported
 * property has to be recorded as such out loud.
 */
export class Ledger {
  constructor(title) { this.title = title; this.rows = []; this.failures = []; }

  /** A property whose promised effect was asserted and held. */
  ok(type, property, promise, expected, measured) {
    this.rows.push({ type, property, promise, expected, measured, status: 'verified' });
    return true;
  }

  /** A property with no reader anywhere: declared, and inert. Never counted as verified. */
  inert(type, property, promise, note) {
    this.rows.push({ type, property, promise, expected: '—', measured: note, status: 'inert' });
  }

  /** Honest gap: nothing in this environment can observe it. */
  unverified(type, property, promise, why) {
    this.rows.push({ type, property, promise, expected: '—', measured: why, status: 'unverified' });
  }

  /** A reproducible defect. */
  bug(type, property, promise, expected, measured, id) {
    this.rows.push({ type, property, promise, expected, measured, status: `BUG ${id}` });
    this.failures.push(`${id} — ${type}.${property}: expected ${expected}, measured ${measured}`);
  }

  count(status) { return this.rows.filter((r) => r.status === status).length; }

  /** Assert-and-record in one move: the row cannot exist without the assertion having run. */
  check(type, property, promise, expected, measured, compare = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
    if (compare(expected, measured)) return this.ok(type, property, promise, expected, measured);
    const error = new Error(`${type}.${property} — ${promise}\n  expected: ${JSON.stringify(expected)}\n  measured: ${JSON.stringify(measured)}`);
    error.ledgerRow = { type, property, expected, measured };
    throw error;
  }

  markdown() {
    const esc = (v) => String(typeof v === 'string' ? v : JSON.stringify(v))
      .replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
    const lines = [`| Property | Promised effect | Expected | Measured | Status |`, `| --- | --- | --- | --- | --- |`];
    let type = '';
    for (const r of this.rows) {
      if (r.type !== type) { type = r.type; lines.push(`| **${type}** | | | | |`); }
      lines.push(`| \`${r.property}\` | ${esc(r.promise)} | ${esc(r.expected)} | ${esc(r.measured)} | ${r.status} |`);
    }
    return lines.join('\n');
  }

  report() {
    const v = this.count('verified');
    const i = this.count('inert');
    const u = this.count('unverified');
    console.log(`\n${this.title}: ${v} verified, ${i} inert, ${u} unverified, ${this.failures.length} defects, of ${this.rows.length} rows`);
    for (const f of this.failures) console.log(`   ${f}`);
  }
}
