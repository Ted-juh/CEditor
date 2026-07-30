// scriptDrawBulk.test.js — the bulk primitives, the style stack and the cost (design doc §49).
//
// ce.draw felt thin, and the reason was not the verb count: it could not afford a LOOP. Every command
// republished the whole command list, so drawing n shapes was O(n²) work and n store notifications —
// 256 line segments cost 21ms before any painting happened, which is more than a 60fps frame. Every
// interesting drawing (a scope trace, a spectrum, a step grid, tick marks, a scatter) is a loop.
//
// So this file pins two things that are usually left to hope:
//
//   1. The new ops render what they claim — one path for a whole grid, a curve THROUGH its points.
//   2. The COST. A performance fix nobody measures comes back, so the batching and the one-command
//      bulk verbs are asserted by counting store notifications rather than by trusting the comment.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, setRuntimeHost, drawCommandsFor, clearAllDrawings,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptDrawings } from '../src/CE_Application/stores/scriptDraw.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { moduleMemberMap, MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';

function scopePanel() {
  return {
    id: 'p', name: 'Scope', width: 400, height: 200,
    scripting: { modules: ['ce.core', 'ce.draw'] },
    controls: [createControl('Background', { name: 'screen', Transform: { width: 120, height: 60 } })],
  };
}

function withPanel(fn) {
  setRuntimeHost({ panel: scopePanel() });
  try { return fn(scriptApiForTesting('screen', 'draw-script')); } finally {
    clearAllDrawings();
    setRuntimeHost(null);
  }
}

const drawn = () => drawCommandsFor('screen') ?? [];
const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/** Count store notifications while `fn` runs — the thing that costs a re-render. */
function notifications(fn) {
  let n = 0;
  const stop = scriptDrawings.subscribe(() => { n += 1; });
  n = 0;                      // subscribe fires once immediately
  try { fn(); } finally { stop(); }
  return n;
}

/* ------------------------------------------------------------------ the contract */

test('all eleven new members are declared and reachable', () => {
  const map = moduleMemberMap('ce.draw');
  for (const short of ['batch', 'grid', 'lines', 'points', 'curve', 'polygon', 'image',
    'clip', 'blend', 'save', 'restore']) {
    assert.ok(map[short], `ce.draw.${short} is not declared`);
    assert.ok(MEMBER_BY_ID[map[short]], `${map[short]} has no member entry`);
    // §1: every namespaced spelling here is a bare word, so no flat alias may be one.
    assert.ok(map[short].startsWith('draw'), `${short} -> ${map[short]} must keep the draw prefix`);
  }
  withPanel((api) => {
    for (const flat of Object.values(map)) {
      assert.equal(typeof api[flat], 'function', `${flat} missing from the runtime`);
    }
  });
});

/* ------------------------------------------------------------------ grid */

test('grid is ONE command whatever its size', () => {
  withPanel((api) => {
    api.drawGrid({ columns: 16, rows: 8 });
    assert.equal(drawn().length, 1, 'a whole lattice is one command');
    assert.equal(drawn()[0].op, 'segments');
    // 17 verticals and 9 horizontals: the closing line is drawn, so a 16-column grid has 17 lines.
    assert.equal(drawn()[0].segments.length, 17 + 9);
  });
});

test('grid takes a spacing or a count, and spans the control by default', () => {
  withPanel((api) => {
    api.drawGrid({ step: 20 });
    // The control is 120x60, so a 20px step gives verticals at 0,20,40,60,80,100,120 = 7
    // and horizontals at 0,20,40,60 = 4.
    assert.equal(drawn()[0].segments.length, 7 + 4);
    const verticals = drawn()[0].segments.filter(([x1, , x2]) => x1 === x2);
    assert.equal(verticals.length, 7);
    // …and each vertical spans the full height, which is what "spans the control" means.
    for (const [, y1, , y2] of verticals) { assert.equal(y1, 0); assert.equal(y2, 60); }
  });
});

test('grid honours an explicit box', () => {
  withPanel((api) => {
    api.drawGrid({ x: 10, y: 5, width: 40, height: 20, stepX: 20, stepY: 10 });
    const segs = drawn()[0].segments;
    const verticals = segs.filter(([x1, , x2]) => x1 === x2).map(([x]) => x);
    assert.deepEqual(verticals, [10, 30, 50]);
    for (const [, y1, , y2] of segs.filter(([x1, , x2]) => x1 === x2)) {
      assert.equal(y1, 5); assert.equal(y2, 25);
    }
  });
});

test('grid with neither a spacing nor a count reports rather than drawing nothing', () => {
  withPanel((api) => {
    clearScriptTrace();
    assert.equal(api.drawGrid({}), false);
    assert.equal(drawn().length, 0);
    assert.match(traced(), /needs a spacing or a count/);
  });
});

/* ------------------------------------------------------------------ lines and points */

test('lines takes many disjoint segments as one command', () => {
  withPanel((api) => {
    api.drawLines([[0, 0, 10, 0], [0, 5, 10, 5], [0, 10, 10, 10]]);
    assert.equal(drawn().length, 1);
    assert.equal(drawn()[0].segments.length, 3);
  });
});

test('lines accepts objects as well as tuples, and drops what is not a segment', () => {
  withPanel((api) => {
    api.drawLines([{ x1: 0, y1: 0, x2: 5, y2: 5 }, [1, 1, 2, 2], 'nonsense', [1, 1]]);
    assert.equal(drawn()[0].segments.length, 2, 'two well-formed segments survive');
  });
});

test('lines with nothing usable reports', () => {
  withPanel((api) => {
    clearScriptTrace();
    assert.equal(api.drawLines([]), false);
    assert.match(traced(), /no segments/);
  });
});

test('points is one command, with its own radius', () => {
  withPanel((api) => {
    api.drawPoints([[1, 2], [3, 4], { x: 5, y: 6 }], 3);
    assert.equal(drawn().length, 1);
    assert.equal(drawn()[0].op, 'dots');
    assert.deepEqual(drawn()[0].points, [[1, 2], [3, 4], [5, 6]]);
    assert.equal(drawn()[0].r, 3);
  });
});

/* ------------------------------------------------------------------ curve and polygon */

test('curve records its points and tension, clamped', () => {
  withPanel((api) => {
    api.drawCurve([[0, 0], [10, 10], [20, 0]], { tension: 5 });
    assert.equal(drawn()[0].op, 'curve');
    assert.equal(drawn()[0].tension, 1, 'tension is clamped to 0..1');
    api.drawCurve([[0, 0], [10, 10]], { tension: -1 });
    assert.equal(drawn()[1].tension, 0);
  });
});

test('curve needs two points', () => {
  withPanel((api) => {
    clearScriptTrace();
    assert.equal(api.drawCurve([[0, 0]]), false);
    assert.match(traced(), /at least two points/);
  });
});

test('polygon becomes a closed path with the right number of corners', () => {
  withPanel((api) => {
    api.drawPolygon(50, 30, 20, 6);
    assert.equal(drawn()[0].op, 'path', 'a polygon IS a closed path — no new renderer branch');
    assert.equal(drawn()[0].closed, true);
    assert.equal(drawn()[0].points.length, 6);
    // Rotation 0 puts the first corner at twelve o'clock, matching drawArc's convention.
    const [x, y] = drawn()[0].points[0];
    assert.ok(Math.abs(x - 50) < 1e-9, `first corner should be above the centre, got x=${x}`);
    assert.ok(y < 30, 'and above it');
  });
});

test('polygon raises fewer than three sides to three', () => {
  withPanel((api) => {
    api.drawPolygon(0, 0, 10, 1);
    assert.equal(drawn()[0].points.length, 3);
  });
});

/* ------------------------------------------------------------------ image */

test('image refuses a source the renderer could not load', () => {
  withPanel((api) => {
    clearScriptTrace();
    // The failure this verb will actually be handed: an asset NAME rather than something loadable.
    // Accepting it would draw nothing and say nothing.
    assert.equal(api.drawImage('', 0, 0, 10, 10), false);
    assert.match(traced(), /no source/);
    assert.equal(drawn().length, 0);
  });
});

test('image records a loadable source and its fit', () => {
  withPanel((api) => {
    const src = 'data:image/svg+xml;base64,PHN2Zy8+';
    api.drawImage(src, 1, 2, 30, 40, { fit: 'contain' });
    assert.equal(drawn()[0].op, 'image');
    assert.equal(drawn()[0].src, src);
    assert.equal(drawn()[0].fit, 'contain');
    api.drawImage(src, 0, 0, 1, 1, { fit: 'nonsense' });
    assert.equal(drawn()[1].fit, 'fill', 'an unknown fit falls back to the default rather than through');
  });
});

/* ------------------------------------------------------------------ style: clip, blend, stack */

test('clip applies to what follows and clears with no arguments', () => {
  withPanel((api) => {
    api.drawRect(0, 0, 5, 5);
    api.drawClip(1, 2, 30, 40);
    api.drawRect(0, 0, 5, 5);
    api.drawClip();
    api.drawRect(0, 0, 5, 5);
    assert.equal(drawn()[0].clip, null, 'before the clip');
    assert.deepEqual(drawn()[1].clip, { x: 1, y: 2, w: 30, h: 40 });
    assert.equal(drawn()[2].clip, null, 'after clearing it');
  });
});

test('blend refuses a mode that is not one', () => {
  withPanel((api) => {
    clearScriptTrace();
    assert.equal(api.drawBlend('sparkle'), false);
    assert.match(traced(), /not a blend mode/);
    assert.equal(api.drawBlend('multiply'), true);
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawn()[0].blend, 'multiply');
    // "normal" is the absence of a blend rather than a mode to carry.
    api.drawBlend('normal');
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawn()[1].blend, null);
  });
});

test('save and restore put the whole style back', () => {
  withPanel((api) => {
    api.drawStroke('#111', 1);
    api.drawSave();
    api.drawStroke('#E05C5C', 5, { dash: [2, 2], dashOffset: 3 });
    api.drawClip(0, 0, 10, 10);
    api.drawBlend('screen');
    api.drawRect(0, 0, 1, 1);
    api.drawRestore();
    api.drawRect(0, 0, 1, 1);

    const inner = drawn()[0];
    const outer = drawn()[1];
    assert.equal(inner.stroke, '#E05C5C');
    assert.equal(inner.strokeWidth, 5);
    assert.equal(inner.dash, '2 2');
    assert.equal(inner.dashOffset, 3);
    assert.equal(inner.blend, 'screen');
    assert.deepEqual(inner.clip, { x: 0, y: 0, w: 10, h: 10 });

    assert.equal(outer.stroke, '#111', 'restored');
    assert.equal(outer.strokeWidth, 1);
    assert.equal(outer.dash, null);
    assert.equal(outer.dashOffset, null);
    assert.equal(outer.blend, null);
    assert.equal(outer.clip, null);
  });
});

test('restore without save reports rather than resetting to defaults', () => {
  withPanel((api) => {
    clearScriptTrace();
    assert.equal(api.drawRestore(), false);
    assert.match(traced(), /nothing was saved/);
  });
});

test('dashOffset reaches the command, which is what makes a dash move', () => {
  withPanel((api) => {
    api.drawStroke('#fff', 1, { dash: [4, 4], dashOffset: 2 });
    api.drawLine(0, 0, 10, 0);
    assert.equal(drawn()[0].dashOffset, 2);
  });
});

/* ------------------------------------------------------------------ the cost */

test('a bulk verb is one notification, not one per segment', () => {
  withPanel((api) => {
    const gridN = notifications(() => api.drawGrid({ columns: 32, rows: 32 }));
    assert.equal(gridN, 1, 'a 32x32 grid must publish once');
    api.drawClear();
    const loopN = notifications(() => {
      for (let i = 0; i <= 32; i += 1) { api.drawLine(i, 0, i, 60); api.drawLine(0, i, 120, i); }
    });
    // The loop it replaces: 66 lines, 66 publishes. This is the difference the verb exists for.
    assert.ok(loopN > 60, `the hand loop should publish per line, got ${loopN}`);
  });
});

test('batch collapses a whole run into one notification', () => {
  withPanel((api) => {
    const plain = notifications(() => {
      for (let i = 0; i < 40; i += 1) api.drawLine(i, 0, i, 60);
    });
    api.drawClear();
    const batched = notifications(() => api.drawBatch(() => {
      for (let i = 0; i < 40; i += 1) api.drawLine(i, 0, i, 60);
    }));
    assert.equal(plain, 40);
    assert.equal(batched, 1, 'forty commands, one publish');
    // …and the commands themselves are all there: batch defers PUBLISHING, not recording.
    assert.equal(drawn().length, 40);
  });
});

test('a throwing batch still publishes and does not wedge later drawing', () => {
  withPanel((api) => {
    clearScriptTrace();
    api.drawBatch(() => {
      api.drawLine(0, 0, 1, 1);
      throw new Error('boom');
    });
    assert.match(traced(), /boom/);
    // The commands issued before the throw are published, and — the part that matters — publishing
    // is not left suspended. A wedged flush would make every later draw silently invisible.
    assert.equal(drawn().length, 1);
    const after = notifications(() => api.drawLine(2, 2, 3, 3));
    assert.equal(after, 1, 'publishing still works after a throwing batch');
  });
});

test('nested batches publish once, at the outermost end', () => {
  withPanel((api) => {
    const n = notifications(() => api.drawBatch(() => {
      api.drawLine(0, 0, 1, 1);
      api.drawBatch(() => { api.drawLine(1, 1, 2, 2); });
      // Still suspended here: an inner batch ending must not publish, or nesting would defeat itself.
      api.drawLine(2, 2, 3, 3);
    }));
    assert.equal(n, 1);
    assert.equal(drawn().length, 3);
  });
});

test('drawing n shapes stays linear in the number of shapes', () => {
  // The regression guard. The old code copied the whole command list per command, so the work grew
  // as n²: 64 segments took 2.5ms and 256 took 21ms — four times the shapes for eight times the
  // cost. Comparing RATIOS rather than absolute milliseconds keeps this meaningful on a slow CI box.
  withPanel((api) => {
    const timeFor = (n) => {
      api.drawClear();
      const t0 = process.hrtime.bigint();
      api.drawBatch(() => { for (let i = 0; i < n; i += 1) api.drawLine(i, 0, i, 60); });
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    timeFor(256);                       // warm the JIT, so the first measurement is not the slow one
    const small = Math.max(0.05, timeFor(256));
    const large = timeFor(1024);
    // Four times the shapes. Linear would be ~4x; the old quadratic path was ~16x. A ceiling of 8
    // catches the regression with room for a noisy machine.
    assert.ok(large / small < 8,
      `4x the shapes should not cost more than 8x the time — got ${(large / small).toFixed(1)}x `
      + `(${small.toFixed(2)}ms -> ${large.toFixed(2)}ms)`);
  });
});
