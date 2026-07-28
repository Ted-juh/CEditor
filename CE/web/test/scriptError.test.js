// scriptError.test.js — onError: a panel reporting its own failures (design doc §6 phase 4).
//
// The hook is CROSS-RUNTIME — the same guarantees hold with the panel window shut, and
// CE/tests/ScriptRuntimeTests.cpp §21 pins the identical behaviour on the C++ side. Three rules
// this file exists to keep from silently rotting:
//
//   1. The LOG always happens. onError is in addition to the console line, never instead of it —
//      a panel whose own error handler is broken must not go quiet.
//   2. A failure inside onError is logged once and NOT re-dispatched, so a broken reporter cannot
//      report its own failure to itself forever.
//   3. Load-time failures are DEFERRED until every script has loaded, because the script that
//      fails to compile first would otherwise be reported to a handler that does not exist yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  setRuntimeHost, runScript, setLiveEnabled, dispatchInteraction,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { LIFECYCLE_HOOKS, handlerNamesForRuntime, RUNTIME_PLAYER, RUNTIME_WEBVIEW } from '../src/CE_Application/scripting/panelApi.js';

const panel = { id: 'p', name: 'Errors', width: 400, height: 300, controls: [] };

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
const tracedErrors = () => get(scriptTrace).filter((t) => t.kind === 'error')
  .map((t) => String(t.message ?? '')).join('\n');

function script(id, source, { language = 'javascript', event = 'onCustom' } = {}) {
  return { id, name: id, language, event, target: id, source, enabled: true };
}

/**
 * Install `scripts` as the runtime's host document and hand them to `fn`.
 *
 * ▶ Run is used to load each one rather than the live dispatcher, because the live path needs a
 * mounted panel. The distinction that matters here is unaffected: onError reads the LOADED handler
 * cache, so a reporter has to have been loaded before it can report — which is exactly what
 * primeHandlers() guarantees in the live path and what the explicit warm-up below stands in for.
 */
async function withScripts(scripts, fn) {
  setRuntimeHost({ panel, scripts });
  clearScriptTrace();
  try { return await fn(); } finally { setRuntimeHost(null); }
}

/* ------------------------------------------------------------------ the contract itself */

test('onError is declared, and declared for BOTH runtimes', () => {
  // A hook that only fires in the editor would be worse than none: the failures a panel most wants
  // to report are the ones nobody is watching, in a DAW, with the window shut.
  const hook = LIFECYCLE_HOOKS.find((h) => h.id === 'onError');
  assert.ok(hook, 'onError should be a declared lifecycle hook');
  assert.ok(handlerNamesForRuntime(RUNTIME_WEBVIEW).includes('onError'));
  assert.ok(handlerNamesForRuntime(RUNTIME_PLAYER).includes('onError'));
});

/* ---------------------------------------------------------------------- dispatch phase */

test('a handler that throws reaches onError, with the failing script named', async () => {
  const watcher = script('watch', 'function onError(info) { log("CAUGHT " + [info.scriptId, info.phase, info.event, info.message].join("|")); }');
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');

  await withScripts([watcher, broken], async () => {
    await runScript(watcher, 'onNothing');      // warm the cache; onNothing() does not exist
    clearScriptTrace();
    await runScript(broken, 'onCustom');
  });

  const log = traced();
  assert.match(log, /CAUGHT boom\|dispatch\|onCustom\|.*kaboom/, `expected onError to fire; got:\n${log}`);
});

test('the error is logged whether or not anything reports it', async () => {
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');
  await withScripts([broken], async () => { await runScript(broken, 'onCustom'); });
  assert.match(tracedErrors(), /kaboom/, 'the console line is the floor, not the fallback');
});

test('a script that declares no onError is simply skipped, not an error itself', async () => {
  const quiet = script('quiet', 'function onCustom() { log("fine"); }');
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');
  await withScripts([quiet, broken], async () => {
    await runScript(quiet, 'onCustom');
    clearScriptTrace();
    await runScript(broken, 'onCustom');
  });
  // Exactly one error line: the original failure. Nothing about a missing handler.
  assert.equal(tracedErrors().split('\n').filter((l) => l.trim()).length, 1);
});

/* -------------------------------------------------------------------- the re-entry guard */

test('a broken onError runs once and is not re-entered by its own failure', async () => {
  const bad = script('bad', 'function onError(info) { log("REPORTING"); throw new Error("reporter is broken"); }');
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');

  await withScripts([bad, broken], async () => {
    await runScript(bad, 'onNothing');
    clearScriptTrace();
    await runScript(broken, 'onCustom');
  });

  const lines = traced().split('\n');
  assert.equal(lines.filter((l) => l.includes('REPORTING')).length, 1,
    'the reporter must run exactly once — its own failure must not call it again');
  assert.match(traced(), /\(in onError\) .*reporter is broken/,
    'and that failure is still logged, marked as having come from the reporter');
});

/* --------------------------------------------------------------- errors reaching handlers */

test('every loaded onError hears about a failure, not just the failing script', async () => {
  const a = script('a', 'function onError(info) { log("A saw " + info.scriptId); }');
  const b = script('b', 'function onError(info) { log("B saw " + info.scriptId); }');
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');

  await withScripts([a, b, broken], async () => {
    await runScript(a, 'onNothing');
    await runScript(b, 'onNothing');
    clearScriptTrace();
    await runScript(broken, 'onCustom');
  });

  assert.match(traced(), /A saw boom/);
  assert.match(traced(), /B saw boom/);
});

test('a disabled script is not asked to report anything', async () => {
  const off = { ...script('off', 'function onError(info) { log("OFF saw it"); }'), enabled: false };
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');

  await withScripts([off, broken], async () => {
    await runScript(off, 'onNothing');   // loadable, but switched off
    clearScriptTrace();
    await runScript(broken, 'onCustom');
  });

  assert.doesNotMatch(traced(), /OFF saw it/);
});

/* ------------------------------------------------------------- the info payload's shape */

test('info carries every field the contract promises, as strings', async () => {
  const watcher = script('watch',
    'function onError(info) { log("KEYS " + Object.keys(info).sort().join(",")); ' +
    'log("TYPES " + Object.keys(info).sort().map(function (k) { return typeof info[k]; }).join(",")); }');
  const broken = script('boom', 'function onCustom() { throw new Error("kaboom"); }');

  await withScripts([watcher, broken], async () => {
    await runScript(watcher, 'onNothing');
    clearScriptTrace();
    await runScript(broken, 'onCustom');
  });

  const log = traced();
  assert.match(log, /KEYS event,message,phase,script,scriptId/);
  // All five are strings even when unknown — a handler that concatenates them can never see
  // "undefined" appear in the middle of a sentence it shows somebody.
  assert.match(log, /TYPES string,string,string,string,string/);
});

/* ------------------------------------------------------------------------- the load phase */

test('a load failure is held until every script has loaded, then reported with phase "load"', async () => {
  // The order is the point. `boom` is listed FIRST and fails to compile; dispatched eagerly, its
  // failure would be reported to a `watch` that has not been loaded yet — and a panel whose scripts
  // do not even parse is exactly when it most wants to be told.
  const broken = script('boom', 'function onCustom( {{{ syntactically not a script');
  const watcher = script('watch', 'function onError(info) { log("LOADFAIL " + info.scriptId + "|" + info.phase); }');

  setLiveEnabled(true);
  try {
    await withScripts([broken, watcher], async () => {
      await dispatchInteraction(null, 'onCustom', undefined);
    });
  } finally {
    setLiveEnabled(false);
  }

  assert.match(traced(), /LOADFAIL boom\|load/, `expected a deferred load report; got:\n${traced()}`);
});
