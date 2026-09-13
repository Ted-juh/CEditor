/**
 * behaviourRecorder.mjs — deep behavioural pass over the Phrase Recorder.
 *
 * The note twin of the Gesture Looper: you play, it keeps what you played, and it plays it back
 * round a loop. So the evidence is in two directions and both are the note funnel — what goes IN
 * has to arrive in the take, and what the take holds has to come back OUT, transposed, scaled and
 * re-channelled as the properties say.
 *
 * The live take lives in the preview SESSION until the loop seam commits it to the document. That
 * is not a detail to route around: it is the component's own undo contract — one step for the whole
 * take, at the moment it stops being edited — so the session is read where the take is still being
 * made, and the document where it has been committed, and the rows say which.
 *
 * Run: node browser-checks/behaviourRecorder.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('recorder');
const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const midiOn = (ch, note, vel = 100) => `${hx(0x90 + ch - 1)}${hx(note)}${hx(vel)}`;
const midiOff = (ch, note) => `${hx(0x80 + ch - 1)}${hx(note)}00`;
const sendMidi = async (hex, settle = 180) => {
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
  await kit.fresh();
  {
    const R = 'Recorder';
    const RW = 560;
    const RH = 220;
    const BASE = { 'Transform.x': 40, 'Transform.y': 260,
      'Transform.width': RW, 'Transform.height': RH,
      'Recorder.state': 'idle', 'Recorder.playing': false, 'Recorder.source': 'both',
      'Recorder.once': false, 'Recorder.countIn': 0, 'Recorder.slot': 0,
      'Recorder.syncToTransport': false, 'Recorder.seconds': 4, 'Recorder.channel': 1,
      'Recorder.transpose': 0, 'Recorder.velocityScale': 1, 'Recorder.snapToScale': false,
      'Recorder.key': 0, 'Recorder.scale': 'minor', 'Recorder.editable': true,
      'Recorder.showHeader': true, 'Recorder.showGutter': true, 'Recorder.minSpan': 12,
      'Recorder.gridDivisions': 0, 'Recorder.take': { events: [], pending: {} } };
    let rid = await kit.make(R, BASE);
    await kit.preview(true);

    /** The take as the component currently holds it: the live one while it is being made. */
    const liveTake = async () => (await kit.session(rid))?.recorderTake
      ?? (await kit.read(rid, 'Recorder.take'));
    const eventCount = async () => (await liveTake())?.events?.length ?? 0;
    /**
     * A RECORDER THAT HAS NOT RECORDED YET, which is the only honest way to get an empty take.
     *
     * `liveTakeFor` reads `recorderTakeLive[id]` — a module-level map inside the surface — before it
     * reads the session or the document, and nothing outside the surface can clear it. So writing
     * `Recorder.take = { events: [] }` empties the file and changes nothing the component plays, and
     * clearing the session's copy does not reach it either. Both were tried here, and the take went
     * on accumulating across scenarios until a check that should have seen one note saw seven and
     * read as a product fault.
     *
     * A new control has no entry in that map. That is also what a person gets when they open a
     * panel, so the fixture is the real starting state rather than a cleared one.
     */
    const freshRecorder = async (patch = {}) => {
      if (rid) {
        await kit.page.evaluate(async (id) => {
          const { removeControl } = await import('/src/CE_Application/stores/controls.js');
          removeControl(id);
        }, rid);
        await kit.settle(200);
      }
      rid = await kit.make(R, { ...BASE, ...patch });
      await kit.settle(300);
      return rid;
    };
    /** Play one note into the hardware input, held for `ms`. */
    const playIn = async (note, { channel = 1, velocity = 100, ms = 200 } = {}) => {
      await sendMidi(midiOn(channel, note, velocity), ms);
      await sendMidi(midiOff(channel, note), 120);
    };
    const record = async (notes, { ms = 200, keep = {} } = {}) => {
      await freshRecorder(keep);
      await kit.set(rid, { 'Recorder.state': 'recording' });
      await kit.settle(220);
      for (const n of notes) await playIn(n, { ms });
      await kit.set(rid, { 'Recorder.state': 'idle' });
      await kit.settle(250);
    };

    // --- state 'recording' + source: what gets captured ------------------------------------------
    {
      await freshRecorder();
      await playIn(60);
      led.check(R, "state 'idle'", 'an idle recorder captures nothing, however much is played at it',
        0, await eventCount());
      await record([60, 64]);
      const take = await liveTake();
      led.check(R, "state 'recording' + source 'both'", 'a recording one keeps what arrived on the input, note for note',
        [60, 64], (take?.events ?? []).map((e) => e.note).sort((a, b) => a - b));
      led.check(R, 'the take keeps the velocity too', 'and the velocity each note was played at',
        [100], [...new Set((take?.events ?? []).map((e) => e.velocity))]);
    }

    // --- source 'panel' / 'input': two capture doors, deliberately different in kind -----------------
    {
      // A Chord Pad is the panel's own note source; the hardware input is the other door.
      // ABOVE the recorder, not below it. At y=380 the pad's own box is on screen but its centre
      // lands past the bottom of the usable canvas, so the click reaches the editor chrome instead
      // and the pad sounds nothing — which reads as "source 'panel' captured nothing" and is a
      // missed click. The row that says the panel door is CLOSED cannot tell the two apart either,
      // so the pad is proven to sound before either is believed.
      const pad = await kit.make('ChordPad', { 'Transform.x': 40, 'Transform.y': 40,
        'Transform.width': 300, 'Transform.height': 160, 'ChordPad.layout': 'grid',
        'ChordPad.channel': 4 });
      await kit.settle(250);
      const padBox = await kit.box(pad);
      const strikePad = async () => {
        await kit.click({ x: padBox.x + padBox.w * 0.2, y: padBox.y + padBox.h * 0.6 });
        await kit.settle(260);
      };
      const capturedFrom = async (source, act) => {
        await freshRecorder({ 'Recorder.source': source });
        await kit.set(rid, { 'Recorder.state': 'recording' });
        await kit.settle(250);
        await act();
        await kit.set(rid, { 'Recorder.state': 'idle' });
        await kit.settle(250);
        return eventCount();
      };
      // THE FIXTURE HAS TO MAKE A NOISE, or "ignored it" and "never happened" are the same reading.
      await kit.forget();
      await strikePad();
      led.check(R, 'the panel fixture really plays', 'the Chord Pad sounds a chord when struck, so a row that says the recorder ignored it means something',
        true, ons(await kit.notes()).length >= 3);
      led.check(R, "source 'input' (takes the hardware)", 'listening to the input keeps a played key',
        true, (await capturedFrom('input', () => playIn(62))) > 0);
      led.check(R, "source 'input' (ignores the panel)", 'and ignores the panel’s own controls',
        0, await capturedFrom('input', strikePad));
      led.check(R, "source 'panel' (takes the panel)", 'listening to the panel keeps what a pad played',
        true, (await capturedFrom('panel', strikePad)) > 0);
      led.check(R, "source 'panel' (ignores the hardware)", 'and ignores the hardware input',
        0, await capturedFrom('panel', () => playIn(62)));
      led.check(R, "source 'both'", 'and both doors open takes either',
        true, (await capturedFrom('both', () => playIn(62))) > 0
          && (await capturedFrom('both', strikePad)) > 0);
      await kit.page.evaluate(async (id) => {
        const { removeControl } = await import('/src/CE_Application/stores/controls.js');
        removeControl(id);
      }, pad);
      await kit.settle(250);
      await kit.set(rid, { 'Recorder.source': 'both' });
    }

    // --- playing + channel + transpose + velocityScale: what comes back OUT ----------------------------
    {
      await record([60]);
      // THE TAKE BEFORE THE PLAYBACK. Without this the next row cannot say whether nothing came
      // back because playback is broken or because nothing was recorded in the first place, and
      // the two want completely different investigations.
      led.check(R, 'the take is there to play', 'one note was recorded before playback is asked for',
        [60], ((await liveTake())?.events ?? []).map((e) => e.note));
      const playedBack = async (ms = 2600) => {
        await kit.forget();
        await kit.set(rid, { 'Recorder.playing': true });
        await kit.settle(ms);
        await kit.set(rid, { 'Recorder.playing': false });
        await kit.settle(250);
        return ons(await kit.notes());
      };
      await kit.set(rid, { 'Recorder.seconds': 1, 'Recorder.channel': 1,
        'Recorder.transpose': 0, 'Recorder.velocityScale': 1 });
      const plain = await playedBack();
      led.check(R, 'playing (true)', 'the take comes back round the loop, at the pitch it was played',
        true, plain.length >= 2 && plain.every((e) => e.note === 60));
      led.check(R, 'seconds (the loop length)', 'a one-second loop plays it about twice in two and a half',
        true, plain.length >= 2 && plain.length <= 4);
      await kit.set(rid, { 'Recorder.playing': false });
      await kit.forget();
      await kit.settle(1600);
      led.check(R, 'playing (false)', 'and stops coming back when playback is off', 0, ons(await kit.notes()).length);

      await kit.set(rid, { 'Recorder.transpose': -12, 'Recorder.channel': 9, 'Recorder.velocityScale': 0.5 });
      const shifted = await playedBack(1600);
      led.check(R, 'transpose + channel + velocityScale',
        'playback drops an octave, moves to the declared channel and halves the velocity — all three at once',
        { note: [48], channel: [9], velocity: [50] },
        { note: [...new Set(shifted.map((e) => e.note))],
          channel: [...new Set(shifted.map((e) => e.channel))],
          velocity: [...new Set(shifted.map((e) => e.velocity))] });
      // Out of range is DROPPED, not clamped: clamping piles every stray note onto 0 or 127, which
      // sounds like a stuck key.
      await kit.set(rid, { 'Recorder.transpose': -48 });
      const dropped = await playedBack(1600);
      led.check(R, 'transpose (out of range is dropped, not clamped)',
        'a note transposed below zero is silent rather than piling onto note 0',
        0, dropped.filter((e) => e.note === 0).length);
      await kit.set(rid, { 'Recorder.transpose': 0, 'Recorder.channel': 1, 'Recorder.velocityScale': 1 });
    }

    // --- key + scale: what they actually reach ------------------------------------------------------
    {
      /**
       * snapToScale IS NOT A PLAYBACK PROPERTY, and the first version of this block assumed it was.
       *
       * `snapNoteToScale` is called from exactly one place: `quantizeTake`, which in turn is called
       * from exactly one place, the Quantise button in the Recorder inspector. Nothing the rendered
       * control or the ticker does consults it, so an out-of-key note plays as recorded whether the
       * flag is on or off — and the row that asserted "off plays it as recorded" passed for a reason
       * that had nothing to do with the property. Listed as unverified below with the call path
       * named, rather than left as a green row that means nothing.
       *
       * `key` and `scale` DO reach the rendered control, through a different door: they decide
       * whether the pitch gutter spells in sharps or flats. That is a real, visible effect of both
       * properties and it is what this block measures.
       */
      await record([61, 66], { keep: { 'Recorder.showGutter': true } });
      await kit.set(rid, { 'Recorder.key': 0, 'Recorder.scale': 'major' });
      await kit.settle(250);
      const sharps = await kit.texts(rid);
      await kit.set(rid, { 'Recorder.key': 0, 'Recorder.scale': 'minor' });
      await kit.settle(250);
      const flats = await kit.texts(rid);
      led.check(R, 'key + scale (the gutter spelling)',
        'C major spells the black notes as sharps and C minor spells them as flats — the same pitches, named the way the key names them',
        { major: true, minor: true },
        { major: sharps.includes('C♯4') && !sharps.includes('D♭4'),
          minor: flats.includes('D♭4') && !flats.includes('C♯4') });
      await kit.set(rid, { 'Recorder.key': 5, 'Recorder.scale': 'major' });
      await kit.settle(250);
      led.check(R, 'key (a flat key spells flats)',
        'and F major, which has a flat in it, spells them as flats too',
        true, (await kit.texts(rid)).includes('D♭4'));
      await kit.set(rid, { 'Recorder.key': 0, 'Recorder.scale': 'minor' });
    }

    // --- once: one pass, then stop -----------------------------------------------------------------------
    {
      await freshRecorder({ 'Recorder.seconds': 1, 'Recorder.once': true });
      await kit.set(rid, { 'Recorder.state': 'armed', 'Recorder.playing': true });
      await kit.settle(2600);
      const afterOnce = String(await kit.read(rid, 'Recorder.state'));
      await kit.set(rid, { 'Recorder.once': false, 'Recorder.state': 'idle' });
      await kit.settle(250);
      led.check(R, 'once (true)', 'a single-pass recorder drops back to idle at the seam instead of layering',
        'idle', afterOnce);
      await kit.set(rid, { 'Recorder.state': 'armed', 'Recorder.playing': true });
      await kit.settle(2600);
      const afterLayering = String(await kit.read(rid, 'Recorder.state'));
      await kit.set(rid, { 'Recorder.state': 'idle' });
      await kit.settle(250);
      led.check(R, 'once (false)', 'and a layering one keeps going round',
        true, afterLayering === 'recording' || afterLayering === 'overdub');
    }

    // --- state 'armed' + countIn: the take's downbeat is the loop's downbeat ------------------------------
    {
      await freshRecorder({ 'Recorder.seconds': 1, 'Recorder.countIn': 0 });
      await kit.set(rid, { 'Recorder.playing': true, 'Recorder.state': 'armed' });
      await kit.settle(1600);
      led.check(R, "state 'armed'", 'arming waits for the top of the next loop and then records',
        true, ['recording', 'overdub'].includes(String(await kit.read(rid, 'Recorder.state'))));
      await freshRecorder({ 'Recorder.seconds': 1, 'Recorder.countIn': 2 });
      await kit.set(rid, { 'Recorder.playing': true, 'Recorder.state': 'armed' });
      await kit.settle(1400);
      const stillArmed = String(await kit.read(rid, 'Recorder.state'));
      await kit.settle(2200);
      const eventually = String(await kit.read(rid, 'Recorder.state'));
      led.check(R, 'countIn', 'a two-lap count-in is still waiting after one lap and recording after three',
        { afterOneLap: 'armed', later: true },
        { afterOneLap: stillArmed, later: ['recording', 'overdub'].includes(eventually) });
      await kit.set(rid, { 'Recorder.state': 'idle', 'Recorder.countIn': 0, 'Recorder.playing': false });
    }

    // --- syncToTransport + bars: the loop is bars rather than seconds ---------------------------------------
    {
      await kit.set(rid, { 'Recorder.syncToTransport': true, 'Recorder.bars': 2 });
      await kit.settle(220);
      led.check(R, 'syncToTransport + bars (the readout)', 'the header says the length in bars rather than seconds',
        true, (await kit.texts(rid)).some((t) => t.includes('2 bars')));
      await kit.set(rid, { 'Recorder.bars': 1 });
      await kit.settle(220);
      led.check(R, 'bars (singular)', 'and says one bar rather than one bars',
        true, (await kit.texts(rid)).some((t) => t.includes('1 bar') && !t.includes('bars')));
      await kit.set(rid, { 'Recorder.syncToTransport': false, 'Recorder.seconds': 2.5 });
      await kit.settle(220);
      led.check(R, 'seconds (the readout)', 'free-running it says the length in seconds, to one decimal',
        true, (await kit.texts(rid)).some((t) => t.includes('2.5s')));
      await kit.set(rid, { 'Recorder.seconds': 1 });
    }

    // --- editable: click the roll to arm ----------------------------------------------------------------------
    {
      await freshRecorder({ 'Recorder.editable': true });
      await kit.settle(250);
      const box = await kit.box(rid);
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h * 0.6 });
      await kit.settle(300);
      led.check(R, 'editable (click to arm)', 'clicking the roll arms the recorder',
        'armed', String(await kit.read(rid, 'Recorder.state')));
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h * 0.6 });
      await kit.settle(300);
      led.check(R, 'editable (click again to change your mind)', 'and clicking again disarms it rather than starting',
        'idle', String(await kit.read(rid, 'Recorder.state')));
      await kit.set(rid, { 'Recorder.editable': false });
      await kit.click({ x: box.x + box.w / 2, y: box.y + box.h * 0.6 });
      await kit.settle(300);
      led.check(R, 'editable (false)', 'a locked recorder ignores the click',
        'idle', String(await kit.read(rid, 'Recorder.state')));
      await kit.set(rid, { 'Recorder.editable': true });
    }

    // --- the drawing: showHeader / showGutter / minSpan / gridDivisions / the colours ----------------------------
    {
      await freshRecorder({ 'Recorder.showHeader': true, 'Recorder.showGutter': true,
        'Recorder.gridDivisions': 8 });
      await kit.settle(250);
      led.check(R, 'the empty prompt', 'an empty recorder says what to do rather than drawing an empty roll',
        true, (await kit.texts(rid)).includes('arm, then play'));
      const bars = async () => kit.shapes(rid, 'rect', (n) => n.rx === 1.5);
      // `record` starts a fresh recorder, so the drawing settings have to ride along with it.
      await record([60, 67], { keep: { 'Recorder.showHeader': true, 'Recorder.showGutter': true,
        'Recorder.gridDivisions': 8 } });
      led.check(R, 'the take is drawn', 'a recorded take is drawn as one bar per note',
        2, (await bars()).length);
      led.check(R, 'the take says how many', 'and the header counts them',
        true, (await kit.texts(rid)).some((t) => t.includes('2 notes')));

      /**
       * THE ROLL, NOT A BAR. Turning the gutter off moves the roll's left edge 26px left AND makes
       * it 26px wider, because `recorderGeometry` is handed `width - gutterW`. A note's bar sits at
       * `x0 + t * w`, so it shifts by `-26 + t * 26` — neither 26 nor any constant, and which
       * constant it happened to look like depended on where in the loop the note landed.
       *
       * The grid lines give the roll's own box exactly: there is one per division starting AT the
       * left edge, so the first is x0 and the gap between two of them is w/divisions. (It is not
       * one gap in from x0 — that guess put the left edge a whole division to the left, while the
       * widths it derived from the same lines were already exact, which is what gave it away.)
       */
      const rollBox = async () => {
        const xs = (await kit.shapes(rid, 'line', (n) => n.x1 === n.x2)).map((n) => n.x1)
          .sort((a, b) => a - b);
        if (xs.length < 2) return null;
        return { x0: Math.round(xs[0]), w: Math.round((xs[1] - xs[0]) * 8) };
      };
      await kit.set(rid, { 'Recorder.showGutter': true, 'Recorder.gridDivisions': 8 });
      await kit.settle(220);
      const withGutter = await rollBox();
      await kit.set(rid, { 'Recorder.showGutter': false });
      await kit.settle(220);
      const withoutGutter = await rollBox();
      led.check(R, 'showGutter', 'the gutter takes twenty-six pixels off the left of the roll and gives them back when it goes, and the pitch labels go with it',
        { x0: 34, w: RW - 16 - 26, thenX0: 8, thenW: RW - 16, labelled: false },
        { x0: withGutter?.x0, w: withGutter?.w, thenX0: withoutGutter?.x0, thenW: withoutGutter?.w,
          labelled: (await kit.texts(rid)).some((t) => /^[A-G][\u266d#]?-?\d$/.test(t)) });
      await kit.set(rid, { 'Recorder.showGutter': true });
      await kit.settle(220);
      led.check(R, 'showGutter (the labels come back)', 'and with it on the rows are named',
        true, (await kit.texts(rid)).some((t) => /^[A-G][♭#]?-?\d$/.test(t)));

      const topOfRoll = async () => Math.min(...(await kit.shapes(rid, 'line')).map((n) => n.y1));
      await kit.set(rid, { 'Recorder.showHeader': true });
      await kit.settle(220);
      const headed = await topOfRoll();
      await kit.set(rid, { 'Recorder.showHeader': false });
      await kit.settle(220);
      led.check(R, 'showHeader', 'dropping the header lifts the roll by twenty pixels',
        headed - 20, await topOfRoll());
      await kit.set(rid, { 'Recorder.showHeader': true });

      const gridLines = async () => (await kit.shapes(rid, 'line', (n) => n.x1 === n.x2)).length;
      await kit.set(rid, { 'Recorder.gridDivisions': 8 });
      await kit.settle(220);
      const eight = await gridLines();
      await kit.set(rid, { 'Recorder.gridDivisions': 4 });
      await kit.settle(220);
      led.check(R, 'gridDivisions', 'eight divisions draw twice the lines four do',
        true, eight > 0 && eight > (await gridLines()));
      await kit.set(rid, { 'Recorder.gridDivisions': 8 });

      // minSpan: the roll fits itself to the take, but never shows fewer rows than this, or one
      // recorded octave would be three invisible pixels.
      await kit.set(rid, { 'Recorder.minSpan': 12 });
      await kit.settle(220);
      const tall = (await bars()).map((n) => n.height)[0];
      await kit.set(rid, { 'Recorder.minSpan': 48 });
      await kit.settle(220);
      const short = (await bars()).map((n) => n.height)[0];
      led.check(R, 'minSpan', 'a wider minimum span spreads the same take over more rows, so each note is drawn shorter',
        true, tall > short * 2);
      await kit.set(rid, { 'Recorder.minSpan': 12 });

      await kit.set(rid, { 'Recorder.faceColour': 'FF101824', 'Recorder.noteColour': 'FF44CCFF',
        'Recorder.recordColour': 'FFFF3355', 'Recorder.playheadColour': 'FFFFDD00',
        'Recorder.labelColour': 'FFAACC99' });
      await kit.settle(250);
      const g = await kit.geo(rid);
      led.check(R, 'faceColour / noteColour / labelColour', 'the face, the recorded bars and the labels take their colours',
        { face: true, notes: true, label: true },
        { face: g.some((n) => n.tag === 'rect' && n.fill === rgba('FF101824')),
          notes: g.some((n) => n.tag === 'rect' && n.rx === 1.5 && n.fill === rgba('FF44CCFF')),
          label: g.some((n) => n.tag === 'text' && n.fill === rgba('FFAACC99')) });
      await kit.set(rid, { 'Recorder.state': 'recording' });
      await kit.settle(250);
      const rec = await kit.geo(rid);
      await kit.set(rid, { 'Recorder.state': 'idle' });
      led.check(R, 'recordColour', 'and the header turns the record colour while it is recording',
        true, rec.some((n) => (n.tag === 'circle' || n.tag === 'text') && n.fill === rgba('FFFF3355')));
      await kit.set(rid, { 'Recorder.playing': true });
      await kit.settle(400);
      const playing = await kit.geo(rid);
      await kit.set(rid, { 'Recorder.playing': false });
      led.check(R, 'playheadColour', 'and a playhead sweeps in its own colour while it plays',
        true, playing.some((n) => n.tag === 'line' && n.stroke === rgba('FFFFDD00')));
    }

    led.unverified(R, 'slot / slots', 'several takes on one recorder',
      'swapping is an editor action on the Recorder inspector rather than something the rendered '
      + 'control does; the copy-in-each-direction rule it exists for is pure and unit-tested');
    led.unverified(R, 'chain / chainOn / chainLoop', 'a song chain of stored takes',
      'the same chain engine the Phrase uses, and unverified for the same reason: the swap happens '
      + 'in the preview session rather than the document, so what could be asserted is which take '
      + 'the session holds, which is state and not behaviour');
    led.unverified(R, 'grid / quantizeStrength / quantizeLength / snapToScale',
      'pull the take onto a grid, and pitch-correct it into the key',
      'all four are arguments to `quantizeTake`, which has exactly one caller in src/: the Quantise '
      + 'button in RecorderEditor.svelte. Neither the rendered control nor the ticker consults them, '
      + 'so an out-of-key note plays back exactly as recorded whatever snapToScale says. Not a '
      + 'defect — a destructive edit applied on demand is a reasonable design — but it means these '
      + 'are inspector behaviour rather than playback behaviour, and a green playback row for them '
      + 'would have meant nothing. quantizeTake itself is pure and unit-tested.');
    led.unverified(R, 'followPanelKey', 'take the key and scale from the panel instead of its own',
      'a panel-level broadcast written by another control; the same mechanism listed for the '
      + 'Harmoniser and the Phrase');

    // --- save and reopen -----------------------------------------------------------------------------------------
    {
      await record([55, 62]);
      await kit.set(rid, { 'Recorder.channel': 8, 'Recorder.transpose': 5,
        'Recorder.velocityScale': 0.8, 'Recorder.seconds': 1, 'Recorder.playing': false });
      await kit.settle(300);
      // Commit the live take to the document so there is something to save: the session's copy is
      // deliberately not part of the file.
      const events = (await liveTake())?.events ?? [];
      await kit.set(rid, { 'Recorder.take': { events, pending: {} } });
      await kit.settle(300);
      const before = await kit.geo(rid);
      const again = await kit.reopen(rid);
      led.check(R, 'save/reopen (the roll)', 'every bar, grid line and pitch label returns identical',
        JSON.stringify(before), JSON.stringify(await kit.geo(again)));
      rid = again;
      await kit.preview(true);
      await kit.forget();
      await kit.set(rid, { 'Recorder.playing': true });
      await kit.settle(1700);
      await kit.set(rid, { 'Recorder.playing': false });
      await kit.settle(250);
      const out = ons(await kit.notes());
      led.check(R, 'save/reopen (still plays the take)',
        'a reopened recorder plays the same two notes, transposed up a fourth, on its own channel at its own velocity',
        { notes: [60, 67], channel: [8], velocity: [80] },
        { notes: [...new Set(out.map((e) => e.note))].sort((a, b) => a - b),
          channel: [...new Set(out.map((e) => e.channel))],
          velocity: [...new Set(out.map((e) => e.velocity))] });
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
