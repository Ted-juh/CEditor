// sectionDesigns.test.js — sections are part of the panel, and lettering reads in them
// (models/sectionDesigns.js).
//
// Every set used to draw a Group, a Container, a tab page and a scroll area as an enlarged button,
// filled with the pale colour of a value window on seven sets. Labels carried a plate of their own
// until they became silkscreen, and then a label in a section on those sets read at about 1:1. The
// label test measured lettering against the panel only, which is how that shipped. These measure it
// where it actually sits.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_CONTROL_SETS, getControlSet, normalizeControlSetDefinition, resolveColourValue, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { SECTION_TREATMENTS, SECTION_TYPES, sectionTreatmentFor } from '../src/CE_Application/models/sectionDesigns.js';
import { familyPatchFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(String(hex).slice(-6).slice(at, at + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const transparent = (colour) => String(colour).startsWith('00');

// A translucent face over the panel, as the eye sees it.
function over(fill, base) {
  const a = parseInt(String(fill).slice(0, 2), 16) / 255;
  const ch = (hex, at) => parseInt(String(hex).slice(-6).slice(at, at + 2), 16);
  return 'FF' + [0, 2, 4].map((at) => Math.round(ch(fill, at) * a + ch(base, at) * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// What lettering inside a section of this type actually sits on: the section's face over the
// panel (a translucent one shows the panel through), or the panel through one that draws none.
function behindSection(set, type) {
  const fill = resolveControlForSet(createControl(type), set)._children.Background._children.Fill.colour;
  return over(String(fill).length === 8 ? fill : `FF${fill}`, resolveToken('panel.surface', set));
}

test('a Label inside any section reads in every set: at least 4.5:1 against what it sits on', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const label = resolveControlForSet(createControl('Label'), set)._children;
    const ink = label.Text._children.Fill.colour;
    const plate = label.Background._children.Fill.colour;
    for (const type of SECTION_TYPES) {
      const behind = transparent(plate) ? behindSection(set, type) : plate;
      assert.ok(contrast(ink, behind) >= 4.5, `${set.id} ${type}: ${ink} on ${behind} is ${contrast(ink, behind).toFixed(2)}:1`);
    }
  }
});

test('a section\'s own lettering reads on it, and a tab strip\'s idle and chosen tabs read', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const group = resolveControlForSet(createControl('Group'), set)._children;
    const title = group.Text._children.Fill.colour;
    assert.ok(contrast(title, behindSection(set, 'Group')) >= 4.5, `${set.id} Group title`);
    const tabs = resolveControlForSet(createControl('TabContainer'), set)._children.TabContainer;
    const c = (value) => resolveColourValue(value, set);
    assert.ok(contrast(c(tabs.labelColour), c(tabs.tabColour)) >= 4.5, `${set.id} idle tab ${contrast(c(tabs.labelColour), c(tabs.tabColour)).toFixed(2)}`);
    // Bold UI lettering on a mid-tone checked surface: 3:1, the large-text line.
    assert.ok(contrast(c(tabs.activeLabelColour), c(tabs.activeTabColour)) >= 3, `${set.id} chosen tab ${contrast(c(tabs.activeLabelColour), c(tabs.activeTabColour)).toFixed(2)}`);
  }
});

test('the section surface only ever moves away from the lettering', () => {
  for (const set of BUILT_IN_CONTROL_SETS.filter((s) => s.id !== 'graphite')) {
    const ink = resolveToken('text.primary', set);
    assert.ok(contrast(ink, resolveToken('section.surface', set)) >= contrast(ink, resolveToken('panel.surface', set)) - 0.01, set.id);
  }
});

test('Graphite\'s sections are what they always were', () => {
  const graphite = getControlSet('graphite');
  assert.equal(sectionTreatmentFor(graphite), null);
  for (const type of [...SECTION_TYPES, 'Background']) {
    const keys = Object.keys(familyPatchFor(graphite, type)?.component ?? {});
    assert.deepEqual(keys.filter((key) => /^(Background|Effects)\./.test(key)), [], `${type} gets no frame from Graphite`);
  }
  const container = resolveControlForSet(createControl('Container'), graphite)._children.Background._children;
  assert.equal(container.Border.colour, 'FFFFFFFF');
  assert.equal(container.Fill.colour, 'FF3A3A3A');
});

test('every other set designs its sections, and every treatment is used', () => {
  const used = new Set();
  for (const set of BUILT_IN_CONTROL_SETS.filter((s) => s.id !== 'graphite')) {
    const treatment = sectionTreatmentFor(set);
    assert.ok(SECTION_TREATMENTS.includes(treatment), `${set.id}: ${treatment}`);
    used.add(treatment);
    // No section is a button any more: none keeps the button face's gradient or bevel.
    const group = resolveControlForSet(createControl('Group'), set)._children;
    assert.equal(group.Background._children.Fill.gradientEnabled, false, set.id);
    // The full-panel Background block is the panel's face, not a frame.
    assert.equal(resolveControlForSet(createControl('Background'), set)._children.Background._children.Border.enabled, false, set.id);
  }
  assert.deepEqual([...used].sort(), [...SECTION_TREATMENTS].sort());
});

test('a set read from a file before section.surface existed derives it from its panel', () => {
  const older = normalizeControlSetDefinition({ id: 'amp', tokens: { 'text.primary': 'FFF1E6CC', surface: 'FFEFE3C8' }, panel: { colour: 'FF1C1A17' } });
  assert.match(older.tokens['section.surface'], /^FF[0-9A-F]{6}$/);
  assert.ok(contrast('FFF1E6CC', older.tokens['section.surface']) >= contrast('FFF1E6CC', 'FF1C1A17'));
});
