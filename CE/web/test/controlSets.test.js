// controlSets.test.js — control sets, phase 1 (docs/design/control-sets.md).
//
// A set is a dictionary of named colour roles; a control's default colours are references into
// it ('{accent}'); the canvas resolves them against the panel's set at draw time. Three things
// have to hold for the demo — "switch sets and every ready-made control changes together" — to be
// true and safe:
//
//   1. The base set reproduces, colour for colour, what every control looked like before sets
//      existed. A document that never chose a set must look exactly as it did.
//   2. Resolution touches colours and only colours, copies only what it changes, and degrades
//      (leaves the reference in place) rather than inventing a colour for a name nobody defines.
//   3. The document carries the choice on the "right or absent" rule the rest of the file uses,
//      and the build payload carries literals, because the player has no resolver.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  BASE_CONTROL_SET,
  BUILT_IN_CONTROL_SETS,
  CONTROL_SET_TOKEN_NAMES,
  DEFAULT_CONTROL_SET_ID,
  collectTokenReferences,
  controlSetForPanel,
  getControlSet,
  isColourLiteral,
  isTokenReference,
  makeTokenReference,
  normalizeControlSet,
  resolveColourLiteral,
  resolveColourValue,
  resolveControlTokens,
  resolveToken,
  serializeControlSet,
  tokenNameOf,
} from '../src/CE_Application/models/controlSets.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createStatesDefaults } from '../src/CE_Application/models/interactionDefaults.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { activeControlSet, setActivePanelControlSet } from '../src/CE_Application/stores/controlSets.js';

const ember = getControlSet('ember');
const ivory = getControlSet('ivory');

function part(control, name) {
  return control?._children?.Parts?._children?.[name];
}

function partFill(control, name) {
  return part(control, name)?._children?.Background?._children?.Fill?.colour;
}

function partBorder(control, name) {
  return part(control, name)?._children?.Background?._children?.Border?.colour;
}

function partText(control, name) {
  return part(control, name)?._children?.Text?._children?.Fill?.colour;
}

function statePatch(control, stateName) {
  return control?._children?.States?._children?.[stateName]?.patches ?? {};
}

function openPanel(overrides = {}) {
  const panel = { ...createPanel('Sets'), ...overrides };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set(null);
  return panel;
}

// --- the dictionary -----------------------------------------------------------------------------

test('every built-in set defines every token role, as a literal or an alias that resolves', () => {
  assert.ok(BUILT_IN_CONTROL_SETS.length >= 2, 'the demo needs something to switch to');
  assert.equal(BASE_CONTROL_SET.id, DEFAULT_CONTROL_SET_ID);
  for (const set of BUILT_IN_CONTROL_SETS) {
    for (const name of CONTROL_SET_TOKEN_NAMES) {
      assert.ok(name in set.tokens, `${set.id} does not define ${name}`);
      const resolved = resolveToken(name, set);
      assert.ok(isColourLiteral(resolved), `${set.id}.${name} resolves to ${resolved}, not a colour`);
    }
    // And nothing beyond the roles: a set with a private token is a set the others cannot stand
    // in for.
    for (const name of Object.keys(set.tokens)) {
      assert.ok(CONTROL_SET_TOKEN_NAMES.includes(name), `${set.id} defines an unlisted token ${name}`);
    }
  }
});

test('the sets actually differ where it shows', () => {
  for (const name of ['surface', 'accent', 'control.cap', 'text.primary']) {
    assert.notEqual(resolveToken(name, ember), resolveToken(name, BASE_CONTROL_SET), name);
    assert.notEqual(resolveToken(name, ivory), resolveToken(name, BASE_CONTROL_SET), name);
  }
});

test('reference syntax: the W3C alias form, and nothing that merely looks like it', () => {
  assert.equal(tokenNameOf('{accent.hot}'), 'accent.hot');
  assert.equal(tokenNameOf(' {accent} '), 'accent');
  assert.equal(makeTokenReference('control.track'), '{control.track}');
  assert.ok(isTokenReference('{surface}'));
  assert.equal(isTokenReference('FF5B9BD5'), false);
  assert.equal(isTokenReference('{value}'.repeat(2)), false);
  assert.equal(isTokenReference('{ accent }'), false, 'spaces inside are not a token');
  assert.equal(isTokenReference('{Accent-Hot}'), false, 'hyphens are not a token');
  assert.equal(isTokenReference({ token: 'accent' }), false, 'the object form is not the format');
  assert.equal(isTokenReference(null), false);
});

test('aliases resolve within the set, unknown names fall back to the base set, then to nothing', () => {
  // '{control.fill}' is '{accent}' in every built-in set.
  assert.equal(resolveToken('control.fill', BASE_CONTROL_SET), 'FF5B9BD5');
  assert.equal(resolveToken('control.fill', ember), resolveToken('accent', ember));

  const partial = { id: 'partial', name: 'Partial', tokens: { accent: 'FF112233' } };
  assert.equal(resolveToken('accent', partial), 'FF112233');
  assert.equal(resolveToken('control.track', partial), 'FF2C2C2C', 'falls back to the base set');
  assert.equal(resolveToken('nobody.defines.this', partial), undefined);

  const cyclic = { id: 'cyclic', name: 'Cyclic', tokens: { a: '{b}', b: '{a}' } };
  assert.equal(resolveToken('a', cyclic), undefined, 'an alias cycle ends, and ends in nothing');

  assert.equal(resolveColourValue('{accent}', ember), resolveToken('accent', ember));
  assert.equal(resolveColourValue('{nobody}', ember), '{nobody}', 'unresolvable stays as written');
  assert.equal(resolveColourValue('FF010203', ember), 'FF010203', 'a literal is untouched');
  assert.equal(resolveColourLiteral('{nobody}', ember, 'FF3A3A3A'), 'FF3A3A3A');
  assert.equal(resolveColourLiteral('aabbcc', ember, 'FF3A3A3A'), 'AABBCC', 'six digits count as a literal');
});

// --- the resolver over a control tree ------------------------------------------------------------

test('a fresh Slider is written in tokens, and the base set gives back the original colours', () => {
  const slider = createControl('Slider');
  const refs = collectTokenReferences(slider);
  assert.ok(refs.has('control.track') && refs.has('control.cap') && refs.has('accent.hot'), [...refs].join(','));

  const resolved = resolveControlTokens(slider, BASE_CONTROL_SET);
  assert.notEqual(resolved, slider, 'a tree with references is copied');
  assert.equal(collectTokenReferences(resolved).size, 0, 'nothing is left unresolved');

  // The literals every Slider and Knob had before sets existed (utils/sliderEntityFactory.js).
  assert.equal(partFill(resolved, 'bodyTrackBase'), 'FF2C2C2C');
  assert.equal(partBorder(resolved, 'bodyTrackBase'), '55202020');
  assert.equal(partFill(resolved, 'bodyTrackFill'), 'FF5B9BD5');
  assert.equal(partFill(resolved, 'bodySelectedRange'), 'FF7BB3FF');
  assert.equal(partFill(resolved, 'bodyCenterMarker'), '99FFFFFF');
  assert.equal(partFill(resolved, 'pointerStart'), 'FFF2B44B');
  assert.equal(partFill(resolved, 'pointerCurrent'), 'FFF6F6F6');
  assert.equal(partBorder(resolved, 'pointerCurrent'), '99333333');
  assert.equal(partFill(resolved, 'pointerEnd'), 'FF55C79A');
  assert.equal(partFill(resolved, 'tickMajor'), 'CCFFFFFF');
  assert.equal(partFill(resolved, 'tickMinor'), '99FFFFFF');
  assert.equal(partText(resolved, 'labelMin'), 'FFF5F5F5');
  assert.equal(partText(resolved, 'labelStart'), 'FFF2B44B');
  assert.equal(partText(resolved, 'labelTitle'), 'FFB8C7D8');

  // The state rules too — "the moment a control is touched it flips back to the old blue" was
  // the failure the record warned about.
  const dragging = statePatch(resolved, 'Dragging').parts;
  assert.equal(dragging.bodyTrackFill['Background.Fill.colour'], 'FF71B8F1');
  assert.equal(dragging.bodySelectedRange['Background.Fill.colour'], 'FF9FD0FF');
  assert.equal(dragging.pointerCurrent['Background.Fill.colour'], 'FFFFFFFF');
  const focused = statePatch(resolved, 'Focused').parts;
  assert.equal(focused.pointerCurrent['Background.Border.colour'], 'FF89C2FF');
  assert.equal(focused.labelValue['Text.Fill.colour'], 'FFDAEEFF');
});

test('the other families resolve to their old colours under the base set as well', () => {
  const number = resolveControlTokens(createControl('Number'), BASE_CONTROL_SET);
  assert.equal(partFill(number, 'decrement'), 'FF343434');
  assert.equal(partBorder(number, 'decrement'), '664C4C4C');
  assert.equal(partFill(number, 'valueField'), 'FF151515');
  assert.equal(partBorder(number, 'valueField'), '665B5B5B');
  assert.equal(statePatch(number, 'Hover').parts.decrement['Background.Fill.colour'], 'FF3D3D3D');
  assert.equal(statePatch(number, 'Dragging').parts.valueField['Background.Border.colour'], 'FF5B9BD5');

  const range = resolveControlTokens(createControl('Range'), BASE_CONTROL_SET);
  assert.equal(partBorder(range, 'lowField'), 'FF89C2FF', 'the active field carries the accent border');
  assert.equal(partBorder(range, 'highField'), '665B5B5B');

  const button = resolveControlTokens(createControl('Button'), BASE_CONTROL_SET);
  assert.equal(button._children.Background._children.Fill.colour, 'FF3A3A3A');
  assert.equal(button._children.Text._children.Fill.colour, 'FFFFFFFF');
  assert.equal(statePatch(button, 'Hover').component['Background.Fill.colour'], 'FF4A4A4A');
  assert.equal(statePatch(button, 'Pressed').component['Background.Fill.colour'], 'FF2C2C2C');

  const toggle = resolveControlTokens(createControl('ToggleButton'), BASE_CONTROL_SET);
  assert.equal(statePatch(toggle, 'Selected').component['Background.Fill.colour'], 'FF2D6F9C');
  assert.equal(statePatch(toggle, 'Selected').component['Text.Fill.colour'], 'FFFFFFFF');
  assert.equal(toggle._children.Background._children.Border.colour, '66FFFFFF');

  const combobox = resolveControlTokens(createControl('Combobox'), BASE_CONTROL_SET);
  assert.equal(combobox._children.Background._children.Fill.colour, 'FF2F2F2F');
  assert.equal(statePatch(combobox, 'Hover').component['Background.Fill.colour'], 'FF414141');
  assert.equal(statePatch(toggle, 'Mixed').component['Background.Border.colour'], 'FFFFD166');

  for (const type of ['Slider', 'Knob', 'Number', 'Range', 'Button', 'ToggleButton', 'Combobox', 'Listbox', 'TextInput', 'Label']) {
    const control = resolveControlTokens(createControl(type), BASE_CONTROL_SET);
    assert.equal(collectTokenReferences(control).size, 0, `${type} left a reference unresolved`);
  }
});

test('switching the set changes every family together', () => {
  for (const type of ['Slider', 'Knob', 'Number', 'Range', 'Button', 'ToggleButton', 'Combobox', 'Listbox', 'TextInput']) {
    const base = JSON.stringify(resolveControlTokens(createControl(type), BASE_CONTROL_SET));
    const warm = JSON.stringify(resolveControlTokens(createControl(type), ember));
    assert.notEqual(base, warm, `${type} did not change under Ember`);
  }
  const knob = resolveControlTokens(createControl('Knob'), ember);
  assert.equal(partFill(knob, 'bodyTrackFill'), resolveToken('accent', ember));
  assert.equal(partFill(knob, 'pointerCurrent'), ember.tokens['control.cap']);
  assert.equal(statePatch(knob, 'Dragging').parts.bodyTrackFill['Background.Fill.colour'], ember.tokens['control.fill.hot']);
});

test('resolution is copy-on-write: literal trees keep their identity, untouched subtrees too', () => {
  const literal = { _children: { Background: { _children: { Fill: { colour: 'FF010203' } } }, Text: { content: '{value}' } } };
  assert.equal(resolveControlTokens(literal, ember), literal, 'no references, same object');

  const mixed = {
    _children: {
      Core: { id: 'k1', name: 'Cutoff' },
      Background: { _children: { Fill: { colour: '{surface}' }, Border: { colour: 'FF000000' } } },
      Text: { content: '{value}', _children: { Fill: { colour: '{text.primary}' } } },
      Effects: [{ type: 'drop', colour: '{accent}' }, { type: 'glow', colour: '66000000' }],
    },
  };
  const resolved = resolveControlTokens(mixed, ivory);
  assert.notEqual(resolved, mixed);
  assert.equal(resolved._children.Core, mixed._children.Core, 'untouched subtree keeps identity');
  assert.equal(resolved._children.Background._children.Border, mixed._children.Background._children.Border);
  assert.equal(resolved._children.Background._children.Fill.colour, ivory.tokens.surface);
  assert.equal(resolved._children.Text.content, '{value}', 'text content is not a colour');
  assert.equal(resolved._children.Text._children.Fill.colour, ivory.tokens['text.primary']);
  assert.equal(resolved._children.Effects[0].colour, ivory.tokens.accent, 'arrays are walked');
  assert.equal(resolved._children.Effects[1], mixed._children.Effects[1]);
  assert.equal(mixed._children.Background._children.Fill.colour, '{surface}', 'the source is not mutated');
});

test('a name nobody defines is left in place, so the colour helpers reach their own fallbacks', () => {
  const tree = { _children: { Fill: { colour: '{nobody.home}' }, Font: { underlineColour: '{accent}' } } };
  const resolved = resolveControlTokens(tree, ember);
  assert.equal(resolved._children.Fill.colour, '{nobody.home}');
  assert.equal(resolved._children.Font.underlineColour, ember.tokens.accent, 'a *Colour key is a colour key');
});

test('state patches and the resolver agree whichever runs first', () => {
  const slider = createControl('Slider');
  const dragging = { dragging: true, enabled: true };

  // Resolve, then apply states (the canvas order): the patch carries a literal already.
  const resolvedFirst = resolveInteractiveControl(resolveControlTokens(slider, ember), dragging).control;
  // Apply states, then resolve (the preview surface hands the canvas an already-resolved
  // interactive control, which the canvas then resolves for tokens).
  const statesFirst = resolveControlTokens(resolveInteractiveControl(slider, dragging).control, ember);

  const hot = ember.tokens['control.fill.hot'];
  assert.equal(partFill(resolvedFirst, 'bodyTrackFill'), hot);
  assert.equal(partFill(statesFirst, 'bodyTrackFill'), hot);
  assert.equal(partFill(resolvedFirst, 'pointerCurrent'), ember.tokens['control.cap.hot']);
});

test('createStatesDefaults writes references, not literals, for every family', () => {
  for (const type of ['Slider', 'Number', 'Range', 'Button', 'ToggleButton']) {
    const json = JSON.stringify(createStatesDefaults(type));
    assert.equal(/"[0-9A-F]{8}"/.test(json), false, `${type} states still carry a literal colour`);
  }
});

// --- the document ---------------------------------------------------------------------------------

test('normalizeControlSet accepts a string, an object or rubbish, and keeps unknown ids', () => {
  assert.deepEqual(normalizeControlSet('ember'), { id: 'ember' });
  assert.deepEqual(normalizeControlSet({ id: ' ivory ' }), { id: 'ivory' });
  assert.deepEqual(normalizeControlSet('brass'), { id: 'brass' });
  assert.deepEqual(normalizeControlSet(undefined), { id: DEFAULT_CONTROL_SET_ID });
  assert.deepEqual(normalizeControlSet(42), { id: DEFAULT_CONTROL_SET_ID });
  assert.deepEqual(normalizeControlSet({ id: '' }), { id: DEFAULT_CONTROL_SET_ID });
  assert.equal(serializeControlSet({ id: DEFAULT_CONTROL_SET_ID }), null);
  assert.deepEqual(serializeControlSet('ember'), { id: 'ember' });
});

test('controlSetForPanel: the named set, or the base set for none or an unknown one', () => {
  assert.equal(controlSetForPanel(null), BASE_CONTROL_SET);
  assert.equal(controlSetForPanel({ controlSet: { id: 'ember' } }), ember);
  assert.equal(controlSetForPanel({ controlSet: { id: 'brass' } }), BASE_CONTROL_SET);
});

test('a panel on the default set writes no controlSet key; any other set writes {id}', () => {
  const panel = createPanel('Sets');
  assert.deepEqual(panel.controlSet, { id: DEFAULT_CONTROL_SET_ID });
  const plain = JSON.parse(serializePanel(panel));
  assert.equal('controlSet' in plain, false);

  const warm = JSON.parse(serializePanel({ ...panel, controlSet: { id: 'ember' } }));
  assert.deepEqual(warm.controlSet, { id: 'ember' });
});

test('the choice survives a round trip, including a set this build does not know', () => {
  const panel = { ...createPanel('Sets'), controlSet: { id: 'ember' } };
  const reopened = deserializePanel(serializePanel(panel), 'sets.cepanel', 'Sets');
  assert.deepEqual(reopened.controlSet, { id: 'ember' });

  const foreign = deserializePanel(JSON.stringify({ controls: [], controlSet: 'brass' }), 'x.cepanel', 'X');
  assert.deepEqual(foreign.controlSet, { id: 'brass' }, 'a string form is accepted and kept');
  assert.equal(controlSetForPanel(foreign), BASE_CONTROL_SET, 'and renders with the base set');
  assert.deepEqual(JSON.parse(serializePanel(foreign)).controlSet, { id: 'brass' }, 'and is written back as it came');

  const old = deserializePanel(JSON.stringify({ controls: [] }), 'old.cepanel', 'Old');
  assert.deepEqual(old.controlSet, { id: DEFAULT_CONTROL_SET_ID }, 'a document from before sets is on the default');
});

test('a saved document keeps its references; a build payload is baked to literals', () => {
  const slider = createControl('Slider');
  const panel = { ...createPanel('Sets'), controls: [slider], controlSet: { id: 'ember' } };

  // Saved: the Slider is a diff against its defaults, and the defaults ARE the references, so the
  // file says nothing about colours at all — and what it does say is not a literal.
  const saved = serializePanel(panel);
  assert.equal(saved.includes(ember.tokens['control.cap']), false, 'a save does not bake');

  // Exported: every colour is a literal from the panel's set. The player has no resolver.
  const exported = JSON.parse(serializePanel(panel, { elide: false, bakeControlSet: controlSetForPanel(panel) }));
  assert.equal(collectTokenReferences(exported.controls).size, 0);
  assert.equal(partFill(exported.controls[0], 'pointerCurrent'), ember.tokens['control.cap']);
  assert.equal(partFill(exported.controls[0], 'bodyTrackFill'), resolveToken('accent', ember));
  assert.deepEqual(exported.controlSet, { id: 'ember' }, 'the payload still says which set it was baked from');

  // And the source panel was not touched by either.
  assert.equal(partFill(panel.controls[0], 'pointerCurrent'), '{control.cap}');
});

// --- the store --------------------------------------------------------------------------------------

test('activeControlSet follows the active panel, and setActivePanelControlSet writes through', () => {
  const panel = openPanel();
  assert.equal(get(activeControlSet), BASE_CONTROL_SET);

  setActivePanelControlSet('ivory');
  assert.equal(get(activeControlSet), ivory);
  const stored = get(panels).find((entry) => entry.id === panel.id);
  assert.deepEqual(stored.controlSet, { id: 'ivory' });
  assert.equal(stored.modified, true, 'switching the set is a change to the document');

  setActivePanelControlSet('brass');
  assert.equal(get(activeControlSet), BASE_CONTROL_SET, 'an unknown set renders as the base set');
  assert.deepEqual(get(panels)[0].controlSet, { id: 'brass' }, 'but the choice is kept');

  panels.set([]);
  activePanelId.set(null);
  assert.equal(get(activeControlSet), BASE_CONTROL_SET, 'no panel, base set');
});

// --- the script API ---------------------------------------------------------------------------------

test('a script reads the colour the set gives it, never the reference', () => {
  // The exported plugin answers get("Go.background.fill.colour") from a payload baked to literals;
  // the editor's runtime reads the document, which holds '{surface}'. Both have to say the same.
  const button = createControl('Button', { name: 'Go' });
  // openPanel makes it the active panel, which is the panel the script runtime reads.
  openPanel({ controls: [button] });
  try {
    const api = scriptApiForTesting('', 'sets-probe');
    assert.equal(button._children.Background._children.Fill.colour, '{surface}', 'the document holds the reference');
    assert.equal(api.get('Go.background.fill.colour'), 'FF3A3A3A');
    setActivePanelControlSet('ember');
    assert.equal(api.get('Go.background.fill.colour'), ember.tokens.surface);
    assert.equal(api.get('Go.text.content'), 'Button', 'text is read as written');
  } finally {
    panels.set([]);
    activePanelId.set(null);
  }
});
