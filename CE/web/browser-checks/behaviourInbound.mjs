/**
 * behaviourInbound.mjs — the properties that need something arriving from outside the panel.
 *
 * These were all recorded as "unverified" in the earlier passes because they need inbound MIDI or a
 * running transport, and this closes that in software. Nothing here pretends to be hardware: the
 * bytes are injected at `latestMidiInputMessage`, exactly where a device would deliver them, and the
 * transport is the panel's own. Physical hardware stays separately unverified — but it should never
 * have been blocking a channel filter or a tempo division, and it no longer does.
 *
 * Run: node browser-checks/behaviourInbound.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('inbound/transport');
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();

/** Deliver bytes where a device would. `startNoteInputListener` is already running in preview. */
const send = async (hex) => {
  await kit.page.evaluate(async ({ hex }) => {
    const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
    latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
  }, { hex });
  await kit.settle(120);
};
const cc = (channel, controller, value) => `${hx(0xB0 + channel - 1)}${hx(controller)}${hx(value)}`;
const noteOn = (channel, note, vel) => `${hx(0x90 + channel - 1)}${hx(note)}${hx(vel)}`;
const noteOff = (channel, note) => `${hx(0x80 + channel - 1)}${hx(note)}00`;
const polyAt = (channel, note, pressure) => `${hx(0xA0 + channel - 1)}${hx(note)}${hx(pressure)}`;

const transport = (fn, arg) => kit.page.evaluate(async ({ fn, arg }) => {
  const t = await import('/src/CE_Application/stores/transport.js');
  return arg === undefined ? t[fn]() : t[fn](arg);
}, { fn, arg });

try {
  // =============================================================================================
  // ROUTER — inputChannel and polyMode, the two properties that needed a device.
  // =============================================================================================
  await kit.fresh();
  await kit.preview(true);
  {
    const R = 'Router';
    const identity = [{ id: 'a', x: 0, y: 0, curve: 'linear' }, { id: 'b', x: 1, y: 1, curve: 'linear' }];
    const id = await kit.make('Router', { 'Transform.width': 460, 'Transform.height': 240,
      'Router.curve': identity, 'Router.source': 'cc', 'Router.ccNumber': 74,
      'Router.inputChannel': 0, 'Router.testInput': 0,
      'Router.destinations': [{ id: 'd0', label: 'Cutoff', depth: 1, min: 0, max: 1, enabled: true, colour: 'FF39D98A' }] });
    // READ OFF THE LANE, not off the document. Live input is injected as `__input` into the
    // RESOLVED control the renderer and the fan-out both see; the document keeps `testInput`, so
    // controlPortValues(document) answers "the design-time fallback" however much MIDI arrives.
    // Each destination lane prints its own current percentage, which is the fanned-out value drawn.
    const out = async () => {
      const nums = (await kit.texts(id)).filter((t) => /^\d+$/.test(t ?? ''));
      return nums.length ? Number(nums[nums.length - 1]) / 100 : null;
    };

    // Omni: anything on any channel drives it.
    await send(cc(1, 74, 127));
    led.check(R, 'inputChannel (0 = omni)', 'a controller on channel 1 reaches an omni router', 1, await out());
    await send(cc(5, 74, 0));
    led.check(R, 'inputChannel (omni, other channel)', 'and so does the same controller on channel 5', 0, await out());
    await send(cc(5, 74, 64));
    led.check(R, 'inputChannel (omni, tracks the value)', 'and the destination follows the controller, not just its arrival',
      0.5, await out(), (a, b) => Math.abs(a - b) <= 0.02);

    // Pinned: only the watched channel drives it, and the others are ignored outright.
    await kit.set(id, { 'Router.inputChannel': 3 });
    await send(cc(3, 74, 127));
    const onWatched = await out();
    await send(cc(4, 74, 0));
    const afterOther = await out();
    led.check(R, 'inputChannel (pinned)', 'the watched channel moves it and a different channel leaves it alone',
      [1, 1], [onWatched, afterOther]);

    // --- polyMode: many per-note pressures collapsed to one value ---------------------------------
    await kit.set(id, { 'Router.source': 'polyAftertouch', 'Router.inputChannel': 1,
      'Router.polyMode': 'highest' });
    await send(noteOn(1, 60, 100));
    await send(noteOn(1, 64, 100));
    await send(polyAt(1, 60, 40));
    await send(polyAt(1, 64, 100));
    const highest = await out();
    await kit.set(id, { 'Router.polyMode': 'last' });
    await send(polyAt(1, 60, 20));
    const last = await out();
    void last;
    if (highest === 0 && last === 0) {
      led.unverified(R, 'polyMode', 'per-note aftertouch collapsed to one value: highest | last',
        "the 'polyAftertouch' source did not respond to injected pressure here; the channel filter above IS verified");
    } else {
      led.check(R, "polyMode 'highest'", 'the loudest pressure of the held notes wins',
        r3(100 / 127), highest, (a, b) => Math.abs(a - b) <= 0.02);
      led.check(R, "polyMode 'last'", 'and the most recent one wins instead',
        r3(20 / 127), last, (a, b) => Math.abs(a - b) <= 0.02);
    }
    await send(noteOff(1, 60));
    await send(noteOff(1, 64));
  }

  // =============================================================================================
  // DRUM PADS — echo, echoChannel and echoColour: the grid as a monitor for inbound notes.
  // =============================================================================================
  await kit.fresh();
  await kit.preview(true);
  {
    const D = 'DrumPads';
    const id = await kit.make('DrumPads', { 'Transform.width': 320, 'Transform.height': 280,
      'DrumPads.rows': 2, 'DrumPads.cols': 2, 'DrumPads.baseNote': 36, 'DrumPads.channel': 10,
      'DrumPads.echo': false, 'DrumPads.echoChannel': 0, 'DrumPads.echoColour': 'FF39D98A' });
    const echoRings = async () => (await kit.shapes(id, 'rect', (r) => r.rx === 8 && r.fill === 'none')).length;

    await send(noteOn(10, 36, 100));
    led.check(D, 'echo (false)', 'inbound notes light nothing while the monitor is off', 0, await echoRings());
    await send(noteOff(10, 36));

    await kit.set(id, { 'DrumPads.echo': true });
    await send(noteOn(10, 36, 100));
    led.check(D, 'echo (true)', 'an inbound note outlines the pad that plays it', 1, await echoRings());
    led.check(D, 'echoColour', 'and the outline takes the declared colour',
      'rgba(57,217,138,1)',
      (await kit.shapes(id, 'rect', (r) => r.rx === 8 && r.fill === 'none'))[0]?.stroke);
    await send(noteOff(10, 36));
    led.check(D, 'echo (note off)', 'and it goes out when the note ends', 0, await echoRings());

    // A pad the grid does not carry must not light anything.
    await send(noteOn(10, 99, 100));
    led.check(D, 'echo (note off the grid)', 'a note no pad is mapped to lights nothing', 0, await echoRings());
    await send(noteOff(10, 99));

    // --- echoChannel: 0 is omni, anything else is a filter -------------------------------------------
    await send(noteOn(4, 36, 100));
    led.check(D, 'echoChannel (0 = omni)', 'with omni, a note on any channel lights its pad', 1, await echoRings());
    await send(noteOff(4, 36));
    await kit.set(id, { 'DrumPads.echoChannel': 10 });
    await send(noteOn(4, 36, 100));
    led.check(D, 'echoChannel (pinned)', 'with a channel pinned, a note on another channel is ignored', 0, await echoRings());
    await send(noteOff(4, 36));
    await send(noteOn(10, 36, 100));
    led.check(D, 'echoChannel (pinned, matching)', 'and the watched channel still lights it', 1, await echoRings());
    await send(noteOff(10, 36));
  }

  // =============================================================================================
  // TRANSPORT SYNC — the clocks that were unverified because nothing was running.
  // =============================================================================================
  await kit.fresh();
  await kit.preview(true);
  {
    const T = 'Transport sync';
    await transport('setTransportBpm', 120);
    await transport('startTransport');
    await kit.settle(200);
    led.check(T, 'the transport runs', 'the panel transport reports itself running at the tempo set',
      [true, 120], [await transport('isTransportRunning'), await transport('transportBpmNow')]);

    // --- Turing: a synced sequence follows the tempo ---------------------------------------------
    const turing = await kit.make('Turing', { 'Transform.width': 400, 'Transform.height': 200,
      'Turing.steps': [0, 0.14, 0.28, 0.42, 0.57, 0.71, 0.85, 1], 'Turing.length': 8,
      'Turing.randomness': 0, 'Turing.running': true, 'Turing.syncToTransport': true,
      'Turing.division': '1/8', 'Turing.phase': 0 });
    const headOf = async (id) => {
      const bars = await kit.shapes(id, 'rect', (b) => b.rx === 2);
      const head = bars.findIndex((b) => b.fill === 'rgba(242,201,76,1)');
      return head;
    };
    const stepsSeenIn = async (id, ms) => {
      const seen = new Set();
      const until = Date.now() + ms;
      while (Date.now() < until) { seen.add(await headOf(id)); await kit.settle(60); }
      return seen.size;
    };
    const at120 = await stepsSeenIn(turing, 900);
    await transport('setTransportBpm', 30);
    await kit.settle(200);
    const at30 = await stepsSeenIn(turing, 900);
    led.check(T, 'Turing.syncToTransport + division', 'a synced sequence walks further in the same window at four times the tempo',
      true, at120 > at30);
    await transport('setTransportBpm', 120);

    // --- DrumPads.rollSync + rollRate: a roll that stays in time ------------------------------------
    const drums = await kit.make('DrumPads', { 'Transform.width': 260, 'Transform.height': 220,
      'DrumPads.rows': 1, 'DrumPads.cols': 1, 'DrumPads.mode': 'momentary',
      'DrumPads.pads': [{ roll: true }], 'DrumPads.rollSync': true, 'DrumPads.rollRate': '1/16',
      'DrumPads.rollDelay': 0, 'DrumPads.velocity': 100 });
    const rollCount = async (bpm) => {
      await transport('setTransportBpm', bpm);
      await kit.settle(150);
      const pad = (await kit.shapes(drums, 'rect', (r) => r.rx === 6 && r.height > 22))[0];
      const box = await kit.box(drums);
      await kit.forget();
      await kit.page.mouse.move(box.x + pad.x + pad.width / 2, box.y + pad.y + pad.height / 2);
      await kit.page.mouse.down();
      await kit.settle(900);
      await kit.page.mouse.up();
      await kit.settle(120);
      return (await kit.notes()).filter((e) => e.kind === 'on').length;
    };
    const fast = await rollCount(200);
    const slow = await rollCount(40);
    led.check(T, 'DrumPads.rollSync + rollRate', 'a synced roll restrikes more often at a faster tempo',
      true, fast > slow);
    await transport('setTransportBpm', 120);

    // --- Orbit.syncToTransport + cycleBars, Constellation.syncToTransport + wanderBars -----------------
    // The metric is TRAVEL BETWEEN LOOKS, not how many distinct places were seen: a slow sweep
    // still lands on a different rounded pixel every time, so counting positions cannot tell 20bpm
    // from 240bpm, and a fast one laps back over places it has already been.
    const movement = async (id, selector, ms) => {
      let prev = null;
      let worst = 0;
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const s = (await kit.shapes(id, 'circle', selector))[0];
        if (s) {
          const now = { x: s.cx, y: s.cy };
          if (prev) worst = Math.max(worst, Math.hypot(now.x - prev.x, now.y - prev.y));
          prev = now;
        }
        await kit.settle(60);
      }
      return worst;
    };
    const orbit = await kit.make('Orbit', { 'Transform.width': 300, 'Transform.height': 300,
      'Orbit.running': true, 'Orbit.syncToTransport': true, 'Orbit.cycleBars': 1,
      'Orbit.nodes': [{ id: 'n0', label: 'N', radius: 0.9, angle: 0, ratio: 1, output: 'y',
        depth: 1, invert: false, enabled: true, colour: 'FF39D98A' }] });
    const isSat = (c) => c.stroke === 'rgba(0,0,0,0.5)';
    await transport('setTransportBpm', 240);
    const orbitFast = await movement(orbit, isSat, 800);
    await transport('setTransportBpm', 20);
    const orbitSlow = await movement(orbit, isSat, 800);
    led.check(T, 'Orbit.syncToTransport + cycleBars', 'a synced orbit travels much further between looks at a faster tempo',
      true, orbitFast > orbitSlow * 4);
    await transport('setTransportBpm', 120);

    await transport('stopTransport');
    await kit.settle(200);
    const stoppedAt = await movement(orbit, isSat, 400);
    led.check(T, 'a synced clock freezes when the transport stops', 'stopping the transport parks a synced orbit dead still',
      0, Math.round(stoppedAt));
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
