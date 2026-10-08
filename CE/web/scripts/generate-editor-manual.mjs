// generate-editor-manual.mjs — emit the CEditor user manual.
//
// The manual is written prose — editor-manual.template.md, beside this script — with two reference
// tables filled in from the program's own data, so they cannot drift from what the editor does:
//
//   {{COMPONENT_CATALOGUE}}  the insert catalogue (models/insertCatalog.js), the same list the
//                            icon rail and the Insert menu are built from, each with a sentence
//                            saying what the component is for;
//   {{SHORTCUTS}}            the keyboard shortcuts and pointer gestures (utils/shortcutSheet.js),
//                            the same rows the F1 panel shows.
//
// The last editor manual was generated too, by a script that was never committed, and it went
// stale within weeks: the editor replaced the two files it read and nothing failed. This one has a
// freshness test (test/editorManual.test.js), and it throws when a component joins the catalogue
// without a description, so a new component cannot quietly go undocumented.
//
// The data modules import app stores, which need the same module resolution the tests use, so run
// it through the test loader: `npm run docs:editor` in CE/web.
//
// Output: docs/editor-manual.md (repo root).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { INSERT_CATEGORIES } from '../src/CE_Application/models/insertCatalog.js';
import { shortcutSections } from '../src/CE_Application/utils/shortcutSheet.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = resolve(HERE, '../../../docs/editor-manual.md');
export const TEMPLATE = resolve(HERE, 'editor-manual.template.md');

/** One or two sentences per insertable component, keyed by component type. */
export const COMPONENT_NOTES = {
  // Layout & Display
  Background: 'A plain area of colour, gradient or picture to put behind other controls.',
  Label: 'A piece of text: a heading, a section name, a caption under a knob.',
  TextInput: 'A box the user can type into, such as a patch name.',
  Container: 'An invisible box that holds other controls, so they move together.',
  Group: 'A container with a visible frame and a title — the box around an "Oscillator" or "Filter" section.',
  TabContainer: 'A container with tabs along the top; each tab holds its own set of controls.',
  ScrollArea: 'A container whose contents can be larger than the box and are scrolled into view.',
  Image: 'A picture: a logo, a photo of the hardware, a hand-drawn decoration.',
  LcdDisplay: 'A character display in the style of a synth\'s LCD screen, with lines of text, a backlight and scrolling.',
  PixelDisplay: 'A dot-matrix display made of individual pixels, for small graphics and text.',
  Meter: 'A level meter that shows a value as a bar or a needle.',
  ProgressBar: 'A bar that fills up to show how far something has got.',
  Shape: 'A drawn shape: a rectangle, ellipse, line, triangle, star, arrow and more.',
  // Buttons & Choices
  MomentaryButton: 'A button that is on only while it is held down.',
  ToggleButton: 'A button that switches on with one click and off with the next.',
  RadioButtonGroup: 'A row of buttons of which exactly one is on — for choosing one setting out of a few.',
  CyclicButton: 'A single button that steps through a list of settings each time it is clicked.',
  Combobox: 'A drop-down list for choosing one setting out of many.',
  Listbox: 'A list that shows several settings at once, one of which is chosen.',
  TimedButton: 'A button that acts only when it is held down for a moment (or double-clicked), so it cannot be pressed by accident.',
  OneShotButton: 'A button that acts once and then switches itself off for a while, so a message cannot be sent twice by accident.',
  // Values & Sliders
  Slider: 'A straight fader, vertical or horizontal.',
  Knob: 'A rotary control.',
  Range: 'A slider with two handles, for setting a lowest and a highest value.',
  Number: 'A value shown as a number, changed by dragging on it.',
  Crossfader: 'A slider that blends between two sides, A and B.',
  Numpad: 'A keypad for typing a number, such as a program number.',
  Ribbon: 'A touch strip that follows your finger, and can spring back when you let go.',
  PitchWheel: 'A pitch-bend wheel that springs back to the centre.',
  ModWheel: 'A modulation wheel that stays where you leave it.',
  Macro: 'One control that moves several parameters at once, each by its own amount.',
  VectorJoystick: 'A two-dimensional pad with a puck, for moving two values (or blending four sounds) at once.',
  CustomComponent: 'A component you design yourself from parts, in the Designer.',
  // Modulation & Routing
  Envelope: 'A drawn envelope with breakpoints you can drag, such as an attack-decay-sustain-release shape.',
  Matrix: 'A modulation matrix: a grid of sources against destinations, with an amount in each cell.',
  Orbit: 'Points circling a centre at their own speeds, each producing a moving value.',
  Looper: 'Records the movement of a control and plays it back in a loop.',
  Router: 'Takes one incoming value, such as an expression pedal, and sends it to several destinations, each shaped its own way.',
  Timbre: 'A pad with anchor points; moving the puck blends between the sounds placed at the anchors.',
  Turing: 'A random sequence that can be locked so it repeats, after the Turing Machine module.',
  Kinetic: 'A ball that bounces around a box under gravity; its position becomes values.',
  Constellation: 'A map of presets as points; moving between them blends or snaps from one to the next.',
  Constraint: 'A group of values that always add up to the same total: move one, and the others make room.',
  // Music & Performance
  Keyboard: 'A playable piano keyboard.',
  StepSequencer: 'A row of steps, each with its own value, played in time.',
  ChordPad: 'Pads that each play a chord from a chosen key and scale.',
  Arp: 'An arpeggiator: plays the notes you hold one after another, in a pattern.',
  NoteRibbon: 'A strip you slide along to play notes, kept in a chosen scale.',
  DrumPads: 'A grid of pads for playing drums, each sending its own note.',
  Phrase: 'A step grid whose rows are the notes of a scale, for writing short phrases.',
  Recorder: 'Records the notes you play and loops them.',
  Harmoniser: 'Plays a whole chord from a single note you press.',
  SplitZone: 'Splits a keyboard into zones, each with its own channel and transpose.',
  Setlist: 'A list of scenes you step through during a performance, for example with a footswitch.',
  Transport: 'The panel\'s master clock: tempo, play and stop.',
  Panic: 'A button that silences every stuck note on every channel.',
};

/* ------------------------------------------------------------------ the tables */

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function componentCatalogue() {
  const listed = new Set();
  const sections = INSERT_CATEGORIES.map((category) => {
    const rows = category.items.map((item) => {
      const note = COMPONENT_NOTES[item.type];
      if (!note) {
        throw new Error(`generate-editor-manual: "${item.type}" is in the insert catalogue with no `
          + 'entry in COMPONENT_NOTES — say in a sentence what it is for');
      }
      listed.add(item.type);
      return `| **${cell(item.label)}** | ${cell(note)} |`;
    });
    return `### ${category.label}\n\n| Component | What it is for |\n|---|---|\n${rows.join('\n')}`;
  });
  const stale = Object.keys(COMPONENT_NOTES).filter((type) => !listed.has(type));
  if (stale.length) {
    throw new Error(`generate-editor-manual: COMPONENT_NOTES describes ${stale.join(', ')}, which the `
      + 'insert catalogue no longer offers');
  }
  return sections.join('\n\n');
}

/** Rows that read differently on a page than in the F1 panel, where "this panel" is the panel itself. */
const PAGE_WORDING = { 'Close this panel': 'Close the F1 shortcuts list' };

function shortcutTables() {
  return shortcutSections().map(({ title, shortcuts }) => {
    const rows = shortcuts.map(([keys, description]) => `| ${cell(keys)} | ${cell(PAGE_WORDING[description] ?? description)} |`);
    return `### ${title}\n\n| Keys | What it does |\n|---|---|\n${rows.join('\n')}`;
  }).join('\n\n');
}

/* ------------------------------------------------------------------ the page */

export function generateEditorManual(template = readFileSync(TEMPLATE, 'utf8').replace(/\r\n/g, '\n')) {
  const fills = {
    COMPONENT_CATALOGUE: componentCatalogue(),
    SHORTCUTS: shortcutTables(),
  };
  const out = template.replace(/\{\{(\w+)\}\}/g, (whole, name) => {
    if (!(name in fills)) throw new Error(`generate-editor-manual: unknown placeholder ${whole}`);
    return fills[name];
  });
  for (const name of Object.keys(fills)) {
    if (!template.includes(`{{${name}}}`)) {
      throw new Error(`generate-editor-manual: the template has no {{${name}}}`);
    }
  }
  return out;
}

/* --------------------------------------------------------------------- main */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, generateEditorManual());
  console.log(`wrote ${OUT}`);
}
