// keyCaption.test.js — a key's caption, on, off or mixed, lettered for the panel it stands on
// (models/keyCaption.js).
//
// The promises: in every set that draws a toggle as a key, its caption is the same colour on and
// mixed as off, and it reads on the set's panel where it did not (on: Ivory, Pop, Atelier, white on
// a light panel; mixed: 26 sets, most the panel's own colour); a flat face, which fills when on or
// mixed, keeps the inverse colour for its words on the fill; a colour an author chose for the caption
// is kept; and the document is not touched, only what is drawn.

import test from 'node:test';
import assert from 'node:assert/strict';

import { OFFERED_CONTROL_SETS, getControlSet, resolveColourLiteral, resolveControlTokens } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet, resolveControlFamily } from '../src/CE_Application/models/controlSetFamilies.js';
import { withKeyCaptionOnPanel } from '../src/CE_Application/models/keyCaption.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { buttonDeviceDrawn } from '../src/CE_Application/models/buttonDeviceParts.js';
import { panelColour } from '../src/CE_Application/models/readoutInk.js';
import { contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

const captionWhen = (control, set, session) => resolveColourLiteral(resolveInteractiveControl(control, session).control._children.Text._children.Fill.colour, set);

test('a key\'s caption keeps its colour as the toggle goes on or mixed, in every set that draws one', () => {
  let keys = 0;
  for (const { id } of OFFERED_CONTROL_SETS) {
    const set = getControlSet(id);
    const toggle = resolveControlForSet(createControl('ToggleButton'), set);
    if (!buttonDeviceDrawn(toggle)) continue;
    keys += 1;
    const off = captionWhen(toggle, set, {});
    assert.equal(captionWhen(toggle, set, { checked: true }), off, `${id}: on as off`);
    assert.equal(captionWhen(toggle, set, { mixed: true }), off, `${id}: mixed as off`);
  }
  assert.ok(keys > 50, `${keys} sets draw a toggle as a key`);
});

// Preview's order (PanelPreviewSurface): the set's family first, then the states, then the colours.
// A caption colour a state has written there is one nothing after can take back.
test('in Preview\'s order too, family then states then colours, a key\'s caption is not lettered for a filled face', () => {
  for (const id of ['ivory', 'pop', 'atelier']) {
    const set = getControlSet(id);
    const family = resolveControlFamily(createControl('ToggleButton'), set);
    const caption = (session) => resolveControlTokens(resolveInteractiveControl(family, session).control, set)._children.Text._children.Fill.colour;
    assert.equal(caption({ checked: true }), caption({}), `${id}: on as off`);
  }
  for (const id of ['neon', 'tolex', 'ivory', 'frost']) {
    const set = getControlSet(id);
    const family = resolveControlFamily(createControl('ToggleButton'), set);
    const caption = (session) => resolveControlTokens(resolveInteractiveControl(family, session).control, set)._children.Text._children.Fill.colour;
    assert.equal(caption({ mixed: true }), caption({}), `${id}: mixed as off`);
  }
});

test('in Ivory, Pop and Atelier the caption reads on the panel once the toggle is on', () => {
  for (const id of ['ivory', 'pop', 'atelier']) {
    const set = getControlSet(id);
    const on = captionWhen(resolveControlForSet(createControl('ToggleButton'), set), set, { checked: true });
    assert.notEqual(on, 'FFFFFFFF', `${id}: not white`);
    assert.ok(contrast(on, panelColour(set)) >= 4.5, `${id}: ${on} on ${panelColour(set)}`);
  }
});

// Each of these lettered its mixed caption in its panel's colour or near it (1.0 to 2.6:1).
const MIXED_UNREADABLE = [
  'neon', 'blueprint', 'phosphor', 'backlit', 'tolex', 'chronograph', 'chrome', 'prism-cap', 'ladder',
  'heritage', 'carbon', 'chicken-head', 'dual-scale', 'coin-edge', 'hi-fi', 'ivory', 'soft', 'turret-stack',
  'concave-studio', 'pop', 'atelier', 'broadcast', 'compact-rack', 'valve', 'reel', 'frost',
];

test('the caption reads on the panel when the toggle is mixed, in the 26 sets where it was the panel\'s own colour or near it', () => {
  assert.equal(MIXED_UNREADABLE.length, 26);
  for (const id of MIXED_UNREADABLE) {
    const set = getControlSet(id);
    const mixed = captionWhen(resolveControlForSet(createControl('ToggleButton'), set), set, { mixed: true });
    assert.ok(contrast(mixed, panelColour(set)) >= 4.5, `${id}: ${mixed} on ${panelColour(set)}`);
  }
});

// Machined, Anodised, Modular Metal (flightdeck) and Obsidian read at 4.0 to 4.2:1, their own text
// colour on their own panel; the owner had it nudged, a few shades, rather than their panels.
test('a key\'s caption reads at 4.5:1 on its set\'s panel at rest, in every set that draws one', () => {
  for (const { id } of OFFERED_CONTROL_SETS) {
    const set = getControlSet(id);
    for (const type of ['ToggleButton', 'Button']) {
      const key = resolveControlForSet(createControl(type), set);
      if (!buttonDeviceDrawn(key)) continue;
      const caption = captionWhen(key, set, {});
      assert.ok(contrast(caption, panelColour(set)) >= 4.5, `${id} ${type}: ${caption} on ${panelColour(set)}, ${contrast(caption, panelColour(set)).toFixed(2)}:1`);
    }
  }
  for (const [id, text] of [['machined', 'FF0F1012'], ['anodised', 'FF141518'], ['flightdeck', 'FF191D20'], ['obsidian', 'FFF9FCFE']]) {
    assert.equal(getControlSet(id).tokens['text.label'], text, `${id}: its text nudged, not its panel`);
  }
});

test('a flat face, which fills when on or mixed, is left as its set draws it: Graphite\'s words go inverse on the fill', () => {
  for (const id of ['graphite', 'graphite-studio', 'ceramic']) {
    const set = getControlSet(id);
    const family = resolveControlFamily(createControl('ToggleButton'), set);
    assert.equal(buttonDeviceDrawn(family), false, `${id} draws a flat face`);
    assert.equal(withKeyCaptionOnPanel(family), family, `${id}: untouched`);
  }
  const graphite = getControlSet('graphite');
  const toggle = resolveControlForSet(createControl('ToggleButton'), graphite);
  assert.equal(toggle._children.States._children.Selected.patches.component['Text.Fill.colour'], resolveColourLiteral('{text.inverse}', graphite));
  assert.equal(toggle._children.States._children.Mixed.patches.component['Text.Fill.colour'], resolveColourLiteral('{text.inverse}', graphite));
});

test('a caption colour an author chose for it on a key is kept, and the document is not touched', () => {
  const set = getControlSet('ivory');
  const chosen = createControl('ToggleButton');
  chosen._children.States._children.Selected.patches.component['Text.Fill.colour'] = 'FF2F6F9A';
  chosen._children.States._children.Mixed.patches.component['Text.Fill.colour'] = 'FF8A5A12';
  assert.equal(captionWhen(resolveControlForSet(chosen, set), set, { checked: true }), 'FF2F6F9A');
  assert.equal(captionWhen(resolveControlForSet(chosen, set), set, { mixed: true }), 'FF8A5A12');
  const stored = createControl('ToggleButton');
  resolveControlForSet(stored, set);
  assert.equal(stored._children.States._children.Selected.patches.component['Text.Fill.colour'], '{text.inverse}', 'only what is drawn');
  assert.equal(stored._children.States._children.Mixed.patches.component['Text.Fill.colour'], '{text.inverse}', 'only what is drawn');
});
