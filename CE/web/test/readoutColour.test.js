// A knob's and a fader's value readout, lettered to read where it stands.
//
// A fader's readout stands beside its cap, on the panel, and a knob's past its pointer's tip, on
// the panel too; both were drawn in the cap's colour, which in 35 of the 79 built-in sets read under
// 3:1 on the set's own panel (a white cap on a white panel, a dark one on a dark one). A knob's
// readout can also sit in its cap, on the knob's face, which most sets draw in that same colour: in
// 57 sets it could not be seen at all. The owner asked for a fader readout colour in the sets, then
// for the knob's too.
//
// So a set holds `control.readout`, which reads on its panel as it is drawn (its finish included),
// and both controls letter their readout in it; and a knob's readout in its cap, where it is still in
// that default, is lettered to read on the knob's face as the set draws it (models/readoutInk.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_CONTROL_SETS, BASE_CONTROL_SET, CONTROL_SET_TOKEN_NAMES, READOUT_CONTRAST,
  getControlSet, normalizeControlSetDefinition, resolveToken, withReadout,
} from '../src/CE_Application/models/controlSets.js';
import { resolveControlFamily, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { knobFaceColour, panelColour, withReadoutInCap } from '../src/CE_Application/models/readoutInk.js';
import { finishedColour } from '../src/CE_Application/utils/materialFilter.js';
import { ROLE_GROUPS } from '../src/CE_Application/models/setEditing.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { convertRangeControl } from '../src/CE_Application/utils/rangeControlConversion.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';

const readoutOf = (control) => control._children.Parts._children.labelCurrent._children.Text._children.Fill.colour;
const inTheCap = (type = 'Knob') => {
  const control = createControl(type);
  control._children.Parts._children.labelCurrent.anchor = 'centre';
  return control;
};

test('a finish is drawn lighter or darker than its fill, and the estimate follows it', () => {
  const glass = { enabled: true, kind: 'glass', strength: 50, shine: 180 };
  assert.equal(finishedColour('FF2A3544', glass, { azimuth: 225, elevation: 48 }), 'FFBFC7D2', 'Chrome\'s navy cap drawn a light silver');
  assert.equal(finishedColour('FF2A3544', { ...glass, enabled: false }), 'FF2A3544', 'no finish, the fill');
  assert.equal(finishedColour('FF2A3544', null), 'FF2A3544');
  const rubber = finishedColour('FFFFFFFF', { enabled: true, kind: 'rubber', strength: 50, shine: 50 });
  assert.ok(contrast(rubber, 'FFFFFFFF') > 1.2, `a matte finish darkens: ${rubber}`);
});

test('every built-in set names a readout colour, and it reads on the set\'s panel as it is drawn', () => {
  assert.ok(CONTROL_SET_TOKEN_NAMES.includes('control.readout'));
  for (const set of BUILT_IN_CONTROL_SETS) {
    assert.match(set.tokens['control.readout'] ?? '', /^(\{(control\.cap|text\.label|text\.inverse)\}|FFFFFFFF|FF000000)$/, set.id);
    const reads = contrast(resolveToken('control.readout', set), panelColour(set));
    assert.ok(reads >= READOUT_CONTRAST, `${set.id}: ${resolveToken('control.readout', set)} on ${panelColour(set)}, ${reads.toFixed(2)}:1`);
  }
});

test('the first that reads: the cap\'s colour, the label text\'s, the inverse text\'s, then white or black', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const panel = panelColour(set);
    const role = ['control.cap', 'text.label', 'text.inverse'].find((name) => contrast(resolveToken(name, set), panel) >= READOUT_CONTRAST);
    const expected = role ? `{${role}}` : (contrast('FFFFFFFF', panel) >= contrast('FF000000', panel) ? 'FFFFFFFF' : 'FF000000');
    assert.equal(set.tokens['control.readout'], expected, set.id);
  }
  assert.equal(getControlSet('ceramic').tokens['control.readout'], '{text.label}', 'a white cap on a white panel');
  assert.equal(getControlSet('backlit').tokens['control.readout'], '{control.cap}', 'a cap that reads');
  assert.equal(getControlSet('obsidian').tokens['control.readout'], '{text.label}', 'its label text, lightened to read on its glass panel drawn a mid grey');
  assert.equal(BASE_CONTROL_SET.tokens['control.readout'], '{control.cap}', 'the base set\'s follows a set\'s own cap');
  const counts = BUILT_IN_CONTROL_SETS.reduce((n, set) => ({ ...n, [set.tokens['control.readout']]: (n[set.tokens['control.readout']] ?? 0) + 1 }), {});
  // Machined, Anodised, Modular Metal and Obsidian took black or white till their text was nudged to
  // read at 4.5:1 on their panels (component-presets.md, "Four sets' captions").
  assert.deepEqual(counts, { '{control.cap}': 38, '{text.label}': 40, FF000000: 1 });
});

test('a set that names its own readout keeps it; a set read without one is given one by the same rule', () => {
  const named = withReadout({ id: 'mine', tokens: { 'control.cap': 'FFFFFFFF', 'panel.surface': 'FFFFFFFF', 'text.label': 'FF000000', 'control.readout': 'FFFF0000' } });
  assert.equal(named.tokens['control.readout'], 'FFFF0000');
  const ceramic = getControlSet('ceramic');
  const old = { ...ceramic, id: 'my-ceramic', tokens: { ...ceramic.tokens } };
  delete old.tokens['control.readout'];
  assert.equal(normalizeControlSetDefinition(old).tokens['control.readout'], '{text.label}', 'a set file from before the role');
  const partial = withReadout({ id: 'bare', tokens: { 'control.cap': 'FFFFFFFF' } });
  assert.equal(partial.tokens['control.readout'], undefined, 'nothing to judge by: the base set\'s reference, to its own cap');
  assert.equal(resolveToken('control.readout', partial), 'FFFFFFFF');
});

test('Settings › Control Sets offers it among the controls\' colours', () => {
  const controls = ROLE_GROUPS.find((group) => group.id === 'controls').roles;
  assert.deepEqual(controls.find(([key]) => key === 'control.readout'), ['control.readout', 'Fader and knob readout']);
});

test('a slider and a knob letter their readout in it, on the panel, in every set', () => {
  assert.equal(readoutOf(createControl('Slider')), '{control.readout}');
  assert.equal(readoutOf(createControl('Knob')), '{control.readout}');
  assert.equal(readoutOf(convertRangeControl(createControl('Knob'))), '{control.readout}', 'the same either way round');
  for (const set of BUILT_IN_CONTROL_SETS) {
    for (const type of ['Slider', 'Knob']) {
      const reads = contrast(readoutOf(resolveControlForSet(createControl(type), set)), panelColour(set));
      assert.ok(reads >= READOUT_CONTRAST, `${set.id} ${type}: ${reads.toFixed(2)}:1`);
    }
  }
});

test('a knob\'s readout in its cap is lettered to read on the knob\'s face, in every set', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const knob = inTheCap();
    const face = knobFaceColour(resolveControlFamily(knob, set), set);
    const ink = readoutOf(resolveControlForSet(knob, set));
    assert.ok(contrast(ink, face) >= READOUT_CONTRAST, `${set.id}: ${ink} on ${face}, ${contrast(ink, face).toFixed(2)}:1`);
  }
  // Chrome's cap is a navy under a glass finish that draws it a light silver: dark ink, not white.
  const chrome = getControlSet('chrome');
  assert.equal(knobFaceColour(resolveControlFamily(inTheCap(), chrome), chrome), 'FFBFC7D2');
  assert.ok(contrast(readoutOf(resolveControlForSet(inTheCap(), chrome)), 'FFFFFFFF') > 4.5, 'a dark ink on the silver');
  // Where the set's readout reads on the face, it is the set's readout.
  const graphite = getControlSet('graphite-studio');
  assert.equal(readoutOf(withReadoutInCap(resolveControlFamily(inTheCap(), graphite), graphite)), '{control.readout}');
});

test('only a knob\'s, only in its cap, only in the default colour', () => {
  const set = getControlSet('chronograph');
  const authored = inTheCap();
  authored._children.Parts._children.labelCurrent._children.Text._children.Fill.colour = 'FF112233';
  assert.equal(readoutOf(resolveControlForSet(authored, set)), 'FF112233', 'an author\'s colour is kept');
  const atTheTip = createControl('Knob');
  assert.equal(withReadoutInCap(atTheTip, set), atTheTip, 'at the tip it stands on the panel: the same control back');
  const fader = inTheCap('Slider');
  assert.equal(withReadoutInCap(fader, set), fader, 'a fader has no cap to sit in');
});

test('a fader or a knob saved before the role opens with it: a saved file keeps a default as nothing', () => {
  for (const [file, name] of [['Slider/Slider Touch.cepanel', 'Readout'], ['Knob/Knob Numbers.cepanel', 'Odometer']]) {
    const path = new URL(`../../panels/Components/${file}`, import.meta.url);
    const text = readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /control\.readout/, 'the file never wrote the readout\'s colour');
    const control = deserializePanel(text, path.pathname, null).controls.find((entry) => entry._children.Core.name === name);
    assert.equal(readoutOf(control), '{control.readout}', file);
  }
});

// The Components showcases paint grounds of their own, not their sets' panels: Soft, a set for a
// light panel, put its dark readout on a dark one until the Numbers panel took Soft's own colour.
test('every readout a Components showcase shows reads where it stands: on the panel, or in a knob\'s cap', async () => {
  const { KNOB_PANELS, SLIDER_PANELS } = await import('../scripts/componentPanels.js');
  let readouts = 0;
  for (const [id, make] of [...KNOB_PANELS, ...SLIDER_PANELS]) {
    const panel = make();
    const set = getControlSet(panel.controlSet.id);
    for (const control of panel.controls.filter((c) => ['Knob', 'Slider'].includes(c._children.Core.controlType) && c._children.Behavior.showHandleLabels === true)) {
      const inCap = control._children.Parts._children.labelCurrent.anchor === 'centre' && control._children.Behavior.geometry === 'circular';
      const ground = inCap ? knobFaceColour(resolveControlFamily(control, set), set) : panel.bgColour;
      const ink = readoutOf(resolveControlForSet(control, set));
      assert.ok(contrast(ink, ground) >= 3, `${id} ${control._children.Core.name}: ${ink} on ${ground}`);
      readouts += 1;
    }
  }
  assert.ok(readouts >= 20, `the knobs' and the faders' readouts are all checked (${readouts})`);
});
