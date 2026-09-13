/**
 * behaviourClock.mjs — deep behavioural pass over the clock family: Transport and Panic.
 *
 * WHY A DIFFERENT TAP. Every other note component in this pass is measured through the note funnel,
 * because notes are what they make. These two make something the funnel cannot see: `sendNoteBytes`
 * publishes note-on and note-off and nothing else, so a Panic button's CC 120/123/121, its pitch
 * bend, and every byte of MIDI clock the Transport emits pass through it invisibly. Asserting
 * "the document says clockOut is true" about a control whose entire job is to put bytes on a wire
 * is exactly the shallow QA this pass exists to replace.
 *
 * So the measurement is taken at the wire: `kit.wire()` stands in a JUCE backend and keeps
 * everything handed to `triggerRawMidiAction`, which is the one door the product sends through.
 * The messages below are asserted as bytes — FA is start, FC is stop, F8 is a clock pulse, B0 78
 * is All Sound Off — against the MIDI spec, not against a restatement of the source.
 *
 * Run: node browser-checks/behaviourClock.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('clock');
const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const midiOn = (ch, note, vel = 100) => `${hx(0x90 + ch - 1)}${hx(note)}${hx(vel)}`;
const midiOff = (ch, note) => `${hx(0x80 + ch - 1)}${hx(note)}00`;
const sendMidi = async (hex) => {
  await kit.page.evaluate(async ({ hex }) => {
    const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
    latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
  }, { hex });
  await kit.settle(140);
};
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
};

try {
  // =============================================================================================
  // TRANSPORT — the master clock. What it emits on the wire, and what the face says about it.
  // =============================================================================================
  await kit.fresh();
  {
    const T = 'Transport';
    let tid = await kit.make(T, { 'Transform.x': 60, 'Transform.y': 140, 'Transform.width': 360, 'Transform.height': 64,
      'Transport.bpm': 120, 'Transport.source': 'internal', 'Transport.beatsPerBar': 4,
      'Transport.beatUnit': 4, 'Transport.runOnLoad': false, 'Transport.loopEnabled': false,
      'Transport.countInBars': 0, 'Transport.clockOut': false, 'Transport.clockDevice': '',
      'Transport.editable': true, 'Transport.showPosition': true, 'Transport.showTap': true,
      'Transport.swing': 0 });
    await kit.wire();
    await kit.preview(true);

    const stop = async () => {
      await kit.page.evaluate(async () => {
        const { stopTransport } = await import('/src/CE_Application/stores/transport.js');
        stopTransport();
      });
      await kit.settle(140);
    };
    const clockState = () => kit.page.evaluate(async () => {
      const { transport, transportBeatsNow, isTransportRunning } = await import('/src/CE_Application/stores/transport.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const t = get(transport);
      return { running: isTransportRunning(), beats: transportBeatsNow(), bpm: t.bpm,
        beatsPerBar: t.beatsPerBar, swing: t.swing, loopEnabled: t.loopEnabled,
        countingIn: t.countingIn, source: t.source };
    });
    /** Press the play button where a finger would, through the real preview surface. */
    const pressPlay = async () => {
      const box = await kit.box(tid);
      const geom = await kit.page.evaluate(async ({ w, h }) => {
        const { transportGeometry, transportButtonRect } = await import('/src/CE_Application/utils/transportLayout.js');
        return transportButtonRect(transportGeometry(w, h, 8));
      }, { w: box.w, h: box.h });
      await kit.click({ x: box.x + geom.x + geom.w / 2, y: box.y + geom.y + geom.h / 2 });
      await kit.settle(160);
    };

    // --- editable + the play button: a press starts the clock -----------------------------------
    {
      await stop();
      const before = await clockState();
      await pressPlay();
      const after = await clockState();
      led.check(T, 'editable + the play button', 'pressing the button on the face starts the master clock',
        { was: false, now: true }, { was: before.running, now: after.running });
      await kit.settle(400);
      const later = await clockState();
      led.check(T, 'bpm (120 = two beats a second)', 'the position advances at the configured tempo',
        true, later.beats > after.beats + 0.5 && later.beats < after.beats + 1.6);
      await pressPlay();
      led.check(T, 'the play button (again)', 'a second press stops it', false, (await clockState()).running);
    }

    // --- bpm: the position advances faster ------------------------------------------------------
    {
      const travelled = async (bpm) => {
        await stop();
        await kit.set(tid, { 'Transport.bpm': bpm });
        await kit.settle(200);
        await pressPlay();
        const a = (await clockState()).beats;
        await kit.settle(800);
        const b = (await clockState()).beats;
        await pressPlay();
        return b - a;
      };
      const slow = await travelled(60);
      const fast = await travelled(180);
      led.check(T, 'bpm', 'trebling the tempo covers about three times the musical distance in the same second',
        true, slow > 0.5 && fast > slow * 2.2 && fast < slow * 3.8);
      await kit.set(tid, { 'Transport.bpm': 120 });
      led.check(T, 'bpm (the readout)', 'and the face says so to one decimal',
        true, (await kit.texts(tid)).includes('120.0'));
      await kit.set(tid, { 'Transport.bpm': 96.5 });
      led.check(T, 'bpm (the readout follows)', 'a changed tempo is on the face',
        true, (await kit.texts(tid)).includes('96.5'));
      await kit.set(tid, { 'Transport.bpm': 120 });
    }

    // --- beatsPerBar / beatUnit: the meter reaches the store AND the readout ---------------------
    {
      await kit.set(tid, { 'Transport.beatsPerBar': 4, 'Transport.beatUnit': 4 });
      await kit.settle(160);
      led.check(T, 'beatsPerBar / beatUnit (the label)', 'the meter is written on the face',
        true, (await kit.texts(tid)).some((t) => t.includes('BPM · 4/4')));
      await kit.set(tid, { 'Transport.beatsPerBar': 3, 'Transport.beatUnit': 8 });
      await kit.settle(200);
      led.check(T, 'beatsPerBar / beatUnit (changed)', 'a waltz reads as one',
        true, (await kit.texts(tid)).some((t) => t.includes('BPM · 3/8')));
      led.check(T, 'beatsPerBar (reaches the clock)', 'and the store knows how long a bar is, which is what the bar-looping components ask',
        3, (await clockState()).beatsPerBar);
      await kit.set(tid, { 'Transport.beatsPerBar': 4, 'Transport.beatUnit': 4 });
    }

    // --- showPosition: the bar.beat.tick readout --------------------------------------------------
    {
      await stop();
      await kit.set(tid, { 'Transport.showPosition': true });
      const withPos = await kit.texts(tid);
      led.check(T, 'showPosition (true)', 'the bar.beat.tick readout is drawn, parked at the first bar',
        true, withPos.some((t) => /^\d+\.\d+\.\d+$/.test(t)));
      await kit.set(tid, { 'Transport.showPosition': false });
      led.check(T, 'showPosition (false)', 'and stops being drawn',
        false, (await kit.texts(tid)).some((t) => /^\d+\.\d+\.\d+$/.test(t)));
      await kit.set(tid, { 'Transport.showPosition': true });
    }

    // --- clockOut + clockDevice: REAL BYTES ON THE WIRE ---------------------------------------------
    {
      const rewind = async () => {
        await kit.page.evaluate(async () => {
          const { rewindTransport } = await import('/src/CE_Application/stores/transport.js');
          rewindTransport();
        });
        await kit.settle(140);
      };
      await stop();
      await rewind();
      await kit.set(tid, { 'Transport.clockOut': false, 'Transport.bpm': 120 });
      await kit.settle(200);
      await kit.forgetSent();
      await pressPlay();
      await kit.settle(500);
      const quiet = await kit.sent();
      await pressPlay();
      led.check(T, 'clockOut (false)', 'with clock out off the panel puts nothing on the wire at all',
        0, quiet.length);

      await kit.set(tid, { 'Transport.clockOut': true });
      await kit.settle(220);
      await stop();
      await rewind();
      await kit.forgetSent();
      await pressPlay();
      await kit.settle(600);
      const running = await kit.sent();
      await pressPlay();
      await kit.settle(200);
      const stopped = await kit.sent();
      const hexes = running.map((m) => m.hex);
      // 24 pulses per quarter at 120bpm is 48 a second; 600ms is ~29. The count is checked loosely
      // (a browser timer is not a hardware clock) but the ORDER is exact: start first, then clock.
      const pulses = hexes.filter((h) => h === 'F8').length;
      led.check(T, 'clockOut (true) — MIDI start from the top', 'starting AT BAR ONE puts FA on the wire before anything else',
        'FA', hexes[0]);
      led.check(T, 'clockOut (true) — 24 PPQN', 'and then a stream of F8 clock pulses, twenty-four to the quarter',
        true, pulses > 14 && pulses < 46);
      led.check(T, 'clockOut (true) — MIDI stop', 'and FC when it is stopped',
        'FC', stopped.filter((m) => m.hex === 'FC').length === 1 ? 'FC' : stopped.map((m) => m.hex).join(','));
      led.check(T, 'clockDevice (resolved)', 'every message is addressed to the one device the panel names',
        true, running.length > 0 && running.every((m) => m.role === 'mainSynth'));

      // STARTING FROM ANYWHERE ELSE IS NOT FA, and this is the case that makes the feature worth
      // having: FA from bar nine tells the follower to begin at bar one while we play from nine.
      // The product's answer is a song position followed by CONTINUE, and the position is checked
      // as a NUMBER — the 14-bit little-endian sixteenth count — against where the clock actually is.
      const parked = (await clockState()).beats;
      await kit.forgetSent();
      await pressPlay();
      await kit.settle(120);
      const resumed = await kit.sent();
      await pressPlay();
      await kit.settle(160);
      const spp = resumed.find((m) => m.status === 0xF0 && m.bytes[0] === 0xF2);
      const sixteenths = spp ? (spp.bytes[2] << 7) | spp.bytes[1] : null;
      led.check(T, 'clockOut — song position, then CONTINUE', 'resuming from bar nine sends where we are and FB, never FA',
        { first: 'F2', second: 'FB', anyStart: false },
        { first: resumed[0]?.hex?.slice(0, 2), second: resumed[1]?.hex,
          anyStart: resumed.some((m) => m.hex === 'FA') });
      led.check(T, 'clockOut — the position is the real one', 'and the sixteenth count is where the clock had actually got to, four to the quarter',
        true, sixteenths !== null && parked > 0.5
          && Math.abs(sixteenths - Math.round(parked * 4)) <= 2);
      await kit.set(tid, { 'Transport.clockOut': false });
      await stop();
      await rewind();
    }

    // --- countInBars: armed, not yet playing -----------------------------------------------------------
    {
      await stop();
      await kit.set(tid, { 'Transport.countInBars': 2, 'Transport.bpm': 200 });
      await kit.settle(200);
      await pressPlay();
      const armed = await clockState();
      led.check(T, 'countInBars (armed)', 'play starts a count-in rather than the music: counting, not yet running',
        { countingIn: true, running: false }, { countingIn: armed.countingIn, running: armed.running });
      led.check(T, 'countInBars (the readout counts down)', 'and the position readout becomes the countdown, with a minus sign',
        true, (await kit.texts(tid)).some((t) => t.startsWith('−')));
      // Two bars of 4 at 200bpm is 2.4s; the music starts after it.
      await kit.settle(2700);
      led.check(T, 'countInBars (then it plays)', 'when the count-in is over the clock is running',
        { countingIn: false, running: true }, (({ countingIn, running }) => ({ countingIn, running }))(await clockState()));
      await stop();
      await kit.set(tid, { 'Transport.countInBars': 0, 'Transport.bpm': 120 });
    }

    // --- loopEnabled / loopStartBar / loopLengthBars ------------------------------------------------------
    {
      await stop();
      await kit.set(tid, { 'Transport.loopEnabled': true, 'Transport.loopStartBar': 1,
        'Transport.loopLengthBars': 1, 'Transport.bpm': 240 });
      await kit.settle(220);
      led.check(T, 'loopEnabled (reaches the clock)', 'the store is told there is a loop, not just the face',
        true, (await clockState()).loopEnabled);
      led.check(T, 'loopEnabled (the face says the range)', 'and the range is written next to the meter',
        true, (await kit.texts(tid)).some((t) => t.includes('⟲')));
      await pressPlay();
      // One bar of 4 beats at 240bpm is one second. Sampled over three seconds the position can
      // never leave the first bar — THE POSITION FOLDING is the whole claim, and a loop that only
      // drew a marker would sail past 4.
      let highest = 0;
      for (let i = 0; i < 12; i += 1) { await kit.settle(250); highest = Math.max(highest, (await clockState()).beats); }
      await pressPlay();
      led.check(T, 'loopLengthBars (the position folds)', 'three seconds of a one-bar loop never leaves the first bar',
        true, highest > 0.3 && highest < 4);
      await kit.set(tid, { 'Transport.loopEnabled': false, 'Transport.bpm': 120 });
      await stop();
    }

    // --- swing: the clock owns it, and every synced follower inherits ---------------------------------------
    {
      await kit.set(tid, { 'Transport.swing': 0.5 });
      await kit.settle(200);
      led.check(T, 'swing', 'shuffle is set on the shared clock, which is where a follower reads it from',
        0.5, (await clockState()).swing);
      await kit.set(tid, { 'Transport.swing': 0 });
    }

    // --- source: following someone else's clock ---------------------------------------------------------------
    {
      await stop();
      await kit.set(tid, { 'Transport.source': 'external' });
      await kit.settle(240);
      led.check(T, "source 'external' (the clock is told)", 'the shared clock switches to following',
        'external', (await clockState()).source);
      led.check(T, "source 'external' (unlocked)", 'and the face says no clock has arrived yet rather than showing a frozen tempo',
        true, (await kit.texts(tid)).some((t) => t.includes('EXT · no clock')));
      // A real start + 24 pulses at a steady interval is a real external clock.
      await sendMidi('FA');
      for (let i = 0; i < 26; i += 1) { await sendMidi('F8'); }
      const followed = await clockState();
      led.check(T, "source 'external' (it follows)", 'incoming F8 pulses move the position and the clock reports running',
        true, followed.running === true && followed.beats > 0);
      led.check(T, "source 'external' (locked)", 'and the face stops saying "no clock"',
        false, (await kit.texts(tid)).some((t) => t.includes('no clock')));
      await sendMidi('FC');
      await kit.set(tid, { 'Transport.source': 'internal' });
      await kit.settle(200);
      await stop();
    }

    // --- runOnLoad ------------------------------------------------------------------------------------------------
    led.unverified(T, 'runOnLoad', 'start the clock as soon as the panel opens',
      'it fires once, on the transition into preview with the flag already set; the surface is already in '
      + 'preview by the time this check can set the flag, and reopening a panel is measured separately below');

    // --- showTap: tap tempo ------------------------------------------------------------------------------------------
    {
      await stop();
      const box = await kit.box(tid);
      /**
       * Five taps on the FACE, away from the play button, timed as they happen.
       *
       * THE INTERVAL IS MEASURED, NOT ASSUMED. A first version asked for "about 200bpm" from taps
       * it believed were 260ms apart; the pointer helper settles either side of each press, so the
       * real gap was around 410ms and the tempo it set — 146 — was correct arithmetic failing an
       * invented expectation. So the timestamps come back with the taps, and what is asserted is
       * the product's own claim: the tempo is 60000 divided by the MEAN gap.
       */
      const tapFive = async () => {
        const at = [];
        for (let i = 0; i < 5; i += 1) {
          await kit.click({ x: box.x + box.w - 30, y: box.y + box.h / 2 });
          at.push(Date.now());
          await kit.settle(180);
        }
        const gaps = at.slice(1).map((t, i) => t - at[i]);
        return 60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
      };
      await kit.set(tid, { 'Transport.showTap': true, 'Transport.bpm': 120 });
      const wanted = await tapFive();
      const tapped = Number(await kit.read(tid, 'Transport.bpm'));
      led.check(T, 'showTap (tap tempo)', 'tapping the face sets the tempo to the mean of the gaps between the taps',
        true, wanted > 60 && Math.abs(tapped - wanted) <= Math.max(4, wanted * 0.08));
      led.check(T, 'showTap (and the clock, not just the document)', 'the shared clock takes the tapped tempo too',
        true, Math.abs((await clockState()).bpm - tapped) < 1.5);
      await kit.set(tid, { 'Transport.showTap': false, 'Transport.bpm': 120 });
      await kit.settle(160);
      await tapFive();
      led.check(T, 'showTap (false)', 'with tap off the same taps leave the tempo alone',
        120, Number(await kit.read(tid, 'Transport.bpm')));
      await kit.set(tid, { 'Transport.showTap': true });
    }

    // --- editable false -------------------------------------------------------------------------------------------
    {
      await stop();
      await kit.set(tid, { 'Transport.editable': false });
      await pressPlay();
      led.check(T, 'editable (false)', 'a locked transport ignores the play button',
        false, (await clockState()).running);
      await kit.set(tid, { 'Transport.editable': true });
    }

    // --- the colours ----------------------------------------------------------------------------------------------
    {
      await stop();
      await kit.set(tid, { 'Transport.faceColour': 'FF203040', 'Transport.accentColour': 'FFEE5522',
        'Transport.labelColour': 'FF88CCFF' });
      await kit.settle(160);
      const g = await kit.geo(tid);
      led.check(T, 'faceColour', 'the face is painted in it',
        true, g.some((n) => n.tag === 'rect' && n.fill === rgba('FF203040')));
      led.check(T, 'accentColour (the stopped play triangle)', 'the play arrow takes the accent',
        true, g.some((n) => n.tag === 'path' && n.fill === rgba('FFEE5522')));
      led.check(T, 'labelColour', 'and the small label line',
        true, g.some((n) => n.tag === 'text' && n.fill === rgba('FF88CCFF')));
      await pressPlay();
      await kit.settle(160);
      const gr = await kit.geo(tid);
      led.check(T, 'accentColour (running)', 'and the button face itself once it is running',
        true, gr.some((n) => n.tag === 'rect' && n.fill === rgba('FFEE5522')));
      await pressPlay();
      await stop();
    }

    // --- save and reopen ------------------------------------------------------------------------------------------
    {
      await kit.set(tid, { 'Transport.bpm': 132, 'Transport.beatsPerBar': 3, 'Transport.swing': 0.25,
        'Transport.loopEnabled': true, 'Transport.loopStartBar': 2, 'Transport.loopLengthBars': 2 });
      await kit.settle(200);
      // PARK THE POSITION SOMEWHERE ELSE FIRST. The bar.beat.tick readout is the live clock, not a
      // saved setting, so it is the one thing on this face that must NOT come back — the same
      // distinction as the Arp's playhead. Comparing the whole face would ask a file to remember
      // where the music had got to, so the readout is lifted out of the shape comparison and
      // asserted the other way round.
      await pressPlay();
      await kit.settle(700);
      await pressPlay();
      const readout = (g) => g.find((n) => n.tag === 'text' && /^\d+\.\d+\.\d+$/.test(String(n.text ?? '')))?.text ?? null;
      const face = (g) => JSON.stringify(g.filter((n) => !(n.tag === 'text' && /^\d+\.\d+\.\d+$/.test(String(n.text ?? '')))));
      const before = await kit.geo(tid);
      const again = await kit.reopen(tid);          // reloads the page: the stub backend goes with it
      const after = await kit.geo(again);
      led.check(T, 'save/reopen (the face)', 'tempo, meter, loop range and every shape return identical',
        face(before), face(after));
      led.check(T, 'save/reopen (the position is not restored)',
        'the clock had run past the first bar before the save, and a reopened panel is back at the top',
        { hadMoved: true, reopened: '1.1.00' },
        { hadMoved: readout(before) !== '1.1.00', reopened: readout(after) });
      tid = again;
      await kit.preview(true);
      await kit.settle(300);
      led.check(T, 'save/reopen (the clock is reconfigured)', 'and the reopened panel configures the shared clock from the file',
        { bpm: 132, beatsPerBar: 3, swing: 0.25, loopEnabled: true },
        (({ bpm, beatsPerBar, swing, loopEnabled }) => ({ bpm, beatsPerBar, swing, loopEnabled }))(await clockState()));
      await stop();
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // TRANSPORT, NESTED AND AUTOMATED. Two ways the clock reaches its settings that a check on a
  // bare top-level control cannot see, both raised in review of the effect that replaced the
  // render-path write.
  // =============================================================================================
  await kit.fresh();
  {
    const T = 'Transport';
    const clockState = () => kit.page.evaluate(async () => {
      const { transport } = await import('/src/CE_Application/stores/transport.js');
      const get = (st) => { let v; st.subscribe((x) => { v = x; })(); return v; };
      const t = get(transport);
      return { bpm: t.bpm, beatsPerBar: t.beatsPerBar, swing: t.swing, loopEnabled: t.loopEnabled, source: t.source };
    });
    const inner = await kit.make(T, { 'Transform.x': 60, 'Transform.y': 140,
      'Transform.width': 340, 'Transform.height': 60, 'Transport.bpm': 144,
      'Transport.beatsPerBar': 5, 'Transport.swing': 0.375, 'Transport.loopEnabled': true,
      'Transport.loopStartBar': 3, 'Transport.loopLengthBars': 2, 'Transport.source': 'internal' });
    // Group it, through the editor's own action rather than by hand-building a tree.
    const containerId = await kit.page.evaluate(async (id) => {
      const { groupSelectionIntoContainer } = await import('/src/CE_Application/stores/controls.js');
      const { selectComponent } = await import('/src/CE_Application/stores/panels.js');
      selectComponent(id);
      return groupSelectionIntoContainer(12)?._children?.Core?.id ?? '';
    }, inner);
    await kit.settle(300);
    const nesting = await kit.page.evaluate(async ({ inner, containerId }) => {
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const get = (st) => { let v; st.subscribe((x) => { v = x; })(); return v; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const top = (live?.controls ?? []).map((c) => c._children.Core.id);
      const container = (live?.controls ?? []).find((c) => c._children.Core.id === containerId);
      const kids = Object.keys(container?._children?.Children?._children ?? {});
      return { topLevel: top.includes(inner), childOfTheContainer: kids.includes(inner) };
    }, { inner, containerId });
    led.check(T, 'nested (the fixture really is nested)', 'the transport is a CHILD of the container, not a sibling of it',
      { topLevel: false, childOfTheContainer: true }, nesting);

    await kit.preview(true);
    await kit.settle(500);
    led.check(T, 'nested (the clock is configured from inside a container)',
      'a transport in a Group configures the shared clock exactly as a top-level one does',
      { bpm: 144, beatsPerBar: 5, swing: 0.375, loopEnabled: true },
      (({ bpm, beatsPerBar, swing, loopEnabled }) => ({ bpm, beatsPerBar, swing, loopEnabled }))(await clockState()));
    await kit.set(inner, { 'Transport.bpm': 96 });
    await kit.settle(400);
    led.check(T, 'nested (an edit still reaches the clock)', 'changing the tempo of a nested transport re-tempos the clock',
      96, (await clockState()).bpm);
    led.check(T, 'nested (and the canvas survives the edit)', 'and the surface is still rendering afterwards',
      true, (await kit.box(inner)) !== null);
    await kit.set(inner, { 'Transport.source': 'external' });
    await kit.settle(400);
    led.check(T, 'nested (source)', 'and switching a nested transport to follow an external clock switches the shared one',
      'external', (await clockState()).source);
    await kit.set(inner, { 'Transport.source': 'internal', 'Transport.bpm': 144 });
    await kit.settle(300);

    // --- sectionValues: a host parameter automating the tempo -------------------------------------
    // The chain handed the value source the RESOLVED control, so a DAW automating `Transport.bpm`
    // reached the clock through the session's `sectionValues` overlay without the document ever
    // changing. Reading the raw document control would drop that silently — the parameter would
    // appear in the host, move, and do nothing.
    {
      await kit.page.evaluate(async (id) => {
        const { updatePanelPreviewSession } = await import('/src/CE_Application/stores/interactionPreview.js');
        updatePanelPreviewSession(id, { sectionValues: { Transport: { bpm: 177 } } });
      }, inner);
      await kit.settle(500);
      led.check(T, 'sectionValues (host automation of the tempo)',
        'an automated bpm overlaid on the session reaches the clock, with the document untouched',
        { clock: 177, document: 144 },
        { clock: (await clockState()).bpm, document: Number(await kit.read(inner, 'Transport.bpm')) });
      led.check(T, 'sectionValues (and the face shows it)', 'and the readout is the automated tempo, not the stored one',
        true, (await kit.texts(inner)).includes('177.0'));
      await kit.page.evaluate(async (id) => {
        const { updatePanelPreviewSession } = await import('/src/CE_Application/stores/interactionPreview.js');
        updatePanelPreviewSession(id, { sectionValues: undefined });
      }, inner);
      await kit.settle(400);
      led.check(T, 'sectionValues (released)', 'and letting the automation go returns the clock to the stored tempo',
        144, (await clockState()).bpm);
    }
    await kit.page.evaluate(async () => {
      const { stopTransport } = await import('/src/CE_Application/stores/transport.js');
      stopTransport();
    });
  }
  await kit.preview(false);

  // =============================================================================================
  // NESTED COMPONENTS — the same fault as the Transport's, across the families that sweep the
  // panel for themselves. A component inside a Group renders perfectly and does nothing, which is
  // the hardest kind of broken to notice: the lane is drawn, the playhead lights, no error appears.
  // =============================================================================================
  {
    /** Put a control inside a Container through the editor's own grouping action. */
    const nest = async (id) => {
      await kit.preview(false);
      const containerId = await kit.page.evaluate(async (cid) => {
        const { groupSelectionIntoContainer } = await import('/src/CE_Application/stores/controls.js');
        const { selectComponent } = await import('/src/CE_Application/stores/panels.js');
        selectComponent(cid);
        return groupSelectionIntoContainer(12)?._children?.Core?.id ?? '';
      }, id);
      await kit.settle(300);
      const nested = await kit.page.evaluate(async ({ id, containerId }) => {
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (st) => { let v; st.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const container = (live?.controls ?? []).find((c) => c._children.Core.id === containerId);
        return Object.keys(container?._children?.Children?._children ?? {}).includes(id);
      }, { id, containerId });
      await kit.preview(true);
      await kit.settle(300);
      return nested;
    };

    // --- a nested Arp still plays -------------------------------------------------------------
    await kit.fresh();
    {
      const aid = await kit.make('Arp', { 'Transform.x': 60, 'Transform.y': 140,
        'Transform.width': 420, 'Transform.height': 200, 'Arp.running': false, 'Arp.rate': 8,
        'Arp.pattern': 'up', 'Arp.channel': 1, 'Arp.velocity': 90 });
      await kit.preview(true);
      const run = async () => {
        await kit.forget();
        await kit.set(aid, { 'Arp.running': true });
        await kit.settle(1200);
        await kit.set(aid, { 'Arp.running': false });
        await kit.settle(200);
        return (await kit.notes()).filter((e) => e.kind === 'on').length;
      };
      const flat = await run();
      const isNested = await nest(aid);
      const inside = await run();
      led.check('Nested', 'Arp (the fixture really is nested)', 'the arp is a child of the container',
        true, isNested);
      led.check('Nested', 'Arp (it still plays)',
        'an arpeggiator inside a Group plays the same number of notes as one on the canvas — it used to draw its lane, light its playhead and emit nothing',
        true, flat >= 6 && Math.abs(inside - flat) <= 3);
      led.check('Nested', 'Arp (it is still on screen)', 'and is still drawn where it was',
        true, (await kit.box(aid)) !== null);
    }
    await kit.preview(false);

    // --- a nested Step Sequencer still plays --------------------------------------------------------
    await kit.fresh();
    {
      const sid = await kit.make('StepSequencer', { 'Transform.x': 60, 'Transform.y': 140,
        'Transform.width': 520, 'Transform.height': 170, 'StepSequencer.steps': 4,
        // 1/16 at 240bpm is a step every 62.5ms, so a 1.2s window holds nineteen steps and the
        // two lit cells fire nine or ten times. At 1/4 the same window held under three fires,
        // which is too few to tell "nested and silent" from "nested and sampled awkwardly".
        'StepSequencer.bpm': 240, 'StepSequencer.division': '1/16', 'StepSequencer.running': false,
        'StepSequencer.pattern': { 't0:0': { on: true, velocity: 100 }, 't1:2': { on: true, velocity: 100 } } });
      await kit.preview(true);
      const run = async () => {
        await kit.forget();
        await kit.set(sid, { 'StepSequencer.running': true });
        await kit.settle(1200);
        await kit.set(sid, { 'StepSequencer.running': false });
        await kit.settle(200);
        return (await kit.notes()).filter((e) => e.kind === 'on').length;
      };
      const flat = await run();
      const isNested = await nest(sid);
      const inside = await run();
      led.check('Nested', 'StepSequencer (it still plays)',
        'a sequencer inside a Group walks its grid and sounds its cells',
        true, isNested && flat >= 6 && Math.abs(inside - flat) <= 3);
    }
    await kit.preview(false);

    // --- a nested Looper still runs its clock ----------------------------------------------------------
    await kit.fresh();
    {
      const lid = await kit.make('Looper', { 'Transform.x': 60, 'Transform.y': 140,
        'Transform.width': 420, 'Transform.height': 180, 'Looper.running': true,
        'Looper.loopSeconds': 2, 'Looper.showPlayhead': true, 'Looper.phase': 0,
        'Looper.lanes': [{ id: 'g0', label: 'A', points: [{ t: 0, v: 0 }, { t: 1, v: 1 }], rest: 0, enabled: true }] });
      await kit.preview(true);
      const isNested = await nest(lid);
      const headX = async () => (await kit.geo(lid)).find((n) => n.tag === 'line' && n['stroke-width'] === 1.5)?.x1 ?? null;
      const a = await headX();
      await kit.settle(700);
      const b = await headX();
      led.check('Nested', 'Looper (its clock still runs)',
        'a looper inside a Group sweeps its playhead rather than freezing at the phase it was saved with',
        true, isNested && a !== null && b !== null && Math.abs(b - a) > 30);
      await kit.set(lid, { 'Looper.running': false });
    }
    await kit.preview(false);

    // --- Panic still silences a nested note control --------------------------------------------------------
    await kit.fresh();
    {
      const cid = await kit.make('ChordPad', { 'Transform.x': 60, 'Transform.y': 300,
        'Transform.width': 300, 'Transform.height': 160, 'ChordPad.layout': 'grid',
        'ChordPad.channel': 3, 'ChordPad.latch': true });
      const pid = await kit.make('Panic', { 'Transform.x': 60, 'Transform.y': 140,
        'Transform.width': 180, 'Transform.height': 56, 'Panic.clearLocal': true, 'Panic.editable': true });
      const isNested = await nest(cid);
      const padBox = await kit.box(cid);
      await kit.click({ x: padBox.x + padBox.w * 0.2, y: padBox.y + padBox.h * 0.6 });
      await kit.settle(240);
      const held = (await kit.session(cid))?.chordNotes ?? [];
      await kit.forget();
      const panicBox = await kit.box(pid);
      await kit.click({ x: panicBox.x + panicBox.w / 2, y: panicBox.y + panicBox.h / 2 });
      await kit.settle(260);
      const offs = (await kit.notes()).filter((e) => e.kind === 'off');
      led.check('Nested', 'Panic (it silences a nested note control)',
        'a chord held by a pad inside a Group is released by the panic button — a panic that misses a control is the failure this button exists to prevent',
        { nested: true, wasHolding: true, released: true, stillHeld: 0 },
        { nested: isNested, wasHolding: held.length >= 3,
          released: held.length > 0 && held.every((n) => offs.some((e) => e.note === n)),
          stillHeld: ((await kit.session(cid))?.chordNotes ?? []).length });
    }
    await kit.preview(false);
  }

  // =============================================================================================
  // PANIC — the button whose whole result is silence. Measured as the bytes it sends and the notes
  // it stops, not as the document property that was written.
  // =============================================================================================
  await kit.fresh();
  {
    const P = 'Panic';
    let pid = await kit.make(P, { 'Transform.x': 60, 'Transform.y': 140, 'Transform.width': 180, 'Transform.height': 56,
      'Panic.label': 'PANIC', 'Panic.scope': 'all', 'Panic.channel': 1,
      'Panic.resetControllers': true, 'Panic.centreBend': true, 'Panic.clearLocal': true,
      'Panic.showSummary': true, 'Panic.editable': true });
    await kit.wire();
    await kit.preview(true);

    const press = async () => {
      await kit.forgetSent();
      await kit.forget();
      const box = await kit.box(pid);
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
      await kit.settle(160);
      return kit.sent();
    };
    const ccs = (out) => out.filter((m) => m.status === 0xB0).map((m) => `${m.channel}:${m.data1}`);

    // --- scope 'all' + resetControllers + centreBend: the silence set, in the order that works ------
    {
      const out = await press();
      const ch1 = out.filter((m) => m.channel === 1);
      led.check(P, "scope 'all' (every channel)", 'all sixteen channels are silenced, not just the first',
        16, new Set(out.filter((m) => m.status === 0xB0).map((m) => m.channel)).size);
      led.check(P, 'the silence set, in order', 'CC 120 all-sound-off comes BEFORE CC 123 all-notes-off — 123 only lifts the keys, so on a long release you would still hear the tail',
        [120, 123, 121], ch1.filter((m) => m.status === 0xB0).map((m) => m.data1));
      led.check(P, 'centreBend (true)', 'and pitch bend is recentred: E0 00 40 is dead centre',
        [0xE0, 0x00, 0x40], (ch1.find((m) => m.status === 0xE0)?.bytes ?? []));
      await kit.set(pid, { 'Panic.resetControllers': false });
      led.check(P, 'resetControllers (false)', 'turning it off drops CC 121 and leaves the two that silence',
        [120, 123], (await press()).filter((m) => m.channel === 1 && m.status === 0xB0).map((m) => m.data1));
      await kit.set(pid, { 'Panic.centreBend': false });
      led.check(P, 'centreBend (false)', 'and turning bend off leaves no bend message at all',
        0, (await press()).filter((m) => m.status === 0xE0).length);
      await kit.set(pid, { 'Panic.resetControllers': true, 'Panic.centreBend': true });
    }

    // --- scope 'channel' + channel ---------------------------------------------------------------------
    {
      await kit.set(pid, { 'Panic.scope': 'channel', 'Panic.channel': 7 });
      const out = await press();
      led.check(P, "scope 'channel' + channel", 'a narrowed button silences exactly the one channel it names',
        ['7:120', '7:123', '7:121'], ccs(out));
      await kit.set(pid, { 'Panic.scope': 'all', 'Panic.channel': 1 });
    }

    // --- clearLocal: the notes THIS PANEL is holding ------------------------------------------------------
    {
      // A Chord Pad holding a chord is a real held note the panel itself owns. Panic has to release
      // it as well as telling the synth — the button that only sends CC leaves the panel's own
      // bookkeeping full of notes it thinks are still down.
      const cid = await kit.make('ChordPad', { 'Transform.x': 60, 'Transform.y': 260,
        'Transform.width': 300, 'Transform.height': 160, 'ChordPad.layout': 'grid',
        'ChordPad.channel': 3, 'ChordPad.latch': true });
      await kit.settle(200);
      const held = async () => (await kit.session(cid))?.chordNotes ?? [];
      const padBox = await kit.box(cid);
      await kit.click({ x: padBox.x + padBox.w * 0.2, y: padBox.y + padBox.h * 0.6 });
      await kit.settle(200);
      const sounding = await held();
      led.check(P, 'clearLocal (a chord really is held first)', 'the fixture is a latched pad actually holding notes',
        true, sounding.length >= 3);
      await kit.set(pid, { 'Panic.clearLocal': true });
      await kit.forget();
      const box = await kit.box(pid);
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
      await kit.settle(200);
      const offs = (await kit.notes()).filter((e) => e.kind === 'off');
      led.check(P, 'clearLocal (true)', 'panic releases the panel’s own held notes, note-off by note-off, and empties the held set',
        { released: sounding.length, stillHeld: 0 },
        { released: offs.filter((e) => sounding.includes(e.note)).length, stillHeld: (await held()).length });

      // …and with it off, the synth is still told but the panel keeps holding.
      await kit.click({ x: padBox.x + padBox.w * 0.2, y: padBox.y + padBox.h * 0.6 });
      await kit.settle(200);
      const again = await held();
      await kit.set(pid, { 'Panic.clearLocal': false });
      await kit.forget();
      await kit.forgetSent();
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
      await kit.settle(200);
      led.check(P, 'clearLocal (false)', 'with it off the silence set still goes out but the panel keeps its own notes down',
        { sentToTheSynth: true, stillHeld: again.length },
        { sentToTheSynth: (await kit.sent()).length > 0, stillHeld: (await held()).length });
      await kit.set(pid, { 'Panic.clearLocal': true });
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
      await kit.settle(200);
    }

    // --- label / showSummary: what the face says it will do ------------------------------------------------
    {
      await kit.set(pid, { 'Panic.label': 'ALL OFF', 'Panic.showSummary': true,
        'Panic.scope': 'all', 'Panic.resetControllers': true, 'Panic.centreBend': true });
      await kit.settle(160);
      const texts = await kit.texts(pid);
      led.check(P, 'label', 'the button carries the words it was given',
        true, texts.includes('ALL OFF'));
      led.check(P, 'showSummary (true)', 'and a second line saying exactly what it will do',
        true, texts.includes('all ch · reset CC · centre bend'));
      await kit.set(pid, { 'Panic.scope': 'channel', 'Panic.channel': 10, 'Panic.centreBend': false });
      await kit.settle(160);
      led.check(P, 'showSummary (it tracks the settings)', 'the summary is the settings, not a fixed string',
        true, (await kit.texts(pid)).includes('ch 10 · reset CC'));
      await kit.set(pid, { 'Panic.showSummary': false });
      led.check(P, 'showSummary (false)', 'and goes away',
        false, (await kit.texts(pid)).some((t) => t.includes('ch 10')));
      await kit.set(pid, { 'Panic.showSummary': true, 'Panic.scope': 'all', 'Panic.centreBend': true,
        'Panic.label': 'PANIC' });
    }

    // --- editable ----------------------------------------------------------------------------------------------
    {
      await kit.set(pid, { 'Panic.editable': false });
      led.check(P, 'editable (false)', 'a locked panic button sends nothing when pressed', 0, (await press()).length);
      await kit.set(pid, { 'Panic.editable': true });
      led.check(P, 'editable (true)', 'and sends again when unlocked', true, (await press()).length > 0);
    }

    // --- the flash + flashColour: you can see it went out ---------------------------------------------------------
    {
      await kit.set(pid, { 'Panic.flashColour': 'FF22DD66', 'Panic.faceColour': 'FF2A1416',
        'Panic.borderColour': 'FFE05C5C', 'Panic.labelColour': 'FFF2C94C' });
      await kit.settle(160);
      const box = await kit.box(pid);
      const resting = await kit.geo(pid);
      led.check(P, 'faceColour (at rest)', 'the resting face is the face colour',
        true, resting.some((n) => n.tag === 'rect' && n.fill === rgba('FF2A1416')));
      led.check(P, 'borderColour', 'with the border it was given',
        true, resting.some((n) => n.tag === 'rect' && n.stroke === rgba('FFE05C5C')));
      led.check(P, 'labelColour', 'and the label in its own colour',
        true, resting.some((n) => n.tag === 'text' && n.fill === rgba('FFF2C94C')));
      // The flash lasts 180ms, so it is caught mid-press rather than after it.
      await kit.page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
      await kit.page.mouse.down();
      await kit.settle(60);
      const flashing = await kit.geo(pid);
      await kit.page.mouse.up();
      await kit.settle(400);
      led.check(P, 'flashColour (during)', 'the face flashes in the flash colour while it fires',
        true, flashing.some((n) => n.tag === 'rect' && n.fill === rgba('FF22DD66')));
      led.check(P, 'the flash ends', 'and is back to its resting face a moment later',
        false, (await kit.geo(pid)).some((n) => n.tag === 'rect' && n.fill === rgba('FF22DD66')));
    }

    // --- save and reopen, then fire again --------------------------------------------------------------------------
    {
      await kit.set(pid, { 'Panic.scope': 'channel', 'Panic.channel': 12, 'Panic.resetControllers': false,
        'Panic.centreBend': false, 'Panic.label': 'HUSH' });
      await kit.settle(200);
      const before = await kit.geo(pid);
      const again = await kit.reopen(pid);
      led.check(P, 'save/reopen (the face)', 'the button returns identical, summary line and all',
        JSON.stringify(before), JSON.stringify(await kit.geo(again)));
      pid = again;
      await kit.wire();
      await kit.preview(true);
      const box = await kit.box(pid);
      await kit.forgetSent();
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
      await kit.settle(200);
      led.check(P, 'save/reopen (still silences)', 'and a reopened button still sends its narrowed silence set',
        ['12:120', '12:123'], ccs(await kit.sent()));
    }
  }
  await kit.preview(false);
  await kit.unwire();

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
