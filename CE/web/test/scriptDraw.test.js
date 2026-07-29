// scriptDraw.test.js — ce.draw: oscilloscopes, envelope shapes, XY pads, readouts (phase 5).
//
// Immediate mode. Each verb records a command carrying the style in force when it was issued, and
// the overlay walks that list emitting one SVG element per command. The renderer holds no style
// state of its own, which is the point: it cannot disagree with the script about what colour
// something is.
//
// Two things are asserted throughout because they are the design, not details: coordinates are the
// CONTROL's own so a drawing scales with it, and nothing drawn is ever persisted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { render } from 'svelte/server';

import {
  scriptApiForTesting, setRuntimeHost, drawCommandsFor, clearAllDrawings,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptDrawings } from '../src/CE_Application/stores/scriptDraw.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import ScriptDrawOverlay from '../src/CE_Application/editor/ScriptDrawOverlay.svelte';
import {
  WEBVIEW_ONLY_MEMBERS, LIFECYCLE_HOOKS, handlerNamesForRuntime,
  RUNTIME_PLAYER, RUNTIME_WEBVIEW, memberPath,
} from '../src/CE_Application/scripting/panelApi.js';

function scopePanel() {
  return {
    id: 'p', name: 'Scope', width: 400, height: 200,
    scripting: { modules: ['ce.draw'] },
    controls: [createControl('Background', { name: 'screen', Transform: { width: 120, height: 60 } })],
  };
}

/** The id the drawings store keyed the (single) drawn control under. The tests address controls by
 *  NAME, and the store by id, so this is the one place the two meet. */
function drawnControlId() {
  return Object.keys(get(scriptDrawings))[0] ?? '';
}

/** Install a panel and hand the api for a script attached to `owner`. */
function withPanel(panel, owner, fn) {
  setRuntimeHost({ panel });
  try { return fn(scriptApiForTesting(owner, 'draw-script'), panel); } finally {
    clearAllDrawings();
    setRuntimeHost(null);
  }
}

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* ------------------------------------------------------------------------ recording commands */

test('each verb records a command with the style in force at that moment', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawFill('#111');
    api.drawStroke('#5B9BD5', 2);
    api.drawRect(0, 0, 100, 50);
    // Changing the style AFTER a shape must not reach back and repaint it — that is what
    // "immediate mode" means, and getting it wrong makes a drawing depend on what came later.
    api.drawStroke('#F2C94C', 4);
    api.drawLine(0, 25, 100, 25);

    const cmds = drawCommandsFor('screen');
    assert.equal(cmds.length, 2);
    assert.deepEqual(
      { op: cmds[0].op, x: cmds[0].x, y: cmds[0].y, w: cmds[0].w, h: cmds[0].h, radius: cmds[0].radius,
        fill: cmds[0].fill, stroke: cmds[0].stroke, strokeWidth: cmds[0].strokeWidth },
      { op: 'rect', x: 0, y: 0, w: 100, h: 50, radius: 0,
        fill: '#111', stroke: '#5B9BD5', strokeWidth: 2 });
    assert.equal(cmds[1].stroke, '#F2C94C');
    assert.equal(cmds[1].strokeWidth, 4);
  });
});

test('every shape verb is recorded in the order it was issued', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawRect(1, 2, 3, 4, 5);
    api.drawCircle(10, 11, 12);
    api.drawLine(0, 0, 9, 9);
    api.drawPath([0, 0, 5, 5, 10, 0]);
    api.drawText(2, 14, 'hz', { size: 9, align: 'middle' });

    const cmds = drawCommandsFor('screen');
    assert.deepEqual(cmds.map((c) => c.op), ['rect', 'circle', 'line', 'path', 'text']);
    assert.equal(cmds[0].radius, 5);
    assert.deepEqual(
      { op: cmds[1].op, cx: cmds[1].cx, cy: cmds[1].cy, r: cmds[1].r,
        fill: cmds[1].fill, stroke: cmds[1].stroke, strokeWidth: cmds[1].strokeWidth },
      { op: 'circle', cx: 10, cy: 11, r: 12, fill: null, stroke: null, strokeWidth: 1 });
    assert.deepEqual(cmds[3].points, [[0, 0], [5, 5], [10, 0]]);
    assert.equal(cmds[4].size, 9);
    assert.equal(cmds[4].align, 'middle');
  });
});

test('a path takes the flat coordinate list every language writes the same way', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    // A Lua table, a JS array and a Python list all express { x1, y1, x2, y2 } identically, which
    // is why the flat form is the contract rather than a list of point objects.
    api.drawPath([0, 1, 2, 3]);
    assert.deepEqual(drawCommandsFor('screen')[0].points, [[0, 1], [2, 3]]);

    api.drawClear();
    // An odd trailing value is dropped rather than silently pairing with a zero, which would put a
    // point on the axis that the script never asked for.
    api.drawPath([0, 1, 2, 3, 4]);
    assert.deepEqual(drawCommandsFor('screen')[0].points, [[0, 1], [2, 3]]);

    api.drawClear();
    api.drawPath([0, 1, 'x', 3]);
    assert.deepEqual(drawCommandsFor('screen')[0].points, [[0, 1]], 'a non-number is not a coordinate');
  });
});

test('clear throws away the drawing, and a draw ADDS rather than replaces', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawRect(0, 0, 10, 10);
    api.drawRect(0, 0, 20, 20);
    assert.equal(drawCommandsFor('screen').length, 2, 'a second draw appends');

    api.drawClear();
    assert.deepEqual(drawCommandsFor('screen'), []);
    assert.equal(get(scriptDrawings).screen, undefined);
  });
});

test('a script draws on the control it is attached to, or on one it names', () => {
  const panel = scopePanel();
  panel.controls.push(createControl('Background', { name: 'other', Transform: { width: 40, height: 40 } }));
  withPanel(panel, 'screen', (api) => {
    api.drawRect(0, 0, 5, 5);
    assert.equal(drawCommandsFor('screen').length, 1);
    assert.equal(drawCommandsFor('other').length, 0);

    api.drawClear('other');   // an explicit target, on a control the script is not attached to
    assert.equal(drawCommandsFor('screen').length, 1, 'clearing another control left this one alone');
  });
});

test('with nothing to draw on, it says so rather than dropping the command', () => {
  withPanel(scopePanel(), '', (api) => {
    clearScriptTrace();
    assert.equal(api.drawRect(0, 0, 10, 10), false);
    assert.match(traced(), /no control to draw on/);
    assert.match(traced(), /pass a target name/, 'and says what to do about it');
  });
});

/* --------------------------------------------------------------------------------- onDraw */

test('redraw runs onDraw, and the style resets each pass', async () => {
  const panel = scopePanel();
  panel.scripts = [{
    id: 'd', name: 'd', language: 'javascript', scope: 'component', event: 'onDraw',
    target: 'screen', enabled: true,
    source: 'function onDraw(info){ drawClear(); drawStroke("#5B9BD5", 2);'
      + ' drawLine(0, info.height / 2, info.width, info.height / 2); }',
  }];

  // The host carries the scripts alongside the panel — that is the shape playerScriptHost.js
  // builds, and activeScripts() reads host.scripts rather than digging into the document.
  setRuntimeHost({ panel, scripts: panel.scripts });
  try {
    const api = scriptApiForTesting('screen', 'redraw-caller');
    // A leftover style from an earlier draw must not bleed into the next pass, or a drawing
    // changes depending on what happened to run before it.
    api.drawFill('#ff0000');
    assert.equal(api.drawRedraw('screen'), true);
    // Dispatch is asynchronous — Lua and Python run through a WASM engine, so every handler call
    // goes through the same async path whatever language it is written in.
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const cmds = drawCommandsFor('screen');
    assert.equal(cmds.length, 1, 'onDraw cleared and drew one line');
    assert.equal(cmds[0].op, 'line');
    assert.equal(cmds[0].stroke, '#5B9BD5');
    assert.equal(cmds[0].fill, null, 'the pass started from a clean style');
    // info.width/height are the CONTROL's size, which is what makes a drawing scale with it.
    assert.equal(cmds[0].x2, 120);
    assert.equal(cmds[0].y1, 30);
  } finally { clearAllDrawings(); setRuntimeHost(null); }
});

test('redraw with no control to redraw reports it', () => {
  withPanel(scopePanel(), '', (api) => {
    clearScriptTrace();
    assert.equal(api.drawRedraw(), false);
    assert.match(traced(), /no control to redraw/);
  });
});

/* ------------------------------------------------------------------------------ rendering */

const svgOf = (controlId, width, height) =>
  render(ScriptDrawOverlay, { props: { controlId, width, height } }).body;

test('the overlay emits one SVG element per command, in order', () => {
  const panel = scopePanel();
  withPanel(panel, 'screen', (api) => {
    api.drawFill('#111');
    api.drawStroke('#5B9BD5', 2);
    api.drawRect(0, 0, 100, 50, 4);
    api.drawCircle(20, 20, 6);
    api.drawLine(0, 0, 100, 50);
    api.drawPath([0, 0, 10, 10], false);
    api.drawPath([0, 0, 10, 10, 20, 0], true);
    api.drawText(4, 12, 'A4');

    const id = panel.controls[0]._children.Core.id;
    const svg = svgOf(id, 120, 60);
    assert.match(svg, /<rect [^>]*rx="4"/);
    assert.match(svg, /<circle [^>]*r="6"/);
    assert.match(svg, /<line /);
    assert.match(svg, /<polyline /, 'an open path is a polyline');
    assert.match(svg, /<polygon /, 'a closed one is a polygon');
    assert.match(svg, />A4</);
    assert.match(svg, /fill="#111"/);
    assert.match(svg, /stroke-width="2"/);

    // Element ORDER is the paint order — a later command has to land on top.
    assert.ok(svg.indexOf('<rect') < svg.indexOf('<circle'));
    assert.ok(svg.indexOf('<circle') < svg.indexOf('<line'));
  });
});

test('an unset colour renders as "none", not as a default', () => {
  const panel = scopePanel();
  withPanel(panel, 'screen', (api) => {
    api.drawStroke('#fff', 1);
    api.drawRect(0, 0, 10, 10);         // no fill was set
    const svg = svgOf(panel.controls[0]._children.Core.id, 120, 60);
    assert.match(svg, /fill="none"/, 'SVG needs "none" to mean do-not-paint; an absent attribute paints black');
  });
});

test('the drawing is clipped to the control, so it cannot paint over its neighbours', () => {
  const panel = scopePanel();
  withPanel(panel, 'screen', (api) => {
    api.drawRect(-50, -50, 500, 500);
    const id = panel.controls[0]._children.Core.id;
    const svg = svgOf(id, 120, 60);
    assert.match(svg, new RegExp(`clipPath id="ce-draw-clip-${id}"`), 'the clip is per control');
    assert.match(svg, new RegExp(`clip-path="url\\(#ce-draw-clip-${id}\\)"`));
  });
});

test('an empty drawing renders nothing at all', () => {
  // Svelte's SSR emits its own block markers; what matters is that no <svg> is produced at all,
  // rather than an empty one sitting in the DOM over every control on the panel.
  assert.ok(!svgOf('nobody', 100, 100).includes('<svg'), 'no commands, no <svg> — not an empty one');
});

/* ------------------------------------------------------------------- never persisted, never player */

test('a drawing is never written to the panel document', () => {
  const panel = scopePanel();
  withPanel(panel, 'screen', (api) => {
    api.drawRect(0, 0, 10, 10);
    api.drawText(1, 1, 'x');
  });
  const saved = serializePanel(panel);
  assert.ok(!saved.includes('drawRect') && !saved.includes('"op"'),
    'a scope trace on disk would be meaningless as well as wrong');
});

test('the draw verbs are webview-only and onDraw never fires window-closed', () => {
  for (const id of ['drawClear', 'drawFill', 'drawStroke', 'drawRect', 'drawCircle',
    'drawLine', 'drawPath', 'drawText', 'drawRedraw']) {
    assert.ok(WEBVIEW_ONLY_MEMBERS.includes(id), `${id} must be declared webview-only`);
  }
  assert.equal(memberPath('drawRect'), 'ce.draw.rect');

  const hook = LIFECYCLE_HOOKS.find((h) => h.id === 'onDraw');
  assert.ok(hook);
  assert.equal(hook.runtime, RUNTIME_WEBVIEW);
  // A hook is a function the SCRIPT defines, so it must not be stubbed…
  assert.ok(!WEBVIEW_ONLY_MEMBERS.includes('onDraw'));
  // …and the window-closed runtime must not probe for it.
  assert.ok(!handlerNamesForRuntime(RUNTIME_PLAYER).includes('onDraw'));
  assert.ok(handlerNamesForRuntime(RUNTIME_WEBVIEW).includes('onDraw'));
});

test('a panel that has not enabled ce.draw gets the gate', () => {
  const panel = scopePanel();
  panel.scripting = { modules: [] };
  setRuntimeHost({ panel });
  try {
    clearScriptTrace();
    scriptApiForTesting('screen', 'gated').drawRect(0, 0, 10, 10);
    assert.match(traced(), /drawRect\(\) needs the ce\.draw module/);
    assert.deepEqual(drawCommandsFor('screen'), []);
  } finally { clearAllDrawings(); setRuntimeHost(null); }
});

/* ================================================================= §41: the rest of the style */
// fill and stroke took a flat colour and a width, and that was the whole vocabulary. The app's own
// renderers draw gradients, dashes, translucent overlays and a 5×7 LCD font; a script could do none
// of it. These pin that the new style is the PANEL's — the same gradient geometry, the same font —
// rather than a second opinion that happens to look similar.

import { gradientCoords } from '../src/CE_Application/utils/gradientGeometry.js';
import { glyphRows, FONT_W, FONT_H, FONT_ADVANCE } from '../src/CE_Application/utils/pixelFont.js';
import { MEMBER_BY_ID, memberRuntime } from '../src/CE_Application/scripting/panelApi.js';

test('every phase-41 draw verb is declared, panel-view only, and namespaced under ce.draw', () => {
  for (const [id, path] of [
    ['drawGradient', 'ce.draw.gradient'], ['drawOpacity', 'ce.draw.opacity'],
    ['drawTransform', 'ce.draw.transform'], ['drawEllipse', 'ce.draw.ellipse'],
    ['drawPixelText', 'ce.draw.pixelText'], ['drawMeasure', 'ce.draw.measure'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_WEBVIEW, 'there is no surface to draw on');
  }
});

/* -------------------------------------------------------------------------- gradient */

test('a gradient is a fill, and carries the panel\'s own angle convention', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    const g = api.drawGradient([{ at: 0, colour: '#000' }, { at: 1, colour: '#FFF' }], 90);
    assert.equal(g.gradient, true);
    assert.equal(g.angle, 90);
    assert.deepEqual(g.stops.map((s) => s.at), [0, 1]);
    api.drawFill(g);
    api.drawRect(0, 0, 10, 10);
    // The gradient survives as an OBJECT rather than being stringified — the overlay turns it into
    // the url(#…) reference SVG needs, and "[object Object]" is not a colour.
    assert.equal(drawCommandsFor('screen')[0].fill, g);
  });
});

test('bare colours space themselves evenly, which is what a two-colour fade is', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    assert.deepEqual(api.drawGradient(['#000', '#FFF']).stops.map((s) => s.at), [0, 1]);
    assert.deepEqual(api.drawGradient(['#000', '#888', '#FFF']).stops.map((s) => s.at), [0, 0.5, 1]);
    // …and a positioned stop keeps its position while the rest fall where they may.
    assert.equal(api.drawGradient([{ at: 0.25, colour: '#000' }, '#FFF']).stops[0].at, 0.25);
  });
});

test('fewer than two usable stops is not a gradient', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    assert.equal(api.drawGradient(['#000']), undefined, 'one colour and nothing is a colour');
    assert.equal(api.drawGradient([]), undefined);
    assert.equal(api.drawGradient(null), undefined);
    assert.equal(api.drawGradient(['#000', '']), undefined, 'and an empty colour is not one');
  });
});

test('the overlay resolves a gradient with the app\'s own gradientCoords', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawFill(api.drawGradient(['#000', '#FFF'], 90));
    api.drawRect(0, 0, 120, 60);
    const html = render(ScriptDrawOverlay, {
      props: { controlId: drawnControlId(), width: 120, height: 60 },
    }).body;
    // userSpaceOnUse is what makes a gradient paint on a zero-area path, and is what the app's
    // helper is documented as being for.
    assert.match(html, /gradientUnits="userSpaceOnUse"/);
    const co = gradientCoords(90, 120, 60);
    assert.match(html, new RegExp(`x1="${co.x1}"`), 'the geometry must be the panel\'s, not a second opinion');
    assert.match(html, new RegExp(`x2="${co.x2}"`));
    assert.match(html, /url\(#ce-draw-grad-/, 'and the shape points at it by reference');
  });
});

/* ----------------------------------------------------------------- dash / cap / join */

test('a dash is a list of on/off lengths, the way every drawing API spells it', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawStroke('#FFF', 1, { dash: [3, 3], cap: 'square', join: 'bevel' });
    api.drawLine(0, 0, 10, 10);
    const c = drawCommandsFor('screen')[0];
    assert.equal(c.dash, '3 3', 'the panel\'s own beat marks are exactly this');
    assert.equal(c.cap, 'square');
    assert.equal(c.join, 'bevel');
  });
});

test('an unknown cap or join is not one, and no dash is no dash', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawStroke('#FFF', 1, { cap: 'sausage', join: 'wibble' });
    api.drawLine(0, 0, 1, 1);
    const c = drawCommandsFor('screen')[0];
    assert.equal(c.cap, null);
    assert.equal(c.join, null);
    assert.equal(c.dash, null);
  });
});

test('path takes the cap and join it was given, having hardcoded round on both', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawStroke('#FFF', 1, { cap: 'butt', join: 'miter' });
    api.drawPath([0, 0, 5, 5]);
    const html = render(ScriptDrawOverlay, {
      props: { controlId: drawnControlId(), width: 120, height: 60 },
    }).body;
    assert.match(html, /stroke-linecap="butt"/);
    assert.match(html, /stroke-linejoin="miter"/);
  });
});

/* ---------------------------------------------------------------- opacity / transform */

test('opacity and transform apply to what FOLLOWS, like every other style verb', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawRect(0, 0, 1, 1);                       // before: neither
    api.drawOpacity(0.5);
    api.drawTransform({ rotate: 45, cx: 10, cy: 20 });
    api.drawRect(0, 0, 1, 1);                       // after: both
    const cmds = drawCommandsFor('screen');
    assert.equal(cmds[0].opacity, null);
    assert.equal(cmds[0].transform, null);
    assert.equal(cmds[1].opacity, 0.5);
    assert.equal(cmds[1].transform, 'rotate(45 10 20)');
  });
});

test('a transform composes move, rotate and scale, and nothing clears it', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawTransform({ x: 5, y: 6, rotate: 90, cx: 1, cy: 2, scale: 2 });
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen')[0].transform, 'translate(5 6) rotate(90 1 2) scale(2)');
    api.drawTransform();
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen')[1].transform, null);
  });
});

test('a rotation with no centre turns about the origin, and says so by omission', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawTransform({ rotate: 30 });
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen')[0].transform, 'rotate(30)');
  });
});

test('opacity clamps, and a non-number clears it', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawOpacity(5);
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen')[0].opacity, 1);
    api.drawOpacity('nonsense');
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen')[1].opacity, null);
  });
});

test('a draw pass resets the WHOLE style, not the half it started with', () => {
  // The reset is why a drawing does not depend on what ran before it. A dash or a transform left
  // set by the last pass would be exactly that dependency.
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawOpacity(0.25);
    api.drawTransform({ rotate: 10 });
    api.drawStroke('#FFF', 3, { dash: [1, 1], cap: 'butt', join: 'miter' });
    api.drawRedraw('screen');                       // …runs onDraw, which resets first
    api.drawRect(0, 0, 1, 1);
    const c = drawCommandsFor('screen')[0];
    for (const field of ['opacity', 'transform', 'dash', 'cap', 'join']) {
      assert.equal(c[field], null, `${field} survived a redraw`);
    }
  });
});

/* --------------------------------------------------------------------------- ellipse */

test('an ellipse is not a circle, and renders as one', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawFill('#F00');
    api.drawEllipse(10, 20, 8, 3);
    const c = drawCommandsFor('screen')[0];
    assert.deepEqual({ op: c.op, cx: c.cx, cy: c.cy, rx: c.rx, ry: c.ry },
      { op: 'ellipse', cx: 10, cy: 20, rx: 8, ry: 3 });
    const html = render(ScriptDrawOverlay, {
      props: { controlId: drawnControlId(), width: 120, height: 60 },
    }).body;
    assert.match(html, /<ellipse[^>]*rx="8"[^>]*ry="3"/);
  });
});

/* ------------------------------------------------------------------------- pixelText */

test('pixelText draws the app\'s own font, one square per lit pixel', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawFill('#0F0');
    api.drawPixelText('A', 0, 0, 1);
    const html = render(ScriptDrawOverlay, {
      props: { controlId: drawnControlId(), width: 120, height: 60 },
    }).body;
    // The number of squares IS the number of lit pixels in the app's glyph. A different font, or a
    // different packing, gives a different count — which is the whole thing being pinned.
    const lit = glyphRows('A').join('').split('').filter((ch) => ch === '#').length;
    assert.equal((html.match(/<rect/g) ?? []).length, lit + 1, 'plus the clip rect');
  });
});

test('scale is whole pixels, because a bitmap font between pixels is a blur', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    api.drawPixelText('A', 0, 0, 2.7);
    assert.equal(drawCommandsFor('screen')[0].scale, 3);
    api.drawClear();
    api.drawPixelText('A', 0, 0, 0);
    assert.equal(drawCommandsFor('screen')[0].scale, 1, 'and never smaller than one');
  });
});

/* --------------------------------------------------------------------------- measure */

test('measuring the pixel font is exact, because a grid is arithmetic', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    const m = api.drawMeasure('ABC', { pixel: true });
    // Three glyphs at FONT_ADVANCE apart, less the trailing gap: a string ends at its last lit
    // column, not a pixel past it.
    assert.deepEqual(m, { width: 3 * FONT_ADVANCE - 1, height: FONT_H, exact: true });
    assert.equal(api.drawMeasure('', { pixel: true }).width, 0);
    assert.equal(api.drawMeasure('AB', { pixel: true, scale: 2 }).width, 2 * FONT_ADVANCE * 2 - 2);
    assert.equal(FONT_W, 5, 'the glyph grid the arithmetic assumes');
  });
});

test('measuring a proportional font says whether it MEASURED or estimated', () => {
  withPanel(scopePanel(), 'screen', (api) => {
    const m = api.drawMeasure('ABC', { size: 10 });
    assert.equal(typeof m.width, 'number');
    assert.equal(m.height, 10);
    // In a test run there is no canvas, so this is the estimate branch — and it SAYS so rather than
    // handing back a guess dressed as a measurement.
    assert.equal(typeof m.exact, 'boolean');
    if (!m.exact) assert.equal(m.width, 3 * 10 * 0.6);
  });
});
