/**
 * behaviourTrack.mjs — the slider half of the `Behavior` section, which the coverage matrix found
 * 48 properties short.
 *
 * This is the half an author touches to make a slider look and feel like the parameter it drives:
 * how many ticks and how long, which side of the track they sit on, where the centre is and which
 * way the fill grows from it, what the numbers say, what the keyboard does to them, and what a
 * click on the bare track means when there is more than one handle.
 *
 * WHERE THE EVIDENCE IS. Ticks are `<line>` elements — the track is one too, so a tick is told
 * apart by being PERPENDICULAR to it (x1 === x2 on a horizontal slider), and major from minor by
 * stroke width. The labels are `.slider-label` divs, one of which carries `.slider-readout`; their
 * text is what `formatSliderNumericValue` produced, which is where prefix, suffix, unit and the
 * sign live. So the formatting rows read the same string a user reads.
 *
 * THREE FIXTURE TRAPS, two of them new here:
 *
 * - A PART OUTRANKS THE PROPERTY. `majorTickLength` is
 *   `numberOr(tickMajorPart?._children?.Layout?.height, numberOr(behavior?.majorTickLength, 12))` —
 *   so a slider carrying semantic Parts (what the Slider editor's presets install) ignores the
 *   Behavior number entirely. The fixtures here are plain `addControl` sliders, which carry no
 *   parts, and the row that would have been measured on a preset slider is stated rather than
 *   guessed at.
 * - `Behavior.defaultValue` IS NOT A SLIDER FIELD. A slider's value comes from
 *   `defaultCurrentValue`, falling back to `centerValue` and only then to the middle of the range.
 *   Setting `defaultValue` on a slider changes nothing and reads as a dead property.
 * - `Transform.y` past about 240 puts a control's screen row under the editor chrome at this
 *   viewport, and a press there lands on the chrome. Fourth suite this has caught.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('track');
const B = 'Behavior';

/** Every line drawn perpendicular to a horizontal track: the ticks, and nothing else. */
const ticksOf = async (id) => {
  const lines = await kit.shapes(id, 'line');
  return lines.filter((l) => Math.abs(Number(l.x1) - Number(l.x2)) < 0.01
    && Math.abs(Number(l.y2) - Number(l.y1)) > 0.5);
};
const tickSplit = async (id) => {
  const ticks = await ticksOf(id);
  const len = (l) => Math.round(Math.abs(Number(l.y2) - Number(l.y1)) * 10) / 10;
  const major = ticks.filter((l) => Number(l['stroke-width']) >= 2);
  const minor = ticks.filter((l) => Number(l['stroke-width']) < 2);
  return {
    major: major.length,
    minor: minor.length,
    majorLen: major.length ? len(major[0]) : null,
    minorLen: minor.length ? len(minor[0]) : null,
    /** Where a tick sits relative to the track, which is what tickPlacement decides. */
    span: major.length ? [Math.min(Number(major[0].y1), Number(major[0].y2)),
      Math.max(Number(major[0].y1), Number(major[0].y2))] : null,
  };
};
/** The horizontal track line — the one line that is not a tick, and the longest of those. */
const trackLine = async (id) => {
  const lines = await kit.shapes(id, 'line');
  const flat = lines.filter((l) => Math.abs(Number(l.y1) - Number(l.y2)) < 0.01);
  flat.sort((a, b) => Math.abs(Number(b.x2) - Number(b.x1)) - Math.abs(Number(a.x2) - Number(a.x1)));
  return flat[0] ?? null;
};
/** The fill: the SHORTER of the two horizontal lines, drawn over the track from its origin. */
const fillLine = async (id) => {
  const lines = await kit.shapes(id, 'line');
  const flat = lines.filter((l) => Math.abs(Number(l.y1) - Number(l.y2)) < 0.01);
  flat.sort((a, b) => Math.abs(Number(a.x2) - Number(a.x1)) - Math.abs(Number(b.x2) - Number(b.x1)));
  return flat[0] ?? null;
};

const labelsOf = (id) => kit.dom(id, '.slider-label');
const readoutOf = async (id) => (await kit.dom(id, '.slider-readout'))[0] ?? null;
/** The min and max labels: every slider-label that is not the readout or the title. */
const minMaxOf = async (id) => (await labelsOf(id))
  .filter((l) => !String(l.cls).includes('slider-readout') && !String(l.cls).includes('slider-title'));

const focusAnd = async (id, ...keys) => {
  await kit.page.evaluate(({ id }) => {
    document.querySelector(`[data-control-id="${id}"]`)?.focus?.();
  }, { id });
  await kit.settle(150);
  for (const key of keys) {
    await kit.page.keyboard.press(key);
    await kit.settle(160);
  }
  await kit.settle(220);
  return (await readoutOf(id))?.text ?? null;
};
const beginSliderEventCapture = () => kit.page.evaluate(async () => {
  window.__sliderBehaviorEvents = [];
  const api = (await import('/src/CE_Application/scripting/panelRuntime.js'))
    .scriptApiForTesting('', 'behavior-slider-browser');
  for (const event of ['onValueChange', 'onValueChanged', 'onActiveHandleChanged']) {
    api.on('*', event, (payload) => window.__sliderBehaviorEvents.push({ event, payload }));
  }
});
const sliderEvents = () => kit.page.evaluate(() => window.__sliderBehaviorEvents ?? []);
const clearSliderEvents = () => kit.page.evaluate(() => { window.__sliderBehaviorEvents = []; });

/** A plain slider with a readable range, at a row the editor chrome cannot swallow. */
const slider = (y, extra = {}) => kit.make('Slider', {
  'Transform.x': 70, 'Transform.y': y, 'Transform.width': 340, 'Transform.height': 110,
  'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.step': 1,
  'Behavior.defaultCurrentValue': 40, 'Behavior.precision': 0, ...extra,
});

const near = (a, b, tol = 1) => a !== null && b !== null && Math.abs(a - b) <= tol;

try {
  // =============================================================================================
  // The ticks: how many, how long, and which side of the track.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.showTicks': true,
      'Behavior.majorTickCount': 6, 'Behavior.minorTickCount': 0 });
    await kit.preview(true);
    await kit.settle(600);

    led.check(B, 'majorTickCount', 'six major ticks is six marks on the track, counting both ends',
      6, (await tickSplit(sid)).major);
    await kit.set(sid, { 'Behavior.majorTickCount': 11 });
    await kit.settle(320);
    led.check(B, 'majorTickCount (changed)', 'and eleven is eleven — the count is the number of marks, not the number of gaps between them',
      11, (await tickSplit(sid)).major);

    await kit.set(sid, { 'Behavior.majorTickCount': 6, 'Behavior.minorTickCount': 3 });
    await kit.settle(320);
    led.check(B, 'minorTickCount', 'minor ticks fill the gaps BETWEEN the majors, three to a gap — five gaps under six majors is fifteen of them',
      { major: 6, minor: 15 }, await (async () => {
        const t = await tickSplit(sid);
        return { major: t.major, minor: t.minor };
      })());

    // TICK LENGTH IS A PARTS PROPERTY, NOT A BEHAVIOR ONE, and the Behavior fields that look like
    // they own it cannot be reached from the renderer at all. Both rows below are measured rather
    // than reasoned, because the fallback chain reads as though the Behavior number is the default:
    //   numberOr(tickMajorPart?._children?.Layout?.height, numberOr(behavior?.majorTickLength, 12))
    await kit.set(sid, { 'Behavior.majorTickLength': 20, 'Behavior.minorTickLength': 4 });
    await kit.settle(320);
    const lengths = await tickSplit(sid);
    led.check(B, 'majorTickLength + minorTickLength (the part wins)',
      'the tick length an author changes is the tickMajor/tickMinor PART’s height, which every slider and knob is built with — so the Behavior numbers beside them draw nothing, and a slider told to draw twenty-pixel majors still draws the part’s twelve',
      { major: 12, minor: 7, partMajor: 12, partMinor: 7 },
      { major: lengths.majorLen, minor: lengths.minorLen,
        partMajor: await kit.read(sid, 'Parts._children.tickMajor._children.Layout.height'),
        partMinor: await kit.read(sid, 'Parts._children.tickMinor._children.Layout.height') });
    led.check(B, 'majorTickLength (and the fallback cannot be reached by taking the part away)',
      'emptying the Parts block does not hand the Behavior number its turn either: `resolveSliderSemanticParts` merges the full default set back in before the renderer sees it, so the second term of that fallback is dead code on this surface however the document is authored',
      { drawn: 12, partsEmpty: {} },
      await (async () => {
        await kit.set(sid, { 'Parts._children': {} });
        await kit.settle(420);
        return { drawn: (await tickSplit(sid)).majorLen,
          partsEmpty: await kit.read(sid, 'Parts._children') };
      })());
    await kit.set(sid, { 'Behavior.majorTickLength': 12, 'Behavior.minorTickLength': 7 });
    await kit.settle(320);

    // tickPlacement decides which side of the track the tick grows from. Measured against the
    // track's own line rather than against the box, because the track is not centred in the box —
    // the readout and the min/max labels take their own room first.
    const track = await trackLine(sid);
    const trackY = Number(track.y1);
    await kit.set(sid, { 'Behavior.tickPlacement': 'outside' });
    await kit.settle(320);
    const outside = (await tickSplit(sid)).span;
    led.check(B, 'tickPlacement (outside)', 'outside puts the whole tick below the track, clear of it',
      true, outside[0] > trackY && outside[1] > trackY);
    await kit.set(sid, { 'Behavior.tickPlacement': 'inside' });
    await kit.settle(320);
    const inside = (await tickSplit(sid)).span;
    led.check(B, 'tickPlacement (inside)', 'inside puts it above the track, on the other side entirely',
      true, inside[0] < trackY && inside[1] < trackY);
    await kit.set(sid, { 'Behavior.tickPlacement': 'cross' });
    await kit.settle(320);
    const cross = (await tickSplit(sid)).span;
    led.check(B, 'tickPlacement (cross)', 'and cross straddles it, half above and half below, centred on the track',
      { straddles: true, centred: true },
      { straddles: cross[0] < trackY && cross[1] > trackY,
        centred: near((cross[0] + cross[1]) / 2, trackY, 0.6) });
  }
  await kit.preview(false);

  // =============================================================================================
  // centerValue and fillOrigin — where the middle is, and which way the fill grows from it.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.min': -50, 'Behavior.max': 50,
      'Behavior.defaultCurrentValue': 25, 'Behavior.centerValue': 0,
      'Behavior.showCenterMarker': true, 'Behavior.showTicks': false });
    await kit.preview(true);
    await kit.settle(600);
    const track = await trackLine(sid);
    const x0 = Number(track.x1);
    const x1 = Number(track.x2);
    const atValue = (v) => x0 + ((v + 50) / 100) * (x1 - x0);

    // The centre marker is the only perpendicular line on a slider with its ticks off.
    const marker = await ticksOf(sid);
    led.check(B, 'centerValue (the marker stands where the value says)',
      'a bipolar slider centred on zero draws its centre marker at the middle of the track, not at its minimum',
      true, marker.length === 1 && near(Number(marker[0].x1), atValue(0), 1.5));
    await kit.set(sid, { 'Behavior.centerValue': 25 });
    await kit.settle(340);
    const moved = await ticksOf(sid);
    led.check(B, 'centerValue (moved)', 'and moving the centre moves the marker with it, three quarters along a −50..50 track',
      true, moved.length === 1 && near(Number(moved[0].x1), atValue(25), 1.5));
    await kit.set(sid, { 'Behavior.centerValue': 0 });
    await kit.settle(300);

    led.check(B, 'fillOrigin (min)', 'left alone the fill grows from the minimum end, so a value of 25 fills three quarters of the track',
      true, await (async () => {
        const fill = await fillLine(sid);
        return near(Number(fill.x1), x0, 1.5) && near(Number(fill.x2), atValue(25), 2);
      })());
    await kit.set(sid, { 'Behavior.fillOrigin': 'center' });
    await kit.settle(340);
    led.check(B, 'fillOrigin (center)',
      'switched to the centre it grows from there instead — which is what a pan or a detune control wants, where the interesting thing is the distance from the middle rather than from the bottom',
      true, await (async () => {
        const fill = await fillLine(sid);
        return near(Number(fill.x1), atValue(0), 2) && near(Number(fill.x2), atValue(25), 2);
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // The numbers: what the labels say, and where they sit.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.showMinMaxLabels': true,
      'Behavior.showValueReadout': true, 'Behavior.showTicks': false });
    await kit.preview(true);
    await kit.settle(600);

    led.check(B, 'showMinMaxLabels (true)', 'the two ends of the range are written out under the track, formatted the same way the readout is',
      ['0', '100'], (await minMaxOf(sid)).map((l) => l.text));
    await kit.set(sid, { 'Behavior.showMinMaxLabels': false });
    await kit.settle(340);
    led.check(B, 'showMinMaxLabels (false)', 'and switched off there are none — the readout stays, because it is a different label',
      { minMax: 0, readout: '40' },
      { minMax: (await minMaxOf(sid)).length, readout: (await readoutOf(sid))?.text ?? null });
    await kit.set(sid, { 'Behavior.showMinMaxLabels': true });
    await kit.settle(320);

    led.check(B, 'prefix + suffix + unit', 'the three wrap the number in the order the author expects — prefix, the digits, suffix, then the unit with a space before it',
      '~40%  dB', await (async () => {
        await kit.set(sid, { 'Behavior.prefix': '~', 'Behavior.suffix': '%', 'Behavior.unit': ' dB' });
        await kit.settle(360);
        return (await readoutOf(sid))?.text ?? null;
      })());
    led.check(B, 'prefix + suffix + unit (the ends are formatted too)',
      'and the min and max labels are formatted by the same function, so a panel does not read one way in the middle and another at the ends',
      ['~0%  dB', '~100%  dB'], (await minMaxOf(sid)).map((l) => l.text));
    await kit.set(sid, { 'Behavior.prefix': '', 'Behavior.suffix': '', 'Behavior.unit': '' });
    await kit.settle(320);

    led.check(B, 'showSign', 'a bipolar readout wears its plus, which is the whole point of the setting: −3 and +3 should not both read as a bare number',
      { positive: '+40', negative: '-40', zero: '0' },
      await (async () => {
        await kit.set(sid, { 'Behavior.min': -100, 'Behavior.showSign': true });
        await kit.settle(360);
        const positive = (await readoutOf(sid))?.text ?? null;
        await kit.set(sid, { 'Behavior.defaultCurrentValue': -40 });
        await kit.settle(360);
        const negative = (await readoutOf(sid))?.text ?? null;
        await kit.set(sid, { 'Behavior.defaultCurrentValue': 0 });
        await kit.settle(360);
        return { positive, negative, zero: (await readoutOf(sid))?.text ?? null };
      })());
    led.check(B, 'showSign (false)', 'and without it a positive value is a bare number again, while the minus on a negative one was never the setting’s doing',
      { positive: '40', negative: '-40' }, await (async () => {
        await kit.set(sid, { 'Behavior.showSign': false, 'Behavior.defaultCurrentValue': 40 });
        await kit.settle(360);
        const positive = (await readoutOf(sid))?.text ?? null;
        await kit.set(sid, { 'Behavior.defaultCurrentValue': -40 });
        await kit.settle(360);
        return { positive, negative: (await readoutOf(sid))?.text ?? null };
      })());
    await kit.set(sid, { 'Behavior.min': 0, 'Behavior.defaultCurrentValue': 40 });
    await kit.settle(320);
  }
  await kit.preview(false);

  // =============================================================================================
  // Where the labels sit: gap, offset and placement, for the two label groups separately.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.showTicks': false });
    await kit.preview(true);
    await kit.settle(600);
    const readoutY = async () => (await readoutOf(sid))?.y ?? null;
    const minMaxY = async () => (await minMaxOf(sid))[0]?.y ?? null;
    const minMaxX = async () => (await minMaxOf(sid))[0]?.x ?? null;

    const baseMinMax = await minMaxY();
    await kit.set(sid, { 'Behavior.labelMinMaxGap': 44 });
    await kit.settle(360);
    const widerMinMax = await minMaxY();
    led.check(B, 'labelMinMaxGap (D-19: it did nothing at the default placement)',
      'widening the gap pushes the end labels further from the track, and by the amount asked for. It used to move nothing at all until the Position dropdown beside it was taken off `auto`, which carried the distance as a literal — and the literal was the very number the cell was showing, so the setting looked live and was not',
      true, baseMinMax !== null && widerMinMax !== null && near(widerMinMax - baseMinMax, 22, 1.5));

    const baseX = await minMaxX();
    await kit.set(sid, { 'Behavior.labelMinMaxOffsetX': 18, 'Behavior.labelMinMaxOffsetY': 6 });
    await kit.settle(360);
    led.check(B, 'labelMinMaxOffsetX + labelMinMaxOffsetY', 'and the two offsets nudge them from wherever the gap left them, one axis each',
      { x: true, y: true },
      { x: near((await minMaxX()) - baseX, 18, 1.5),
        y: near((await minMaxY()) - widerMinMax, 6, 1.5) });
    await kit.set(sid, { 'Behavior.labelMinMaxOffsetX': 0, 'Behavior.labelMinMaxOffsetY': 0,
      'Behavior.labelMinMaxGap': 22 });
    await kit.settle(320);

    const track = await trackLine(sid);
    const trackY = Number(track.y1);
    await kit.set(sid, { 'Behavior.labelMinMaxPlacement': 'above' });
    await kit.settle(360);
    const above = await minMaxY();
    await kit.set(sid, { 'Behavior.labelMinMaxPlacement': 'below' });
    await kit.settle(360);
    const below = await minMaxY();
    led.check(B, 'labelMinMaxPlacement', 'and placement moves them to the other side of the track outright, rather than by a distance',
      { above: true, below: true, apart: true },
      { above: above < trackY, below: below > trackY, apart: below - above > 10 });

    const baseReadout = await readoutY();
    await kit.set(sid, { 'Behavior.labelReadoutGap': 40 });
    await kit.settle(360);
    const movedReadout = await readoutY();
    led.check(B, 'labelReadoutGap (D-19: the same, for the readout)',
      'the readout has a gap of its own, so the value can sit close while the ends sit far — and it moves the readout ALONE, which is what makes the two gaps two settings rather than one spelled twice',
      { moved: true, endsUnmoved: true },
      { moved: baseReadout !== null && near(movedReadout - baseReadout, 26, 1.5),
        endsUnmoved: near(await minMaxY(), below, 1.5) });
    const baseReadoutX = (await readoutOf(sid))?.x ?? null;
    await kit.set(sid, { 'Behavior.labelReadoutOffsetX': -14, 'Behavior.labelReadoutOffsetY': 9 });
    await kit.settle(360);
    led.check(B, 'labelReadoutOffsetX + labelReadoutOffsetY', 'and its own pair of offsets, which move it and nothing else',
      { x: true, y: true },
      { x: near(((await readoutOf(sid))?.x ?? 0) - baseReadoutX, -14, 1.5),
        y: near((await readoutY()) - movedReadout, 9, 1.5) });
    await kit.set(sid, { 'Behavior.labelReadoutOffsetX': 0, 'Behavior.labelReadoutOffsetY': 0 });
    await kit.settle(320);
    // The readout's placement vocabulary is its own — auto/top/center/bottom, measured from the
    // component's edges — where the min/max one is auto/below/above/center measured from the track.
    // Two lists, two meanings; using one's words on the other is silently ignored.
    const readoutBefore = await readoutY();
    await kit.set(sid, { 'Behavior.labelReadoutPlacement': 'bottom' });
    await kit.settle(360);
    const atBottom = await readoutY();
    await kit.set(sid, { 'Behavior.labelReadoutPlacement': 'center' });
    await kit.settle(360);
    led.check(B, 'labelReadoutPlacement',
      'the readout can be sent to the bottom edge of the component or parked in the middle of it, where the default leaves it at the top',
      { bottom: true, belowTrack: true, centre: true },
      { bottom: Math.abs(atBottom - readoutBefore) > 10, belowTrack: atBottom > trackY,
        centre: near(await readoutY(), trackY, 14) });
  }
  await kit.preview(false);

  // =============================================================================================
  // snapToStep and snapToTicks — what a value is allowed to be.
  // =============================================================================================
  await kit.fresh();
  {
    const stepped = await slider(110, { 'Behavior.step': 10, 'Behavior.snapToStep': true,
      'Behavior.showTicks': false, 'Behavior.defaultCurrentValue': 44 });
    const free = await slider(180, { 'Behavior.step': 10, 'Behavior.snapToStep': false,
      'Behavior.showTicks': false, 'Behavior.defaultCurrentValue': 44 });
    await kit.preview(true);
    await kit.settle(600);
    led.check(B, 'snapToStep', 'a stepped slider rounds an authored 44 onto its own ten-unit grid, and one that is not stepped keeps it',
      { snapped: '40', kept: '44' },
      { snapped: (await readoutOf(stepped))?.text ?? null, kept: (await readoutOf(free))?.text ?? null });

    // snapToTicks replaces the step with the tick spacing: span / ((major-1) * (minor+1)).
    // Six majors and one minor between them over 0..100 is ten units, and an arrow press moves by
    // exactly that rather than by the authored step.
    const ticked = await slider(250, { 'Behavior.step': 1, 'Behavior.snapToTicks': true,
      'Behavior.showTicks': true, 'Behavior.majorTickCount': 6, 'Behavior.minorTickCount': 1,
      'Behavior.defaultCurrentValue': 40 });
    await kit.set(ticked, { 'Transform.y': 180 });
    await kit.set(free, { 'Transform.y': 330 });
    await kit.settle(400);
    led.check(B, 'snapToTicks', 'with it on, one arrow press moves a whole tick — ten units under six majors and one minor each — rather than the authored step of one',
      '50', await focusAnd(ticked, 'ArrowRight'));
  }
  await kit.preview(false);

  // =============================================================================================
  // The keyboard: three groups of keys, each with its own switch.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.step': 5, 'Behavior.showTicks': false,
      'Behavior.defaultCurrentValue': 40 });
    await kit.preview(true);
    await kit.settle(600);

    led.check(B, 'arrowKeyAdjust', 'an arrow moves the value by one step, and the opposite arrow brings it back',
      { up: '45', down: '40' },
      { up: await focusAnd(sid, 'ArrowRight'), down: await focusAnd(sid, 'ArrowLeft') });
    led.check(B, 'pageKeyAdjust', 'a page key moves it by ten steps, which is what makes a long range usable from the keyboard at all',
      { up: '90', down: '40' },
      { up: await focusAnd(sid, 'PageUp'), down: await focusAnd(sid, 'PageDown') });
    led.check(B, 'homeEndAdjust', 'and Home and End go to the ends of the range outright',
      { end: '100', home: '0' },
      { end: await focusAnd(sid, 'End'), home: await focusAnd(sid, 'Home') });

  }
  await kit.preview(false);

  // ONE CONTROL PER SWITCH. `defaultCurrentValue` does not clear a session's value override any
  // more than `defaultValue` does, so re-authoring it between two key presses measures where the
  // previous row left the slider, not where the row under test started.
  await kit.fresh();
  {
    const short = (y, extra) => kit.make('Slider', { 'Transform.x': 70, 'Transform.y': y,
      'Transform.width': 320, 'Transform.height': 46, 'Behavior.min': 0, 'Behavior.max': 100,
      'Behavior.step': 5, 'Behavior.precision': 0, 'Behavior.defaultCurrentValue': 40,
      'Behavior.showTicks': false, 'Behavior.showMinMaxLabels': false, ...extra });
    const noArrows = await short(110, { 'Behavior.arrowKeyAdjust': false });
    const noPage = await short(165, { 'Behavior.pageKeyAdjust': false });
    const noHomeEnd = await short(220, { 'Behavior.homeEndAdjust': false });
    await kit.preview(true);
    await kit.settle(650);

    led.check(B, 'arrowKeyAdjust (false)', 'switched off the arrows do nothing, while the page keys on the same control go on working — three switches, not one',
      { arrows: '40', page: '90' },
      { arrows: await focusAnd(noArrows, 'ArrowRight', 'ArrowRight'),
        page: await focusAnd(noArrows, 'PageUp') });
    led.check(B, 'pageKeyAdjust (false)', 'the page keys have their own switch, which leaves the arrows alone',
      { page: '40', arrows: '45' },
      { page: await focusAnd(noPage, 'PageUp'), arrows: await focusAnd(noPage, 'ArrowRight') });
    led.check(B, 'homeEndAdjust (false)', 'and so do Home and End',
      { home: '40', arrows: '45' },
      { home: await focusAnd(noHomeEnd, 'Home'), arrows: await focusAnd(noHomeEnd, 'ArrowRight') });
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.step': 5, 'Behavior.showTicks': false,
      'Behavior.defaultCurrentValue': 40, 'Behavior.keyboardEnabled': false });
    await kit.preview(true);
    await kit.settle(600);
    led.check(B, 'keyboardEnabled (false) — the switch above all three',
      'one switch above them turns the lot off, however the three below it are set: an arrow, a page key and Home between them move nothing',
      '40', await focusAnd(sid, 'ArrowLeft', 'PageDown', 'Home'));
  }
  await kit.preview(false);

  // =============================================================================================
  // dragEnabled and trackClickMode — what the pointer may do to the track.
  // =============================================================================================
  await kit.fresh();
  {
    // `dragEnabled` IS NOT A SLIDER SETTING, and both readers say so in the same breath they read
    // it: `behavior?.dragEnabled !== true || isSliderRangeBehavior(behavior)`. It gates the
    // NUMBER FIELD's scrub — the drag that turns a spinbox into a fader — and a slider's track is
    // the slider, so switching it off there would be switching the control off.
    const sid = await slider(110, { 'Behavior.showTicks': false, 'Behavior.dragEnabled': false });
    const num = await kit.make('Number', { 'Transform.x': 70, 'Transform.y': 240,
      'Transform.width': 150, 'Transform.height': 40,
      'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.step': 1,
      'Behavior.defaultValue': 40, 'Behavior.dragEnabled': false });
    await kit.preview(true);
    await kit.settle(650);

    const box = await kit.box(sid);
    const y = box.y + box.h / 2;
    await kit.drag({ x: box.x + box.w * 0.4, y }, { x: box.x + box.w * 0.9, y });
    await kit.settle(400);
    led.check(B, 'dragEnabled (a slider is not gated by it)',
      'a slider with dragging switched off is still dragged across its track, and is right to be: the track IS the control, so the readers exclude the slider role by name rather than letting the flag disable it',
      true, Number((await readoutOf(sid))?.text ?? -1) > 60);

    // The only role left for the flag is the spinbox, and the press it needs never arrives. The
    // middle third of a Number — the zone `resolveRangeZone` calls `value`, the one a scrub would
    // start in — is an <input>, and `handleRangeFieldFocus` stops propagation and opens text
    // editing before the surface's own pointer path sees anything. Measured below rather than read
    // off the source: what is under the centre of the control, and what a ninety-pixel drag from
    // there leaves behind.
    await kit.set(num, { 'Behavior.dragEnabled': true });
    await kit.settle(380);
    const nbox = await kit.box(num);
    const ny = nbox.y + nbox.h / 2;
    const underCentre = await kit.page.evaluate(({ id }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width * 0.5, r.y + r.height * 0.5);
      return `${hit?.tagName.toLowerCase()}.${String(hit?.className ?? '').split(' ')[0]}`;
    }, { id: num });
    await kit.page.mouse.move(nbox.x + nbox.w * 0.5, ny);
    await kit.page.mouse.down();
    await kit.settle(70);
    await kit.page.mouse.move(nbox.x + nbox.w * 0.5 + 45, ny, { steps: 6 });
    await kit.settle(70);
    await kit.page.mouse.move(nbox.x + nbox.w * 0.5 + 90, ny, { steps: 6 });
    await kit.settle(70);
    await kit.page.mouse.up();
    await kit.settle(440);
    const after = await kit.session(num);
    led.inert(B, 'dragEnabled',
      'drag across a number field to scrub its value',
      `no editor offers a cell for it, and neither surface that reads it can act on it. Both readers exclude the slider role by name in the same expression — \`behavior?.dragEnabled !== true || isSliderRangeBehavior(behavior)\` — which leaves the spinbox as the only role it could gate, and the spinbox never delivers the press: the middle third of a Number, the zone a scrub would start in, is an <input> (measured: elementFromPoint at the centre returns \`${underCentre}\`), and its focus handler opens text editing and stops propagation before the surface's pointer path is reached. A ninety-pixel drag from there with the flag ON left the value untouched and the field in edit mode (valueInputActive: ${after?.valueInputActive}, valueOverrideEnabled: ${after?.valueOverrideEnabled}). Smallest honest release treatment: leave the key and say nothing about it, since nothing in the UI promises it — the alternative is a design decision about what a click on a spinbox means, which is not a defect fix.`);
  }
  await kit.preview(false);

  await kit.fresh();
  {
    // trackClickMode needs TWO handles to mean anything: it decides which of them a click on the
    // bare track picks up.
    const sid = await slider(110, { 'Behavior.valueMode': 'range', 'Behavior.showTicks': false,
      'Behavior.defaultStartValue': 20, 'Behavior.defaultEndValue': 80,
      'Behavior.trackClickMode': 'moveNearestHandle' });
    await kit.preview(true);
    await kit.settle(600);
    const handleAt = async () => (await kit.session(sid))?.activeHandle ?? null;
    const box = await kit.box(sid);
    const y = box.y + box.h / 2;

    await kit.click({ x: box.x + box.w * 0.15, y });
    await kit.settle(360);
    const nearStart = await handleAt();
    await kit.click({ x: box.x + box.w * 0.9, y });
    await kit.settle(360);
    led.check(B, 'trackClickMode (moveNearestHandle)',
      'a click near the low end grabs the low handle and one near the high end grabs the high one — the handle you meant, not the one you last touched',
      { low: 'start', high: 'end' }, { low: nearStart, high: await handleAt() });

    await kit.set(sid, { 'Behavior.trackClickMode': 'moveActiveHandle' });
    await kit.settle(360);
    await kit.click({ x: box.x + box.w * 0.15, y });
    await kit.settle(360);
    led.check(B, 'trackClickMode (moveActiveHandle)',
      'switched to the active handle, the same click at the low end keeps driving the handle already in hand, which is what a fine adjustment wants',
      'end', await handleAt());
  }
  await kit.preview(false);

  // =============================================================================================
  // emission — continuous movement, the release commit, and active-handle metadata are distinct.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.showTicks': false,
      'Behavior.emitValueChange': true, 'Behavior.emitValueCommit': true });
    await kit.preview(true);
    await kit.settle(650);
    await beginSliderEventCapture();
    const box = await kit.box(sid);
    const y = box.y + box.h / 2;
    await kit.drag({ x: box.x + box.w * 0.4, y }, { x: box.x + box.w * 0.75, y });
    await kit.settle(450);
    const emitted = await sliderEvents();

    led.check(B, 'emitValueChange + emitValueCommit',
      'a real drag reports continuous resolved values while moving, then one settled value on release; the commit is an edge and does not depend on the final value changing again',
      { changed: true, commits: 1, commitLast: true, moved: true },
      { changed: emitted.some((entry) => entry.event === 'onValueChange'),
        commits: emitted.filter((entry) => entry.event === 'onValueChanged').length,
        commitLast: emitted.at(-1)?.event === 'onValueChanged',
        moved: Number((await readoutOf(sid))?.text ?? -1) > 60 });

    await kit.set(sid, { 'Behavior.emitValueChange': false, 'Behavior.emitValueCommit': false });
    await kit.settle(300);
    await clearSliderEvents();
    await kit.drag({ x: box.x + box.w * 0.75, y }, { x: box.x + box.w * 0.25, y });
    await kit.settle(450);
    led.check(B, 'emitValueChange + emitValueCommit (false)',
      'both off, the handle still moves through the normal session/binding path while the two script events stay silent',
      { events: 0, moved: true },
      { events: (await sliderEvents()).length, moved: Number((await readoutOf(sid))?.text ?? 101) < 40 });
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.valueMode': 'range', 'Behavior.showTicks': false,
      'Behavior.defaultStartValue': 20, 'Behavior.defaultEndValue': 80,
      'Behavior.activeHandlePolicy': 'startFirst', 'Behavior.emitActiveHandleChange': true });
    await kit.preview(true);
    await kit.settle(650);
    await beginSliderEventCapture();
    const box = await kit.box(sid);
    const y = box.y + box.h / 2;
    await kit.click({ x: box.x + box.w * 0.9, y });
    await kit.settle(400);
    const emitted = (await sliderEvents()).filter((entry) => entry.event === 'onActiveHandleChanged');
    led.check(B, 'emitActiveHandleChange',
      'moving focus from the low to the high handle emits one explicit event whose metadata names both sides of the transition',
      [{ activeHandle: 'end', previousActiveHandle: 'start' }], emitted.map((entry) => entry.payload));

    await kit.set(sid, { 'Behavior.emitActiveHandleChange': false });
    await kit.settle(300);
    await clearSliderEvents();
    await kit.click({ x: box.x + box.w * 0.1, y });
    await kit.settle(400);
    led.check(B, 'emitActiveHandleChange (false)',
      'off, the low handle still becomes active but the metadata event is suppressed',
      { activeHandle: 'start', events: 0 },
      { activeHandle: (await kit.session(sid))?.activeHandle,
        events: (await sliderEvents()).filter((entry) => entry.event === 'onActiveHandleChanged').length });
  }
  await kit.preview(false);

  // =============================================================================================
  // save/reopen — every one of these is authored state.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await slider(110, { 'Behavior.showTicks': true, 'Behavior.majorTickCount': 5,
      'Behavior.minorTickCount': 1, 'Behavior.tickPlacement': 'cross',
      'Behavior.prefix': '<', 'Behavior.suffix': '>', 'Behavior.unit': 'Hz',
      'Behavior.step': 5, 'Behavior.defaultCurrentValue': 40,
      'Behavior.emitValueCommit': false, 'Behavior.emitActiveHandleChange': false });
    const again = await kit.reopen(sid);
    await kit.preview(true);
    await kit.settle(700);
    led.check(B, 'save/reopen (the ticks and the numbers)',
      'a reopened slider draws the same ticks at the same length on the same side, and writes its numbers the same way',
      { major: 5, minor: 4, majorLen: 12, readout: '<40> Hz' },
      await (async () => {
        const t = await tickSplit(again);
        return { major: t.major, minor: t.minor, majorLen: t.majorLen,
          readout: (await readoutOf(again))?.text ?? null };
      })());
    led.check(B, 'save/reopen (the keyboard)', 'and still moves by the step it was authored with',
      '<45> Hz', await focusAnd(again, 'ArrowRight'));
    led.check(B, 'save/reopen (slider emission)',
      'and keeps the two slider-specific runtime switches rather than silently restoring their defaults',
      { emitValueCommit: false, emitActiveHandleChange: false },
      { emitValueCommit: await kit.read(again, 'Behavior.emitValueCommit'),
        emitActiveHandleChange: await kit.read(again, 'Behavior.emitActiveHandleChange') });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
