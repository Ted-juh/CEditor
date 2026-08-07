// gaiaArpBridge.test.js — the drawn arpeggio pattern, written out to the synth.
//
// The GAIA's own semantics, from the MIDI implementation (transcribed in address-map.mjs), and the
// reason this is a transform rather than a copy:
//
//   Original Note   0..127, or 128 for OFF — a lane the arpeggiator skips
//   Step n Data     0 for a rest, 1..127 for a velocity, 128 to tie to the previous step
//
// So a block of length 4 is ONE velocity followed by THREE TIES. Writing the velocity four times
// is four notes retriggering — it sounds like a stutter where a held note should be, and it is the
// mistake this file exists to make impossible.
//
// The other half is the shipped-vs-tested question. `blocksToLanes` is inlined into the panel's
// script by source text rather than rewritten there, and the last test asserts that, because two
// copies of a transform start disagreeing about ties on the third edit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARP_LANES, arpBridgeScript, blocksToLanes } from '../../../tools/scripts/gaia-panel/arp-bridge.mjs';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const shape = { lanes: ARP_LANES, steps: 32 };
const at = (note, step, length = 1, velocity = 96) => ({ note, step, length, velocity });

/* ------------------------------------------------------------------ the semantics */

test('a one-step block is one velocity and nothing else', () => {
  const { lanes } = blocksToLanes([at(60, 0, 1, 112)], shape);
  assert.equal(lanes[0].originalNote, 60);
  assert.equal(lanes[0].steps[0], 112);
  assert.equal(lanes[0].steps[1], 0, 'a one-step block must not reach the next step');
});

test('a long block is one velocity followed by ties', () => {
  // THE test. Four velocities is four retriggers; the hardware's tie marker is 128.
  const { lanes } = blocksToLanes([at(60, 4, 4, 100)], shape);
  assert.deepEqual(lanes[0].steps.slice(3, 9), [0, 100, 128, 128, 128, 0]);
});

test('a block running off the end is truncated, not wrapped', () => {
  // Wrapping would put a tie at step 1 belonging to a note that started at step 30 — the pattern
  // would play something nobody drew.
  const { lanes } = blocksToLanes([at(60, 30, 8, 90)], shape);
  assert.deepEqual(lanes[0].steps.slice(29), [0, 90, 128]);
  assert.equal(lanes[0].steps.length, 32);
});

test('an unused lane is OFF, not note zero', () => {
  // 0 is a real C-1 the arpeggiator would play. 128 is what the manual calls OFF.
  const { lanes } = blocksToLanes([at(60, 0)], shape);
  assert.equal(lanes.length, 16);
  assert.equal(lanes[1].originalNote, 128);
  assert.deepEqual(lanes[1].steps, new Array(32).fill(0));
});

test('velocity is clamped into the range a velocity can hold', () => {
  // 0 is a REST on the wire, so a block can never write one — a block that exists is a note. 128
  // is the tie marker, so it is not a velocity anyone can ask for either.
  assert.equal(blocksToLanes([at(60, 0, 1, 0)], shape).lanes[0].steps[0], 1);
  assert.equal(blocksToLanes([at(60, 0, 1, 200)], shape).lanes[0].steps[0], 127);
  assert.equal(blocksToLanes([at(60, 0, 1, NaN)], shape).lanes[0].steps[0], 96);
});

/* ------------------------------------------------------------------ lanes */

test('lanes are assigned by ascending note, and stably', () => {
  // Stability is not cosmetic: without it, adding one block renumbers every lane and the diffing
  // write sends all 528 addresses for an edit that touched one step.
  const before = blocksToLanes([at(67, 0), at(60, 2), at(64, 4)], shape);
  assert.deepEqual(before.lanes.slice(0, 3).map((l) => l.originalNote), [60, 64, 67]);

  const after = blocksToLanes([at(67, 0), at(60, 2), at(64, 4), at(60, 8)], shape);
  assert.deepEqual(after.lanes.slice(0, 3).map((l) => l.originalNote), [60, 64, 67],
    'adding a block on an existing note must not renumber the lanes');
});

test('two blocks on the same note share one lane', () => {
  const { lanes } = blocksToLanes([at(60, 0, 1, 100), at(60, 8, 2, 80)], shape);
  assert.equal(lanes[1].originalNote, 128, 'one note is one lane');
  assert.equal(lanes[0].steps[0], 100);
  assert.equal(lanes[0].steps[8], 80);
  assert.equal(lanes[0].steps[9], 128);
});

test('a seventeenth note is reported, not silently dropped', () => {
  // The grid does not stop you drawing one. Truncating without saying so reads as "the synth
  // ignored my note", which is a bug report about the wrong component.
  const blocks = Array.from({ length: 18 }, (unused, i) => at(48 + i, i % 32));
  const { lanes, dropped } = blocksToLanes(blocks, shape);
  assert.equal(lanes.length, 16);
  assert.deepEqual(dropped, [64, 65]);
});

test('garbage in is a valid pattern out', () => {
  // This runs inside a panel against whatever the grid holds; throwing here would take the script
  // down and leave the synth on the previous pattern with no sign of why.
  assert.equal(blocksToLanes(null, shape).lanes.length, 16);
  assert.equal(blocksToLanes([{}, { note: 999 }, { note: -1 }], shape).lanes[0].originalNote, 128);
  assert.equal(blocksToLanes([at(60, -1)], shape).lanes[0].steps.every((s) => s === 0), true,
    'a block before step 0 writes nothing');
  assert.equal(blocksToLanes([at(60, 99)], shape).lanes[0].steps.every((s) => s === 0), true);
});

/* ------------------------------------------------------------------ what actually ships */

test('the panel carries the bridge as a panel-scope onPanelLoad script', () => {
  const panel = buildGaiaPanel();
  const script = (panel.scripts ?? []).find((s) => s.id === 'gaia_arp_pattern_bridge');
  assert.ok(script, 'the GAIA panel has no arpeggio bridge script');
  assert.equal(script.scope, 'panel');
  assert.equal(script.event, 'onPanelLoad');
  assert.equal(script.language, 'javascript');
  assert.equal(script.enabled, true);
});

test('the script watches the grid control that actually exists', () => {
  // A renamed control would leave the watch pointing at nothing, and nothing would fire — the
  // silent failure this whole bridge is meant to end.
  const panel = buildGaiaPanel();
  const script = panel.scripts.find((s) => s.id === 'gaia_arp_pattern_bridge');
  const names = new Set(panel.controls.map((c) => c._children?.Core?.name));
  const [, watched] = script.source.match(/watch\("([^".]+)\./) ?? [];
  assert.ok(watched, 'the script does not watch anything');
  assert.ok(names.has(watched), `the script watches "${watched}", which is not a control on the panel`);
});

test('the script writes parameter ids the profile actually has', () => {
  // The ids are built by string concatenation inside the script, so nothing else can catch a
  // rename. Rebuild the same ids here and check them against the profile.
  const profile = JSON.parse(readFileSync(
    path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json'), 'utf8'));
  const known = new Set(profile.parameters.map((p) => p.id));

  for (let lane = 1; lane <= ARP_LANES; lane += 1) {
    assert.ok(known.has(`arpPattern.note${lane}.originalNote`), `lane ${lane} has no originalNote`);
    for (let step = 1; step <= 32; step += 1) {
      assert.ok(known.has(`arpPattern.note${lane}.step${step}Data`),
        `lane ${lane} step ${step} is not in the profile`);
    }
  }
});

test('the shipped transform is the tested transform, character for character', () => {
  // The reason this passes rather than being asserted by eye: two copies of a transform — one under
  // test, one inlined in a template string — disagree about ties on the third edit, and only the
  // untested one is the one that runs.
  assert.ok(arpBridgeScript('arp_pattern_grid').includes(blocksToLanes.toString()));
});

test('the script is valid JavaScript', () => {
  // It is assembled from a template literal, so a stray brace ships happily and fails at load
  // inside the panel, where the error is much further from the cause.
  assert.doesNotThrow(() => new Function(arpBridgeScript('arp_pattern_grid')));
});

/* ------------------------------------------------------------------ the script, running */
//
// Executing the shipped source with stubbed host verbs. The transform above is pure and easy to
// trust; the parts that are NOT covered by trusting it are the id construction (string
// concatenation, so nothing else can catch a rename), the diff (the reason a drag is not seconds of
// MIDI), and the debounce. Those only exist in the template string, so they only get tested here.

/** Run the bridge script with fake host verbs, and hand back what it did. */
function runBridge(gridName = 'arp_pattern_grid') {
  const writes = [];
  const logs = [];
  let blocks = [];
  let scheduled = null;
  let watcher = null;

  const scope = {
    get: (path) => (path === `${gridName}.designer.arpeggiator.blocks` ? blocks : undefined),
    watch: (path, fn) => { watcher = { path, fn }; },
    after: (ms, fn) => { scheduled = { ms, fn }; },
    log: (message) => logs.push(String(message)),
    ce: { device: { write: (id, value) => writes.push([id, value]) } },
  };

  const factory = new Function(...Object.keys(scope), `${arpBridgeScript(gridName)}\nreturn { onPanelLoad };`);
  const { onPanelLoad } = factory(...Object.values(scope));
  onPanelLoad();

  return {
    writes,
    logs,
    /** Change the pattern the way a grid edit would, then let the debounce fire. */
    edit(next) {
      blocks = next;
      writes.length = 0;
      logs.length = 0;
      scheduled = null;
      watcher.fn();
      const pending = scheduled;
      scheduled = null;
      pending?.fn();
      return { writes: [...writes], logs: [...logs], debounceMs: pending?.ms ?? null };
    },
    /** A second edit signal arriving mid-gesture, before the timer has run. */
    editWithoutFiring(next) {
      blocks = next;
      scheduled = null;
      watcher.fn();
      return scheduled;
    },
  };
}

test('the first pattern writes every address once', () => {
  const bridge = runBridge();
  const { writes } = bridge.edit([at(60, 0, 1, 100)]);
  assert.equal(writes.length, 16 * 33, 'the first push has no previous state to diff against');
  assert.deepEqual(writes[0], ['arpPattern.note1.originalNote', 60]);
  assert.deepEqual(writes[1], ['arpPattern.note1.step1Data', 100]);
  assert.deepEqual(writes.at(-1), ['arpPattern.note16.step32Data', 0]);
});

test('moving one block by one step writes two addresses, not 528', () => {
  // The whole reason the script holds state. Without the diff, dragging a block across the grid is
  // several seconds of MIDI per pointer move and the synth never catches up.
  const bridge = runBridge();
  bridge.edit([at(60, 0, 1, 100)]);
  const { writes } = bridge.edit([at(60, 1, 1, 100)]);
  assert.deepEqual(writes, [
    ['arpPattern.note1.step1Data', 0],
    ['arpPattern.note1.step2Data', 100],
  ]);
});

test('an edit that changes nothing writes nothing', () => {
  const bridge = runBridge();
  bridge.edit([at(60, 0, 1, 100)]);
  assert.deepEqual(bridge.edit([at(60, 0, 1, 100)]).writes, []);
});

test('a drag coalesces into one send', () => {
  // watch fires on every pointer move. Scheduling a second timer per move would send once per
  // frame, which is the flood the debounce exists to stop.
  const bridge = runBridge();
  bridge.edit([at(60, 0, 1, 100)]);
  const first = bridge.editWithoutFiring([at(60, 1, 1, 100)]);
  const second = bridge.editWithoutFiring([at(60, 2, 1, 100)]);
  assert.ok(first, 'the first move should schedule a send');
  assert.equal(second, null, 'a move while a send is already pending must not schedule another');
});

test('lengthening a block writes the tie, and shortening it writes the rest back', () => {
  const bridge = runBridge();
  bridge.edit([at(60, 0, 1, 100)]);
  assert.deepEqual(bridge.edit([at(60, 0, 2, 100)]).writes, [['arpPattern.note1.step2Data', 128]]);
  assert.deepEqual(bridge.edit([at(60, 0, 1, 100)]).writes, [['arpPattern.note1.step2Data', 0]]);
});

test('the seventeenth note is reported to the console', () => {
  const bridge = runBridge();
  const blocks = Array.from({ length: 17 }, (unused, i) => at(48 + i, i));
  const { logs } = bridge.edit(blocks);
  assert.ok(logs.some((line) => line.includes('64')), `no note was named: ${logs.join(' | ')}`);
});
