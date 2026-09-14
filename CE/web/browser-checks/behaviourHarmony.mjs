/**
 * behaviourHarmony.mjs — deep behavioural pass over the Harmoniser and the Setlist.
 *
 * The Harmoniser is an input transformer: one key in, a chord out. So nothing about it is measured
 * from the document — a note is delivered where a device delivers it (`latestMidiInputMessage`) and
 * what leaves through the panel's note funnel is the evidence, pitch by pitch, with the played key
 * and the added voices told apart on the drawn keyboard.
 *
 * The Setlist sends no notes at all. Its recall is program change, bank select and controller
 * traffic, which the note funnel cannot see — so it is measured at the outbound MIDI boundary
 * (`kit.wire()`), and its stored values by what they actually did to the control they name.
 *
 * Run: node browser-checks/behaviourHarmony.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('harmony');
const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const midiOn = (ch, note, vel = 100) => `${hx(0x90 + ch - 1)}${hx(note)}${hx(vel)}`;
const midiOff = (ch, note) => `${hx(0x80 + ch - 1)}${hx(note)}00`;
const sendMidi = async (hex, settle = 160) => {
  await kit.page.evaluate(async ({ hex }) => {
    const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
    latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
  }, { hex });
  await kit.settle(settle);
};
const ons = (events) => events.filter((e) => e.kind === 'on');
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
};

try {
  // =============================================================================================
  // HARMONISER — 31 properties. One finger in, a chord out, and every row says which pitches.
  // =============================================================================================
  await kit.fresh();
  {
    const H = 'Harmoniser';
    let hid = await kit.make(H, { 'Transform.x': 40, 'Transform.y': 140,
      'Transform.width': 520, 'Transform.height': 180,
      'Harmoniser.mode': 'diatonic', 'Harmoniser.key': 0, 'Harmoniser.scale': 'major',
      'Harmoniser.size': 3, 'Harmoniser.voicing': 'close', 'Harmoniser.inversion': 0,
      'Harmoniser.octaveSpread': 0, 'Harmoniser.keepPlayed': true, 'Harmoniser.maxVoices': 6,
      'Harmoniser.outOfKey': 'pass', 'Harmoniser.voiceLeading': 'off', 'Harmoniser.strumMs': 0,
      'Harmoniser.inputChannel': 0, 'Harmoniser.channel': 1, 'Harmoniser.velocity': 0,
      'Harmoniser.editable': true, 'Harmoniser.showHeader': true,
      'Harmoniser.displayLow': 48, 'Harmoniser.displaySpan': 24, 'Harmoniser.forwardBend': false,
      'Harmoniser.forwardPressure': false });
    await kit.preview(true);

    /** Play one key on the hardware input and report the chord that left, sorted. */
    const play = async (note, { channel = 1, velocity = 100 } = {}) => {
      await kit.forget();
      await sendMidi(midiOn(channel, note, velocity));
      const out = ons(await kit.notes());
      await sendMidi(midiOff(channel, note));
      return out;
    };
    const pitches = (out) => out.map((e) => e.note).sort((a, b) => a - b);

    // --- mode 'diatonic' + key + scale + size: WHICH pitches ---------------------------------------
    {
      led.check(H, "mode 'diatonic' + size 3", 'C in C major is the tonic triad: C E G, with the played note under it',
        [60, 64, 67], pitches(await play(60)));
      led.check(H, 'diatonic (it harmonises by DEGREE, not by interval)',
        'D in the same key is the minor ii — D F A — not another major triad',
        [62, 65, 69], pitches(await play(62)));
      await kit.set(hid, { 'Harmoniser.size': 4 });
      led.check(H, 'size 4', 'a four-note stack adds the seventh', [60, 64, 67, 71], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.size': 3, 'Harmoniser.scale': 'minor' });
      led.check(H, 'scale', 'the same key in a minor scale gives a minor triad',
        [60, 63, 67], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.scale': 'major', 'Harmoniser.key': 2 });
      led.check(H, 'key', 'and moving the key re-harmonises: C is not in D major, so it passes through alone',
        [60], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.key': 0 });
    }

    // --- keepPlayed -----------------------------------------------------------------------------------
    {
      // A DIATONIC TRIAD CANNOT SHOW THIS, and the first version of this check did not notice.
      // `chordForNote` adds the played note when keepPlayed is on and then adds every voiced
      // offset — and a root-position stack contains offset 0, so the note is in the set either way.
      // Switching keepPlayed off on a C major triad changes nothing, which reads as a broken flag
      // and is not one. A memory shape with no 0 in it is where the property can actually be seen.
      await kit.set(hid, { 'Harmoniser.mode': 'memory', 'Harmoniser.shape': [3, 7],
        'Harmoniser.keepPlayed': true });
      led.check(H, 'keepPlayed (true)', 'the key you pressed sounds under the shape',
        [60, 63, 67], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.keepPlayed': false });
      led.check(H, 'keepPlayed (false)', 'and without it only the shape sounds',
        [63, 67], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.mode': 'diatonic', 'Harmoniser.keepPlayed': false });
      led.check(H, 'keepPlayed (a root-position stack is unchanged by it)',
        'a diatonic triad already contains its root, so switching the played note off leaves the same three pitches — stated because it looks like a dead flag and is not',
        [60, 64, 67], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.keepPlayed': true });
    }

    // --- voicing + inversion + octaveSpread + maxVoices ---------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.voicing': 'open' });
      led.check(H, "voicing 'open'", 'an open voicing spreads the same three notes over more than an octave',
        [60, 67, 76], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.voicing': 'drop2', 'Harmoniser.size': 4 });
      led.check(H, "voicing 'drop2'", 'drop 2 takes the second voice down an octave, under the played note',
        [55, 60, 64, 71], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.voicing': 'close', 'Harmoniser.size': 3, 'Harmoniser.inversion': 1 });
      led.check(H, 'inversion 1', 'the first inversion lifts the root an octave',
        [60, 64, 67, 72], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.inversion': 0, 'Harmoniser.octaveSpread': 1 });
      led.check(H, 'octaveSpread', 'the added voices move up a whole octave and the played note stays',
        [60, 72, 76, 79], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.octaveSpread': 0, 'Harmoniser.maxVoices': 2 });
      led.check(H, 'maxVoices', 'a two-voice limit keeps the lowest two and drops the rest',
        [60, 64], pitches(await play(60)));
      await kit.set(hid, { 'Harmoniser.maxVoices': 6 });
    }

    // --- outOfKey: the three answers, none of them obvious -------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.outOfKey': 'pass' });
      led.check(H, "outOfKey 'pass'", 'a black note in C major passes through alone rather than being harmonised wrongly',
        [61], pitches(await play(61)));
      await kit.set(hid, { 'Harmoniser.outOfKey': 'mute' });
      led.check(H, "outOfKey 'mute'", 'or is silenced outright', [], pitches(await play(61)));
      await kit.set(hid, { 'Harmoniser.outOfKey': 'nearest' });
      led.check(H, "outOfKey 'nearest'", 'or is harmonised as the nearest note that IS in the key — C♯ becomes C’s triad',
        [60, 64, 67], pitches(await play(61)));
      await kit.set(hid, { 'Harmoniser.outOfKey': 'pass' });
    }

    // --- mode 'memory' + shape -------------------------------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.mode': 'memory', 'Harmoniser.shape': [0, 3, 7, 10] });
      led.check(H, "mode 'memory' + shape", 'a fixed shape is transposed to the played note whatever the key says',
        [60, 63, 67, 70], pitches(await play(60)));
      led.check(H, 'memory (it really is fixed)', 'and the same shape follows a different key',
        [62, 65, 69, 72], pitches(await play(62)));
      await kit.set(hid, { 'Harmoniser.mode': 'diatonic' });
    }

    // --- degreeChords: a per-degree override --------------------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.degreeChords': { 0: [0, 5, 7] } });
      led.check(H, 'degreeChords', 'the tonic is overridden to a sus4 while every other degree keeps its stack',
        { tonic: [60, 65, 67], second: [62, 65, 69] },
        { tonic: pitches(await play(60)), second: pitches(await play(62)) });
      await kit.set(hid, { 'Harmoniser.degreeChords': {} });
    }

    // --- channel + velocity + inputChannel -----------------------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.channel': 9 });
      led.check(H, 'channel', 'the whole chord leaves on the declared channel',
        [9], [...new Set((await play(60)).map((e) => e.channel))]);
      led.check(H, 'velocity 0 (follow the played one)', 'with no fixed velocity every voice carries the velocity of the key',
        [73], [...new Set((await play(60, { velocity: 73 })).map((e) => e.velocity))]);
      await kit.set(hid, { 'Harmoniser.velocity': 40 });
      led.check(H, 'velocity (fixed)', 'and a fixed one replaces it, however hard the key was played',
        [40], [...new Set((await play(60, { velocity: 120 })).map((e) => e.velocity))]);
      await kit.set(hid, { 'Harmoniser.velocity': 0, 'Harmoniser.channel': 1 });
      await kit.set(hid, { 'Harmoniser.inputChannel': 4 });
      led.check(H, 'inputChannel (pinned)', 'a key on another channel is ignored',
        0, (await play(60, { channel: 2 })).length);
      led.check(H, 'inputChannel (matching)', 'and the watched channel is harmonised',
        [60, 64, 67], pitches(await play(60, { channel: 4 })));
      await kit.set(hid, { 'Harmoniser.inputChannel': 0 });
      led.check(H, 'inputChannel (0 = any)', 'omni takes a key from anywhere',
        [60, 64, 67], pitches(await play(60, { channel: 11 })));
    }

    // --- strumMs + strumDirection: WHEN each voice arrives ----------------------------------------------------------
    {
      /** The chord's note-ons with the moment each one left, relative to the first. */
      const arrivals = async (note = 60) => {
        await kit.forget();
        await sendMidi(midiOn(1, note, 100), 420);
        const out = ons(await kit.notes());
        await sendMidi(midiOff(1, note));
        if (!out.length) return null;
        const t0 = Math.min(...out.map((e) => e.at));
        return out.map((e) => ({ note: e.note, at: Math.round(e.at - t0) })).sort((a, b) => a.at - b.at);
      };
      await kit.set(hid, { 'Harmoniser.strumMs': 0 });
      const together = await arrivals();
      led.check(H, 'strumMs 0', 'the whole chord arrives at once',
        true, together?.length === 3 && together.every((v) => v.at < 20));
      await kit.set(hid, { 'Harmoniser.strumMs': 120, 'Harmoniser.strumDirection': 'up' });
      const up = await arrivals();
      // Three voices over 120ms is 0, 60, 120 — the lowest first going up.
      led.check(H, "strumMs + strumDirection 'up'", 'the chord spreads over the declared time, lowest note first',
        true, up?.length === 3 && up[0].note === 60 && up[2].note === 67
          && Math.abs(up[1].at - 60) < 45 && Math.abs(up[2].at - 120) < 55);
      await kit.set(hid, { 'Harmoniser.strumDirection': 'down' });
      const down = await arrivals();
      led.check(H, "strumDirection 'down'", 'and the other way round it is the highest note that arrives first',
        true, down?.length === 3 && down[0].note === 67 && down[2].note === 60);
      await kit.set(hid, { 'Harmoniser.strumMs': 0, 'Harmoniser.strumDirection': 'up' });
    }

    // --- the note-off rule: release what the note-on SENT ---------------------------------------------------------------
    {
      // Change the voicing WHILE a key is held. A re-derived release would let go of pitches that
      // were never started and leave the ones that were ringing for ever — the bug this component's
      // bookkeeping exists to prevent, and one that only shows up on the release.
      await kit.forget();
      await sendMidi(midiOn(1, 60, 100));
      const started = pitches(ons(await kit.notes()));
      await kit.set(hid, { 'Harmoniser.size': 4, 'Harmoniser.voicing': 'open' });
      await kit.settle(200);
      await kit.forget();
      await sendMidi(midiOff(1, 60));
      const released = (await kit.notes()).filter((e) => e.kind === 'off').map((e) => e.note).sort((a, b) => a - b);
      led.check(H, 'a note-off releases what the note-on SENT',
        'changing the voicing under a held key still lets go of exactly the pitches that were started',
        started, released);
      await kit.set(hid, { 'Harmoniser.size': 3, 'Harmoniser.voicing': 'close' });
    }

    // --- two keys whose chords OVERLAP: reference counting ---------------------------------------------------------------
    {
      // C and E a third apart in C major both contain G. Releasing C must not stop the G that E is
      // still holding — the reference count is the whole point.
      await kit.forget();
      await sendMidi(midiOn(1, 60, 100));
      await sendMidi(midiOn(1, 64, 100));
      const sounding = new Set(ons(await kit.notes()).map((e) => e.note));
      await kit.forget();
      await sendMidi(midiOff(1, 60));
      const afterFirst = (await kit.notes()).filter((e) => e.kind === 'off').map((e) => e.note).sort((a, b) => a - b);
      await kit.forget();
      await sendMidi(midiOff(1, 64));
      const afterSecond = (await kit.notes()).filter((e) => e.kind === 'off').map((e) => e.note).sort((a, b) => a - b);
      led.check(H, 'overlapping chords are reference counted',
        'C and E both sound G; letting go of C releases only what C alone was holding, and G goes with E',
        { bothWereSounding: true, gAfterC: false, gAfterE: true },
        { bothWereSounding: sounding.has(60) && sounding.has(64) && sounding.has(67),
          gAfterC: afterFirst.includes(67), gAfterE: afterSecond.includes(67) });
    }

    // --- editable: audition a key with the mouse -----------------------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.editable': true });
      await kit.forget();
      const box = await kit.box(hid);
      // The drawn keyboard starts at displayLow (48) — a press in the left-hand quarter, below the
      // header, lands on a white key well inside the range.
      await kit.page.mouse.move(box.x + box.w * 0.18, box.y + box.h * 0.75);
      await kit.page.mouse.down();
      await kit.settle(200);
      const auditioned = ons(await kit.notes());
      await kit.page.mouse.up();
      await kit.settle(220);
      const lifted = (await kit.notes()).filter((e) => e.kind === 'off');
      led.check(H, 'editable (audition)', 'clicking a key sounds a whole chord, and releasing it lets the chord go',
        { voices: true, allReleased: true },
        { voices: auditioned.length >= 2,
          allReleased: auditioned.length > 0
            && auditioned.every((e) => lifted.some((o) => o.note === e.note)) });
      await kit.set(hid, { 'Harmoniser.editable': false });
      await kit.forget();
      await kit.click({ x: box.x + box.w * 0.18, y: box.y + box.h * 0.75 });
      await kit.settle(200);
      led.check(H, 'editable (false)', 'a locked harmoniser cannot be auditioned with the mouse',
        0, ons(await kit.notes()).length);
      await kit.set(hid, { 'Harmoniser.editable': true });
    }

    // --- the drawn keyboard: displayLow / displaySpan / showHeader / the colours -------------------------------------------
    {
      const keys = async () => kit.shapes(hid, 'rect', (n) => n.rx === 2 || n.rx === 1.5);
      await kit.set(hid, { 'Harmoniser.displayLow': 48, 'Harmoniser.displaySpan': 24 });
      await kit.settle(160);
      const two = (await keys()).length;
      await kit.set(hid, { 'Harmoniser.displaySpan': 48 });
      await kit.settle(160);
      led.check(H, 'displaySpan', 'a wider span draws more keys', true, (await keys()).length > two);
      // displayLow moves WHICH NOTES the keys are, not where they are drawn: the same span is the
      // same picture. So the drawing is checked to be identical and the CHANGE is measured through
      // the keyboard instead — the same spot on screen auditions a chord an octave higher.
      await kit.set(hid, { 'Harmoniser.displaySpan': 24, 'Harmoniser.displayLow': 48,
        'Harmoniser.editable': true });
      await kit.settle(200);
      const lowGeo = JSON.stringify((await keys()).map((n) => [n.x, n.y, n.width, n.height]));
      const auditionAt = async () => {
        const box = await kit.box(hid);
        await kit.forget();
        await kit.page.mouse.move(box.x + box.w * 0.18, box.y + box.h * 0.75);
        await kit.page.mouse.down();
        await kit.settle(200);
        const out = pitches(ons(await kit.notes()));
        await kit.page.mouse.up();
        await kit.settle(200);
        return out;
      };
      const atFortyEight = await auditionAt();
      await kit.set(hid, { 'Harmoniser.displayLow': 60 });
      await kit.settle(200);
      const highGeo = JSON.stringify((await keys()).map((n) => [n.x, n.y, n.width, n.height]));
      const atSixty = await auditionAt();
      led.check(H, 'displayLow (the same span is the same picture)',
        'starting an octave higher draws the very same keys in the very same places',
        lowGeo, highGeo);
      led.check(H, 'displayLow (but different notes)',
        'and the same spot on screen now auditions a chord an octave up — which is the only way the property is visible at all',
        true, atFortyEight.length > 0 && atSixty.length === atFortyEight.length
          && atSixty.every((n, i) => n === atFortyEight[i] + 12));
      await kit.set(hid, { 'Harmoniser.displayLow': 48 });

      await kit.set(hid, { 'Harmoniser.showHeader': true });
      await kit.settle(160);
      const withHeader = await kit.texts(hid);
      led.check(H, 'showHeader (true)', 'the header names the key and the voicing',
        true, withHeader.some((t) => t.includes('C Major')));
      await kit.set(hid, { 'Harmoniser.showHeader': false });
      led.check(H, 'showHeader (false)', 'and goes',
        false, (await kit.texts(hid)).some((t) => t.includes('C Major')));
      await kit.set(hid, { 'Harmoniser.showHeader': true });
    }

    // --- playedColour / addedColour: what you did against what it did ------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.faceColour': 'FF101828', 'Harmoniser.whiteColour': 'FFEEEEEE',
        'Harmoniser.blackColour': 'FF111111', 'Harmoniser.playedColour': 'FFFF8800',
        'Harmoniser.addedColour': 'FF00CCFF', 'Harmoniser.labelColour': 'FFAABBCC' });
      await kit.settle(200);
      const resting = await kit.geo(hid);
      led.check(H, 'faceColour / whiteColour / blackColour / labelColour', 'the face, the keys and the labels take their colours',
        { face: true, white: true, black: true, label: true },
        { face: resting.some((n) => n.tag === 'rect' && n.fill === rgba('FF101828')),
          white: resting.some((n) => n.tag === 'rect' && n.fill === rgba('FFEEEEEE')),
          black: resting.some((n) => n.tag === 'rect' && n.fill === rgba('FF111111')),
          label: resting.some((n) => n.tag === 'text' && n.fill === rgba('FFAABBCC')) });
      await sendMidi(midiOn(1, 60, 100));
      const lit = await kit.geo(hid);
      const played = lit.filter((n) => n.tag === 'rect' && n.fill === rgba('FFFF8800'));
      const added = lit.filter((n) => n.tag === 'rect' && n.fill === rgba('FF00CCFF'));
      await sendMidi(midiOff(1, 60));
      led.check(H, 'playedColour + addedColour',
        'the key you pressed is drawn in one colour and the two the harmoniser added in the other — exactly one played, exactly two added',
        { played: 1, added: 2 }, { played: played.length, added: added.length });
    }

    // --- forwardBend / forwardPressure ------------------------------------------------------------------------------------
    led.closed(H, 'forwardBend / forwardPressure',
      'pass the input’s bend and aftertouch through to the chord’s channel',
      'behaviourOutbound.mjs, as the bytes themselves: both switches off and on, onto the CHORD\'s '
      + 'channel rather than the input\'s, with all fourteen bits of the bend intact, the input channel '
      + 'pinned and omni, and a reopen. The separate fixture it wanted is that suite.');
    led.closed(H, 'followPanelKey', 'take the key and scale from the panel instead of its own',
      'behaviourOutbound.mjs. The reason given here was wrong: no control writes the panel key. '
      + 'setPanelKey is a store action, and following is a BROADCAST — it writes the key and scale into '
      + 'each follower\'s own section, so the document, the drawn header and the notes played all move, '
      + 'and a holdout beside them does not.');

    // --- voiceLeading: measured in the PITCHES, which is where it happens ------------------------------
    {
      // The reason this row used to carry — "the map this check can read does not distinguish led
      // from re-derived" — was looking in the wrong place. Leading does not leave a mark in a map;
      // it CHANGES WHICH NOTES SOUND, and the funnel carries every one of them. Two chords in
      // sequence and a comparison of the added voices is the whole measurement.
      await kit.set(hid, { 'Harmoniser.mode': 'diatonic', 'Harmoniser.key': 0,
        'Harmoniser.scale': 'major', 'Harmoniser.size': 3, 'Harmoniser.keepPlayed': true,
        'Harmoniser.inversion': 0, 'Harmoniser.octaveSpread': 0 });
      /** Play C, then G, and report the voices G added — the played note excluded, since leading
       *  deliberately leaves that one where the finger put it. */
      const secondChord = async (mode) => {
        await kit.set(hid, { 'Harmoniser.voiceLeading': mode });
        await kit.settle(200);
        await play(60);                                   // establish a previous chord: C E G
        const out = pitches(await play(67));              // then G, which is where the rule bites
        return out.filter((n) => n !== 67);
      };
      const off = await secondChord('off');
      const closest = await secondChord('closest');
      led.check(H, "voiceLeading 'off'", 'with leading off the second chord is always root position: G above the played note gives B and D above it',
        [71, 74], off);
      led.check(H, "voiceLeading 'closest'",
        'and with closest it re-voices those same two notes to sit near the chord before it rather than stacking upward — the same pitch classes, moved by an octave',
        { sameClasses: true, moved: true, closer: true },
        { sameClasses: String(closest.map((n) => n % 12).sort()) === String(off.map((n) => n % 12).sort()),
          moved: String(closest) !== String(off),
          // "least total movement" is the promise, so the led voicing must be nearer to C E G.
          closer: closest.reduce((d, n) => d + Math.min(...[60, 64, 67].map((m) => Math.abs(n - m))), 0)
            < off.reduce((d, n) => d + Math.min(...[60, 64, 67].map((m) => Math.abs(n - m))), 0) });
      led.check(H, 'voiceLeading (the played note is left alone)',
        'the note the finger played stays where it was played in every mode — leading the added voices is harmonising, moving the played one would be transposing the performance',
        { off: true, closest: true },
        { off: !off.includes(67), closest: !closest.includes(67) });
      await kit.set(hid, { 'Harmoniser.voiceLeading': 'off' });
    }

    // --- save and reopen ---------------------------------------------------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.scale': 'minor', 'Harmoniser.size': 4, 'Harmoniser.channel': 5,
        'Harmoniser.velocity': 88, 'Harmoniser.keepPlayed': true });
      await kit.settle(220);
      const before = await kit.geo(hid);
      const again = await kit.reopen(hid);
      led.check(H, 'save/reopen (the keyboard)', 'every key, the header and the labels return identical',
        JSON.stringify(before), JSON.stringify(await kit.geo(again)));
      hid = again;
      await kit.preview(true);
      const out = await play(60);
      led.check(H, 'save/reopen (still harmonises)',
        'a reopened harmoniser still builds a minor seventh on its own channel at its own velocity',
        { pitches: [60, 63, 67, 70], channel: [5], velocity: [88] },
        { pitches: pitches(out), channel: [...new Set(out.map((e) => e.channel))],
          velocity: [...new Set(out.map((e) => e.velocity))] });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // SETLIST — 23 properties. It plays no notes at all: a recall is program change, bank select and
  // controller traffic, which the note funnel cannot see. So the wire is the instrument, and the
  // stored values are measured by what they did to the control they name.
  // =============================================================================================
  await kit.fresh();
  {
    const S = 'Setlist';
    const scene = (over = {}) => ({ id: 's1', name: 'Opener', note: '', values: {}, program: null,
      bankMsb: null, bankLsb: null, bpm: null, enabled: true, colour: '', ccs: [], sysex: [], ...over });
    const knob = await kit.make('Knob', { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 60, 'Transform.height': 60, 'Core.name': 'Cutoff' });
    let sid = await kit.make(S, { 'Transform.x': 40, 'Transform.y': 180,
      'Transform.width': 300, 'Transform.height': 140, 'Setlist.index': 0, 'Setlist.wrap': false,
      'Setlist.channel': 1, 'Setlist.sendProgram': true, 'Setlist.recallValues': true,
      'Setlist.recallTempo': true, 'Setlist.footEnabled': true, 'Setlist.footCc': 64,
      'Setlist.footChannel': 0, 'Setlist.footThreshold': 64, 'Setlist.footAction': 'next',
      'Setlist.footBackCc': null, 'Setlist.crossfadeMs': 0, 'Setlist.editable': true,
      'Setlist.showHeader': true, 'Setlist.rowHeight': 18,
      'Setlist.scenes': [
        scene({ id: 's1', name: 'Opener' }),
        scene({ id: 's2', name: 'Ballad', program: 12, bankMsb: 1, bankLsb: 3, bpm: 90,
          values: { 'Cutoff.Behavior.defaultValue': 0.8 }, ccs: [{ channel: null, cc: 74, value: 100 }] }),
        scene({ id: 's3', name: 'Closer', program: 40, values: { 'Cutoff.Behavior.defaultValue': 0.2 } })] });
    await kit.wire();
    await kit.preview(true);
    await kit.settle(300);

    const goTo = async (index) => {
      await kit.forgetSent();
      await kit.set(sid, { 'Setlist.index': index });
      await kit.settle(320);
      return kit.sent();
    };
    const knobValue = async () => Number(await kit.read(knob, 'Behavior.defaultValue'));
    const clockBpm = () => kit.page.evaluate(async () => {
      const { transport } = await import('/src/CE_Application/stores/transport.js');
      const get = (st) => { let v; st.subscribe((x) => { v = x; })(); return v; };
      return get(transport).bpm;
    });

    // --- index + scenes[].program / bankMsb / bankLsb / ccs: the recall, in ORDER -----------------
    {
      const out = await goTo(1);
      // Bank select MSB and LSB, THEN the program, THEN the extra CCs. The order is the whole
      // point: a patch change resets the synth's controllers, so a CC sent first is wiped by the
      // patch it was meant to modify, and a program sent before its bank lands in the wrong bank.
      led.check(S, 'index + scenes[] (the recall, in order)',
        'bank MSB, bank LSB, the program change, and only then the scene’s own controllers',
        ['B00001', 'B02003', 'C00C', 'B04A64'], out.map((m) => m.hex));
      led.check(S, 'scenes[].values (they are actually written)',
        'the stored value reaches the control the path names',
        0.8, await knobValue());
      led.check(S, 'scenes[].bpm + recallTempo', 'and the scene’s tempo drives the shared clock',
        90, await clockBpm());
      const back = await goTo(2);
      led.check(S, 'index (a second recall)', 'the next scene sends its own program and writes its own value',
        { messages: ['C028'], value: 0.2 }, { messages: back.map((m) => m.hex), value: await knobValue() });
    }

    // --- sendProgram / recallValues / recallTempo: each switch, on its own ----------------------------
    {
      await kit.set(sid, { 'Setlist.sendProgram': false });
      await kit.set(knob, { 'Behavior.defaultValue': 0.5 });
      const quiet = await goTo(1);
      led.check(S, 'sendProgram (false)', 'no MIDI leaves at all, and the stored value still arrives',
        { sent: 0, value: 0.8 }, { sent: quiet.length, value: await knobValue() });
      await kit.set(sid, { 'Setlist.sendProgram': true, 'Setlist.recallValues': false });
      await kit.set(knob, { 'Behavior.defaultValue': 0.5 });
      const noValues = await goTo(2);
      led.check(S, 'recallValues (false)', 'the MIDI goes and the panel value is left where it was',
        { sent: true, value: 0.5 }, { sent: noValues.length > 0, value: await knobValue() });
      await kit.set(sid, { 'Setlist.recallValues': true, 'Setlist.recallTempo': false });
      await kit.page.evaluate(async () => {
        const { setTransportBpm } = await import('/src/CE_Application/stores/transport.js');
        setTransportBpm(120);
      });
      await goTo(1);
      led.check(S, 'recallTempo (false)', 'and the scene’s tempo is ignored', 120, await clockBpm());
      await kit.set(sid, { 'Setlist.recallTempo': true });
    }

    // --- channel: where the program change goes --------------------------------------------------------
    {
      await kit.set(sid, { 'Setlist.channel': 7 });
      const out = await goTo(2);
      led.check(S, 'channel', 'the program change and the bank leave on the declared channel',
        [7], [...new Set(out.map((m) => m.channel))]);
      await kit.set(sid, { 'Setlist.channel': 1 });
    }

    // --- wrap: what the end of the list does -------------------------------------------------------------
    {
      const step = async (delta) => {
        await kit.page.evaluate(async ({ id, delta }) => {
          const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
          const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
          const { stepIndex, setlistScenes, setlistIndex, setlistWraps } = await import('/src/CE_Application/utils/setlistLayout.js');
          const get = (st) => { let v; st.subscribe((x) => { v = x; })(); return v; };
          const live = get(panels).find((p) => p.id === get(activePanelId));
          const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
          const next = stepIndex(setlistScenes(c), setlistIndex(c), delta, setlistWraps(c));
          if (next >= 0) updateControlProperty(id, 'Setlist.index', next);
        }, { id: sid, delta });
        await kit.settle(240);
        return Number(await kit.read(sid, 'Setlist.index'));
      };
      await kit.set(sid, { 'Setlist.index': 2, 'Setlist.wrap': false });
      await kit.settle(240);
      led.check(S, 'wrap (false)', 'the end of the list stays put rather than starting the set again',
        2, await step(1));
      await kit.set(sid, { 'Setlist.wrap': true });
      await kit.settle(200);
      led.check(S, 'wrap (true)', 'and with wrap on it comes round to the first scene', 0, await step(1));
      await kit.set(sid, { 'Setlist.wrap': false, 'Setlist.index': 0 });
    }

    // --- the footswitch: a RISING EDGE, once per press ------------------------------------------------------
    {
      const pedal = async (cc, value, channel = 1) => {
        await kit.page.evaluate(async ({ hex }) => {
          const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
          latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
        }, { hex: `${hx(0xB0 + channel - 1)}${hx(cc)}${hx(value)}` });
        await kit.settle(240);
        return Number(await kit.read(sid, 'Setlist.index'));
      };
      /** Park the index somewhere a step is VISIBLE from. Without this the checks inherit
       *  whatever the last one left, and at the end of a three-scene list with wrap off a
       *  successful step and a step that never happened are the same number. */
      const park = async (index) => {
        await kit.set(sid, { 'Setlist.index': index });
        await kit.settle(280);
      };
      await kit.set(sid, { 'Setlist.footEnabled': true, 'Setlist.footCc': 64,
        'Setlist.footThreshold': 64, 'Setlist.footAction': 'next', 'Setlist.footChannel': 0 });
      await park(0);
      led.check(S, 'footEnabled + footCc + footAction (next)', 'pressing the pedal steps one scene on',
        1, await pedal(64, 127));
      // A momentary pedal sends 127 and then 0. Acting on both would step twice per press.
      led.check(S, 'the footswitch is a rising EDGE', 'letting go of the pedal steps nothing \u2014 a momentary pedal sends 127 then 0, and acting on both would double every press',
        1, await pedal(64, 0));
      led.check(S, 'footswitch (a second press)', 'and the next press steps again', 2, await pedal(64, 127));
      await pedal(64, 0);

      await kit.set(sid, { 'Setlist.footThreshold': 100 });
      await park(0);
      led.check(S, 'footThreshold', 'a press under the threshold is not a press', 0, await pedal(64, 80));
      await pedal(64, 0);
      led.check(S, 'footThreshold (over it)', 'and over it, it is', 1, await pedal(64, 110));
      await pedal(64, 0);

      await kit.set(sid, { 'Setlist.footThreshold': 64, 'Setlist.footCc': 80 });
      await park(0);
      led.check(S, 'footCc', 'another controller number is not this pedal', 0, await pedal(64, 127));
      await pedal(64, 0);
      led.check(S, 'footCc (the declared one)', 'and the declared one is', 1, await pedal(80, 127));
      await pedal(80, 0);

      await kit.set(sid, { 'Setlist.footCc': 64, 'Setlist.footChannel': 5 });
      await park(0);
      led.check(S, 'footChannel (pinned)', 'a pedal on another channel is ignored', 0, await pedal(64, 127, 2));
      await pedal(64, 0, 2);
      led.check(S, 'footChannel (matching)', 'and the watched one is taken', 1, await pedal(64, 127, 5));
      await pedal(64, 0, 5);
      await kit.set(sid, { 'Setlist.footChannel': 0 });

      await kit.set(sid, { 'Setlist.footAction': 'prev' });
      await park(2);
      led.check(S, "footAction 'prev'", 'the same pedal can step backwards instead', 1, await pedal(64, 127));
      await pedal(64, 0);
      await kit.set(sid, { 'Setlist.footAction': 'goto', 'Setlist.footGoto': 0 });
      await park(2);
      led.check(S, "footAction 'goto'", 'or jump to one named scene', 0, await pedal(64, 127));
      await pedal(64, 0);

      await kit.set(sid, { 'Setlist.footAction': 'next', 'Setlist.footBackCc': 81 });
      await park(0);
      const forward = await pedal(64, 127);
      await pedal(64, 0);
      const back = await pedal(81, 127);
      await pedal(81, 0);
      led.check(S, 'footBackCc', 'a second pedal steps back, and the two hold their own state rather than cancelling one another',
        { forward: 1, back: 0 }, { forward, back });
      await kit.set(sid, { 'Setlist.footBackCc': null });

      await kit.set(sid, { 'Setlist.footEnabled': false });
      await park(0);
      led.check(S, 'footEnabled (false)', 'a disabled pedal does nothing at all', 0, await pedal(64, 127));
      await kit.set(sid, { 'Setlist.footEnabled': true });
      await pedal(64, 0);
    }

    // --- crossfadeMs: a scene change that is not a jump ----------------------------------------------------------
    {
      await kit.set(sid, { 'Setlist.index': 2, 'Setlist.crossfadeMs': 0 });
      await kit.settle(320);
      await kit.set(knob, { 'Behavior.defaultValue': 0 });
      await kit.set(sid, { 'Setlist.index': 1 });
      await kit.settle(60);
      const snapped = await knobValue();
      led.check(S, 'crossfadeMs 0', 'with no fade the value is simply there, one frame later',
        0.8, snapped);
      await kit.set(sid, { 'Setlist.index': 2, 'Setlist.crossfadeMs': 900 });
      await kit.settle(1200);
      await kit.set(knob, { 'Behavior.defaultValue': 0 });
      await kit.set(sid, { 'Setlist.index': 1 });
      await kit.settle(250);
      const midway = await knobValue();
      await kit.settle(1000);
      const settled = await knobValue();
      led.check(S, 'crossfadeMs', 'with a fade it is part of the way there a quarter of a second in, and all the way there when the fade ends',
        true, midway > 0.05 && midway < 0.7 && Math.abs(settled - 0.8) < 0.02);
      await kit.set(sid, { 'Setlist.crossfadeMs': 0 });
    }

    // --- editable: click a row ----------------------------------------------------------------------------------
    {
      await kit.set(sid, { 'Setlist.index': 0, 'Setlist.editable': true, 'Setlist.showHeader': true,
        'Setlist.rowHeight': 18 });
      await kit.settle(300);
      const box = await kit.box(sid);
      // Rows start at pad + header = 8 + 20, each 18 tall; the third row's middle is 28 + 2*18 + 9.
      await kit.click({ x: box.x + box.w / 2, y: box.y + 28 + 2 * 18 + 9 });
      await kit.settle(320);
      led.check(S, 'editable (click a row)', 'clicking the third row jumps to it, and the jump recalls',
        { index: 2, value: 0.2 }, { index: Number(await kit.read(sid, 'Setlist.index')), value: await knobValue() });
      await kit.set(sid, { 'Setlist.editable': false, 'Setlist.index': 0 });
      await kit.settle(300);
      await kit.click({ x: box.x + box.w / 2, y: box.y + 28 + 2 * 18 + 9 });
      await kit.settle(300);
      led.check(S, 'editable (false)', 'a locked setlist ignores the click',
        0, Number(await kit.read(sid, 'Setlist.index')));
      await kit.set(sid, { 'Setlist.editable': true });
    }

    // --- showHeader + rowHeight + scenes[].name + the colours -------------------------------------------------------
    {
      await kit.set(sid, { 'Setlist.showHeader': true, 'Setlist.rowHeight': 18 });
      await kit.settle(200);
      const rows = async () => kit.shapes(sid, 'rect', (n) => n.rx === 3);
      const at18 = await rows();
      led.check(S, 'rowHeight (18)', 'every row is the declared height, one pixel of gap aside',
        [17], [...new Set(at18.map((n) => n.height))]);
      led.check(S, 'scenes[].name', 'and carries its own name',
        true, (await kit.texts(sid)).includes('Ballad'));
      await kit.set(sid, { 'Setlist.rowHeight': 30 });
      await kit.settle(200);
      led.check(S, 'rowHeight (30)', 'a taller row really is taller', [29], [...new Set((await rows()).map((n) => n.height))]);
      await kit.set(sid, { 'Setlist.rowHeight': 18 });
      const firstRowY = (await rows()).map((n) => n.y).sort((a, b) => a - b)[0];
      await kit.set(sid, { 'Setlist.showHeader': false });
      await kit.settle(200);
      led.check(S, 'showHeader', 'without the header the first row starts twenty pixels higher',
        firstRowY - 20, (await rows()).map((n) => n.y).sort((a, b) => a - b)[0]);
      await kit.set(sid, { 'Setlist.showHeader': true });

      await kit.set(sid, { 'Setlist.faceColour': 'FF102030', 'Setlist.rowColour': 'FF223344',
        'Setlist.currentColour': 'FFFF6699', 'Setlist.textColour': 'FFEEFFCC',
        'Setlist.labelColour': 'FF99AABB', 'Setlist.index': 1 });
      await kit.settle(300);
      const g = await kit.geo(sid);
      led.check(S, 'faceColour / rowColour / currentColour', 'the face, the ordinary rows and the current one each take their colour',
        { face: true, rows: 2, current: 1 },
        { face: g.some((n) => n.tag === 'rect' && n.fill === rgba('FF102030')),
          rows: g.filter((n) => n.tag === 'rect' && n.fill === rgba('FF223344')).length,
          current: g.filter((n) => n.tag === 'rect' && n.rx === 3 && n.fill === rgba('FFFF6699')).length });
      led.check(S, 'textColour / labelColour', 'the scene names and the smaller labels take theirs',
        { text: true, label: true },
        { text: g.some((n) => n.tag === 'text' && n.fill === rgba('FFEEFFCC')),
          label: g.some((n) => n.tag === 'text' && n.fill === rgba('FF99AABB')) });
      // A scene's own colour wins over the row colour — that is what it is for.
      await kit.set(sid, { 'Setlist.index': 0, 'Setlist.scenes': [
        scene({ id: 's1', name: 'Opener' }),
        scene({ id: 's2', name: 'Ballad', colour: 'FF00FF99' }),
        scene({ id: 's3', name: 'Closer' })] });
      await kit.settle(250);
      led.check(S, 'scenes[].colour', 'a scene with its own colour is drawn in it',
        1, (await kit.shapes(sid, 'rect', (n) => n.rx === 3 && n.fill === rgba('FF00FF99'))).length);
    }

    // --- scenes[].enabled + note + sysex + capturePaths ----------------------------------------------------------------
    // --- scenes[].enabled: a disabled scene is stepped OVER -------------------------------------------
    {
      // This row used to say a check here "would be a second walk of the same function, not a new
      // observation". That is true of calling stepIndex directly and false of what is done here: a
      // real pedal press goes footswitchEdge -> setlistStep -> stepIndex -> the index write -> the
      // recall, and the question is whether a disabled scene is skipped BY THE WHOLE PATH. The
      // reducer being unit-tested says nothing about the four things wired around it.
      // Local copies: the pedal and park helpers above are scoped to the footswitch block.
      const press = async (value) => {
        await kit.page.evaluate(async ({ hex }) => {
          const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
          latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
        }, { hex: `${hx(0xB0)}${hx(64)}${hx(value)}` });
        await kit.settle(280);
        return Number(await kit.read(sid, 'Setlist.index'));
      };
      const parkAt = async (index) => { await kit.set(sid, { 'Setlist.index': index }); await kit.settle(300); };
      const scenes = [
        scene({ id: 'e1', name: 'One', program: 1 }),
        scene({ id: 'e2', name: 'Two (off)', program: 2, enabled: false }),
        scene({ id: 'e3', name: 'Three', program: 3 })];
      await kit.set(sid, { 'Setlist.scenes': scenes, 'Setlist.wrap': false,
        'Setlist.footEnabled': true, 'Setlist.footCc': 64, 'Setlist.footThreshold': 64,
        'Setlist.footAction': 'next', 'Setlist.footChannel': 0, 'Setlist.sendProgram': true });
      await parkAt(0);
      await kit.forgetSent();
      const landed = await press(127);
      await kit.settle(260);
      const wire = await kit.sent();
      const programs = wire.filter((m) => m.status === 0xC0).map((m) => m.data1);
      led.check(S, 'scenes[].enabled (stepped over)',
        'one press of the pedal from the first scene lands on the THIRD, because the second is switched off — it is skipped rather than stopped at',
        2, landed);
      led.check(S, 'scenes[].enabled (and the skipped scene never sounds)',
        'and the synth is sent the third scene\'s program change alone, never the disabled one it passed through',
        [3], programs);
      await kit.set(sid, { 'Setlist.scenes': [scene({ id: 'e1', name: 'One', program: 1 }),
        scene({ id: 'e2', name: 'Two', program: 2 }), scene({ id: 'e3', name: 'Three', program: 3 })] });
      await kit.settle(200);
    }

    led.unverified(S, 'scenes[].note', 'a free-text note on the scene',
      'stored and shown in the Setlist editor, which is a properties-panel surface rather than the rendered '
      + 'control; the renderer draws the name, the tempo and a badge, and never the note. This one is a real '
      + 'gap in the AUTHORING pass rather than in this component\'s behaviour.');
    led.closed(S, 'scenes[].sysex', 'a system-exclusive message sent with the scene',
      'behaviourOutbound.mjs. The reason given here — that inventing bytes would test the file rather '
      + 'than the product — was wrong about what there is to test: the framing and the stripping of a '
      + 'high-bit byte from the body are the component\'s OWN promises, and they hold for any bytes at '
      + 'all. The order against the program change is measured there too.');
    led.unverified(S, 'capturePaths', 'which panel paths a capture stores',
      'capture is an editor action on the Setlist inspector, not something the rendered control does; '
      + 'captureScene is pure and unit-tested, and the recall half of the same contract is verified above');

    // --- save and reopen ------------------------------------------------------------------------------------------------
    {
      // The colour rows replaced the scene list with three plain scenes, so the programs went with
      // it. Put a real one back before saving, or "a reopened setlist still recalls" would be
      // asserting that a scene with nothing to send sends nothing.
      await kit.set(sid, { 'Setlist.index': 0, 'Setlist.channel': 4, 'Setlist.sendProgram': true,
        'Setlist.scenes': [
          scene({ id: 's1', name: 'Opener' }),
          scene({ id: 's2', name: 'Ballad', program: 12 }),
          scene({ id: 's3', name: 'Closer', program: 40 })] });
      await kit.settle(300);
      const before = await kit.geo(sid);
      const again = await kit.reopen(sid);
      led.check(S, 'save/reopen (the list)', 'every row, name and colour returns identical',
        JSON.stringify(before), JSON.stringify(await kit.geo(again)));
      sid = again;
      await kit.wire();
      await kit.preview(true);
      await kit.settle(300);
      await kit.forgetSent();
      await kit.set(sid, { 'Setlist.index': 2 });
      await kit.settle(320);
      led.check(S, 'save/reopen (still recalls)', 'and a reopened setlist still sends its program change on its own channel',
        ['C328'], (await kit.sent()).map((m) => m.hex));
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
