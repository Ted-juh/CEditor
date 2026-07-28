// scriptTeardown.test.js — onPanelDestroy: the scripts themselves going away (design doc §17).
//
// The whole value of this hook is the distinction it draws, so that is what this file guards:
//
//   onPanelClose   the VIEW went away. Preview stopped, the plugin window was shut. The scripts
//                  keep running — a plugin with its window closed is still playing.
//   onPanelDestroy the SCRIPTS went away. Panel switched, plugin unloaded, app closing. Last
//                  thing that runs, and everything still works while it runs.
//
// CE/tests/ScriptRuntimeTests.cpp §22 pins the identical behaviour window-closed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  setRuntimeHost, runScript, destroyLoadedScripts,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  LIFECYCLE_HOOKS, handlerNamesForRuntime, RUNTIME_PLAYER, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';

const panel = { id: 'p', name: 'Teardown', width: 400, height: 300, controls: [] };
const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

function script(id, source, { event = 'onPanelDestroy', language = 'javascript' } = {}) {
  return { id, name: id, language, event, target: '*', source, enabled: true };
}

/**
 * Load `scripts` into the runtime's handler cache, then hand control to `fn`.
 *
 * ▶ Run is what loads them — the cache is the loaded set, and the cache is what teardown tells.
 * `hook` is a name none of them define, so loading does not also run the teardown being tested.
 */
async function loaded(scripts, fn) {
  setRuntimeHost({ panel, scripts });
  try {
    for (const s of scripts) await runScript(s, 'onWarmUp');
    clearScriptTrace();
    return await fn();
  } finally {
    destroyLoadedScripts();   // never leave a loaded set behind for the next test
    setRuntimeHost(null);
  }
}

/* ------------------------------------------------------------------ the contract itself */

test('onPanelDestroy is declared, and declared for BOTH runtimes', () => {
  // A plugin unloading in a DAW is the case this hook exists for, and the window is shut then.
  const hook = LIFECYCLE_HOOKS.find((h) => h.id === 'onPanelDestroy');
  assert.ok(hook, 'onPanelDestroy should be a declared lifecycle hook');
  assert.ok(handlerNamesForRuntime(RUNTIME_WEBVIEW).includes('onPanelDestroy'));
  assert.ok(handlerNamesForRuntime(RUNTIME_PLAYER).includes('onPanelDestroy'));
});

test('onPanelClose and onPanelDestroy are separate hooks with separate summaries', () => {
  // If these two ever collapse into each other the hook stops being worth having.
  const close = LIFECYCLE_HOOKS.find((h) => h.id === 'onPanelClose');
  const destroy = LIFECYCLE_HOOKS.find((h) => h.id === 'onPanelDestroy');
  assert.notEqual(close.summary, destroy.summary);
  assert.match(close.summary, /onPanelDestroy/, 'onPanelClose should point at the other one');
});

/* ----------------------------------------------------------------------------- dispatch */

test('a handler that declares onPanelDestroy is told when the set goes away', async () => {
  const bye = script('bye', 'function onPanelDestroy() { log("BYE"); }');
  await loaded([bye], () => {
    destroyLoadedScripts();
    assert.match(traced(), /BYE/);
  });
});

test('a set is destroyed exactly once — a second teardown says nothing', async () => {
  const bye = script('bye', 'function onPanelDestroy() { log("BYE"); }');
  await loaded([bye], () => {
    destroyLoadedScripts();
    clearScriptTrace();
    destroyLoadedScripts();
    assert.doesNotMatch(traced(), /BYE/);
  });
});

test('every script that declares it is told, not just the first', async () => {
  const a = script('a', 'function onPanelDestroy() { log("A GONE"); }');
  const b = script('b', 'function onPanelDestroy() { log("B GONE"); }');
  await loaded([a, b], () => {
    destroyLoadedScripts();
    assert.match(traced(), /A GONE/);
    assert.match(traced(), /B GONE/);
  });
});

test('a script that declares a different event is not called', async () => {
  // Dispatch is by DECLARED event, the way every other lifecycle hook works. A script that happens
  // to define an onPanelDestroy function while listening for something else is not a teardown hook.
  const other = { ...script('other', 'function onPanelDestroy() { log("WRONG"); }'), event: 'onValueChanged' };
  await loaded([other], () => {
    destroyLoadedScripts();
    assert.doesNotMatch(traced(), /WRONG/);
  });
});

test('a disabled script is not told', async () => {
  const off = { ...script('off', 'function onPanelDestroy() { log("OFF"); }'), enabled: false };
  await loaded([off], () => {
    destroyLoadedScripts();
    assert.doesNotMatch(traced(), /OFF/);
  });
});

test('a set that never loaded anything raises nothing', () => {
  clearScriptTrace();
  destroyLoadedScripts();
  assert.equal(traced().trim(), '');
});

/* --------------------------------------------------------------------- failure behaviour */

test('a throw in teardown is reported and the rest of the set is still told', async () => {
  // A failing teardown handler must not be able to keep the old script set alive.
  const boom = script('boom', 'function onPanelDestroy() { throw new Error("teardown blew up"); }');
  const bye = script('bye', 'function onPanelDestroy() { log("BYE"); }');
  await loaded([boom, bye], () => {
    destroyLoadedScripts();
    assert.match(traced(), /teardown blew up/);
    assert.match(traced(), /BYE/);
    clearScriptTrace();
    destroyLoadedScripts();
    assert.doesNotMatch(traced(), /BYE/, 'the set is still destroyed, not left half-alive');
  });
});

/* ------------------------------------------------------------- the API is still usable */

test('the API still works inside the teardown — this runs before anything is torn down', async () => {
  // The hook is worthless if `state`, timers and the host are already gone by the time it runs.
  const bye = script('bye',
    'function onPanelDestroy() { state.seen = 1; log("API " + (typeof set) + "," + (typeof sendCC) + "," + (typeof state)); }');
  await loaded([bye], () => {
    destroyLoadedScripts();
    assert.match(traced(), /API function,function,object/);
  });
});
