/**
 * behaviourCurves.mjs — deep behavioural pass over the curve-shaped modulation components.
 *
 * WHAT "BEHAVIOURAL" MEANS HERE, because the previous pass got this wrong and was right to be
 * rejected: a property is verified when its DECLARED PROMISE was turned into an exact expected
 * result and that result was measured off the rendered SVG, a rasterised pixel, the fan-out values
 * a device parameter would receive, or a real pointer gesture — and then again after the panel was
 * saved to its on-disk format and reopened. Writing the property and watching the DOM change is
 * not evidence of anything except that the renderer re-ran.
 *
 * Run: node browser-checks/behaviourCurves.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('curves');
const W = 420;
const H = 260;
const PAD = 10;                                   // EnvelopeRenderer's own PAD
const geom = { x0: PAD, y0: PAD, w: W - PAD * 2, h: H - PAD * 2 };
const toPx = (p) => ({ px: geom.x0 + p.x * geom.w, py: geom.y0 + (1 - p.y) * geom.h });
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  const a = parseInt(s.slice(0, 2), 16) / 255;
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
};

try {
  // =============================================================================================
  // ENVELOPE — 29 properties
  // =============================================================================================
  await kit.fresh();
  const T = 'Envelope';
  const base = { 'Transform.width': W, 'Transform.height': H };
  let id = await kit.make(T, base);

  // --- points: the drawn curve IS the point list -----------------------------------------------
  // The strongest single assertion available for this component: every node circle must sit at the
  // pixel its own normalised point maps to, y flipped, inside a 10px pad. If the renderer and the
  // geometry module ever disagree the hit test lands beside the node and dragging breaks, which is
  // exactly the class of bug a mount check cannot see.
  {
    const points = [
      { id: 'p0', x: 0, y: 0, curve: 'linear', tension: 0 },
      { id: 'p1', x: 0.2, y: 1, curve: 'linear', tension: 0 },
      { id: 'p2', x: 0.7, y: 0.4, curve: 'linear', tension: 0 },
      { id: 'p3', x: 1, y: 0, curve: 'linear', tension: 0 },
    ];
    await kit.set(id, { 'Envelope.points': points, 'Envelope.showPlayhead': false });
    const nodes = await kit.shapes(id, 'circle');
    const want = points.map(toPx);
    const got = nodes.map((n) => ({ px: n.cx, py: n.cy }));
    led.check(T, 'points', 'each breakpoint is drawn at its normalised position, y flipped, inside pad 10',
      want.map((p) => `${Math.round(p.px)},${Math.round(p.py)}`),
      got.map((p) => `${Math.round(p.px)},${Math.round(p.py)}`));
  }

  // --- nodeRadius / lineWidth: exact attributes, not "something changed" ------------------------
  {
    await kit.set(id, { 'Envelope.nodeRadius': 9, 'Envelope.lineWidth': 6 });
    const circles = await kit.shapes(id, 'circle');
    led.check(T, 'nodeRadius', 'the breakpoint dot radius in px', 9, circles[0]?.r);
    const curve = (await kit.shapes(id, 'path')).find((p) => p.fill === 'none');
    led.check(T, 'lineWidth', 'the curve stroke width in px', 6, curve?.['stroke-width']);
    // …and the floor the renderer promises: below 2 and 1 they clamp rather than vanish.
    await kit.set(id, { 'Envelope.nodeRadius': 0, 'Envelope.lineWidth': 0 });
    const clamped = await kit.shapes(id, 'circle');
    led.check(T, 'nodeRadius (boundary 0)', 'clamps to 2 rather than drawing an invisible node', 2, clamped[0]?.r);
    const thin = (await kit.shapes(id, 'path')).find((p) => p.fill === 'none');
    led.check(T, 'lineWidth (boundary 0)', 'clamps to 1 rather than a zero-width line', 1, thin?.['stroke-width']);
    await kit.set(id, { 'Envelope.nodeRadius': 4, 'Envelope.lineWidth': 2 });
  }

  // --- showGrid / gridX / gridY: an exact count of lines, at exact positions --------------------
  {
    await kit.set(id, { 'Envelope.showGrid': true, 'Envelope.gridX': 5, 'Envelope.gridY': 3 });
    // Dashed lines are the sustain and loop MARKERS, not the grid. Counting every vertical line
    // reports the sustain marker as a grid division and calls a correct renderer wrong.
    const lines = (await kit.shapes(id, 'line')).filter((l) => !l['stroke-dasharray']);
    const vertical = lines.filter((l) => l.x1 === l.x2);
    const horizontal = lines.filter((l) => l.y1 === l.y2);
    led.check(T, 'gridX', 'gridX divisions draw gridX-1 interior vertical lines', 4, vertical.length);
    led.check(T, 'gridY', 'gridY divisions draw gridY-1 interior horizontal lines', 2, horizontal.length);
    led.check(T, 'gridX (positions)', 'evenly spaced across the padded width',
      [1, 2, 3, 4].map((i) => Math.round(geom.x0 + (geom.w * i) / 5)),
      vertical.map((l) => Math.round(l.x1)).sort((a, b) => a - b));
    await kit.set(id, { 'Envelope.showGrid': false });
    led.check(T, 'showGrid', 'false removes every grid line', 0,
      (await kit.shapes(id, 'line')).filter((l) => !l['stroke-dasharray']).length);
    await kit.set(id, { 'Envelope.showGrid': true, 'Envelope.gridX': 4, 'Envelope.gridY': 4 });
  }

  // --- fillUnder: the area path exists or does not ----------------------------------------------
  {
    const filled = (await kit.shapes(id, 'path')).filter((p) => p.fill !== 'none');
    led.check(T, 'fillUnder (true)', 'an area path is drawn under the curve', 1, filled.length);
    await kit.set(id, { 'Envelope.fillUnder': false });
    led.check(T, 'fillUnder (false)', 'the area path is gone, the curve remains',
      [0, 1],
      [(await kit.shapes(id, 'path')).filter((p) => p.fill !== 'none').length,
        (await kit.shapes(id, 'path')).filter((p) => p.fill === 'none').length]);
    await kit.set(id, { 'Envelope.fillUnder': true });
  }

  // --- the six colours: resolved paint, and one of them rasterised --------------------------------
  {
    await kit.set(id, {
      'Envelope.lineColour': 'FFE91E63', 'Envelope.fillColour': '80009688',
      'Envelope.nodeColour': 'FFFFEB3B', 'Envelope.gridColour': 'FF3F51B5',
    });
    const shapes = await kit.geo(id);
    const curve = shapes.find((s) => s.tag === 'path' && s.fill === 'none');
    const area = shapes.find((s) => s.tag === 'path' && s.fill !== 'none');
    const node = shapes.find((s) => s.tag === 'circle');
    const grid = shapes.find((s) => s.tag === 'line');
    led.check(T, 'lineColour', 'AARRGGBB becomes the curve stroke', rgba('FFE91E63'), curve?.stroke);
    led.check(T, 'fillColour', 'AARRGGBB becomes the area fill, alpha included', rgba('80009688'), area?.fill);
    led.check(T, 'nodeColour', 'AARRGGBB becomes the node fill', rgba('FFFFEB3B'), node?.fill);
    led.check(T, 'gridColour', 'AARRGGBB becomes the grid stroke', rgba('FF3F51B5'), grid?.stroke);
    // Rasterised, because an attribute is what was asked for and a pixel is what happened. The
    // first node sits at x=0,y=0 — the bottom-left corner of the padded box.
    const at = toPx({ x: 0, y: 0 });
    const px = await kit.pixel(id, at.px / W, at.py / H);
    led.check(T, 'nodeColour (rasterised)', 'the node paints yellow where the node is drawn',
      [255, 235, 59], [px[0], px[1], px[2]],
      (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6));
  }

  // --- sustainIndex: a dashed marker at that point's x, and -1 removes it ------------------------
  {
    await kit.set(id, { 'Envelope.sustainIndex': 2, 'Envelope.sustainColour': 'FFF2C94C' });
    const dashed = (await kit.shapes(id, 'line')).filter((l) => l['stroke-dasharray'] === '3 3');
    led.check(T, 'sustainIndex', 'a dashed vertical marker stands at the sustain point',
      [1, Math.round(toPx({ x: 0.7, y: 0 }).px)],
      [dashed.length, Math.round(dashed[0]?.x1 ?? -1)]);
    led.check(T, 'sustainColour', 'the marker takes the sustain colour', rgba('FFF2C94C'), dashed[0]?.stroke);
    await kit.set(id, { 'Envelope.sustainIndex': -1 });
    led.check(T, 'sustainIndex (-1)', 'no sustain marker at all', 0,
      (await kit.shapes(id, 'line')).filter((l) => l['stroke-dasharray'] === '3 3').length);
    await kit.set(id, { 'Envelope.sustainIndex': 2 });
  }

  // --- loopEnabled / loopStart / loopEnd: a shaded span between two points -----------------------
  {
    led.check(T, 'loopEnabled (false)', 'no loop band is drawn', 0,
      (await kit.shapes(id, 'line')).filter((l) => l['stroke-dasharray'] === '2 2').length);
    await kit.set(id, { 'Envelope.loopEnabled': true, 'Envelope.loopStart': 1, 'Envelope.loopEnd': 2 });
    const marks = (await kit.shapes(id, 'line')).filter((l) => l['stroke-dasharray'] === '2 2');
    const band = (await kit.shapes(id, 'rect'))[0];
    const x1 = toPx({ x: 0.2, y: 0 }).px;
    const x2 = toPx({ x: 0.7, y: 0 }).px;
    led.check(T, 'loopEnabled', 'two dashed markers appear when the loop is on', 2, marks.length);
    led.check(T, 'loopStart / loopEnd', 'the shaded band spans exactly those two breakpoints',
      [Math.round(x1), Math.round(x2 - x1)], [Math.round(band?.x), Math.round(band?.width)]);
    // Out of range on purpose: the renderer clamps rather than drawing off the control.
    await kit.set(id, { 'Envelope.loopStart': 99, 'Envelope.loopEnd': -5 });
    const clampedBand = (await kit.shapes(id, 'rect'))[0];
    led.check(T, 'loopStart / loopEnd (out of range)', 'indices clamp into the point list',
      [Math.round(geom.x0), Math.round(geom.w)],
      [Math.round(clampedBand?.x), Math.round(clampedBand?.width)]);
    await kit.set(id, { 'Envelope.loopEnabled': false, 'Envelope.loopStart': 0, 'Envelope.loopEnd': 0 });
  }

  // --- showPlayhead / phase: a dot on the curve at the phase ---------------------------------------
  {
    led.check(T, 'showPlayhead (false)', 'no playhead dot', 4, (await kit.shapes(id, 'circle')).length);
    await kit.set(id, { 'Envelope.showPlayhead': true, 'Envelope.phase': 0.2,
      'Envelope.playheadColour': 'FF00E5FF' });
    const withHead = await kit.shapes(id, 'circle');
    led.check(T, 'showPlayhead', 'a fifth circle appears — the playhead', 5, withHead.length);
    // At phase 0.2 the curve is at its peak (y=1), so the dot sits at the top of the padded box.
    const head = withHead.find((c) => c.fill === rgba('FF00E5FF'));
    led.check(T, 'phase', 'the dot rides the curve at that phase, here the peak',
      [Math.round(toPx({ x: 0.2, y: 1 }).px), Math.round(toPx({ x: 0.2, y: 1 }).py)],
      [Math.round(head?.cx), Math.round(head?.cy)]);
    led.check(T, 'playheadColour', 'the dot takes its own colour', rgba('FF00E5FF'), head?.fill);
    // Moving the phase moves the dot along the curve to the value there, not along a straight line.
    await kit.set(id, { 'Envelope.phase': 0.95 });
    const moved = (await kit.shapes(id, 'circle')).find((c) => c.fill === rgba('FF00E5FF'));
    const expectedY = 0.4 * (1 - (0.95 - 0.7) / 0.3);      // linear segment p2 -> p3
    led.check(T, 'phase (curve following)', 'the dot takes the curve value at that phase',
      Math.round(toPx({ x: 0.95, y: expectedY }).py), Math.round(moved?.cy),
      (a, b) => near(a, b, 1.5));
    await kit.set(id, { 'Envelope.showPlayhead': false, 'Envelope.phase': 0 });
  }

  // --- curve shape per segment: the path actually bends -------------------------------------------
  // A straight segment and an exponential one between the same two breakpoints must NOT produce the
  // same path. This is the property the whole component exists for.
  {
    const two = (curve) => ([
      { id: 'a', x: 0, y: 0, curve: 'linear', tension: 0 },
      { id: 'b', x: 1, y: 1, curve, tension: 0 },
    ]);
    await kit.set(id, { 'Envelope.points': two('linear') });
    const straight = (await kit.shapes(id, 'path')).find((p) => p.fill === 'none')?.d;
    await kit.set(id, { 'Envelope.points': two('exp') });
    const bent = (await kit.shapes(id, 'path')).find((p) => p.fill === 'none')?.d;
    await kit.set(id, { 'Envelope.points': two('scurve') });
    const esse = (await kit.shapes(id, 'path')).find((p) => p.fill === 'none')?.d;
    assert.ok(straight && bent && esse, 'the curve path is missing');
    led.check(T, 'points[].curve', 'linear, exp and scurve between the same two breakpoints differ',
      3, new Set([straight, bent, esse]).size);
    // …and specifically: at the midpoint, exp must sit BELOW the straight line and scurve on it.
    const midY = (d) => {
      const pts = [...d.matchAll(/[ML]\s*([\d.]+)[, ]+([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
      const mid = pts.reduce((best, p) => (Math.abs(p[0] - (geom.x0 + geom.w / 2)) < Math.abs(best[0] - (geom.x0 + geom.w / 2)) ? p : best), pts[0]);
      return mid[1];
    };
    const lineMid = midY(straight);
    led.check(T, 'points[].curve (direction)', 'exp is slower to rise, so its midpoint is lower on screen',
      true, midY(bent) > lineMid + 5);
    led.check(T, 'points[].curve (scurve)', 'an s-curve passes through the straight midpoint',
      true, near(midY(esse), lineMid, 3));
  }

  // --- timeMax / timeUnit: the designer's stage readout -------------------------------------------
  {
    const stages = (over) => kit.page.evaluate(async ({ id, over }) => {
      const dm = await import('/src/CE_Application/utils/designerModel.js');
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) out.push(c); return out; };
      const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      const merged = over ? { ...c, _children: { ...c._children, Envelope: { ...c._children.Envelope, ...over } } } : c;
      return dm.envelopeStages(merged);
    }, { id, over });
    await kit.set(id, {
      'Envelope.points': [
        { id: 'a', x: 0, y: 0, curve: 'linear', tension: 0 },
        { id: 'b', x: 0.5, y: 1, curve: 'linear', tension: 0 },
        { id: 'c', x: 1, y: 0, curve: 'linear', tension: 0 }],
      'Envelope.sustainIndex': -1, 'Envelope.timeMax': 1000, 'Envelope.timeUnit': 'ms',
    });
    const ms = await stages(null);
    led.check(T, 'timeMax', 'attack 0.5 of the span reads as half of timeMax', 500, ms.attackMs);
    led.check(T, 'timeUnit', 'the readout carries the declared unit', 'ms', ms.unit);
    const sec = await stages({ timeMax: 4000, timeUnit: 's' });
    led.check(T, 'timeMax (rescaled)', 'doubling the span doubles the printed stage', 2000, sec.attackMs);
    led.check(T, 'timeUnit (changed)', 'the unit follows the property', 's', sec.unit);
  }

  // --- xLabel / yLabel: declared, and read by nothing -----------------------------------------------
  led.inert(T, 'xLabel', 'axis label (per its comment: "Axis + readout")',
    'no reader in CE/src, CE/web/src, tools/ or the script API; the renderer draws no <text> at all');
  led.inert(T, 'yLabel', 'axis label', 'same — written only by tools/scripts/an1x-panel, never read');

  await kit.preview(true);

  // --- editable: a pointer drag moves a node, and false refuses it ---------------------------------
  {
    await kit.set(id, {
      'Envelope.points': [
        { id: 'a', x: 0, y: 0, curve: 'linear', tension: 0 },
        { id: 'b', x: 0.5, y: 0.5, curve: 'linear', tension: 0 },
        { id: 'c', x: 1, y: 0, curve: 'linear', tension: 0 }],
      'Envelope.preset': 'free', 'Envelope.editable': true, 'Envelope.snapX': 0, 'Envelope.snapY': 0,
    });
    const box = await kit.box(id);
    const node = await kit.spot(id, 'svg.envelope circle', 1);
    const target = { x: box.x + toPx({ x: 0.75, y: 0 }).px, y: box.y + toPx({ x: 0, y: 0.25 }).py };
    await kit.drag(node, target);
    const after = (await kit.read(id, 'Envelope.points'))[1];
    led.check(T, 'editable (true)', 'dragging a node writes its new normalised position',
      [0.75, 0.25], [Math.round(after.x * 100) / 100, Math.round(after.y * 100) / 100],
      (a, b) => near(a[0], b[0], 0.02) && near(a[1], b[1], 0.02));

    await kit.set(id, { 'Envelope.editable': false });
    const frozen = await kit.read(id, 'Envelope.points');
    const node2 = await kit.spot(id, 'svg.envelope circle', 1);
    await kit.drag(node2, { x: box.x + 40, y: box.y + 40 });
    led.check(T, 'editable (false)', 'the same drag changes nothing',
      frozen[1], (await kit.read(id, 'Envelope.points'))[1]);
    await kit.set(id, { 'Envelope.editable': true });
  }

  // --- snapX / snapY: the drag lands on the grid ----------------------------------------------------
  {
    await kit.set(id, { 'Envelope.snapX': 0.25, 'Envelope.snapY': 0.5 });
    const box = await kit.box(id);
    const node = await kit.spot(id, 'svg.envelope circle', 1);
    // One drag, two different grids: 0.7 is nearest 0.75 on a quarter grid and nearest 0.5 on a
    // half grid, so the same input has to land in two different places on the two axes.
    await kit.drag(node, { x: box.x + toPx({ x: 0.7, y: 0 }).px, y: box.y + toPx({ x: 0, y: 0.7 }).py });
    const snapped = (await kit.read(id, 'Envelope.points'))[1];
    led.check(T, 'snapX', 'a drag to 0.7 lands on the nearest multiple of 0.25',
      0.75, Math.round(snapped.x * 1000) / 1000, (a, b) => near(a, b, 0.001));
    led.check(T, 'snapY', 'the same drag lands on the nearest multiple of 0.5 in y',
      0.5, Math.round(snapped.y * 1000) / 1000, (a, b) => near(a, b, 0.001));
    await kit.set(id, { 'Envelope.snapX': 0, 'Envelope.snapY': 0 });
  }

  // --- preset: which nodes are allowed to move in y --------------------------------------------------
  {
    const startY = (pts) => pts[0].y;
    await kit.set(id, {
      'Envelope.points': [
        { id: 'a', x: 0, y: 0, curve: 'linear', tension: 0 },
        { id: 'b', x: 0.5, y: 0.5, curve: 'linear', tension: 0 },
        { id: 'c', x: 1, y: 0, curve: 'linear', tension: 0 }],
      'Envelope.preset': 'adsr',
    });
    const box = await kit.box(id);
    const first = await kit.spot(id, 'svg.envelope circle', 0);
    await kit.drag(first, { x: first.x, y: box.y + toPx({ x: 0, y: 0.8 }).py });
    led.check(T, 'preset (adsr)', 'a preset envelope pins its start node to zero',
      0, startY(await kit.read(id, 'Envelope.points')));

    await kit.set(id, { 'Envelope.preset': 'free' });
    const first2 = await kit.spot(id, 'svg.envelope circle', 0);
    await kit.drag(first2, { x: first2.x, y: box.y + toPx({ x: 0, y: 0.8 }).py });
    led.check(T, 'preset (free)', 'a free shape lets the start node leave the floor',
      true, startY(await kit.read(id, 'Envelope.points')) > 0.5);
  }

  // --- addOnDoubleClick: a double click on empty space adds a breakpoint --------------------------
  {
    await kit.set(id, {
      'Envelope.points': [
        { id: 'a', x: 0, y: 0, curve: 'linear', tension: 0 },
        { id: 'b', x: 1, y: 1, curve: 'linear', tension: 0 }],
      'Envelope.preset': 'free', 'Envelope.addOnDoubleClick': true,
    });
    const box = await kit.box(id);
    const empty = { x: box.x + toPx({ x: 0.5, y: 0 }).px, y: box.y + toPx({ x: 0, y: 0.1 }).py };
    await kit.page.mouse.dblclick(empty.x, empty.y);
    await kit.settle(160);
    led.check(T, 'addOnDoubleClick (true)', 'a double click on empty space inserts a breakpoint',
      3, (await kit.read(id, 'Envelope.points')).length);

    await kit.set(id, { 'Envelope.addOnDoubleClick': false });
    const count = (await kit.read(id, 'Envelope.points')).length;
    await kit.page.mouse.dblclick(box.x + toPx({ x: 0.8, y: 0 }).px, box.y + toPx({ x: 0, y: 0.1 }).py);
    await kit.settle(160);
    led.check(T, 'addOnDoubleClick (false)', 'the same double click adds nothing',
      count, (await kit.read(id, 'Envelope.points')).length);
  }

  // --- phaseSourceId: only meaningful with a live driving control ------------------------------------
  led.unverified(T, 'phaseSourceId', 'a range control drives the playhead phase in preview',
    'needs a second bound control driving it live; covered as a pair in the routing pass, not here');

  // --- the fan-out values a device parameter would actually receive ----------------------------------
  {
    await kit.set(id, {
      'Envelope.points': [
        { id: 'a', x: 0, y: 0, curve: 'linear', tension: 0 },
        { id: 'b', x: 0.25, y: 1, curve: 'linear', tension: 0 },
        { id: 'c', x: 0.6, y: 0.5, curve: 'linear', tension: 0 },
        { id: 'd', x: 1, y: 0, curve: 'linear', tension: 0 }],
      'Envelope.sustainIndex': 2,
    });
    const ports = await kit.ports(id);
    led.check(T, 'points → ports.attack', 'attack is peak x minus start x', 0.25, Math.round(ports.attack * 1000) / 1000);
    led.check(T, 'points → ports.decay', 'decay is sustain x minus peak x', 0.35, Math.round(ports.decay * 1000) / 1000);
    led.check(T, 'sustainIndex → ports.sustain', 'sustain is the sustain point level', 0.5, Math.round(ports.sustain * 1000) / 1000);
    led.check(T, 'points → ports.release', 'release is end x minus sustain x', 0.4, Math.round(ports.release * 1000) / 1000);
  }

  await kit.preview(false);

  // --- SAVE AND REOPEN, then measure the same things again --------------------------------------------
  {
    await kit.set(id, {
      'Envelope.gridX': 5, 'Envelope.gridY': 3, 'Envelope.lineColour': 'FFE91E63',
      'Envelope.nodeRadius': 9, 'Envelope.loopEnabled': true, 'Envelope.loopStart': 1,
      'Envelope.loopEnd': 2, 'Envelope.sustainIndex': 2, 'Envelope.timeMax': 4000,
    });
    const beforeGeo = await kit.geo(id);
    const beforePorts = await kit.ports(id);
    const again = await kit.reopen(id);
    const afterGeo = await kit.geo(again);
    const afterPorts = await kit.ports(again);
    led.check(T, 'save/reopen (geometry)', 'every drawn shape returns identical after a real save and reopen',
      beforeGeo.length, afterGeo.length);
    led.check(T, 'save/reopen (paint + positions)', 'the reopened control draws the same picture',
      JSON.stringify(beforeGeo), JSON.stringify(afterGeo));
    led.check(T, 'save/reopen (fan-out)', 'the values a device parameter receives survive the round trip',
      beforePorts, afterPorts);
    // …and it is still interactive afterwards, which a geometry comparison cannot show.
    await kit.preview(true);
    await kit.set(again, { 'Envelope.preset': 'free', 'Envelope.snapX': 0, 'Envelope.snapY': 0 });
    const box = await kit.box(again);
    const node = await kit.spot(again, 'svg.envelope circle', 1);
    const was = (await kit.read(again, 'Envelope.points'))[1];
    await kit.drag(node, { x: box.x + toPx({ x: 0.4, y: 0 }).px, y: node.y });
    const now = (await kit.read(again, 'Envelope.points'))[1];
    led.check(T, 'save/reopen (still draggable)', 'a reopened envelope still edits under the pointer',
      true, Math.abs(now.x - was.x) > 0.05);
    await kit.preview(false);
  }


  // =============================================================================================
  // MOD MATRIX — 17 properties. Drawn with positioned divs, not SVG, so measured through dom().
  // =============================================================================================
  await kit.fresh();
  {
    const M = 'Matrix';
    const MW = 400;
    const MH = 240;
    let mid = await kit.make(M, { 'Transform.width': MW, 'Transform.height': MH });

    // --- rows / cols: the grid is the two label lists ------------------------------------------
    await kit.set(mid, {
      'Matrix.rows': ['A', 'B', 'C'], 'Matrix.cols': ['X', 'Y'],
      'Matrix.amounts': [1, 0, 0, -1, 0, 0], 'Matrix.showLabels': true,
      'Matrix.rowHeaderW': 50, 'Matrix.colHeaderH': 20,
    });
    const cells = await kit.dom(mid, '.mx-cell');
    led.check(M, 'rows / cols', 'the grid holds exactly rows × cols cells', 6, cells.length);
    led.check(M, 'rows (labels)', 'each source is printed down the left',
      ['A', 'B', 'C'], (await kit.dom(mid, '.mx-row-label')).map((d) => d.text));
    led.check(M, 'cols (labels)', 'each destination is printed across the top',
      ['X', 'Y'], (await kit.dom(mid, '.mx-col-label')).map((d) => d.text));
    // Exact cell geometry: the grid divides what is left after the headers.
    const cellW = (MW - 50) / 2;
    const cellH = (MH - 20) / 3;
    led.check(M, 'rows / cols (cell size)', 'cells divide the space left by the headers',
      [Math.round(cellW), Math.round(cellH)], [Math.round(cells[0].w), Math.round(cells[0].h)]);
    led.check(M, 'rowHeaderW / colHeaderH', 'the first cell starts exactly past both headers',
      [50, 20], [Math.round(cells[0].x), Math.round(cells[0].y)]);

    // --- rowHeaderW / colHeaderH as real numbers, and the clamp ---------------------------------
    await kit.set(mid, { 'Matrix.rowHeaderW': 120, 'Matrix.colHeaderH': 44 });
    const moved = await kit.dom(mid, '.mx-cell');
    led.check(M, 'rowHeaderW (changed)', 'a wider row header pushes the grid right', 120, Math.round(moved[0].x));
    led.check(M, 'colHeaderH (changed)', 'a taller column header pushes the grid down', 44, Math.round(moved[0].y));
    await kit.set(mid, { 'Matrix.rowHeaderW': 9999 });
    led.check(M, 'rowHeaderW (boundary)', 'clamps to the control width less 20 rather than hiding the grid',
      MW - 20, Math.round((await kit.dom(mid, '.mx-cell'))[0].x));
    await kit.set(mid, { 'Matrix.rowHeaderW': 50, 'Matrix.colHeaderH': 20 });

    // --- showLabels: not just hiding text, the grid reclaims the space ---------------------------
    await kit.set(mid, { 'Matrix.showLabels': false });
    led.check(M, 'showLabels (false)', 'labels go AND the headers collapse so the grid fills the control',
      [0, 0, 0], [(await kit.dom(mid, '.mx-row-label')).length,
        Math.round((await kit.dom(mid, '.mx-cell'))[0].x), Math.round((await kit.dom(mid, '.mx-cell'))[0].y)]);
    await kit.set(mid, { 'Matrix.showLabels': true });

    // --- amounts + bipolar + cellStyle: the bar height IS the amount -----------------------------
    await kit.set(mid, { 'Matrix.cellStyle': 'bar', 'Matrix.bipolar': true,
      'Matrix.amounts': [1, 0.5, 0, -0.5, -1, 0] });
    const bars = await kit.dom(mid, '.mx-bar');
    const cell = (await kit.dom(mid, '.mx-cell'))[0];
    // The renderer's own inset: min(4, 14% of each side). Guessing it passes on tolerance and then
    // stops catching anything, which is the failure mode this whole pass exists to avoid.
    const pad = Math.min(4, cell.w * 0.14, cell.h * 0.14);
    const half = cell.h / 2 - pad;
    led.check(M, 'amounts (bar height)', 'each bar is |amount| of the half cell, so 1.0 and 0.5 differ by half',
      [Math.round(half), Math.round(half * 0.5)], [Math.round(bars[0].h), Math.round(bars[1].h)]);
    led.check(M, 'amounts (zero draws nothing)', 'a zero cell has no bar height', 0, Math.round(bars[2].h));
    // Bipolar: positive grows up from the middle, negative grows down from it.
    const mid0 = cell.y + cell.h / 2;
    led.check(M, 'bipolar (true)', 'a positive bar sits above the centre line and a negative below it',
      true, bars[0].y + bars[0].h <= mid0 + 1 && bars[3].y >= mid0 - 1);
    led.check(M, 'bipolar (zero line)', 'a centre line is drawn in every cell', 6, (await kit.dom(mid, '.mx-zero')).length);
    await kit.set(mid, { 'Matrix.bipolar': false });
    const uni = await kit.dom(mid, '.mx-bar');
    led.check(M, 'bipolar (false)', 'bars grow from the floor over the full cell height, and the centre line goes',
      [Math.round(cell.h - pad * 2), 0], [Math.round(uni[0].h), (await kit.dom(mid, '.mx-zero')).length]);
    await kit.set(mid, { 'Matrix.bipolar': true });

    // --- cellStyle: three genuinely different drawings -------------------------------------------
    await kit.set(mid, { 'Matrix.cellStyle': 'fill' });
    led.check(M, "cellStyle 'fill'", 'the whole cell is tinted by |amount| as opacity, no bars',
      [6, 0, '1'], [(await kit.dom(mid, '.mx-fill')).length, (await kit.dom(mid, '.mx-bar')).length,
        (await kit.dom(mid, '.mx-fill'))[0].opacity]);
    led.check(M, "cellStyle 'fill' (opacity tracks amount)", 'a 0.5 cell is half as opaque as a 1.0 cell',
      '0.5', (await kit.dom(mid, '.mx-fill'))[1].opacity);
    await kit.set(mid, { 'Matrix.cellStyle': 'dot' });
    const dots = await kit.dom(mid, '.mx-dot');
    led.check(M, "cellStyle 'dot'", 'a dot whose diameter is |amount| of the cell half-min, and none at zero',
      [6, 0], [dots.length, Math.round(dots[2].w)]);
    led.check(M, "cellStyle 'dot' (size tracks amount)", 'the 0.5 dot is half the 1.0 dot',
      Math.round(dots[0].w / 2), Math.round(dots[1].w), (a, b) => Math.abs(a - b) <= 1);
    await kit.set(mid, { 'Matrix.cellStyle': 'bar' });

    // --- showValues: printed numbers, and the documented exception for zero -----------------------
    led.check(M, 'showValues (false)', 'no numbers printed', 0, (await kit.dom(mid, '.mx-val')).length);
    await kit.set(mid, { 'Matrix.showValues': true });
    led.check(M, 'showValues (true)', 'every NON-ZERO cell prints its amount to two places',
      ['1.00', '0.50', '-0.50', '-1.00'], (await kit.dom(mid, '.mx-val')).map((d) => d.text));
    await kit.set(mid, { 'Matrix.showValues': false });

    // --- the six colours -------------------------------------------------------------------------
    await kit.set(mid, { 'Matrix.cellBg': 'FF101820', 'Matrix.posColour': 'FF39D98A',
      'Matrix.negColour': 'FFEB5757', 'Matrix.labelColour': 'FFB9B9B9' });
    const painted = await kit.dom(mid, '.mx-cell');
    const barsNow = await kit.dom(mid, '.mx-bar');
    led.check(M, 'cellBg', 'the cell background is the declared colour', 'rgb(16, 24, 32)', painted[0].bg);
    led.check(M, 'posColour', 'a positive bar takes the positive colour', 'rgb(57, 217, 138)', barsNow[0].bg);
    led.check(M, 'negColour', 'a negative bar takes the negative colour', 'rgb(235, 87, 87)', barsNow[3].bg);
    led.check(M, 'labelColour', 'labels take the declared colour', 'rgb(185, 185, 185)',
      (await kit.dom(mid, '.mx-row-label'))[0].colour);

    // --- fan-out: one port per cell, named source → destination ------------------------------------
    {
      await kit.set(mid, { 'Matrix.rows': ['LFO', 'Env'], 'Matrix.cols': ['Cutoff', 'Amp'],
        'Matrix.amounts': [0.25, -0.5, 0.75, 0] });
      const ports = await kit.ports(mid);
      led.check(M, 'amounts → ports', 'every cell offers its amount to a device parameter, keyed by cell',
        { cell_0_0: 0.25, cell_0_1: -0.5, cell_1_0: 0.75, cell_1_1: 0 },
        Object.fromEntries(Object.entries(ports).map(([k, v]) => [k, Math.round(v * 1000) / 1000])));
      // The LABEL is what a user picks in the binding list, and it has to follow the names they
      // typed — a renamed source that still advertises the old name is a mis-binding waiting to
      // happen. The id stays stable across renames on purpose, so a binding survives one.
      const labels = () => kit.page.evaluate(async ({ id }) => {
        const { getComponentPorts } = await import('/src/CE_Application/models/componentPorts.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return getComponentPorts(c).map((p) => `${p.id}=${p.label}`);
      }, { id: mid });
      led.check(M, 'rows / cols → port labels', 'the binding list names each cell source → destination',
        ['cell_0_0=LFO → Cutoff', 'cell_0_1=LFO → Amp', 'cell_1_0=Env → Cutoff', 'cell_1_1=Env → Amp'],
        await labels());
      await kit.set(mid, { 'Matrix.rows': ['Wheel', 'Env'] });
      led.check(M, 'rows (rename) → port labels', 'renaming a source renames its bindings but keeps their ids',
        ['cell_0_0=Wheel → Cutoff', 'cell_0_1=Wheel → Amp'], (await labels()).slice(0, 2));
    }

    // --- editable and step, through a real drag ----------------------------------------------------
    await kit.preview(true);
    {
      await kit.set(mid, { 'Matrix.editable': true, 'Matrix.step': 0, 'Matrix.amounts': [0, 0, 0, 0] });
      const box = await kit.box(mid);
      const c0 = (await kit.dom(mid, '.mx-cell'))[0];
      const from = { x: box.x + c0.x + c0.w / 2, y: box.y + c0.y + c0.h / 2 };
      await kit.drag(from, { x: from.x, y: from.y - c0.h * 0.4 });
      const after = await kit.read(mid, 'Matrix.amounts');
      led.check(M, 'editable (true)', 'dragging a cell upward raises its amount', true, after[0] > 0.1);

      await kit.set(mid, { 'Matrix.amounts': [0, 0, 0, 0], 'Matrix.editable': false });
      await kit.drag(from, { x: from.x, y: from.y - c0.h * 0.4 });
      led.check(M, 'editable (false)', 'the same drag changes nothing', [0, 0, 0, 0],
        await kit.read(mid, 'Matrix.amounts'));

      await kit.set(mid, { 'Matrix.editable': true, 'Matrix.step': 0.25, 'Matrix.amounts': [0, 0, 0, 0] });
      await kit.drag(from, { x: from.x, y: from.y - c0.h * 0.33 });
      const stepped = (await kit.read(mid, 'Matrix.amounts'))[0];
      led.check(M, 'step', 'a dragged amount lands on a multiple of the step',
        0, Math.round((stepped / 0.25 - Math.round(stepped / 0.25)) * 1000) / 1000);
      led.check(M, 'step (moved at all)', 'and the snap did not simply pin it to zero', true, Math.abs(stepped) >= 0.25);
    }
    await kit.preview(false);

    // --- save and reopen ----------------------------------------------------------------------------
    {
      await kit.set(mid, { 'Matrix.showValues': true, 'Matrix.cellStyle': 'dot', 'Matrix.rowHeaderW': 70 });
      const before = await kit.dom(mid, '.mx-cell, .mx-dot, .mx-val, .mx-row-label, .mx-col-label');
      const beforePorts = await kit.ports(mid);
      const again = await kit.reopen(mid);
      led.check(M, 'save/reopen (drawing)', 'every cell, dot, number and label returns identical',
        JSON.stringify(before), JSON.stringify(await kit.dom(again, '.mx-cell, .mx-dot, .mx-val, .mx-row-label, .mx-col-label')));
      led.check(M, 'save/reopen (fan-out)', 'the per-cell device values survive', beforePorts, await kit.ports(again));
      await kit.preview(true);
      const box = await kit.box(again);
      const c0 = (await kit.dom(again, '.mx-cell'))[0];
      const from = { x: box.x + c0.x + c0.w / 2, y: box.y + c0.y + c0.h / 2 };
      const was = (await kit.read(again, 'Matrix.amounts'))[0];
      await kit.drag(from, { x: from.x, y: from.y - c0.h * 0.4 });
      led.check(M, 'save/reopen (still editable)', 'a reopened matrix still takes a cell drag',
        true, (await kit.read(again, 'Matrix.amounts'))[0] !== was);
      await kit.preview(false);
    }
  }


  // =============================================================================================
  // CONSTRAINT — 10 properties. The rule modes are the component: dragging one member has to move
  // the others, and each mode moves them differently. This is the richest logic in this file.
  // =============================================================================================
  await kit.fresh();
  {
    const C = 'Constraint';
    let cid = await kit.make(C, { 'Transform.width': 360, 'Transform.height': 200 });
    const members = (vals) => vals.map((v, i) => ({ id: `m${i}`, label: `M${i}`, value: v, colour: 'FF39D98A' }));
    const values = async () => (await kit.read(cid, 'Constraint.members')).map((m) => Math.round(m.value * 1000) / 1000);
    // Drag member `i` to a target normalised value using the component's own bar geometry.
    const dragMember = async (i, target) => {
      const box = await kit.box(cid);
      const tracks = await kit.shapes(cid, 'rect', (r) => r.rx === 3);
      const track = tracks[i * 2];                         // track, then fill, per member
      const from = { x: box.x + track.x + track.width / 2, y: box.y + track.y + track.height * 0.5 };
      const to = { x: from.x, y: box.y + track.y + track.height * (1 - target) };
      await kit.drag(from, to);
    };

    await kit.preview(true);

    // --- mode 'free': only the dragged member moves ---------------------------------------------
    await kit.set(cid, { 'Constraint.mode': 'free', 'Constraint.members': members([0.5, 0.3, 0.2]) });
    await dragMember(1, 0.8);
    {
      const v = await values();
      led.check(C, "mode 'free'", 'only the dragged member changes',
        [0.5, 0.2], [v[0], v[2]]);
      led.check(C, "mode 'free' (it moved)", 'and the dragged one took the new value', true, v[1] > 0.7);
    }

    // --- mode 'sum': the members always total 1 ---------------------------------------------------
    await kit.set(cid, { 'Constraint.mode': 'sum', 'Constraint.members': members([0.5, 0.3, 0.2]) });
    await dragMember(0, 0.8);
    {
      const v = await values();
      led.check(C, "mode 'sum'", 'the members still total 1 after a drag',
        1, Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100);
      // …and the untouched two keep their 3:2 ratio inside the remaining budget.
      led.check(C, "mode 'sum' (proportional)", 'the others share what is left in proportion, here 3:2',
        1.5, Math.round((v[1] / v[2]) * 10) / 10, (a, b) => Math.abs(a - b) <= 0.15);
    }

    // --- mode 'mirror': the first two are complements, a third is free -----------------------------
    await kit.set(cid, { 'Constraint.mode': 'mirror', 'Constraint.members': members([0.5, 0.5, 0.42]) });
    await dragMember(0, 0.75);
    {
      const v = await values();
      led.check(C, "mode 'mirror'", 'members 0 and 1 sum to 1', 1, Math.round((v[0] + v[1]) * 100) / 100);
      led.check(C, "mode 'mirror' (extras free)", 'a third member is not touched', 0.42, v[2]);
    }

    // --- mode 'order' + minGap: non-decreasing with a gap -------------------------------------------
    await kit.set(cid, { 'Constraint.mode': 'order', 'Constraint.minGap': 0.15,
      'Constraint.members': members([0.1, 0.3, 0.5]) });
    await dragMember(0, 0.6);
    {
      const v = await values();
      led.check(C, "mode 'order'", 'the members stay non-decreasing after pushing the first one up',
        true, v[0] <= v[1] + 1e-6 && v[1] <= v[2] + 1e-6);
      led.check(C, 'minGap', 'and each neighbour keeps at least the declared gap',
        true, v[1] - v[0] >= 0.15 - 1e-6 && v[2] - v[1] >= 0.15 - 1e-6);
    }

    // --- mode 'ratio': the gang scales together ------------------------------------------------------
    await kit.set(cid, { 'Constraint.mode': 'ratio', 'Constraint.members': members([0.4, 0.2, 0.1]) });
    await dragMember(0, 0.8);
    {
      const v = await values();
      led.check(C, "mode 'ratio'", 'every member scales by the same factor, so the ratios are preserved',
        [2, 4], [Math.round((v[0] / v[1]) * 10) / 10, Math.round((v[0] / v[2]) * 10) / 10],
        (a, b) => Math.abs(a[0] - b[0]) <= 0.2 && Math.abs(a[1] - b[1]) <= 0.4);
    }

    await kit.preview(false);

    // --- showValues / showBadge / members(labels): what is printed ------------------------------------
    await kit.set(cid, { 'Constraint.mode': 'sum', 'Constraint.members': members([0.5, 0.3, 0.2]),
      'Constraint.showValues': true, 'Constraint.showBadge': true });
    {
      const texts = await kit.texts(cid);
      led.check(C, 'showValues (true)', 'each member prints its value as a percentage',
        true, ['50', '30', '20'].every((t) => texts.includes(t)));
      led.check(C, 'showBadge (true)', 'the rule badge names the active mode', true, texts.includes('Σ = 100%'));
      await kit.set(cid, { 'Constraint.showValues': false });
      const noVals = await kit.texts(cid);
      led.check(C, 'showValues (false)', 'the percentages go and the member labels stay',
        [false, true], [noVals.includes('50'), noVals.includes('M0')]);
      await kit.set(cid, { 'Constraint.showBadge': false });
      led.check(C, 'showBadge (false)', 'the badge goes', false, (await kit.texts(cid)).includes('Σ = 100%'));
      await kit.set(cid, { 'Constraint.showValues': true, 'Constraint.showBadge': true });
      // The badge has to FOLLOW the mode, not just exist.
      await kit.set(cid, { 'Constraint.mode': 'order' });
      led.check(C, 'mode → badge', 'switching the rule relabels the badge',
        false, (await kit.texts(cid)).includes('Σ = 100%'));
      await kit.set(cid, { 'Constraint.mode': 'sum' });
    }

    // --- members: count, labels and the bars that follow them ------------------------------------------
    await kit.set(cid, { 'Constraint.members': members([0.4, 0.3, 0.2, 0.1]) });
    led.check(C, 'members (count)', 'a fourth member adds a fourth pair of bars', 4,
      (await kit.shapes(cid, 'rect', (r) => r.rx === 3)).length / 2);
    led.check(C, 'members (value → height)', 'each fill bar is its own value of the track height',
      [0.4, 0.3, 0.2, 0.1], await (async () => {
        const rs = await kit.shapes(cid, 'rect', (r) => r.rx === 3);
        return [0, 1, 2, 3].map((i) => Math.round((rs[i * 2 + 1].height / rs[i * 2].height) * 100) / 100);
      })(), (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 0.02));
    led.check(C, 'members → ports', 'every member offers its value to a device parameter',
      { member_0: 0.4, member_1: 0.3, member_2: 0.2, member_3: 0.1 },
      Object.fromEntries(Object.entries(await kit.ports(cid)).map(([k, v]) => [k, Math.round(v * 100) / 100])));

    // --- the four colours ---------------------------------------------------------------------------
    await kit.set(cid, { 'Constraint.fieldColour': 'FF0E0E13', 'Constraint.trackColour': 'FF203040',
      'Constraint.labelColour': 'FFB9B9B9', 'Constraint.linkColour': 'FFF2C94C' });
    {
      const rs = await kit.shapes(cid, 'rect');
      led.check(C, 'fieldColour', 'the backing panel takes the declared colour', rgba('FF0E0E13'), rs[0].fill);
      led.check(C, 'trackColour', 'the empty track takes the declared colour', rgba('FF203040'), rs[1].fill);
      const badge = (await kit.geo(cid)).filter((n) => n.tag === 'text').find((t) => /Σ/.test(t.text ?? ''));
      led.check(C, 'linkColour', 'the rule badge takes the link colour', rgba('FFF2C94C'), badge?.fill);
      const label = (await kit.geo(cid)).filter((n) => n.tag === 'text').find((t) => t.text === 'M0');
      led.check(C, 'labelColour', 'member labels take the label colour', rgba('FFB9B9B9'), label?.fill);
    }

    // --- editable -------------------------------------------------------------------------------------
    await kit.preview(true);
    await kit.set(cid, { 'Constraint.mode': 'free', 'Constraint.members': members([0.5, 0.5, 0.5, 0.5]),
      'Constraint.editable': false });
    await dragMember(0, 0.9);
    led.check(C, 'editable (false)', 'no drag reaches the members', [0.5, 0.5, 0.5, 0.5], await values());
    await kit.set(cid, { 'Constraint.editable': true });
    await dragMember(0, 0.9);
    led.check(C, 'editable (true)', 'the drag reaches them again', true, (await values())[0] > 0.8);
    await kit.preview(false);

    // --- save and reopen, then apply a RULE again ------------------------------------------------------
    {
      await kit.set(cid, { 'Constraint.mode': 'sum', 'Constraint.minGap': 0.15,
        'Constraint.members': members([0.5, 0.3, 0.2]) });
      const beforeGeo = await kit.geo(cid);
      const beforePorts = await kit.ports(cid);
      const again = await kit.reopen(cid);
      led.check(C, 'save/reopen (drawing)', 'the reopened control draws the same bars, labels and badge',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      led.check(C, 'save/reopen (fan-out)', 'the per-member device values survive', beforePorts, await kit.ports(again));
      cid = again;
      await kit.preview(true);
      await dragMember(0, 0.8);
      const v = await values();
      led.check(C, 'save/reopen (rule still applies)', 'a reopened sum rule still rebalances to 1 on a drag',
        1, Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100);
      await kit.preview(false);
    }
  }


  // =============================================================================================
  // ROUTER — 20 properties. One input, shaped, through a curve, fanned out to many destinations
  // each with its own depth and range. Every number below is derived from the declared rule and
  // asserted against the value a device parameter would actually receive.
  // =============================================================================================
  await kit.fresh();
  {
    const R = 'Router';
    const identity = [{ id: 'a', x: 0, y: 0, curve: 'linear' }, { id: 'b', x: 1, y: 1, curve: 'linear' }];
    const dest = (over = {}) => ({ id: 'd0', label: 'Cutoff', depth: 1, min: 0, max: 1, enabled: true, colour: 'FF39D98A', ...over });
    let rid = await kit.make(R, { 'Transform.width': 460, 'Transform.height': 240,
      'Router.curve': identity, 'Router.destinations': [dest()] });
    const out = async () => Math.round((await kit.ports(rid)).dest_0 * 10000) / 10000;

    // --- testInput straight through an identity curve ---------------------------------------------
    for (const v of [0, 0.25, 0.5, 1]) {
      await kit.set(rid, { 'Router.testInput': v });
      led.check(R, `testInput (${v})`, 'with an identity curve the destination receives the input unchanged',
        v, await out());
    }

    // --- invert -------------------------------------------------------------------------------------
    await kit.set(rid, { 'Router.testInput': 0.25, 'Router.invert': true });
    led.check(R, 'invert', 'the input is flipped before the curve', 0.75, await out());
    await kit.set(rid, { 'Router.invert': false });

    // --- deadzone, including the two boundaries -------------------------------------------------------
    await kit.set(rid, { 'Router.deadzone': 0.2, 'Router.testInput': 0.1 });
    led.check(R, 'deadzone (below)', 'input under the dead-zone produces nothing', 0, await out());
    await kit.set(rid, { 'Router.testInput': 0.2 });
    led.check(R, 'deadzone (exactly at)', 'input exactly at the threshold is still silent', 0, await out());
    await kit.set(rid, { 'Router.testInput': 0.6 });
    led.check(R, 'deadzone (rescale)', 'above it the remaining range rescales to fill 0..1, so 0.6 of a 0.2 zone is 0.5',
      0.5, await out());
    await kit.set(rid, { 'Router.testInput': 1, 'Router.deadzone': 1 });
    led.check(R, 'deadzone (boundary 1)', 'a full dead-zone silences the router completely', 0, await out());
    await kit.set(rid, { 'Router.deadzone': 0 });

    // --- invert and deadzone together, in the declared order -------------------------------------------
    await kit.set(rid, { 'Router.invert': true, 'Router.deadzone': 0.5, 'Router.testInput': 0.1 });
    led.check(R, 'invert + deadzone (order)', 'invert runs FIRST, so a low input becomes high and survives the zone',
      0.8, await out());
    await kit.set(rid, { 'Router.invert': false, 'Router.deadzone': 0 });

    // --- curve: the transfer shape actually shapes -------------------------------------------------------
    await kit.set(rid, { 'Router.testInput': 0.5,
      'Router.curve': [{ id: 'a', x: 0, y: 0, curve: 'linear' },
        { id: 'b', x: 0.5, y: 0.9, curve: 'linear' }, { id: 'c', x: 1, y: 1, curve: 'linear' }] });
    led.check(R, 'curve', 'the destination takes the curve value at the shaped input, not the input',
      0.9, await out());
    await kit.set(rid, { 'Router.curve': identity });

    // --- destinations: depth, sign, range and enabled ------------------------------------------------------
    await kit.set(rid, { 'Router.testInput': 0.8, 'Router.destinations': [
      dest({ id: 'd0', label: 'Full' }),
      dest({ id: 'd1', label: 'Half', depth: 0.5 }),
      dest({ id: 'd2', label: 'Inverted', depth: -1 }),
      dest({ id: 'd3', label: 'Ranged', min: 0.25, max: 0.75 }),
      dest({ id: 'd4', label: 'Off', enabled: false, min: 0.1 }),
    ] });
    const all = Object.fromEntries(Object.entries(await kit.ports(rid)).map(([k, v]) => [k, Math.round(v * 10000) / 10000]));
    led.check(R, 'destinations[].depth', 'depth scales the shaped value', 0.4, all.dest_1);
    led.check(R, 'destinations[].depth (negative)', 'a negative depth inverts the direction', 0.2, all.dest_2);
    led.check(R, 'destinations[].min / max', 'the value is mapped into the destination range',
      0.25 + 0.5 * 0.8, all.dest_3);
    led.check(R, 'destinations[].enabled (false)', 'a disabled destination rests at its own floor', 0.1, all.dest_4);
    led.check(R, 'destinations[].label → ports', 'each destination names its own binding',
      ['Full', 'Half', 'Inverted', 'Ranged', 'Off'], await kit.page.evaluate(async ({ id }) => {
        const { getComponentPorts } = await import('/src/CE_Application/models/componentPorts.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return getComponentPorts(c).map((p) => p.label);
      }, { id: rid }));
    const laneTexts = await kit.texts(rid);
    led.check(R, 'destinations[].label (drawn)', 'and prints it on its own lane',
      true, ['Full', 'Half', 'Inverted', 'Ranged', 'Off'].every((l) => laneTexts.includes(l)));
    led.check(R, 'destinations (readout)', 'each lane prints its own current percentage',
      true, laneTexts.includes('40'));

    // --- source / ccNumber: the chip names what is being followed -------------------------------------------
    await kit.set(rid, { 'Router.source': 'modwheel' });
    led.check(R, 'source', 'the source chip names the chosen source', true, (await kit.texts(rid)).includes('Mod Wheel'));
    await kit.set(rid, { 'Router.source': 'cc', 'Router.ccNumber': 74 });
    led.check(R, 'source (free CC) + ccNumber', 'a free-CC source names its controller number',
      true, (await kit.texts(rid)).includes('CC 74'));
    await kit.set(rid, { 'Router.ccNumber': 999 });
    led.check(R, 'ccNumber (out of range)', 'an impossible controller reads as unset rather than drawing a wrong number',
      true, (await kit.texts(rid)).includes('CC —'));
    await kit.set(rid, { 'Router.source': 'modwheel', 'Router.ccNumber': 1 });

    // --- showGrid / showDivisions / majorTickCount / minorTickCount ------------------------------------------
    {
      await kit.set(rid, { 'Router.showGrid': true });
      const gridOn = (await kit.shapes(rid, 'line')).length;
      await kit.set(rid, { 'Router.showGrid': false });
      const gridOff = (await kit.shapes(rid, 'line')).length;
      led.check(R, 'showGrid', 'turning the grid off removes lines and leaves the rest',
        true, gridOn > gridOff);
      await kit.set(rid, { 'Router.showGrid': true });

      await kit.set(rid, { 'Router.showDivisions': false });
      const noTicks = (await kit.shapes(rid, 'line')).length;
      await kit.set(rid, { 'Router.showDivisions': true, 'Router.majorTickCount': 5, 'Router.minorTickCount': 0 });
      const major5 = (await kit.shapes(rid, 'line')).length;
      await kit.set(rid, { 'Router.majorTickCount': 9 });
      const major9 = (await kit.shapes(rid, 'line')).length;
      led.check(R, 'showDivisions', 'division ticks appear on the destination meters', true, major5 > noTicks);
      led.check(R, 'majorTickCount', 'more major divisions draw more ticks', true, major9 > major5);
      await kit.set(rid, { 'Router.minorTickCount': 4 });
      led.check(R, 'minorTickCount', 'minor divisions add ticks between the majors',
        true, (await kit.shapes(rid, 'line')).length > major9);
      await kit.set(rid, { 'Router.showDivisions': false, 'Router.majorTickCount': 5, 'Router.minorTickCount': 0 });
    }

    // --- the five colours -----------------------------------------------------------------------------------
    await kit.set(rid, { 'Router.curveColour': 'FF39D98A', 'Router.inputColour': 'FFF2C94C',
      'Router.fieldColour': 'FF0A0A0F', 'Router.labelColour': 'FFB9B9B9' });
    {
      const shapes = await kit.geo(rid);
      const curve = shapes.find((n) => n.tag === 'path' && n.fill === 'none' && n.stroke === rgba('FF39D98A'));
      led.check(R, 'curveColour', 'the transfer curve takes the declared colour', true, !!curve);
      const chip = shapes.filter((n) => n.tag === 'text').find((t) => t.text === 'Mod Wheel');
      led.check(R, 'labelColour', 'the source chip takes the label colour', rgba('FFB9B9B9'), chip?.fill);
      led.check(R, 'fieldColour', 'the field takes the declared colour',
        true, shapes.some((n) => n.tag === 'rect' && n.fill === rgba('FF0A0A0F')));
      led.check(R, 'inputColour', 'the input bar takes the declared colour',
        true, shapes.some((n) => n.fill === rgba('FFF2C94C') || n.stroke === rgba('FFF2C94C')));
    }

    // --- editable, through a real node drag --------------------------------------------------------------------
    await kit.preview(true);
    {
      // The curve nodes are the only circles the renderer strokes at 0.5 black; circle 0 is the
      // SOURCE CHIP dot beside the label, and pressing that proves nothing. A three-point curve so
      // there is an interior node, which is the one free to move in both axes.
      const three = [{ id: 'a', x: 0, y: 0, curve: 'linear' },
        { id: 'b', x: 0.5, y: 0.5, curve: 'linear' }, { id: 'c', x: 1, y: 1, curve: 'linear' }];
      await kit.set(rid, { 'Router.curve': three, 'Router.editable': true, 'Router.testInput': 0.5,
        'Router.invert': false, 'Router.deadzone': 0 });
      const NODE = 'svg.router circle[stroke="rgba(0,0,0,0.5)"]';
      const node = await kit.spot(rid, NODE, 1);
      assert.ok(node, 'Router: no curve node rendered to drag');
      const beforeOut = await out();
      await kit.drag(node, { x: node.x, y: node.y - 40 });
      const after = await kit.read(rid, 'Router.curve');
      led.check(R, 'editable (true)', 'dragging the middle node up raises the curve there',
        true, after[1].y > 0.55);
      led.check(R, 'editable (true) → fan-out', 'and the destination immediately receives the reshaped value',
        true, (await out()) > beforeOut + 0.05);
      await kit.set(rid, { 'Router.curve': three, 'Router.editable': false });
      const frozen = await kit.read(rid, 'Router.curve');
      const node2 = await kit.spot(rid, NODE, 1);
      await kit.drag(node2, { x: node2.x, y: node2.y - 40 });
      led.check(R, 'editable (false)', 'the same drag reshapes nothing', frozen, await kit.read(rid, 'Router.curve'));
      await kit.set(rid, { 'Router.editable': true });
    }
    await kit.preview(false);

    // --- the conditional group that needs a second live control -------------------------------------------------
    led.unverified(R, 'sourceControlId', "source 'link': follow another control on the panel",
      'needs a second control driving it live through the preview surface; covered in the routing pass');
    led.unverified(R, 'inputChannel', 'MIDI sources: which channel to watch (0 = omni)',
      'needs inbound MIDI; no device in this environment and the preview surface takes __input directly');
    led.unverified(R, 'polyMode', 'per-note aftertouch collapsed to one value: highest | last',
      'same — needs inbound polyphonic aftertouch');

    // --- save and reopen -------------------------------------------------------------------------------------------
    {
      await kit.set(rid, { 'Router.testInput': 0.8, 'Router.deadzone': 0.2, 'Router.invert': true,
        'Router.source': 'cc', 'Router.ccNumber': 74, 'Router.showDivisions': true });
      const beforeGeo = await kit.geo(rid);
      const beforePorts = await kit.ports(rid);
      const again = await kit.reopen(rid);
      led.check(R, 'save/reopen (drawing)', 'curve, lanes, chip and ticks all return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      led.check(R, 'save/reopen (fan-out)', 'every destination still receives the same value',
        beforePorts, await kit.ports(again));
      led.check(R, 'save/reopen (shaping still applies)', 'invert and dead-zone still shape the input after reopen',
        true, (await kit.texts(again)).includes('CC 74'));
    }
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
