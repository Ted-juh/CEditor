// reactiveCore.test.js — watch / compute / intercept / defineAction.
//
// These four are the answer to "what can a script do that setting a property cannot". A properties
// panel stores a CONSTANT, decided once at design time. Each of these stores a RULE the runtime
// keeps applying — a value that follows other values, a filter every write passes through, an
// observer over the whole model rather than the eleven events somebody enumerated in advance, and
// a named action the panel can be built out of.
//
// They are tested through the real runtime rather than through their registries, because the
// interesting behaviour is all in the settle pass: what order things run in, what happens when two
// formulas feed each other, and whether a rule survives its script being reloaded.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';

async function valueIo() {
  const { valueAtPath } = await import('../src/CE_Application/stores/controlTreeUtils.js');
  return {
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => {
      const segs = String(path).split('.').filter(Boolean);
      let node = control;
      for (let i = 0; i < segs.length - 1; i++) {
        node = node?._children?.[segs[i]] ?? node?.[segs[i]];
        if (!node) return false;
      }
      const last = segs[segs.length - 1];
      if (node?._children && last in node._children) { node._children[last] = value; return true; }
      node[last] = value;
      return true;
    },
  };
}

const named = (type, name) => {
  const c = createControl(type, 10, 10);
  c._children.Core.name = name;
  return c;
};

/** A panel with the given controls, every module on, and the runtime pointed at it. */
async function withPanel(controls, body) {
  const rt = await import('../src/CE_Application/scripting/panelRuntime.js');
  const panel = { id: 'p', name: 'Reactive', width: 800, height: 400, controls };
  // Rules deliberately outlive any single set() — so without this, one test's filters and formulas
  // are still running during the next one, which is how test 10 first "failed".
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost({ panel, scripts: [], ...(await valueIo()) });
  try { return await body(rt.scriptApiForTesting('', 'rules'), rt, panel); }
  finally { rt.setRuntimeHost(null); }
}

/* --------------------------------------------------------------------------- compute */

test('compute makes a property a formula, not a constant', async () => {
  const cutoff = named('Button', 'cutoff');
  const label = named('Label', 'readout');
  await withPanel([cutoff, label], (api, rt) => {
    api.compute('readout.Text.content', () => `cutoff ${api.get('cutoff.value')}`);

    api.set('cutoff.value', 42);
    rt.runReactiveForTesting();
    assert.equal(label._children.Text.content, 'cutoff 42');

    // The panel could hold "cutoff 42". It could never hold "follow whatever cutoff says".
    api.set('cutoff.value', 7);
    rt.runReactiveForTesting();
    assert.equal(label._children.Text.content, 'cutoff 7');
  });
});

test('compute settles a chain in one pass rather than one link per event', async () => {
  const a = named('Button', 'a');
  const b = named('Button', 'b');
  const c = named('Button', 'c');
  await withPanel([a, b, c], (api, rt) => {
    api.compute('b.value', () => Number(api.get('a.value')) * 2);
    api.compute('c.value', () => Number(api.get('b.value')) + 1);
    api.set('a.value', 5);
    rt.runReactiveForTesting();
    assert.equal(b._children.Value.value, 10);
    assert.equal(c._children.Value.value, 11, 'c saw the settled b, not the previous one');
  });
});

test('two formulas feeding each other are cut off and reported, not looped on', async () => {
  const a = named('Button', 'a');
  const b = named('Button', 'b');
  await withPanel([a, b], async (api, rt) => {
    const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
    const { get } = await import('svelte/store');
    clearScriptTrace();
    // Seeded with real numbers on purpose. Starting from nothing, `Number(undefined) + 1` is NaN,
    // and NaN compares equal to NaN by signature — so the pair would settle on the first pass and
    // the runaway this test is about would never happen.
    api.set('a.value', 1);
    api.set('b.value', 1);
    api.compute('a.value', () => Number(api.get('b.value')) + 1);
    api.compute('b.value', () => Number(api.get('a.value')) + 1);
    rt.runReactiveForTesting();     // must return, not hang
    const traced = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
    assert.match(traced, /still changing after \d+ passes/, `got:\n${traced}`);
  });
});

/* ------------------------------------------------------------------------- intercept */

test('intercept rewrites a value on its way into the model', async () => {
  const cutoff = named('Button', 'cutoff');
  await withPanel([cutoff], (api) => {
    api.intercept('cutoff.value', (v) => Math.round(Number(v) / 10) * 10);   // snap to 10s
    api.set('cutoff.value', 47);
    assert.equal(cutoff._children.Value.value, 50, 'the rule holds for every write, not per call site');
    api.set('cutoff.value', 12);
    assert.equal(cutoff._children.Value.value, 10);
  });
});

test('returning false rejects the write outright', async () => {
  const cutoff = named('Button', 'cutoff');
  await withPanel([cutoff], (api) => {
    api.set('cutoff.value', 30);
    api.intercept('cutoff.value', (v) => (Number(v) > 100 ? false : undefined));
    api.set('cutoff.value', 999);
    assert.equal(cutoff._children.Value.value, 30, 'the model never saw it');
    api.set('cutoff.value', 60);
    assert.equal(cutoff._children.Value.value, 60, 'and a value it accepts still lands');
  });
});

test('an interceptor that writes to its own path does not re-enter itself', async () => {
  const cutoff = named('Button', 'cutoff');
  await withPanel([cutoff], (api) => {
    api.intercept('cutoff.value', (v) => { api.set('cutoff.value', 1); return Number(v) + 1; });
    api.set('cutoff.value', 5);      // must return rather than recurse
    assert.ok(Number.isFinite(cutoff._children.Value.value));
  });
});

test('a change that did NOT come through set() is corrected by the settle pass', async () => {
  // The main case: the user drags the knob. That write never touches the script write path, so a
  // filter applied only there would be a rule that holds for scripts and not for people.
  const cutoff = named('Button', 'cutoff');
  await withPanel([cutoff], (api, rt) => {
    api.intercept('cutoff.value', (v) => Math.round(Number(v) / 10) * 10);
    cutoff._children.Value.value = 47;          // straight into the model, as a drag would
    rt.runReactiveForTesting();
    assert.equal(cutoff._children.Value.value, 50);
  });
});

test('the two spellings of one path are the same rule', async () => {
  // set("cutoff.value") and set("cutoff.Value.value") address one field. A rule keyed on the text
  // as typed would depend on which shorthand the other script happened to use.
  const cutoff = named('Button', 'cutoff');
  await withPanel([cutoff], (api) => {
    api.intercept('cutoff.Value.value', () => 3);
    api.set('cutoff.value', 99);
    assert.equal(cutoff._children.Value.value, 3);
  });
});

/* ----------------------------------------------------------------------------- watch */

test('watch fires for a nested field that raises no control event at all', async () => {
  // onValueChange covers a control's value. Nothing covered its background colour — and the
  // eleven declared events are a list somebody wrote down in advance, not the model.
  const knob = named('Button', 'cutoff');
  await withPanel([knob], (api, rt) => {
    const seen = [];
    api.watch('cutoff.Background.Fill.colour', (v, prev) => seen.push([v, prev]));
    rt.runReactiveForTesting();
    assert.deepEqual(seen, [], 'registering is not a change — it reports movement, not existence');

    api.set('cutoff.Background.Fill.colour', '#ff0000');
    rt.runReactiveForTesting();
    assert.equal(seen.length, 1);
    assert.equal(seen[0][0], '#ff0000');
  });
});

test('watch reports the previous value alongside the new one', async () => {
  const knob = named('Button', 'cutoff');
  await withPanel([knob], (api, rt) => {
    const seen = [];
    api.set('cutoff.value', 1);
    api.watch('cutoff.value', (v, prev) => seen.push([v, prev]));
    api.set('cutoff.value', 2);
    rt.runReactiveForTesting();
    api.set('cutoff.value', 3);
    rt.runReactiveForTesting();
    assert.deepEqual(seen, [[2, undefined], [3, 2]]);
  });
});

/* ---------------------------------------------------------------------- defineAction */

test('defineAction registers a verb run() can call', async () => {
  await withPanel([named('Button', 'cutoff')], (api) => {
    let called = null;
    api.defineAction('initPatch', (args) => { called = args; return 'done'; });
    assert.equal(api.run('initPatch', { from: 'test' }), 'done', 'and its return value crosses back');
    assert.deepEqual(called, { from: 'test' });
  });
});

test('a registered action is listed, so the panel can be built out of it', async () => {
  await withPanel([named('Button', 'cutoff')], (api, rt) => {
    api.defineAction('initPatch', () => {});
    api.defineAction('randomise', () => {});
    assert.deepEqual(rt.registeredActions().sort(), ['initPatch', 'randomise']);
  });
});

test('an unknown action names what IS registered rather than only what is not', async () => {
  await withPanel([named('Button', 'cutoff')], async (api) => {
    const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
    const { get } = await import('svelte/store');
    api.defineAction('initPatch', () => {});
    clearScriptTrace();
    api.run('initPtch');
    const traced = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
    assert.match(traced, /Registered actions: initPatch/, `got:\n${traced}`);
  });
});
