// controlSetDesigns.test.js — the designs are made of what the editor can set, and nothing else.
//
// The promise behind models/controlSetDesigns.js: any slider or button under any built-in set
// can be rebuilt by hand in the editor, because every property a design writes is one the
// editor's panels expose. That promise is only worth anything if it is checked, so this walks
// every built-in set's families and refuses any path outside the editor's vocabulary — a new
// renderer-only key would fail here before it shipped. The archetypes' shapes are pinned too,
// so a set that claims a fader has a fader.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_CONTROL_SETS, getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { BUTTON_DESIGNS, EDITOR_PATHS, SLIDER_DESIGNS, hex6, lighten, darken, mix } from '../src/CE_Application/models/controlSetDesigns.js';
import { resolveControlForSet, readControlPath } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const editorPath = (path) => EDITOR_PATHS.some((pattern) => pattern.test(path));

test('every path every built-in set writes is one the editor exposes', () => {
  const offenders = [];
  for (const set of BUILT_IN_CONTROL_SETS) {
    for (const [type, family] of Object.entries(set.families ?? {})) {
      for (const path of Object.keys(family.component ?? {})) {
        if (!editorPath(path)) offenders.push(`${set.id} ${type} component ${path}`);
      }
      for (const [part, patch] of Object.entries(family.parts ?? {})) {
        for (const path of Object.keys(patch ?? {})) {
          if (!editorPath(path)) offenders.push(`${set.id} ${type} ${part} ${path}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'paths the editor cannot set');
});

test('the colour arithmetic the designs lean on', () => {
  assert.equal(hex6('FF123456'), '123456');
  assert.equal(hex6('#abc'), '000ABC', 'a short form is not a thing here; six or eight digits');
  assert.equal(lighten('000000', 0.5), '808080');
  assert.equal(darken('FFFFFF', 0.5), '808080');
  assert.equal(mix('000000', 'FFFFFF', 0.5), '808080');
});

test('the archetypes differ in form, not only in ink', () => {
  const inks = { slot: '202020', slotEdge: '101010', fill: 'C0C0C0', cap: '808080', groove: '101010', tick: 'E0E0E0', plate: 'A0A0A0', ink: 'E0E0E0', paper: '202020', light: '40E0FF', ring: 'E0E0E0', led: '40FF80', track: '303030', outline: '000000', rail: '806020' };
  const shapes = {};
  for (const [name, design] of Object.entries(SLIDER_DESIGNS)) {
    const parts = design(inks).Slider.parts;
    const cap = parts.pointerCurrent ?? {};
    const base = parts.bodyTrackBase ?? {};
    shapes[name] = [cap.kind ?? 'dot', cap['Layout.width'] ?? 20, cap['Layout.height'] ?? 20, base['Layout.height'] ?? 10, base['Background.Corners.radius'] ?? 999, base.slot === true, cap.glow === true, parts.tickMajor?.kind ?? (design(inks).Slider.component['Behavior.showTicks'] === false ? 'none' : 'line')].join('|');
  }
  const distinct = new Set(Object.values(shapes));
  assert.equal(distinct.size, Object.keys(SLIDER_DESIGNS).length, `two slider archetypes share a form:\n${JSON.stringify(shapes, null, 1)}`);

  const buttonShapes = {};
  const binks = { face: '808080', edge: '202020', text: 'F0F0F0', light: '40E0FF', bezel: '101010', outline: '000000', ink: 'E0E0E0' };
  for (const [name, design] of Object.entries(BUTTON_DESIGNS)) {
    const c = design(binks).Button.component;
    const shadows = (c['Effects.Shadows.items'] ?? []).map((s) => `${s.type}:${s.offsetX},${s.offsetY},${s.blur}`).join('+');
    buttonShapes[name] = [c['Background.Corners.radius'], c['Background.Corners.style'] ?? 'rounded', c['Background.Border.thickness'], c['Background.Fill.gradient']?.type ?? 'solid', c['Effects.Bevel.style'] ?? 'none', shadows].join('|');
  }
  assert.equal(new Set(Object.values(buttonShapes)).size, Object.keys(BUTTON_DESIGNS).length, `two button archetypes share a form:\n${JSON.stringify(buttonShapes, null, 1)}`);
});

test('a design lands on a factory control as editor values, gradient and shadows included', () => {
  const console = getControlSet('console');
  const slider = resolveControlForSet(createControl('Slider'), console);
  const cap = slider._children.Parts._children.pointerCurrent;
  assert.equal(cap.kind, 'console');
  assert.equal(cap._children.Background._children.Fill.gradientEnabled, true);
  assert.equal(cap._children.Background._children.Fill.gradient.type, 'linear');
  assert.equal(cap._children.Background._children.Fill.gradient.stops.length, 3);
  assert.equal(slider._children.Parts._children.bodyTrackBase.slot, true);
  assert.equal(readControlPath(slider, 'Behavior.showTicks'), true);
  assert.equal(readControlPath(slider, 'Behavior.majorTickCount'), 11);

  const button = resolveControlForSet(createControl('Button'), console);
  assert.equal(readControlPath(button, 'Effects.Bevel.enabled'), true);
  assert.equal(readControlPath(button, 'Effects.Shadows.items')[0].type, 'drop');
  assert.equal(readControlPath(button, 'Background.Fill.gradientEnabled'), true);
  assert.equal(readControlPath(button, 'Text.Effects.shadowEnabled'), true, 'the legend is engraved');
  const toggle = resolveControlForSet(createControl('ToggleButton'), console);
  assert.equal(readControlPath(toggle, 'ContentLayout.lamp'), 'led');
  assert.equal(readControlPath(toggle, 'ContentLayout.lampColour'), resolveToken('accent.hot', console));

  // An author's own values stay theirs under a design, exactly as under any family.
  const own = createControl('Button');
  own._children.Background._children.Corners.radius = 20;
  assert.equal(readControlPath(resolveControlForSet(own, console), 'Background.Corners.radius'), 20);
  assert.equal(readControlPath(resolveControlForSet(own, console), 'Effects.Bevel.enabled'), true, 'the rest of the design still lands');

  // The boards: Pop is a toy, Blueprint is line work, Soft is neumorphic, Machined is a billet in a slot.
  assert.equal(getControlSet('pop').families.Button.component['Background.Border.thickness'], 3);
  assert.equal(getControlSet('blueprint').families.Button.component['Background.Fill.colour'], '00000000');
  assert.equal(getControlSet('soft').families.Button.component['Effects.Shadows.items'].length, 2);
  assert.equal(getControlSet('ladder').families.Button.component['Background.Corners.style'], 'chamfer');
  assert.equal(getControlSet('machined').families.Slider.parts.pointerCurrent.kind, 'block');
  assert.equal(getControlSet('machined').families.Slider.parts.bodyTrackFill.inset, 3);
  assert.equal(getControlSet('tolex').families.Slider.parts.bodyTrackBase['Background.Fill.gradient'].type, 'linear', 'Tolex rides a rail');
});
