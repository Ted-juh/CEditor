// containerFit.test.js — a section sized by what is inside it.
//
// A section box drawn independently of the controls it encloses is a second source of truth for the
// same layout: move a knob and the box is wrong, forever, by hand. Deriving the size makes "the
// section is the wrong size" not a bug to fix but a state that cannot occur.
//
// PER AXIS, because a row of instrument sections wants equal heights and variable widths. Both axes
// locked is the default and is exactly today's behaviour, which is the promise that lets this ship
// without touching a single existing panel — asserted below rather than assumed.
//
// THE CORRECTNESS STORY is the circularity guard. A child's position is expressed inside its
// container's content box, and the container's size is derived from its children; read those in the
// wrong order and the layout chases itself. The rule is that fit reads a child's INTRINSIC box and
// never anything derived from the parent, and the test for it is that fitting twice changes nothing
// the second time.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  FIT_CONTENTS, anchoredPosition, anchoredPositions, axisIsDerived, contentExtent, fitSettings,
  fittedSize, fittedSizeDeep, fitsAnyAxis, resolveFittedSizes,
} from '../src/CE_Application/utils/containerFit.js';
import { contentOrigin } from '../src/CE_Application/utils/containment.js';
import { textAlignFor } from '../src/CE_Application/editor/canvasControlStyles.js';

const kid = (id, x, y, w, h) => createControl('Knob', { Core: { id }, Transform: { x, y, width: w, height: h } });

function section(id, fit = {}, children = [], size = { width: 999, height: 999 }) {
  const group = createControl('Group', { Core: { id }, Transform: size });
  Object.assign(group._children.Children, fit);
  group._children.Children._children = Object.fromEntries(children.map((c) => [c._children.Core.id, c]));
  return group;
}

/* ------------------------------------------------------------------ the promise */

test('both axes locked is the default, and changes nothing', () => {
  // The whole reason this can ship: every panel that already exists has locked/locked, so its
  // sections keep the size they were authored with.
  const group = section('g', {}, [kid('a', 0, 0, 10, 10)], { width: 300, height: 200 });
  assert.equal(fitsAnyAxis(group), false);
  assert.deepEqual(fittedSize(group, [kid('a', 0, 0, 10, 10)]), { width: 300, height: 200 });
  assert.equal(resolveFittedSizes([group]).size, 0, 'a locked panel should produce no overrides at all');
});

/* ------------------------------------------------------------------ fitting */

test('a fitted section is its contents plus its padding', () => {
  const children = [kid('a', 0, 0, 54, 54), kid('b', 70, 0, 54, 54)];
  const group = section('g', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 10 }, children);
  assert.deepEqual(fittedSize(group, children), { width: 144, height: 74 });
});

test('per-side padding beats the shared value, and matches where children actually start', () => {
  // These two have to agree or an asymmetric padding puts the gap on the wrong side: fit adds LEFT
  // and RIGHT to the width, so the content origin must be the LEFT padding, not the shared one.
  const children = [kid('a', 0, 0, 54, 54)];
  const group = section('g', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 10, paddingTop: 26 }, children);

  assert.deepEqual(fittedSize(group, children), { width: 74, height: 90 });
  assert.deepEqual(contentOrigin(group), { x: 10, y: 26 });
});

test('an unset side falls back to the shared padding, not to zero', () => {
  // Number(null) is a finite 0, so a numberOr-style default silently reads "unset" as a real zero
  // and the shared padding never applies. It did, until this test.
  const group = section('g', { padding: 10 });
  assert.deepEqual(fitSettings(group).padding, { left: 10, right: 10, top: 10, bottom: 10 });

  const asymmetric = section('g2', { padding: 10, paddingLeft: 24 });
  assert.deepEqual(fitSettings(asymmetric).padding, { left: 24, right: 10, top: 10, bottom: 10 });
});

test('a fitted axis never goes below its minimum', () => {
  // A section holding one small knob should not collapse and break a row of equal-height sections.
  const children = [kid('a', 0, 0, 20, 20)];
  const group = section('g', {
    fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 4, minWidth: 190, minHeight: 308,
  }, children);
  assert.deepEqual(fittedSize(group, children), { width: 190, height: 308 });
});

test('one axis can fit while the other stays locked', () => {
  // The equal-height row: widths follow their contents, heights are set by the designer.
  const children = [kid('a', 0, 0, 54, 54)];
  const group = section('g', { fitWidth: FIT_CONTENTS, padding: 8 }, children, { width: 999, height: 308 });
  assert.deepEqual(fittedSize(group, children), { width: 70, height: 308 });
  assert.equal(axisIsDerived(group, 'width'), true);
  assert.equal(axisIsDerived(group, 'height'), false);
});

test('the extent is measured from the container origin, not the leftmost child', () => {
  // A child at x=40 means the author wants 40px before it. Collapsing that would MOVE every child
  // the moment fitting was switched on, and fitting must only ever change a size.
  assert.deepEqual(contentExtent([kid('a', 40, 20, 10, 10)]), { width: 50, height: 30 });
});

test('a hidden child does not hold the section open', () => {
  const children = [kid('a', 0, 0, 20, 20), kid('b', 500, 0, 20, 20)];
  children[1]._children.Core.visible = false;
  assert.deepEqual(contentExtent(children), { width: 20, height: 20 });
});

test('an empty fitted section is its padding and its minimum', () => {
  const group = section('g', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 12, minHeight: 40 }, []);
  assert.deepEqual(fittedSize(group, []), { width: 24, height: 40 });
});

/* ------------------------------------------------------------------ nesting, and the guard */

test('a section holding a section resolves inside-out', () => {
  const inner = section('inner', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 5 },
    [kid('a', 0, 0, 30, 30)], { width: 999, height: 999 });
  const outer = section('outer', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 10 },
    [inner], { width: 999, height: 999 });

  // inner = 30 + 5 + 5 = 40; outer = 40 + 10 + 10 = 60. Reading inner's stale 999 would give 1019.
  assert.deepEqual(fittedSizeDeep(outer), { width: 60, height: 60 });
});

test('fitting is idempotent — the second pass changes nothing', () => {
  // The circularity guard, stated as the property that matters. If fit read anything derived from
  // the parent, applying it would move the children and the next pass would compute a new size,
  // and the layout would chase itself a frame at a time.
  const children = [kid('a', 10, 10, 40, 40)];
  const group = section('g', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 6 }, children);

  const first = fittedSizeDeep(group);
  Object.assign(group._children.Transform, first);          // apply it, as the renderer does
  const second = fittedSizeDeep(group);
  assert.deepEqual(second, first, 'fitting a fitted section changed its size again');
});

test('resolveFittedSizes reports only what actually differs', () => {
  // So a panel with no fitted sections costs one walk and an empty map, and every caller can skip
  // the mechanism on a `.size === 0`.
  const fitted = section('fits', { fitWidth: FIT_CONTENTS, padding: 5 }, [kid('a', 0, 0, 20, 20)], { width: 999, height: 100 });
  const locked = section('locked', {}, [kid('b', 0, 0, 20, 20)], { width: 300, height: 100 });
  const already = section('already', { fitWidth: FIT_CONTENTS, padding: 5 }, [kid('c', 0, 0, 20, 20)], { width: 30, height: 100 });

  const sizes = resolveFittedSizes([fitted, locked, already]);
  assert.deepEqual([...sizes.keys()], ['fits'], 'only the section whose size actually changed should be reported');
  assert.deepEqual(sizes.get('fits'), { width: 30, height: 100 });
});

test('a control that is not a container is left alone', () => {
  const knob = kid('k', 0, 0, 54, 54);
  assert.equal(fitsAnyAxis(knob), false);
  assert.equal(resolveFittedSizes([knob]).size, 0);
});

/* ------------------------------------------------------------------ the section, end to end */

test('a GAIA-shaped section sizes itself and names itself for scripts', () => {
  // What all of this was for. The section owns its controls, derives its size, and — because it is
  // a real control — is already reachable from a script by name: get("FILTER.width"). No new API,
  // which is the payoff of deciding a section is a parent rather than a shape behind things.
  const children = [
    kid('mode', 12, 30, 128, 83), kid('slope', 148, 30, 104, 38),
    kid('cutoff', 262, 30, 54, 54), kid('resonance', 344, 30, 54, 54),
  ];
  const filter = section('filter', {
    fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 10, paddingTop: 26, minHeight: 200,
  }, children);
  filter._children.Core.name = 'FILTER';
  filter._children.Text.content = 'FILTER';
  // Header placement is Text.Position.justification, NOT ContentLayout.horizontalAlign — that one
  // drives the icon/text block on the button family and does nothing for a Group's own label. The
  // first version of this test set ContentLayout, passed, and rendered a centred header.
  filter._children.Text._children.Position.justification = 'topRight';

  assert.deepEqual(fittedSizeDeep(filter), { width: 418, height: 200 });
  assert.equal(filter._children.Core.name, 'FILTER', 'the scripting handle is the control name');
  assert.equal(textAlignFor(filter._children.Text._children.Position.justification), 'right',
    'the section header should sit at the top-right corner');

  // Take the widest control away and the section follows, which is the entire point.
  delete filter._children.Children._children.resonance;
  assert.equal(fittedSizeDeep(filter).width, 336);
});

/* ------------------------------------------------------------------ anchoring and decoration */

test('a topLeft anchor is plain x/y, so nothing that exists moves', () => {
  // The default, and the reason this ships without touching a panel.
  const label = createControl('Label', { Core: { id: 't' }, Transform: { x: 12, y: 8, width: 40, height: 16 } });
  assert.equal(label._children.Transform.anchor, 'topLeft');
  assert.deepEqual(anchoredPosition(label, 300, 200), { x: 12, y: 8 });
  assert.equal(anchoredPositions([label], 300, 200), null, 'an unanchored child needs no override at all');
});

test('an anchored child follows the edge it is pinned to', () => {
  // The point of the whole mechanism: a title cannot be "top-right" of a box whose width is derived
  // from its contents, because absolute x/y is decided before the width is known.
  const title = createControl('Label', {
    Core: { id: 't' },
    Transform: { x: 8, y: 6, width: 70, height: 18, anchor: 'topRight' },
  });
  assert.deepEqual(anchoredPosition(title, 300, 200), { x: 222, y: 6 });
  assert.deepEqual(anchoredPosition(title, 400, 200), { x: 322, y: 6 }, 'it should follow a wider parent');
});

test('every anchor resolves where it says', () => {
  const at = (anchor) => anchoredPosition(
    createControl('Label', { Core: { id: 'a' }, Transform: { x: 10, y: 10, width: 20, height: 20, anchor } }),
    100, 100,
  );
  assert.deepEqual(at('topLeft'), { x: 10, y: 10 });
  assert.deepEqual(at('topRight'), { x: 70, y: 10 });
  assert.deepEqual(at('bottomLeft'), { x: 10, y: 70 });
  assert.deepEqual(at('bottomRight'), { x: 70, y: 70 });
  // Centre anchors read x/y as an OFFSET from the middle, not an inset — "10px in from the middle"
  // means nothing, "10px right of the middle" does.
  assert.deepEqual(at('center'), { x: 50, y: 50 });
  assert.deepEqual(at('top'), { x: 50, y: 10 });
  assert.deepEqual(at('right'), { x: 70, y: 50 });
});

test('decoration does not decide how big its section is', () => {
  // Without affectsFit:false a title near the right edge makes the section as wide as wherever the
  // title sits, so moving the title resizes the section. Exactly backwards, and the reason a plain
  // Label could not have been the header before this.
  const knob = kid('k', 0, 0, 54, 54);
  const title = createControl('Label', {
    Core: { id: 't' },
    Transform: { x: 0, y: -22, width: 300, height: 18, anchor: 'topRight', affectsFit: false },
  });
  assert.deepEqual(contentExtent([knob, title]), { width: 54, height: 54 });

  const group = section('g', { fitWidth: FIT_CONTENTS, fitHeight: FIT_CONTENTS, padding: 10 }, [knob, title]);
  assert.deepEqual(fittedSize(group, [knob, title]), { width: 74, height: 74 },
    'a 300px-wide title must not make a 54px knob into a 320px section');
});

test('a section title is just a Label, with everything a Label has', () => {
  // The design this replaced had a built-in header with its own placement and styling properties.
  // A Label already carries Background (fill, border, corners), Text (font, colour, justification),
  // Icon, Effects and ContentLayout — so a coloured pill tab needs no new concept, only somewhere
  // to pin it and permission not to count.
  const tab = createControl('Label', {
    Core: { id: 'tab' },
    Transform: { x: 0, y: -22, width: 74, height: 18, anchor: 'topRight', affectsFit: false },
    Text: { content: 'FILTER' },
  });
  tab._children.Background._children.Fill.colour = 'FFE0A030';
  tab._children.Background._children.Corners.radius = 4;

  assert.equal(tab._children.Background._children.Fill.colour, 'FFE0A030');
  assert.equal(tab._children.Background._children.Corners.radius, 4);
  assert.ok(tab._children.Text._children.Font, 'a Label brings its own font');
  assert.ok(tab._children.Effects, 'and its own effects');
});

/* ------------------------------------------------------------------ one origin, everywhere */

test('every consumer of the content origin agrees about per-side padding', () => {
  // THE BUG THIS PINS. CanvasControl positioned the children-origin div with the SHARED
  // `Children.padding` alone, while contentOrigin — which controlPanelRect, panelToLocalPoint,
  // contentExtent, fittedSize and the scenery compiler all go through — prefers paddingLeft and
  // paddingTop. They agreed only while the two were equal. Nothing could write a per-side value
  // until the Children editor shipped, and the moment one did, the drawn position of every child
  // and its modelled position differed by exactly that much: marquee selection, alignment guides
  // and drag-to-reparent all aiming at a box 20px from what was on screen, and a scenery layer
  // sliding its contents the instant it locked.
  //
  // There is no assertion here about the DOM — the canvas is a component. What this pins is the
  // single source: fitSettings().padding and contentOrigin() must answer the same question the
  // same way, because CanvasControl now reads the first and everything else reads the second.
  const group = section('g', { padding: 4, paddingLeft: 24, paddingTop: 8 });
  const origin = contentOrigin(group);
  const pad = fitSettings(group).padding;

  assert.deepEqual(origin, { x: 24, y: 8 }, 'per-side wins over the shared value');
  assert.equal(pad.left, origin.x, 'the canvas offsets by pad.left; the model reads contentOrigin.x');
  assert.equal(pad.top, origin.y, 'and the same for the vertical');

  // And an unset side still falls back to the shared number, in both.
  const partial = section('g2', { padding: 6, paddingLeft: 20 });
  assert.deepEqual(contentOrigin(partial), { x: 20, y: 6 });
  assert.equal(fitSettings(partial).padding.top, 6);
});
