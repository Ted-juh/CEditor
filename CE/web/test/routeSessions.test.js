// routeSessions.test.js — the half of the route feature that did not exist.
//
// Everything else about routes was built and tested: the record, the curve, the fan-in rule, the
// cycle refusal, the Mapper's three views. What none of it did was MOVE anything. A cable drawn on
// the canvas was stored in the .cepanel, refused if it looped, warned about if two `set` routes
// fought over one target — and never evaluated, because the only function that would have evaluated
// it had no caller.
//
// So the tests that matter here are the dull ones. Does a knob move a fader.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUTE_MODE, makeRoute, routeEndpoint,
} from '../src/CE_Application/utils/routeModel.js';
import {
  applyPanelValueRoutes, deviceTargetedRoutes, readRouteEndpointValue, specForEndpoint,
} from '../src/CE_Application/utils/routeSessions.js';

const KNOB = routeEndpoint({ controlId: 'knob', port: 'value' });
const CUTOFF = routeEndpoint({ controlId: 'cutoff', port: 'value' });
const RES = routeEndpoint({ controlId: 'res', port: 'value' });

/** A control with a range Behavior, in the shape the model actually uses. */
function control(id, { min = 0, max = 1 } = {}) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'Knob' },
      Behavior: { family: 'range', role: 'knob', valueType: 'float', min, max },
    },
  };
}

function panelWith(routes, controls) {
  return { controls, routes };
}

/** A session holding a value, the way a drag leaves one. */
const held = (value) => ({ valueOverrideEnabled: true, valueOverride: value });

// --- the thing that did not happen ---------------------------------------------------------------

test('A KNOB MOVES A FADER — the whole feature, and it had no implementation', () => {
  const panel = panelWith(
    [makeRoute({ from: KNOB, to: CUTOFF, mode: ROUTE_MODE.set })],
    [control('knob'), control('cutoff', { min: 0, max: 127 })],
  );
  const next = applyPanelValueRoutes(panel, { knob: held(0.5) });

  assert.equal(next.cutoff.valueOverrideEnabled, true);
  assert.ok(Math.abs(next.cutoff.valueOverride - 63.5) < 1e-9,
    `half a knob should be half of 0..127, got ${next.cutoff.valueOverride}`);
});

test('a chain settles the whole way on one pass of the effect', () => {
  // `evaluateRoutes` reads every source once, so a single evaluation moves a chain one link and
  // leaves the far end reading a stale value. `settleRoutes` loops; this proves the loop is
  // reached through the session effect rather than only in the model's own tests.
  const panel = panelWith([
    makeRoute({ from: KNOB, to: CUTOFF, mode: ROUTE_MODE.set }),
    makeRoute({ from: CUTOFF, to: RES, mode: ROUTE_MODE.set }),
  ], [control('knob'), control('cutoff'), control('res')]);

  const next = applyPanelValueRoutes(panel, { knob: held(1) });
  assert.equal(next.cutoff.valueOverride, 1);
  assert.equal(next.res.valueOverride, 1, 'the far end moved on the same call');
});

test('two modulators sum onto the target rather than replacing each other', () => {
  // The default is `add` now, and this is what that buys: two sources nudging one parameter.
  const panel = panelWith([
    makeRoute({ from: KNOB, to: CUTOFF, depth: 0.25 }),
    makeRoute({ from: RES, to: CUTOFF, depth: 0.25 }),
  ], [control('knob'), control('res'), control('cutoff')]);

  const next = applyPanelValueRoutes(panel, { knob: held(1), res: held(1), cutoff: held(0) });
  assert.ok(Math.abs(next.cutoff.valueOverride - 0.5) < 1e-9,
    `two quarter-depth sources should sum to a half, got ${next.cutoff.valueOverride}`);
});

// --- the base an `add` route sums onto -----------------------------------------------------------
//
// The defect that only became reachable once routes were evaluated at all, and the reason this file
// is not just "call the function that existed".

test('a modulated target does not walk to its own ceiling', () => {
  // `add` sums onto the target's current value, which is right for ONE evaluation and compounds on
  // the second: pass one writes base + 0.25, pass two reads that back as the base and writes
  // base + 0.5. Settling made it happen within a single call; frames made it happen anyway.
  const panel = panelWith(
    [makeRoute({ from: KNOB, to: CUTOFF, depth: 0.25 })],
    [control('knob'), control('cutoff')],
  );

  let sessions = { knob: held(1), cutoff: held(0) };
  for (let frame = 0; frame < 5; frame += 1) sessions = applyPanelValueRoutes(panel, sessions);
  assert.ok(Math.abs(sessions.cutoff.valueOverride - 0.25) < 1e-9,
    `five frames should still read 0.25, got ${sessions.cutoff.valueOverride}`);
});

test('dragging a modulated fader sets its base, and the modulator rides on top', () => {
  // What a mod matrix row means, and it falls out of the invalidation rule rather than needing to
  // be told about the drag: the stored value no longer matches what is there, so what is there is
  // the new base.
  const panel = panelWith(
    [makeRoute({ from: KNOB, to: CUTOFF, depth: 0.25 })],
    [control('knob'), control('cutoff')],
  );

  let sessions = applyPanelValueRoutes(panel, { knob: held(1), cutoff: held(0) });
  assert.equal(sessions.cutoff.valueOverride, 0.25);

  // A foreign write — the user drags the fader to 0.5.
  sessions = applyPanelValueRoutes(panel, {
    ...sessions,
    cutoff: { ...sessions.cutoff, valueOverride: 0.5 },
  });
  assert.equal(sessions.cutoff.valueOverride, 0.75, 'the drag is the base, the modulation adds');

  // And it holds there rather than creeping.
  assert.equal(applyPanelValueRoutes(panel, sessions).cutoff.valueOverride, 0.75);

  // Turning the source down returns to the base the user set, not to zero.
  const quiet = applyPanelValueRoutes(panel, { ...sessions, knob: held(0) });
  assert.equal(quiet.cutoff.valueOverride, 0.5);
});

// --- what must NOT happen ------------------------------------------------------------------------

test('a settled panel is returned unchanged, so it does not re-render forever', () => {
  // This runs inside every session write. A target already holding its computed value must not be
  // written, or moving any control on the panel would dirty every routed control on every frame.
  const panel = panelWith(
    [makeRoute({ from: KNOB, to: CUTOFF, mode: ROUTE_MODE.set })],
    [control('knob'), control('cutoff')],
  );
  const settled = { knob: held(1), cutoff: held(1) };
  assert.equal(applyPanelValueRoutes(panel, settled), settled, 'the same object, not a copy');
});

test('a panel with no routes is not touched at all', () => {
  const sessions = { knob: held(0.5) };
  assert.equal(applyPanelValueRoutes(panelWith([], [control('knob')]), sessions), sessions);
  assert.equal(applyPanelValueRoutes(null, sessions), sessions);
});

test('a source nobody has touched does not fire', () => {
  // `undefined` rather than 0: a control with no session has not been set to zero, it has not been
  // set. Firing on it would move every routed target the moment a panel opened.
  const panel = panelWith(
    [makeRoute({ from: KNOB, to: CUTOFF, mode: ROUTE_MODE.set })],
    [control('knob'), control('cutoff')],
  );
  assert.deepEqual(applyPanelValueRoutes(panel, {}), {});
});

test('a ring in a hand-edited file costs eight passes rather than the frame', () => {
  // `addRoute` refuses to draw this. A file can still hold it, and now that routes are evaluated on
  // every session write, an unbounded walk would be a hang rather than a warning.
  const panel = panelWith([
    makeRoute({ from: KNOB, to: CUTOFF, mode: ROUTE_MODE.set, depth: 0.5 }),
    makeRoute({ from: CUTOFF, to: KNOB, mode: ROUTE_MODE.set, depth: 0.5 }),
  ], [control('knob'), control('cutoff')]);

  const next = applyPanelValueRoutes(panel, { knob: held(0.25), cutoff: held(0) });
  assert.ok(Number.isFinite(next.knob.valueOverride), 'it returned at all');
});

// --- the endpoint plumbing -----------------------------------------------------------------------

test('a named port reads and writes a value channel, not the control value', () => {
  const custom = {
    _children: {
      Core: { id: 'cc', name: 'cc', controlType: 'CustomComponent' },
      ValueChannels: { _children: { depth: { min: 0, max: 10 } } },
    },
  };
  const port = routeEndpoint({ controlId: 'cc', port: 'depth' });
  const panel = panelWith([makeRoute({ from: KNOB, to: port, mode: ROUTE_MODE.set })],
    [control('knob'), custom]);

  const next = applyPanelValueRoutes(panel, { knob: held(1) });
  assert.equal(next.cc.customValues.depth, 10, 'mapped into the channel\'s own range');
  assert.equal(next.cc.valueOverride, undefined, 'and not into the control value');

  assert.deepEqual(specForEndpoint(panel, port), { min: 0, max: 10, step: undefined, type: undefined });
  assert.equal(readRouteEndpointValue(next, port), 10);
});

test('a control inside a group is reachable', () => {
  // The lookup walks the tree. A route drawn to a control in a Group is a route to a control.
  const group = {
    _children: {
      Core: { id: 'g', name: 'Group', controlType: 'Group' },
      Children: { _children: { cutoff: control('cutoff', { min: 0, max: 127 }) } },
    },
  };
  const panel = panelWith([makeRoute({ from: KNOB, to: CUTOFF, mode: ROUTE_MODE.set })],
    [control('knob'), group]);

  const next = applyPanelValueRoutes(panel, { knob: held(1) });
  assert.equal(next.cutoff.valueOverride, 127);
});

// --- the limit, stated rather than hidden --------------------------------------------------------

test('a route to a device parameter is not sent, and is reported rather than left silent', () => {
  // This is a pure function of the sessions and sending MIDI is not that. A Macro slot bound to a
  // device already reaches the synth through the fan-out path, so those are excluded — warning
  // about something that works is how people learn to ignore warnings.
  const device = routeEndpoint({ kind: 'device', deviceRole: 'mainSynth', parameterId: 'cc74' });
  const hand = makeRoute({ id: 'hand', from: KNOB, to: device });
  const fromMacro = { ...makeRoute({ id: 'macro:m:0', from: KNOB, to: device }), origin: 'macro' };
  const disabled = { ...makeRoute({ id: 'off', from: KNOB, to: device }), enabled: false };

  assert.deepEqual(deviceTargetedRoutes([hand, fromMacro, disabled]).map((r) => r.id), ['hand']);

  // And it settles rather than burning every pass on a write that never lands.
  const panel = panelWith([hand], [control('knob')]);
  assert.deepEqual(applyPanelValueRoutes(panel, { knob: held(1) }), { knob: held(1) });
});
