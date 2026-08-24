// remainingComponents.test.js — the last of the backlog's components.
//
// The row listed nine. Two (Group, Image) had shipped; the other seven are here. What this pins is
// mostly the decisions:
//
//   * ProgressBar, PitchWheel and ModWheel are their OWN controlTypes over an existing engine —
//     the way Knob is its own type over the slider family. They shipped first as catalog presets
//     and were promoted, because a preset forgets itself the moment it is inserted: the identity
//     has to survive into the inspector, the saved file, and anything that walks a panel;
//   * Shape is the one where a type buys more than identity — a Background cannot be an ellipse at
//     an arbitrary aspect ratio, a line at an angle, or a polygon;
//   * the keyboard reuses the Zone Splitter's key geometry rather than growing its own, because two
//     keyboards on one panel must not disagree about where middle C is;
//   * a scroll area measures its own extent from its children, because an author-set one goes stale.

import test from 'node:test';
import assert from 'node:assert/strict';

import { INSERT_CATEGORIES } from '../src/CE_Application/models/insertCatalog.js';
import { COMPONENT_TYPES } from '../src/CE_Application/models/componentTypes.js';
import {
  METER_FAMILY, RIBBON_FAMILY, isMeterFamily, isRibbonFamily,
} from '../src/CE_Application/models/componentFamilies.js';
import {
  SHAPE_KINDS, shapeNeedsRoundCap, shapePath, shapeStrokeDash, shapeTakesFill,
} from '../src/CE_Application/utils/shapePrimitives.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { getComponentPorts } from '../src/CE_Application/models/componentPorts.js';
import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import {
  keyboardGlide, keyboardHold, keyboardKeys, keyboardNoteAt, keyboardPress, keyboardRange,
} from '../src/CE_Application/utils/keyboardLayout.js';
import {
  STEP_DIRECTION, advanceStep, beatLines, cellAtPoint, gateMs, sequencerGeometry, stepMs,
  stepNotes, toggleCell,
} from '../src/CE_Application/utils/stepSequencerLayout.js';
import {
  activePageIndex, childPageId, isChildOnActivePage, tabAtPoint, tabGeometry, tabPages, tabRect,
} from '../src/CE_Application/utils/tabContainerLayout.js';
import {
  clampScroll, contentExtent, isChildVisible, maxScroll, scrollByWheel, thumbRect,
} from '../src/CE_Application/utils/scrollAreaLayout.js';

const allItems = INSERT_CATEGORIES.flatMap((category) => category.items);

function control(type, section, patch = {}) {
  return {
    _children: {
      Core: { id: 'c1', name: type, controlType: type },
      [section]: { ...JSON.parse(JSON.stringify(SECTION_DEFAULTS[section])), ...patch },
    },
  };
}

/**
 * A container with children, in the shape the model actually uses.
 *
 * `_children.Children._children`, keyed by id, and every child carries a `Core` — `getChildControls`
 * filters on it. Worth a helper rather than a literal per test, because the previous fixtures
 * invented a `children: []` array that no control has ever had, and everything built on them tested
 * the fixture instead of the component.
 */
function withChildren(container, transforms) {
  const kids = {};
  transforms.forEach((transform, index) => {
    const id = `k${index}`;
    kids[id] = { _children: { Core: { id, name: id, controlType: 'Label' }, Transform: transform } };
  });
  return {
    ...container,
    _children: { ...container._children, Children: { _children: kids } },
  };
}

// --- the three promoted from presets to their own types ---------------------------------------

test('ProgressBar is its own type over the Meter engine, not a second Meter', () => {
  // A preset is a starting position and forgets itself the instant it is inserted; a type stays a
  // type in the inspector, in the file, and to anything that walks a panel asking what is on it.
  // No new SECTION though — a determinate bar and a level meter differ in their settings, not in
  // what they need to store, and a second twenty-field section would be a copy that drifts.
  assert.ok(COMPONENT_TYPES.ProgressBar, 'no ProgressBar type');
  assert.ok(COMPONENT_TYPES.ProgressBar.sections.includes('Meter'));
  assert.equal(isMeterFamily('ProgressBar'), true, 'it must be drawn by the meter renderer');
  assert.deepEqual(getComponentPorts('ProgressBar').map((port) => port.id), ['level'],
    'a family member inherits its engine\'s ports rather than shipping with none');

  const defaults = COMPONENT_TYPES.ProgressBar.defaultOverrides.Meter;
  assert.equal(defaults.peakHold, false, 'a known quantity has no peak to hold');
  assert.equal(defaults.zones.length, 1, '40% of a file copied is not "amber", it is 40%');
});

test('the two wheels are two types, because the spring IS the difference', () => {
  // A pitch wheel that stayed where you left it is broken; a mod wheel that sprang back is broken.
  // Two names for two instruments beats one name and a setting somebody can get wrong twice.
  assert.equal(COMPONENT_TYPES.PitchWheel.defaultOverrides.Ribbon.returnMode, 'center');
  assert.equal(COMPONENT_TYPES.PitchWheel.defaultOverrides.Ribbon.bipolar, true);
  assert.equal(COMPONENT_TYPES.ModWheel.defaultOverrides.Ribbon.returnMode, 'none');
  assert.equal(COMPONENT_TYPES.ModWheel.defaultOverrides.Ribbon.bipolar, false);

  for (const type of ['PitchWheel', 'ModWheel']) {
    assert.equal(isRibbonFamily(type), true, type);
    assert.ok(COMPONENT_TYPES[type].sections.includes('Ribbon'), type);
    assert.equal(COMPONENT_TYPES[type].defaultOverrides.Ribbon.style, 'wheel', type);
    // One scalar stored 0..1. The bipolar flag changes the readout, not the stored domain, so
    // exporting -1..1 would hand a host a range the control does not hold.
    assert.deepEqual(COMPONENT_TYPES[type].exportValues,
      [{ field: 'value', section: 'Ribbon', kind: 'float' }], type);
  }
});

test('the Ribbon itself is still the Ribbon', () => {
  // Promoting two presets must not have quietly re-specialised the thing they were presets of.
  assert.equal(COMPONENT_TYPES.Ribbon.defaultOverrides.Ribbon, undefined);
  assert.equal(isRibbonFamily('Ribbon'), true);
  assert.equal(isMeterFamily('Meter'), true);
  assert.equal(isRibbonFamily('Knob'), false);
  assert.equal(isMeterFamily('Knob'), false);
});

test('a family is the one place a member is added', () => {
  // The surfaces ask "is this drawn by the meter renderer", not "is this called Meter". If that
  // ever goes back to string comparison, a new family member ships invisible.
  assert.deepEqual([...METER_FAMILY].sort(), ['Meter', 'ProgressBar']);
  assert.deepEqual([...RIBBON_FAMILY].sort(), ['ModWheel', 'PitchWheel', 'Ribbon']);
  assert.equal(isMeterFamily(undefined), false);
  assert.equal(isMeterFamily('SomethingFromTheFuture'), false);
});

// --- Shape, the one where a type buys more than identity -----------------------------------------

test('Shape draws things a Background cannot', () => {
  // A Background is a rectangle, and past half its width a stadium. It is never an ellipse at an
  // arbitrary aspect ratio, a line at an angle, or a polygon.
  assert.ok(COMPONENT_TYPES.Shape, 'no Shape type');
  assert.deepEqual(COMPONENT_TYPES.Shape.exportValues, [], 'decoration holds no value');

  const ellipse = shapePath({ kind: 'ellipse', strokeWidth: 0, strokeEnabled: false }, 200, 60);
  assert.match(ellipse, /^M .* A .* A .* Z$/, 'two arcs — a single 360 arc draws nothing');
  assert.match(ellipse, /A 100 30 /, 'the radii follow the box, so it is an oblong ellipse');

  const line = shapePath({ kind: 'line', strokeEnabled: false }, 100, 40);
  assert.equal(line, 'M 0 0 L 100 40', 'corner to corner: dragging the box aims the line');
});

test('the polygon library is READ, not redefined', () => {
  // shapeGeometry.js already holds twelve polygons for the designer's draw tools and palette
  // glyphs. A second table would be twelve shapes that drift from the twelve in the palette.
  for (const kind of ['triangle', 'hexagon', 'star', 'chevron', 'arrow', 'plus', 'diamond']) {
    assert.ok(SHAPE_KINDS.includes(kind), `${kind} missing from the Shape kinds`);
    const path = shapePath({ kind, strokeEnabled: false }, 100, 100);
    assert.match(path, /^M .*Z$/, kind);
  }
  assert.ok(SHAPE_KINDS.includes('rectangle') && SHAPE_KINDS.includes('ellipse') && SHAPE_KINDS.includes('line'));
});

test('an unknown kind falls back to a rectangle rather than drawing nothing', () => {
  assert.equal(shapePath({ kind: 'dodecahedron', strokeEnabled: false }, 10, 10),
               shapePath({ kind: 'rectangle', strokeEnabled: false }, 10, 10));
});

test('a stroked shape stays inside its own box', () => {
  // Without the inset a 4px stroke paints two pixels outside the control, overlaps its neighbour,
  // and makes alignment lie.
  const path = shapePath({ kind: 'rectangle', strokeEnabled: true, strokeWidth: 4 }, 100, 100);
  assert.equal(path, 'M 2 2 L 98 2 L 98 98 L 2 98 Z');
});

test('a corner radius past half the box is clamped, not folded', () => {
  const path = shapePath({ kind: 'rectangle', cornerRadius: 9999, strokeEnabled: false }, 100, 60);
  assert.match(path, /A 30 30 /, 'clamped to half the SHORTER side');
});

test('a line is never filled, whatever the fill toggle says', () => {
  assert.equal(shapeTakesFill({ kind: 'line', fillEnabled: true }), false);
  assert.equal(shapeTakesFill({ kind: 'ellipse', fillEnabled: true }), true);
  assert.equal(shapeTakesFill({ kind: 'ellipse', fillEnabled: false }), false);
});

test('a dotted stroke is dots, which needs the round cap the renderer is told about', () => {
  assert.equal(shapeStrokeDash({ strokeStyle: 'solid' }), null);
  assert.match(shapeStrokeDash({ strokeStyle: 'dashed', strokeDash: 10 }), /^10 6$/);
  assert.match(shapeStrokeDash({ strokeStyle: 'dotted', strokeWidth: 3 }), /^0\.01 6$/);
  assert.equal(shapeNeedsRoundCap({ strokeStyle: 'dotted' }), true);
  assert.equal(shapeNeedsRoundCap({ strokeStyle: 'dashed' }), false);
});

// --- the keyboard -----------------------------------------------------------------------------------

test('the keyboard reuses the splitter key geometry rather than growing its own', () => {
  // Two keyboards on one panel that disagree about where middle C is would be a genuinely
  // maddening bug, and a second implementation is the only way to get one.
  const keyboard = control('Keyboard', 'Keyboard');
  const keys = keyboardKeys(keyboard, 320, 90);
  assert.equal(keys.length, 25, 'C3 to C5 inclusive');
  assert.ok(keys.every((key) => key.rect.w > 0 && key.rect.h > 0));

  // Blacks draw last, because they overlap the whites and painter's order is what decides which
  // one you can see.
  const firstBlack = keys.findIndex((key) => key.black);
  const lastWhite = keys.map((key) => key.black).lastIndexOf(false);
  assert.ok(firstBlack > lastWhite, 'blacks must come after whites');
});

test('a reversed note range is a typo, not an instruction', () => {
  // Rendering it produces a keyboard of negative width that swallows the rest of the panel.
  const keyboard = control('Keyboard', 'Keyboard', { lowNote: 72, highNote: 48 });
  assert.deepEqual(keyboardRange(keyboard), { lowNote: 48, highNote: 72 });
});

test('a point lands on the key that is drawn there', () => {
  const keyboard = control('Keyboard', 'Keyboard');
  const keys = keyboardKeys(keyboard, 320, 90);
  const white = keys.find((key) => !key.black && key.note === 50);
  const hit = keyboardNoteAt(keyboard, 320, 90, white.rect.x + white.rect.w / 2, white.rect.y + white.rect.h * 0.9);
  assert.equal(hit, 50);
});

test('transpose and octave apply to what is sent, not to what is drawn', () => {
  const keyboard = control('Keyboard', 'Keyboard', { octave: 1, transpose: 2, velocity: 90, channel: 3 });
  const press = keyboardPress(keyboard, 60);
  assert.equal(press.note, 74, '60 + 12 + 2');
  assert.equal(press.velocity, 90);
  assert.equal(press.channel, 3);
  // ...and the keys drawn are still the authored range.
  assert.equal(keyboardKeys(keyboard, 320, 90).some((key) => key.note === 60), true);
});

test('a scale lock refuses or quantises, and says which — it never silently moves a finger', () => {
  const context = { root: 0, scale: 'major' };
  const off = control('Keyboard', 'Keyboard', { scaleLock: 'off' });
  assert.equal(keyboardPress(off, 61, { context }).note, 61, 'C# plays when nothing is locked');

  const refuse = control('Keyboard', 'Keyboard', { scaleLock: 'refuse' });
  assert.equal(keyboardPress(refuse, 61, { context }), null, 'refused, rather than nudged');

  const quantize = control('Keyboard', 'Keyboard', { scaleLock: 'quantize' });
  assert.equal(keyboardPress(quantize, 61, { context }).note, 60, 'ties go down, as in quantizeToScale');
});

test('out-of-key keys are shaded whichever lock is on, so the rule is visible before it bites', () => {
  const keyboard = control('Keyboard', 'Keyboard', { scaleLock: 'off' });
  const keys = keyboardKeys(keyboard, 320, 90, { context: { root: 0, scale: 'major' } });
  assert.equal(keys.find((key) => key.note === 60).inKey, true);
  assert.equal(keys.find((key) => key.note === 61).inKey, false);
});

test('a key that will sound nothing is marked dead, and only under refuse', () => {
  // Shading and deadness are two different statements. "Not in the key" is information, and under
  // `off` and `quantize` it is the whole truth — the key still sounds something. Under `refuse` it
  // sounds NOTHING, and a player who learns that by pressing and hearing silence concludes the
  // panel is broken rather than that it is doing what its author asked for.
  const context = { root: 0, scale: 'major' };
  const at = (keyboard, note) => keyboardKeys(keyboard, 320, 90, { context })
    .find((key) => key.note === note);

  const refuse = control('Keyboard', 'Keyboard', { scaleLock: 'refuse' });
  assert.equal(at(refuse, 61).refused, true, 'C# sends nothing, so it is drawn dead');
  assert.equal(at(refuse, 60).refused, false, 'C is in the key and plays');
  assert.equal(keyboardPress(refuse, 61, { context }), null, 'and the mark agrees with the press');

  for (const lock of ['off', 'quantize']) {
    const keyboard = control('Keyboard', 'Keyboard', { scaleLock: lock });
    assert.equal(at(keyboard, 61).inKey, false, `${lock}: still shaded`);
    assert.equal(at(keyboard, 61).refused, false, `${lock}: but it sounds, so it is not dead`);
    assert.ok(keyboardPress(keyboard, 61, { context }), `${lock}: proof that it sounds`);
  }

  // No musical context means no scale to be outside of, so nothing is refused whatever the setting.
  assert.equal(keyboardKeys(refuse, 320, 90).find((key) => key.note === 61).refused, false);
});

test('latch is what makes a chord possible with one pointer', () => {
  let held = keyboardHold(new Set(), 60, { latch: true });
  held = keyboardHold(held, 64, { latch: true });
  assert.deepEqual([...held].sort((a, b) => a - b), [60, 64]);
  held = keyboardHold(held, 60, { latch: true });
  assert.deepEqual([...held], [64], 'pressing a latched key again releases it');
});

test('a glissando releases before it presses', () => {
  // Emitting note-ons first leaves notes hanging after a fast drag, which is the classic
  // on-screen-keyboard bug.
  const glide = keyboardGlide(new Set([60]), 62);
  assert.deepEqual(glide.release, [60]);
  assert.deepEqual(glide.press, [62]);
  assert.deepEqual([...glide.held], [62]);

  const same = keyboardGlide(new Set([62]), 62);
  assert.deepEqual(same.press, [], 'staying on one key does not retrigger it');

  const off = keyboardGlide(new Set([62]), null);
  assert.deepEqual(off.release, [62], 'dragging off the keyboard releases what was held');
});

test('a keyboard exports no host parameter', () => {
  // A DAW automating "note" on a keyboard would be a DAW playing it, which is what its own MIDI
  // track is for.
  assert.deepEqual(COMPONENT_TYPES.Keyboard.exportValues, []);
  assert.deepEqual(getComponentPorts('Keyboard').map((port) => port.id), ['note', 'velocity']);
});

// --- the step sequencer ------------------------------------------------------------------------------

test('the pattern is sparse — an off cell is deleted, not stored as false', () => {
  // A 64-step, 16-track grid is a thousand cells, and a panel file carrying a thousand `false`s for
  // every sequencer would be mostly punctuation.
  let pattern = toggleCell({}, 't0', 3);
  assert.deepEqual(Object.keys(pattern), ['t0:3']);
  pattern = toggleCell(pattern, 't0', 3);
  assert.deepEqual(Object.keys(pattern), []);
});

test('the playhead walks, and ping-pong does not repeat the ends', () => {
  // Repeating the end is the naïve ping-pong: it makes a sixteen-step pattern sound thirty steps
  // long with two stutters in it.
  assert.deepEqual(advanceStep(0, 4), { position: 1, forward: true, wrapped: false });
  assert.deepEqual(advanceStep(3, 4), { position: 0, forward: true, wrapped: true });
  assert.deepEqual(advanceStep(0, 4, STEP_DIRECTION.reverse), { position: 3, forward: false, wrapped: true });

  const turn = advanceStep(3, 4, STEP_DIRECTION.pingpong, { forward: true });
  assert.deepEqual(turn, { position: 2, forward: false, wrapped: false });
  const back = advanceStep(0, 4, STEP_DIRECTION.pingpong, { forward: false });
  assert.deepEqual(back, { position: 1, forward: true, wrapped: true });
});

test('a random walk never repeats a step, because a repeat reads as a stuck sequencer', () => {
  for (let i = 0; i < 40; i += 1) {
    assert.notEqual(advanceStep(2, 8, STEP_DIRECTION.random).position, 2);
  }
  assert.equal(advanceStep(0, 1, STEP_DIRECTION.random).position, 0, 'a one-step pattern is the exception');
});

test('the gate follows the tempo, and never merges two repeated notes', () => {
  const fast = control('StepSequencer', 'StepSequencer', { bpm: 240, division: '1/16' });
  const slow = control('StepSequencer', 'StepSequencer', { bpm: 120, division: '1/16' });
  assert.ok(stepMs(fast) < stepMs(slow));
  assert.ok(gateMs(slow) < stepMs(slow), 'a gate at 100% would make repeats into one long note');

  const long = control('StepSequencer', 'StepSequencer', { gate: 500 });
  assert.ok(gateMs(long) < stepMs(long), 'and an over-100 gate is clamped rather than obeyed');
});

test('a step fires only the tracks that are on and not muted', () => {
  const sequencer = control('StepSequencer', 'StepSequencer', {
    pattern: { 't0:0': { on: true, velocity: 110 }, 't1:0': { on: true, velocity: 60 } },
    tracks: [
      { id: 't0', label: 'Kick', note: 36, channel: 10 },
      { id: 't1', label: 'Snare', note: 38, channel: 10, muted: true },
    ],
  });
  const notes = stepNotes(sequencer, 0);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].note, 36);
  assert.equal(notes[0].velocity, 110);
  assert.deepEqual(stepNotes(sequencer, 1), [], 'a step with no cells fires nothing');
});

test('the grid has beat lines, because sixteen identical boxes are unreadable', () => {
  assert.deepEqual(beatLines(control('StepSequencer', 'StepSequencer')), [4, 8, 12]);
});

test('a point lands in the cell it is drawn in, and outside the grid lands nowhere', () => {
  const sequencer = control('StepSequencer', 'StepSequencer');
  const geom = sequencerGeometry(420, 130, sequencer);
  const hit = cellAtPoint(geom, geom.x0 + geom.cellW * 2.5, geom.y0 + geom.cellH * 1.5);
  assert.deepEqual(hit, { step: 2, trackIndex: 1 });
  assert.equal(cellAtPoint(geom, 2, 2), null, 'the track header is not a cell');
});

test('a sequencer exports tempo and run state, and not its pattern', () => {
  // A host parameter per cell would be a thousand lanes.
  const fields = COMPONENT_TYPES.StepSequencer.exportValues.map((spec) => spec.field);
  assert.deepEqual(fields, ['bpm', 'running']);
});

// --- the tab container ---------------------------------------------------------------------------------

test('a tab container always has at least one page', () => {
  // Rendering no pages would make its children unreachable with no way back.
  const empty = control('TabContainer', 'TabContainer', { pages: [] });
  assert.equal(tabPages(empty).length, 1);
});

test('a child with no page recorded belongs to the first one', () => {
  // "Invisible on every page" is not a state a user can get out of.
  const tabs = control('TabContainer', 'TabContainer');
  const orphan = { _children: { Core: { id: 'x' } } };
  assert.equal(childPageId(orphan, tabs), 'p0');
  assert.equal(isChildOnActivePage(orphan, tabs), true);
});

test('a child on a deleted page comes back rather than vanishing', () => {
  const tabs = control('TabContainer', 'TabContainer');
  const stranded = { _children: { Core: { id: 'x', tabPageId: 'p9' } } };
  assert.equal(childPageId(stranded, tabs), 'p0');
});

test('the page index is clamped to the pages that exist', () => {
  assert.equal(activePageIndex(control('TabContainer', 'TabContainer', { pageIndex: 7 })), 1);
  assert.equal(activePageIndex(control('TabContainer', 'TabContainer', { pageIndex: -3 })), 0);
});

test('the strip takes space from the page area, on whichever edge it is on', () => {
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    const tabs = control('TabContainer', 'TabContainer', { edge, stripSize: 20 });
    const geom = tabGeometry(200, 100, tabs);
    assert.ok(geom.page.w > 0 && geom.page.h > 0, edge);
    assert.equal(geom.page.w * geom.page.h, geom.vertical ? (200 - 20) * 100 : 200 * (100 - 20), edge);
  }
  const hidden = control('TabContainer', 'TabContainer', { showStrip: false });
  assert.equal(tabGeometry(200, 100, hidden).page.h, 100);
});

test('a click lands on the tab under it', () => {
  const tabs = control('TabContainer', 'TabContainer');
  const geom = tabGeometry(200, 100, tabs);
  const rect = tabRect(geom, 1, 2);
  assert.equal(tabAtPoint(geom, rect.x + rect.w / 2, rect.y + rect.h / 2, 2), 1);
  assert.equal(tabAtPoint(geom, 100, 80, 2), null, 'the page area is not the strip');
});

test('the page is a bindable port AND a choice-typed host parameter with real labels', () => {
  // A footswitch changing the page is a real performance gesture. Exported as an anonymous float it
  // would reach a DAW as "0.37", which is not a page.
  assert.deepEqual(getComponentPorts('TabContainer').map((port) => port.id), ['pageIndex']);
  const panel = { controls: [control('TabContainer', 'TabContainer')] };
  const [parameter] = deriveExportParameters(panel);
  assert.equal(parameter.valueKind, 'choice');
  assert.deepEqual(parameter.choiceLabels, ['Page 1', 'Page 2']);
  assert.equal(parameter.max, 1, 'the range is however many pages there are');
});

// --- the scroll area -----------------------------------------------------------------------------------

test('the extent is measured from the children, never set by the author', () => {
  // An author-set extent goes stale the moment a control moves: the scrollbar then stops short of a
  // control that is really there, or scrolls past the end into nothing.
  const area = withChildren(control('ScrollArea', 'ScrollArea'), [
    { x: 0, y: 0, width: 100, height: 40 },
    { x: 0, y: 300, width: 100, height: 40 },
  ]);
  const extent = contentExtent(area);
  assert.equal(extent.height, 340);
  assert.equal(maxScroll(200, 100, area).y, 340 - 100);

  // And it reads the children the MODEL has, not a `children` array invented by a fixture. That
  // array is what the extent used to look for, so every real scroll area measured zero and never
  // grew a scrollbar — the extent was wrong and nothing looked wrong, which is the failure the
  // whole component is written around.
  const fake = { ...control('ScrollArea', 'ScrollArea'), children: [
    { _children: { Transform: { x: 0, y: 0, width: 100, height: 900 } } },
  ] };
  assert.equal(contentExtent(fake).height, 0, 'a `children` array is not where children live');
});

test('a child dragged above the top is reachable rather than stranded', () => {
  const area = withChildren(control('ScrollArea', 'ScrollArea'), [{ x: 0, y: -50, width: 100, height: 40 }]);
  assert.equal(contentExtent(area).minY, -50);
});

test('content that fits does not scroll', () => {
  const area = withChildren(control('ScrollArea', 'ScrollArea'), [{ x: 0, y: 0, width: 10, height: 10 }]);
  assert.deepEqual(maxScroll(200, 200, area), { x: 0, y: 0 });
  assert.deepEqual(clampScroll({ x: 50, y: 50 }, 200, 200, area), { x: 0, y: 0 });
});

test('a wheel notch is a stated distance in line mode and the raw delta in smooth', () => {
  const tall = [{ x: 0, y: 0, width: 50, height: 900 }];
  const line = withChildren(control('ScrollArea', 'ScrollArea', { lineHeight: 24 }), tall);
  assert.equal(scrollByWheel({ x: 0, y: 0 }, { y: 3 }, 200, 100, line).y, 24);

  const smooth = withChildren(control('ScrollArea', 'ScrollArea', { scrollMode: 'smooth' }), tall);
  assert.equal(scrollByWheel({ x: 0, y: 0 }, { y: 37 }, 200, 100, smooth).y, 37);
});

test('a scroll position past the end is clamped, not honoured', () => {
  const area = withChildren(control('ScrollArea', 'ScrollArea'), [{ x: 0, y: 0, width: 50, height: 300 }]);
  assert.equal(scrollByWheel({ x: 0, y: 9999 }, { y: 1 }, 200, 100, area).y, 200);
});

test('the thumb has a minimum length, or it cannot be grabbed', () => {
  // A thumb proportional to very long content is a few pixels tall, at which point the scrollbar is
  // decoration.
  const area = withChildren(control('ScrollArea', 'ScrollArea'), [{ x: 0, y: 0, width: 50, height: 20000 }]);
  const thumb = thumbRect('y', { y: 0 }, 200, 100, area);
  assert.ok(thumb.h >= 24, `thumb was ${thumb.h}px`);
  assert.equal(thumbRect('y', { y: 0 }, 200, 30000, area), null, 'content that fits has no thumb');
});

test('a child scrolled out of view is known to be out of view', () => {
  const child = { _children: { Transform: { x: 0, y: 0, width: 50, height: 40 } } };
  assert.equal(isChildVisible(child, { x: 0, y: 0 }, 200, 100), true);
  assert.equal(isChildVisible(child, { x: 0, y: 200 }, 200, 100), false);
});

test('a scroll position is not a host parameter', () => {
  // Where somebody is LOOKING is not a parameter of the instrument, and a DAW writing it would move
  // the view under the player's hands.
  assert.deepEqual(COMPONENT_TYPES.ScrollArea.exportValues, []);
});
