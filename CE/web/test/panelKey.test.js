// panelKey.test.js — one key for the whole panel, and the six components that can follow it.
//
// The design asked for a panel-level key that the note components read together, with a local
// override. What this pins is the two decisions that make it safe:
//
//   1. FOLLOWING IS A BROADCAST. The panel key is written into each follower's own `key`/`scale`
//      rather than read at render time. Every renderer, editor and export keeps working untouched.
//      If that ever changes, six layout modules and their call sites change with it.
//   2. AN UNMAPPABLE SCALE IS REPORTED, NOT ROUNDED. The panel knows fourteen scales and the
//      components twelve; a panel set to one they cannot name must leave them alone and say so.
//      Rounding to major would have a chord pad quietly playing the wrong mode.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEY_SCALE_SECTIONS, componentScaleName, contextForControl, followsPanelKey, inferPanelContext,
  keyScaleSectionOf, panelKeyPlan, panelMusicalContext, panelScaleIntervals,
} from '../src/CE_Application/utils/panelKey.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { SCALES as COMPONENT_SCALES } from '../src/CE_Application/utils/chordPadLayout.js';
import { createPanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

function noteControl(id, section, { key = 0, scale = 'major', follow = false } = {}) {
  return {
    _children: {
      Core: { id, name: id, controlType: section },
      [section]: { _type: section, key, scale, followPanelKey: follow },
    },
  };
}

// --- the opt-in ---------------------------------------------------------------------------------

test('every note section carries the flag, and it is off', () => {
  // Nothing existing starts re-harmonising because this landed.
  for (const name of KEY_SCALE_SECTIONS) {
    assert.equal(SECTION_DEFAULTS[name].followPanelKey, false, name);
    assert.ok(Object.hasOwn(SECTION_DEFAULTS[name], 'key'), `${name} has no key`);
    assert.ok(Object.hasOwn(SECTION_DEFAULTS[name], 'scale'), `${name} has no scale`);
  }
  assert.equal(KEY_SCALE_SECTIONS.length, 6);
});

test('a control with no key section is simply not a follower', () => {
  const plain = { _children: { Core: { id: 'k', controlType: 'Knob' }, Behavior: { min: 0, max: 1 } } };
  assert.equal(keyScaleSectionOf(plain), null);
  assert.equal(followsPanelKey(plain), false);
  assert.equal(contextForControl({}, plain), null);
});

test('a non-follower keeps its own key even when the panel has one', () => {
  const panel = { musicalContext: { root: 5, scale: 'minor' }, controls: [noteControl('a', 'ChordPad', { key: 2, scale: 'lydian' })] };
  const context = contextForControl(panel, panel.controls[0]);
  assert.deepEqual({ root: context.root, scale: context.scale, following: context.following },
    { root: 2, scale: 'lydian', following: false });
});

test('a follower reads the panel key', () => {
  const panel = { musicalContext: { root: 5, scale: 'minor' }, controls: [noteControl('a', 'Arp', { follow: true })] };
  const context = contextForControl(panel, panel.controls[0]);
  assert.equal(context.root, 5);
  assert.equal(context.scale, 'minor');
  assert.equal(context.following, true);
});

test('a switched-off panel key releases its followers rather than forcing C major', () => {
  const panel = {
    musicalContext: { root: 5, scale: 'minor', enabled: false },
    controls: [noteControl('a', 'Arp', { key: 9, scale: 'dorian', follow: true })],
  };
  const context = contextForControl(panel, panel.controls[0]);
  assert.equal(context.following, false);
  assert.equal(context.root, 9);
  assert.equal(context.scale, 'dorian');
});

// --- the two vocabularies -------------------------------------------------------------------------

test('the two pentatonic spellings are mapped, not guessed', () => {
  // The panel says pentatonicMajor and the components say pentatonicMaj. Written out rather than
  // matched by interval set, because two scales with the same intervals and different names are a
  // naming question and guessing would eventually pick the wrong label for a mode.
  assert.equal(componentScaleName('pentatonicMajor'), 'pentatonicMaj');
  assert.equal(componentScaleName('pentatonicMinor'), 'pentatonicMin');
  assert.equal(componentScaleName('major'), 'major');
  assert.equal(componentScaleName('locrian'), 'locrian');
});

test('a scale the components cannot name maps to nothing', () => {
  assert.equal(componentScaleName('chromatic'), null);
  assert.equal(componentScaleName('wholeTone'), null);
  assert.equal(componentScaleName([0, 3, 7]), null, 'a custom interval set has no component name');
  assert.equal(componentScaleName('nonsense'), null);
});

test('every mapped scale actually exists on the component side', () => {
  // The mapping is a hand-written table; this is what stops it going stale when a scale is renamed.
  for (const name of ['major', 'minor', 'dorian', 'pentatonicMajor', 'pentatonicMinor', 'blues']) {
    const mapped = componentScaleName(name);
    assert.ok(mapped && Object.hasOwn(COMPONENT_SCALES, mapped), `${name} → ${mapped}`);
  }
});

test('an unmappable panel scale leaves the follower alone AND says which scale it was', () => {
  // Rounding to major would have a chord pad quietly playing the wrong mode, which is the kind of
  // bug somebody blames on their ears.
  const panel = {
    musicalContext: { root: 3, scale: 'wholeTone' },
    controls: [noteControl('a', 'ChordPad', { key: 7, scale: 'mixolydian', follow: true })],
  };

  const context = contextForControl(panel, panel.controls[0]);
  assert.equal(context.following, false);
  assert.equal(context.scale, 'mixolydian', 'kept its own');
  assert.equal(context.unsupported, 'wholeTone');

  const plan = panelKeyPlan(panel);
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].reason, /wholeTone/);
});

// --- the broadcast --------------------------------------------------------------------------------

test('a key change plans one patch per follower and skips everyone else', () => {
  const panel = {
    musicalContext: { root: 5, scale: 'pentatonicMinor' },
    controls: [
      noteControl('a', 'ChordPad', { follow: true }),
      noteControl('b', 'Arp', { follow: true }),
      noteControl('c', 'Phrase', { key: 2, scale: 'lydian' }),
    ],
  };
  const plan = panelKeyPlan(panel);
  assert.deepEqual(plan.changes.map((change) => change.controlId), ['a', 'b']);
  assert.deepEqual(plan.changes[0].patch, { key: 5, scale: 'pentatonicMin' },
    'written in the components\' own spelling');
  assert.equal(plan.skipped.length, 0);
});

test('a follower already in the right key produces no patch', () => {
  // A broadcast that rewrote every follower on every keystroke would fill the undo stack with
  // nothing.
  const panel = {
    musicalContext: { root: 9, scale: 'minor' },
    controls: [noteControl('a', 'Recorder', { key: 9, scale: 'minor', follow: true })],
  };
  assert.deepEqual(panelKeyPlan(panel).changes, []);
});

test('the panel key is inferred from what is already there, not assumed to be C major', () => {
  // Writing C major over a panel already in F minor throughout would be a destructive first
  // impression of a convenience feature.
  const panel = {
    controls: [
      noteControl('a', 'ChordPad', { key: 5, scale: 'minor' }),
      noteControl('b', 'Arp', { key: 5, scale: 'minor' }),
      noteControl('c', 'Phrase', { key: 0, scale: 'major' }),
    ],
  };
  assert.deepEqual(inferPanelContext(panel), { root: 5, scale: 'minor', enabled: true });
});

test('inference reads back into the panel vocabulary, not the components\'', () => {
  const panel = { controls: [noteControl('a', 'NoteRibbon', { key: 2, scale: 'pentatonicMin' })] };
  assert.equal(inferPanelContext(panel).scale, 'pentatonicMinor');
});

test('a panel with no note components infers the default', () => {
  assert.deepEqual(inferPanelContext({ controls: [] }), { root: 0, scale: 'major', enabled: true });
});

// --- the document ---------------------------------------------------------------------------------

test('a panel with no key writes none, so a reader never has to tell absent from unused', () => {
  const panel = createPanel('Keys');
  assert.equal(panel.musicalContext, null);
  assert.equal(Object.hasOwn(JSON.parse(serializePanel(panel)), 'musicalContext'), false);

  panel.musicalContext = { root: 7, scale: 'dorian', enabled: true };
  assert.equal(JSON.parse(serializePanel(panel)).musicalContext.root, 7);
});

test('a missing panel context still reads as something usable', () => {
  assert.deepEqual(panelMusicalContext(null), { root: 0, scale: 'major', enabled: true });
  assert.deepEqual(panelScaleIntervals({ musicalContext: { scale: 'minor' } }), [0, 2, 3, 5, 7, 8, 10]);
});
