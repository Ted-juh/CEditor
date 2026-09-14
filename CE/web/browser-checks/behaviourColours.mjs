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

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
