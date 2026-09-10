// designerModel.test.js — the Designer tab's working parts, and the two claims it rests on.
//
// The two source-guard tests at the bottom are the point. This tab exists because the content of
// fourteen components cannot be authored: the properties panel has no drawing surface, and preview
// mode is a rehearsal that puts the document back when it ends. If either stops being true, those
// tests fail and the tab's reason for existing has to be rewritten rather than left standing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import {
  DESIGNER_COMPONENTS,
  designerFor,
  designerForControl,
  controlTypeOf,
  builtDesigners,
  pendingDesigners,
  designerPanelHeight,
  sequencerRows,
  sequencerShape,
  litCells,
  clearRow,
  clearCell,
  setCell,
  fillEvery,
  shiftRow,
  invertRow,
  cellVelocity,
  writeCellVelocity,
  envelopeRows,
  envelopeStages,
  envelopeIsFlat,
  snapTo,
  turingRows,
  writeStep,
  quantizeAll,
  rotateSteps,
  resizeSteps,
  allDesignerFieldLabels,
} from '../src/CE_Application/utils/designerModel.js';
import { cellKey, sequencerPattern, stepNotes } from '../src/CE_Application/utils/stepSequencerLayout.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { setPreviewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';

const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

function seq(pattern = {}) {
  const control = createControl('StepSequencer');
  control._children.StepSequencer.pattern = pattern;
  return control;
}

// --- The registry -----------------------------------------------------------

test('every designable component is listed once, with a section and a shape', () => {
  const types = DESIGNER_COMPONENTS.map((entry) => entry.type);
  assert.equal(new Set(types).size, types.length, 'no duplicates');
  for (const entry of DESIGNER_COMPONENTS) {
    assert.ok(entry.section, `${entry.type} needs a section`);
    assert.ok(entry.shape, `${entry.type} needs a shape`);
    assert.ok(entry.height > 0, `${entry.type} needs a measured height`);
  }
});

test('three designers are built and the rest are named rather than hidden', () => {
  assert.deepEqual(builtDesigners().map((e) => e.type), ['StepSequencer', 'Envelope', 'Turing']);
  assert.equal(pendingDesigners().length, DESIGNER_COMPONENTS.length - 3);
});

test('the measured total is what the design record claims', () => {
  assert.equal(designerPanelHeight(), 8143);
  assert.equal(DESIGNER_COMPONENTS.length, 14);
});

test('a control routes to its designer, and an ordinary control routes to none', () => {
  assert.equal(designerForControl(createControl('StepSequencer'))?.type, 'StepSequencer');
  assert.equal(designerForControl(createControl('Knob')), null);
  assert.equal(designerFor('nope'), null);
  assert.equal(controlTypeOf(createControl('Envelope')), 'Envelope');
  assert.equal(controlTypeOf(null), '');
});

// --- The Step Sequencer: the pattern nothing could write --------------------

test('a fresh Step Sequencer has three tracks, sixteen steps and not one lit cell', () => {
  const control = createControl('StepSequencer');
  const shape = sequencerShape(control);
  assert.equal(shape.steps, 16);
  assert.equal(shape.tracks, 3);
  assert.equal(shape.beatEvery, 4);
  assert.equal(litCells(control), 0, 'this is the state every sequencer in the app ships in');
});

test('a row reads out as cells, and the count follows', () => {
  const control = seq({ [cellKey('t0', 0)]: { on: true, velocity: 100 }, [cellKey('t0', 4)]: { on: true, velocity: 60 } });
  const rows = sequencerRows(control);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].label, 'Kick');
  assert.equal(rows[0].cells.length, 16);
  assert.equal(rows[0].onCount, 2);
  assert.equal(rows[0].cells[4].velocity, 60);
  assert.equal(rows[1].onCount, 0);
  assert.equal(litCells(control), 2);
});

test('four on the floor is one call, and it clears what was there', () => {
  const pattern = fillEvery({ [cellKey('t0', 3)]: { on: true, velocity: 100 } }, 't0', 16, 4);
  const on = Object.keys(pattern).filter((key) => pattern[key].on);
  assert.deepEqual(on.sort(), ['t0:0', 't0:12', 't0:4', 't0:8'].sort());
});

test('and an offset moves it off the beat', () => {
  const pattern = fillEvery({}, 't0', 8, 4, 2);
  assert.deepEqual(Object.keys(pattern).sort(), ['t0:2', 't0:6']);
});

test('filling one row leaves the others alone', () => {
  const start = { [cellKey('t1', 5)]: { on: true, velocity: 100 } };
  const pattern = fillEvery(start, 't0', 8, 4);
  assert.equal(pattern[cellKey('t1', 5)]?.on, true);
});

test('shifting a row wraps, and carries the velocity with it', () => {
  const start = setCell(setCell({}, 't0', 0, 90), 't0', 7, 40);
  const moved = shiftRow(start, 't0', 8, 1);
  assert.equal(moved[cellKey('t0', 1)]?.velocity, 90);
  assert.equal(moved[cellKey('t0', 0)]?.velocity, 40, 'step 7 wrapped to 0');
  assert.equal(moved[cellKey('t0', 7)], undefined);
});

test('shifting by a whole bar is a no-op, and by a negative moves it earlier', () => {
  const start = setCell({}, 't0', 2, 100);
  assert.equal(shiftRow(start, 't0', 8, 8)[cellKey('t0', 2)]?.on, true);
  assert.equal(shiftRow(start, 't0', 8, -2)[cellKey('t0', 0)]?.on, true);
});

test('inverting a row swaps every cell', () => {
  const start = fillEvery({}, 't0', 8, 4);
  const flipped = invertRow(start, 't0', 8);
  assert.equal(flipped[cellKey('t0', 0)], undefined);
  assert.equal(flipped[cellKey('t0', 1)]?.on, true);
  assert.equal(Object.keys(flipped).length, 6);
});

test('clearing a row and a cell each leave the rest standing', () => {
  const start = fillEvery(fillEvery({}, 't0', 8, 2), 't1', 8, 4);
  assert.equal(Object.keys(clearRow(start, 't0', 8)).length, 2);
  assert.equal(Object.keys(clearCell(start, 't0', 0)).length, 5);
});

test('velocity reads back, and only from a lit cell', () => {
  let pattern = setCell({}, 't0', 0, 100);
  assert.equal(cellVelocity(pattern, 't0', 0), 100);
  assert.equal(cellVelocity(pattern, 't0', 1), null);
  pattern = writeCellVelocity(pattern, 't0', 0, 40);
  assert.equal(cellVelocity(pattern, 't0', 0), 40);
  // Out of range is pinned rather than written through: MIDI has no velocity 0 note-on here.
  assert.equal(cellVelocity(writeCellVelocity(pattern, 't0', 0, 999), 't0', 0), 127);
  assert.equal(cellVelocity(setCell({}, 't0', 0, -5), 't0', 0), 1);
});

test('a written cell really is a note the sequencer plays', () => {
  const control = seq(setCell({}, 't1', 3, 77));
  const notes = stepNotes(control, 3);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].note, 38, 'the Snare track');
  assert.equal(notes[0].velocity, 77);
  assert.equal(stepNotes(control, 2).length, 0);
});

// --- The Envelope -----------------------------------------------------------

test('the breakpoints read out with what the panel rows leave out', () => {
  const rows = envelopeRows(createControl('Envelope'));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].isEnd, true);
  assert.equal(rows[3].isEnd, true);
  assert.equal(rows[2].isSustain, true, 'the default preset sustains on node 3');
  assert.equal(rows.filter((row) => row.isSustain).length, 1);
});

test('the stages come out in the unit the component reads out in', () => {
  const stages = envelopeStages(createControl('Envelope'));
  assert.equal(stages.unit, 'ms');
  assert.equal(stages.attackMs, 250, 'the peak is at x = 0.25 of a 1000ms axis');
  assert.equal(stages.decayMs, 250);
  assert.equal(stages.releaseMs, 500);
});

test('a flat curve is reported, because that is what a bad drag leaves', () => {
  assert.equal(envelopeIsFlat(createControl('Envelope')), false);
  const flat = createControl('Envelope');
  flat._children.Envelope.points = [{ id: 'a', x: 0, y: 0.5 }, { id: 'b', x: 1, y: 0.5 }];
  assert.equal(envelopeIsFlat(flat), true);
});

test('snapping is off at zero and rounds otherwise', () => {
  assert.equal(snapTo(0.37, 0), 0.37);
  assert.equal(snapTo(0.37, 0.25), 0.25);
  assert.equal(snapTo(0.4, 0.25), 0.5);
});

// --- The Turing register ----------------------------------------------------

test('the register reads out with the gate the component would fire', () => {
  const rows = turingRows(createControl('Turing'));
  assert.equal(rows.length, 8);
  assert.equal(rows[0].value, 0.2);
  assert.equal(rows[0].gate, false, 'below the 0.5 threshold');
  assert.equal(rows[1].gate, true);
});

test('and with what quantizing does to the numbers, which the panel never shows', () => {
  const control = createControl('Turing');
  control._children.Turing.quantizeLevels = 2;
  const rows = turingRows(control);
  assert.equal(rows[0].value, 0.2, 'stored');
  assert.equal(rows[0].output, 0, 'played');
  assert.equal(rows[1].output, 1);
});

test('writing a step is not gated on the randomness roll, the way mutateStep is', () => {
  const steps = writeStep([0.1, 0.2, 0.3], 1, 0.9);
  assert.deepEqual(steps, [0.1, 0.9, 0.3]);
  assert.deepEqual(writeStep([0.1], 5, 0.9), [0.1], 'an index off the end changes nothing');
  assert.deepEqual(writeStep([0.1], 0, 4), [1], 'and a value off the end is pinned');
});

test('quantizing snaps to the levels the component plays, and 0 or 1 leaves it alone', () => {
  assert.deepEqual(quantizeAll([0, 0.3, 0.5, 0.7, 1], 2), [0, 0, 1, 1, 1]);
  assert.deepEqual(quantizeAll([0.2, 0.8], 0), [0.2, 0.8]);
  assert.deepEqual(quantizeAll([0.26], 5), [0.25]);
});

test('rotating moves the register and keeps every value', () => {
  assert.deepEqual(rotateSteps([1, 2, 3, 4].map((n) => n / 4), 1), [4, 1, 2, 3].map((n) => n / 4));
  assert.deepEqual(rotateSteps([0.1, 0.2], 2), [0.1, 0.2]);
  assert.deepEqual(rotateSteps([0.25, 0.5, 0.75], -1), [0.5, 0.75, 0.25]);
});

test('resizing keeps what is there and pins to the component range', () => {
  assert.deepEqual(resizeSteps([0.1, 0.2], 4, 0.5), [0.1, 0.2, 0.5, 0.5]);
  assert.deepEqual(resizeSteps([0.1, 0.2, 0.3], 2), [0.1, 0.2]);
  assert.equal(resizeSteps([], 1).length, 2, 'two is the floor');
  assert.equal(resizeSteps([], 999).length, 64, 'sixty-four is the ceiling');
});

test('field labels are collected for when the panel rows come out', () => {
  const labels = allDesignerFieldLabels();
  assert.ok(labels.includes('Pattern'));
  assert.equal(new Set(labels).size, labels.length);
});

// --- The two claims the tab rests on ----------------------------------------

test('the Step Sequencer pattern still has no editor anywhere but this tab', () => {
  // 1. The properties panel section edits steps, tempo, tracks and colours, and never the pattern.
  //    (The word "pattern" does appear once, inside a hint about ping-pong direction.)
  const panel = src('sections/StepSequencerEditor.svelte');
  assert.ok(!/set\('pattern'|StepSequencer\.pattern|toggleCell|setCellVelocity/.test(panel),
    'the panel section has grown a pattern editor — rewrite the claim');

  // 2. The preview surface imports the sequencer's CLOCK half and none of its editing half.
  const preview = src('editor/PanelPreviewSurface.svelte');
  const imported = preview.slice(
    preview.indexOf('} from \'../utils/stepSequencerLayout.js\';') - 600,
    preview.indexOf('} from \'../utils/stepSequencerLayout.js\';')
  );
  for (const name of ['toggleCell', 'setCellVelocity', 'cellAtPoint', 'isCellOn']) {
    assert.ok(!imported.includes(name), `preview now imports ${name} — the sequencer is editable there`);
  }

  // 3. And the renderer draws a velocity that nothing but this tab can set.
  const renderer = src('editor/StepSequencerRenderer.svelte');
  assert.match(renderer, /cell\.velocity/, 'the renderer stopped drawing velocity');
});

test('preview is still a rehearsal, so anything drawn there is still thrown away', () => {
  const control = createControl('Phrase');
  control._children.Core.id = 'ctrl_probe';
  panels.set([{ id: 'probe', name: 'P', width: 800, height: 400, bgColour: 'FF1E1E1E', controls: [control] }]);
  activePanelId.set('probe');

  const cells = () => Object.keys(get(panels)[0].controls[0]._children.Phrase.pattern ?? {}).length;
  const before = cells();
  assert.ok(before > 0, 'the Phrase ships with a starter pattern');

  setPreviewModeEnabled(true);
  updateControlProperty('ctrl_probe', 'Phrase.pattern', { '0:0': { velocity: null, tie: false } });
  assert.equal(cells(), 1, 'the drawing lands while preview is running');

  setPreviewModeEnabled(false);
  assert.equal(cells(), before, 'and is gone the moment preview stops — this is why the tab exists');
});
