// sceneryScripts.test.js — why a scripted panel is allowed to fold.
//
// A panel carrying any script used to keep every one of its controls live. The GAIA panel carries
// two, so it lost its entire fold — 193 Labels and 27 Backgrounds — for scripts that between them
// name one control, a grid. The stated reason was that a script can reach any control by id and set
// its text, colour or visibility, and nothing in the script's shape says which ones it will touch.
//
// The first half of that is true. The conclusion was not, because it treated the baked ground as a
// SNAPSHOT. It is not one: the ground is baked from the control document and re-baked whenever that
// document changes. So the question is not "can a script change a folded control" — of course it
// can — but "can a script change one in a way the ground will not re-bake to show". For a control
// that is foldable at all, it cannot, and this file is the argument in executable form:
//
//   1. a script write to a foldable control lands in the document (setValue's other two doors are
//      the player host and the live-value path, and the live path needs a Value or ValueChannels
//      section — which would have disqualified the control from folding in the first place);
//   2. a document write changes the fingerprint the ground is cached against, so it re-bakes;
//   3. a script cannot make a foldable control dynamic in the first place — a control's section
//      list comes from its type, and both doors that could add one refuse.
//
// What is left is a rate problem, and it is real: an animation writing a folded label sixty times a
// second would re-bake the whole ground sixty times a second. That is what the script-touched set
// is for, and it is checked here too.
//
// WHY NOT READ THE SCRIPTS. The obvious alternative — fold whatever the scripts demonstrably never
// name — cannot be made sound. `ce.panel.restore(snapshot)` takes its control ids as the KEYS of a
// runtime object, so they need never appear in the source; `ce.panel.each`, `ce.panel.find()`,
// `ce.panel.snapshot()` and `on("*", …)` reach every control without naming one; and scripts may be
// Lua or Python, where there is no parser here to reach for.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { isScenery, planSceneryFold, sceneryFingerprint } from '../src/CE_Application/utils/sceneryModel.js';
import {
  clearScriptTouchedControls, scriptTouchedControlIds,
} from '../src/CE_Application/stores/scriptTouchedControls.js';

/** A one-label panel, installed as the runtime's active panel in EDITOR mode (no host). */
function withPanel(controls, fn) {
  const panel = {
    id: 'p', name: 'P', width: 400, height: 200,
    scripting: { modules: ['ce.core', 'ce.panel', 'ce.anim'] }, controls,
  };
  clearScriptTouchedControls();
  panels.set([panel]);
  activePanelId.set('p');
  try {
    return fn(scriptApiForTesting('', 'test-script'), () => get(panels)[0]);
  } finally {
    clearScriptTouchedControls();
    panels.set([]);
    activePanelId.set(null);
  }
}

let nextY = 0;
const label = (id, content = 'ONE') =>
  createControl('Label', {
    Core: { id, name: id },
    Text: { content },
    // Clear of one another on purpose: two labels sharing a box would hold each other back through
    // the overlap rule, and this file is about scripts rather than about that.
    Transform: { x: 0, y: (nextY += 20), width: 80, height: 12 },
  });

/* ------------------------------------------------ 1 + 2: the write lands, the ground re-bakes */

test('a script write to a folded label lands in the document', () => {
  withPanel([label('lbl')], (api, live) => {
    assert.ok(isScenery(live().controls[0]), 'guard: a plain Label must be foldable');

    api.set('lbl.text.content', 'TWO');

    assert.equal(live().controls[0]._children.Text.content, 'TWO',
      'the write did not reach the document, so the ground would never show it');
  });
});

test('and that write changes the fingerprint the ground is cached against', () => {
  withPanel([label('lbl')], (api, live) => {
    const before = sceneryFingerprint([live().controls[0]]);
    api.set('lbl.text.content', 'TWO');
    assert.notEqual(sceneryFingerprint([live().controls[0]]), before,
      'the ground was not re-baked, so the label would be frozen at its old text');
  });
});

test('the same holds for visibility, which is the other thing a script reaches for', () => {
  withPanel([label('lbl')], (api, live) => {
    const before = sceneryFingerprint([live().controls[0]]);
    api.set('lbl.visible', false);
    assert.equal(live().controls[0]._children.Core.visible, false);
    assert.notEqual(sceneryFingerprint([live().controls[0]]), before);
  });
});

/* --------------------------------------- 3: a script cannot make a folded control dynamic at all */

test('a script cannot give a folded label a section its type does not have', () => {
  // The remaining way the fold could be wrong: a script turning an inert control into a live one
  // behind the ground's back. It cannot. A control's sections come from its type, and both doors
  // refuse to add one — ce.panel.define answers "has no States section", and set() answers "not a
  // section this control has". So a Label that was foldable when the panel opened stays foldable.
  withPanel([label('lbl')], (api, live) => {
    assert.equal(planSceneryFold(live().controls).ground.length, 1);

    assert.equal(api.panelDefine('lbl', 'States', 'hot', { patch: { 'Text.content': 'HOT' } }), false,
      'define created a States section on a Label');
    api.set('lbl.States.hot', { _type: 'State', name: 'hot' });
    api.set('lbl.Value.value', 5);
    api.set('lbl.DeviceBindings.cutoff', { parameterId: 'x' });

    assert.deepEqual(Object.keys(live().controls[0]._children),
      ['Core', 'Transform', 'Background', 'Text', 'Icon', 'Effects', 'ContentLayout'],
      'a script added a section to a Label, which would make a folded control dynamic');
    assert.equal(isScenery(live().controls[0]), true);
    assert.equal(planSceneryFold(live().controls).ground.length, 1);
  });
});

/* ------------------------------------------------------- the rate problem, and what handles it */

test('a script write reports the control, so it leaves the ground and stays out', () => {
  withPanel([label('lbl')], (api, live) => {
    assert.equal(get(scriptTouchedControlIds).has('lbl'), false);

    api.set('lbl.text.content', 'TWO');

    assert.ok(get(scriptTouchedControlIds).has('lbl'),
      'an animated label would otherwise re-bake the whole ground on every frame');
    assert.equal(planSceneryFold(live().controls, get(scriptTouchedControlIds)).ground.length, 0);
  });
});

test('repeating the write does not churn the set', () => {
  // The hot path: this is called on every animation frame, and a new Set per frame would be exactly
  // the reactive churn the set exists to prevent.
  withPanel([label('lbl')], (api) => {
    api.set('lbl.text.content', 'TWO');
    const first = get(scriptTouchedControlIds);
    api.set('lbl.text.content', 'THREE');
    assert.equal(get(scriptTouchedControlIds), first, 'the store was rewritten for an id it already had');
  });
});

test('an untouched label on the same panel still folds', () => {
  // The point of doing this per control rather than per panel.
  withPanel([label('a'), label('b')], (api, live) => {
    api.set('a.text.content', 'TWO');
    const { ground, live: kept } = planSceneryFold(live().controls, get(scriptTouchedControlIds));
    assert.deepEqual(ground.map((c) => c._children.Core.id), ['b']);
    assert.deepEqual(kept.map((c) => c._children.Core.id), ['a']);
  });
});
