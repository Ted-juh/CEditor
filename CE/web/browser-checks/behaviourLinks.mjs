/**
 * behaviourLinks.mjs — closing the rows earlier passes listed as unverified.
 *
 * Every row here was previously written down as "nothing in this environment can observe it". Each
 * of those statements was true of a fixture with ONE control in it and false of the product, and
 * root was right to ask for them rather than let them stand:
 *
 *   source / linkId / latch   needed a second control actually holding notes, and a release
 *   Constellation sync        needed the shared clock running, and then stopped
 *   trails and physics        needed the motion watched over time rather than sampled once
 *
 * So the fixtures here have two controls in them, or a running transport, or both, and the
 * measurements are taken across time instead of at an instant.
 *
 * Run: node browser-checks/behaviourLinks.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('links');
const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const midiOn = (ch, note, vel = 100) => `${hx(0x90 + ch - 1)}${hx(note)}${hx(vel)}`;
const midiOff = (ch, note) => `${hx(0x80 + ch - 1)}${hx(note)}00`;
const sendMidi = async (hex, settle = 170) => {
  await kit.page.evaluate(async ({ hex }) => {
    const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
    latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
  }, { hex });
  await kit.settle(settle);
};
const ons = (events) => events.filter((e) => e.kind === 'on');

try {
  // =============================================================================================
  // ARP source / linkId / latch — a second control really holding notes.
  // =============================================================================================
  await kit.fresh();
  {
    const A = 'Arp';
    // A latching Chord Pad, so a chord can be held without a finger staying down for the length
    // of a measurement — which is the reason this was hard to observe before.
    const pad = await kit.make('ChordPad', { 'Transform.x': 40, 'Transform.y': 40,
      'Transform.width': 300, 'Transform.height': 160, 'ChordPad.layout': 'grid',
      'ChordPad.channel': 5, 'ChordPad.latch': true });
    const aid = await kit.make(A, { 'Transform.x': 40, 'Transform.y': 240,
      'Transform.width': 460, 'Transform.height': 200, 'Arp.running': true, 'Arp.rate': 8,
      'Arp.pattern': 'up', 'Arp.source': 'link', 'Arp.linkId': pad, 'Arp.latch': false,
      'Arp.channel': 1, 'Arp.velocity': 90, 'Arp.syncToTransport': false,
      'Arp.euclidEnabled': false, 'Arp.octaves': 1 });
    await kit.preview(true);
    await kit.settle(300);
    const padBox = await kit.box(pad);
    const tapPad = async () => {
      await kit.click({ x: padBox.x + padBox.w * 0.2, y: padBox.y + padBox.h * 0.6 });
      await kit.settle(260);
    };
    /** What the ARP played in a window — its own channel, so the pad's own notes are excluded. */
    const arpNotes = async (ms) => {
      await kit.forget();
      await kit.settle(ms);
      return ons(await kit.notes()).filter((e) => e.channel === 1);
    };
    const padHeld = async () => (await kit.session(pad))?.chordNotes ?? [];

    // --- source 'link' + linkId --------------------------------------------------------------
    {
      led.check(A, "source 'link' (nothing held)", 'a linked arpeggiator with nothing held on its Chord Pad plays nothing',
        0, (await arpNotes(900)).length);
      await tapPad();
      const held = await padHeld();
      const played = await arpNotes(1100);
      led.check(A, "source 'link' + linkId", 'holding a chord on the linked pad makes the arpeggiator walk exactly those notes, on its own channel',
        { pad: held.length >= 3, arpPlayed: true, onlyHeldNotes: true },
        { pad: held.length >= 3, arpPlayed: played.length >= 4,
          onlyHeldNotes: played.length > 0 && played.every((e) => held.includes(e.note)) });
      led.check(A, "source 'link' (the pad goes quiet)",
        'and the Chord Pad itself falls silent while it feeds the arp — you would otherwise hear the block chord under the arpeggio',
        0, ons(await kit.notes()).filter((e) => e.channel === 5).length);
    }

    // --- latch: what a RELEASE does ---------------------------------------------------------------
    {
      await kit.set(aid, { 'Arp.latch': false });
      await kit.settle(200);
      await tapPad();                                  // release the latched chord
      led.check(A, 'latch (false) — the fixture really let go', 'the pad is holding nothing after the second tap',
        0, (await padHeld()).length);
      led.check(A, 'latch (false)', 'without latch the arpeggiator stops the moment the source lets go',
        0, (await arpNotes(1100)).length);

      await tapPad();                                  // hold again
      await kit.settle(300);
      await kit.set(aid, { 'Arp.latch': true });
      await kit.settle(250);
      await tapPad();                                  // release again
      led.check(A, 'latch (true) — the fixture really let go', 'the pad is holding nothing after this release either',
        0, (await padHeld()).length);
      const latched = await arpNotes(1100);
      led.check(A, 'latch (true)', 'with latch on it keeps arpeggiating the last chord after the source released it',
        true, latched.length >= 4);
      await kit.set(aid, { 'Arp.latch': false });
      await kit.settle(300);
    }

    // --- source 'input' + inputChannel ---------------------------------------------------------------
    {
      await kit.set(aid, { 'Arp.source': 'input', 'Arp.inputChannel': 0, 'Arp.latch': false });
      await kit.settle(300);
      led.check(A, "source 'input' (nothing held)", 'with the source switched to the MIDI input and no keys down it plays nothing',
        0, (await arpNotes(900)).length);
      for (const n of [60, 64, 67]) await sendMidi(midiOn(2, n, 100));
      const fromInput = await arpNotes(1200);
      led.check(A, "source 'input' (omni)", 'three keys held on the hardware are the three notes it walks',
        { played: true, onlyThose: true },
        { played: fromInput.length >= 4,
          onlyThose: fromInput.length > 0 && fromInput.every((e) => [60, 64, 67].includes(e.note)) });
      for (const n of [60, 64, 67]) await sendMidi(midiOff(2, n));
      led.check(A, "source 'input' (released)", 'and letting the keys go stops it',
        0, (await arpNotes(1000)).length);

      await kit.set(aid, { 'Arp.inputChannel': 7 });
      await kit.settle(250);
      for (const n of [60, 64, 67]) await sendMidi(midiOn(2, n, 100));
      led.check(A, 'inputChannel (pinned)', 'keys on another channel are not its keys',
        0, (await arpNotes(1000)).length);
      for (const n of [60, 64, 67]) await sendMidi(midiOff(2, n));
      for (const n of [62, 65, 69]) await sendMidi(midiOn(7, n, 100));
      const onSeven = await arpNotes(1200);
      led.check(A, 'inputChannel (matching)', 'and the channel it watches is the one it walks',
        true, onSeven.length >= 4 && onSeven.every((e) => [62, 65, 69].includes(e.note)));

      // latch over the input source too: the release is the thing latch is about.
      await kit.set(aid, { 'Arp.latch': true });
      await kit.settle(250);
      for (const n of [62, 65, 69]) await sendMidi(midiOff(7, n));
      led.check(A, "latch (true) over source 'input'", 'a latched arpeggiator keeps the last held keys after they are released',
        true, (await arpNotes(1100)).length >= 4);
      await kit.set(aid, { 'Arp.latch': false });
      await kit.settle(300);
      led.check(A, "latch (false) over source 'input'", 'and unlatching lets the silence through',
        0, (await arpNotes(1000)).length);
      await kit.set(aid, { 'Arp.running': false });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // CONSTELLATION syncToTransport / wanderBars — the shared clock running, and then stopped.
  // =============================================================================================
  await kit.fresh();
  {
    const C = 'Constellation';
    const cid = await kit.make(C, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 360, 'Transform.height': 300, 'Constellation.running': true,
      'Constellation.syncToTransport': true, 'Constellation.wanderBars': 1,
      'Constellation.wanderRate': 0.08 });
    await kit.preview(true);
    const clock = async (run) => {
      await kit.page.evaluate(async (go) => {
        const { startTransport, stopTransport, rewindTransport, setTransportBpm } = await import('/src/CE_Application/stores/transport.js');
        setTransportBpm(240);
        if (go) { rewindTransport(); startTransport(); } else stopTransport();
      }, run);
      await kit.settle(260);
    };
    /**
     * WHERE THE PROBE IS DRAWN, not what the fan-out map says.
     *
     * `kit.ports` reads `controlPortValues` on the DOCUMENT control, and the wandering probe lives
     * on the RESOLVED one as `__probeX`/`__probeY` — the surface injects it for the renderer and
     * never writes it back. So the ports never move while the probe does, and the row asserting the
     * probe holds still while the transport is stopped passed for no reason at all. The probe's own
     * ring, r=7, is the thing on screen.
     */
    const probe = async () => {
      const ring = (await kit.geo(cid)).find((n) => n.tag === 'circle' && n.r === 7);
      return ring ? `${ring.cx.toFixed(2)},${ring.cy.toFixed(2)}` : null;
    };
    const probeMoves = async (ms) => {
      const before = await probe();
      await kit.settle(ms);
      const after = await probe();
      return { before, after, moved: before !== null && after !== null && before !== after };
    };

    await clock(false);
    await kit.settle(400);
    {
      const still = await probeMoves(900);
      led.check(C, 'syncToTransport (the clock is stopped)',
        'a synced constellation holds its probe dead still while the transport is stopped, however much its own wander rate says',
        { moved: false }, { moved: still.moved });
      await clock(true);
      const moving = await probeMoves(900);
      led.check(C, 'syncToTransport (running)', 'and starts wandering the moment the shared clock does',
        { moved: true }, { moved: moving.moved });
      await clock(false);
      await kit.settle(500);
      const frozen = await probeMoves(900);
      led.check(C, 'syncToTransport (stopped again)', 'and freezes again when it stops — the position held, not reset',
        { moved: false }, { moved: frozen.moved });
    }

    // --- wanderBars: how long one lap takes ------------------------------------------------------------
    {
      /**
       * HOW FAR THE PROBE TRAVELS, not how many places it visited.
       *
       * The first version counted distinct sampled positions, which cannot tell the two apart: the
       * wander is continuous, so twenty-seven samples give twenty-seven distinct positions whatever
       * the cycle length is. What a shorter cycle actually means is a FASTER probe — the same path
       * covered more times in the same seconds — so the measurement is the distance it covered.
       */
      const travelIn = async (bars, ms) => {
        await clock(false);
        await kit.set(cid, { 'Constellation.wanderBars': bars });
        await kit.settle(300);
        await clock(true);
        const path = [];
        const start = Date.now();
        while (Date.now() - start < ms) {
          const at = await probe();
          if (at) path.push(at.split(',').map(Number));
          await kit.settle(100);
        }
        await clock(false);
        return path.slice(1).reduce((sum, q, i) =>
          sum + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0);
      };
      // One bar of four beats at 240bpm is one second, so a one-bar cycle goes round three times in
      // three seconds where a four-bar one manages three quarters of a lap.
      const fast = await travelIn(1, 3000);
      const slow = await travelIn(4, 3000);
      led.check(C, 'wanderBars', 'a one-bar wander covers about four times the ground a four-bar one does in the same three seconds',
        true, slow > 20 && fast > slow * 2.2 && fast < slow * 6);
      await kit.set(cid, { 'Constellation.syncToTransport': false, 'Constellation.running': false });
      await clock(false);
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // KINETIC physics — read from visible motion over time rather than from the integrator's map.
  // =============================================================================================
  await kit.fresh();
  {
    const K = 'Kinetic';
    const KBASE = { 'Transform.x': 40, 'Transform.y': 60, 'Transform.width': 360,
      'Transform.height': 300, 'Kinetic.running': false, 'Kinetic.syncToTransport': false,
      'Kinetic.gravity': 0, 'Kinetic.restitution': 0.92, 'Kinetic.friction': 0.04,
      'Kinetic.keepAlive': 0, 'Kinetic.showTrail': false };
    let kid = await kit.make(K, KBASE);
    await kit.preview(true);
    await kit.settle(250);
    /**
     * A BALL THAT HAS NOT BEEN THROWN YET, which is the only way to set a starting state.
     *
     * `kineticInitial` reads `cfg.__state` before `cfg.initial`, and `__state` is injected from
     * `kineticStateMap[id]` — a module map inside the surface that the document cannot reach. So
     * writing `Kinetic.initial` on a control that has already run changes nothing at all: the ball
     * carries on from wherever it was. Every scenario below therefore starts a new control, which
     * has no entry in that map. The same shape as the Recorder's live take, and it cost a row there
     * too before it was understood here.
     */
    const freshKinetic = async (patch = {}) => {
      await kit.page.evaluate(async (id) => {
        const { removeControl } = await import('/src/CE_Application/stores/controls.js');
        removeControl(id);
      }, kid);
      await kit.settle(200);
      kid = await kit.make(K, { ...KBASE, ...patch });
      await kit.settle(350);
      return kid;
    };
    /** The ball's position, off the drawing: the one circle the renderer draws for it. */
    const ball = async () => {
      const c = (await kit.geo(kid)).filter((n) => n.tag === 'circle' && n.r >= 4)
        .sort((a, b) => b.r - a.r)[0];
      return c ? { x: c.cx, y: c.cy } : null;
    };
    /** Watch the ball for a window and report the path it took. */
    const track = async (ms, every = 70) => {
      const path = [];
      const start = Date.now();
      while (Date.now() - start < ms) { const p = await ball(); if (p) path.push(p); await kit.settle(every); }
      return path;
    };
    const travel = (path) => path.slice(1).reduce((sum, p, i) =>
      sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);

    // --- running: the ball moves at all ------------------------------------------------------------
    {
      await freshKinetic();
      const still = await track(700);
      await kit.set(kid, { 'Kinetic.running': true });
      const moving = await track(900);
      led.check(K, 'running', 'a stopped ball sits where it is and a running one travels',
        { stopped: true, running: true },
        { stopped: travel(still) < 2, running: travel(moving) > 20 });
    }

    // --- gravity: which way it falls ------------------------------------------------------------------
    {
      const meanFall = async (g) => {
        await freshKinetic({ 'Kinetic.gravity': g,
          'Kinetic.initial': { x: 0.5, y: 0.2, vx: 0.05, vy: 0 } });
        await kit.set(kid, { 'Kinetic.running': true });
        const path = await track(1100);
        await kit.set(kid, { 'Kinetic.running': false });
        if (path.length < 4) return null;
        return path[path.length - 1].y - path[0].y;      // screen y grows downward
      };
      const none = await meanFall(0);
      const pulled = await meanFall(3);
      led.check(K, 'gravity', 'with gravity on the ball ends up lower than it started, and with none it does not — measured as the distance fallen on screen, not as a number in a map',
        true, none !== null && pulled !== null && pulled > 25 && pulled > none + 20);
      await kit.set(kid, { 'Kinetic.gravity': 0 });
    }

    // --- friction: how fast it gives up ------------------------------------------------------------------
    {
      const lateSpeed = async (friction) => {
        await freshKinetic({ 'Kinetic.friction': friction, 'Kinetic.keepAlive': 0,
          'Kinetic.gravity': 0, 'Kinetic.initial': { x: 0.5, y: 0.5, vx: 0.9, vy: 0.35 } });
        await kit.set(kid, { 'Kinetic.running': true });
        const path = await track(2000);
        await kit.set(kid, { 'Kinetic.running': false });
        const half = Math.floor(path.length / 2);
        return { early: travel(path.slice(0, half)), late: travel(path.slice(half)) };
      };
      const slippy = await lateSpeed(0.02);
      const draggy = await lateSpeed(2.5);
      led.check(K, 'friction', 'heavy drag costs the ball most of its travel over the same two seconds, where light drag keeps it going',
        true, slippy.late > 20 && draggy.late < slippy.late * 0.6);
      led.check(K, 'friction (it decays rather than stopping dead)',
        'and the heavy-drag ball still covers more ground in the first half than the second',
        true, draggy.early > draggy.late);
      await kit.set(kid, { 'Kinetic.friction': 0.04 });
    }

    // --- keepAlive: the re-kick when it stalls -----------------------------------------------------------
    {
      const stillAfter = async (keepAlive) => {
        await freshKinetic({ 'Kinetic.friction': 3, 'Kinetic.gravity': 0,
          'Kinetic.keepAlive': keepAlive, 'Kinetic.initial': { x: 0.5, y: 0.5, vx: 0.5, vy: 0.2 } });
        await kit.set(kid, { 'Kinetic.running': true });
        await kit.settle(1400);                            // let the drag do its work
        const late = await track(1200);
        await kit.set(kid, { 'Kinetic.running': false });
        return travel(late);
      };
      const dead = await stillAfter(0);
      const kicked = await stillAfter(1);
      led.check(K, 'keepAlive', 'a ball with no keep-alive has stopped by the time the drag has had its way, and one with it is still moving',
        true, dead < 12 && kicked > dead * 2.5);
      await kit.set(kid, { 'Kinetic.keepAlive': 0.35, 'Kinetic.friction': 0.04 });
    }

    // --- restitution: how much a wall costs it -------------------------------------------------------------
    {
      // Fired straight down at a wall with no gravity and no drag, the only thing that changes the
      // speed is the bounce. A lossy wall leaves it crawling; a perfect one leaves it going.
      const afterBounce = async (restitution) => {
        await freshKinetic({ 'Kinetic.gravity': 0, 'Kinetic.friction': 0, 'Kinetic.keepAlive': 0,
          'Kinetic.restitution': restitution,
          'Kinetic.initial': { x: 0.5, y: 0.15, vx: 0, vy: 0.9 } });
        await kit.set(kid, { 'Kinetic.running': true });
        await kit.settle(1500);                            // long enough to have hit a wall
        const late = await track(1000);
        await kit.set(kid, { 'Kinetic.running': false });
        return travel(late);
      };
      const lossy = await afterBounce(0.05);
      const springy = await afterBounce(1);
      led.check(K, 'restitution', 'a wall that keeps none of the energy leaves the ball barely moving after it hits, where one that keeps all of it does not slow it at all',
        true, springy > 30 && lossy < springy * 0.5);
      await kit.set(kid, { 'Kinetic.restitution': 0.92, 'Kinetic.friction': 0.04,
        'Kinetic.keepAlive': 0.35 });
    }

    // --- showTrail ------------------------------------------------------------------------------------------
    {
      // A COMET OF DOTS, not a stroked path. The renderer draws one fading circle per remembered
      // position, so looking for a <path> or a <polyline> found nothing whether the trail was on or
      // off — a row that could only ever have reported "no difference". And counting every circle
      // does not work either: the ball is three of them on its own (halo, body, specular) whatever
      // the trail is doing. So paint the trail a colour nothing else in the drawing uses, and count
      // the circles wearing it.
      const TRAIL = 'ff00e5';
      const dots = async () => (await kit.shapes(kid, 'circle',
        (n) => String(n.fill).replace(/\s/g, '') === 'rgba(255,0,229,1)')).length;
      const balls = async () => (await kit.shapes(kid, 'circle')).length;
      await freshKinetic({ 'Kinetic.showTrail': false, 'Kinetic.trailColour': TRAIL,
        'Kinetic.keepAlive': 0.35 });
      await kit.set(kid, { 'Kinetic.running': true });
      await kit.settle(900);
      const withoutDots = await dots();
      const withoutAll = await balls();
      await kit.set(kid, { 'Kinetic.showTrail': true });
      await kit.settle(900);
      const withDots = await dots();
      await kit.set(kid, { 'Kinetic.running': false });
      led.check(K, 'showTrail', 'a running ball leaves a comet of fading dots behind it when asked, and nothing but the ball itself when not',
        { off: 0, on: true }, { off: withoutDots, on: withDots >= 6 });
      led.check(K, 'showTrail (the ball is still drawn either way)',
        'turning the trail off takes the comet and leaves the ball — three circles of it, halo, body and highlight',
        3, withoutAll);
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // ENVELOPE phaseSourceId / ROUTER sourceControlId — a second control on the panel, really dragged.
  // =============================================================================================
  await kit.fresh();
  {
    /**
     * A SLIDER RATHER THAN A KNOB, and the reason is worth writing down.
     *
     * Both are range controls and either will drive these links. But a knob's preview gesture is
     * ANGULAR — the value is the pointer's bearing around its centre — so a drag straight up lands
     * on the middle of the sweep and one straight down on the end of it, and a 60px drag and a
     * 220px drag in the same direction give the same answer. Neither is a number you can name in
     * advance, so a row built on one could only ever have said "it moved". A slider is linear: a
     * press at a fraction of its width IS that fraction, which is what lets the two followers be
     * checked against arithmetic instead.
     */
    // KEEP THE SLIDER HIGH ON THE CANVAS. Below roughly 760px of viewport the editor's own chrome
    // sits over the canvas, and a press there lands on the chrome instead: the slider does not move,
    // the followers do not move, and the row reads as a dead link rather than as a missed target.
    // It cost a run here before it was understood.
    const src = await kit.make('Slider', { 'Transform.x': 60, 'Transform.y': 300,
      'Transform.width': 260, 'Transform.height': 40, 'Core.name': 'Phase' });
    const env = await kit.make('Envelope', { 'Transform.x': 380, 'Transform.y': 40,
      'Transform.width': 360, 'Transform.height': 200, 'Envelope.showPlayhead': true,
      'Envelope.phase': 0.5, 'Envelope.phaseSourceId': src });
    const rt = await kit.make('Router', { 'Transform.x': 380, 'Transform.y': 280,
      'Transform.width': 400, 'Transform.height': 200, 'Router.source': 'link',
      'Router.sourceControlId': src, 'Router.testInput': 0.25, 'Router.deadzone': 0,
      'Router.invert': false });
    await kit.preview(true);
    await kit.settle(400);
    const sbox = await kit.box(src);
    /** Drive the named slider to a fraction of its travel, with a real press and drag. */
    const drive = async (fx) => {
      const y = sbox.y + sbox.h / 2;
      await kit.drag({ x: sbox.x + sbox.w * 0.5, y }, { x: sbox.x + sbox.w * fx, y });
      await kit.settle(260);
    };
    // The playhead is the one line the envelope draws at opacity 0.5; the grid lines carry none and
    // the sustain marker is the sustain colour.
    const head = async () => {
      const l = await kit.shapes(env, 'line', (n) => n.opacity === '0.5');
      return l.length ? l[l.length - 1].x1 : null;
    };
    // The plot the playhead travels across, read off the drawing rather than assumed. The envelope
    // draws NO field rect — the plot is implied by what sits in it — so the span comes from a
    // horizontal grid line, which the renderer runs from one edge of the plot to the other.
    const plot = async () => {
      const g = (await kit.shapes(env, 'line', (n) => n.y1 === n.y2))[0];
      return { x: g.x1, width: g.x2 - g.x1 };
    };
    // The router's live input bar: the filled one of the two rounded rects in its header.
    const bar = async () => {
      const r = await kit.shapes(rt, 'rect', (n) => n.rx === 8);
      return r.length > 1 ? { fill: r[1].width, well: r[0].width } : null;
    };

    // --- Envelope.phaseSourceId ------------------------------------------------------------------
    {
      const field = await plot();
      const at = async (fx) => { await drive(fx); return head(); };
      const lo = await at(0.1);
      const mid = await at(0.5);
      const hi = await at(0.9);
      const near = (got, want) => got !== null && Math.abs(got - want) < 2;
      led.check('Envelope', 'phaseSourceId',
        'the envelope follows the control it names: the slider a tenth along puts the playhead a tenth of the way across the plot, and nine tenths puts it nine tenths',
        { lo: true, mid: true, hi: true },
        { lo: near(lo, field.x + field.width * 0.1),
          mid: near(mid, field.x + field.width * 0.5),
          hi: near(hi, field.x + field.width * 0.9) });
    }

    // --- Envelope.phaseSourceId (naming nothing) -------------------------------------------------
    {
      await kit.set(env, { 'Envelope.phaseSourceId': '' });
      await kit.settle(250);
      const field = await plot();
      await drive(0.15);
      const parked = await head();
      await drive(0.85);
      const stillParked = await head();
      led.check('Envelope', 'phaseSourceId (naming nothing)',
        'an envelope that names no source parks its playhead on the phase the author wrote and ignores the slider entirely',
        { onAuthoredPhase: true, unmoved: true },
        { onAuthoredPhase: Math.abs(parked - (field.x + field.width * 0.5)) < 2,
          unmoved: parked === stillParked });
      await kit.set(env, { 'Envelope.phaseSourceId': src });
      await kit.settle(200);
    }

    // --- Router.sourceControlId ------------------------------------------------------------------
    {
      const at = async (fx) => { await drive(fx); return bar(); };
      const lo = await at(0.1);
      const hi = await at(0.9);
      const near = (got, want) => got !== null && Math.abs(got - want) < 1.5;
      led.check('Router', 'sourceControlId',
        "a router sourced from 'link' fills its live input bar to exactly where the control it names is standing",
        { lo: true, hi: true },
        { lo: near(lo.fill, lo.well * 0.1), hi: near(hi.fill, hi.well * 0.9) });
    }

    // --- Router.sourceControlId (a source that is not 'link') ------------------------------------
    {
      // The controller has never been seen in this run, so the router falls back to its test input —
      // which is the point: the link is only consulted when the source asks for it.
      await kit.set(rt, { 'Router.source': 'modwheel' });
      await kit.settle(250);
      await drive(0.9);
      const held = await bar();
      led.check('Router', "sourceControlId (source is not 'link')",
        'switching the source away from the link drops the slider and leaves the router on its test input, however far the slider is pushed',
        true, Math.abs(held.fill - held.well * 0.25) < 1.5);
      await kit.set(rt, { 'Router.source': 'link' });
      await kit.settle(200);
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // ORBIT showTrails — the comet behind each satellite.
  // =============================================================================================
  await kit.fresh();
  {
    /**
     * THE ORBIT'S TRAIL IS NOT A RECORDING. The ledger used to say the trails could not be pinned
     * down because "the trail only exists while the clock runs, so its shape is a moving target".
     * That is wrong about this renderer: it derives each trail dot from the CURRENT phase by
     * winding the satellite back along its own path, so a stopped orbit draws exactly the same
     * comet, and it can be counted at leisure. (The Kinetic's trail really is a recording — a map
     * of where the ball has been — which is why that one is measured while it runs.)
     */
    const O = 'Orbit';
    const COMET = 'FFEE00CC';                 // a colour nothing else in the drawing uses
    const oid = await kit.make(O, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 360, 'Transform.height': 300, 'Orbit.running': false,
      'Orbit.phase': 0.3, 'Orbit.showTrails': false, 'Orbit.showSpokes': false,
      'Orbit.showRings': false, 'Orbit.showValues': false,
      'Orbit.nodes': [{ id: 'n0', label: 'Node 1', radius: 0.8, angle: 90, ratio: 1,
        output: 'y', depth: 1, invert: false, enabled: true, colour: COMET }] });
    await kit.preview(true);
    await kit.settle(400);
    // The satellite itself is two circles of its own colour (halo + body); its highlight is white.
    // Everything else wearing this colour is trail.
    const inColour = async () => (await kit.shapes(oid, 'circle',
      (n) => String(n.fill).replace(/\s/g, '') === 'rgba(238,0,204,1)')).length;

    const off = await inColour();
    await kit.set(oid, { 'Orbit.showTrails': true });
    await kit.settle(300);
    const on = await inColour();
    led.check(O, 'showTrails', 'a satellite drags a comet of its own colour behind it, and loses it when the trails are switched off',
      { off: 2, on: true }, { off, on: on >= off + 8 });

    // A satellite that is switched off has nothing to trail, trails or no trails.
    await kit.set(oid, { 'Orbit.nodes': [{ id: 'n0', label: 'Node 1', radius: 0.8, angle: 90,
      ratio: 1, output: 'y', depth: 1, invert: false, enabled: false, colour: COMET }] });
    await kit.settle(300);
    led.check(O, 'showTrails (a disabled satellite)',
      'and a satellite that is switched off drags nothing, however much the trails are asked for',
      0, await inColour());

    // The comet is BEHIND it: winding the phase on moves the whole comet with the satellite.
    await kit.set(oid, { 'Orbit.nodes': [{ id: 'n0', label: 'Node 1', radius: 0.8, angle: 90,
      ratio: 1, output: 'y', depth: 1, invert: false, enabled: true, colour: COMET }] });
    await kit.settle(300);
    const spread = async () => {
      const cs = await kit.shapes(oid, 'circle',
        (n) => String(n.fill).replace(/\s/g, '') === 'rgba(238,0,204,1)');
      const xs = cs.map((c) => c.cx);
      return { lo: Math.min(...xs), hi: Math.max(...xs), n: cs.length };
    };
    const early = await spread();
    await kit.set(oid, { 'Orbit.phase': 0.55 });
    await kit.settle(300);
    const later = await spread();
    led.check(O, 'showTrails (it follows the satellite)',
      'winding the orbit on carries the whole comet round with it rather than leaving it where it was',
      { sameLength: true, moved: true },
      { sameLength: early.n === later.n, moved: Math.abs(later.lo - early.lo) > 10 });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
