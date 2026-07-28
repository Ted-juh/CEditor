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
    assert.deepEqual(cmds[0], {
      op: 'rect', x: 0, y: 0, w: 100, h: 50, radius: 0,
      fill: '#111', stroke: '#5B9BD5', strokeWidth: 2,
    });
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
    assert.deepEqual(cmds[1], { op: 'circle', cx: 10, cy: 11, r: 12, fill: null, stroke: null, strokeWidth: 1 });
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
