/**
 * behaviourWidgets.mjs — the appearance tail on four components the coverage matrix found short:
 * `Macro` (6), `Crossfader` (6), `Joystick` (6) and `Meter` (4).
 *
 * This is the same shape of work as `behaviourColours.mjs`, and it carries the same warning, which
 * is the most reusable thing that pass learned: **a null result here is a lead, not a verdict.**
 * The evidence for "this colour does nothing" looks exactly like diligence — you set the property,
 * you looked, and you found nothing — and in the colours pass four of the thirty-six first measured
 * nothing for reasons that were the fixture's, not the product's. So every row below that expects
 * to find a colour says WHAT has to be true for it to exist:
 *
 * - `Joystick.trailColour` needs `showTrail` on AND a drag behind it: the trail is `__trail`, a
 *   runtime path, and a pad nobody has touched has no path to paint.
 * - `Meter.dbFloor` and `dbCeil` only exist under `scale: 'db'`. On a linear meter the fill is the
 *   plain fraction and the two numbers are not consulted at all — which is correct, and is a row.
 * - `Macro.majorTickCount`/`minorTickCount` only draw when the macro is showing ticks.
 *
 * The Meter is the one of the four drawn with DIVS rather than SVG, so its rows read computed
 * styles where the others read shape fills — the same split the Matrix forced in the colours pass.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('widgets');

const hasFill = (shapes, rgb) => shapes.filter((s) => String(s.fill).includes(rgb)).length;
const hasStroke = (shapes, rgb) => shapes.filter((s) => String(s.stroke).includes(rgb)).length;
const styleOf = (id, sel, prop) => kit.page.evaluate(({ id, sel, prop }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  const n = el?.querySelector(sel);
  return n ? getComputedStyle(n).getPropertyValue(prop).trim() : null;
}, { id, sel, prop });
const boxOf = (id, sel) => kit.page.evaluate(({ id, sel }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  const host = el?.getBoundingClientRect();
  const n = el?.querySelector(sel);
  if (!n || !host) return null;
  const b = n.getBoundingClientRect();
  return { x: Math.round(b.x - host.x), y: Math.round(b.y - host.y),
    w: Math.round(b.width), h: Math.round(b.height) };
}, { id, sel });

try {
  // =============================================================================================
  // Macro — the arc, the knob, the labels, the ticks and how many slots it drives.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Macro', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 200, 'Transform.height': 170 });
    await kit.preview(true);
    await kit.settle(800);

    await kit.set(id, { 'Macro.arcColour': 'FFCC3300', 'Macro.knobColour': 'FF00AA55',
      'Macro.labelColour': 'FF2244FF' });
    await kit.settle(600);
    led.check('Macro', 'arcColour + knobColour + labelColour',
      'the value arc, the knob body and the writing each take their own colour — three parts of one control, not one colour repeated',
      { arc: true, knob: true, label: true },
      { arc: hasStroke(await kit.shapes(id, 'path'), '204,51,0') > 0
          || hasFill(await kit.shapes(id, 'path'), '204,51,0') > 0,
        knob: hasFill(await kit.shapes(id, 'circle'), '0,170,85') > 0,
        label: hasFill(await kit.shapes(id, 'text'), '34,68,255') > 0 });

    // THE DIVISIONS LIVE ON THE LANES, NOT ON THE DIAL, and the flag is `showDivisions` rather
    // than the `showTicks` every other component uses. A macro with no slots has no lanes, so it
    // draws no divisions however the two counts are set — the slots row therefore comes first and
    // leaves three lanes standing for the two after it.
    const rects = async () => (await kit.shapes(id, 'rect')).length;
    await kit.set(id, { 'Macro.slots': [{ id: 's1', name: 'One', targetId: '', depth: 1 }] });
    await kit.settle(650);
    const oneLane = await rects();
    await kit.set(id, { 'Macro.slots': [
      { id: 's1', name: 'One', targetId: '', depth: 1 },
      { id: 's2', name: 'Two', targetId: '', depth: 0.5 },
      { id: 's3', name: 'Three', targetId: '', depth: 0.25 },
    ] });
    await kit.settle(650);
    led.check('Macro', 'slots', 'the slots are the parameters the macro drives, and each one gets a lane of its own on the face — a track and a fill apiece',
      true, oneLane > 0 && (await rects()) > oneLane);

    const tickCount = async () => (await kit.shapes(id, 'line')).length;
    await kit.set(id, { 'Macro.showDivisions': true, 'Macro.majorTickCount': 5, 'Macro.minorTickCount': 0 });
    await kit.settle(650);
    const five = await tickCount();
    await kit.set(id, { 'Macro.majorTickCount': 9 });
    await kit.settle(650);
    led.check('Macro', 'majorTickCount', 'more major divisions is more marks along every lane',
      true, five > 0 && (await tickCount()) > five);
    await kit.set(id, { 'Macro.majorTickCount': 5, 'Macro.minorTickCount': 3 });
    await kit.settle(650);
    led.check('Macro', 'minorTickCount', 'and the minors fill the gaps between them, so the count goes up again from the same five majors',
      true, (await tickCount()) > five);
  }
  await kit.preview(false);

  // =============================================================================================
  // Crossfader — two fills, a handle, a detent and the labels at the ends.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Crossfader', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 90 });
    await kit.preview(true);
    await kit.settle(800);

    await kit.set(id, { 'Crossfader.fillAColour': 'FFCC3300', 'Crossfader.fillBColour': 'FF00AA55',
      'Crossfader.handleColour': 'FF2244FF', 'Crossfader.detentColour': 'FFFFFF00',
      'Crossfader.labelColour': 'FFFF00FF', 'Crossfader.showDetent': true });
    await kit.settle(650);
    const rects = await kit.shapes(id, 'rect');
    const lines = await kit.shapes(id, 'line');
    const texts = await kit.shapes(id, 'text');
    led.check('Crossfader', 'fillAColour + fillBColour + handleColour',
      'the two sides of the fade are painted separately and the handle on top of them is painted again — which is what makes it read as a crossfade rather than as one bar',
      { a: true, b: true, handle: true },
      { a: hasFill(rects, '204,51,0') > 0, b: hasFill(rects, '0,170,85') > 0,
        handle: hasFill(rects, '34,68,255') > 0 });
    led.check('Crossfader', 'detentColour + labelColour',
      'the centre detent and the A/B labels have their own colours too — the detent is the tick you feel for, so it is worth being able to see',
      { detent: true, labels: 2 },
      { detent: hasStroke(lines, '255,255,0') > 0 || hasFill(lines, '255,255,0') > 0,
        labels: hasFill(texts, '255,0,255') });

    const handleBox = async () => {
      const hit = (await kit.shapes(id, 'rect')).filter((r) => String(r.fill).includes('34,68,255'));
      return hit.length === 1 ? { w: Number(hit[0].width), h: Number(hit[0].height) } : null;
    };
    const small = await handleBox();
    await kit.set(id, { 'Crossfader.handleSize': 34 });
    await kit.settle(650);
    const large = await handleBox();
    led.check('Crossfader', 'handleSize', 'and the handle is as big as it was told to be, on both of its dimensions at once',
      true, small !== null && large !== null && large.w > small.w + 4 && large.h > small.h + 2);
  }
  await kit.preview(false);

  // =============================================================================================
  // Joystick — where the puck starts, and the three things drawn behind it.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('VectorJoystick', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 180, 'Transform.height': 180 });
    await kit.preview(true);
    await kit.settle(800);

    await kit.set(id, { 'Joystick.gridColour': 'FFCC3300', 'Joystick.crosshairColour': 'FF00AA55',
      'Joystick.labelColour': 'FF2244FF', 'Joystick.showGrid': true,
      'Joystick.showCrosshair': true, 'Joystick.showCorners': true });
    await kit.settle(650);
    const lines = await kit.shapes(id, 'line');
    led.check('Joystick', 'gridColour + crosshairColour + labelColour',
      'the grid behind the pad, the crosshair through its centre and the corner labels are three separately coloured things, drawn one over the other',
      { grid: true, crosshair: true, labels: 4 },
      { grid: hasStroke(lines, '204,51,0') > 0, crosshair: hasStroke(lines, '0,170,85') > 0,
        labels: hasFill(await kit.shapes(id, 'text'), '34,68,255') });

    const puckAt = async () => {
      const circles = await kit.shapes(id, 'circle');
      const puck = circles[circles.length - 1];
      return puck ? { cx: Number(puck.cx), cy: Number(puck.cy) } : null;
    };
    const centred = await puckAt();
    await kit.set(id, { 'Joystick.x': 0.85, 'Joystick.y': 0.15 });
    await kit.settle(650);
    const moved = await puckAt();
    led.check('Joystick', 'x + y',
      'the two coordinates are where the puck sits, normalised — and y is measured from the BOTTOM, so a low y is a high number on screen',
      { right: true, low: true },
      { right: moved.cx > centred.cx + 10, low: moved.cy > centred.cy + 10 });

    // THE TRAIL IS A LIVE GESTURE, NOT A RECORD. `__trail` is written while the puck is being
    // dragged and CLEARED on release, so it exists only between the press and the let-go. A fixture
    // that drags and then looks finds nothing and reports the colour dead — this one looks while
    // still holding, and then checks that letting go really does clear it, because that is the
    // other half of what the property means.
    await kit.set(id, { 'Joystick.showTrail': true, 'Joystick.trailColour': 'FFFF00FF',
      'Joystick.trailLength': 24, 'Joystick.editable': true });
    await kit.settle(650);
    const beforeDrag = (await kit.shapes(id, 'polyline')).length;
    const b = await kit.box(id);
    await kit.page.mouse.move(b.x + b.w * 0.3, b.y + b.h * 0.3);
    await kit.page.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await kit.page.mouse.move(b.x + b.w * (0.3 + i * 0.05), b.y + b.h * (0.3 + i * 0.05));
      await kit.settle(60);
    }
    await kit.settle(220);
    const midDrag = await kit.shapes(id, 'polyline');
    await kit.page.mouse.up();
    await kit.settle(450);
    led.check('Joystick', 'trailColour',
      'while the puck is being moved there is a path behind it drawn in the trail colour, with a point for every position it has been through — and there is none before the gesture starts or after it ends, because the trail is the gesture rather than a history of it',
      { beforeDrag: 0, painted: true, several: true, clearedOnRelease: 0 },
      { beforeDrag, painted: hasStroke(midDrag, '255,0,255') > 0,
        several: String(midDrag[0]?.points ?? '').trim().split(/\s+/).length >= 3,
        clearedOnRelease: (await kit.shapes(id, 'polyline')).length });
  }
  await kit.preview(false);

  // =============================================================================================
  // Meter — the decibel scale, and the gap between segments.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Meter', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 240, 'Transform.height': 70,
      'Meter.valueMin': 0, 'Meter.valueMax': 1, 'Meter.value': 0.5 });
    await kit.preview(true);
    await kit.settle(800);
    // THE LEVEL IS THE CLIP, NOT THE FILL. `.meter-fill` holds the gradient and is sized INVERSELY
    // to the level (200% at a half, 301% at a third) so the colour ramp stays put while the bar
    // grows; what moves is `.meter-clip` around it. Reading the fill reports the same width at
    // every value and every scale.
    const fillWidth = async () => (await boxOf(id, '.meter-clip'))?.w ?? null;

    await kit.set(id, { 'Meter.scale': 'linear' });
    await kit.settle(600);
    const linear = await fillWidth();
    await kit.set(id, { 'Meter.scale': 'db', 'Meter.dbFloor': -60, 'Meter.dbCeil': 6 });
    await kit.settle(600);
    const inDb = await fillWidth();
    led.check('Meter', 'scale (db) — the setting the two numbers live under',
      'a half on a linear meter is half the bar; the same half in decibels is about minus six, which on a −60..+6 scale is most of the way up — so the two scales place the same value in two different places',
      true, linear !== null && inDb !== null && inDb > linear + 10);

    await kit.set(id, { 'Meter.dbFloor': -12 });
    await kit.settle(600);
    const tightFloor = await fillWidth();
    led.check('Meter', 'dbFloor', 'raising the floor compresses the scale under the value, so the same level reads lower on the bar',
      true, tightFloor < inDb - 5);
    await kit.set(id, { 'Meter.dbFloor': -60, 'Meter.dbCeil': 40 });
    await kit.settle(600);
    led.check('Meter', 'dbCeil', 'and raising the ceiling leaves more headroom above it, which reads lower again — the two ends of one scale, moved independently',
      true, (await fillWidth()) < inDb - 5);
    await kit.set(id, { 'Meter.dbCeil': 6 });
    await kit.settle(500);

    led.check('Meter', 'dbFloor + dbCeil (a linear meter does not consult them)',
      'and neither number touches a linear meter, which is right: there is no decibel anywhere in a plain fraction',
      true, await (async () => {
        await kit.set(id, { 'Meter.scale': 'linear', 'Meter.dbFloor': -3, 'Meter.dbCeil': 60 });
        await kit.settle(650);
        return Math.abs((await fillWidth()) - linear) < 2;
      })());

    led.check('Meter', 'segmentGap',
      'a segmented meter has real gaps between its blocks, and widening the gap is visible as space between them rather than as a narrower bar',
      true, await (async () => {
        await kit.set(id, { 'Meter.style': 'segments', 'Meter.segments': 12, 'Meter.segmentGap': 2 });
        await kit.settle(700);
        const tight = await styleOf(id, '.meter-segments', 'gap');
        await kit.set(id, { 'Meter.segmentGap': 9 });
        await kit.settle(700);
        const loose = await styleOf(id, '.meter-segments', 'gap');
        return parseFloat(tight) === 2 && parseFloat(loose) === 9;
      })());
  }
  await kit.preview(false);

  led.inert('Meter', 'showScaleLabels',
    'write the value scale beside the meter',
    'no reader anywhere in src/ — MeterRenderer draws ticks (`showTicks` and `tickCount` are both read) and has never labelled them, under a comment that says "Scale ticks + labels". It is published as a script verb all the same, because `derivedFlagVerbs` mints one for every `show*` boolean in a section whether or not anything reads it, so `meter.showScaleLabels` succeeds and does nothing. Already on the residual list from the derived sweep; recorded here too because this is the suite that covers the section.');

  // =============================================================================================
  // save/reopen — appearance is authored state.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Crossfader', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 90,
      'Crossfader.fillAColour': 'FFCC3300', 'Crossfader.handleColour': 'FF2244FF',
      'Crossfader.handleSize': 30 });
    const again = await kit.reopen(id);
    await kit.preview(true);
    await kit.settle(800);
    const rects = await kit.shapes(again, 'rect');
    const handle = rects.filter((r) => String(r.fill).includes('34,68,255'));
    led.check('Crossfader', 'save/reopen (the colours and the handle)',
      'a reopened crossfader paints the same two colours and keeps the handle the size it was authored at',
      { fillA: true, handle: 1, big: true },
      { fillA: hasFill(rects, '204,51,0') > 0, handle: handle.length,
        big: handle.length === 1 && Number(handle[0].width) > 20 });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
