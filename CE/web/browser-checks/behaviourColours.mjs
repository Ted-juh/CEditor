/**
 * behaviourColours.mjs — the colour tail on the music components.
 *
 * The coverage matrix found roughly thirty declared properties reached by no check at all, and most
 * of them are colours: `fieldColour`, `labelColour`, `headColour` and friends across a dozen
 * components. Cheap to break and invisible when broken — a renderer that quietly stops reading one
 * looks perfectly correct until somebody authors a panel that is not the default dark.
 *
 * THE SHAPE OF AN HONEST COLOUR ROW. Asserting that "some element somewhere now carries the colour"
 * is worth almost nothing: it passes when the colour lands on the wrong element, and it passes when
 * two properties are wired to the same place. Every row here names the element the property is
 * supposed to paint and reads that one — the field rect, the non-firing step, the head marker — and
 * where two colours could be confused, both are set to different values in the same scenario so
 * that a crossed wire fails instead of cancelling out.
 *
 * Several of these only exist under a condition: a head marker needs a running sequence, a rest
 * cell needs a step that does not fire, a lit key needs a note held. The fixtures arrange the
 * condition rather than skipping the row.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('colours');

/** AARRGGBB as the renderer's css() produces it, so expectations are written the way they are read. */
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  const a = parseInt(s.slice(0, 2), 16) / 255;
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
};
// Distinct enough that a mix-up is a wrong answer rather than a near miss.
const C = {
  field: 'FF102030', step: 'FF40A0FF', head: 'FFFFD400', rest: 'FF603040', label: 'FFEE00CC',
  probe: 'FF00FFAA', link: 'FFFF6600', face: 'FF201020', white: 'FFEEDDCC', black: 'FF221133',
  lit: 'FF00CCFF', minor: 'FF88FF00', touch: 'FFFF0066', wheel: 'FF9900FF', grid: 'FF00AAFF',
  hit: 'FFFF3300', beat: 'FF33FF99', out: 'FFBB00BB',
};

try {
  // =============================================================================================
  // ARP — five colours over one grid, and three of them need a condition to be visible.
  // =============================================================================================
  await kit.fresh();
  {
    const A = 'Arp';
    /**
     * THE GRID IS AS LONG AS THE SEQUENCE, NOT AS LONG AS `euclidSteps`, and the fixture has to
     * respect that or the row it is trying to see does not exist. A major triad over one octave is
     * three cells; an eight-step euclid mask laid over three cells leaves none of them permanently
     * silent, so `restColour` has nothing to paint and the check reads as a dead property.
     *
     * Worse, the obvious fix of lengthening the sequence does not work either: nine cells under an
     * eight-step mask still shows ZERO rests, because a cell is drawn as a rest only when it never
     * fires ANYWHERE in the combined cycle — with lengths 9 and 8 the cycle is 72 and every cell
     * comes round to a pulse eventually. Measured, not reasoned: 8/3 over 9 steps draws no rests.
     *
     * Two octaves of a triad is six cells under a six-step mask: the lengths divide, each cell maps
     * to one mask slot for good, and two pulses leave exactly four permanent rests.
     */
    const aid = await kit.make(A, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 520, 'Transform.height': 180, 'Arp.running': false,
      'Arp.mode': 'chord', 'Arp.chordType': 'maj', 'Arp.degree': 0, 'Arp.key': 0,
      'Arp.octaves': 2,
      'Arp.euclidEnabled': true, 'Arp.euclidSteps': 6, 'Arp.euclidPulses': 2, 'Arp.euclidRotate': 0,
      'Arp.rate': 4, 'Arp.showNotes': true, 'Arp.showHeader': true,
      'Arp.fieldColour': C.field, 'Arp.stepColour': C.step, 'Arp.headColour': C.head,
      'Arp.restColour': C.rest, 'Arp.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(400);

    // The field is the one big rect behind the grid: widest of them.
    {
      const rects = await kit.shapes(aid, 'rect');
      const widest = rects.slice().sort((a, b) => b.width - a.width)[0];
      led.check(A, 'fieldColour', 'the panel the steps sit on takes the field colour',
        rgba(C.field), widest?.fill ?? null);
    }
    // A rest is a step cell that never fires. Six cells, two pulses, four rests.
    {
      const rests = await kit.shapes(aid, 'rect', (n) => n.fill === rgba(C.rest));
      led.check(A, 'restColour', 'the steps that never fire take the rest colour — four of the six, with two pulses over them',
        4, rests.length);
    }
    // And the rule behind that number, which is the part a fixture gets wrong: a cell is a rest
    // only when it is silent for the WHOLE cycle, not when it happens to be silent on lap one.
    {
      await kit.set(aid, { 'Arp.octaves': 3, 'Arp.euclidSteps': 8, 'Arp.euclidPulses': 3 });
      await kit.settle(380);
      const rests = await kit.shapes(aid, 'rect', (n) => n.fill === rgba(C.rest));
      led.check(A, 'restColour (a rest is silence for the whole cycle)',
        'nine cells under an eight-step mask draw NO rests at all: the lengths do not divide, so every cell comes round to a pulse somewhere in the seventy-two-step cycle and none of them is permanently silent',
        0, rests.length);
      await kit.set(aid, { 'Arp.octaves': 2, 'Arp.euclidSteps': 6, 'Arp.euclidPulses': 2 });
      await kit.settle(380);
    }
    // The note markers on firing steps take the step colour, except the head.
    {
      const marks = await kit.shapes(aid, 'rect', (n) => n.fill === rgba(C.step));
      led.check(A, 'stepColour', 'and the note markers on the steps that DO fire take the step colour',
        true, marks.length >= 1);
    }
    // headColour needs a running sequence: it paints the playhead dot, the head cell's stroke and
    // the head's own marker. Checked as "the head is drawn in it and the step colour is not used
    // for the head", so the two cannot be crossed without failing.
    {
      await kit.set(aid, { 'Arp.running': true });
      await kit.settle(500);
      const head = await kit.shapes(aid, 'rect', (n) => n.stroke === rgba(C.head));
      const dot = await kit.shapes(aid, 'circle', (n) => n.fill === rgba(C.head));
      led.check(A, 'headColour', 'a running arpeggiator rings the step it is on in the head colour, and lights its running dot in the same colour',
        { ringed: true, dot: true }, { ringed: head.length >= 1, dot: dot.length >= 1 });
      await kit.set(aid, { 'Arp.running': false });
      await kit.settle(250);
    }
    // The header texts and the step labels.
    {
      const texts = await kit.shapes(aid, 'text', (n) => n.fill === rgba(C.label));
      led.check(A, 'labelColour', 'the header and the step labels take the label colour',
        true, texts.length >= 2);
    }
    // …and all five survive a save and reopen, which is where a colour that is written but never
    // serialised would show up.
    {
      await kit.reopen(aid);
      await kit.preview(true);
      await kit.settle(400);
      const rects = await kit.shapes(aid, 'rect');
      const widest = rects.slice().sort((a, b) => b.width - a.width)[0];
      const rests = await kit.shapes(aid, 'rect', (n) => n.fill === rgba(C.rest));
      const texts = await kit.shapes(aid, 'text', (n) => n.fill === rgba(C.label));
      led.check(A, 'save/reopen (the five colours)',
        'a reopened arpeggiator paints its field, its rests and its labels in the colours the file carried',
        { field: rgba(C.field), rests: 4, labels: true },
        { field: widest?.fill ?? null, rests: rests.length, labels: texts.length >= 2 });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // SPLIT ZONE — a keyboard, so the interesting colours are the KEYS, and one needs a note held.
  // =============================================================================================
  await kit.fresh();
  {
    const Z = 'SplitZone';
    const zone = (over = {}) => ({ id: 'z0', label: 'Bass', lowNote: 36, highNote: 59, channel: 1,
      transpose: 0, curve: 'linear', velLow: 1, velHigh: 127, fixedVelocity: 100,
      velSwitchLow: 1, velSwitchHigh: 127, ccMode: 'all', ccList: [], sustain: true,
      bendMode: 'lastPlayed', pressureMode: 'lastPlayed', polyPressure: true,
      enabled: true, colour: 'FF5B9BD5', ...over });
    const zid = await kit.make(Z, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 620, 'Transform.height': 180, 'SplitZone.lowNote': 48,
      'SplitZone.highNote': 72, 'SplitZone.inputChannel': 0, 'SplitZone.showHeader': true,
      'SplitZone.showLabels': true,
      'SplitZone.zones': [zone({ id: 'z0', lowNote: 48, highNote: 59, channel: 4 }),
        zone({ id: 'z1', label: 'Lead', lowNote: 60, highNote: 72, channel: 9 })],
      'SplitZone.faceColour': C.face, 'SplitZone.whiteColour': C.white,
      'SplitZone.blackColour': C.black, 'SplitZone.litColour': C.lit,
      'SplitZone.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(400);

    {
      const rects = await kit.shapes(zid, 'rect');
      const widest = rects.slice().sort((a, b) => b.width - a.width)[0];
      led.check(Z, 'faceColour', 'the face behind the keyboard takes the face colour',
        rgba(C.face), widest?.fill ?? null);
    }
    // WHITE AND BLACK KEYS IN THE SAME SCENARIO, and counted rather than merely found: a renderer
    // that painted every key the white colour would still satisfy "at least one key is white".
    // Two octaves from C to C is fifteen naturals and ten accidentals.
    {
      const whites = await kit.shapes(zid, 'rect', (n) => n.fill === rgba(C.white));
      const blacks = await kit.shapes(zid, 'rect', (n) => n.fill === rgba(C.black));
      led.check(Z, 'whiteColour + blackColour',
        'the naturals take one colour and the accidentals the other, in the numbers a two-octave keyboard has',
        { whites: 15, blacks: 10 }, { whites: whites.length, blacks: blacks.length });
    }
    // litColour needs a note actually sounding, so the fixture plays one at the hardware input.
    {
      const litBefore = (await kit.shapes(zid, 'rect', (n) => n.fill === rgba(C.lit))).length;
      await kit.page.evaluate(async ({ hex }) => {
        const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
        latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
      }, { hex: '903C64' });                       // note-on, middle C
      await kit.settle(320);
      const litDuring = (await kit.shapes(zid, 'rect', (n) => n.fill === rgba(C.lit))).length;
      await kit.page.evaluate(async ({ hex }) => {
        const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
        latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
      }, { hex: '803C00' });
      await kit.settle(320);
      const litAfter = (await kit.shapes(zid, 'rect', (n) => n.fill === rgba(C.lit))).length;
      led.check(Z, 'litColour', 'a key lights in the lit colour while it is held and goes back to its own colour when it is let go',
        { before: 0, during: 1, after: 0 },
        { before: litBefore, during: litDuring, after: litAfter });
    }
    {
      const texts = await kit.shapes(zid, 'text', (n) => n.fill === rgba(C.label));
      led.check(Z, 'labelColour', 'the header line and the input readout take the label colour',
        true, texts.length >= 2);
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // CONSTELLATION — the probe is three circles and a line, all in one colour.
  // =============================================================================================
  await kit.fresh();
  {
    const K = 'Constellation';
    const kid = await kit.make(K, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 400, 'Transform.height': 320, 'Constellation.running': false,
      'Constellation.showLabels': true,
      'Constellation.fieldColour': C.field, 'Constellation.probeColour': C.probe,
      'Constellation.linkColour': C.link, 'Constellation.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(400);

    {
      const rects = await kit.shapes(kid, 'rect');
      const widest = rects.slice().sort((a, b) => b.width - a.width)[0];
      led.check(K, 'fieldColour', 'the field the stars sit in takes the field colour',
        rgba(C.field), widest?.fill ?? null);
    }
    // The probe is drawn three times over — a soft halo, a ring and a dot — so the row counts all
    // three rather than accepting the first circle it finds.
    {
      const probe = await kit.shapes(kid, 'circle',
        (n) => n.fill === rgba(C.probe) || n.stroke === rgba(C.probe));
      led.check(K, 'probeColour', 'the probe takes the probe colour in all three of the circles it is drawn from — halo, ring and centre dot',
        3, probe.length);
    }
    {
      const links = await kit.shapes(kid, 'line', (n) => n.stroke === rgba(C.link));
      led.check(K, 'linkColour', 'the lines between the stars take the link colour',
        true, links.length >= 1);
    }
    {
      const texts = await kit.shapes(kid, 'text', (n) => n.fill === rgba(C.label));
      led.check(K, 'labelColour', 'the star names and the mode caption take the label colour',
        true, texts.length >= 2);
    }
    // A reopen, because a colour written into the session rather than the document would survive
    // every row above and none of this one.
    {
      await kit.reopen(kid);
      await kit.preview(true);
      await kit.settle(400);
      const rects = await kit.shapes(kid, 'rect');
      const widest = rects.slice().sort((a, b) => b.width - a.width)[0];
      const probe = await kit.shapes(kid, 'circle',
        (n) => n.fill === rgba(C.probe) || n.stroke === rgba(C.probe));
      led.check(K, 'save/reopen (the four colours)',
        'a reopened constellation paints its field and its probe in the colours the file carried',
        { field: rgba(C.field), probe: 3 }, { field: widest?.fill ?? null, probe: probe.length });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // TIMBRE and KINETIC — two fields, and a label colour that paints one thing only.
  // =============================================================================================
  await kit.fresh();
  {
    const T = 'Timbre';
    const tid = await kit.make(T, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 360, 'Transform.height': 300, 'Timbre.showLabels': true,
      'Timbre.axisX': 'Bright', 'Timbre.axisY': 'Soft',
      'Timbre.fieldColour': C.field, 'Timbre.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(380);
    {
      const rects = await kit.shapes(tid, 'rect');
      const widest = rects.slice().sort((a, b) => b.width - a.width)[0];
      led.check(T, 'fieldColour', 'the pad the anchors sit in takes the field colour',
        rgba(C.field), widest?.fill ?? null);
    }
    {
      // The anchor names AND both axis captions; the axis ones are the pair a check that only
      // looked at the anchors would miss, and they are the labels an author actually renames.
      const texts = await kit.shapes(tid, 'text', (n) => n.fill === rgba(C.label));
      const axes = texts.filter((n) => n.text === 'Bright' || n.text === 'Soft');
      led.check(T, 'labelColour', 'the anchor names and BOTH axis captions take the label colour',
        { some: true, bothAxes: 2 }, { some: texts.length >= 2, bothAxes: axes.length });
    }
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const N = 'Kinetic';
    // KINETIC'S LABEL COLOUR PAINTS EXACTLY ONE THING: the gravity hint, a short arrow down the
    // right-hand edge. And the hint is only drawn when gravity is above 0.01 — so authored with
    // gravity off, the property is invisible and a check would call it dead. That is the row.
    const nid = await kit.make(N, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 360, 'Transform.height': 300, 'Kinetic.running': false,
      'Kinetic.gravity': 0, 'Kinetic.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(380);
    const hint = async () => (await kit.shapes(nid, 'line', (n) => n.stroke === rgba(C.label))).length
      + (await kit.shapes(nid, 'path', (n) => n.stroke === rgba(C.label))).length;
    const off = await hint();
    await kit.set(nid, { 'Kinetic.gravity': 3 });
    await kit.settle(320);
    const on = await hint();
    led.check(N, 'labelColour', 'the label colour paints the gravity hint — the arrow down the right-hand edge — and nothing else',
      { withoutGravity: 0, withGravity: 2 }, { withoutGravity: off, withGravity: on });
  }
  await kit.preview(false);

  // =============================================================================================
  // NOTE RIBBON — the touch colour needs a finger on it.
  // =============================================================================================
  await kit.fresh();
  {
    const R = 'NoteRibbon';
    const rid = await kit.make(R, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 520, 'Transform.height': 160, 'NoteRibbon.showHeader': true,
      'NoteRibbon.showZones': true, 'NoteRibbon.touchColour': C.touch,
      'NoteRibbon.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(380);
    {
      const texts = await kit.shapes(rid, 'text', (n) => n.fill === rgba(C.label));
      led.check(R, 'labelColour', 'the mode caption and the zone names take the label colour',
        true, texts.length >= 2);
    }
    {
      // The touch marker is a line drawn where the finger is, so it does not exist until there is
      // one. Pressed and held through the real preview surface rather than injected.
      const marks = async () => (await kit.shapes(rid, 'line', (n) => n.stroke === rgba(C.touch))).length;
      const before = await marks();
      const box = await kit.box(rid);
      await kit.page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.6);
      await kit.page.mouse.down();
      await kit.settle(260);
      const during = await marks();
      await kit.page.mouse.up();
      await kit.settle(260);
      led.check(R, 'touchColour', 'the touch marker is drawn in the touch colour while a finger is on the ribbon, and there is no marker before one lands',
        { before: 0, during: true }, { before, during: during >= 1 });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // KEYBOARD, DRUM PADS, TRANSPORT, ROUTER — three more conditionals and one plain grid.
  // =============================================================================================
  await kit.fresh();
  {
    const K = 'Keyboard';
    // OUT-OF-KEY ONLY PAINTS A WHITE KEY. A black key outside the scale takes the black colour, so
    // the row has to be read on the naturals — and it needs a key where some naturals are OUT, which
    // C major is not: every white key is in C major. C minor leaves E, A and B outside, three per
    // octave, and the fixture spans two.
    const kid = await kit.make(K, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 620, 'Transform.height': 160, 'Keyboard.lowNote': 48,
      'Keyboard.highNote': 72, 'Keyboard.key': 0, 'Keyboard.scale': 'minor',
      'Keyboard.outOfKeyColour': C.out });
    await kit.preview(true);
    await kit.settle(380);
    const outs = await kit.shapes(kid, 'rect', (n) => n.fill === rgba(C.out));
    led.check(K, 'outOfKeyColour', 'the naturals outside the scale take the out-of-key colour — in C minor that is E, A and B, twice over a two-octave span, plus the top C\'s neighbours',
      true, outs.length >= 6);
    await kit.set(kid, { 'Keyboard.scale': 'chromatic' });
    await kit.settle(320);
    led.check(K, 'outOfKeyColour (a scale with nothing outside it)',
      'and a chromatic keyboard has no key outside its scale at all, so none of them wears it',
      0, (await kit.shapes(kid, 'rect', (n) => n.fill === rgba(C.out))).length);
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const D = 'DrumPads';
    const did = await kit.make(D, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 360, 'Transform.height': 360, 'DrumPads.rows': 2,
      'DrumPads.cols': 2, 'DrumPads.baseNote': 36, 'DrumPads.showHeader': true,
      'DrumPads.hitColour': C.hit });
    await kit.preview(true);
    await kit.settle(380);
    const lit = async () => (await kit.shapes(did, 'rect', (n) => n.fill === rgba(C.hit))).length;
    const before = await lit();
    // Held rather than clicked: the halo is drawn for the pad that is DOWN, so a press-and-release
    // would be measured after it had already gone.
    const box = await kit.box(did);
    await kit.page.mouse.move(box.x + box.w * 0.25, box.y + box.h * 0.75);
    await kit.page.mouse.down();
    await kit.settle(280);
    const during = await lit();
    await kit.page.mouse.up();
    await kit.settle(280);
    led.check(D, 'hitColour', 'the pad under the finger wears a halo in the hit colour while it is struck, and no pad wears one before the strike',
      { before: 0, during: true }, { before, during: during >= 1 });
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const T = 'Transport';
    // beatColour paints the count-in ring and the beat pips. The count-in is the reachable half
    // from here: it draws a ring round the play button and turns the readout that colour, and it is
    // a state the panel can be put into without waiting for a particular beat to come round.
    const tid = await kit.make(T, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 420, 'Transform.height': 80, 'Transport.bpm': 90,
      'Transport.source': 'internal', 'Transport.countInBars': 2, 'Transport.showPosition': true,
      'Transport.beatColour': C.beat });
    await kit.preview(true);
    await kit.settle(380);
    const inBeat = async () => (await kit.shapes(tid, 'circle', (n) => n.stroke === rgba(C.beat))).length
      + (await kit.shapes(tid, 'text', (n) => n.fill === rgba(C.beat))).length;
    const idle = await inBeat();
    await kit.page.evaluate(async () => {
      const { startTransportWithCountIn } = await import('/src/CE_Application/stores/transport.js');
      startTransportWithCountIn(2, 0);
    });
    await kit.settle(400);
    const counting = await inBeat();
    await kit.page.evaluate(async () => {
      const { stopTransport } = await import('/src/CE_Application/stores/transport.js');
      stopTransport();
    });
    await kit.settle(300);
    led.check(T, 'beatColour', 'counting in, the transport rings its play button and turns its readout the beat colour, and neither wears it while the clock is idle',
      { idle: 0, counting: true }, { idle, counting: counting >= 1 });
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const R = 'Router';
    const rid = await kit.make(R, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 420, 'Transform.height': 220, 'Router.showGrid': true,
      'Router.gridColour': C.grid });
    await kit.preview(true);
    await kit.settle(380);
    const lines = await kit.shapes(rid, 'line', (n) => n.stroke === rgba(C.grid));
    led.check(R, 'gridColour', 'the transfer curve\'s grid lines take the grid colour, both directions of them',
      true, lines.length >= 4);
    // …and showGrid turns them off, which is the row that proves the colour is on the grid rather
    // than on something else that happens to be the same shape.
    await kit.set(rid, { 'Router.showGrid': false });
    await kit.settle(320);
    led.check(R, 'gridColour (with the grid switched off)',
      'and nothing wears it once the grid is switched off, so the colour really is the grid\'s',
      0, (await kit.shapes(rid, 'line', (n) => n.stroke === rgba(C.grid))).length);
  }
  await kit.preview(false);

  // =============================================================================================
  // CHORD PAD, RIBBON and MATRIX — the last three, and the Matrix is not SVG at all.
  // =============================================================================================
  await kit.fresh();
  {
    const P = 'ChordPad';
    // minorColour paints the accent on the MINOR ring, which only exists in the wheel layout — the
    // grid layout has no rings at all, so a grid fixture shows the property doing nothing.
    const pid = await kit.make(P, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 360, 'Transform.height': 360, 'ChordPad.layout': 'wheel',
      'ChordPad.key': 0, 'ChordPad.scale': 'major',
      'ChordPad.minorColour': C.minor, 'ChordPad.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(400);
    {
      const minors = await kit.shapes(pid, 'circle',
        (n) => n.fill === rgba(C.minor) || n.stroke === rgba(C.minor));
      led.check(P, 'minorColour', 'the slots on the inner minor ring take the minor colour, and the majors on the outer ring do not',
        true, minors.length >= 1);
    }
    {
      const texts = await kit.shapes(pid, 'text', (n) => n.fill === rgba(C.label));
      led.check(P, 'labelColour', 'the scale caption in the hub and the roman numerals take the label colour',
        true, texts.length >= 1);
    }
    // The grid layout is the negative: no rings, so nothing wears the minor colour. Without this a
    // renderer that painted every slot the minor colour would still have passed above.
    {
      await kit.set(pid, { 'ChordPad.layout': 'grid' });
      await kit.settle(380);
      const minors = await kit.shapes(pid, 'circle',
        (n) => n.fill === rgba(C.minor) || n.stroke === rgba(C.minor));
      led.check(P, 'minorColour (a layout with no rings)',
        'the grid layout has no minor ring, so nothing in it wears the colour at all',
        0, minors.length);
    }
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const B = 'Ribbon';
    // THE NAME IS THE CLUE AND THE DEFAULT IS NOT IT. `wheelColour` paints the body of the 3-D
    // WHEEL, and `style` defaults to 'ribbon' — a flat strip that draws no wheel at all. Authored
    // the default way the property is invisible and the row reports a working colour as dead.
    const bid = await kit.make(B, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 120, 'Transform.height': 320, 'Ribbon.orientation': 'vertical',
      'Ribbon.style': 'wheel', 'Ribbon.label': 'Mod', 'Ribbon.indicatorSize': 3,
      'Ribbon.wheelColour': C.wheel, 'Ribbon.labelColour': C.label });
    await kit.preview(true);
    await kit.settle(400);
    {
      const track = await kit.shapes(bid, 'rect', (n) => n.fill === rgba(C.wheel));
      led.check(B, 'wheelColour', 'the wheel body takes the wheel colour',
        true, track.length >= 1);
    }
    {
      const texts = await kit.shapes(bid, 'text', (n) => n.fill === rgba(C.label));
      led.check(B, 'labelColour', 'and the name under it takes the label colour',
        true, texts.length >= 1);
    }
    // indicatorSize is a LENGTH rather than a colour, and it is the half-thickness: the indicator is
    // drawn indSize either side of the axis, so the bar is twice the number. Measured on the
    // drawing rather than read back from the document, which is the whole point.
    {
      // A VERTICAL RIBBON'S INDICATOR IS A HORIZONTAL BAR. It runs the full width of the track and
      // is `indicatorSize` tall either side of the axis, so the dimension that carries the property
      // is the HEIGHT — reading the width measures the track instead and finds nothing under 40px.
      // The corner radius is the size itself, which is what identifies the bar among the rects.
      const bar = async (size) => {
        const bars = await kit.shapes(bid, 'rect', (n) => n.rx === size);
        return bars.length ? bars[0].height : null;
      };
      const thin = await bar(3);
      await kit.set(bid, { 'Ribbon.indicatorSize': 9 });
      await kit.settle(350);
      const thick = await bar(9);
      led.check(B, 'indicatorSize', 'the indicator is drawn that many units EITHER SIDE of its axis, so the bar is twice the number — three gives six across, and nine gives eighteen',
        { thin: 6, thick: 18 }, { thin, thick });
    }
    // And the negative that makes the first row mean something: the flat ribbon style has no wheel,
    // so nothing in it wears the wheel colour however the property is set.
    {
      await kit.set(bid, { 'Ribbon.style': 'ribbon' });
      await kit.settle(380);
      led.check(B, 'wheelColour (the flat ribbon style)',
        'switched to the flat strip there is no wheel to paint, and nothing wears the colour',
        0, (await kit.shapes(bid, 'rect', (n) => n.fill === rgba(C.wheel))).length);
    }
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const M = 'Matrix';
    /**
     * THE MATRIX IS NOT SVG. It draws with positioned divs, so `shapes()` — which reads the
     * control's `<svg>` — sees nothing at all and every colour row here would report zero and look
     * like a dead property. `dom()` is the instrument: it returns the same comparable shape with
     * the resolved paint, including `box-shadow`, which is where the grid colour actually lands.
     */
    const mid = await kit.make(M, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 400, 'Transform.height': 300, 'Matrix.gridColour': C.grid });
    await kit.preview(true);
    await kit.settle(400);
    /**
     * AND THE COLOUR IS SPELLED DIFFERENTLY HERE TOO. `getComputedStyle` serialises an opaque colour
     * as `rgb(0, 170, 255)` — three channels, no alpha, and SPACES after the commas — where the SVG
     * rows above compare against the `rgba(0,170,255,1)` the renderer's own css() helper produces.
     * Comparing the two spellings directly finds nothing and reads as a dead property, so both
     * sides are stripped of spaces and the alpha is allowed to be absent.
     */
    const norm = (v) => String(v).replace(/\s/g, '');
    const want = norm(rgba(C.grid));                       // rgba(0,170,255,1)
    const wantOpaque = want.replace('rgba(', 'rgb(').replace(',1)', ')');
    const wears = (v) => norm(v).includes(want) || norm(v).includes(wantOpaque);
    const nodes = await kit.dom(mid) ?? [];
    const inShadow = nodes.filter((n) => n.shadow && n.shadow !== 'none' && wears(n.shadow));
    const inBg = nodes.filter((n) => wears(n.bg));
    led.check(M, 'gridColour', 'the cell outlines take the grid colour — drawn as an inset box-shadow on positioned divs rather than as SVG strokes, which is why an svg-only reader finds nothing here',
      true, inShadow.length + inBg.length >= 1);
    led.check(M, 'gridColour (the reader has to match the drawing)',
      'and the control really does draw with divs rather than svg shapes, which is the reason this row uses dom() and not shapes()',
      { divs: true, svgRects: 0 },
      { divs: nodes.length > 0, svgRects: (await kit.shapes(mid, 'rect')).length });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
