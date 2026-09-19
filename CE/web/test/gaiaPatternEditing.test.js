import test from 'node:test';
import assert from 'node:assert/strict';
import { gaiaArpGrid } from '../../../tools/scripts/gaia-panel/components.mjs';
import { seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { syncCustomArpeggiatorValues } from '../src/CE_Application/utils/customComponentArpeggiator.js';
import { GaiaPatternHistory, editSelectedPatternNote, decodeGaiaPattern, patternValuesForSend, gaiaPatternReadGroups } from '../src/CE_Application/utils/gaiaPatternEditing.js';
import { gaiaExpectedArpValues, gaiaSyncStatus } from '../src/CE_Application/utils/gaiaSyncStatus.js';
import { createGaiaPatternTransfer } from '../src/CE_Application/utils/gaiaPatternTransfer.js';
const grid = gaiaArpGrid({ width: 1536, height: 240 });
const selected = () => { const v = seedCustomValues(grid); v.__arpeggiator.selectedBlock = v.arpPattern[0].id; return v; };
const withBlocks = (v, blocks) => syncCustomArpeggiatorValues(grid, { ...v, __arpeggiator: { ...v.__arpeggiator, blocks } });

test('history coalesces drags, ignores selection, restores loop/provenance, and branches redo', () => {
  const h = new GaiaPatternHistory(), a = selected();
  const b = withBlocks(a, a.arpPattern.map((b,i) => i ? b : { ...b, velocity: 41 }));
  const c = withBlocks(b, b.arpPattern.map((b,i) => i ? b : { ...b, velocity: 70 }));
  h.record(grid, a, b, true); h.record(grid, b, c, true); h.record(grid, c, c, false);
  assert.equal(h.undo.length, 1);
  const restored = h.restore('undo', grid, c);
  assert.deepEqual(restored.arpPattern, a.arpPattern);
  assert.deepEqual(h.restore('redo', grid, restored).arpPattern, c.arpPattern);
  h.record(grid, c, { ...c, __arpeggiator: { ...c.__arpeggiator, selectedBlock: 'elsewhere' } });
  assert.equal(h.undo.length, 1);
  h.record(grid, c, { ...c, arpEndStep: 8 });
  assert.equal(h.restore('undo', grid, { ...c, arpEndStep: 8 }).arpEndStep, c.arpEndStep);
  h.record(grid, c, b); assert.equal(h.redo.length, 0);
});

test('duplicate uses a free same-pitch slot, delete only selected, full grid refuses copy', () => {
  const a = selected(), b = editSelectedPatternNote(grid, a, 'duplicate').values;
  assert.equal(b.arpPattern.length, a.arpPattern.length + 1);
  assert.notEqual(b.__arpeggiator.selectedBlock, a.__arpeggiator.selectedBlock);
  assert.deepEqual(editSelectedPatternNote(grid, b, 'delete').values.arpPattern, a.arpPattern);
  const full = withBlocks(a, [{ ...a.arpPattern[0], step: 0, length: 32 }]);
  assert.match(editSelectedPatternNote(grid, full, 'duplicate').error, /No free space/);
});

test('decode round-trip retains lane order, ties and inactive notes; empty send clears all 528 values', () => {
  const a = selected(), raw = gaiaExpectedArpValues(grid, a).expected;
  // Reverse all hardware lane addresses, which is valid and must not appear unsynced after import.
  const reversed = { 'arp.endStep': 7 };
  for (let lane=1;lane<=16;lane++) for(const suffix of ['originalNote', ...Array.from({length:32},(_,s)=>`step${s+1}Data`)])
    reversed[`arpPattern.note${lane}.${suffix}`] = raw[`arpPattern.note${17-lane}.${suffix}`];
  const decoded = decodeGaiaPattern(reversed);
  const imported = { ...withBlocks(a, decoded.blocks), arpEndStep: decoded.endStep, __arpPatternSource: decoded.source };
  assert.deepEqual(patternValuesForSend(grid, imported), reversed);
  assert.deepEqual(gaiaExpectedArpValues(grid, imported).expected, reversed);
  const empty = patternValuesForSend(grid, withBlocks(a, []));
  assert.equal(Object.keys(empty).length, 529);
  assert.equal(empty['arpPattern.note1.originalNote'], 128);
  assert.equal(empty['arpPattern.note16.step32Data'], 0);
  assert.throws(() => decodeGaiaPattern({ ...raw, 'arpPattern.note1.step1Data': 128 }), /orphan/);
  assert.throws(() => decodeGaiaPattern({ ...raw, 'arp.endStep': undefined }), /Incomplete/);
});

test('send refuses >16 pitches and same-pitch overlaps without truncation', () => {
  const a = selected();
  assert.throws(() => patternValuesForSend(grid, withBlocks(a, Array.from({length:17}, (_,i)=>({id:`n${i}`,note:40+i,step:0,length:1,velocity:90})))), /16/);
  assert.throws(() => patternValuesForSend(grid, withBlocks(a, [a.arpPattern[0], {...a.arpPattern[0], id:'overlap'}])), /overlap/);
});

function fixture(options = {}) {
  const a = selected(), raw = gaiaExpectedArpValues(grid, a).expected;
  const f = { received: {}, writes: {}, reads: {} }, calls = [], states = [], loaded = [];
  let rev=0, sequence=1;
  const t = createGaiaPatternTransfer({ control:grid, values:()=>a, revision:()=>rev,
    route:()=>({key:'one',ready:true}), feedback:()=>f, timeoutMs:2, sendGapMs:0,
    read: ({request,correlationId}) => {
      calls.push(request);
      const group=gaiaPatternReadGroups.find(g=>g.request===request);
      if (!options.noReply) for(const id of group.ids) f.received[id]={value:raw[id],sequence:sequence++};
      if (options.edit) rev++;
      if (options.routeChange) f.generation=1;
    }, write:v=>calls.push(v), apply:v=>loaded.push(v), status:(...s)=>states.push(s),
    pause: async()=>new Promise(r=>setTimeout(r,1)),
  });
  return {t,f,calls,states,loaded,raw};
}
test('read applies exactly once after 17 fresh complete groups, never sends parameters', async()=>{
  const f=fixture(); await f.t.run('read');
  assert.equal(f.calls.length,17); assert.equal(f.loaded.length,1);
  assert.deepEqual(f.loaded[0].source.raw,f.raw);
  assert.match(f.states.at(-1)[0],/READ COMPLETE/);
});
test('stale/partial cache, concurrent edits and route changes cannot replace the editor', async()=>{
  for(const options of [{noReply:true},{edit:true},{routeChange:true}]) {
    const f=fixture(options);
    for(const [id,value] of Object.entries(f.raw)) f.f.received[id]={value,sequence:0};
    await f.t.run('read');
    assert.equal(f.loaded.length,0); assert.equal(f.calls.length,1);
    assert.equal(f.states.at(-1)[2],true);
  }
});
test('explicit send queues all values but never claims synchronization', async()=>{
  const f=fixture(); await f.t.run('send');
  assert.equal(f.calls.length,529); assert.equal(f.loaded.length,0);
  assert.match(f.states.at(-1)[0],/QUEUED/);
  assert.doesNotMatch(f.states.at(-1)[0],/SYNCED/);
});
