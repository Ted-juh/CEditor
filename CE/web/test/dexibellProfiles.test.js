/**
 * The Dexibell profiles: generated from the Received data of five MIDI Implementation documents by
 * tools/profiles/dexibell/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, and that every received block is its controller on
 * its channel, or named.
 *
 * The reader is checked on lines made by hand, in the document's shape: two blocks side by side, a
 * footage's fraction set just below its heading, and the transmitted half that repeats them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readBlocks } from '../../../tools/profiles/dexibell/read-dexibell-midi.mjs';
import { pointsOf, rangeOf } from '../../../tools/profiles/dexibell/build-dexibell-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/dexibell/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('the blocks: two side by side, a fraction below its heading, the transmitted half set apart', () => {
  const blocks = readBlocks([
    line(4, 85, [50, 'LOWER'], [82, 'TW'], [98, '1'], [121, '(Controller'], [169, 'number'], [204, '77)'], [317, 'TW'], [345, 'Rotary'], [387, '(Controller'], [434, 'number'], [469, '80)']),
    line(4, 87, [105, "1/3'"]),
    line(4, 100, [49, 'Status'], [109, '2nd'], [316, 'Status'], [376, '2nd']),
    line(4, 129, [49, 'n='], [59, 'MIDI'], [77, 'channel;'], [192, 'default'], [217, 'midi'], [233, 'ch.14'], [316, 'n='], [326, 'MIDI']),
    line(4, 144, [49, 'vv='], [62, 'Control'], [88, 'value:'], [109, '00H~7FH'], [316, 'vv='], [329, 'Control'], [355, 'value:'], [376, '00H~7FH']),
    line(4, 158, [49, '0H'], [60, '='], [66, '0,'], [74, '10H'], [89, '='], [95, '1'], [316, '00H'], [330, '='], [340, 'Off,'], [360, '7FH'], [380, '='], [390, 'On']),
    line(4, 170, [49, '•'], [55, 'Not'], [70, 'received'], [316, '•'], [322, 'Not'], [340, 'received']),
    line(7, 85, [50, 'Volume'], [90, '(Controller'], [140, 'number'], [175, '7)']),
    line(7, 100, [49, '•'], [55, 'Not'], [70, 'transmitted']),
  ]);
  assert.deepEqual(blocks.map((b) => [b.section, b.name, b.controllers, b.meanings]), [
    ['received', "LOWER TW 1 1/3'", [77], ['0H = 0, 10H = 1']],
    ['received', 'TW Rotary', [80], ['00H = Off, 7FH = On']],
    ['transmitted', 'Volume', [7], []],
  ]);
  assert.match(blocks[0].channel, /default midi ch\.14/);
});

test('points, bands and byte ranges', () => {
  assert.deepEqual(pointsOf('00H=V1, 08H=C1, 23H=V2'), [{ value: 0, label: 'V1' }, { value: 8, label: 'C1' }, { value: 35, label: 'V2' }]);
  assert.deepEqual(pointsOf('0~63= OFF, 64~127= ON'), [{ value: 0, label: 'OFF' }, { value: 64, label: 'ON' }]);
  assert.deepEqual(rangeOf('vv= Control value: 00H~7FH (0~127)'), { min: 0, max: 127 });
  assert.deepEqual(rangeOf('vv= Control value: 00H~17H (1~23)'), { min: 0, max: 23, mismatch: '1~23' });
  assert.deepEqual(rangeOf('vv= pan: 00H~40H~7FH (Left~Center~Right)'), { min: 0, max: 127 });
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/dexibell/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every received block is its controller on its channel at both ends, or named`, () => {
    const notes = profile.authoringNotes.join('\n');
    for (const b of data.blocks) {
      const p = profile.parameters.find((x) => x.name === b.name && x.description.includes(`(page ${b.page})`));
      if (!p) { assert.ok(notes.includes(b.name), `${b.name} is neither laid out nor named`); continue; }
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const organ = /default midi ch\.?\s*14/.test(b.channel ?? '');
      assert.equal(r.channel, organ ? '$organChannel' : '$channel', p.id);
      const status = 0xb0 + (organ ? profile.variables.organChannel : profile.variables.channel) - 1;
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) assert.equal(hex(localCompileParameter(profile, { parameterId: p.id, value }).transaction.messages[0].bytes), hex([status, b.controllers[0], wire]), `${p.id} = ${value}`);
    }
    for (const t of profile.tests) assert.equal(hex(localCompileParameter(profile, { parameterId: t.parameter, value: t.value }).transaction.messages[0].bytes), t.expectedHex, t.name);
    assert.equal(profile.variables.organChannel, 14);
  });

  test(`${profile.id}: the source is Dexibell's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Dexibell');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
  });
}

test('the S8: a drawbar\'s nine levels, the misprinted one read from its place', () => {
  const s8 = BUILT.find((b) => b.name === 's8').profile;
  const drawbar = s8.parameters.find((p) => p.name === "MAIN TW 16'");
  assert.deepEqual(drawbar.choices.map((c) => `${c.label}=${c.value}`), ['0=0', '1=16', '2=32', '3=48', '4=64', '5=80', '6=96', '7=112', '8=127']);
  assert.ok(s8.authoringNotes.some((n) => /60H as "7", as it does 70H, and has no level 6/.test(n)));
});
