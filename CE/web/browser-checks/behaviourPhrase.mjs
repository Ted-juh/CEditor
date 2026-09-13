/**
 * behaviourPhrase.mjs — deep behavioural pass over the Phrase Sequencer.
 *
 * A grid of notes walked on a clock, so every row here is the MIDI that came out: which pitches,
 * in what order, on what channel, at what velocity, and for how long — measured as the milliseconds
 * between a note-on and its own note-off, not as a property that was written. The grid's own
 * geometry is read off the rendered SVG to the pixel.
 *
 * The one thing worth saying about the fixtures: a pattern with ONE cell per step, each on a
 * different row, so the order the steps are walked in comes back as the order the pitches arrive
 * in. A dense pattern cannot tell 'forward' from 'reverse'.
 *
 * Run: node browser-checks/behaviourPhrase.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('phrase');
const ons = (events) => events.filter((e) => e.kind === 'on');
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
};

try {
  await kit.fresh();
  {
    const P = 'Phrase';
    const PW = 560;
    const PH = 220;
    // Four steps, four rows, one cell each: step 0 on row 0, step 1 on row 1, and so on. In C
    // minor at octave 3 the degrees are 48, 50, 51, 53 — a rising line whose ORDER is the property
    // under test for every direction below.
    const stair = { '0:0': { velocity: null, tie: false }, '1:1': { velocity: null, tie: false },
      '2:2': { velocity: null, tie: false }, '3:3': { velocity: null, tie: false } };
    let pid = await kit.make(P, { 'Transform.x': 40, 'Transform.y': 120,
      'Transform.width': PW, 'Transform.height': PH,
      'Phrase.running': false, 'Phrase.mode': 'degree', 'Phrase.key': 0, 'Phrase.scale': 'minor',
      'Phrase.baseOctave': 3, 'Phrase.transpose': 0, 'Phrase.steps': 4, 'Phrase.rows': 4,
      'Phrase.direction': 'forward', 'Phrase.seed': 0, 'Phrase.channel': 1, 'Phrase.velocity': 100,
      'Phrase.gate': 0.5, 'Phrase.swing': 0, 'Phrase.rate': 8, 'Phrase.syncToTransport': false,
      'Phrase.accentEvery': 4, 'Phrase.chainOn': false, 'Phrase.pattern': stair,
      'Phrase.editable': true, 'Phrase.showHeader': true, 'Phrase.showGutter': true });
    await kit.preview(true);

    /** Run for a window and report the note-ons in the order they left. A step is 125ms at rate 8. */
    const runFor = async (ms) => {
      await kit.forget();
      await kit.set(pid, { 'Phrase.running': true });
      await kit.settle(ms);
      await kit.set(pid, { 'Phrase.running': false });
      await kit.settle(220);
      return ons(await kit.notes());
    };

    // --- running + rate + mode/key/scale/baseOctave: WHICH pitches ---------------------------------
    {
      await kit.forget();
      await kit.settle(500);
      led.check(P, 'running (false)', 'a stopped sequence plays nothing', 0, ons(await kit.notes()).length);
      const played = await runFor(1400);
      led.check(P, "mode 'degree' + key + scale + baseOctave",
        'the four rows are the first four degrees of C minor at octave three, and nothing else sounds',
        [48, 50, 51, 53], [...new Set(played.map((e) => e.note))].sort((a, b) => a - b));
      led.check(P, 'running (true) + rate', 'at eight steps a second a 1.4s window is ten or eleven notes',
        true, played.length >= 8 && played.length <= 14);
    }

    // --- direction: the ORDER ---------------------------------------------------------------------------
    {
      const majority = (notes) => {
        let up = 0;
        let down = 0;
        for (let i = 1; i < notes.length; i += 1) {
          if (notes[i] > notes[i - 1]) up += 1;
          else if (notes[i] < notes[i - 1]) down += 1;
        }
        return { up, down };
      };
      await kit.set(pid, { 'Phrase.direction': 'forward' });
      const fwd = majority((await runFor(2000)).map((e) => e.note));
      led.check(P, "direction 'forward'", 'the line climbs, turning over once a lap', true, fwd.up > fwd.down);
      await kit.set(pid, { 'Phrase.direction': 'reverse' });
      const rev = majority((await runFor(2000)).map((e) => e.note));
      led.check(P, "direction 'reverse'", 'and falls the other way', true, rev.down > rev.up);
      await kit.set(pid, { 'Phrase.direction': 'pingpong' });
      const ping = (await runFor(2600)).map((e) => e.note);
      // Out and back over four steps is 0,1,2,3,2,1,0,1… — the ends are not repeated, so the
      // turn shows up as a note that is NOT adjacent-repeating and a lap longer than four.
      led.check(P, "direction 'pingpong'", 'out and back turns round at the ends rather than jumping to the start',
        true, ping.length >= 8 && majority(ping).up > 0 && majority(ping).down > 0
          && !ping.some((n, i) => i > 0 && n === ping[i - 1]));
      await kit.set(pid, { 'Phrase.direction': 'random', 'Phrase.seed': 0 });
      const seedA = (await runFor(2000)).map((e) => e.note);
      led.check(P, "direction 'random'", 'random still plays only the four notes that are in the pattern',
        true, seedA.length >= 6 && seedA.every((n) => [48, 50, 51, 53].includes(n)));
      await kit.set(pid, { 'Phrase.direction': 'forward' });
    }

    // --- seed: random is DETERMINISTIC, which is the point ---------------------------------------
    {
      /**
       * TWO SEQUENCERS ON ONE CLOCK, which is what the seed is for.
       *
       * The first version of this check replayed one sequencer twice and asked for the same notes.
       * That is not the promise and cannot be: the free-running index counts monotonically and is
       * not reset by stopping, so the second run starts somewhere else, and `stepAtIndex` is a hash
       * of the INDEX. Same seed, different index, different note — correctly.
       *
       * What the seed actually promises is in the source's own words: two sequencers on one clock
       * with one seed agree, and a repeat of the same index is the same step rather than a new roll.
       * So: two synced Phrases, same pattern, same seed, different output CHANNELS — the transport
       * gives them both the same index, and the two channels have to carry the same notes.
       */
      const twin = await kit.make(P, { 'Transform.x': 40, 'Transform.y': 380,
        'Transform.width': PW, 'Transform.height': PH,
        'Phrase.running': false, 'Phrase.mode': 'degree', 'Phrase.key': 0, 'Phrase.scale': 'minor',
        'Phrase.baseOctave': 3, 'Phrase.steps': 4, 'Phrase.rows': 4, 'Phrase.direction': 'random',
        'Phrase.seed': 0, 'Phrase.channel': 2, 'Phrase.velocity': 100, 'Phrase.gate': 0.5,
        'Phrase.syncToTransport': true, 'Phrase.division': '1/8', 'Phrase.pattern': stair });
      await kit.set(pid, { 'Phrase.direction': 'random', 'Phrase.seed': 0, 'Phrase.channel': 1,
        'Phrase.syncToTransport': true, 'Phrase.division': '1/8' });
      const bothRun = async (ms) => {
        await kit.page.evaluate(async () => {
          const { stopTransport, rewindTransport, setTransportBpm } = await import('/src/CE_Application/stores/transport.js');
          stopTransport(); rewindTransport(); setTransportBpm(240);
        });
        await kit.settle(250);
        await kit.forget();
        await kit.set(pid, { 'Phrase.running': true });
        await kit.set(twin, { 'Phrase.running': true });
        await kit.page.evaluate(async () => {
          const { startTransport } = await import('/src/CE_Application/stores/transport.js');
          startTransport();
        });
        await kit.settle(ms);
        await kit.page.evaluate(async () => {
          const { stopTransport } = await import('/src/CE_Application/stores/transport.js');
          stopTransport();
        });
        await kit.set(pid, { 'Phrase.running': false });
        await kit.set(twin, { 'Phrase.running': false });
        await kit.settle(250);
        const out = ons(await kit.notes());
        const on = (ch) => out.filter((e) => e.channel === ch).map((e) => e.note);
        return { a: on(1), b: on(2) };
      };
      const agreed = await bothRun(1500);
      const n = Math.min(agreed.a.length, agreed.b.length);
      led.check(P, 'seed (two sequencers on one clock agree)',
        'the same seed on the same clock walks the same random order, note for note, on both channels',
        true, n >= 5 && agreed.a.slice(0, n).join(',') === agreed.b.slice(0, n).join(','));
      await kit.set(twin, { 'Phrase.seed': 9 });
      const diverged = await bothRun(1500);
      const m = Math.min(diverged.a.length, diverged.b.length);
      led.check(P, 'seed (a different seed is a different order)',
        'and changing one of their seeds pulls them apart while both go on playing',
        true, m >= 5 && diverged.a.slice(0, m).join(',') !== diverged.b.slice(0, m).join(','));
      await kit.page.evaluate(async (id) => {
        const { removeControl } = await import('/src/CE_Application/stores/controls.js');
        removeControl(id);
      }, twin);
      await kit.settle(250);
      await kit.set(pid, { 'Phrase.direction': 'forward', 'Phrase.seed': 0, 'Phrase.channel': 1,
        'Phrase.syncToTransport': false, 'Phrase.rate': 8 });
    }

    // --- transpose / key / scale: the same shape, re-pitched --------------------------------------------------
    {
      await kit.set(pid, { 'Phrase.transpose': 7 });
      led.check(P, 'transpose', 'the whole pattern moves up a fifth and keeps its shape',
        [55, 57, 58, 60], [...new Set((await runFor(1400)).map((e) => e.note))].sort((a, b) => a - b));
      await kit.set(pid, { 'Phrase.transpose': 0, 'Phrase.baseOctave': 4 });
      led.check(P, 'baseOctave', 'and an octave up is an octave up',
        [60, 62, 63, 65], [...new Set((await runFor(1400)).map((e) => e.note))].sort((a, b) => a - b));
      await kit.set(pid, { 'Phrase.baseOctave': 3, 'Phrase.scale': 'major' });
      led.check(P, 'scale (the shape is re-harmonised, not transposed)',
        'the same four rows in a major scale are the major degrees — the third and fourth move, the tonic does not',
        [48, 50, 52, 53], [...new Set((await runFor(1400)).map((e) => e.note))].sort((a, b) => a - b));
      await kit.set(pid, { 'Phrase.scale': 'minor', 'Phrase.key': 5 });
      led.check(P, 'key', 'and a different key moves the whole thing',
        [53, 55, 56, 58], [...new Set((await runFor(1400)).map((e) => e.note))].sort((a, b) => a - b));
      await kit.set(pid, { 'Phrase.key': 0 });
    }

    // --- mode 'chromatic': a plain piano roll ----------------------------------------------------------------
    {
      await kit.set(pid, { 'Phrase.mode': 'chromatic' });
      led.check(P, "mode 'chromatic'", 'the rows become semitones rather than degrees',
        [48, 49, 50, 51], [...new Set((await runFor(1400)).map((e) => e.note))].sort((a, b) => a - b));
      led.check(P, "mode 'chromatic' (the gutter says so)", 'and the gutter names pitches rather than degree numbers',
        true, (await kit.texts(pid)).includes('C3'));
      await kit.set(pid, { 'Phrase.mode': 'degree' });
      led.check(P, "mode 'degree' (the gutter)", 'where a degree grid numbers them from one',
        true, (await kit.texts(pid)).includes('1'));
    }

    // --- channel / velocity / a cell's own velocity ------------------------------------------------------------
    {
      await kit.set(pid, { 'Phrase.channel': 11, 'Phrase.velocity': 70 });
      const out = await runFor(1400);
      led.check(P, 'channel + velocity', 'every note leaves on the declared channel at the pattern velocity',
        { channels: [11], velocities: [70] },
        { channels: [...new Set(out.map((e) => e.channel))], velocities: [...new Set(out.map((e) => e.velocity))] });
      await kit.set(pid, { 'Phrase.pattern': { ...stair, '1:1': { velocity: 33, tie: false } } });
      const mixed = await runFor(1400);
      led.check(P, 'pattern (a cell’s own velocity)', 'a cell that carries its own velocity overrides the pattern’s, and only for that cell',
        { own: 33, others: [70] },
        { own: mixed.find((e) => e.note === 50)?.velocity,
          others: [...new Set(mixed.filter((e) => e.note !== 50).map((e) => e.velocity))] });
      await kit.set(pid, { 'Phrase.pattern': stair, 'Phrase.channel': 1, 'Phrase.velocity': 100 });
    }

    // --- gate: how long each note is held -------------------------------------------------------------------------
    {
      const heldMs = async () => {
        const events = await (async () => { await runFor(1600); return kit.notes(); })();
        const spans = [];
        for (const on of events.filter((e) => e.kind === 'on')) {
          const off = events.find((e) => e.kind === 'off' && e.note === on.note && e.at > on.at);
          if (off) spans.push(off.at - on.at);
        }
        return spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null;
      };
      await kit.set(pid, { 'Phrase.gate': 0.2 });
      const short = await heldMs();
      await kit.set(pid, { 'Phrase.gate': 0.9 });
      const long = await heldMs();
      // A step at rate 8 is 125ms, so 20% is 25ms and 90% is 112ms.
      led.check(P, 'gate', 'the note is held for the declared fraction of the step — 25ms and 112ms of a 125ms step',
        true, short !== null && long !== null && Math.abs(short - 25) <= 22
          && Math.abs(long - 112) <= 35 && long > short * 2);
      await kit.set(pid, { 'Phrase.gate': 0.5 });
    }

    // --- a tie holds rather than retriggers --------------------------------------------------------------------------
    {
      // Two steps on the SAME row: without a tie that is two note-ons, with one it is a single note
      // held across the boundary. Counting note-ons is the whole difference between a line and a
      // stutter, and it is what a tie is for.
      const twoHits = { '0:0': { velocity: null, tie: false }, '1:0': { velocity: null, tie: false } };
      await kit.set(pid, { 'Phrase.pattern': twoHits, 'Phrase.steps': 4, 'Phrase.rate': 6 });
      const untied = (await runFor(2100)).filter((e) => e.note === 48).length;
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false },
        '1:0': { velocity: null, tie: true } } });
      const tied = (await runFor(2100)).filter((e) => e.note === 48).length;
      led.check(P, 'pattern (a tie holds the note rather than retriggering it)',
        'two hits on one row are two note-ons; tie the second and the same two steps are one',
        true, untied >= 4 && tied > 0 && tied <= untied / 2 + 1);
      await kit.set(pid, { 'Phrase.pattern': stair, 'Phrase.rate': 8 });
    }

    // --- a cell's ratchet retriggers inside its own step ---------------------------------------------------------------
    {
      // MEASURED AS THE GAPS, not as a count. A window ends mid-step, so the last ratchet's tail is
      // cut and the total comes out at two-thirds of three times rather than three times — which is
      // the window's edge, not the property. What a ratchet IS is hits inside one step: at rate 4 a
      // step is 250ms and a triple ratchet puts them 83ms apart, where a plain cell on a four-step
      // pattern has nothing closer together than a whole lap.
      const gapsOf = (out) => {
        const t = out.filter((e) => e.note === 48).map((e) => e.at).sort((a, b) => a - b);
        return t.slice(1).map((v, i) => v - t[i]);
      };
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false } }, 'Phrase.rate': 4 });
      const plain = gapsOf(await runFor(2600));
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false, ratchet: 3 } } });
      const ratcheted = gapsOf(await runFor(2600));
      const inside = (g) => g.filter((v) => v > 45 && v < 130).length;
      led.check(P, 'pattern (ratchet)',
        'a cell set to ratchet three times puts extra hits a third of a step apart inside its own step, where a plain cell has nothing closer than a lap',
        { plainHasNoneInside: true, ratchetHasThem: true },
        { plainHasNoneInside: plain.length >= 1 && inside(plain) === 0,
          ratchetHasThem: inside(ratcheted) >= 2 });
      await kit.set(pid, { 'Phrase.pattern': stair, 'Phrase.rate': 8 });
    }

    // --- a cell's chance is deterministic, not Math.random ---------------------------------------------
    {
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false, chance: 0 } },
        'Phrase.rate': 6, 'Phrase.seed': 0 });
      led.check(P, 'pattern (chance 0)', 'a cell that never sounds never sounds', 0, (await runFor(1600)).length);
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false, chance: 1 } } });
      const certain = (await runFor(2600)).length;
      led.check(P, 'pattern (chance 1)', 'and one that always sounds sounds on every lap', true, certain >= 3);
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false, chance: 0.5 } } });
      const half = (await runFor(2600)).length;
      led.check(P, 'pattern (chance 0.5)', 'a half-chance cell sounds on some laps and not others',
        true, half > 0 && half < certain);

      /**
       * DETERMINISTIC, and shown the only way it can be: two of them on one clock.
       *
       * The first version of this row ran the same sequencer twice and asked for the same number of
       * hits. It is not that — `cellRoll` is a hash of the INDEX, and the index counts on past a
       * stop, so the second run rolls a different stretch of the same sequence. What the source
       * promises is that the roll is a function of position rather than a fresh `Math.random()` per
       * render: "a pattern sounds the same on the take you recorded as on the take you play back",
       * and two sequencers on one clock with one seed agree. So two synced Phrases with the same
       * half-chance cell, on different channels, have to fire on the SAME laps.
       */
      const twin = await kit.make(P, { 'Transform.x': 40, 'Transform.y': 380,
        'Transform.width': PW, 'Transform.height': PH, 'Phrase.running': false,
        'Phrase.mode': 'degree', 'Phrase.key': 0, 'Phrase.scale': 'minor', 'Phrase.baseOctave': 3,
        'Phrase.steps': 4, 'Phrase.rows': 4, 'Phrase.direction': 'forward', 'Phrase.seed': 0,
        'Phrase.channel': 2, 'Phrase.velocity': 100, 'Phrase.gate': 0.5,
        'Phrase.syncToTransport': true, 'Phrase.division': '1/8',
        'Phrase.pattern': { '0:0': { velocity: null, tie: false, chance: 0.5 } } });
      await kit.set(pid, { 'Phrase.syncToTransport': true, 'Phrase.division': '1/8',
        'Phrase.channel': 1 });
      await kit.page.evaluate(async () => {
        const { stopTransport, rewindTransport, setTransportBpm } = await import('/src/CE_Application/stores/transport.js');
        stopTransport(); rewindTransport(); setTransportBpm(240);
      });
      await kit.settle(250);
      await kit.forget();
      await kit.set(pid, { 'Phrase.running': true });
      await kit.set(twin, { 'Phrase.running': true });
      await kit.page.evaluate(async () => {
        const { startTransport } = await import('/src/CE_Application/stores/transport.js');
        startTransport();
      });
      // LONG ENOUGH FOR THE COIN TO LAND SEVERAL TIMES. A four-step pattern at 1/8 and 240bpm comes
      // round to step 0 every 500ms, and a half-chance cell takes about half of those, so 2.6s held
      // one hit apiece — the two agreed, and one point is not evidence of a sequence.
      await kit.settle(5400);
      await kit.page.evaluate(async () => {
        const { stopTransport } = await import('/src/CE_Application/stores/transport.js');
        stopTransport();
      });
      await kit.set(pid, { 'Phrase.running': false });
      await kit.set(twin, { 'Phrase.running': false });
      await kit.settle(250);
      const rolled = ons(await kit.notes());
      const onA = rolled.filter((e) => e.channel === 1).map((e) => Math.round(e.at / 60));
      const onB = rolled.filter((e) => e.channel === 2).map((e) => Math.round(e.at / 60));
      led.check(P, 'pattern (chance is a hash of the position, not a fresh roll)',
        'two sequencers on one clock with one seed lose and win the same laps — same count, same moments',
        true, onA.length >= 3 && onA.length === onB.length
          && onA.every((v, i) => Math.abs(v - onB[i]) <= 1));
      await kit.page.evaluate(async (id) => {
        const { removeControl } = await import('/src/CE_Application/stores/controls.js');
        removeControl(id);
      }, twin);
      await kit.settle(250);
      await kit.set(pid, { 'Phrase.pattern': stair, 'Phrase.rate': 8, 'Phrase.seed': 0,
        'Phrase.syncToTransport': false, 'Phrase.channel': 1 });
    }

    // --- steps / rows / accentEvery / showHeader / showGutter: the grid, to the pixel -----------------------------------
    {
      const cells = async () => kit.shapes(pid, 'rect', (n) => n.rx === 2);
      await kit.set(pid, { 'Phrase.steps': 4, 'Phrase.rows': 4, 'Phrase.showHeader': true,
        'Phrase.showGutter': true });
      await kit.settle(200);
      led.check(P, 'steps + rows', 'a four by four grid is sixteen cells', 16, (await cells()).length);
      await kit.set(pid, { 'Phrase.steps': 8, 'Phrase.rows': 6 });
      await kit.settle(200);
      const wide = await cells();
      led.check(P, 'steps + rows (changed)', 'and eight by six is forty-eight', 48, wide.length);
      // pad 8 + gutter 26, then a 2px gap between cells: the grid's left edge is 34.
      led.check(P, 'showGutter (the grid starts past it)', 'the grid begins one padding and one gutter in',
        34, Math.min(...wide.map((n) => n.x)));
      await kit.set(pid, { 'Phrase.showGutter': false });
      await kit.settle(200);
      led.check(P, 'showGutter (false)', 'and without it the grid starts at the padding alone',
        8, Math.min(...(await cells()).map((n) => n.x)));
      await kit.set(pid, { 'Phrase.showGutter': true, 'Phrase.showHeader': false });
      await kit.settle(200);
      led.check(P, 'showHeader (false)', 'dropping the header lifts the grid by twenty pixels',
        8, Math.min(...(await cells()).map((n) => n.y)));
      await kit.set(pid, { 'Phrase.showHeader': true });
      await kit.settle(200);
      led.check(P, 'showHeader (true)', 'and puts it back',
        28, Math.min(...(await cells()).map((n) => n.y)));
      // Row 0 is drawn at the BOTTOM, the way every piano roll does it.
      const lit = (await cells()).filter((n) => n.fill !== rgba('FF20202C'));
      led.check(P, 'rows (row zero is at the bottom)',
        'the lit cell on row zero is the lowest one on screen, because low notes belong low',
        true, lit.length > 0 && Math.max(...(await cells()).map((n) => n.y)) === Math.max(...lit.map((n) => n.y)));

      // AN ACCENT IS NOT A LINE. The renderer marks the accented steps on the CELLS — an empty cell
      // on a bar step is drawn at 0.9 with a faint stroke where the others are 0.6 with none — so
      // counting a separate marker rect found the playing-column highlight instead, which is drawn
      // only while running and has nothing to do with the property.
      const accented = async () => {
        const cs = await kit.shapes(pid, 'rect', (n) => n.rx === 2
          && n.stroke === 'rgba(255,255,255,0.09)');
        return new Set(cs.map((n) => Math.round(n.x))).size;
      };
      await kit.set(pid, { 'Phrase.steps': 8, 'Phrase.rows': 4, 'Phrase.pattern': {},
        'Phrase.accentEvery': 4 });
      await kit.settle(220);
      led.check(P, 'accentEvery (4)', 'over eight steps the bar falls on the first and the fifth — two marked columns',
        2, await accented());
      await kit.set(pid, { 'Phrase.accentEvery': 2 });
      await kit.settle(220);
      led.check(P, 'accentEvery (2)', 'and every second step is four of them', 4, await accented());
      await kit.set(pid, { 'Phrase.accentEvery': 1 });
      await kit.settle(220);
      led.check(P, 'accentEvery (1)', 'every step marked is every column', 8, await accented());
      await kit.set(pid, { 'Phrase.accentEvery': 4, 'Phrase.steps': 4, 'Phrase.rows': 4,
        'Phrase.pattern': stair });
    }

    // --- editable: click a cell ----------------------------------------------------------------------------------------
    {
      await kit.set(pid, { 'Phrase.editable': true, 'Phrase.pattern': {}, 'Phrase.steps': 4,
        'Phrase.rows': 4, 'Phrase.running': false });
      await kit.settle(250);
      const box = await kit.box(pid);
      // Grid: x from 34, cells (560-16-26-2*3)/4 wide; row 3 is the TOP row. Click the middle of
      // step 1, row 3 — a quarter in horizontally, a sixth down vertically past the header.
      const cellAt = async (step, row) => {
        const g = await kit.page.evaluate(async ({ id, w, h }) => {
          const { phraseGeometry, cellRect } = await import('/src/CE_Application/utils/phraseLayout.js');
          const geom = phraseGeometry(w, h, 4, 4, 8, 20, 26);
          return { geom, rect: cellRect(geom, 0, 0) };
        }, { id: pid, w: PW, h: PH });
        return g;
      };
      const g = await cellAt(1, 3);
      const rect = await kit.page.evaluate(async ({ w, h, step, row }) => {
        const { phraseGeometry, cellRect } = await import('/src/CE_Application/utils/phraseLayout.js');
        return cellRect(phraseGeometry(w, h, 4, 4, 8, 20, 26), step, row);
      }, { w: PW, h: PH, step: 1, row: 3 });
      void g;
      await kit.click({ x: box.x + rect.x + rect.w / 2, y: box.y + rect.y + rect.h / 2 });
      await kit.settle(260);
      const after = await kit.read(pid, 'Phrase.pattern');
      led.check(P, 'editable (a click turns a cell on)', 'clicking the cell at step one, row three puts exactly that cell in the pattern',
        ['1:3'], Object.keys(after ?? {}));
      await kit.click({ x: box.x + rect.x + rect.w / 2, y: box.y + rect.y + rect.h / 2 });
      await kit.settle(260);
      led.check(P, 'editable (a second click turns it off)', 'and clicking it again takes it out',
        [], Object.keys((await kit.read(pid, 'Phrase.pattern')) ?? {}));
      // …and it really is the cell that plays.
      await kit.click({ x: box.x + rect.x + rect.w / 2, y: box.y + rect.y + rect.h / 2 });
      await kit.settle(260);
      led.check(P, 'editable (the cell that was clicked is the one that sounds)',
        'row three of a C minor grid is the fourth degree, and that is the note that comes out',
        [53], [...new Set((await runFor(1400)).map((e) => e.note))]);
      await kit.set(pid, { 'Phrase.editable': false, 'Phrase.pattern': {} });
      await kit.settle(200);
      await kit.click({ x: box.x + rect.x + rect.w / 2, y: box.y + rect.y + rect.h / 2 });
      await kit.settle(260);
      led.check(P, 'editable (false)', 'a locked grid ignores the click',
        [], Object.keys((await kit.read(pid, 'Phrase.pattern')) ?? {}));
      await kit.set(pid, { 'Phrase.editable': true, 'Phrase.pattern': stair });
    }

    // --- swing ---------------------------------------------------------------------------------------------------------
    {
      const gaps = async () => {
        const out = await runFor(2200);
        const times = out.map((e) => e.at).sort((a, b) => a - b);
        return times.slice(1).map((t, i) => t - times[i]);
      };
      await kit.set(pid, { 'Phrase.swing': 0, 'Phrase.rate': 6 });
      const straight = await gaps();
      await kit.set(pid, { 'Phrase.swing': 0.6 });
      const shuffled = await gaps();
      const spread = (g) => (g.length ? Math.max(...g) - Math.min(...g) : 0);
      led.check(P, 'swing', 'a shuffled sequence has long and short gaps where a straight one has even ones, and loses no notes',
        true, straight.length >= 6 && shuffled.length >= 5
          && spread(shuffled) > spread(straight) + 15);
      await kit.set(pid, { 'Phrase.swing': 0, 'Phrase.rate': 8 });
    }

    // --- syncToTransport + division ----------------------------------------------------------------------------------------
    {
      const clock = async (on) => kit.page.evaluate(async (run) => {
        const { startTransport, stopTransport, setTransportBpm, rewindTransport } = await import('/src/CE_Application/stores/transport.js');
        setTransportBpm(240);
        if (run) { rewindTransport(); startTransport(); } else stopTransport();
      }, on);
      await kit.set(pid, { 'Phrase.syncToTransport': true, 'Phrase.division': '1/8' });
      await clock(false);
      await kit.settle(250);
      await kit.forget();
      await kit.set(pid, { 'Phrase.running': true });
      await kit.settle(900);
      led.check(P, 'syncToTransport (the clock is stopped)', 'a synced sequence stays silent while the transport is, whatever its own rate says',
        0, ons(await kit.notes()).length);
      await kit.forget();
      await clock(true);
      await kit.settle(1400);
      const synced = ons(await kit.notes());
      await clock(false);
      await kit.set(pid, { 'Phrase.running': false });
      await kit.settle(200);
      // 1/8 at 240bpm is a step every 125ms, so 1.4s is about eleven steps of a four-step pattern.
      led.check(P, 'syncToTransport + division', 'and runs on the shared clock at the declared division the moment it starts',
        true, synced.length >= 6 && synced.length <= 16);
      await kit.set(pid, { 'Phrase.syncToTransport': false });
    }

    // --- the colours + the playing column -----------------------------------------------------------------------------------
    {
      await kit.set(pid, { 'Phrase.faceColour': 'FF141428', 'Phrase.cellColour': 'FF242430',
        'Phrase.noteColour': 'FF22DD88', 'Phrase.playColour': 'FFFF4488',
        'Phrase.labelColour': 'FFCCAA22', 'Phrase.pattern': stair, 'Phrase.running': false });
      await kit.settle(250);
      const g = await kit.geo(pid);
      led.check(P, 'faceColour / cellColour / noteColour / labelColour',
        'the face, an empty cell, a lit one and the gutter labels each take their colour',
        { face: true, empty: true, lit: 4, label: true },
        { face: g.some((n) => n.tag === 'rect' && n.fill === rgba('FF141428')),
          empty: g.some((n) => n.tag === 'rect' && n.rx === 2 && n.fill === rgba('FF242430')),
          lit: g.filter((n) => n.tag === 'rect' && n.rx === 2 && n.fill === rgba('FF22DD88')).length,
          label: g.some((n) => n.tag === 'text' && n.fill === rgba('FFCCAA22')) });
      led.check(P, 'the playing column (stopped)', 'a stopped sequence highlights no column',
        0, g.filter((n) => n.tag === 'rect' && n.fill === rgba('FFFF4488')).length);
      await kit.set(pid, { 'Phrase.running': true, 'Phrase.rate': 2 });
      await kit.settle(500);
      const lit = (await kit.geo(pid)).filter((n) => n.tag === 'rect' && n.fill === rgba('FFFF4488'));
      await kit.set(pid, { 'Phrase.running': false, 'Phrase.rate': 8 });
      await kit.settle(250);
      led.check(P, 'playColour (the playing column)', 'a running one highlights exactly the column it is on, and lets go when it stops',
        { running: 1, stopped: 0 },
        { running: lit.length,
          stopped: (await kit.geo(pid)).filter((n) => n.tag === 'rect' && n.fill === rgba('FFFF4488')).length });
    }

    // --- stopping lets go -------------------------------------------------------------------------------------------------
    {
      // A ticker that exits with the last step still held leaves a note nothing will ever release —
      // a hanging note you can only clear with Panic. The gate is set past the step so a note IS
      // held at the moment the sequence stops.
      await kit.set(pid, { 'Phrase.pattern': { '0:0': { velocity: null, tie: false, length: 4 } },
        'Phrase.rate': 4, 'Phrase.gate': 0.99 });
      await kit.forget();
      await kit.set(pid, { 'Phrase.running': true });
      await kit.settle(400);
      const sounding = ons(await kit.notes());
      await kit.set(pid, { 'Phrase.running': false });
      await kit.settle(400);
      const offs = (await kit.notes()).filter((e) => e.kind === 'off');
      led.check(P, 'stopping releases what is held', 'a note still ringing when the sequence stops is let go rather than left hanging',
        true, sounding.length > 0 && sounding.every((e) => offs.some((o) => o.note === e.note)));
      await kit.set(pid, { 'Phrase.pattern': stair, 'Phrase.rate': 8, 'Phrase.gate': 0.5 });
    }

    led.unverified(P, 'patterns / chain / chainOn / chainLoop', 'a song chain of stored patterns',
      'the chain swaps the pattern through the preview SESSION rather than the document, and the swap '
      + 'is driven by the lap counter; the notes that come out are the same notes either way, so what '
      + 'this pass could assert is which pattern the session holds — which is state, not behaviour. '
      + 'songChain.js is pure and unit-tested.');
    led.unverified(P, 'followPanelKey', 'take the key and scale from the panel instead of its own',
      'a panel-level broadcast written by another control; it needs a second control driving it, and '
      + 'is the same mechanism listed for the Harmoniser and the Recorder');

    // --- save and reopen ----------------------------------------------------------------------------------------------------
    {
      await kit.set(pid, { 'Phrase.key': 7, 'Phrase.scale': 'major', 'Phrase.channel': 6,
        'Phrase.velocity': 55, 'Phrase.transpose': -12, 'Phrase.running': false });
      await kit.settle(250);
      const before = await kit.geo(pid);
      const again = await kit.reopen(pid);
      led.check(P, 'save/reopen (the grid)', 'every cell, bar marker and gutter label returns identical',
        JSON.stringify(before), JSON.stringify(await kit.geo(again)));
      pid = again;
      await kit.preview(true);
      const out = await runFor(1400);
      led.check(P, 'save/reopen (still plays the pattern)',
        'a reopened sequence plays G major an octave down, on its own channel at its own velocity',
        { notes: [43, 45, 47, 48], channels: [6], velocities: [55] },
        { notes: [...new Set(out.map((e) => e.note))].sort((a, b) => a - b),
          channels: [...new Set(out.map((e) => e.channel))],
          velocities: [...new Set(out.map((e) => e.velocity))] });
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
