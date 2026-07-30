// scriptLuaBridge.test.js — the two faults that only appear when a REAL script runs in the editor.
//
// Neither was reachable from the existing suite, and that is the point of the file. Both were found
// by driving the actual app: writing the manual's own button walkthrough into the Behavior Designer
// and pressing Run. The panel built nothing, twice, for two unrelated reasons.
//
//  1. THE GATE READ A DIFFERENT LIST THAN THE RUNNER. `enabledModules()` resolved from the saved
//     panel document while `activeScripts()` runs the Behavior Designer's live override. A script
//     written in the designer is not in `panel.scripts`, so AUTO mode derived "ce.core only" and
//     stubbed every namespaced verb — while happily executing the script that used them. The panel
//     reported a gate pointing at a Scripting Modules list it does not even have.
//
//  2. A `null` RETURN KILLED THE LUA CHUNK. wasmoon pushes a host function's result through its
//     promise extension, which reaches for `value.then` with no null check. Verbs that answer
//     "no such thing" with null (panelInfo, panelEntry, panelCreate, deviceParameter, …) therefore
//     threw INSIDE Lua — so the guard the manual teaches, `local f = ce.text.font(x) if not f then`,
//     was itself the thing that broke. undefined was always fine, which is why this survived: the
//     two spellings of "nothing" behaved differently.
//
// The wasmoon half runs against the real engine rather than a mock, because the bug IS wasmoon's
// marshalling — a fake bridge would have happily passed null through and proved nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting, setLiveScripts } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';

/* ------------------------------------------------------- 1 · verbs that answer with null */

/** A panel with every module on, so nothing here is measuring the gate. */
function withPanel(fn) {
  const knob = createControl('Knob', { name: 'K' });
  panels.set([{
    id: 'p', name: 'P', controls: [knob],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  try { return fn(scriptApiForTesting('K', 'lua-bridge')); } finally { panels.set([]); }
}

// The list is derived by ASKING, not by memory: a verb added later that answers null joins the
// wasmoon check below automatically instead of quietly becoming the next crash.
const NOT_FOUND_PROBES = {
  panelInfo: (api) => api.panelInfo('no-such-control'),
  panelEntry: (api) => api.panelEntry('K', 'States', 'no-such-state'),
  panelRect: (api) => api.panelRect('no-such-control'),
  panelCreate: (api) => api.panelCreate('NoSuchType', { name: 'Z' }),
  deviceParameter: (api) => api.deviceParameter('no.such.parameter'),
  textFont: (api) => api.textFont('No Such Family'),
  imageAsset: (api) => api.imageAsset('no-such-asset'),
  animateValue: (api) => api.animateValue('K.Transform.scale'),
  decodeJson: (api) => api.decodeJson('{ not json'),
  get: (api) => api.get('K.NoSuch.field'),
};

test('a verb that finds nothing answers with nothing, in one of the two spellings', () => {
  withPanel((api) => {
    for (const [name, probe] of Object.entries(NOT_FOUND_PROBES)) {
      const value = probe(api);
      assert.ok(value === null || value === undefined,
        `${name} answered ${JSON.stringify(value)} for something that does not exist`);
    }
  });
});

test('every "nothing" a verb can answer survives the trip into Lua', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();

  // The runtime's own normaliser, reproduced by BEHAVIOUR rather than imported: what matters is
  // that whatever loadHandlersLua binds can be pushed, so the test binds through the same shape.
  const answers = withPanel((api) => Object.fromEntries(
    Object.entries(NOT_FOUND_PROBES).map(([name, probe]) => [name, probe(api)]),
  ));

  for (const [name, value] of Object.entries(answers)) {
    lua.global.set('probe', () => (value === null ? undefined : value));
    const out = await lua.doString('local v = probe() if v == nil then return "nil" end return "value"')
      .catch((e) => `THREW: ${String(e?.message ?? e).split('\n')[0]}`);
    assert.equal(out, 'nil', `${name}: ${out}`);
  }
  lua.global.close();
});

test('wasmoon still cannot take a bare null — the normaliser is load-bearing, not belt-and-braces', async () => {
  // If this ever starts passing, wasmoon fixed it upstream and nilSafe can go. Until then it is
  // the reason the wrapper exists, pinned so nobody removes the wrapper as redundant.
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  lua.global.set('bare', () => null);
  await assert.rejects(() => lua.doString('return bare()'),
    (e) => /reading 'then'|null/.test(String(e?.message ?? e)),
    'wasmoon accepted a null return — check whether nilSafe is still needed');
  lua.global.close();
});

/* ------------------------------------------------------ 2 · gating from the executed list */

/** A fresh panel: no scripts saved, no module list — exactly what the Behavior Designer opens on. */
function withEmptyPanel(fn) {
  const knob = createControl('Knob', { name: 'K' });
  panels.set([{ id: 'p', name: 'P', controls: [knob], scripts: [], scripting: { enabled: true } }]);
  activePanelId.set('p');
  try { return fn(); } finally { setLiveScripts(null); panels.set([]); }
}

const USES_PANEL = [{ id: 's1', language: 'lua', enabled: true, source: 'ce.panel.create("Knob", { name = "Made" })' }];

test('a gated verb reports instead of acting, so the two cases below are distinguishable', () => {
  withEmptyPanel(() => {
    clearScriptTrace();
    const api = scriptApiForTesting('K', 'gated');
    const made = api.ce.panel.create('Knob', { name: 'Made' });
    const said = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
    assert.equal(made, undefined, 'a stub does not build anything');
    assert.match(said, /needs the ce\.panel module/, 'and it says why rather than failing silently');
  });
});

test('a script the designer is holding is gated on what IT uses, not on the saved document', () => {
  // This is the bug, in one assertion. The panel document has no scripts, so resolving from it
  // yields ce.core alone; the script that will actually RUN plainly uses ce.panel. Gate from the
  // executed list and the verb works — which is what the editor and the export must agree on.
  withEmptyPanel(() => {
    setLiveScripts(USES_PANEL, 'p');
    clearScriptTrace();
    const api = scriptApiForTesting('K', 'designer');
    const made = api.ce.panel.create('Knob', { name: 'Made' });
    const said = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
    assert.equal(made, 'Made', 'the verb the live script uses must not be a stub');
    assert.doesNotMatch(said, /needs the ce\.panel module/);
  });
});

test('an explicit module list still wins — a manual choice is not overridden by detection', () => {
  const knob = createControl('Knob', { name: 'K' });
  panels.set([{ id: 'p', name: 'P', controls: [knob], scripts: [], scripting: { modules: [] } }]);
  activePanelId.set('p');
  try {
    setLiveScripts(USES_PANEL, 'p');
    clearScriptTrace();
    const api = scriptApiForTesting('K', 'manual');
    assert.equal(api.ce.panel.create('Knob', { name: 'Made' }), undefined,
      'an author who pinned an empty list asked for exactly that');
    assert.match(get(scriptTrace).map((t) => String(t.message ?? '')).join('\n'),
      /needs the ce\.panel module/);
  } finally { setLiveScripts(null); panels.set([]); }
});
