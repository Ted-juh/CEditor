// scriptTrust.test.js — release audit C-08.
//
// A shared panel's JavaScript ran with the page's own reach the moment Preview was pressed, and the
// page reaches the native file bridge: in the running app a crafted panel wrote a file of its choosing
// with no prompt. Scripts that ARRIVE in an opened file or package now wait until this computer
// trusts that exact code. Scripts written here are never asked about.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, setActivePanel } from '../src/CE_Application/stores/panels.js';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { dispatchInteraction, setLiveScripts, initPanelRuntime } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  AWAITING_TRUST_FIELD, initScriptTrust, resetScriptTrustForTests, pendingScriptTrust, trustScriptsHash,
  declineScriptsHash, forgetDeclinedScripts, markScriptsForeign, scriptsHash,
} from '../src/CE_Application/stores/scriptTrust.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

const ran = () => JSON.stringify(get(scriptTrace)).includes('PANEL SCRIPT RAN');
const SOURCE = 'function onDoubleClick() { log("PANEL SCRIPT RAN"); }';

function panelWithScript(source = SOURCE) {
  const knob = createControl('Knob', { Core: { name: 'K' } });
  const scripts = [{ id: 'shared_js', name: 'shared', language: 'javascript', scope: 'component', target: 'K', event: 'onDoubleClick', source, enabled: true }];
  return { panel: { id: 'p', name: 'Shared panel', controls: [knob], scripts }, controlId: knob._children.Core.id, scripts };
}

/** What File > Open and an opened package do. */
function openForeign(source = SOURCE) {
  const made = panelWithScript(source);
  panels.set([markScriptsForeign(made.panel)]);
  setActivePanel('p');
  return made;
}

/** A panel whose scripts were written in this editor. */
function openAuthored(source = SOURCE) {
  const made = panelWithScript(source);
  panels.set([made.panel]);
  setActivePanel('p');
  return made;
}

const doubleClick = (controlId) => dispatchInteraction(controlId, 'onDoubleClick', { x: 1, y: 1 });

initPanelRuntime();

test('an opened panel\'s scripts do not run until trusted, and the banner says so', async () => {
  resetScriptTrustForTests();
  initScriptTrust(memoryStorage());
  clearScriptTrace();
  const { controlId, scripts } = openForeign();
  await doubleClick(controlId);
  assert.equal(ran(), false, 'untrusted scripts ran');
  const pending = get(pendingScriptTrust);
  assert.equal(pending?.hash, scriptsHash(scripts));
  assert.equal(pending?.count, 1);
  assert.deepEqual(pending?.languages, ['javascript']);

  trustScriptsHash(pending.hash);
  assert.equal(get(pendingScriptTrust), null);
  await doubleClick(controlId);
  assert.equal(ran(), true, 'trusted scripts did not run');
});

test('scripts written in this editor are never gated', async () => {
  resetScriptTrustForTests();
  initScriptTrust(memoryStorage());
  clearScriptTrace();
  const { controlId } = openAuthored();
  await doubleClick(controlId);
  assert.equal(ran(), true);
  assert.equal(get(pendingScriptTrust), null, 'an author must not be asked about their own scripts');
});

test('trust is remembered for that exact code, and a changed copy asks again', async () => {
  resetScriptTrustForTests();
  const storage = memoryStorage();
  initScriptTrust(storage);
  const first = openForeign();
  trustScriptsHash(scriptsHash(first.scripts));

  initScriptTrust(storage);            // the editor restarts
  clearScriptTrace();
  const again = openForeign();
  assert.equal(get(panels)[0][AWAITING_TRUST_FIELD], undefined, 'trusted code is not even marked');
  await doubleClick(again.controlId);
  assert.equal(ran(), true, 'the same code should not ask twice');

  clearScriptTrace();
  const changed = openForeign('function onDoubleClick() { log("PANEL SCRIPT RAN"); log("and something else"); }');
  await doubleClick(changed.controlId);
  assert.equal(ran(), false, 'changed code must ask again');
  assert.ok(get(pendingScriptTrust));
});

test('editing an opened panel\'s scripts does not lift the gate', async () => {
  resetScriptTrustForTests();
  initScriptTrust(memoryStorage());
  clearScriptTrace();
  const { controlId, scripts } = openForeign();
  // The script editor's live override: the code as it is being typed.
  setLiveScripts(scripts.map((s) => ({ ...s, source: s.source + '\n// edited' })), 'p');
  await doubleClick(controlId);
  assert.equal(ran(), false, 'opening or editing the scripts is not trusting them');
  assert.ok(get(pendingScriptTrust));
  setLiveScripts(null);
});

test('"Keep them off" stops asking until Preview is next turned on', async () => {
  resetScriptTrustForTests();
  initScriptTrust(memoryStorage());
  clearScriptTrace();
  const { controlId } = openForeign();
  await doubleClick(controlId);
  declineScriptsHash(get(pendingScriptTrust).hash);
  await doubleClick(controlId);
  assert.equal(get(pendingScriptTrust), null);
  assert.equal(ran(), false);

  forgetDeclinedScripts();             // what going live in Preview does
  await doubleClick(controlId);
  assert.ok(get(pendingScriptTrust), 'pressing Preview again asks again');
  assert.equal(ran(), false);
});

test('a file cannot vouch for itself, and saving does not write the mark', () => {
  resetScriptTrustForTests();
  initScriptTrust(memoryStorage());
  const { panel } = panelWithScript();
  // A document that claims its scripts are already trusted, or says nothing at all.
  for (const claim of [{ [AWAITING_TRUST_FIELD]: null }, { [AWAITING_TRUST_FIELD]: 'not-the-hash' }, {}]) {
    const doc = JSON.stringify({ formatVersion: 2, name: 'x', width: 100, height: 100, controls: [], scripts: panel.scripts, ...claim });
    const opened = markScriptsForeign(deserializePanel(doc, '/tmp/x.cepanel', 'x'));
    assert.equal(opened[AWAITING_TRUST_FIELD], scriptsHash(panel.scripts), JSON.stringify(claim));
    assert.equal(AWAITING_TRUST_FIELD in JSON.parse(serializePanel(opened)), false, 'the mark leaked into the saved file');
  }
  // No scripts, nothing to trust.
  assert.equal(markScriptsForeign({ id: 'q', scripts: [] })[AWAITING_TRUST_FIELD], undefined);
});

test('unarmed (the exported player, the unit tests) the gate is open', async () => {
  resetScriptTrustForTests();
  clearScriptTrace();
  const { controlId } = openForeign();
  await doubleClick(controlId);
  assert.equal(ran(), true);
});
