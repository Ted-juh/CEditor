// routeModel.test.js — one route model, and the two decisions the design note left open.
//
// The note asked where routes should live and said "ideally one model, three editors". This pins
// the answer: the panel holds its own, and the Macro's slots and Router's destinations are READ as
// routes rather than copied. If that ever stops being true, a cable drawn on the node-graph canvas
// goes invisible in the Mapper and nobody notices until both are shipped.
//
// The other decision — how several routes into one target combine — is the one that makes a
// modulation matrix behave like one or not, and it is pinned hardest.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUTE_CURVE, ROUTE_MODE, applyCurve, describeRoute, endpointAddress, evaluateRoute,
  evaluateRoutes, makeRoute, normalizeRoute, routeCycles, routeEndpoint, wouldCycle,
} from '../src/CE_Application/utils/routeModel.js';
import {
  macroRoutes, ownRoutes, panelRoutes, routeWriteTarget, routerRoutes,
} from '../src/CE_Application/utils/routeAdapters.js';
import { createPanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const KNOB = routeEndpoint({ controlId: 'knob', port: 'value' });
const CUTOFF = routeEndpoint({ controlId: 'cutoff', port: 'value' });
const RES = routeEndpoint({ controlId: 'res', port: 'value' });

const UNIT = { min: 0, max: 1 };

// --- the record ---------------------------------------------------------------------------------

test('an endpoint address distinguishes a control port from a device parameter', () => {
  assert.equal(endpointAddress(KNOB), 'control:knob:value');
  assert.equal(
    endpointAddress(routeEndpoint({ kind: 'device', deviceRole: 'main', parameterId: 'p1' })),
    'device:main:p1',
  );
  assert.equal(endpointAddress(null), '');
});

test('a route defaults every field, and an unknown field is not smuggled in', () => {
  const route = makeRoute({ from: KNOB, to: CUTOFF, nonsense: 7 });
  assert.equal(route.enabled, true);
  assert.equal(route.depth, 1);
  assert.equal(route.curve, ROUTE_CURVE.linear);
  assert.equal(route.mode, ROUTE_MODE.set);
  assert.equal(route.nonsense, undefined);
  assert.equal(route.id, 'control:knob:value>control:cutoff:value');
});

test('a curve starts at 0, ends at 1 and actually reaches both', () => {
  // Exponent 2 rather than a true exponential on purpose: a real exp never reaches its ends, so the
  // top of a sweep would never quite arrive at the target's maximum — a knob that will not reach
  // its own top is a bug report.
  for (const curve of Object.values(ROUTE_CURVE)) {
    assert.equal(applyCurve(0, curve), 0, curve);
    assert.equal(applyCurve(1, curve), 1, curve);
  }
  assert.ok(applyCurve(0.5, ROUTE_CURVE.exp) < 0.5, 'exp is slow at first');
  assert.ok(applyCurve(0.5, ROUTE_CURVE.log) > 0.5, 'log is fast at first');
  assert.equal(applyCurve(0.5, ROUTE_CURVE.s), 0.5, 's is symmetric about the middle');
});

// --- one route ----------------------------------------------------------------------------------

test('a plain route maps the source range onto the target range', () => {
  const route = makeRoute({ from: KNOB, to: CUTOFF });
  const specs = { sourceSpec: { min: 0, max: 127 }, targetSpec: { min: 0, max: 1 } };
  assert.equal(evaluateRoute(route, 0, specs).value, 0);
  assert.equal(evaluateRoute(route, 127, specs).value, 1);
  assert.ok(Math.abs(evaluateRoute(route, 63.5, specs).value - 0.5) < 1e-9);
});

test('a negative depth inverts, which is what the note called positive-negative alterations', () => {
  const route = makeRoute({ from: KNOB, to: CUTOFF, depth: -1, outputMin: 0, outputMax: 1 });
  assert.equal(evaluateRoute(route, 0, { sourceSpec: UNIT }).value, 0);
  assert.equal(evaluateRoute(route, 1, { sourceSpec: UNIT }).value, -1);
});

test('an inverted input window reverses the source, and is not an error', () => {
  // Somebody sets this deliberately; a validator that "fixed" it would break the feature.
  const route = makeRoute({ from: KNOB, to: CUTOFF, inputMin: 127, inputMax: 0, outputMin: 0, outputMax: 1 });
  assert.equal(evaluateRoute(route, 0).value, 1);
  assert.equal(evaluateRoute(route, 127).value, 0);
});

test('an offset shifts the result in target units, after the depth', () => {
  const route = makeRoute({ from: KNOB, to: CUTOFF, depth: 0.5, offset: 0.25, outputMin: 0, outputMax: 1 });
  assert.equal(evaluateRoute(route, 1, { sourceSpec: UNIT }).value, 0.75);
});

test('a route with nothing to say returns null, not zero', () => {
  // A caller at a fan-in target has to tell "contributes zero" from "does not contribute".
  assert.equal(evaluateRoute(makeRoute({ from: KNOB, to: CUTOFF, enabled: false }), 1), null);
  assert.equal(evaluateRoute(makeRoute({ from: KNOB, to: CUTOFF }), undefined), null);
  assert.equal(evaluateRoute(makeRoute({ from: KNOB, to: CUTOFF }), 'nope'), null);
  assert.equal(evaluateRoute(makeRoute({ from: KNOB, to: CUTOFF, inputMin: 5, inputMax: 5 }), 5), null);
  assert.equal(evaluateRoute(makeRoute({ from: KNOB, to: CUTOFF }), true, { sourceSpec: UNIT }).value, 1,
    'a boolean source is 0 or 1, which is a reading and not an absence');
});

test('a source outside the input window clamps rather than running off the end', () => {
  const route = makeRoute({ from: KNOB, to: CUTOFF, inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1 });
  assert.equal(evaluateRoute(route, 5).value, 1);
  assert.equal(evaluateRoute(route, -5).value, 0);
});

// --- fan-in, the decision the note glossed ---------------------------------------------------------

test('two add routes SUM as offsets, they do not each slam the target', () => {
  // The whole reason ROUTE_MODE exists. Summing absolute values would mean two modulators each
  // nudging a parameter would together push it to the top of its range.
  const routes = [
    makeRoute({ from: KNOB, to: CUTOFF, mode: 'add', depth: 0.25, outputMin: 0, outputMax: 1 }),
    makeRoute({ from: RES, to: CUTOFF, mode: 'add', depth: 0.25, outputMin: 0, outputMax: 1 }),
  ];
  const values = { 'control:knob:value': 1, 'control:res:value': 1, 'control:cutoff:value': 0.4 };
  const out = evaluateRoutes(routes, {
    readSource: (e) => values[endpointAddress(e)],
    readTarget: (e) => values[endpointAddress(e)],
    specFor: () => UNIT,
  });
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].value - 0.9) < 1e-9, `0.4 base + 0.25 + 0.25, got ${out[0].value}`);
  assert.equal(out[0].routes, 2);
});

test('a set route replaces the base and add routes then sum on top of it', () => {
  // A macro that sets a parameter plus a mod wheel that nudges it is the normal case, and the nudge
  // belongs on top of the macro rather than underneath it.
  const routes = [
    makeRoute({ from: RES, to: CUTOFF, mode: 'add', depth: 0.1, outputMin: 0, outputMax: 1 }),
    makeRoute({ from: KNOB, to: CUTOFF, mode: 'set', outputMin: 0, outputMax: 1 }),
  ];
  const values = { 'control:knob:value': 0.5, 'control:res:value': 1, 'control:cutoff:value': 0.9 };
  const out = evaluateRoutes(routes, {
    readSource: (e) => values[endpointAddress(e)],
    readTarget: (e) => values[endpointAddress(e)],
    specFor: () => UNIT,
  });
  assert.ok(Math.abs(out[0].value - 0.6) < 1e-9, `set 0.5 then +0.1, got ${out[0].value}`);
});

test('a summed result is clamped into the target range', () => {
  const routes = [
    makeRoute({ from: KNOB, to: CUTOFF, mode: 'add', depth: 1, outputMin: 0, outputMax: 1 }),
    makeRoute({ from: RES, to: CUTOFF, mode: 'add', depth: 1, outputMin: 0, outputMax: 1 }),
  ];
  const values = { 'control:knob:value': 1, 'control:res:value': 1, 'control:cutoff:value': 0.5 };
  const out = evaluateRoutes(routes, {
    readSource: (e) => values[endpointAddress(e)],
    readTarget: (e) => values[endpointAddress(e)],
    specFor: () => UNIT,
  });
  assert.equal(out[0].value, 1);
});

test('one source fans out to three targets', () => {
  const routes = ['a', 'b', 'c'].map((id) =>
    makeRoute({ from: KNOB, to: routeEndpoint({ controlId: id, port: 'value' }), outputMin: 0, outputMax: 1 }));
  const out = evaluateRoutes(routes, {
    readSource: () => 1,
    specFor: () => UNIT,
  });
  assert.equal(out.length, 3);
  assert.ok(out.every((entry) => entry.value === 1));
});

// --- cycles, which the note did not mention -------------------------------------------------------

test('a two-node loop is found', () => {
  // Not in the design note, and the thing that would have taken the feature down: a canvas makes
  // this trivially easy to draw and the runtime would chase it forever.
  const cycles = routeCycles([
    makeRoute({ from: KNOB, to: CUTOFF }),
    makeRoute({ from: CUTOFF, to: KNOB }),
  ]);
  assert.equal(cycles.length, 1);
  assert.ok(cycles[0].includes('control:knob:value'));
  assert.ok(cycles[0].includes('control:cutoff:value'));
});

test('a longer ring is found, and reported from where it closes', () => {
  // Reporting the walk's prefix would send somebody to a wire that is not part of the loop.
  const d = routeEndpoint({ controlId: 'd', port: 'value' });
  const cycles = routeCycles([
    makeRoute({ from: KNOB, to: CUTOFF }),
    makeRoute({ from: CUTOFF, to: RES }),
    makeRoute({ from: RES, to: d }),
    makeRoute({ from: d, to: CUTOFF }),
  ]);
  assert.equal(cycles.length, 1);
  assert.ok(!cycles[0].includes('control:knob:value'), 'the knob feeds the ring but is not in it');
});

test('a fan-out that reconverges is not a cycle', () => {
  // The obvious false positive: a naive "have I seen this node" check calls a diamond a loop.
  assert.deepEqual(routeCycles([
    makeRoute({ from: KNOB, to: CUTOFF }),
    makeRoute({ from: KNOB, to: RES }),
    makeRoute({ from: CUTOFF, to: routeEndpoint({ controlId: 'out', port: 'value' }) }),
    makeRoute({ from: RES, to: routeEndpoint({ controlId: 'out', port: 'value' }) }),
  ]), []);
});

test('a disabled route cannot close a loop', () => {
  assert.deepEqual(routeCycles([
    makeRoute({ from: KNOB, to: CUTOFF }),
    makeRoute({ from: CUTOFF, to: KNOB, enabled: false }),
  ]), []);
});

test('an editor can ask before it draws the cable', () => {
  const existing = [makeRoute({ from: KNOB, to: CUTOFF })];
  assert.equal(wouldCycle(existing, makeRoute({ from: CUTOFF, to: KNOB })), true);
  assert.equal(wouldCycle(existing, makeRoute({ from: CUTOFF, to: RES })), false);
  assert.equal(wouldCycle([], makeRoute({ from: KNOB, to: KNOB })), true, 'a self-route is a loop');
});

// --- the adapters, which are what makes "one model" true ------------------------------------------

function macroControl() {
  return {
    _children: {
      Core: { id: 'm1', name: 'Macro 1', controlType: 'Macro' },
      Macro: {
        _type: 'Macro',
        slots: [
          { id: 's0', label: 'Cutoff', depth: 1, curve: 'exp', min: 0, max: 1, enabled: true },
          { id: 's1', label: 'Reverb', depth: -0.5, curve: 'linear', min: 0, max: 1, enabled: false },
        ],
      },
      DeviceBindings: {
        bindings: [{ port: 'slot_0', kind: 'deviceParameter', parameterId: 'filter.cutoff', deviceRole: 'main' }],
      },
    },
  };
}

test('a Macro slot IS a route, read rather than copied', () => {
  // The design note's open question, answered. A new store would have left a Macro's assignments
  // invisible to the node-graph, which is the exact failure the question was about.
  const routes = macroRoutes(macroControl());
  assert.equal(routes.length, 2);
  assert.equal(endpointAddress(routes[0].from), 'control:m1:value');
  assert.equal(endpointAddress(routes[0].to), 'device:main:filter.cutoff', 'a bound slot targets the parameter');
  assert.equal(routes[0].curve, ROUTE_CURVE.exp);
  assert.equal(routes[0].mode, ROUTE_MODE.set, 'a macro drives, it does not modulate');
  assert.equal(routes[1].enabled, false);
  assert.equal(routes[1].depth, -0.5);
});

test('an unbound slot becomes a route to nowhere rather than disappearing', () => {
  // The author added the lane and has not chosen a destination — a real state, and one an editor
  // should be able to show as incomplete.
  const routes = macroRoutes(macroControl());
  assert.equal(routes[1].bound, false);
  assert.equal(endpointAddress(routes[1].to), 'control:m1:slot_1');
  assert.equal(routes[0].bound, true);
});

test("a Router's transfer curve is declared, not flattened into a curve name", () => {
  // Its curve is a breakpoint list with per-segment shapes; calling it "exp" would be a lie the
  // canvas then draws confidently.
  const control = {
    _children: {
      Core: { id: 'r1', name: 'Router', controlType: 'Router' },
      Router: { _type: 'Router', destinations: [{ id: 'd0', label: 'Depth', depth: 0.6, min: 0, max: 1 }] },
    },
  };
  const routes = routerRoutes(control);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].curve, ROUTE_CURVE.linear);
  assert.equal(routes[0].shapedBySource, true);
});

test('the panel lists its own routes and the derived ones together', () => {
  const panel = {
    routes: [makeRoute({ from: KNOB, to: CUTOFF })],
    controls: [macroControl()],
  };
  const all = panelRoutes(panel);
  assert.equal(all.length, 3);
  assert.equal(all[0].origin, 'panel', 'the panel\'s own come first — a set route is a base');
  assert.equal(all[1].origin, 'macro');
  assert.deepEqual(ownRoutes(panel).map((r) => r.origin), ['panel']);
});

test('an editor is told where a derived route really lives', () => {
  // Writing a panel copy of a Macro slot would leave the two out of step and the next read would
  // discard the edit silently.
  const [macroRoute] = macroRoutes(macroControl());
  assert.deepEqual(routeWriteTarget(macroRoute), {
    kind: 'macro', controlId: 'm1', index: 0, section: 'Macro', field: 'slots',
  });
  assert.deepEqual(routeWriteTarget(makeRoute({ from: KNOB, to: CUTOFF })), { kind: 'panel' });
});

test('a new panel carries an empty route list, and an empty one is not written out', () => {
  // An empty array on every panel would be noise in every committed fixture, and a reader would
  // then have to tell "no routes" from "an empty list".
  const panel = createPanel('Routes');
  assert.deepEqual(panel.routes, []);
  assert.equal(Object.hasOwn(JSON.parse(serializePanel(panel)), 'routes'), false);

  panel.routes = [makeRoute({ from: KNOB, to: CUTOFF })];
  assert.equal(JSON.parse(serializePanel(panel)).routes.length, 1);
});

test('a route describes itself the same way wherever it is shown', () => {
  const text = describeRoute(
    makeRoute({ from: KNOB, to: CUTOFF, mode: 'add', depth: -0.5, offset: 3, curve: 'exp' }),
    { sourceLabel: 'Mod wheel', targetLabel: 'Cutoff' },
  );
  assert.match(text, /Mod wheel modulates Cutoff/);
  assert.match(text, /inverted/);
  assert.match(text, /offset \+3/);
  assert.match(text, /exp curve/);
});

test('a normalised route survives a round trip through a panel file', () => {
  const route = makeRoute({ from: KNOB, to: CUTOFF, depth: 0.75, curve: 's' });
  const reloaded = normalizeRoute(JSON.parse(JSON.stringify(route)));
  assert.deepEqual(reloaded, route);
});
