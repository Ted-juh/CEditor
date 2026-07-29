// componentEnums.test.js — a component verb may only offer what the component reads.
//
// This is the regression test for the largest defect §44 found. componentVerbs.js carried its enum
// values as hand-typed literals beside the components, and TWENTY-FOUR of the twenty-eight enum
// verbs were wrong — in both directions, silently:
//
//   arpPattern(a, "converge") stored a pattern the Arpeggiator has never had (it played "up")
//   arpPattern(a, "chord")    was REFUSED, and is one the Arpeggiator does have
//   arpDivision offered eight of the transport's fourteen note values, while ce.time.divisions()
//     — same panel, same script — already answered from all fourteen
//   envelopePreset offered "asr"/"dadsr"/"custom", none of which envelopePreset() has a case for,
//     and hid "dahdsr"/"mseg"/"free", which it does
//   constraintMode offered "max"/"ordered" and hid "order"/"ratio"/"mirror"
//
// Nothing failed. No test asserted the values, so the literals could say anything.
//
// So the values now come from componentTables.js, which imports the table the component's own
// switch reads — and this file is what makes that binding load-bearing rather than a convention.
// It asserts three things: that every enum verb's values ARE the app's table by identity, that no
// enum verb exists without an entry, and that the two tables with no util module to import from
// (the LCD's scroll, the Pixel display's animation mode) match the `<select>` the editor renders.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COMPONENT_FAMILIES, COMPONENT_VERBS } from '../src/CE_Application/scripting/componentVerbs.js';
import {
  VERB_VALUES, HAND_WRITTEN_VALUES, LCD_SCROLLS, LCD_CURSORS, PIXEL_ANIM_MODES,
} from '../src/CE_Application/scripting/componentTables.js';
import { MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';

const here = dirname(fileURLToPath(import.meta.url));
const sections = join(here, '..', 'src', 'CE_Application', 'sections');

/** Every enum verb across the twenty-three spec-driven families. */
const enumVerbs = COMPONENT_VERBS.filter((v) => v.k === 'enum' || v.kind === 'enum');

/* ------------------------------------------------------------------ the binding */

test('every enum verb offers exactly the table the component reads, by identity', () => {
  for (const verb of enumVerbs) {
    const key = `${verb.family}.${verb.v}`;
    const table = VERB_VALUES[key];
    assert.ok(table, `${key} is an enum with no entry in VERB_VALUES`);
    // Identity, not deepEqual: a copy would drift the moment the app's table changed, which is
    // precisely how the twenty-four got out of step.
    assert.equal(verb.values, table, `${key} does not offer the app's own table`);
  }
});

test('an enum verb with no table throws at import rather than offering nothing', () => {
  // The guard in componentVerbs.js. Its value is that a verb added without a table is a build
  // error, not an enum that silently refuses everything — which is what an empty list would be.
  const missing = enumVerbs.filter((v) => !Array.isArray(v.values) || !v.values.length);
  assert.deepEqual(missing.map((v) => `${v.family}.${v.v}`), []);
});

test('every VERB_VALUES entry belongs to a real verb, so the table cannot rot either', () => {
  const known = new Set(COMPONENT_VERBS.map((v) => `${v.family}.${v.v}`));
  const orphans = Object.keys(VERB_VALUES).filter((k) => !known.has(k));
  assert.deepEqual(orphans, [], 'a table entry with no verb is a value nobody can ask for');
});

/* --------------------------------------------------- the values themselves, spelled out */

test('the values that used to be wrong are the component’s own', () => {
  // Named rather than derived, because the point is the specific regression. Every one of these
  // was either offered-and-ignored or refused-and-real before §44.
  const byKey = Object.fromEntries(enumVerbs.map((v) => [`${v.family}.${v.v}`, v.values]));

  assert.ok(byKey['arp.pattern'].includes('chord'), 'the Arpeggiator has a block-chord pattern');
  for (const gone of ['converge', 'diverge']) {
    assert.ok(!byKey['arp.pattern'].includes(gone), `the Arpeggiator has no "${gone}" pattern`);
  }
  assert.ok(byKey['arp.division'].includes('1/8D'), 'the transport has dotted divisions');
  assert.equal(byKey['arp.division'].length, 14);
  assert.deepEqual(byKey['arp.chordType'], ['triad', 'seventh'],
    'the pads only distinguish seventh from everything else');
  assert.deepEqual(byKey['chordpad.voicing'], ['close', 'spread', 'drop2']);
  assert.deepEqual(byKey['chordpad.mode'], ['chords', 'notes']);
  assert.ok(byKey['noteribbon.mode'].includes('chromatic'));
  assert.ok(!byKey['noteribbon.mode'].includes('bend'));
  assert.ok(byKey['drumpads.mode'].includes('oneShot'));
  assert.ok(!byKey['drumpads.mode'].includes('gate'));
  assert.deepEqual(byKey['constraint.mode'], ['sum', 'order', 'ratio', 'mirror', 'free']);
  assert.deepEqual(byKey['crossfader.law'], ['linear', 'equalPower', 'sharp']);
  assert.ok(byKey['envelope.preset'].includes('dahdsr'));
  assert.ok(!byKey['envelope.preset'].includes('asr'));
  assert.ok(byKey['envelope.pointCurve'].includes('scurve'));
  assert.ok(!byKey['envelope.pointCurve'].includes('s'), '"s" is not a curve envWarp has a case for');
  assert.ok(byKey['macro.slotCurve'].includes('scurve'));
  assert.ok(byKey['ribbon.returnMode'].includes('rest'));
  assert.ok(!byKey['ribbon.returnMode'].includes('zero'));
  assert.ok(byKey['router.source'].includes('polyAftertouch'));
  assert.ok(!byKey['router.source'].includes('pitchbend'));
  assert.deepEqual(byKey['router.poly'], ['highest', 'last']);
  assert.ok(byKey['transport.source'].includes('external'));
  assert.ok(!byKey['transport.source'].includes('tap'));
  assert.ok(!byKey['panic.scope'].includes('panel'));
  assert.ok(!byKey['lcd.scroll'].includes('auto'));
  assert.ok(byKey['pixel.anim'].includes('file'));
  assert.ok(!byKey['pixel.anim'].includes('sprite'));
});

test('beatUnit is a number, because the transport clamps any integer', () => {
  // It was an enum of six, so a script could not write 3/4's 3 or 12/8's 12 — both of which the
  // transport accepts and the editor's own number input offers.
  const verb = COMPONENT_VERBS.find((v) => v.id === 'transportBeatUnit');
  assert.equal(verb.k, 'int');
  assert.equal(verb.min, 1);
  assert.equal(verb.max, 32);
});

/* -------------------------------------- the two with no util module: pinned to the editor */

/** Every `<option value="…">` of the first `<select>` bound to `field` in an editor. */
function editorOptions(file, field) {
  const source = readFileSync(join(sections, file), 'utf8');
  const at = source.indexOf(`set('${field}'`);
  assert.notEqual(at, -1, `${file} has no picker writing ${field}`);
  const close = source.indexOf('</select>', at);
  assert.notEqual(close, -1, `${file}'s ${field} picker is not a <select>`);
  return [...source.slice(at, close).matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
}

test('the LCD and Pixel tables match the picker the editor renders', () => {
  // These two components have no layout module, so their values cannot be imported from the code
  // that consumes them. Derived by test instead of by import: the editor's own `<select>` is the
  // list of what the component understands, and this reads it out of the .svelte source.
  assert.deepEqual(LCD_SCROLLS, editorOptions('DisplayEditor.svelte', 'scroll'));
  assert.deepEqual(LCD_CURSORS, editorOptions('DisplayEditor.svelte', 'cursor'));
  assert.deepEqual(PIXEL_ANIM_MODES, editorOptions('PixelDisplayEditor.svelte', 'animMode'));
});

/* ------------------------------------------- the five hand-written families' documentation */

test('the hand-written families’ summaries name values their reducers accept', () => {
  // A different flavour of the same defect: these five validate against the app's tables at
  // runtime and their DOCUMENTATION named values that do not exist. harmonyOutOfKey was described
  // as "skip"/"nearest"/"pass" where the engine has pass/nearest/mute, so a script author
  // following the contract wrote "skip" and got nothing.
  for (const [id, key] of [
    ['harmonyMode', 'harmony.mode'], ['harmonyVoicing', 'harmony.voicing'],
    ['harmonyOutOfKey', 'harmony.outOfKey'], ['harmonyVoiceLeading', 'harmony.voiceLeading'],
    ['recorderSource', 'recorder.source'],
  ]) {
    const summary = MEMBER_BY_ID[id].summary;
    for (const value of HAND_WRITTEN_VALUES[key]) {
      assert.ok(summary.includes(`"${value}"`), `${id} does not mention "${value}"`);
    }
    // …and names nothing else. A quoted word in one of these summaries is a value or it is a lie.
    const quoted = [...summary.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(quoted.filter((q) => !HAND_WRITTEN_VALUES[key].includes(q)), [],
      `${id} names a value its reducer refuses`);
  }
});

/* ---------------------------------------------------------------- nothing was left behind */

test('every family still declares at least one verb, and every verb a section that exists', () => {
  for (const fam of COMPONENT_FAMILIES) {
    assert.ok(fam.verbs.length, `${fam.id} has no verbs`);
    for (const verb of fam.verbs) assert.equal(verb.section ?? fam.section, fam.section);
  }
});
