/**
 * behaviourMotion.mjs — deep behavioural pass over the self-running modulation components.
 *
 * These have a property the static ones do not: they MOVE. So three things are measured that a
 * still picture cannot show — that a running clock actually advances the output, that stopping it
 * actually stops, and that after a pointer commit the value a bound device parameter receives is
 * the same value the control is displaying. That last one is the shape of the Crossfader defect
 * root is chasing: a committed gesture whose outbound value goes stale is invisible to any check
 * that only reads the model or the picture.
 *
 * Run: node browser-checks/behaviourMotion.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('motion');
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

try {
  // =============================================================================================
  // ORBIT — 15 properties. A self-running spatial poly-LFO: each satellite projects its position
  // onto an axis and that projection IS the value a bound parameter receives.
  // =============================================================================================
  await kit.fresh();
  {
    const O = 'Orbit';
    const node = (over = {}) => ({ id: 'n0', label: 'Node 1', radius: 1, angle: 0, ratio: 1,
      output: 'y', depth: 1, invert: false, enabled: true, colour: 'FF39D98A', ...over });
    let id = await kit.make(O, { 'Transform.width': 320, 'Transform.height': 320,
      'Orbit.running': false, 'Orbit.phase': 0, 'Orbit.nodes': [node()] });
    const v = async () => r3((await kit.ports(id)).node_0);

    // --- nodes[].angle + output 'y': the projection is the value ---------------------------------
    // angle is maths sense: 0° is east, 90° is north. Projected on y and mapped to 0..1, east is
    // the middle and north is the top.
    for (const [angle, want] of [[0, 0.5], [90, 1], [180, 0.5], [270, 0]]) {
      await kit.set(id, { 'Orbit.nodes': [node({ angle })] });
      led.check(O, `nodes[].angle (${angle}°)`, 'the satellite projects its position onto the y axis',
        want, await v(), near);
    }
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 0, output: 'x' })] });
    led.check(O, "nodes[].output 'x'", 'projecting onto x puts east at the top of the range', 1, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, output: 'x' })] });
    led.check(O, "nodes[].output 'x' (north)", 'and north in the middle', 0.5, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 30, output: 'sine', radius: 0.3 })] });
    led.check(O, "nodes[].output 'sine'", 'the sine output ignores radius and follows the angle alone',
      r3((Math.sin(30 * Math.PI / 180) + 1) / 2), await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ output: 'radius', radius: 0.42 })] });
    led.check(O, "nodes[].output 'radius'", 'the radius output is the orbit radius itself', 0.42, await v(), near);

    // --- nodes[].radius / depth / invert / enabled -------------------------------------------------
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, radius: 0.5 })] });
    led.check(O, 'nodes[].radius', 'a smaller orbit reaches less far up the axis', 0.75, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, depth: 0.5 })] });
    led.check(O, 'nodes[].depth', 'depth scales the emitted value', 0.5, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, invert: true })] });
    led.check(O, 'nodes[].invert', 'invert flips the projection before depth', 0, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, enabled: false })] });
    led.check(O, 'nodes[].enabled (false)', 'a disabled satellite emits nothing', 0, await v());
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 90 })] });

    // --- nodes[].ratio + phase: the per-satellite clock ----------------------------------------------
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 0, ratio: 1 })], 'Orbit.phase': 0.25 });
    led.check(O, 'nodes[].ratio + phase', 'one turn per cycle: a quarter of the way round is 90° from the base',
      1, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 0, ratio: 2 })] });
    led.check(O, 'nodes[].ratio (2×)', 'twice per cycle: a quarter of the cycle is half a turn',
      0.5, await v(), near);
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 0, ratio: -1 })] });
    led.check(O, 'nodes[].ratio (negative)', 'a negative ratio runs the other way round', 0, await v(), near);
    await kit.set(id, { 'Orbit.phase': 0 });

    // --- nodes[].label → the binding list, and per-node ports -------------------------------------------
    await kit.set(id, { 'Orbit.nodes': [node({ label: 'Wobble' }), node({ id: 'n1', label: 'Drift', angle: 180 })] });
    led.check(O, 'nodes[].label → ports', 'each satellite is its own binding, named as the author named it',
      ['node_0=Wobble', 'node_1=Drift'], await kit.page.evaluate(async ({ id }) => {
        const { getComponentPorts } = await import('/src/CE_Application/models/componentPorts.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return getComponentPorts(c).map((p) => `${p.id}=${p.label}`);
      }, { id }));

    // --- running + rate: the clock actually advances, and stopping actually stops -----------------------
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 0, ratio: 1 })], 'Orbit.running': false, 'Orbit.phase': 0 });
    {
      // MEASURED OFF THE DRAWING, and in preview, because that is where the clock lives. The run
      // ticker injects `__phase` into the RESOLVED control the renderer and the fan-out see; it
      // deliberately does not write a phase back into the document sixty times a second. Reading
      // the document's own `phase` therefore shows a stopped orbit however fast it is spinning.
      await kit.preview(true);
      const where = async () => {
        const sat = (await kit.shapes(id, 'circle', (c) => c.stroke === 'rgba(0,0,0,0.5)'))[0];
        return sat ? `${Math.round(sat.cx)},${Math.round(sat.cy)}` : 'gone';
      };
      const still = await where();
      await kit.settle(500);
      led.check(O, 'running (false)', 'a stopped orbit is in the same place half a second later', still, await where());

      await kit.set(id, { 'Orbit.running': true, 'Orbit.rate': 1 });
      await kit.settle(300);
      const moved = await where();
      await kit.settle(300);
      const movedAgain = await where();
      led.check(O, 'running (true)', 'a running orbit is somewhere else on each look',
        true, moved !== still && movedAgain !== moved);

      // A faster rate moves FURTHER BETWEEN SAMPLES. Counting distinct positions does not
      // separate them — a slow orbit still lands on a different rounded pixel each time, and a
      // fast one laps back onto places it has already been — so the metric is the largest step
      // between consecutive looks.
      const biggestStep = async (rate) => {
        await kit.set(id, { 'Orbit.rate': rate });
        await kit.settle(80);
        let prev = null;
        let worst = 0;
        for (let i = 0; i < 8; i += 1) {
          const sat = (await kit.shapes(id, 'circle', (c) => c.stroke === 'rgba(0,0,0,0.5)'))[0];
          const now = { x: sat.cx, y: sat.cy };
          if (prev) worst = Math.max(worst, Math.hypot(now.x - prev.x, now.y - prev.y));
          prev = now;
          await kit.settle(60);
        }
        return worst;
      };
      const slow = await biggestStep(0.02);
      const fast = await biggestStep(2);
      led.check(O, 'rate', 'at 2 cycles/sec the satellite travels much further between looks than at 0.02',
        true, fast > slow * 5);

      await kit.set(id, { 'Orbit.running': false, 'Orbit.phase': 0, 'Orbit.rate': 0.25 });
      const parked = await where();
      await kit.settle(400);
      led.check(O, 'running (stops again)', 'turning the clock back off parks it for good', parked, await where());
      await kit.preview(false);
    }

    // --- the four show* flags, each a real change in what is drawn -------------------------------------
    await kit.set(id, { 'Orbit.nodes': [node({ angle: 45 })], 'Orbit.showRings': true,
      'Orbit.showSpokes': true, 'Orbit.showTrails': true, 'Orbit.showValues': false });
    {
      const ringsOn = (await kit.shapes(id, 'circle', (c) => c.fill === 'none' && c['stroke-dasharray'] === '2 4')).length;
      await kit.set(id, { 'Orbit.showRings': false });
      led.check(O, 'showRings', 'the dashed orbit ring is drawn, and goes when it is turned off',
        [1, 0], [ringsOn, (await kit.shapes(id, 'circle', (c) => c.fill === 'none' && c['stroke-dasharray'] === '2 4')).length]);
      const spokes = (await kit.shapes(id, 'line')).length;
      await kit.set(id, { 'Orbit.showSpokes': false });
      led.check(O, 'showSpokes', 'the spoke from the centre is a line, and goes with the flag',
        [1, 0], [spokes, (await kit.shapes(id, 'line')).length]);
      await kit.set(id, { 'Orbit.showValues': true });
      led.check(O, 'showValues', 'the satellite prints its own output as a percentage',
        true, (await kit.texts(id)).length > 0);
      await kit.set(id, { 'Orbit.showValues': false });
      led.check(O, 'showValues (false)', 'and stops printing it', 0, (await kit.texts(id)).length);
      await kit.set(id, { 'Orbit.showSpokes': true, 'Orbit.showRings': true });
    }
    led.closed(O, 'showTrails', 'comet trail behind each satellite',
      "behaviourLinks.mjs, counted by colour. This trail is not a recording at all — the renderer derives "
      + 'each dot from the CURRENT phase by winding the satellite back along its own path, so a stopped '
      + 'orbit draws the whole comet and there is no moving target to chase');
    led.closed(O, 'syncToTransport / cycleBars', 'time the global cycle off the panel transport',
      "behaviourInbound.mjs, over the panel's own running transport; the free-running rate path is verified above");

    // --- the four colours -----------------------------------------------------------------------------
    await kit.set(id, { 'Orbit.fieldColour': 'FF0D0D12', 'Orbit.ringColour': 'FF2A6BA8',
      'Orbit.centreColour': 'FF3A3A44', 'Orbit.labelColour': 'FFB9B9B9' });
    {
      const shapes = await kit.geo(id);
      led.check(O, 'ringColour', 'the orbit ring takes the declared colour',
        true, shapes.some((s) => s.stroke === rgba('FF2A6BA8') && s['stroke-dasharray'] === '2 4'));
      led.check(O, 'centreColour', 'the hub takes the centre colour',
        true, shapes.some((s) => s.tag === 'circle' && s.fill === rgba('FF3A3A44')));
      led.check(O, 'nodes[].colour', 'a satellite takes its own colour',
        true, shapes.some((s) => s.fill === rgba('FF39D98A')));
    }

    // --- editable, and DISPLAYED vs OUTBOUND after the commit --------------------------------------------
    await kit.preview(true);
    {
      await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, radius: 0.9 })], 'Orbit.running': false,
        'Orbit.phase': 0, 'Orbit.editable': true });
      const box = await kit.box(id);
      const sat = await kit.spot(id, 'svg.orbit circle[stroke="rgba(0,0,0,0.5)"]', 0);
      assert.ok(sat, 'Orbit: no satellite to drag');
      // AIMED FROM THE DRAWN HUB, not from the middle of the control: the orbit field is inset and
      // its centre is not the box centre, so "half the width across" lands a dozen degrees off and
      // the angle assertion fails for a reason that has nothing to do with the component.
      // The hub's SCREEN position, via spot(), not its SVG coordinates plus the control's origin:
      // the svg is not necessarily flush with the control element, and adding the two silently
      // offsets every target by that gap — which showed up as a constant thirteen degrees.
      const hub = await kit.spot(id, 'svg.orbit circle[r="3.5"]', 0);
      // THE PRESS MUST NOT MOVE THE CONTROL. Focusing on pointer-down used to scroll the panel
      // surface to bring the control "into view" — while the pointer was already on it — so the
      // control slid out from under the finger mid-gesture and every absolute-positioning drag
      // landed short by the scroll distance. Asserted here as the scroll itself and as the angle,
      // because either one alone can be satisfied by accident.
      const scrollTop = () => kit.page.evaluate((i) => {
        const el = document.querySelector(`[data-control-id="${i}"]`);
        return el?.closest('.panel-surface')?.scrollTop ?? 0;
      }, id);
      const scrollBefore = await scrollTop();
      await kit.drag(sat, { x: hub.x + box.w * 0.3, y: hub.y });
      led.check(O, 'a press does not scroll the surface under the pointer',
        'pressing a control leaves the canvas exactly where it was', scrollBefore, await scrollTop());
      const committed = await kit.read(id, 'Orbit.nodes');
      const drawn = (await kit.shapes(id, 'circle', (c) => c.stroke === 'rgba(0,0,0,0.5)'))[0];
      const outbound = await v();
      const deg = ((committed[0].angle % 360) + 360) % 360;
      led.check(O, 'editable (true)', 'dragging the satellite due east of the hub commits an angle of 0°',
        0, deg > 180 ? deg - 360 : deg, (a, b) => Math.abs(a - b) <= 8);
      // THE POINT OF THIS ONE: what the parameter receives must be what the control is showing.
      // A commit that leaves the outbound value on the pre-drag figure is invisible to the model
      // and to the picture, and is exactly the class of defect being chased elsewhere today.
      led.check(O, 'editable → outbound matches displayed', 'after the commit the bound value is the projection of the drawn position, not the pre-drag one',
        0.5, outbound, (a, b) => near(a, b, 0.06));
      const hubDrawn = (await kit.shapes(id, 'circle', (c) => c.r === 3.5))[0];
      led.check(O, 'editable → drawn position', 'and the satellite is drawn due east of the hub',
        true, drawn.cx > hubDrawn.cx && Math.abs(drawn.cy - hubDrawn.cy) < 12);

      await kit.set(id, { 'Orbit.nodes': [node({ angle: 90, radius: 0.9 })], 'Orbit.editable': false });
      const frozen = await kit.read(id, 'Orbit.nodes');
      const sat2 = await kit.spot(id, 'svg.orbit circle[stroke="rgba(0,0,0,0.5)"]', 0);
      await kit.drag(sat2, { x: hub.x + box.w * 0.3, y: hub.y });
      led.check(O, 'editable (false)', 'the same drag commits nothing', frozen, await kit.read(id, 'Orbit.nodes'));
      await kit.set(id, { 'Orbit.editable': true });
    }
    await kit.preview(false);

    // --- save and reopen, then drag it again ---------------------------------------------------------------
    {
      await kit.set(id, { 'Orbit.nodes': [node({ angle: 120, radius: 0.7, depth: 0.8, label: 'Wobble' })],
        'Orbit.running': false, 'Orbit.phase': 0, 'Orbit.showValues': true });
      const beforeGeo = await kit.geo(id);
      const beforePorts = await kit.ports(id);
      const again = await kit.reopen(id);
      led.check(O, 'save/reopen (drawing)', 'rings, spokes, satellite and readout all return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      led.check(O, 'save/reopen (outbound)', 'the value a bound parameter receives survives the round trip',
        beforePorts, await kit.ports(again));
      id = again;
      await kit.preview(true);
      const box = await kit.box(id);
      const sat = await kit.spot(id, 'svg.orbit circle[stroke="rgba(0,0,0,0.5)"]', 0);
      const hub2 = await kit.spot(id, 'svg.orbit circle[r="3.5"]', 0);
      await kit.drag(sat, { x: hub2.x + box.w * 0.3, y: hub2.y });
      // Due east projects to 0.5 on the y axis, and this node carries depth 0.8 — so the value a
      // bound parameter receives is 0.4, not 0.5. Depth is part of the promise, not a rounding.
      led.check(O, 'save/reopen (still draggable, still outbound)', 'a reopened orbit takes a drag and the bound value follows it, depth included',
        0.4, r3((await kit.ports(id)).node_0), (a, b) => near(a, b, 0.06));
      await kit.preview(false);
    }
  }

  // =============================================================================================
  // TIMBRE — 14 properties. A blend field: the puck's distance to each anchor decides how much of
  // that anchor's stored patch reaches every target.
  // =============================================================================================
  await kit.fresh();
  {
    const T = 'Timbre';
    const targets = [{ id: 'cutoff', label: 'Filter Cutoff', colour: 'FF39D98A' },
      { id: 'reso', label: 'Resonance', colour: 'FF5B9BD5' }];
    const anchors = [
      { id: 'a0', label: 'Low', x: 0, y: 0, colour: 'FF5B9BD5', values: { cutoff: 0, reso: 0 } },
      { id: 'a1', label: 'High', x: 1, y: 1, colour: 'FFF2994A', values: { cutoff: 1, reso: 0.8 } },
    ];
    let id = await kit.make(T, { 'Transform.width': 320, 'Transform.height': 320,
      'Timbre.targets': targets, 'Timbre.anchors': anchors, 'Timbre.power': 2 });
    const outs = async () => {
      const p = await kit.ports(id);
      return { cutoff: r3(p.target_0), reso: r3(p.target_1) };
    };

    // --- anchors + x/y: standing exactly on an anchor gives that anchor's patch ---------------------
    await kit.set(id, { 'Timbre.x': 0, 'Timbre.y': 0 });
    led.check(T, 'anchors[].values (on the anchor)', 'the puck on an anchor emits exactly that anchor stored patch',
      { cutoff: 0, reso: 0 }, await outs());
    await kit.set(id, { 'Timbre.x': 1, 'Timbre.y': 1 });
    led.check(T, 'x / y', 'moving the puck to the other anchor emits that one instead',
      { cutoff: 1, reso: 0.8 }, await outs());
    await kit.set(id, { 'Timbre.x': 0.5, 'Timbre.y': 0.5 });
    led.check(T, 'x / y (between)', 'equidistant between two anchors is the average of their patches',
      { cutoff: 0.5, reso: 0.4 }, await outs());

    // --- power: how sharply the nearest anchor takes over ---------------------------------------------
    await kit.set(id, { 'Timbre.x': 0.3, 'Timbre.y': 0.3, 'Timbre.power': 1 });
    const soft = (await outs()).cutoff;
    await kit.set(id, { 'Timbre.power': 8 });
    const sharp = (await outs()).cutoff;
    led.check(T, 'power', 'a higher power lets the nearer anchor dominate sooner, so the same puck sits closer to it',
      true, sharp < soft);
    led.check(T, 'power (still bounded)', 'and the blend never leaves the two anchors it sits between',
      true, sharp >= 0 && soft <= 1);
    await kit.set(id, { 'Timbre.power': 2 });

    // --- targets[]: one port each, named as the author named them ----------------------------------------
    led.check(T, 'targets[] → ports', 'every target is its own binding',
      ['target_0=Filter Cutoff', 'target_1=Resonance'], await kit.page.evaluate(async ({ id }) => {
        const { getComponentPorts } = await import('/src/CE_Application/models/componentPorts.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return getComponentPorts(c).map((p) => `${p.id}=${p.label}`);
      }, { id }));

    // --- showField / showAnchors / showReadout / axis labels ------------------------------------------------
    await kit.set(id, { 'Timbre.showAnchors': true, 'Timbre.showReadout': true,
      'Timbre.axisX': 'dark → bright', 'Timbre.axisY': 'soft → aggressive' });
    {
      const t = await kit.texts(id);
      led.check(T, 'axisX / axisY', 'the two axis labels are printed',
        [true, true], [t.includes('dark → bright'), t.includes('soft → aggressive')]);
      led.check(T, 'showAnchors (true)', 'each anchor is named on the field',
        [true, true], [t.includes('Low'), t.includes('High')]);
      await kit.set(id, { 'Timbre.showAnchors': false });
      led.check(T, 'showAnchors (false)', 'the anchor names go', false, (await kit.texts(id)).includes('Low'));
      await kit.set(id, { 'Timbre.showAnchors': true, 'Timbre.showReadout': false });
      const noReadout = await kit.texts(id);
      await kit.set(id, { 'Timbre.showReadout': true });
      led.check(T, 'showReadout', 'the MIDI-addressable readout appears only with the flag on',
        true, (await kit.texts(id)).length > noReadout.length);
      const fieldOn = (await kit.geo(id)).length;
      await kit.set(id, { 'Timbre.showField': false });
      led.check(T, 'showField', 'the heat field is drawn, and turning it off draws fewer shapes',
        true, (await kit.geo(id)).length < fieldOn);
      await kit.set(id, { 'Timbre.showField': true });
    }

    // --- editable, with the displayed-vs-outbound check ------------------------------------------------------
    await kit.preview(true);
    {
      // The puck is parked in clear space first. At (0,0) it sits exactly on anchor a0, and the
      // press grabs the ANCHOR — a different, equally real gesture — so the puck never moves and
      // the check reports a working component as broken.
      await kit.set(id, { 'Timbre.x': 0.5, 'Timbre.y': 0.5, 'Timbre.editable': true });
      const box = await kit.box(id);
      const puck = await kit.spot(id, 'svg.timbre circle[r="9"]', 0);
      assert.ok(puck, 'Timbre: no puck to drag');
      await kit.drag(puck, { x: box.x + box.w * 0.9, y: box.y + box.h * 0.1 });
      const moved = { x: await kit.read(id, 'Timbre.x'), y: await kit.read(id, 'Timbre.y') };
      led.check(T, 'editable (true)', 'the drag commits the puck position', true, moved.x > 0.6 && moved.y > 0.6);
      // …and the blend the parameters receive is the blend for WHERE THE PUCK NOW IS.
      const expected = await kit.page.evaluate(async ({ id }) => {
        const tl = await import('/src/CE_Application/utils/timbreLayout.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return tl.timbrePortValues(c);
      }, { id });
      led.check(T, 'editable → outbound matches displayed', 'the values the targets receive are the blend at the committed position',
        { cutoff: r3(expected.target_0), reso: r3(expected.target_1) }, await outs());

      await kit.set(id, { 'Timbre.x': 0.5, 'Timbre.y': 0.5, 'Timbre.editable': false });
      const frozen = { x: await kit.read(id, 'Timbre.x'), y: await kit.read(id, 'Timbre.y') };
      const puck2 = await kit.spot(id, 'svg.timbre circle[r="9"]', 0);
      await kit.drag(puck2, { x: box.x + box.w * 0.9, y: box.y + box.h * 0.9 });
      led.check(T, 'editable (false)', 'the same drag moves nothing',
        frozen, { x: await kit.read(id, 'Timbre.x'), y: await kit.read(id, 'Timbre.y') });
      await kit.set(id, { 'Timbre.editable': true });
    }
    await kit.preview(false);

    // --- save and reopen -------------------------------------------------------------------------------------
    {
      await kit.set(id, { 'Timbre.x': 0.25, 'Timbre.y': 0.75, 'Timbre.power': 3 });
      const beforeGeo = await kit.geo(id);
      const beforeOuts = await outs();
      const again = await kit.reopen(id);
      led.check(T, 'save/reopen (drawing)', 'field, anchors, puck and labels return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      id = again;
      led.check(T, 'save/reopen (outbound)', 'and every target still receives the same blend', beforeOuts, await outs());
      await kit.preview(true);
      const box = await kit.box(id);
      const puck = await kit.spot(id, 'svg.timbre circle[r="9"]', 0);
      await kit.drag(puck, { x: box.x + box.w * 0.85, y: box.y + box.h * 0.15 });
      led.check(T, 'save/reopen (still blends on a drag)', 'a reopened field still moves its targets under the pointer',
        true, (await outs()).cutoff !== beforeOuts.cutoff);
      await kit.preview(false);
    }
  }


  // =============================================================================================
  // TURING — 19 properties. A shift-register sequencer: a ring of step values, a head that walks
  // it, and three ports (value, gate, inverse) whose numbers are the whole point.
  // =============================================================================================
  await kit.fresh();
  {
    const U = 'Turing';
    const steps = [0.2, 0.8, 0.5, 1, 0.35, 0.65, 0.1, 0.9];
    let id = await kit.make(U, { 'Transform.width': 400, 'Transform.height': 220,
      'Turing.running': false, 'Turing.phase': 0, 'Turing.steps': steps, 'Turing.length': 8,
      'Turing.randomness': 0, 'Turing.quantizeLevels': 0, 'Turing.gateThreshold': 0.5 });
    const ports = async () => {
      const p = await kit.ports(id);
      return { value: r3(p.value), gate: p.gate, inverse: r3(p.inverse) };
    };
    // The value bars: the filled one per step, told from its own track by fill.
    const bars = async () => (await kit.shapes(id, 'rect', (b) => b.rx === 2 && b.fill !== 'rgba(255,255,255,0.04)' && b.fill !== 'none'));

    // --- steps + phase: the head reads the step it is standing on ---------------------------------
    for (const [phase, want] of [[0, 0.2], [0.125, 0.8], [0.25, 0.5], [0.375, 1]]) {
      await kit.set(id, { 'Turing.phase': phase });
      led.check(U, `steps + phase (${phase})`, 'the value port is the step under the head', want, (await ports()).value);
    }
    await kit.set(id, { 'Turing.phase': 0 });

    // --- the three ports are consistent with each other ----------------------------------------------
    led.check(U, 'ports.inverse', 'the inverse port is one minus the value', 0.8, (await ports()).inverse);
    led.check(U, 'gateThreshold', 'the gate is closed on a step below the threshold', 0, (await ports()).gate);
    await kit.set(id, { 'Turing.phase': 0.125 });
    led.check(U, 'gateThreshold (above)', 'and open on a step at or above it', 1, (await ports()).gate);
    await kit.set(id, { 'Turing.gateThreshold': 0.9 });
    led.check(U, 'gateThreshold (raised)', 'raising the threshold past the step closes it again', 0, (await ports()).gate);
    await kit.set(id, { 'Turing.gateThreshold': 0.5, 'Turing.phase': 0 });

    // --- quantizeLevels: the value is snapped to N levels ----------------------------------------------
    await kit.set(id, { 'Turing.steps': [0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63] });
    led.check(U, 'quantizeLevels (0)', 'continuous by default: the step value passes through untouched',
      0.63, (await ports()).value);
    await kit.set(id, { 'Turing.quantizeLevels': 2 });
    led.check(U, 'quantizeLevels (2)', 'two levels can only be 0 or 1, and 0.63 is nearer 1', 1, (await ports()).value);
    await kit.set(id, { 'Turing.quantizeLevels': 5 });
    led.check(U, 'quantizeLevels (5)', 'five levels snap 0.63 to the nearest quarter', 0.75, (await ports()).value);
    await kit.set(id, { 'Turing.quantizeLevels': 0, 'Turing.steps': steps });

    // --- length: how much of the ring is used -----------------------------------------------------------
    await kit.set(id, { 'Turing.length': 4 });
    led.check(U, 'length', 'a shorter loop draws fewer bars', 4, (await bars()).length);
    await kit.set(id, { 'Turing.phase': 0.9 });
    led.check(U, 'length (wraps)', 'and the head wraps inside the shorter loop rather than running off the end',
      true, [0.2, 0.8, 0.5, 1].includes((await ports()).value));
    await kit.set(id, { 'Turing.length': 8, 'Turing.phase': 0 });

    // --- steps → bar heights: the picture is the data ------------------------------------------------------
    {
      const drawn = await bars();
      const track = (await kit.shapes(id, 'rect', (b) => b.rx === 2 && b.fill === 'rgba(255,255,255,0.04)'))[0];
      led.check(U, 'steps (drawn)', 'each bar is its own step value of the track height',
        steps, drawn.map((b) => Math.round((b.height / track.height) * 100) / 100),
        (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 0.02));
    }

    // --- showGate / showDivisions / majorTickCount / minorTickCount ------------------------------------------
    await kit.set(id, { 'Turing.showGate': true });
    const gateDots = (await kit.shapes(id, 'circle')).length;
    await kit.set(id, { 'Turing.showGate': false });
    led.check(U, 'showGate', 'a gate dot per step, and they go with the flag',
      [true, 0], [gateDots > 0, (await kit.shapes(id, 'circle')).length]);
    await kit.set(id, { 'Turing.showGate': true, 'Turing.showDivisions': false });
    const noDiv = (await kit.shapes(id, 'line')).length;
    await kit.set(id, { 'Turing.showDivisions': true, 'Turing.majorTickCount': 5, 'Turing.minorTickCount': 0 });
    const major5 = (await kit.shapes(id, 'line')).length;
    await kit.set(id, { 'Turing.majorTickCount': 9 });
    const major9 = (await kit.shapes(id, 'line')).length;
    await kit.set(id, { 'Turing.minorTickCount': 3 });
    led.check(U, 'showDivisions / majorTickCount / minorTickCount',
      'divisions appear, more majors draw more lines, and minors add more again',
      true, major5 > noDiv && major9 > major5 && (await kit.shapes(id, 'line')).length > major9);
    await kit.set(id, { 'Turing.showDivisions': false, 'Turing.majorTickCount': 5, 'Turing.minorTickCount': 0 });

    // --- the four colours ------------------------------------------------------------------------------------
    await kit.set(id, { 'Turing.barColour': 'FF39D98A', 'Turing.headColour': 'FFF2C94C',
      'Turing.fieldColour': 'FF0E0E13', 'Turing.labelColour': 'FFB9B9B9', 'Turing.phase': 0 });
    {
      const drawn = await bars();
      led.check(U, 'headColour', 'the bar under the head takes the head colour and the rest do not',
        [rgba('FFF2C94C'), rgba('FF39D98A')], [drawn[0].fill, drawn[1].fill]);
      led.check(U, 'barColour', 'every other bar takes the bar colour',
        true, drawn.slice(1).every((b) => b.fill === rgba('FF39D98A')));
      led.check(U, 'fieldColour', 'the field takes its own colour',
        true, (await kit.geo(id)).some((n) => n.tag === 'rect' && n.fill === rgba('FF0E0E13')));
    }

    // --- running + rate: the head walks, and stops --------------------------------------------------------------
    {
      await kit.preview(true);
      const headIndex = async () => {
        const drawn = await bars();
        return drawn.findIndex((b) => b.fill === rgba('FFF2C94C'));
      };
      await kit.set(id, { 'Turing.running': false, 'Turing.phase': 0, 'Turing.randomness': 0 });
      const parked = await headIndex();
      await kit.settle(500);
      led.check(U, 'running (false)', 'a stopped sequence keeps the head where it was', parked, await headIndex());
      await kit.set(id, { 'Turing.running': true, 'Turing.rate': 8 });
      await kit.settle(300);
      const seen = new Set();
      for (let i = 0; i < 6; i += 1) { seen.add(await headIndex()); await kit.settle(90); }
      led.check(U, 'running (true) + rate', 'a running sequence walks the head to several different steps',
        true, seen.size >= 3);
      await kit.set(id, { 'Turing.running': false, 'Turing.phase': 0 });
      await kit.preview(false);
    }

    // --- randomness: 0 is a locked loop, 1 rewrites constantly ----------------------------------------------------
    {
      await kit.preview(true);
      // THE MUTATION LIVES IN THE PREVIEW SESSION, not in the document, and that is the design:
      // preview is a rehearsal that leaves the saved panel alone. Reading Turing.steps back out of
      // the document therefore shows a locked loop however chaotic the thing on screen is — so the
      // live ring is read from the session, which is also what the renderer draws from.
      const live = async () => (await kit.session(id))?.turingSteps ?? null;
      await kit.set(id, { 'Turing.steps': steps, 'Turing.randomness': 0, 'Turing.running': true, 'Turing.rate': 12 });
      await kit.settle(700);
      const locked = await live();
      led.check(U, 'randomness (0)', 'a locked loop plays the same eight values round and round, unchanged',
        steps, (locked ?? steps).map(r3));
      await kit.set(id, { 'Turing.randomness': 1 });
      await kit.settle(900);
      const churned = await live();
      led.check(U, 'randomness (1)', 'full randomness rewrites the ring as it goes',
        true, Array.isArray(churned) && JSON.stringify(churned.map(r3)) !== JSON.stringify(steps));
      led.check(U, 'randomness (the document is left alone)', 'a rehearsal never edits the saved panel, however much it churns',
        steps, (await kit.read(id, 'Turing.steps')).map(r3));
      await kit.set(id, { 'Turing.running': false, 'Turing.randomness': 0, 'Turing.steps': steps, 'Turing.phase': 0 });
      await kit.preview(false);
    }

    // --- editable: paint a step, and the port follows immediately ----------------------------------------------------
    await kit.preview(true);
    {
      await kit.set(id, { 'Turing.editable': true, 'Turing.steps': steps, 'Turing.phase': 0 });
      const box = await kit.box(id);
      const track = (await kit.shapes(id, 'rect', (b) => b.rx === 2 && b.fill === 'rgba(255,255,255,0.04)'))[2];
      // Press near the top of the third bar's track: that step should become nearly 1.
      await kit.click({ x: box.x + track.x + track.width / 2, y: box.y + track.y + track.height * 0.08 });
      const painted = (await kit.read(id, 'Turing.steps'))[2];
      led.check(U, 'editable (true)', 'painting near the top of a bar writes that step high',
        true, painted > 0.85);
      await kit.set(id, { 'Turing.phase': 0.25 });
      led.check(U, 'editable → outbound', 'and the value port reports the painted step when the head reaches it',
        r3(painted), (await ports()).value);
      await kit.set(id, { 'Turing.steps': steps, 'Turing.editable': false, 'Turing.phase': 0 });
      await kit.click({ x: box.x + track.x + track.width / 2, y: box.y + track.y + track.height * 0.08 });
      led.check(U, 'editable (false)', 'the same press paints nothing', steps, (await kit.read(id, 'Turing.steps')).map(r3));
      await kit.set(id, { 'Turing.editable': true });
    }
    await kit.preview(false);

    led.closed(U, 'syncToTransport / division', 'clock the sequence off the panel transport',
      "behaviourInbound.mjs, over the panel's own running transport; the free-running rate path is verified above");

    // --- save and reopen ------------------------------------------------------------------------------------------------
    {
      await kit.set(id, { 'Turing.steps': [0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6], 'Turing.length': 6,
        'Turing.quantizeLevels': 4, 'Turing.gateThreshold': 0.65, 'Turing.phase': 0.2, 'Turing.showGate': true });
      const beforeGeo = await kit.geo(id);
      const beforePorts = await ports();
      const again = await kit.reopen(id);
      led.check(U, 'save/reopen (drawing)', 'bars, gate dots, head and field return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      id = again;
      led.check(U, 'save/reopen (outbound)', 'value, gate and inverse all survive the round trip', beforePorts, await ports());
      await kit.preview(true);
      const box = await kit.box(id);
      const track = (await kit.shapes(id, 'rect', (b) => b.rx === 2 && b.fill === 'rgba(255,255,255,0.04)'))[1];
      await kit.click({ x: box.x + track.x + track.width / 2, y: box.y + track.y + track.height * 0.1 });
      led.check(U, 'save/reopen (still paintable)', 'a reopened sequence still takes a paint stroke',
        true, (await kit.read(id, 'Turing.steps'))[1] > 0.8);
      await kit.preview(false);
    }
  }


  // =============================================================================================
  // CONSTELLATION — 19 properties. A map of preset stars; the probe either snaps to the nearest or
  // morphs between them, and the numbers the targets receive are the whole component.
  // =============================================================================================
  await kit.fresh();
  {
    const K = 'Constellation';
    const targets = [{ id: 'cutoff', label: 'Filter Cutoff', colour: 'FF39D98A' },
      { id: 'reso', label: 'Resonance', colour: 'FF5B9BD5' }];
    const presets = [
      { id: 's0', label: 'Low', x: 0.1, y: 0.1, colour: 'FF5B9BD5', values: { cutoff: 0, reso: 0 } },
      { id: 's1', label: 'High', x: 0.9, y: 0.9, colour: 'FFF2994A', values: { cutoff: 1, reso: 0.5 } },
    ];
    let id = await kit.make(K, { 'Transform.width': 340, 'Transform.height': 300,
      'Constellation.targets': targets, 'Constellation.presets': presets,
      'Constellation.running': false, 'Constellation.mode': 'blend', 'Constellation.blendPower': 2 });
    const outs = async () => {
      const p = await kit.ports(id);
      return { cutoff: r3(p.target_0), reso: r3(p.target_1) };
    };

    // --- mode 'snap' vs 'blend': two genuinely different rules ------------------------------------
    await kit.set(id, { 'Constellation.probeX': 0.4, 'Constellation.probeY': 0.4, 'Constellation.mode': 'snap' });
    led.check(K, "mode 'snap'", 'the probe recalls the nearest preset whole, with no morphing',
      { cutoff: 0, reso: 0 }, await outs());
    await kit.set(id, { 'Constellation.probeX': 0.6, 'Constellation.probeY': 0.6 });
    led.check(K, "mode 'snap' (crosses over)", 'past the midpoint it recalls the other one, whole',
      { cutoff: 1, reso: 0.5 }, await outs());
    await kit.set(id, { 'Constellation.mode': 'blend', 'Constellation.probeX': 0.5, 'Constellation.probeY': 0.5 });
    led.check(K, "mode 'blend'", 'equidistant between two stars is the average of their patches',
      { cutoff: 0.5, reso: 0.25 }, await outs());

    // --- blendPower: how sharply the nearest star takes over --------------------------------------
    await kit.set(id, { 'Constellation.probeX': 0.3, 'Constellation.probeY': 0.3, 'Constellation.blendPower': 1 });
    const soft = (await outs()).cutoff;
    await kit.set(id, { 'Constellation.blendPower': 8 });
    const sharp = (await outs()).cutoff;
    led.check(K, 'blendPower', 'a higher power pulls the blend closer to the nearer star',
      true, sharp < soft);
    await kit.set(id, { 'Constellation.blendPower': 2 });

    // --- probeX / probeY, and the targets that follow them -------------------------------------------
    await kit.set(id, { 'Constellation.probeX': 0.9, 'Constellation.probeY': 0.9 });
    led.check(K, 'probeX / probeY', 'standing on a star emits that star patch exactly',
      { cutoff: 1, reso: 0.5 }, await outs());
    led.check(K, 'targets[] → ports', 'every target is its own binding, named as the author named it',
      ['target_0=Filter Cutoff', 'target_1=Resonance'], await kit.page.evaluate(async ({ id }) => {
        const { getComponentPorts } = await import('/src/CE_Application/models/componentPorts.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return getComponentPorts(c).map((p) => `${p.id}=${p.label}`);
      }, { id }));

    // --- showLabels / showLinks / linkCount / showField ------------------------------------------------
    await kit.set(id, { 'Constellation.showLabels': true });
    led.check(K, 'showLabels (true)', 'each star is named on the map',
      true, (await kit.texts(id)).includes('Low') && (await kit.texts(id)).includes('High'));
    await kit.set(id, { 'Constellation.showLabels': false });
    led.check(K, 'showLabels (false)', 'the names go', false, (await kit.texts(id)).includes('Low'));
    await kit.set(id, { 'Constellation.showLabels': true });
    {
      // Links need more than two stars to be interesting: k nearest neighbours of each.
      const five = [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, label: `P${i}`, x: 0.15 + i * 0.17,
        y: 0.2 + (i % 2) * 0.4, colour: 'FF5B9BD5', values: { cutoff: i / 4, reso: 0.2 } }));
      await kit.set(id, { 'Constellation.presets': five, 'Constellation.showLinks': true, 'Constellation.linkCount': 1 });
      const one = (await kit.shapes(id, 'line')).length;
      await kit.set(id, { 'Constellation.linkCount': 3 });
      const three = (await kit.shapes(id, 'line')).length;
      led.check(K, 'showLinks + linkCount', 'more neighbours per star draws more constellation lines',
        true, one > 0 && three > one);
      await kit.set(id, { 'Constellation.showLinks': false });
      led.check(K, 'showLinks (false)', 'and they all go', 0, (await kit.shapes(id, 'line')).length);
      await kit.set(id, { 'Constellation.presets': presets, 'Constellation.showLinks': true, 'Constellation.linkCount': 2 });
    }
    {
      // MEASURED, then recorded rather than fixed. `Constellation.showField` is read by nothing:
      // the only `showField` reader in src/ is TimbreRenderer, where it gates a per-anchor heat
      // overlay drawn over the base field rect. The Constellation draws the base rect and has no
      // overlay at all, so there is nothing for the flag to turn off — and giving it one would be
      // building a visual feature, not fixing a defect. It IS published as a scripting verb
      // (`constellationShowField`) in all seven engines, so a script can call it and get nothing.
      const before = (await kit.geo(id)).length;
      await kit.set(id, { 'Constellation.showField': false });
      const after = (await kit.geo(id)).length;
      await kit.set(id, { 'Constellation.showField': true });
      led.inert(K, 'showField', 'heat field behind the stars',
        `no reader in src/ (only TimbreRenderer reads showField); ${before} shapes drawn either way, `
        + 'and the scripting verb constellationShowField therefore does nothing');
    }

    // --- running + wanderRate: the probe drifts on its own ------------------------------------------------
    {
      await kit.preview(true);
      const probeAt = async () => {
        const p = await kit.shapes(id, 'circle', (c) => c.r === 14);
        return p[0] ? `${Math.round(p[0].cx)},${Math.round(p[0].cy)}` : 'gone';
      };
      await kit.set(id, { 'Constellation.running': false, 'Constellation.probeX': 0.5, 'Constellation.probeY': 0.5 });
      const parked = await probeAt();
      await kit.settle(500);
      led.check(K, 'running (false)', 'a still probe stays where it was put', parked, await probeAt());
      await kit.set(id, { 'Constellation.running': true, 'Constellation.wanderRate': 1.5 });
      await kit.settle(350);
      const drifted = await probeAt();
      await kit.settle(350);
      led.check(K, 'running (true) + wanderRate', 'a wandering probe is somewhere else on each look',
        true, drifted !== parked && (await probeAt()) !== drifted);
      await kit.set(id, { 'Constellation.running': false, 'Constellation.probeX': 0.5, 'Constellation.probeY': 0.5 });
      await kit.preview(false);
    }
    led.closed(K, 'syncToTransport / wanderBars', 'run the wander off the panel transport',
      'behaviourLinks.mjs: held still while the clock is stopped, wandering when it runs, and frozen where it '
      + 'was when it stops again, with a one-bar wander covering about four times a four-bar one');

    // --- editable, with outbound matching what is displayed ------------------------------------------------
    await kit.preview(true);
    {
      await kit.set(id, { 'Constellation.editable': true, 'Constellation.mode': 'blend',
        'Constellation.probeX': 0.5, 'Constellation.probeY': 0.5 });
      const box = await kit.box(id);
      const probe = await kit.spot(id, 'svg circle[r="14"]', 0);
      assert.ok(probe, 'Constellation: no probe to drag');
      // THE Y AXIS IS FLIPPED, as it is on every field component here: probeY 1 is the TOP of the
      // control. Dragging to the bottom-right of the screen and expecting (0.9, 0.9) measures the
      // test's assumption, not the component — it committed (0.903, 0.093), which is exactly right.
      await kit.drag(probe, { x: box.x + box.w * 0.88, y: box.y + box.h * 0.12 });
      const moved = { x: await kit.read(id, 'Constellation.probeX'), y: await kit.read(id, 'Constellation.probeY') };
      led.check(K, 'editable (true)', 'a drag to the top-right commits a high probe position on both axes',
        'both past 0.7', `x=${r3(moved.x)} y=${r3(moved.y)}`,
        () => moved.x > 0.7 && moved.y > 0.7);
      const expected = await kit.page.evaluate(async ({ id }) => {
        const cl = await import('/src/CE_Application/utils/constellationLayout.js');
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        return cl.constellationPortValues(c);
      }, { id });
      led.check(K, 'editable → outbound matches displayed', 'the targets receive the blend at the committed probe position',
        { cutoff: r3(expected.target_0), reso: r3(expected.target_1) }, await outs());

      await kit.set(id, { 'Constellation.probeX': 0.5, 'Constellation.probeY': 0.5, 'Constellation.editable': false });
      const frozen = { x: await kit.read(id, 'Constellation.probeX'), y: await kit.read(id, 'Constellation.probeY') };
      const probe2 = await kit.spot(id, 'svg circle[r="14"]', 0);
      await kit.drag(probe2, { x: box.x + box.w * 0.15, y: box.y + box.h * 0.15 });
      led.check(K, 'editable (false)', 'the same drag moves nothing', frozen,
        { x: await kit.read(id, 'Constellation.probeX'), y: await kit.read(id, 'Constellation.probeY') });
      await kit.set(id, { 'Constellation.editable': true });
    }
    await kit.preview(false);

    // --- save and reopen -------------------------------------------------------------------------------------
    {
      await kit.set(id, { 'Constellation.probeX': 0.3, 'Constellation.probeY': 0.7,
        'Constellation.mode': 'snap', 'Constellation.showLabels': true });
      const beforeGeo = await kit.geo(id);
      const beforeOuts = await outs();
      const again = await kit.reopen(id);
      led.check(K, 'save/reopen (drawing)', 'stars, links, labels and probe return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      id = again;
      led.check(K, 'save/reopen (outbound)', 'and the targets still receive the same patch', beforeOuts, await outs());
    }
  }

  // =============================================================================================
  // KINETIC — 15 properties. A ball with physics: the ports are its position and speed.
  // =============================================================================================
  await kit.fresh();
  {
    const N = 'Kinetic';
    let id = await kit.make(N, { 'Transform.width': 300, 'Transform.height': 300,
      'Kinetic.running': false, 'Kinetic.initial': { x: 0.25, y: 0.75, vx: 0, vy: 0 } });
    const ports = async () => {
      const p = await kit.ports(id);
      return { x: r3(p.x), y: r3(p.y), speed: r3(p.speed) };
    };

    // --- initial: the resting state IS the port values ------------------------------------------------
    led.check(N, 'initial (position → ports)', 'the ball position is what a bound parameter receives',
      { x: 0.25, y: 0.75 }, { x: (await ports()).x, y: (await ports()).y });
    await kit.set(id, { 'Kinetic.initial': { x: 0.8, y: 0.2, vx: 0, vy: 0 } });
    led.check(N, 'initial (moved)', 'and it follows when the start point changes',
      { x: 0.8, y: 0.2 }, { x: (await ports()).x, y: (await ports()).y });
    await kit.set(id, { 'Kinetic.initial': { x: 0.5, y: 0.5, vx: 0.6, vy: 0.8 } });
    led.check(N, 'initial (velocity → speed port)', 'the speed port is the magnitude of the start velocity, normalised',
      true, (await ports()).speed > 0);

    // --- running: the physics integrate, and stop ---------------------------------------------------------
    {
      await kit.preview(true);
      const ballAt = async () => {
        const c = await kit.shapes(id, 'circle');
        return c.length ? `${Math.round(c[0].cx)},${Math.round(c[0].cy)}` : 'gone';
      };
      await kit.set(id, { 'Kinetic.running': false });
      const still = await ballAt();
      await kit.settle(500);
      led.check(N, 'running (false)', 'a stopped ball does not move', still, await ballAt());
      await kit.set(id, { 'Kinetic.running': true, 'Kinetic.gravity': 0, 'Kinetic.friction': 0,
        'Kinetic.restitution': 1, 'Kinetic.keepAlive': 0 });
      await kit.settle(300);
      const moved = await ballAt();
      await kit.settle(300);
      led.check(N, 'running (true)', 'a running ball is somewhere else on each look',
        true, moved !== still && (await ballAt()) !== moved);

      // --- friction: energy is lost, so the ball ends up slower ------------------------------------------
      const speedAfter = async (friction, ms) => {
        await kit.set(id, { 'Kinetic.running': false, 'Kinetic.initial': { x: 0.5, y: 0.5, vx: 0.9, vy: 0 },
          'Kinetic.friction': friction, 'Kinetic.gravity': 0, 'Kinetic.restitution': 1, 'Kinetic.keepAlive': 0 });
        await kit.set(id, { 'Kinetic.running': true });
        await kit.settle(ms);
        const v = (await kit.session(id))?.kineticState;
        await kit.set(id, { 'Kinetic.running': false });
        return v ? Math.hypot(v.vx ?? 0, v.vy ?? 0) : null;
      };
      const slippery = await speedAfter(0, 600);
      const draggy = await speedAfter(2, 600);
      if (slippery === null || draggy === null) {
        led.closed(N, 'friction / restitution / gravity / keepAlive', 'air drag, bounce energy, downward pull and the re-kick',
          'behaviourLinks.mjs, from visible motion over time rather than from the integrator\'s state: the '
          + 'distance fallen on screen, the travel in the second half of a window against the first, the '
          + 'speed kept after a wall, and whether the ball is still moving once the drag has had its way');
      } else {
        led.check(N, 'friction', 'air drag leaves the ball slower than the same throw with none',
          true, draggy < slippery);
      }
      await kit.set(id, { 'Kinetic.running': false });
      await kit.preview(false);
    }

    // --- showTrail / showWalls, and the colours -------------------------------------------------------------
    await kit.set(id, { 'Kinetic.showWalls': true, 'Kinetic.wallColour': 'FF2A6BA8',
      'Kinetic.ballColour': 'FF39D98A', 'Kinetic.fieldColour': 'FF0D0D12' });
    {
      const shapes = await kit.geo(id);
      led.check(N, 'ballColour', 'the ball takes the declared colour',
        true, shapes.some((n) => n.tag === 'circle' && n.fill === rgba('FF39D98A')));
      led.check(N, 'fieldColour', 'the field takes its own colour',
        true, shapes.some((n) => n.tag === 'rect' && n.fill === rgba('FF0D0D12')));
      const wallsOn = (await kit.geo(id)).length;
      await kit.set(id, { 'Kinetic.showWalls': false });
      led.check(N, 'showWalls', 'the walls are drawn, and go with the flag',
        true, (await kit.geo(id)).length < wallsOn);
      await kit.set(id, { 'Kinetic.showWalls': true });
    }
    led.closed(N, 'showTrail', 'a comet trail behind the ball',
      'behaviourLinks.mjs. A moving target is still a countable one: the trail is painted a colour nothing '
      + 'else in the drawing wears, and the dots wearing it are counted while the ball runs');

    // --- editable: fling it ------------------------------------------------------------------------------------
    await kit.preview(true);
    {
      await kit.set(id, { 'Kinetic.running': false, 'Kinetic.editable': true,
        'Kinetic.initial': { x: 0.5, y: 0.5, vx: 0, vy: 0 } });
      const box = await kit.box(id);
      // MEASURED ON SCREEN. A fling writes the live physics state the ticker integrates, not
      // Kinetic.initial — preview is a rehearsal, so the document keeps the start point the author
      // set. Asserting the document here would report a working fling as dead.
      const ballAt = async () => {
        const c = await kit.shapes(id, 'circle');
        return c.length ? `${Math.round(c[0].cx)},${Math.round(c[0].cy)}` : 'gone';
      };
      const rest = await ballAt();
      const ball = await kit.spot(id, 'svg circle', 0);
      assert.ok(ball, 'Kinetic: no ball to fling');
      await kit.drag(ball, { x: box.x + box.w * 0.8, y: box.y + box.h * 0.3 });
      led.check(N, 'editable (true)', 'flinging the ball moves it across the field', true, (await ballAt()) !== rest);
      led.check(N, 'editable (the document is left alone)', 'and the authored start point is untouched by the rehearsal',
        { x: 0.5, y: 0.5 }, await (async () => {
          const i = await kit.read(id, 'Kinetic.initial');
          return { x: r3(i.x), y: r3(i.y) };
        })());

      await kit.set(id, { 'Kinetic.running': false, 'Kinetic.editable': false,
        'Kinetic.initial': { x: 0.5, y: 0.5, vx: 0, vy: 0 } });
      await kit.settle(150);
      const frozenAt = await ballAt();
      const ball2 = await kit.spot(id, 'svg circle', 0);
      await kit.drag(ball2, { x: box.x + box.w * 0.2, y: box.y + box.h * 0.8 });
      led.check(N, 'editable (false)', 'the same fling does not move it at all', frozenAt, await ballAt());
      await kit.set(id, { 'Kinetic.editable': true });
    }
    await kit.preview(false);

    // --- save and reopen -----------------------------------------------------------------------------------------
    {
      await kit.set(id, { 'Kinetic.initial': { x: 0.3, y: 0.6, vx: 0.4, vy: -0.2 },
        'Kinetic.gravity': 0.3, 'Kinetic.restitution': 0.8, 'Kinetic.running': false });
      const beforeGeo = await kit.geo(id);
      const beforePorts = await ports();
      const again = await kit.reopen(id);
      led.check(N, 'save/reopen (drawing)', 'ball, walls and field return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      led.check(N, 'save/reopen (outbound)', 'position and speed survive the round trip', beforePorts,
        await (async () => { const p = await kit.ports(again); return { x: r3(p.x), y: r3(p.y), speed: r3(p.speed) }; })());
    }
  }


  // =============================================================================================
  // DUPLICATE SVG IDS ACROSS TWO INSTANCES — swept over every type in this half of the catalogue.
  //
  // SVG ids are DOCUMENT-global and `url(#…)` resolves to the first match, so a renderer that names
  // a gradient, clip path, mask, filter or pattern after its index alone breaks the moment a panel
  // holds two of that component: the second silently paints with the first one's definition. It is
  // worse the more the two differ in size or colour, and it is invisible to any check that looks at
  // one instance at a time — which is every check in this repository before this one.
  //
  // Found in Timbre (tsHeat-0 and tsHeat-1 defined twice, at cx=78,cy=282,r=204 and cx=38,cy=122,
  // r=84) and independently by root in the Macro. This sweeps the rest rather than waiting to be
  // told about them one at a time.
  // =============================================================================================
  {
    const MINE = ['Envelope', 'Matrix', 'Orbit', 'Looper', 'Router', 'Timbre', 'Turing', 'Kinetic',
      'Constellation', 'Constraint', 'Keyboard', 'StepSequencer', 'ChordPad', 'Arp', 'NoteRibbon',
      'DrumPads', 'Phrase', 'Recorder', 'Harmoniser', 'SplitZone', 'Setlist', 'Transport', 'Panic'];
    const collisions = [];
    for (const type of MINE) {
      await kit.fresh();
      await kit.make(type, { 'Transform.width': 360, 'Transform.height': 300 });
      await kit.make(type, { 'Transform.width': 170, 'Transform.height': 140 });
      await kit.settle(160);
      const dupes = await kit.page.evaluate(() => {
        const ids = [...document.querySelectorAll('svg [id]')].map((n) => n.id).filter(Boolean);
        const seen = new Set();
        const twice = new Set();
        for (const id of ids) { if (seen.has(id)) twice.add(id); else seen.add(id); }
        return [...twice];
      });
      if (dupes.length) collisions.push(`${type}: ${dupes.slice(0, 4).join(', ')}`);
    }
    led.check('SVG ids', 'unique across two instances',
      'two of the same component on one panel never define the same svg id twice',
      [], collisions);
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
