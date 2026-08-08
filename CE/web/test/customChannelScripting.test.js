// customChannelScripting.test.js — a custom component's live value, from a script.
//
// THE GAP THIS CLOSES, and it had already shipped twice. A CustomComponent has no `Behavior`
// section; it keeps its values in `ValueChannels`, one named channel each, and what the screen is
// SHOWING lives in the preview session's `customValues` — not in the document. The script runtime
// only ever bypassed the document for a native control's single unnamed value (`hasLiveValue`
// asked for `_children.Behavior`), so every read of a custom component fell through to the
// document and answered with whatever was authored, forever.
//
// Two shipped features were built on top of that and neither worked:
//
//   * the GAIA arpeggio bridge watched `Designer.arpeggiator.blocks` — written only by the design
//     surface, never by the grid — so drawing a block wrote nothing to the synth and said nothing
//     about it. The panel's own notepad claimed it reached the instrument.
//   * the effect-label script read the TYPE selector with get(id). `value` is a SHORTHAND resolving
//     to `Value.value`, a section a CustomComponent does not have, so it answered undefined and
//     every knob kept its generic "PARAM n" caption.
//
// Both are the same bug, which is why the fix is here rather than in either generator: reads and
// watches now resolve a custom component's channels, from the session first and the document
// behind it — the exact order interactionRuntime resolves them in, so a script and the screen
// cannot disagree.
//
// WRITES ARE DELIBERATELY NOT WIDENED. `liveValuePatch` sets `valueOverride`, one unnamed value;
// applying that to a named channel would move the wrong thing. The tests at the bottom pin that a
// set() still goes where it always did.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, updatePanelPreviewSession }
  from '../src/CE_Application/stores/interactionPreview.js';
import { customChannelOfPath, readsLiveValue } from '../src/CE_Application/scripting/liveValue.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import * as rt from '../src/CE_Application/scripting/panelRuntime.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';

/** A custom component carrying the named channels, on a live active panel. */
function componentPanel(channels, { id = 'comp', name = 'comp' } = {}) {
  const control = createControl('CustomComponent', { Core: { id, name } });
  control._children.ValueChannels._children = {};
  for (const [channelName, spec] of Object.entries(channels)) {
    control._children.ValueChannels._children[channelName] = {
      _type: 'ValueChannel', name: channelName, type: 'float', min: 0, max: 127, step: 1,
      defaultValue: 0, format: { precision: 0 }, ...spec,
    };
  }

  panels.set([]);
  panelPreviewSessions.set({});
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost(null);                      // the EDITOR path: no host, sessions consulted
  addPanel({ id: 'p', name: 'P', width: 400, height: 300, controls: [control] });
  setActivePanel('p');
  return control;
}

const api = () => rt.scriptApiForTesting('', 'custom-channels');

test.afterEach(() => { rt.setRuntimeHost(null); panelPreviewSessions.set({}); });

/* ------------------------------------------------------------------ path resolution */

test('a channel name resolves to that channel, not to a section the type does not have', () => {
  const control = componentPanel({ value: { defaultValue: 7 }, cutoff: { defaultValue: 40 } });
  assert.equal(customChannelOfPath(control, 'ValueChannels.cutoff.currentValue'), 'cutoff');
  // Both spellings: walkCaseInsensitive omits the `_children` hop, a hand-written path keeps it.
  assert.equal(customChannelOfPath(control, 'ValueChannels._children.cutoff.currentValue'), 'cutoff');
  assert.equal(customChannelOfPath(control, 'ValueChannels.nosuch.currentValue'), null);
  assert.equal(customChannelOfPath(control, 'Value.value'), null);
});

test('the bare name and the `value` shorthand both reach the main channel', () => {
  // The effect-label bug exactly. `value` is a shorthand that wins over any real key, so it pointed
  // at Value.value — nothing — on every custom component on the GAIA panel.
  componentPanel({ value: { defaultValue: 7 } });
  assert.equal(api().get('comp'), 7);
  assert.equal(api().get('comp.value'), 7);
});

test('a control that HAS a Value section is untouched by that fallback', () => {
  // The shorthand must only fall through when it landed NOWHERE. A Button carrying a stray
  // ValueChannels section must still mean Value.value — otherwise widening the shorthand would
  // silently repoint every native control that happens to have channels attached.
  panels.set([]);
  panelPreviewSessions.set({});
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost(null);
  const button = createControl('Button', { Core: { id: 'b', name: 'b' } });
  button._children.ValueChannels = {
    _type: 'ValueChannels',
    _children: { value: { _type: 'ValueChannel', name: 'value', type: 'float', currentValue: 99 } },
  };
  addPanel({ id: 'p2', name: 'P2', width: 400, height: 300, controls: [button] });
  setActivePanel('p2');

  api().set('b.value', 1);                       // a Button is a bool: 1 is a legal value, 9 clamps
  assert.equal(api().get('b.value'), 1, 'the Button still round-trips through its own value');
  assert.notEqual(api().get('b.value'), 99, 'and never through the stray channel');
  assert.equal(button._children.ValueChannels._children.value.currentValue, 99,
    'the stray channel must not have been touched');
});

/* ------------------------------------------------------------------ reading live */

test('a channel reads its DEFAULT before anything has touched it', () => {
  componentPanel({ value: { defaultValue: 5 }, cutoff: { defaultValue: 40 } });
  assert.equal(api().get('comp.cutoff'), 40);
});

test('a channel reads what the SESSION holds once the user has moved it', () => {
  // The whole defect: this used to answer 40 forever, because the document is where it looked.
  const control = componentPanel({ value: { defaultValue: 5 }, cutoff: { defaultValue: 40 } });
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 99 } });
  assert.equal(api().get('comp.cutoff'), 99);
});

test('one channel moving does not disturb another', () => {
  const control = componentPanel({ value: { defaultValue: 5 }, cutoff: { defaultValue: 40 } });
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 99 } });
  assert.equal(api().get('comp.value'), 5);
  assert.equal(api().get('comp.cutoff'), 99);
});

test('an array channel comes back as its items, which is what a pattern is', () => {
  // The arpeggiator's arpPattern is an object-array channel: the session publishes the blocks
  // through it on every grid edit, and a bridge script turns those into device writes.
  const control = componentPanel({
    arpPattern: {
      type: 'array', size: 512, defaultValue: 0,
      itemFields: { note: { min: 0, max: 127, step: 1, default: 60 }, step: { min: 0, max: 255, step: 1, default: 0 } },
    },
  });
  const blocks = [{ note: 60, step: 0 }, { note: 64, step: 8 }];
  updatePanelPreviewSession(control._children.Core.id, { customValues: { arpPattern: blocks } });

  const read = api().get('comp.arpPattern');
  assert.ok(Array.isArray(read), `expected an array, got ${JSON.stringify(read)}`);
  assert.equal(read.length, 2);
  assert.equal(read[0].note, 60);
  assert.equal(read[1].step, 8);
});

test('a channel nobody has written yet is still channelized — the key appears only once set', () => {
  // Detection used to test `'currentValue' in node`, which a freshly-declared channel fails. The
  // script then got the channel OBJECT back instead of a value, and a bridge diffing it against a
  // previous read never saw a change.
  const control = componentPanel({ arpPattern: { type: 'array', size: 8, defaultValue: 0 } });
  const before = api().get('comp.arpPattern');
  assert.ok(before === undefined || Array.isArray(before),
    `a channel should never read back as its own declaration: ${JSON.stringify(before)}`);
  updatePanelPreviewSession(control._children.Core.id, { customValues: { arpPattern: [{ note: 1 }] } });
  assert.ok(Array.isArray(api().get('comp.arpPattern')));
});

/* ------------------------------------------------------------------ watching */

test('watch fires when a channel changes in the session', () => {
  // The arp bridge's whole mechanism. Its watcher never fired because the path it read never moved.
  const control = componentPanel({ cutoff: { defaultValue: 40 } });
  const seen = [];
  api().watch('comp.cutoff', (value) => seen.push(value));

  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 70 } });
  rt.runReactiveForTesting();
  assert.deepEqual(seen, [70]);

  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 71 } });
  rt.runReactiveForTesting();
  assert.deepEqual(seen, [70, 71]);
});

test('watch does not fire when nothing changed', () => {
  const control = componentPanel({ cutoff: { defaultValue: 40 } });
  const seen = [];
  api().watch('comp.cutoff', (value) => seen.push(value));
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 70 } });
  rt.runReactiveForTesting();
  rt.runReactiveForTesting();
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 70 } });
  rt.runReactiveForTesting();
  assert.deepEqual(seen, [70], 'a watcher that re-fires on no change would re-send the whole pattern');
});

test('watch on an array channel compares CONTENT, so moving one block fires once', () => {
  const control = componentPanel({ arpPattern: { type: 'array', size: 64, defaultValue: 0,
    itemFields: { note: { min: 0, max: 127, step: 1, default: 60 }, step: { min: 0, max: 255, step: 1, default: 0 } } } });
  const seen = [];
  api().watch('comp.arpPattern', (value) => seen.push(value.length));

  const id = control._children.Core.id;
  updatePanelPreviewSession(id, { customValues: { arpPattern: [{ note: 60, step: 0 }] } });
  rt.runReactiveForTesting();
  // Same content, a fresh array: signatureOf is JSON, so this must NOT count as a change.
  updatePanelPreviewSession(id, { customValues: { arpPattern: [{ note: 60, step: 0 }] } });
  rt.runReactiveForTesting();
  updatePanelPreviewSession(id, { customValues: { arpPattern: [{ note: 60, step: 1 }] } });
  rt.runReactiveForTesting();

  assert.deepEqual(seen, [1, 1], 'two real changes, and the identical re-write between them ignored');
});

/* ------------------------------------------------------------------ writing a channel */
//
// A CHANNEL IS WRITTEN WHERE IT IS READ. The first version of this fix widened reads and
// deliberately left writes on the document path, reasoning that liveValuePatch (one unnamed
// `valueOverride`) could not express a named channel. That reasoning was right and the conclusion
// was wrong: a read that comes from the session and a write that goes to the document simply
// disagree. The tests below are the three ways that showed up, all of which the first version's
// tests missed because they ran with NO SESSION for the control — a state the exported player never
// reaches, since Player.svelte seeds one for every control before installing the host.

test('set() then get() round-trips even when a session already exists', () => {
  // The regression, at its narrowest. With a session present — always, in the player — set() landed
  // in the document while get() kept reading the session, so the write was simply invisible.
  const control = componentPanel({ cutoff: { defaultValue: 40 } });
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 40 } });

  api().set('comp.cutoff', 61);
  assert.equal(api().get('comp.cutoff'), 61, 'a script must be able to read back what it just wrote');
});

test('a channel write does not warn about a fixed-shape section', () => {
  // probeNestedWrite sees a ValueChannel's string `_type` and calls the write a fresh key on a typed
  // node, so every channel write printed "It was written, but nothing reads it — check the
  // spelling." The advice was false in both halves: it IS read, and the spelling was right.
  const control = componentPanel({ cutoff: { defaultValue: 40 } });
  clearScriptTrace();
  api().set('comp.cutoff', 61);
  assert.deepEqual(get(scriptTrace).map((t) => t.message), []);
});

test('compute() on a channel converges instead of accusing the author of a loop', () => {
  // The downstream cost of the same split. compute() writes through set() and re-reads through
  // readWatch, so with the two pointing at different places a formula could never settle: eight
  // passes, then "two formulas are feeding each other" — on every settle, for the life of the panel.
  const control = componentPanel({ cutoff: { defaultValue: 0 } });
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 0 } });

  clearScriptTrace();
  api().compute('comp.cutoff', () => 50);
  rt.runReactiveForTesting();

  assert.equal(api().get('comp.cutoff'), 50);
  assert.deepEqual(get(scriptTrace).filter((t) => /still changing/.test(t.message ?? '')), []);
});

test('writing one channel leaves its siblings where they were', () => {
  // The reason a channel needs its own patch rather than liveValuePatch: `valueOverride` is one
  // unnamed value, so writing `cutoff` through it would stand in for `resonance` as well.
  const control = componentPanel({ cutoff: { defaultValue: 40 }, resonance: { defaultValue: 5 } });
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 40, resonance: 5 } });

  api().set('comp.cutoff', 61);
  assert.equal(api().get('comp.cutoff'), 61);
  assert.equal(api().get('comp.resonance'), 5);
  assert.notEqual(get(panelPreviewSessions)[control._children.Core.id].valueOverrideEnabled, true,
    'a channel write must never become an unnamed valueOverride');
});

test('a scripted value is clamped exactly as a dragged one is', () => {
  const control = componentPanel({ cutoff: { defaultValue: 40, min: 0, max: 127 } });
  api().set('comp.cutoff', 999);
  assert.equal(api().get('comp.cutoff'), 127);
});

test('a channel the arpeggiator publishes refuses the write, and says why', () => {
  // Half-performing this one is worse than refusing it: the value would sit in the session until the
  // next grid edit recomputed it, so the pattern sent to the synth and the pattern on screen would
  // disagree with nothing saying so.
  const control = componentPanel({ arpPattern: { type: 'array', size: 8, defaultValue: 0 } });
  control._children.Designer = { _type: 'Designer', arpeggiator: { enabled: true, blocks: [] } };

  clearScriptTrace();
  api().set('comp.arpPattern', [{ note: 60, step: 0 }]);
  const messages = get(scriptTrace).map((t) => t.message);
  assert.equal(messages.length, 1, `expected one refusal, got ${JSON.stringify(messages)}`);
  assert.match(messages[0], /published by the arpeggiator grid/);
  assert.match(messages[0], /draw on the grid/, 'a refusal has to say what to do instead');
});

test('the same channel name is writable when there is no arpeggiator behind it', () => {
  // The refusal is about the grid being the source, not about the name.
  const control = componentPanel({ arpPattern: { type: 'array', size: 8, defaultValue: 0 } });
  clearScriptTrace();
  api().set('comp.arpPattern', [{ note: 60, step: 0 }]);
  assert.deepEqual(get(scriptTrace).map((t) => t.message), []);
});

/* ------------------------------------------------------------------ the exported player */

test('the PLAYER host reads a channel the same way the editor does', () => {
  // This is the claim that matters. The GAIA panel exists to drive hardware, and a fix that only
  // works in the editor preview is worth nothing — the arp bridge would still be inert in the
  // shipped plugin. The player reuses PanelPreviewSurface, so grid edits land in the same session
  // store; what had to change was its host's readValue.
  const control = componentPanel({ cutoff: { defaultValue: 40 } });
  const panel = { id: 'p', controls: [control], scripts: [], scripting: { enabled: true, runOnExport: true } };
  const host = createPlayerHost(panel);

  assert.equal(host.readValue(control, 'ValueChannels.cutoff.currentValue'), 40, 'the default, before anything moves');
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 88 } });
  assert.equal(host.readValue(control, 'ValueChannels.cutoff.currentValue'), 88, 'and the live value once it does');
});

test('the player host writes a channel where it reads one', () => {
  const control = componentPanel({ cutoff: { defaultValue: 40 } });
  const host = createPlayerHost({ id: 'p', controls: [control], scripts: [] });
  updatePanelPreviewSession(control._children.Core.id, { customValues: { cutoff: 40 } });

  assert.equal(host.writeValue(control, 'ValueChannels.cutoff.currentValue', 61), true);
  assert.equal(host.readValue(control, 'ValueChannels.cutoff.currentValue'), 61,
    'the player must round-trip too — it is the runtime the panel actually ships on');
  assert.notEqual(get(panelPreviewSessions)[control._children.Core.id].valueOverrideEnabled, true);
});
