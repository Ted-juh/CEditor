// componentCoverage.test.js — how much of each component the script surface actually describes.
//
// The Drum Pads shipped for a long time with verbs for eight of their twenty-three fields. Nothing
// said so. Every test passed, every verb worked, and the fifteen that were missing — including the
// choke groups, which are what makes a drum grid a drum grid — were invisible because a gap has no
// symptom. You cannot fail a test for a verb nobody wrote.
//
// So this is the test for the gap itself. It compares every family's verbs against the model
// section they write, and holds the difference to a stated rule rather than to a number:
//
//   STYLING is out.       Colours, palettes, tints. componentVerbs.js draws that line at the top of
//                         the file and no family crosses it. set() still addresses them.
//   GEOMETRY is out.      Padding, spacing, radii, tick widths — the pixel-level layout you nudge
//                         once in the inspector and never touch while playing.
//   EVERYTHING ELSE IS IN, or is named below with a reason. The list of exemptions is itself
//                         asserted, so a name left there after its field went away cannot quietly
//                         excuse the next real gap.
//
// The point is not the numbers. It is that adding a field to a component now forces a decision:
// give it a verb, or write down here why it does not get one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { COMPONENT_FAMILIES } from '../src/CE_Application/scripting/componentVerbs.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

/** Styling: what a thing looks like, not what it does. */
const isStyling = (field) => /colour$|color$|^palette$|tint$|Bg$/i.test(field);

/** Geometry: the pixel-level layout of a control's own furniture. */
const GEOMETRY = new Set([
  'segmentGap', 'thickness', 'rounded', 'tickCount', 'majorTickCount', 'minorTickCount',
  'handleSize', 'indicatorSize', 'puckRadius', 'nodeRadius', 'lineWidth', 'trailLength',
  'rowHeaderW', 'colHeaderH', 'charSpacing', 'lineSpacing', 'padding', 'fontScale',
  'dotMatrix', 'dotShape', 'dotPitch', 'snapGrid', 'gridDiv', 'gridX', 'gridY',
  'scrollGap', 'segments', 'labelPosition', 'arcStart', 'arcSweep',
]);

/**
 * Fields with no verb and a reason. Each entry is a promise that the omission was decided rather
 * than missed — and the reason is checked by a human reading it, which is the only check there is.
 */
const EXEMPT = {
  // Authoring surfaces: what the inspector is FOR. A script that rewrote a display's page layout
  // mid-song is not a performance, it is a different panel.
  'lcd.fields': 'a display layout is an authoring surface, not a performance one',
  'lcd.layouts': 'ditto',
  'lcd.pages': 'ditto',
  'pixel.elements': 'ditto',
  'pixel.layouts': 'ditto',
  'pixel.pages': 'ditto',
  'pixel.customFont': 'a font file, chosen once',
  // Text-entry plumbing: the state of an editing session, owned by the editor.
  'lcd.editText': 'the state of an in-progress edit, owned by the editor',
  'lcd.editCharset': 'ditto',
  'lcd.editMaxLength': 'ditto',
  'lcd.activeScope': 'ditto',
  'pixel.editText': 'ditto',
  'pixel.editCharset': 'ditto',
  'pixel.editMaxLength': 'ditto',
  'pixel.activeScope': 'ditto',
  // Asset paths. ce.image addresses images; a second spelling here would be a worse one.
  'lcd.imageSrc': 'ce.image is how a script addresses an image',
  'lcd.animSrc': 'ditto',
  'lcd.imageDither': 'ditto',
  'lcd.animFrames': 'ditto',
  'pixel.imageSrc': 'ditto',
  'pixel.animSrc': 'ditto',
  'pixel.imageDither': 'ditto',
  'pixel.animFrames': 'ditto',
  'pixel.animSpriteCols': 'ditto',
  // Hardware description: what KIND of display this is. Changing it mid-set is not a gesture.
  'lcd.panelType': 'what kind of display this is — a build-time choice',
  'lcd.segmentType': 'ditto',
  'lcd.pixelWidth': 'ditto',
  'lcd.pixelHeight': 'ditto',
  'lcd.rows': 'ditto',
  'lcd.cols': 'ditto',
  'pixel.pixelsW': 'ditto',
  'pixel.pixelsH': 'ditto',
  // Wiring one control to another. A real gap, and a design rather than a verb: the field holds a
  // control ID and scripts address controls by NAME, so it needs a resolver, not a setter.
  'arp.linkId': 'wiring by control id — needs a name resolver, not a setter (open)',
  'router.sourceControlId': 'ditto (open)',
  'envelope.phaseSourceId': 'ditto (open)',
  'meter.valueSourceId': 'ditto (open)',
  'lcd.brightnessSourceId': 'ditto (open)',
  'lcd.backlightSourceId': 'ditto (open)',
  'lcd.valueSourceId': 'ditto (open)',
  'pixel.brightnessSourceId': 'ditto (open)',
  'pixel.backlightSourceId': 'ditto (open)',
  // Stored and read by NOTHING. Found by the same audit that produced this test: the Envelope
  // editor has no control for any of the three and no renderer mentions them. A verb for a field
  // nobody reads would be a lie in the reference, so they stay out until something consumes them.
  'envelope.xLabel': 'stored and read by nothing — no editor control, no renderer use',
  'envelope.yLabel': 'ditto',
  'envelope.timeUnit': 'ditto',
  // Collections whose shape belongs to the component's own editor.
  'timbre.targets': 'the morph targets a Timbre pad blends between — an authoring choice (open)',
  'constellation.targets': 'ditto (open)',
  'constellation.presets': 'ditto (open)',
  'matrix.rows': 'the matrix names its own axes from the panel (open)',
  'matrix.cols': 'ditto (open)',
};

/** Every field of a family's section that no verb writes. */
function uncovered(fam) {
  const fields = Object.keys(SECTION_DEFAULTS[fam.section] ?? {}).filter((k) => !k.startsWith('_'));
  const written = new Set();
  for (const verb of fam.verbs) {
    for (const f of [verb.f, verb.fx, verb.fy]) if (f) written.add(f);
  }
  return fields.filter((f) => !written.has(f));
}

test('every component field has a verb, is styling, is geometry, or is exempt with a reason', () => {
  const undecided = [];
  for (const fam of COMPONENT_FAMILIES) {
    for (const field of uncovered(fam)) {
      if (isStyling(field) || GEOMETRY.has(field)) continue;
      if (EXEMPT[`${fam.id}.${field}`]) continue;
      undecided.push(`${fam.id}.${field}`);
    }
  }
  assert.deepEqual(undecided, [],
    'component fields a script cannot reach and nothing explains:\n  '
    + `${undecided.join('\n  ')}\n\nGive each one a verb, or add it to EXEMPT with a reason.`);
});

test('nothing is exempt or excluded from a field that no longer exists', () => {
  // The other half, and the one that rots. A name left in either list after its field went away
  // silently excuses the next real gap that happens to share it.
  const real = new Set();
  for (const fam of COMPONENT_FAMILIES) {
    for (const f of Object.keys(SECTION_DEFAULTS[fam.section] ?? {})) real.add(`${fam.id}.${f}`);
  }
  assert.deepEqual(Object.keys(EXEMPT).filter((k) => !real.has(k)), [],
    'EXEMPT names a field no component has');

  const anyField = new Set();
  for (const fam of COMPONENT_FAMILIES) {
    for (const f of Object.keys(SECTION_DEFAULTS[fam.section] ?? {})) anyField.add(f);
  }
  assert.deepEqual([...GEOMETRY].filter((f) => !anyField.has(f)), [],
    'GEOMETRY names a field no component has');
});

test('editable and the show flags are derived, not written out per family', () => {
  // Twenty-two sections carry `editable` with one meaning, and every optional thing a component
  // draws has a `showX`. They were missing from every family at once, which is the signature of a
  // rule rather than of twenty-two separate oversights — so they come from the model, and a
  // component added tomorrow gets them without anybody remembering.
  for (const fam of COMPONENT_FAMILIES) {
    const defaults = SECTION_DEFAULTS[fam.section] ?? {};
    const written = new Set(fam.verbs.map((verb) => verb.f).filter(Boolean));
    for (const field of Object.keys(defaults)) {
      if (typeof defaults[field] !== 'boolean') continue;
      if (field !== 'editable' && !/^show[A-Z]/.test(field)) continue;
      assert.ok(written.has(field), `${fam.id}.${field} has no verb — the derivation missed it`);
    }
  }
  // And they are BOOL toggles, so one footswitch does both jobs.
  const editable = COMPONENT_FAMILIES
    .filter((f) => 'editable' in (SECTION_DEFAULTS[f.section] ?? {}))
    .map((f) => f.verbs.find((verb) => verb.f === 'editable'));
  assert.ok(editable.length >= 20, 'editable should be nearly universal');
  for (const verb of editable) assert.equal(verb.k, 'bool');
  for (const verb of editable) assert.equal(verb.toggle, true);
});
