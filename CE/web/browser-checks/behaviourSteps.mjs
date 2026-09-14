/**
 * behaviourSteps.mjs — deep behavioural pass over the two grid-and-lane components:
 * the Step Sequencer and the Looper.
 *
 * They are opposites of one another and measured accordingly. The sequencer PLAYS: what a property
 * changes is the MIDI that leaves and where the playhead is, so the note funnel and the rendered
 * grid are the evidence. The Looper MODULATES: it emits no notes at all, and what a property
 * changes is the number a bound device parameter receives — `controlPortValues`, sampled while the
 * loop is actually running, and the gesture recorded with a real pointer drag.
 *
 * Run: node browser-checks/behaviourSteps.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('steps');
const ons = (events) => events.filter((e) => e.kind === 'on');
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
};
/**
 * Compare two port maps to six decimal places.
 *
 * Not a loosening of the assertion — the value is still exact, to six places, which is far tighter
 * than anything audible. It is the interpolation's last bit: `laneValueAt` reaches phase 0.6 along a
 * ramp as 0.6000000000000001, and an equality check on that is asserting IEEE-754 rather than the
 * product.
 */
const samePorts = (a, b) => JSON.stringify(Object.fromEntries(Object.entries(a ?? {})
  .map(([k, v]) => [k, Number(v).toFixed(6)])))
  === JSON.stringify(Object.fromEntries(Object.entries(b ?? {}).map(([k, v]) => [k, Number(v).toFixed(6)])));

try {
  // =============================================================================================
  // STEP SEQUENCER — 19 properties. A grid of cells walked on a clock. Everything is measured as
  // the notes that came out, in order, with their channels and their lengths.
  // =============================================================================================
  await kit.fresh();
  {
    const S = 'StepSequencer';
    const SW = 560;
    const SH = 180;
    // A pattern with ONE cell per track, each on a different step, so the order the steps are
    // walked in comes back as the order the NOTES arrive in. A dense pattern could not tell
    // 'forward' from 'reverse'.
    const oneEach = { 't0:0': { on: true, velocity: 100 }, 't1:1': { on: true, velocity: 100 },
      't2:2': { on: true, velocity: 100 } };
    let sid = await kit.make(S, { 'Transform.x': 40, 'Transform.y': 120,
      'Transform.width': SW, 'Transform.height': SH,
      'StepSequencer.steps': 4, 'StepSequencer.bpm': 240, 'StepSequencer.division': '1/4',
      'StepSequencer.direction': 'forward', 'StepSequencer.gate': 60,
      'StepSequencer.syncToTransport': false, 'StepSequencer.running': false,
      'StepSequencer.channel': 10, 'StepSequencer.beatEvery': 4,
      'StepSequencer.trackHeaderWidth': 64, 'StepSequencer.padding': 6,
      'StepSequencer.pattern': oneEach });
    await kit.preview(true);

    /** Run for a window and report the note-ons, in order. A step here is 250ms (240bpm, 1/4). */
    const runFor = async (ms) => {
      await kit.forget();
      await kit.set(sid, { 'StepSequencer.running': true });
      await kit.settle(ms);
      await kit.set(sid, { 'StepSequencer.running': false });
      await kit.settle(160);
      return ons(await kit.notes());
    };

    // --- running: nothing until it is told to ---------------------------------------------------
    {
      await kit.forget();
      await kit.settle(600);
      led.check(S, 'running (false)', 'a stopped sequencer plays nothing', 0, ons(await kit.notes()).length);
      const played = await runFor(1100);
      led.check(S, 'running (true)', 'a running one plays the cells that are on', true, played.length >= 3);
      led.check(S, 'tracks[].note', 'and each cell sounds ITS OWN track note, not the sequencer’s',
        [36, 38, 42], [...new Set(played.map((e) => e.note))].sort((a, b) => a - b));
    }

    // --- direction: the ORDER the steps are walked in ----------------------------------------------
    {
      /** The majority direction over the window — a window opens mid-cycle, so the first three
       *  notes depend on the phase the sampling started in. */
      const walk = (notes) => {
        const seen = notes.map((e) => ({ 36: 0, 38: 1, 42: 2 }[e.note]));
        let up = 0;
        let down = 0;
        for (let i = 1; i < seen.length; i += 1) {
          if (seen[i] > seen[i - 1]) up += 1;
          else if (seen[i] < seen[i - 1]) down += 1;
        }
        return { up, down };
      };
      await kit.set(sid, { 'StepSequencer.direction': 'forward' });
      const fwd = walk(await runFor(2400));
      led.check(S, "direction 'forward'", 'the steps are walked left to right, turning over once per lap',
        true, fwd.up > fwd.down);
      await kit.set(sid, { 'StepSequencer.direction': 'reverse' });
      const rev = walk(await runFor(2400));
      led.check(S, "direction 'reverse'", 'and right to left the other way', true, rev.down > rev.up);
      await kit.set(sid, { 'StepSequencer.direction': 'pingpong' });
      const ping = (await runFor(3000)).map((e) => e.note);
      // Out and back over a 4-step lane: the turn is at an end, so some note repeats across the
      // turn in a way a plain lap never produces at this pattern. What is asserted is that it plays
      // and that it is not simply the forward walk.
      led.check(S, "direction 'pingpong'", 'out and back plays, and is not the plain forward lap',
        true, ping.length >= 4 && walk(ping.map((n) => ({ note: n }))).down > 0);
      await kit.set(sid, { 'StepSequencer.direction': 'random' });
      const rnd = (await runFor(3000)).map((e) => e.note);
      led.check(S, "direction 'random'", 'random still plays the cells that are on, and only those',
        true, rnd.length >= 4 && rnd.every((n) => [36, 38, 42].includes(n)));
      await kit.set(sid, { 'StepSequencer.direction': 'forward' });
    }

    // --- bpm + division: how fast ---------------------------------------------------------------------
    {
      const rate = async (bpm, division, ms) => {
        await kit.set(sid, { 'StepSequencer.bpm': bpm, 'StepSequencer.division': division });
        return (await runFor(ms)).length;
      };
      const slow = await rate(120, '1/4', 2000);          // a step is 500ms → 4 steps → 3 notes
      const fast = await rate(240, '1/4', 2000);          // a step is 250ms → 8 steps → 6 notes
      led.check(S, 'bpm', 'doubling the tempo plays about twice as many notes in the same window',
        true, slow >= 2 && fast >= slow * 1.6 && fast <= slow * 2.6);
      const sixteenths = await rate(240, '1/16', 2000);   // a step is 62.5ms → 32 steps → 24 notes
      led.check(S, 'division', 'and sixteenths at the same tempo are four times as many again',
        true, sixteenths >= fast * 2.5);
      await kit.set(sid, { 'StepSequencer.bpm': 240, 'StepSequencer.division': '1/4' });
    }

    // --- gate: how LONG each note is held ----------------------------------------------------------------
    {
      /** The measured note length: the gap between a note-on and its matching note-off. */
      const heldMs = async () => {
        await kit.forget();
        await kit.set(sid, { 'StepSequencer.running': true });
        await kit.settle(1600);
        await kit.set(sid, { 'StepSequencer.running': false });
        await kit.settle(200);
        const events = await kit.notes();
        const spans = [];
        for (const on of events.filter((e) => e.kind === 'on')) {
          const off = events.find((e) => e.kind === 'off' && e.note === on.note && e.at > on.at);
          if (off) spans.push(off.at - on.at);
        }
        return spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null;
      };
      await kit.set(sid, { 'StepSequencer.gate': 20 });
      const short = await heldMs();
      await kit.set(sid, { 'StepSequencer.gate': 90 });
      const long = await heldMs();
      // A step at 240bpm 1/4 is 250ms, so 20% is 50ms and 90% is 225ms.
      led.check(S, 'gate', 'the note is held for the declared percentage of the step — 50ms and 225ms of a 250ms step',
        true, short !== null && long !== null
          && Math.abs(short - 50) <= 30 && Math.abs(long - 225) <= 45 && long > short * 2.5);
      await kit.set(sid, { 'StepSequencer.gate': 60 });
    }

    // --- tracks[].channel and the sequencer channel ------------------------------------------------------
    {
      const tracks = (over = []) => [
        { id: 't0', label: 'Kick', note: 36, channel: 10, colour: 'FF5B9BD5', muted: false, ...over[0] },
        { id: 't1', label: 'Snare', note: 38, channel: 10, colour: 'FFF2C94C', muted: false, ...over[1] },
        { id: 't2', label: 'Hat', note: 42, channel: 10, colour: 'FF39D98A', muted: false, ...over[2] }];
      led.check(S, 'tracks[].channel', 'every track sends on the channel it names',
        [10], [...new Set((await runFor(1200)).map((e) => e.channel))]);
      await kit.set(sid, { 'StepSequencer.tracks': tracks([{ channel: 3 }, { channel: 4 }, { channel: 5 }]) });
      led.check(S, 'tracks[].channel (per track)', 'and three tracks can go to three different channels',
        [3, 4, 5], [...new Set((await runFor(1400)).map((e) => e.channel))].sort((a, b) => a - b));

      // --- tracks[].muted ------------------------------------------------------------------------------
      await kit.set(sid, { 'StepSequencer.tracks': tracks([{ muted: true }]) });
      const unmuted = (await runFor(1400)).map((e) => e.note);
      led.check(S, 'tracks[].muted', 'a muted track is silent while the others keep playing',
        { kick: false, others: true },
        { kick: unmuted.includes(36), others: unmuted.includes(38) && unmuted.includes(42) });
      const dimmed = await kit.shapes(sid, 'text');
      led.check(S, 'tracks[].muted (drawn)', 'and its name is dimmed rather than removed',
        '0.4', dimmed.find((n) => n.text === 'Kick')?.opacity);
      await kit.set(sid, { 'StepSequencer.tracks': tracks() });

      // --- tracks[].label ------------------------------------------------------------------------------
      led.check(S, 'tracks[].label', 'each track is named down the left-hand lane',
        ['Kick', 'Snare', 'Hat'], (await kit.texts(sid)));
    }

    // --- pattern + cell velocity ------------------------------------------------------------------------
    {
      await kit.set(sid, { 'StepSequencer.pattern': { 't0:0': { on: true, velocity: 64 },
        't1:1': { on: true, velocity: 120 } } });
      const played = await runFor(1400);
      led.check(S, 'pattern (which cells)', 'only the cells that are on sound',
        [36, 38], [...new Set(played.map((e) => e.note))].sort((a, b) => a - b));
      led.check(S, 'pattern (cell velocity)', 'and each carries the velocity its own cell holds',
        { 36: 64, 38: 120 },
        { 36: played.find((e) => e.note === 36)?.velocity,
          38: played.find((e) => e.note === 38)?.velocity });
      // THE VELOCITY IS ALSO DRAWN — opacity is velocity/127, with a floor at 0.35 so a whisper is
      // still visible. 64 and 120 are both above the floor, so the two cells have to differ; 40
      // would have hit the floor and read as a working check that could not fail.
      const cells = await kit.shapes(sid, 'rect', (n) => n.rx === 2);
      const opacities = cells.map((n) => Number(n.opacity)).filter((v) => Number.isFinite(v));
      led.check(S, 'pattern (velocity is drawn)', 'a cell at velocity 64 is drawn at half opacity and one at 120 nearly solid',
        { quiet: true, loud: true },
        { quiet: opacities.some((v) => Math.abs(v - 64 / 127) < 0.01),
          loud: opacities.some((v) => Math.abs(v - 120 / 127) < 0.01) });
      await kit.set(sid, { 'StepSequencer.pattern': oneEach });
    }

    // --- steps: how many columns ---------------------------------------------------------------------------
    {
      const columns = async () => {
        const g = await kit.geo(sid);
        const cells = g.filter((n) => n.tag === 'rect' && n.rx === 2);
        return new Set(cells.map((n) => Math.round(n.x))).size;
      };
      await kit.set(sid, { 'StepSequencer.steps': 4 });
      led.check(S, 'steps (4)', 'the grid is four columns wide', 4, await columns());
      await kit.set(sid, { 'StepSequencer.steps': 16 });
      led.check(S, 'steps (16)', 'and sixteen when it says sixteen', 16, await columns());
      const wide = await kit.shapes(sid, 'rect', (n) => n.rx === 2);
      led.check(S, 'steps (the cells share the width)', 'sixteen cells across the same grid are a sixteenth of it each',
        true, Math.abs(wide[0].width - ((SW - 6 - 64 - 6) / 16 - 2)) < 0.5);
      await kit.set(sid, { 'StepSequencer.steps': 4 });
    }

    // --- beatEvery: the heavier grid lines ------------------------------------------------------------------
    {
      await kit.set(sid, { 'StepSequencer.steps': 16, 'StepSequencer.beatEvery': 4 });
      led.check(S, 'beatEvery (4)', 'a sixteen-step grid gets a line every fourth step — three of them',
        3, (await kit.shapes(sid, 'line')).length);
      await kit.set(sid, { 'StepSequencer.beatEvery': 2 });
      led.check(S, 'beatEvery (2)', 'and every second step is seven',
        7, (await kit.shapes(sid, 'line')).length);
      await kit.set(sid, { 'StepSequencer.beatEvery': 4, 'StepSequencer.steps': 4 });
    }

    // --- trackHeaderWidth + padding: the geometry -------------------------------------------------------------
    {
      const firstCellX = async () => (await kit.shapes(sid, 'rect', (n) => n.rx === 2))
        .reduce((lo, n) => Math.min(lo, n.x), Infinity);
      await kit.set(sid, { 'StepSequencer.trackHeaderWidth': 64, 'StepSequencer.padding': 6 });
      led.check(S, 'trackHeaderWidth + padding', 'the grid starts one padding and one header in — 6 + 64, plus the cell gap',
        71, await firstCellX());
      await kit.set(sid, { 'StepSequencer.trackHeaderWidth': 100 });
      led.check(S, 'trackHeaderWidth (changed)', 'a wider header pushes the grid right by the difference',
        107, await firstCellX());
      await kit.set(sid, { 'StepSequencer.padding': 20 });
      led.check(S, 'padding', 'and more padding pushes it further still',
        121, await firstCellX());
      await kit.set(sid, { 'StepSequencer.trackHeaderWidth': 64, 'StepSequencer.padding': 6 });
    }

    // --- the playhead: drawn only while running, and it moves -------------------------------------------------
    {
      const headX = async () => (await kit.geo(sid))
        .find((n) => n.tag === 'rect' && n.fill === rgba('885B9BD5'))?.x ?? null;
      await kit.set(sid, { 'StepSequencer.playheadColour': '885B9BD5', 'StepSequencer.bpm': 60,
        'StepSequencer.division': '1/4', 'StepSequencer.steps': 4 });
      await kit.settle(160);
      led.check(S, 'the playhead (stopped)', 'a stopped sequencer draws no playhead rather than one parked at step zero',
        null, await headX());
      await kit.set(sid, { 'StepSequencer.running': true });
      await kit.settle(300);
      const a = await headX();
      await kit.settle(1100);                 // a step at 60bpm 1/4 is a full second
      const b = await headX();
      await kit.set(sid, { 'StepSequencer.running': false });
      await kit.settle(200);
      led.check(S, 'the playhead (running)', 'a running one draws a playhead that has moved a whole cell a second later',
        true, a !== null && b !== null && Math.abs(b - a) > 50);
      led.check(S, 'the playhead (stopped again)', 'and it goes when the sequencer stops', null, await headX());
      await kit.set(sid, { 'StepSequencer.bpm': 240 });
    }

    // --- the colours -----------------------------------------------------------------------------------------------
    {
      await kit.set(sid, { 'StepSequencer.cellColour': 'FF101820', 'StepSequencer.cellOnColour': 'FFCC3366',
        'StepSequencer.gridColour': 'FF00FF88', 'StepSequencer.labelColour': 'FFFFAA00',
        'StepSequencer.steps': 16, 'StepSequencer.beatEvery': 4,
        'StepSequencer.tracks': [{ id: 't0', label: 'Kick', note: 36, channel: 10, muted: false },
          { id: 't1', label: 'Snare', note: 38, channel: 10, muted: false },
          { id: 't2', label: 'Hat', note: 42, channel: 10, muted: false }] });
      await kit.settle(200);
      const g = await kit.geo(sid);
      led.check(S, 'cellColour', 'an empty cell takes the cell colour',
        true, g.some((n) => n.tag === 'rect' && n.rx === 2 && n.fill === rgba('FF101820')));
      led.check(S, 'cellOnColour', 'and a lit one the on-colour, when the track names none of its own',
        true, g.some((n) => n.tag === 'rect' && n.rx === 2 && n.fill === rgba('FFCC3366')));
      led.check(S, 'gridColour', 'the beat lines take the grid colour',
        true, g.some((n) => n.tag === 'line' && n.stroke === rgba('FF00FF88')));
      led.check(S, 'labelColour', 'and the track names theirs',
        true, g.some((n) => n.tag === 'text' && n.fill === rgba('FFFFAA00')));
      // A track colour WINS over the on-colour — that is the point of having one.
      await kit.set(sid, { 'StepSequencer.tracks': [
        { id: 't0', label: 'Kick', note: 36, channel: 10, colour: 'FF2233EE', muted: false },
        { id: 't1', label: 'Snare', note: 38, channel: 10, muted: false },
        { id: 't2', label: 'Hat', note: 42, channel: 10, muted: false }] });
      await kit.settle(160);
      led.check(S, 'tracks[].colour', 'a track with its own colour paints its lit cells in it',
        true, (await kit.geo(sid)).some((n) => n.tag === 'rect' && n.rx === 2 && n.fill === rgba('FF2233EE')));
      await kit.set(sid, { 'StepSequencer.steps': 4 });
    }

    // --- syncToTransport ---------------------------------------------------------------------------------------------
    {
      const transportRun = async (on) => kit.page.evaluate(async (on) => {
        const { startTransport, stopTransport, setTransportBpm } = await import('/src/CE_Application/stores/transport.js');
        setTransportBpm(240);
        if (on) startTransport(); else stopTransport();
      }, on);
      await kit.set(sid, { 'StepSequencer.syncToTransport': true, 'StepSequencer.division': '1/4',
        'StepSequencer.pattern': oneEach });
      await transportRun(false);
      await kit.settle(200);
      await kit.forget();
      await kit.set(sid, { 'StepSequencer.running': true });
      await kit.settle(900);
      led.check(S, 'syncToTransport (the clock is stopped)', 'a synced sequencer with the transport stopped stays silent, however much its own BPM says',
        0, ons(await kit.notes()).length);
      await kit.forget();
      await transportRun(true);
      await kit.settle(1400);
      const synced = ons(await kit.notes());
      await transportRun(false);
      await kit.set(sid, { 'StepSequencer.running': false });
      led.check(S, 'syncToTransport (running)', 'and plays as soon as the shared clock does',
        true, synced.length >= 3);
      await kit.set(sid, { 'StepSequencer.syncToTransport': false, 'StepSequencer.bpm': 240 });
    }

    // --- save and reopen -------------------------------------------------------------------------------------------------
    {
      await kit.set(sid, { 'StepSequencer.steps': 8, 'StepSequencer.gate': 35,
        'StepSequencer.pattern': { 't0:0': { on: true, velocity: 111 }, 't1:3': { on: true, velocity: 99 },
          't2:5': { on: true, velocity: 64 } },
        'StepSequencer.tracks': [
          { id: 't0', label: 'Boom', note: 41, channel: 7, colour: 'FF2233EE', muted: false },
          { id: 't1', label: 'Tsk', note: 44, channel: 8, muted: true },
          { id: 't2', label: 'Tick', note: 49, channel: 9, muted: false }] });
      await kit.settle(220);
      const before = await kit.geo(sid);
      const again = await kit.reopen(sid);
      led.check(S, 'save/reopen (the grid)', 'every cell, line and track name returns identical',
        JSON.stringify(before), JSON.stringify(await kit.geo(again)));
      sid = again;
      await kit.preview(true);
      await kit.forget();
      await kit.set(sid, { 'StepSequencer.running': true });
      await kit.settle(1600);
      await kit.set(sid, { 'StepSequencer.running': false });
      await kit.settle(200);
      const played = ons(await kit.notes());
      led.check(S, 'save/reopen (still plays the pattern)',
        'a reopened sequencer plays the two cells that are on, on their own channels, at their own velocities, and the muted track stays silent',
        { notes: [41, 49], channels: [7, 9], velocities: [111, 64], muted: false },
        { notes: [...new Set(played.map((e) => e.note))].sort((a, b) => a - b),
          channels: [...new Set(played.map((e) => e.channel))].sort((a, b) => a - b),
          velocities: [played.find((e) => e.note === 41)?.velocity, played.find((e) => e.note === 49)?.velocity],
          muted: played.some((e) => e.note === 44) });
    }

    // Both of these were carried as "unverified" for a pass. Neither is a gap in the testing; they
    // are answers, and looking properly gave two different ones.
    led.inert(S, 'position', 'the step the sequencer is parked on',
      'DECLARED AND UNREACHABLE. The ticker keeps the live index in a module map inside the surface '
      + '(`seqPosition[id] ?? -1`) and injects it for the renderer as `__position`; the document\'s own '
      + '`position` is seeded from nothing, read by nothing and written by nothing. It is not in the '
      + 'StepSequencer editor, and it is not a scripting verb because the Step Sequencer has no verb '
      + 'family at all. The drawn playhead IS measured above — that is the live one.');
    led.unsupported(S, 'editable', 'click cells in preview',
      'NOT A PROPERTY. `editable` is not declared in the StepSequencer section of sectionDefaults, it '
      + 'is not in the editor, and derivedFlagVerbs only mints the verb when the section declares the '
      + 'boolean — which this one does not. The catalogue row came from assuming the family-wide '
      + '`editable` convention applied here. Cells are authored in the Sequencer designer dock, and '
      + 'that the click there writes StepSequencer.pattern is covered by browser-checks/designerTab.mjs.');
  }
  await kit.preview(false);

  // =============================================================================================
  // LOOPER — 17 properties. The sequencer's opposite: it emits no notes at all. What a property
  // changes here is the NUMBER a bound device parameter receives, so the fan-out map is the
  // evidence, and the drawn curve and playhead are the second, independent reading of the same
  // fact — the head dot sits at the lane value for the phase the shared playhead is at, so the two
  // have to agree or one of them is lying.
  // =============================================================================================
  await kit.fresh();
  {
    const L = 'Looper';
    const LW = 480;
    const LH = 200;
    // Lane geometry, from the layout the renderer shares: pad 8, two lanes, a 6px gap.
    const LANE_W = LW - 16;                                   // 464
    const LANE_H = (LH - 16 - 6) / 2;                          // 89
    const LANE_Y = [8, 8 + LANE_H + 6];
    // A RAMP, so the lane value IS the phase — every assertion below then has an exact expected
    // number rather than "it changed". The second lane is empty on purpose, so `rest` has something
    // to be the answer to.
    const ramp = [{ t: 0, v: 0 }, { t: 1, v: 1 }];
    const lanes = (over = []) => [
      { id: 'g0', label: 'Cutoff', points: ramp, rest: 0, enabled: true, colour: 'FF39D98A', ...over[0] },
      { id: 'g1', label: 'Reso', points: [], rest: 0.75, enabled: true, colour: 'FF5B9BD5', ...over[1] }];
    let lid = await kit.make(L, { 'Transform.x': 40, 'Transform.y': 120,
      'Transform.width': LW, 'Transform.height': LH,
      'Looper.running': false, 'Looper.phase': 0, 'Looper.loopSeconds': 4,
      'Looper.syncToTransport': false, 'Looper.loopBars': 2, 'Looper.editable': true,
      'Looper.showPlayhead': true, 'Looper.showGrid': true, 'Looper.showDivisions': false,
      'Looper.lanes': lanes() });
    await kit.preview(true);

    // --- lanes[].points + phase: the value a bound parameter receives -------------------------------
    {
      await kit.set(lid, { 'Looper.phase': 0.25 });
      led.check(L, 'lanes[].points + phase', 'a lane recorded as a ramp hands out its value at the phase, and an empty lane its rest',
        { lane_0: 0.25, lane_1: 0.75 }, await kit.ports(lid), samePorts);
      await kit.set(lid, { 'Looper.phase': 0.6 });
      led.check(L, 'phase (moved)', 'and follows the phase exactly, not approximately',
        { lane_0: 0.6, lane_1: 0.75 }, await kit.ports(lid), samePorts);
    }

    // --- lanes[].rest: what an empty lane is worth ------------------------------------------------------
    {
      await kit.set(lid, { 'Looper.lanes': lanes([{}, { rest: 0.2 }]) });
      led.check(L, 'lanes[].rest', 'the rest is the value of a lane with nothing recorded on it',
        0.2, (await kit.ports(lid)).lane_1);
      await kit.set(lid, { 'Looper.lanes': lanes() });
    }

    // --- lanes[].enabled: a switched-off lane falls back to its rest ---------------------------------------
    {
      await kit.set(lid, { 'Looper.lanes': lanes([{ enabled: false, rest: 0.1 }]) });
      led.check(L, 'lanes[].enabled (false)', 'a disabled lane hands out its rest instead of its gesture, however much is recorded on it',
        0.1, (await kit.ports(lid)).lane_0);
      const dim = (await kit.shapes(lid, 'path')).find((n) => n.stroke === rgba('FF39D98A'));
      led.check(L, 'lanes[].enabled (drawn)', 'and its curve is dimmed rather than removed, so you can see what is switched off',
        '0.4', dim?.opacity);
      await kit.set(lid, { 'Looper.lanes': lanes() });
      led.check(L, 'lanes[].enabled (true)', 'switching it back on restores both the value and the solid curve',
        { value: '0.600000', opacity: '1' },
        { value: Number((await kit.ports(lid)).lane_0).toFixed(6),
          opacity: (await kit.shapes(lid, 'path')).find((n) => n.stroke === rgba('FF39D98A'))?.opacity });
    }

    // --- running + loopSeconds: the loop takes as long as it says --------------------------------------------
    {
      /** Sample the shared playhead's x over a window and report where it jumped backwards. */
      const laps = async (ms, every = 90) => {
        const marks = [];
        const start = Date.now();
        let last = null;
        while (Date.now() - start < ms) {
          const line = (await kit.geo(lid)).find((n) => n.tag === 'line' && n['stroke-width'] === 1.5);
          const x = line?.x1 ?? null;
          if (x !== null && last !== null && x < last - 20) marks.push(Date.now());
          last = x;
          await kit.settle(every);
        }
        return marks;
      };
      // THE INTERVAL BETWEEN WRAPS, not how many there were in a window. A count depends on where
      // the phase happened to be when the window opened — changing loopSeconds does not reset it,
      // so a loop parked at 0.9 wraps immediately whatever its new length is, and "no wraps in this
      // window" failed for a reason that had nothing to do with the property.
      const lapInterval = async (seconds, ms) => {
        await kit.set(lid, { 'Looper.loopSeconds': seconds });
        await kit.settle(200);
        const marks = await laps(ms);
        if (marks.length < 2) return null;
        const gaps = marks.slice(1).map((t, i) => t - marks[i]);
        return gaps.reduce((a, b) => a + b, 0) / gaps.length;
      };
      await kit.set(lid, { 'Looper.showPlayhead': true, 'Looper.running': true });
      const one = await lapInterval(1, 3400);
      const two = await lapInterval(2, 5200);
      await kit.set(lid, { 'Looper.running': false });
      led.check(L, 'loopSeconds (1s)', 'a one-second loop comes round once a second',
        true, one !== null && Math.abs(one - 1000) < 220);
      led.check(L, 'loopSeconds (2s)', 'and a two-second loop takes twice as long to come round',
        true, two !== null && Math.abs(two - 2000) < 380);
    }

    // --- the head dot is ON the curve ---------------------------------------------------------------------------
    {
      // Two independent readings of the same instant: the shared playhead's x says what the phase
      // is, and the lane-0 dot's y says what value the lane is handing out. For a ramp the second
      // must follow from the first, and neither is the number this check put in.
      await kit.set(lid, { 'Looper.loopSeconds': 6, 'Looper.running': true });
      await kit.settle(900);
      const g = await kit.geo(lid);
      await kit.set(lid, { 'Looper.running': false });
      const head = g.find((n) => n.tag === 'line' && n['stroke-width'] === 1.5);
      const dot = g.filter((n) => n.tag === 'circle' && n.r === 3.5).sort((a, b) => a.cy - b.cy)[0];
      const phase = head ? (head.x1 - 8) / LANE_W : null;
      const valueFromDot = dot ? 1 - (dot.cy - LANE_Y[0]) / LANE_H : null;
      led.check(L, 'the playhead and the lane agree', 'the lane-0 dot sits at the ramp value for the phase the shared playhead is at',
        true, phase !== null && valueFromDot !== null && phase > 0.05
          && Math.abs(valueFromDot - phase) < 0.03);
      led.check(L, 'the dot is on lane 0', 'and inside lane zero rather than anywhere on the face',
        true, dot.cx >= 8 && dot.cx <= 8 + LANE_W && dot.cy >= LANE_Y[0] && dot.cy <= LANE_Y[0] + LANE_H);
      await kit.set(lid, { 'Looper.loopSeconds': 4, 'Looper.phase': 0.6 });
    }

    // --- showPlayhead -------------------------------------------------------------------------------------------
    {
      await kit.set(lid, { 'Looper.showPlayhead': true, 'Looper.playheadColour': 'FFFFFFFF' });
      await kit.settle(160);
      const shown = (await kit.shapes(lid, 'line')).filter((n) => n['stroke-width'] === 1.5).length;
      await kit.set(lid, { 'Looper.showPlayhead': false });
      const hidden = (await kit.shapes(lid, 'line')).filter((n) => n['stroke-width'] === 1.5).length;
      led.check(L, 'showPlayhead', 'the sweeping line is drawn, and stops being drawn',
        { on: 1, off: 0 }, { on: shown, off: hidden });
      await kit.set(lid, { 'Looper.showPlayhead': true });
    }

    // --- showGrid + syncToTransport + loopBars: what the vertical lines MEAN --------------------------------------
    {
      // THE GRID LINES, NOT THE PLAYHEAD, and told apart by HEIGHT rather than by stroke width. A
      // grid line spans one lane (89px here); the shared playhead spans the whole control. Filtering
      // on stroke-width would have worked free-running and then silently dropped the BAR lines once
      // synced, because a bar line is drawn heavier — at the same 1.5 the playhead uses — so the
      // count would have come out at twelve of fourteen and the majors at zero.
      const verticals = async () => (await kit.shapes(lid, 'line'))
        .filter((n) => n.x1 === n.x2 && (n.y2 - n.y1) < 100);
      await kit.set(lid, { 'Looper.showGrid': true, 'Looper.syncToTransport': false,
        'Looper.gridColour': '22FFFFFF' });
      await kit.settle(160);
      led.check(L, 'showGrid (free-running)', 'free-running there is nothing musical to mark, so it is plain quarters — three lines in each of two lanes',
        6, (await verticals()).length);
      await kit.set(lid, { 'Looper.showGrid': false });
      led.check(L, 'showGrid (false)', 'and none at all when it is off', 0, (await verticals()).length);
      await kit.set(lid, { 'Looper.showGrid': true, 'Looper.syncToTransport': true, 'Looper.loopBars': 2 });
      await kit.settle(200);
      const synced = await verticals();
      // Two bars of four is eight beats: seven interior lines per lane, and the one on the bar line
      // is heavier. That is the whole point of syncing the grid — a two-bar take reads as two bars.
      led.check(L, 'syncToTransport + loopBars (2 bars)', 'synced, the lines are beats — seven per lane — with the bar line heavier',
        { lines: 14, majors: 2 },
        { lines: synced.length, majors: synced.filter((n) => n['stroke-width'] === 1.5 || n.opacity === '1').length });
      await kit.set(lid, { 'Looper.loopBars': 1 });
      await kit.settle(200);
      led.check(L, 'loopBars (1 bar)', 'one bar is three interior beat lines per lane, and no bar line inside it',
        6, (await verticals()).length);
      await kit.set(lid, { 'Looper.syncToTransport': false, 'Looper.loopBars': 2 });
    }

    // --- showDivisions + majorTickCount + minorTickCount: the value scale ------------------------------------------
    {
      const horizontals = async () => (await kit.shapes(lid, 'line'))
        .filter((n) => n.y1 === n.y2 && Number(n.opacity) <= 0.2);
      await kit.set(lid, { 'Looper.showDivisions': false });
      await kit.settle(160);
      led.check(L, 'showDivisions (false)', 'no value scale until it is asked for', 0, (await horizontals()).length);
      await kit.set(lid, { 'Looper.showDivisions': true, 'Looper.majorTickCount': 5, 'Looper.minorTickCount': 0 });
      await kit.settle(160);
      const five = await horizontals();
      led.check(L, 'showDivisions + majorTickCount (5)', 'five major divisions in each of two lanes, at the quarters',
        { lines: 10, majors: 10 },
        { lines: five.length, majors: five.filter((n) => Number(n.opacity) === 0.2).length });
      await kit.set(lid, { 'Looper.majorTickCount': 3, 'Looper.minorTickCount': 2 });
      await kit.settle(160);
      const mixed = await horizontals();
      // Three majors with two minors between each pair is three plus four, per lane.
      led.check(L, 'majorTickCount + minorTickCount', 'three majors and four minors per lane, the minors fainter',
        { majors: 6, minors: 8 },
        { majors: mixed.filter((n) => Number(n.opacity) === 0.2).length,
          minors: mixed.filter((n) => Number(n.opacity) === 0.1).length });
      await kit.set(lid, { 'Looper.showDivisions': false });
    }

    // --- editable: RECORD A GESTURE with a real pointer drag ---------------------------------------------------------
    {
      await kit.set(lid, { 'Looper.lanes': lanes([{ points: [] }]), 'Looper.editable': true });
      await kit.settle(200);
      const box = await kit.box(lid);
      // Across lane 0 from bottom-left to top-right: t sweeps 0→1 while v sweeps 0→1, so what gets
      // recorded is a rising ramp and the lane's value at phase 0.5 has to be about a half.
      const y0 = box.y + LANE_Y[0] + LANE_H * 0.9;
      const y1 = box.y + LANE_Y[0] + LANE_H * 0.1;
      await kit.page.mouse.move(box.x + 20, y0);
      await kit.page.mouse.down();
      await kit.settle(60);
      for (let i = 1; i <= 10; i += 1) {
        await kit.page.mouse.move(box.x + 20 + (LANE_W - 40) * (i / 10), y0 + (y1 - y0) * (i / 10));
        await kit.settle(30);
      }
      await kit.page.mouse.up();
      await kit.settle(240);
      const recorded = await kit.read(lid, 'Looper.lanes');
      const points = recorded?.[0]?.points ?? [];
      led.check(L, 'editable (recording commits)', 'a press-and-drag across a lane records the gesture into the document on release',
        true, points.length >= 5);
      led.check(L, 'the recorded gesture is the one drawn', 'and it rises from about a tenth to about nine tenths across the loop',
        true, points.length > 1 && points[0].v < 0.25 && points[points.length - 1].v > 0.75
          && points[0].t < 0.2 && points[points.length - 1].t > 0.8);
      await kit.set(lid, { 'Looper.phase': 0.5 });
      led.check(L, 'the recorded gesture is what gets handed out', 'and halfway round the loop a bound parameter receives about a half',
        true, Math.abs((await kit.ports(lid)).lane_0 - 0.5) < 0.12);
      // ONE prompt left, not none: lane 1 has nothing recorded on it and is still asking for a
      // gesture, which is correct. "No lane shows the prompt" would have been asserting that the
      // empty lane had stopped saying it was empty.
      const prompts = (await kit.texts(lid)).filter((t) => t === 'press & move to record').length;
      const curves = (await kit.shapes(lid, 'path')).filter((n) => n.stroke === rgba('FF39D98A')).length;
      led.check(L, 'the recorded gesture is drawn',
        'the recorded lane draws its curve and stops asking for one, while the empty lane goes on asking',
        { promptsLeft: 1, curvesDrawn: 1 }, { promptsLeft: prompts, curvesDrawn: curves });

      // …and with editing off the same drag records nothing at all.
      await kit.set(lid, { 'Looper.lanes': lanes([{ points: [] }]), 'Looper.editable': false });
      await kit.settle(200);
      await kit.drag({ x: box.x + 20, y: y0 }, { x: box.x + LANE_W - 20, y: y1 });
      await kit.settle(200);
      led.check(L, 'editable (false)', 'a locked looper records nothing from the same drag',
        0, ((await kit.read(lid, 'Looper.lanes'))?.[0]?.points ?? []).length);
      await kit.set(lid, { 'Looper.editable': true, 'Looper.lanes': lanes() });
    }

    // --- lanes[].label + the colours ------------------------------------------------------------------------------------
    {
      await kit.set(lid, { 'Looper.laneColour': 'FF101822', 'Looper.gridColour': 'FF00DDAA',
        'Looper.playheadColour': 'FFFF3366', 'Looper.labelColour': 'FFFFCC00',
        'Looper.showGrid': true, 'Looper.showPlayhead': true });
      await kit.settle(200);
      const g = await kit.geo(lid);
      led.check(L, 'lanes[].label', 'each lane is named',
        true, (await kit.texts(lid)).includes('Cutoff') && (await kit.texts(lid)).includes('Reso'));
      led.check(L, 'laneColour', 'the lane wells take the lane colour',
        2, g.filter((n) => n.tag === 'rect' && n.fill === rgba('FF101822')).length);
      led.check(L, 'gridColour', 'the grid lines take theirs',
        true, g.some((n) => n.tag === 'line' && n.stroke === rgba('FF00DDAA')));
      led.check(L, 'playheadColour', 'the sweeping line and the head dot take the playhead colour',
        { line: true, dot: true },
        { line: g.some((n) => n.tag === 'line' && n.stroke === rgba('FFFF3366')),
          dot: g.some((n) => n.tag === 'circle' && n.fill === rgba('FFFF3366')) });
      led.check(L, 'labelColour', 'and the lane names theirs',
        true, g.some((n) => n.tag === 'text' && n.fill === rgba('FFFFCC00')));
      led.check(L, 'lanes[].colour', 'a lane’s own colour paints its curve',
        true, g.some((n) => n.tag === 'path' && n.stroke === rgba('FF39D98A')));
    }

    // --- quantizeLoop --------------------------------------------------------------------------------------------------
    led.inert(L, 'quantizeLoop',
      'snap the loop length to whole beats',
      'declared in sectionDefaults and exposed to scripts as the `quantize` verb, and read by NOTHING in src/: '
      + 'not the renderer, not looperLayout, not the Looper editor (which does not offer it). A script that '
      + 'toggles it changes a field nobody consults, which is worse than the unreachable inert rows — this one '
      + 'has a caller.');

    // --- save and reopen -------------------------------------------------------------------------------------------------
    {
      await kit.set(lid, { 'Looper.phase': 0.4, 'Looper.loopSeconds': 2.5,
        'Looper.lanes': lanes([{ points: [{ t: 0, v: 1 }, { t: 0.5, v: 0 }, { t: 1, v: 1 }] },
          { rest: 0.33 }]) });
      await kit.settle(220);
      const before = await kit.geo(lid);
      const beforePorts = await kit.ports(lid);
      // THE PLAYHEAD IS LIVE POSITION, NOT A SAVED SETTING — the same distinction as the Arp's
      // step head and the Transport's bar readout. A loop that has been running is somewhere the
      // file never knew about, so the sweeping line and the head dot come out of the comparison and
      // are asserted the other way round: the reopened one is back at the AUTHORED phase.
      const head = (g) => g.find((n) => n.tag === 'line' && n['stroke-width'] === 1.5)?.x1 ?? null;
      const lanesOnly = (g) => JSON.stringify(g.filter((n) => !(n.tag === 'line' && n['stroke-width'] === 1.5)
        && !(n.tag === 'circle' && n.r === 3.5)));
      const again = await kit.reopen(lid);
      const after = await kit.geo(again);
      led.check(L, 'save/reopen (the lanes)', 'both lanes, their curves, the grid and the labels return identical',
        lanesOnly(before), lanesOnly(after));
      // 8 + 0.4 * 464 is where phase 0.4 puts the head, to the pixel.
      led.check(L, 'save/reopen (the playhead is not restored)',
        'the loop had run past the authored phase before the save, and a reopened one is back on it',
        { hadMoved: true, onTheAuthoredPhase: true },
        { hadMoved: Math.abs(head(before) - 193.6) > 0.5,
          onTheAuthoredPhase: Math.abs(head(after) - 193.6) < 0.01 });
      lid = again;
      await kit.preview(true);
      led.check(L, 'save/reopen (still hands out the same values)',
        'and a reopened looper hands a bound parameter the same numbers — a V shape read at 0.4, and the other lane’s rest',
        beforePorts, await kit.ports(lid), samePorts);
      led.check(L, 'save/reopen (the V is the recorded one)', 'the curve really is the V that was saved: 0.4 of the way down the first limb is 0.2',
        true, Math.abs(beforePorts.lane_0 - 0.2) < 0.01);
    }
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
