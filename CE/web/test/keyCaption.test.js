// keyCaption.test.js — a key's caption, on or off, lettered for the panel it stands on (models/keyCaption.js).
//
// The promises: in every set that draws a toggle as a key, its caption is the same colour on as off,
// and it reads on the set's panel where it did not (Ivory, Pop, Atelier: white on a light panel);
// a flat face, which fills when on, keeps the inverse colour for its words on the fill; a colour an
// author chose for the caption when on is kept; and the document is not touched, only what is drawn.

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

test('a key\'s caption keeps its colour as the toggle goes on, in every set that draws one', () => {
  let keys = 0;
  for (const { id } of OFFERED_CONTROL_SETS) {
    const set = getControlSet(id);
    const toggle = resolveControlForSet(createControl('ToggleButton'), set);
    if (!buttonDeviceDrawn(toggle)) continue;
    keys += 1;
    assert.equal(captionWhen(toggle, set, { checked: true }), captionWhen(toggle, set, {}), `${id}: on as off`);
  }
  assert.ok(keys > 50, `${keys} sets draw a toggle as a key`);
});

// Preview's order (PanelPreviewSurface): the set's family first, then the states, then the colours.
// A caption colour a state has written there is one nothing after can take back.
test('in Preview\'s order too, family then states then colours, a key\'s caption is not lettered for a filled face', () => {
  for (const id of ['ivory', 'pop', 'atelier']) {
    const set = getControlSet(id);
    const family = resolveControlFamily(createControl('ToggleButton'), set);
    const on = resolveControlTokens(resolveInteractiveControl(family, { checked: true }).control, set);
    const off = resolveControlTokens(resolveInteractiveControl(family, {}).control, set);
    assert.equal(on._children.Text._children.Fill.colour, off._children.Text._children.Fill.colour, `${id}: on as off`);
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

test('a flat face, which fills when on, is left as its set draws it: Graphite\'s words go inverse on the fill', () => {
  for (const id of ['graphite', 'graphite-studio', 'ceramic']) {
    const set = getControlSet(id);
    const family = resolveControlFamily(createControl('ToggleButton'), set);
    assert.equal(buttonDeviceDrawn(family), false, `${id} draws a flat face`);
    assert.equal(withKeyCaptionOnPanel(family), family, `${id}: untouched`);
  }
  const graphite = getControlSet('graphite');
  const toggle = resolveControlForSet(createControl('ToggleButton'), graphite);
  assert.equal(toggle._children.States._children.Selected.patches.component['Text.Fill.colour'], resolveColourLiteral('{text.inverse}', graphite));
});

test('a caption colour an author chose for it on a key is kept, and the document is not touched', () => {
  const set = getControlSet('ivory');
  const chosen = createControl('ToggleButton');
  chosen._children.States._children.Selected.patches.component['Text.Fill.colour'] = 'FF2F6F9A';
  assert.equal(captionWhen(resolveControlForSet(chosen, set), set, { checked: true }), 'FF2F6F9A');
  const stored = createControl('ToggleButton');
  resolveControlForSet(stored, set);
  assert.equal(stored._children.States._children.Selected.patches.component['Text.Fill.colour'], '{text.inverse}', 'only what is drawn');
});
