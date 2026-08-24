// componentDocStatus.test.js — a component doc's status line must agree with the model.
//
// THE FAILURE THIS CATCHES, which is not hypothetical. `listbox-component.md` read
// "Status: **spec / ready to build (single-select MVP)**" at the top while three sections of the
// same file were headed "Implemented feature set 🟢", "Cascading (dependent) selectors 🟢" and
// "Multi-select variant — shipped". `text-input-component.md` said the same thing about a component
// that has a type, an editor and a place on QA-01. Both had been wrong for a long time and nothing
// noticed, because a status line is prose and prose does not fail.
//
// A stale status is worse than none. Someone deciding what to work on reads the top of the file,
// sees "ready to build", and either rebuilds something that exists or skips something that doesn't.
// So the status line is the thing under test: if a component type exists, its doc says shipped; if
// the type is gone, its doc must not.
//
// The map below is deliberately explicit rather than inferred from the filename. Fuzzy matching a
// doc name against a type name looked fine and quietly paired `meter-and-mod-matrix.md` with
// `Meter`, `pad-grid-component.md` with `DrumPads` and `song-mode.md` with nothing at all — a
// mapping that is wrong in a way you cannot see is worse than a table somebody has to maintain.
// Docs NOT in the map are capability or design notes with no single component behind them; they are
// out of scope here rather than silently passing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COMPONENT_TYPES } from '../src/CE_Application/models/componentTypes.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../src/CE_Application/docs');

/** doc basename → the component type it documents. */
export const DOC_COMPONENT = {
  'arpeggiator': 'Arp',
  'chord-pad': 'ChordPad',
  'constraint-cell': 'Constraint',
  'crossfader-component': 'Crossfader',
  'drum-pads': 'DrumPads',
  'envelope-curve-editor': 'Envelope',
  'expression-router': 'Router',
  'gesture-looper': 'Looper',
  'harmoniser': 'Harmoniser',
  'kinetic-modulator': 'Kinetic',
  'knob-component': 'Knob',
  'lcd-display-component': 'LcdDisplay',
  'listbox-component': 'Listbox',
  'macro-and-morph': 'Macro',
  'number-field-component': 'Number',
  'orbit-modulator': 'Orbit',
  'panic': 'Panic',
  'phrase-recorder': 'Recorder',
  'phrase-sequencer': 'Phrase',
  'preset-constellation': 'Constellation',
  'ribbon-component': 'Ribbon',
  'ribbon-keyboard': 'NoteRibbon',
  'setlist': 'Setlist',
  'text-input-component': 'TextInput',
  'timbre-space': 'Timbre',
  'transport': 'Transport',
  'turing-modulator': 'Turing',
  'vector-joystick-component': 'VectorJoystick',
  'zone-splitter': 'SplitZone',
};

/** The status line, which every doc in this folder carries as a blockquote near the top. */
function statusOf(doc) {
  const text = readFileSync(join(DOCS, `${doc}.md`), 'utf8');
  const match = text.match(/Status:\s*\*\*([^*]+)\*\*/);
  return match ? match[1].trim() : null;
}

// "implemented" and "core shipped" are both in use and both mean shipped. Matching the vocabulary
// rather than imposing one: the point is that the line is TRUE, not that it is phrased a house way.
const SAYS_SHIPPED = /\b(shipped|built|implemented|done)\b|🟢/i;
const SAYS_UNBUILT = /\bready to build\b|\bnot (yet )?built\b|\bidea\b|^design\b/i;

test('every documented component type still exists in the model', () => {
  const missing = Object.entries(DOC_COMPONENT)
    .filter(([, type]) => !COMPONENT_TYPES[type])
    .map(([doc, type]) => `${doc}.md → "${type}"`);
  assert.deepEqual(missing, [],
    `a doc documents a component type that no longer exists — retire the doc or fix the map:\n  ${missing.join('\n  ')}`);
});

test('every mapped doc exists on disk', () => {
  const gone = Object.keys(DOC_COMPONENT).filter((doc) => !existsSync(join(DOCS, `${doc}.md`)));
  assert.deepEqual(gone, [], `the map names docs that are not there: ${gone.join(', ')}`);
});

test('a shipped component is not documented as "ready to build"', () => {
  // The exact defect found on 2026-08-23, in two files.
  const wrong = [];
  for (const [doc, type] of Object.entries(DOC_COMPONENT)) {
    const status = statusOf(doc);
    if (!status) { wrong.push(`${doc}.md has no status line at all`); continue; }
    if (COMPONENT_TYPES[type] && SAYS_UNBUILT.test(status) && !SAYS_SHIPPED.test(status)) {
      wrong.push(`${doc}.md says "${status}" but ${type} is a component type`);
    }
  }
  assert.deepEqual(wrong, [], `status lines that contradict the model:\n  ${wrong.join('\n  ')}`);
});

test('a doc does not contradict itself about being shipped', () => {
  // listbox-component.md read "ready to build" at the top while three sections below were headed
  // 🟢. If the body claims shipped, the header cannot claim unbuilt.
  const wrong = [];
  for (const doc of Object.keys(DOC_COMPONENT)) {
    const text = readFileSync(join(DOCS, `${doc}.md`), 'utf8');
    const status = statusOf(doc) ?? '';
    const headings = text.split('\n').filter((line) => /^#{2,3} /.test(line));
    const bodyClaimsShipped = headings.some((h) => SAYS_SHIPPED.test(h));
    if (bodyClaimsShipped && SAYS_UNBUILT.test(status) && !SAYS_SHIPPED.test(status)) {
      wrong.push(`${doc}.md: header says "${status}", but a section heading says shipped`);
    }
  }
  assert.deepEqual(wrong, [], `docs at war with themselves:\n  ${wrong.join('\n  ')}`);
});

test('every component doc carries a status line, mapped or not', () => {
  // The whole folder, not just the mapped ones — a capability note without a status is the same
  // problem, you just cannot cross-check it against the model.
  const all = readdirSync(DOCS).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const bare = all.filter((f) => !/Status:/i.test(readFileSync(join(DOCS, f), 'utf8')));
  assert.deepEqual(bare, [], `component docs with no status line: ${bare.join(', ')}`);
});
