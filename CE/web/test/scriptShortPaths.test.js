// Short paths in scripts (panelRuntime.js resolveModelPath), decided by the owner on 2026-11-24
// (docs/design/animation-designer.md): a step that can only be one thing may be left out, so
// "Knob01.Text.colour" reads and writes "Knob01.Text.Fill.colour". Tried only where a path as
// written leads nowhere, so nothing that resolved before changes; two fits are refused, both named.
// The window-closed mirror is CE/src/Player/PanelValueModel.h, held by PanelValueModelTests.cpp.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';

async function withControl(type, name, body) {
  const rt = await import('../src/CE_Application/scripting/panelRuntime.js');
  const { valueAtPath, setNestedValue } = await import('../src/CE_Application/stores/controlTreeUtils.js');
  const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
  const control = createControl(type, { Core: { id: `${name}-id`, name } });
  const panel = { id: 'p', name: 'Short paths', width: 800, height: 400, controls: [control] };
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost({
    panel,
    scripts: [],
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => setNestedValue(control, path, value),
  });
  clearScriptTrace();
  const traced = () => get(scriptTrace).map((entry) => String(entry.message ?? '')).join('\n');
  try { return await body(rt.scriptApiForTesting('', 'paths'), control, traced); }
  finally { rt.setRuntimeHost(null); }
}

// A Button: a Knob has no Text or Background section of its own; its words are parts (below).
test('a section\'s middle step may be left out where it can only be one thing', async () => {
  await withControl('Button', 'Btn01', (api, button) => {
    const textColour = api.get('Btn01.Text.Fill.colour');
    assert.equal(api.get('Btn01.Text.colour'), textColour, 'the owner\'s example, Text.colour');
    assert.equal(api.get('btn01.text.COLOUR'), textColour, 'capitals ignored, as for every path');

    api.set('Btn01.Text.colour', 'FF00FF00');
    assert.equal(button._children.Text._children.Fill.colour, 'FF00FF00', 'and it writes the real property');
    assert.equal(button._children.Text.colour, undefined, 'not a new one called colour');
  });
});

test('a part\'s path may leave out Parts and the section inside the part', async () => {
  await withControl('Knob', 'Knob01', (api, knob) => {
    const scale = knob._children.Parts._children.bodyCap._children.Layout.scale;
    assert.equal(api.get('Knob01.Parts.bodyCap.Layout.scale'), scale);
    assert.equal(api.get('Knob01.Parts.bodyCap.scale'), scale);
    assert.equal(api.get('Knob01.bodyCap.scale'), scale);
    // The knob's name is its title label's text: its colour, by the steps that can only be one thing.
    api.set('Knob01.labelTitle.Text.colour', 'FF123456');
    assert.equal(knob._children.Parts._children.labelTitle._children.Text._children.Fill.colour, 'FF123456');
  });
});

test('a short path that could be two things is refused, and says both', async () => {
  await withControl('Button', 'Btn01', (api, button, traced) => {
    assert.equal(api.get('Btn01.Background.colour'), undefined);
    const said = traced();
    assert.match(said, /"Background\.colour" could be \d+ things on "Btn01"/);
    assert.match(said, /Background\.Fill\.colour/);
    assert.match(said, /Background\.Border\.colour/);

    const before = JSON.stringify(button._children.Background);
    api.set('Btn01.Background.colour', 'FF0000FF');
    assert.equal(JSON.stringify(button._children.Background), before, 'nothing is written: not the fill, not the border, not a new property');
  });
});

test('a whole path that resolves is untouched by any of this', async () => {
  await withControl('Button', 'Btn01', (api, button, traced) => {
    // get() answers a control-set colour ('{surface}') with the colour it stands for; both reads do.
    const fill = api.get('Btn01.Background.Fill.colour');
    assert.match(String(fill), /^[0-9A-F]{8}$/i);
    // The section search finds a bare "fill.colour" first, as it always has: not a short path.
    assert.equal(api.get('Btn01.fill.colour'), fill);
    assert.equal(button._children.Background._children.Fill.colour !== undefined, true);
    assert.doesNotMatch(traced(), /could be/);
  });
});
