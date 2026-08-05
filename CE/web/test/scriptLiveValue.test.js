// scriptLiveValue.test.js — set("x.value", …) means the same thing in the editor and in the plugin.
//
// It did not. The player installs a runtime host that routes a live value through the preview
// session, so the control moved and host-parameter sync fired. The editor installs no host, so the
// same call fell through to a document write at `Value.value`: a path Knob and Slider do not have
// (REFUSED, with an error) and one Button has a section but no field for (a fresh key nothing
// reads, with a warning). So the headline call of the whole API worked in the shipped plugin and
// did nothing in the preview the author was testing in.
//
// What is pinned here is the parity, and the two honest refusals that must survive it: a control
// with no value still says so, in both runtimes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, setRuntimeHost,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { isLiveValuePath, hasLiveValue } from '../src/CE_Application/scripting/liveValue.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import {
  panelPreviewSessions, syncPanelPreviewSessions,
} from '../src/CE_Application/stores/interactionPreview.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { resolveInteractionContext } from '../src/CE_Application/utils/interactionRuntime.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';

const traced = () => get(scriptTrace).map((t) => `[${t.kind}] ${t.message}`).join('\n');

function panelWith(type = 'Knob', name = 'Cutoff') {
  const control = createControl(type, { name });
  if (control._children.Behavior) {
    control._children.Behavior.min = 0;
    control._children.Behavior.max = 127;
  }
  const panel = {
    id: 'p', name: 'P', controls: [control],
    scripting: { modules: MODULES.map((m) => m.id) },
  };
  panels.set([panel]);
  activePanelId.set('p');
  panelPreviewSessions.set({});
  syncPanelPreviewSessions([control]);
  clearScriptTrace();
  return { panel, control, id: control._children.Core.id };
}

/** What the renderer draws — the same resolver interactionRuntime uses for the on-screen control. */
const onScreen = (id) => resolveInteractionContext(
  get(panels)[0].controls[0], get(panelPreviewSessions)[id],
)?.valueRaw;

/* ------------------------------------------------------------------ the predicate itself */

test('a live value path is recognised in every spelling that reaches it', () => {
  assert.equal(isLiveValuePath('Value.value'), true, 'the resolved shorthand');
  assert.equal(isLiveValuePath('value'), true);
  assert.equal(isLiveValuePath('mainValue.currentValue'), true, "a custom component's channel");
  assert.equal(isLiveValuePath('Transform.x'), false);
  assert.equal(isLiveValuePath('Background.Fill.colour'), false);
});

test('only a control with a Behavior section has a live value', () => {
  assert.equal(hasLiveValue(createControl('Knob', { name: 'K' })), true);
  assert.equal(hasLiveValue(createControl('Button', { name: 'B' })), true);
  assert.equal(hasLiveValue(createControl('Label', { name: 'L' })), false);
});

/* --------------------------------------------------------------------------- the editor */

test('set() on a value moves the control in the editor, and says nothing about it', () => {
  try {
    const { id } = panelWith('Knob');
    const api = scriptApiForTesting('', 'editor');

    api.set('Cutoff.value', 100);

    assert.equal(get(panelPreviewSessions)[id]?.valueOverride, 100, 'it went to the session');
    assert.equal(onScreen(id), 100, 'and the control on screen moved');
    assert.equal(traced(), '', 'no warning and no error — this is the documented call');
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('get() reads back what set() wrote', () => {
  try {
    panelWith('Knob');
    const api = scriptApiForTesting('', 'editor-read');
    api.set('Cutoff.value', 96);
    assert.equal(api.get('Cutoff.value'), 96);
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('get() on a control nobody has touched answers with what it shows, not undefined', () => {
  try {
    const { id } = panelWith('Knob');
    const api = scriptApiForTesting('', 'editor-untouched');
    // Both runtimes used to read the document at a path that holds nothing.
    assert.equal(api.get('Cutoff.value'), onScreen(id));
    assert.notEqual(api.get('Cutoff.value'), undefined);
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('.normalizedValue drives the same channel, converted through the control range', () => {
  try {
    const { id } = panelWith('Knob');           // min 0, max 127
    const api = scriptApiForTesting('', 'editor-norm');
    api.set('Cutoff.normalizedValue', 0.5);
    assert.equal(onScreen(id), 63.5);
    assert.equal(api.get('Cutoff.value'), 63.5);
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('a Button no longer warns that its value write goes somewhere nothing reads', () => {
  try {
    panelWith('Button', 'Step');
    const api = scriptApiForTesting('', 'editor-button');
    api.set('Step.value', 1);
    // Button HAS a Value section but no `value` field in it, so the old document write landed as a
    // fresh key and warned. The session needs no section at all.
    assert.doesNotMatch(traced(), /nothing reads it/);
    assert.equal(api.get('Step.value'), 1);
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('a control with no value still refuses the write, and says why', () => {
  try {
    panelWith('Label', 'Title');
    const api = scriptApiForTesting('', 'editor-label');
    api.set('Title.value', 1);
    assert.match(traced(), /nothing was written/, 'the honest refusal survives the fix');
    assert.match(traced(), /not a section this control has/);
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

/* ------------------------------------------------------------- editor and player, agreeing */

test('the editor and the exported player do the same thing with the same call', () => {
  const run = (withHost) => {
    const { panel, id } = panelWith('Knob');
    if (withHost) setRuntimeHost(createPlayerHost(panel));
    try {
      const api = scriptApiForTesting('', withHost ? 'player' : 'editor');
      const untouched = api.get('Cutoff.value');
      api.set('Cutoff.value', 100);
      return {
        untouched,
        read: api.get('Cutoff.value'),
        screen: onScreen(id),
        override: get(panelPreviewSessions)[id]?.valueOverride,
        complained: /error|warn/.test(traced()),
      };
    } finally {
      setRuntimeHost(null);
      panels.set([]);
      panelPreviewSessions.set({});
    }
  };

  const editor = run(false);
  const player = run(true);
  assert.deepEqual(editor, player, 'the two runtimes disagreed about what "value" means');
  assert.equal(editor.read, 100);
  assert.equal(editor.screen, 100);
  assert.equal(editor.complained, false);
});

test('editor and player also agree about a control that has no value', () => {
  const run = (withHost) => {
    const { panel } = panelWith('Label', 'Title');
    if (withHost) setRuntimeHost(createPlayerHost(panel));
    try {
      scriptApiForTesting('', withHost ? 'player-l' : 'editor-l').set('Title.value', 1);
      return /nothing was written/.test(traced());
    } finally {
      setRuntimeHost(null);
      panels.set([]);
      panelPreviewSessions.set({});
    }
  };
  assert.equal(run(false), true, 'the editor refuses');
  assert.equal(run(true), true, 'and so does the player, rather than silently accepting it');
});
