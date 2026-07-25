import test from 'node:test';
import assert from 'node:assert/strict';
import {
  phraseConfig, phraseMode, phraseSteps, phraseRows, phraseChannel, phraseVelocity,
  phraseDirection, phraseSynced, phraseDivision, phraseBeatsPerStep, phraseStepSeconds,
  phraseRate, phraseGate, gateSeconds, isRest,
  EMPTY_PATTERN, cellKey, phrasePattern, cellAt, isCellOn, toggleCell, setCell,
  cellsInStep, hiddenCellCount, trimPattern,
  rowToNote, rowLabel, noteLabel, phraseUseFlats,
  stepAtIndex, stepNotes,
  EMPTY_SOUNDING, playStep, releaseAll, soundingNotes,
  phraseGeometry, cellRect, cellAtPoint,
  PHRASE_SEEDS, phraseSeedPattern, PHRASE_MODES, PHRASE_DIRECTIONS,
  MIN_STEPS, MAX_STEPS, MAX_ROWS, tiesForward,
  phraseScriptPatch, PHRASE_SCRIPT_ACTIONS, phraseSwing, phraseSwingSeconds,
  effectiveSwing, swingSource,
  cellChance, cellRatchet, cellLength, cellRoll, cellSounds,
  ratchetOffsets, noteGateSeconds, MAX_RATCHET,
} from '../src/CE_Application/utils/phraseLayout.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { swingDelay } from '../src/CE_Application/utils/arpLayout.js';

const DEFAULT_PATTERN = SECTION_DEFAULTS.Phrase.pattern;

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function ph(c) { return { _children: { Core: { controlType: 'Phrase' }, Phrase: c } }; }
// A four-step C-minor pattern: tonic, rest, third, fifth.
const BASIC = ph({
  key: 0, scale: 'minor', baseOctave: 3, steps: 4, rows: 8, channel: 1, velocity: 100,
  pattern: { '0:0': {}, '2:2': {}, '3:4': {} },
});

test('config clamps and falls back', () => {
  assert.equal(phraseMode(ph({})), 'degree');
  assert.equal(phraseMode(ph({ mode: 'nope' })), 'degree');
  assert.equal(phraseMode(ph({ mode: 'chromatic' })), 'chromatic');
  assert.equal(phraseSteps(ph({ steps: 999 })), MAX_STEPS);
  assert.equal(phraseSteps(ph({ steps: 0 })), MIN_STEPS);
  assert.equal(phraseRows(ph({ rows: 999 })), MAX_ROWS);
  assert.equal(phraseChannel(ph({ channel: 99 })), 16);
  assert.equal(phraseVelocity(ph({ velocity: 0 })), 1);
  assert.equal(phraseDirection(ph({ direction: 'nope' })), 'forward');
  assert.equal(phraseDivision(ph({ division: 'nope' })), '1/16');
  assert.equal(phraseSynced(ph({})), false);
  assert.equal(PHRASE_MODES.length, 2);
  assert.equal(PHRASE_DIRECTIONS.length, 4);
});

// --- The pattern -----------------------------------------------------------------
test('the pattern is sparse, so resizing never destroys anything', () => {
  // A dense 2D array would throw the far cells away the moment you typed a
  // smaller number. This is the reason for the map.
  let p = toggleCell(EMPTY_PATTERN, 30, 10);
  assert.equal(isCellOn(p, 30, 10), true);
  assert.equal(hiddenCellCount(p, 16, 8), 1, 'outside a 16x8 grid');
  assert.equal(hiddenCellCount(p, 32, 12), 0, 'inside a bigger one');
  // Still there when the grid grows back.
  assert.equal(isCellOn(p, 30, 10), true);
  // Trimming is explicit and destructive — you have to ask.
  assert.equal(Object.keys(trimPattern(p, 16, 8)).length, 0);

  // Toggle is a toggle.
  p = toggleCell(p, 30, 10);
  assert.equal(isCellOn(p, 30, 10), false);
  // …and pure: the original is untouched.
  const before = toggleCell(EMPTY_PATTERN, 1, 1);
  const after = toggleCell(before, 2, 2);
  assert.equal(Object.keys(before).length, 1);
  assert.equal(Object.keys(after).length, 2);
});

test('cells carry their own velocity and tie', () => {
  let p = toggleCell(EMPTY_PATTERN, 0, 0);
  assert.equal(cellAt(p, 0, 0).velocity, null, 'null means "use the pattern default"');
  p = setCell(p, 0, 0, { velocity: 120, tie: true });
  assert.equal(cellAt(p, 0, 0).velocity, 120);
  assert.equal(cellAt(p, 0, 0).tie, true);
  // Setting a cell that isn't on does nothing rather than conjuring one.
  assert.equal(setCell(p, 5, 5, { velocity: 10 }), p);
  assert.equal(setCell(p, 0, 0, null), p);
  assert.equal(cellKey(3, 4), '3:4');
  assert.deepEqual(phrasePattern(ph({ pattern: 'nonsense' })), EMPTY_PATTERN);
});

test('a step with two cells is a chord', () => {
  const chord = ph({ steps: 4, rows: 8, pattern: { '1:0': {}, '1:2': {}, '1:4': {} } });
  const cells = cellsInStep(phrasePattern(chord), 1, 8);
  assert.deepEqual(cells.map((c) => c.row), [0, 2, 4], 'low row first');
  assert.equal(cellsInStep(phrasePattern(chord), 0, 8).length, 0);
  assert.equal(isRest(chord, 0), true);
  assert.equal(isRest(chord, 1), false);
});

// --- Rows to pitches ---------------------------------------------------------------
test('rows are scale DEGREES, so a pattern is a shape not a set of pitches', () => {
  // C minor: rows 0..7 → C D E♭ F G A♭ B♭ C(+8ve)
  const cmin = ph({ key: 0, scale: 'minor', baseOctave: 3, rows: 8 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((r) => rowToNote(cmin, r)),
    [48, 50, 51, 53, 55, 56, 58, 60]);
  // The SAME shape in F major is F G A B♭ C D E F — transposed and
  // re-harmonised, and no row can produce a note outside the key.
  const fmaj = ph({ key: 5, scale: 'major', baseOctave: 3, rows: 8 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((r) => rowToNote(fmaj, r)),
    [53, 55, 57, 58, 60, 62, 64, 65]);
  // Row 7 is the octave in a 7-note scale; a pentatonic wraps after 5.
  const pent = ph({ key: 0, scale: 'pentatonicMin', baseOctave: 3, rows: 6 });
  assert.equal(rowToNote(pent, 5) - rowToNote(pent, 0), 12);
});

test('chromatic mode is semitones, for when you want the piano roll', () => {
  const chrom = ph({ mode: 'chromatic', key: 0, baseOctave: 3, rows: 12 });
  assert.deepEqual([0, 1, 2, 11].map((r) => rowToNote(chrom, r)), [48, 49, 50, 59]);
});

test('transpose and base octave shift everything, keeping the shape', () => {
  const a = ph({ key: 0, scale: 'minor', baseOctave: 3, rows: 8 });
  const b = ph({ key: 0, scale: 'minor', baseOctave: 4, rows: 8 });
  const t = ph({ key: 0, scale: 'minor', baseOctave: 3, transpose: 7, rows: 8 });
  for (const r of [0, 1, 2, 5]) {
    assert.equal(rowToNote(b, r) - rowToNote(a, r), 12, `octave, row ${r}`);
    assert.equal(rowToNote(t, r) - rowToNote(a, r), 7, `transpose, row ${r}`);
  }
  assert.equal(rowToNote(ph({ transpose: 999 }), 0) - rowToNote(ph({ transpose: 48 }), 0), 0, 'clamped');
});

test('row labels say degree in degree mode and pitch in chromatic', () => {
  const cmin = ph({ key: 0, scale: 'minor', baseOctave: 3 });
  assert.equal(rowLabel(cmin, 0), '1');
  assert.equal(rowLabel(cmin, 2), '3');
  assert.equal(rowLabel(cmin, 7), '1+1', 'the octave above');
  assert.equal(rowLabel(ph({ mode: 'chromatic', key: 0, baseOctave: 3 }), 0), 'C3');
  assert.equal(noteLabel(63, true), 'E♭4');
  assert.equal(noteLabel(63, false), 'D♯4');
  assert.equal(phraseUseFlats(ph({ key: 0, scale: 'minor' })), true);
});

// --- Playback ----------------------------------------------------------------------
test('direction folds a rising index — nothing is stored, so nothing drifts', () => {
  const fwd = (i) => stepAtIndex(i, 4, 'forward');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(fwd), [0, 1, 2, 3, 0, 1]);
  const rev = (i) => stepAtIndex(i, 4, 'reverse');
  assert.deepEqual([0, 1, 2, 3, 4].map(rev), [3, 2, 1, 0, 3]);
  // Ping-pong doesn't repeat the endpoints: 0 1 2 3 2 1 0 1 2 3 …
  const pp = (i) => stepAtIndex(i, 4, 'pingpong');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(pp), [0, 1, 2, 3, 2, 1, 0, 1]);
  assert.equal(stepAtIndex(5, 1, 'pingpong'), 0, 'a one-step pattern is fine');
  // Random is deterministic from the index: the same index is the same step,
  // so two components on one clock agree and a repeat isn't a fresh roll.
  const r1 = [0, 1, 2, 3, 4].map((i) => stepAtIndex(i, 8, 'random', 7));
  const r2 = [0, 1, 2, 3, 4].map((i) => stepAtIndex(i, 8, 'random', 7));
  assert.deepEqual(r1, r2);
  assert.ok(r1.every((s) => s >= 0 && s < 8));
  assert.notDeepEqual(r1, [0, 1, 2, 3, 4].map((i) => stepAtIndex(i, 8, 'random', 99)), 'the seed matters');
});

test('a step yields its notes at the right pitches', () => {
  const a = stepNotes(BASIC, 0);
  assert.equal(a.step, 0);
  assert.deepEqual(a.notes.map((n) => n.note), [48]);          // C3
  assert.equal(a.notes[0].velocity, 100);
  assert.deepEqual(stepNotes(BASIC, 1).notes, [], 'step 1 is a rest');
  assert.deepEqual(stepNotes(BASIC, 2).notes.map((n) => n.note), [51]);   // E♭3
  assert.deepEqual(stepNotes(BASIC, 3).notes.map((n) => n.note), [55]);   // G3
  assert.deepEqual(stepNotes(BASIC, 4).notes.map((n) => n.note), [48], 'wraps');
  // A per-cell velocity overrides the pattern default.
  const loud = ph({ ...phraseConfig(BASIC), pattern: { '0:0': { velocity: 127 } } });
  assert.equal(stepNotes(loud, 0).notes[0].velocity, 127);
});

test('a tie only ties when there is something to tie to', () => {
  // Rows 0 on steps 0 and 1, the second tied.
  const tied = ph({
    key: 0, scale: 'minor', baseOctave: 3, steps: 4, rows: 8,
    pattern: { '0:0': {}, '1:0': { tie: true } },
  });
  assert.equal(stepNotes(tied, 0).notes[0].tied, false, 'nothing precedes the first');
  assert.equal(stepNotes(tied, 1).notes[0].tied, true);
  // A tie with a GAP before it has nothing to hold, so it retriggers instead of
  // swallowing the note-on entirely.
  const orphan = ph({
    key: 0, scale: 'minor', baseOctave: 3, steps: 4, rows: 8,
    pattern: { '0:0': {}, '2:0': { tie: true } },
  });
  assert.equal(stepNotes(orphan, 2).notes[0].tied, false);
});

test('gate is a fraction of the step, whatever sets the step length', () => {
  assert.ok(near(phraseStepSeconds(ph({ rate: 8 }), 120), 0.125));
  const sync = ph({ syncToTransport: true, division: '1/16', rate: 8 });
  assert.ok(near(phraseBeatsPerStep(sync), 0.25));
  assert.ok(near(phraseStepSeconds(sync, 120), 0.125));    // a 16th at 120bpm
  assert.ok(near(phraseStepSeconds(sync, 60), 0.25));
  assert.ok(near(phraseStepSeconds(sync, null), 0.125), 'no tempo yet → the free rate');
  assert.ok(near(gateSeconds(ph({ gate: 0.5 }), 0.2), 0.1));
  assert.ok(near(phraseGate(ph({})), 0.8));
  assert.ok(gateSeconds(ph({ gate: 0 }), 0.2) > 0, 'a zero gate would be a silent sequencer');
  assert.ok(near(phraseRate(ph({ rate: 0 })), 0.1));
});

// --- Sounding-note bookkeeping ------------------------------------------------------
test('a note-off goes where its note-on went, even if the key changed', () => {
  // The hazard here is editing key/scale/transpose WHILE it plays: every one of
  // those changes what a row means, so a re-derived off would release a pitch
  // that was never started and leave the real one ringing.
  const a = playStep(EMPTY_SOUNDING, BASIC, 0);
  // `row` rides along on a note-on so the caller can ask whether the next step
  // ties it — a gate must not cut a note that is about to be held.
  assert.deepEqual(a.sends.map((x) => ({ kind: x.kind, channel: x.channel, note: x.note, velocity: x.velocity, row: x.row })),
    [{ kind: 'on', channel: 1, note: 48, velocity: 100, row: 0 }]);
  assert.deepEqual(soundingNotes(a.sounding), [48]);

  // The key moves up a fourth under the held note.
  const moved = ph({ ...phraseConfig(BASIC), key: 5 });
  assert.equal(rowToNote(moved, 0), 53, 'a fresh press would now be F3');
  // …but the release is still C3.
  assert.deepEqual(releaseAll(a.sounding).sends, [{ kind: 'off', channel: 1, note: 48 }]);
});

test('playing on releases the previous step and starts the next', () => {
  let s = EMPTY_SOUNDING;
  let r = playStep(s, BASIC, 0); s = r.sounding;
  assert.deepEqual(r.sends.map((m) => m.kind), ['on']);
  // Step 1 is a rest: the held note is released and nothing starts.
  r = playStep(s, BASIC, 1); s = r.sounding;
  assert.deepEqual(r.sends, [{ kind: 'off', channel: 1, note: 48 }]);
  assert.deepEqual(soundingNotes(s), []);
  // Step 2 starts E♭3.
  r = playStep(s, BASIC, 2); s = r.sounding;
  assert.deepEqual(r.sends.map((x) => (x.kind === 'on'
    ? { kind: x.kind, channel: x.channel, note: x.note, velocity: x.velocity, row: x.row }
    : { kind: x.kind, channel: x.channel, note: x.note })), [{ kind: 'on', channel: 1, note: 51, velocity: 100, row: 2 }]);
  // And release-all cleans up.
  assert.deepEqual(releaseAll(s).sends, [{ kind: 'off', channel: 1, note: 51 }]);
  assert.deepEqual(releaseAll(EMPTY_SOUNDING).sends, [], 'nothing sounding, nothing sent');
});

test('a tied note is HELD, not retriggered', () => {
  // This is the difference between a line and a stutter.
  const tied = ph({
    key: 0, scale: 'minor', baseOctave: 3, steps: 4, rows: 8, channel: 1, velocity: 100,
    pattern: { '0:0': {}, '1:0': { tie: true }, '2:0': {} },
  });
  let s = playStep(EMPTY_SOUNDING, tied, 0).sounding;
  const held = playStep(s, tied, 1);
  assert.deepEqual(held.sends, [], 'no off, no on — it just keeps ringing');
  s = held.sounding;
  assert.deepEqual(soundingNotes(s), [48]);
  // The untied step 2 retriggers: off then on.
  const retrig = playStep(s, tied, 2);
  assert.deepEqual(retrig.sends.map((m) => m.kind), ['off', 'on']);
});

test('a chord holds one voice and moves another', () => {
  const c = ph({
    key: 0, scale: 'minor', baseOctave: 3, steps: 2, rows: 8, channel: 1, velocity: 100,
    // Row 0 tied across both steps; the upper voice moves 2 → 4.
    pattern: { '0:0': {}, '0:2': {}, '1:0': { tie: true }, '1:4': {} },
  });
  let s = playStep(EMPTY_SOUNDING, c, 0).sounding;
  assert.deepEqual(soundingNotes(s), [48, 51]);
  const r = playStep(s, c, 1);
  // The pedal note stays, the moving voice is released and replaced.
  assert.deepEqual(r.sends.map((x) => (x.kind === 'on'
    ? { kind: x.kind, channel: x.channel, note: x.note, velocity: x.velocity, row: x.row }
    : { kind: x.kind, channel: x.channel, note: x.note })), [
    { kind: 'off', channel: 1, note: 51 },
    { kind: 'on', channel: 1, note: 55, velocity: 100, row: 4 },
  ]);
  assert.deepEqual(soundingNotes(r.sounding), [48, 55]);
});

// --- Geometry ---------------------------------------------------------------------
test('cells tile the grid and hit-testing round-trips', () => {
  const geom = phraseGeometry(520, 180, 16, 8, 8, 20, 26);
  assert.equal(geom.steps, 16);
  assert.equal(geom.rows, 8);
  // The last column ends at the right edge, the top row at the top.
  const last = cellRect(geom, 15, 0);
  assert.ok(near(last.x + last.w, geom.x0 + geom.w, 1e-6));
  assert.ok(near(cellRect(geom, 0, 7).y, geom.y0, 1e-6), 'the highest row is at the top');
  assert.ok(cellRect(geom, 0, 0).y > cellRect(geom, 0, 7).y, 'row 0 is at the BOTTOM');
  // Every cell is findable at its own centre.
  for (const step of [0, 5, 15]) {
    for (const row of [0, 3, 7]) {
      const r = cellRect(geom, step, row);
      assert.deepEqual(cellAtPoint(geom, r.x + r.w / 2, r.y + r.h / 2), { step, row });
    }
  }
  // The gutter is not the grid.
  assert.equal(cellAtPoint(geom, geom.gutterX + 2, geom.y0 + 5), null);
});

// --- Seeds --------------------------------------------------------------------------
test('every seed produces something playable inside the grid', () => {
  for (const seed of PHRASE_SEEDS) {
    const p = phraseSeedPattern(seed.id, 16, 8, (i) => ((i * 37) % 100) / 100);
    assert.ok(p && typeof p === 'object', seed.id);
    if (seed.id === 'clear') { assert.equal(Object.keys(p).length, 0); continue; }
    assert.ok(Object.keys(p).length > 0, `${seed.id} produced nothing`);
    // Nothing may land outside the grid it was asked for.
    assert.equal(hiddenCellCount(p, 16, 8), 0, `${seed.id} escaped the grid`);
    // And every cell must play — a seed that produces silent notes is worse
    // than an empty grid, because it looks like it should work.
    const c = ph({ key: 0, scale: 'minor', baseOctave: 3, steps: 16, rows: 8, pattern: p, channel: 1, velocity: 100 });
    let any = 0;
    for (let i = 0; i < 16; i += 1) any += stepNotes(c, i).notes.length;
    assert.ok(any > 0, seed.id);
  }
});

test('seeds fit a small grid rather than spilling off it', () => {
  // A 4x3 grid is a legitimate thing to have set up before clicking a seed.
  for (const seed of PHRASE_SEEDS) {
    const p = phraseSeedPattern(seed.id, 4, 3, () => 0.9);
    assert.equal(hiddenCellCount(p, 4, 3), 0, `${seed.id} on a 4x3 grid`);
  }
  // The random seed puts exactly one note per step.
  const rnd = phraseSeedPattern('random', 8, 6, (i) => (i % 6) / 6);
  assert.equal(Object.keys(rnd).length, 8);
  // An unknown seed is an empty grid, not a crash.
  assert.deepEqual(phraseSeedPattern('nope', 8, 6), EMPTY_PATTERN);
});

test('a gate must not cut a note the next step ties', () => {
  const tied = ph({
    key: 0, scale: 'minor', baseOctave: 3, steps: 4, rows: 8,
    pattern: { '0:0': {}, '1:0': { tie: true }, '2:2': {} },
  });
  assert.equal(tiesForward(tied, 0, 0), true, 'step 1 holds row 0');
  assert.equal(tiesForward(tied, 1, 0), false, 'step 2 does not');
  // A tie with nothing before it is not a tie — it retriggers, so the gate
  // applies normally.
  const orphan = ph({ steps: 4, rows: 8, pattern: { '2:0': { tie: true } } });
  assert.equal(tiesForward(orphan, 1, 0), false);
  // A row nothing is playing on is never held.
  assert.equal(tiesForward(tied, 0, 5), false);
});

test('the shipped default pattern actually ties where it says it does', () => {
  // A tie with a rest before it silently becomes a retrigger. A default that
  // does that teaches the wrong thing about what the checkbox means.
  const control = ph({
    key: 0, scale: 'minor', baseOctave: 3, steps: 16, rows: 8, channel: 1, velocity: 100,
    pattern: DEFAULT_PATTERN,
  });
  const ties = Object.entries(DEFAULT_PATTERN).filter(([, c]) => c.tie === true);
  assert.ok(ties.length > 0, 'the default should demonstrate a tie');
  for (const [key] of ties) {
    const [step, row] = key.split(':').map(Number);
    assert.equal(isCellOn(DEFAULT_PATTERN, step - 1, row), true,
      `the tie at step ${step} row ${row} has nothing to hold`);
    assert.equal(stepNotes(control, step).notes.find((n) => n.row === row)?.tied, true);
  }
});

test('no seed ships an orphaned tie either', () => {
  // Same trap, five more places to fall into it.
  for (const seed of PHRASE_SEEDS) {
    const map = phraseSeedPattern(seed.id, 16, 8, () => 0.5);
    for (const [key, cell] of Object.entries(map)) {
      if (cell?.tie !== true) continue;
      const [step, row] = key.split(':').map(Number);
      assert.equal(isCellOn(map, step - 1, row), true,
        `seed "${seed.id}" ties step ${step} row ${row} to a rest`);
    }
  }
});

// --- the script API ------------------------------------------------------------------

test('a script patch only names what it changes', () => {
  const cfg = { steps: 16, rows: 8, key: 0, scale: 'minor', direction: 'forward', pattern: {} };
  assert.deepEqual(phraseScriptPatch(cfg, 'direction', { direction: 'reverse' }), { direction: 'reverse' });
  assert.deepEqual(phraseScriptPatch(cfg, 'scale', { scale: 'dorian' }), { scale: 'dorian' });
  assert.deepEqual(phraseScriptPatch(cfg, 'transpose', { transpose: -12 }), { transpose: -12 });
  assert.deepEqual(phraseScriptPatch(cfg, 'run', { running: false }), { running: false });
  // Nothing else rides along — an undo step should say "direction", not "the
  // sequencer".
  for (const action of PHRASE_SCRIPT_ACTIONS) {
    assert.ok(Object.keys(phraseScriptPatch(cfg, action, {})).length <= 1);
  }
});

test('a bad argument is a no-op, not a throw', () => {
  // A script firing on a footswitch must not take the panel down because a
  // scale got misspelled.
  const cfg = { steps: 16, rows: 8, scale: 'minor', pattern: {} };
  assert.deepEqual(phraseScriptPatch(cfg, 'scale', { scale: 'dorain' }), {});
  assert.deepEqual(phraseScriptPatch(cfg, 'direction', { direction: 'sideways' }), {});
  assert.deepEqual(phraseScriptPatch(cfg, 'seed', { seed: 'nope' }), {});
  assert.deepEqual(phraseScriptPatch(cfg, 'transpose', { transpose: 'up a bit' }), {});
  assert.deepEqual(phraseScriptPatch(cfg, 'cell', { step: 99, row: 0 }), {});
  assert.deepEqual(phraseScriptPatch(cfg, 'nonsense', {}), {});
  assert.deepEqual(phraseScriptPatch(null, 'clear', {}), { pattern: {} });
});

test('key wraps rather than clamping', () => {
  // Twelve transposes of one semitone should come back to where they started,
  // not pile up on B.
  let key = 0;
  for (let i = 0; i < 12; i += 1) key = phraseScriptPatch({ key }, 'key', { key: key + 1 }).key;
  assert.equal(key, 0);
  assert.equal(phraseScriptPatch({}, 'key', { key: -1 }).key, 11);
});

test('a scripted cell toggles when unspecified and is idempotent when told', () => {
  const cfg = { steps: 16, rows: 8, pattern: {} };
  const on = phraseScriptPatch(cfg, 'cell', { step: 2, row: 3 }).pattern;
  assert.equal(isCellOn(on, 2, 3), true);
  // Told explicitly, it may be sent twice by a MIDI-mapped switch and must
  // still mean the same thing.
  assert.deepEqual(phraseScriptPatch({ ...cfg, pattern: on }, 'cell', { step: 2, row: 3, on: true }), {});
  const off = phraseScriptPatch({ ...cfg, pattern: on }, 'cell', { step: 2, row: 3, on: false }).pattern;
  assert.equal(isCellOn(off, 2, 3), false);
  assert.deepEqual(phraseScriptPatch({ ...cfg, pattern: off }, 'cell', { step: 2, row: 3, on: false }), {});
});

test('a scripted seed is sized to the grid it lands on', () => {
  // The seed has to know the grid: dropping a 16-step riff onto an 8-step
  // pattern must not leave half of it hidden past the end.
  const patch = phraseScriptPatch({ steps: 8, rows: 4, pattern: {} }, 'seed', { seed: 'riff' });
  for (const key of Object.keys(patch.pattern)) {
    const [step, row] = key.split(':').map(Number);
    assert.ok(step < 8 && row < 4, `${key} is outside an 8x4 grid`);
  }
});

test('swing delays the odd steps, and shares the Arpeggiator\'s function', () => {
  const c = ph({ steps: 8, rows: 8, swing: 0.5, rate: 8 });
  const secs = phraseStepSeconds(c);              // 0.125s at 8 steps/sec
  assert.equal(phraseSwingSeconds(c, 0, secs), 0, 'even steps are on the beat');
  assert.ok(near(phraseSwingSeconds(c, 1, secs), 0.5 * 0.5 * secs), 'odd steps are late');
  assert.equal(phraseSwingSeconds(c, 2, secs), 0);
  // Straight by default, and a delayed step can never overtake the next one.
  assert.equal(phraseSwing(ph({})), 0);
  assert.ok(phraseSwingSeconds(ph({ swing: 1 }), 1, secs) < secs);
  // It's the SAME function the Arp uses, not a copy — two things on one clock
  // at one swing have to land on the same beat.
  assert.equal(phraseSwingSeconds(c, 1, secs), swingDelay(1, 0.5, secs));
  // Applied to the running index, not the pattern step, so reverse and
  // ping-pong stay an even shuffle instead of following the pattern back.
  const rev = ph({ steps: 4, rows: 8, swing: 0.5, direction: 'reverse' });
  assert.deepEqual([0, 1, 2, 3].map((i) => phraseSwingSeconds(rev, i, 1) > 0), [false, true, false, true]);
});

test('swing is inherited from the clock unless a follower opts out', () => {
  // Setting it in two places is how two sequencers stop being the same shuffle.
  const synced = ph({ syncToTransport: true, swing: 0.2 });
  assert.equal(effectiveSwing(synced, 0.6), 0.6, 'the clock wins');
  assert.equal(effectiveSwing(ph({ syncToTransport: true, swing: 0.2, swingSource: 'own' }), 0.6), 0.2);
  // Free-running has no clock to inherit from, so it always uses its own.
  assert.equal(effectiveSwing(ph({ syncToTransport: false, swing: 0.2 }), 0.6), 0.2);
  assert.equal(swingSource(ph({})), 'transport', 'inherit by default');
  assert.equal(swingSource(ph({ swingSource: 'nonsense' })), 'transport');
  // The seconds helper routes through it when given a clock reading.
  const secs = phraseStepSeconds(synced);
  assert.ok(near(phraseSwingSeconds(synced, 1, secs, 0.6), swingDelay(1, 0.6, secs)));
  assert.ok(near(phraseSwingSeconds(synced, 1, secs), swingDelay(1, 0.2, secs)), 'no clock given = own');
});

// --- probability, ratchets, per-cell length -----------------------------------

test('probability is deterministic per lap, not a fresh coin every render', () => {
  // Two sequencers on one clock with one seed must agree, and re-reading the
  // same index must not re-roll — otherwise the grid and the notes disagree.
  const c = ph({ steps: 4, rows: 8, seed: 7, velocity: 100, pattern: { '0:0': { chance: 0.5 } } });
  const a = stepNotes(c, 0).notes.length;
  assert.equal(stepNotes(c, 0).notes.length, a, 'same index, same answer');
  assert.equal(cellRoll(0, 0, 0, 7), cellRoll(0, 0, 0, 7));
  assert.notEqual(cellRoll(0, 0, 0, 7), cellRoll(4, 0, 0, 7), 'the next lap rolls again');
  assert.notEqual(cellRoll(0, 0, 0, 7), cellRoll(0, 0, 0, 8), 'the seed matters');
  // The extremes are certain, not merely likely.
  const never = ph({ steps: 4, rows: 8, pattern: { '0:0': { chance: 0 } } });
  const always = ph({ steps: 4, rows: 8, pattern: { '0:0': { chance: 1 } } });
  for (let i = 0; i < 40; i += 4) {
    assert.equal(stepNotes(never, i).notes.length, 0);
    assert.equal(stepNotes(always, i).notes.length, 1);
  }
  // A cell with no chance field is certain — old patterns don't start gambling.
  assert.equal(cellChance({}), 1);
  assert.equal(cellChance({ chance: 'maybe' }), 1);
});

test('a 50% cell fires roughly half the time over many laps', () => {
  const c = ph({ steps: 4, rows: 8, seed: 3, pattern: { '0:0': { chance: 0.5 } } });
  let hits = 0;
  for (let lap = 0; lap < 200; lap += 1) hits += stepNotes(c, lap * 4).notes.length;
  assert.ok(hits > 60 && hits < 140, `got ${hits}/200 — should be near half`);
});

test('a ratchet divides its own step', () => {
  const c = ph({ steps: 4, rows: 8, pattern: { '0:0': { ratchet: 3 } } });
  const n = stepNotes(c, 0).notes[0];
  assert.equal(n.ratchet, 3);
  const offs = ratchetOffsets(n, 0.3);
  assert.equal(offs.length, 3);
  assert.ok(near(offs[0], 0));
  assert.ok(near(offs[1], 0.1), 'evenly spaced inside the step');
  assert.ok(near(offs[2], 0.2));
  assert.ok(offs[offs.length - 1] < 0.3, 'and all of them inside it');
  assert.equal(cellRatchet({}), 1, 'no ratchet field = one hit');
  assert.equal(cellRatchet({ ratchet: 99 }), 8, 'capped');
  assert.deepEqual(ratchetOffsets({ ratchet: 1 }, 0.3), [0]);
});

test('a cell length overrides the pattern gate and may outlast its step', () => {
  // This is how you write a long note without a chain of ties, which is why it
  // is a multiple of the step rather than a fraction of it.
  const c = ph({ steps: 4, rows: 8, gate: 0.5, pattern: { '0:0': { length: 2 }, '1:0': {} } });
  const long = stepNotes(c, 0).notes[0];
  assert.equal(long.length, 2);
  assert.ok(near(noteGateSeconds(c, long, 0.25), 0.5), 'two steps');
  const plain = stepNotes(c, 1).notes[0];
  assert.equal(plain.length, null);
  assert.ok(near(noteGateSeconds(c, plain, 0.25), 0.125), 'falls back to the pattern gate');
  assert.equal(cellLength({}), null);
  assert.equal(cellLength({ length: 99 }), 4, 'capped');
});

test('the send carries what the caller needs to time it', () => {
  const c = ph({ steps: 4, rows: 8, channel: 1, velocity: 100, pattern: { '0:0': { ratchet: 2, length: 1.5 } } });
  const [on] = playStep(EMPTY_SOUNDING, c, 0).sends;
  assert.equal(on.ratchet, 2);
  assert.equal(on.length, 1.5);
});
