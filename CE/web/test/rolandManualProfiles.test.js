// rolandManualProfiles.test.js — device profiles read out of Roland's own MIDI Implementations.
//
// tools/profiles/roland/ turns a manual's Parameter Address Map into a profile in three steps: a
// parser transcribes the tables, an interpreter decides what each display line means, and a
// generator lays the blocks out from a per-synth layout file. Each step is checked here against
// something that does not come from our own code:
//
//   - the PARSER against Roland's table grammar, on fixtures written in that grammar (below) —
//     including the two ways a `:` row can be read and the one way it must not be;
//   - every GENERATED profile against the example messages its manual prints, byte for byte,
//     through the app's own engine rather than the generator's arithmetic;
//   - the committed profiles against the generator, so a layout edit cannot ship stale.
//
// What none of this checks is a real instrument. The profiles say so (`verifiedOnHardware: false`)
// and this file does not pretend otherwise.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readText } from './support/readText.mjs';
import { checkTables, flat, parseAddressMap } from '../../../tools/profiles/roland/parse-address-map.mjs';
import { interpretRow } from '../../../tools/profiles/roland/interpret.mjs';
import { addAddress, buildProfile, camel, rolandChecksum } from '../../../tools/profiles/roland/build-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/roland/make-profiles.mjs';
import { localCompileParameter, localParseDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the parser */

// Written for this test in Roland's table grammar; the numbers are invented.
const FIXTURE = `
1. EXAMPLE-1 (ModelID = 00H 00H 7AH)
+------------------------------------------------------------------------------+
| Start       |                                                                |
|     Address |                  Description                                   |
|-------------+----------------------------------------------------------------|
| 10 00 00 00 | Temporary Patch                                                |
+------------------------------------------------------------------------------+

**Patch Common
+------------------------------------------------------------------------------+
| Offset      |                                                                |
|     Address |                  Description                                   |
|-------------+----------------------------------------------------------------|
|       00 00 | 0aaa aaaa | Patch Name 1                            (32 - 127) |
|             |           |                                  32 - 127 [ASCII] |
|       00 01 | 0aaa aaaa | Patch Name 2                            (32 - 127) |
|             |           |                                  32 - 127 [ASCII] |
|       00 02 | 0000 0aaa | Filter Mode                                (0 - 2) |
|             |           |                                   LPF, HPF, BPF |
|       00 03 | 0aaa aaaa | Pitch                                    (40 - 88) |
|             |           |                                       -24 - +24 |
|#      00 04 | 0000 aaaa |                                                    |
|             | 0000 bbbb |                                                    |
|             | 0000 cccc |                                                    |
|             | 0000 dddd | Tempo                                (500 - 30000) |
|             |           |                                    5.00 - 300.00 |
|       00 08 | 0aaa aaaa | (reserve) <*>                                      |
|          : |            |                                                    |
|       00 0B | 0aaa aaaa | (reserve) <*>                                      |
|       00 0C | 0000 aaaa | Effect Type                             (0, 5 - 7) |
|       00 0D | 0aaa aaaa | Effect Parameter 1                        (0 - 127) |
|       00 0E | 0aaa aaaa | Effect Parameter 2                        (0 - 127) |
|          : |            |                                                    |
|       00 12 | 0aaa aaaa | Effect Parameter 6                        (0 - 127) |
|-------------+----------------------------------------------------------------|
| 00 00 00 13 | Total Size                                                     |
+------------------------------------------------------------------------------+
`;

test('the parser reads a block: names, ranges, display lines, packets, reserves', () => {
  const map = parseAddressMap(FIXTURE);
  assert.equal(map.modelId, '00 00 7A');
  const top = map.tables.find((t) => t.kind === 'offsets');
  assert.deepEqual(top.entries, [{ address: '10 00 00 00', name: 'Temporary Patch' }]);

  const common = map.tables.find((t) => t.name === 'Patch Common');
  assert.equal(common.totalSize, '00 00 00 13');
  const live = common.rows.filter((r) => !r.gap && !r.reserved);
  const byName = new Map(live.map((r) => [r.name, r]));
  assert.deepEqual([byName.get('Filter Mode').min, byName.get('Filter Mode').max, byName.get('Filter Mode').display], [0, 2, 'LPF, HPF, BPF']);
  assert.equal(byName.get('Tempo').offset, '00 04');
  assert.equal(byName.get('Tempo').nibbles, 4, 'a # row is one value sent in four packets');
  assert.deepEqual(byName.get('Effect Type').values, [0, 5, 6, 7], 'a set keeps its members, not just its ends');
  assert.deepEqual(checkTables(map.tables), [], 'the rows add up to the stated Total Size');
});

test('a `:` between numbered rows is filled in, and only when the arithmetic closes', () => {
  const common = parseAddressMap(FIXTURE).tables.find((t) => t.name === 'Patch Common');
  const effect = common.rows.filter((r) => /^Effect Parameter/.test(r.name ?? ''));
  assert.deepEqual(effect.map((r) => r.offset), ['00 0D', '00 0E', '00 0F', '00 10', '00 11', '00 12']);
  assert.deepEqual(effect.map((r) => r.name), [1, 2, 3, 4, 5, 6].map((n) => `Effect Parameter ${n}`));
  // Between two reserves it is "more of the same nothing" and stays a gap.
  assert.ok(common.rows.some((r) => r.gap), 'the reserve run stays a gap');

  // A series whose ends do not land on the stride is left alone: a missing parameter is a gap a
  // reader can see; an invented one is not.
  const skewed = FIXTURE.replace('|       00 12 | 0aaa aaaa | Effect Parameter 6', '|       00 13 | 0aaa aaaa | Effect Parameter 6');
  const rows = parseAddressMap(skewed).tables.find((t) => t.name === 'Patch Common').rows;
  assert.equal(rows.filter((r) => r.series).length, 0);
});

test('the older documents\' em dashes read the same as hyphens', () => {
  const emDashed = FIXTURE.replace(/-/g, '—');
  const rows = parseAddressMap(emDashed).tables.find((t) => t.name === 'Patch Common').rows;
  const pitch = rows.find((r) => r.name === 'Pitch');
  assert.deepEqual([pitch.min, pitch.max, pitch.display], [40, 88, '-24 - +24']);
});

// The newer documents' grammar (JUNO-X, JUPITER-X, FANTOM, GAIA-2, AX-Edge), and the slips the
// parser meets in Roland's own typesetting. Written for this test; the numbers are invented.
const NEW_STYLE = `
EXAMPLE-2 (ModelID = 00H 00H 00 65H)
+------------------------------------------------------------------------------+
| Start       |                                                                |
|     Address |                  Description                                   |
|-------------+----------------------------------------------------------------|
| 18 00 00 00 | Temporary Tone                                    [Tone]       |
|-------------+----------------------------------------------------------------|
Tone Common
+------------------------------------------------------------------------------+
| Offset      |                                                                |
|     Address |                  Description                                   |
|-------------+----------------------------------------------------------------|
|#      00 00 | 0000 aaaa |                                                    |
|       00 01 | 0000 bbbb |                                                    |
|       00 02 | 0000 cccc |                                                    |
|       00 03 | 0000 dddd | Master Tune                            (24 - 2024) |    beside it, the other column
|             |           |                                      -1000 - 1000 |
|       00 04 | 0aaa aaaa | Assign 5                                  (0 - 99) |
|       00 05 | 0aaa aaaa | Assign 6                                  (0 - 99) |
|       00 04 | 0aaa aaaa | Assign 5                                  (0 - 99) |
|       00 06 | 0aaa aaaa | Fade Width                                         |
|             |           |                                           0 - 127 |
|       00 07 | 0aaa aaaa | Reserved                                   (0 - 0) |
|-------------+----------------------------------------------------------------|
| 00 00 00 0C |Total Size                                                      |
+------------------------------------------------------------------------------+
`;

test('the newer documents\' grammar, and Roland\'s typesetting slips', () => {
  const map = parseAddressMap(NEW_STYLE);
  assert.equal(map.modelId, '00 00 00 65', 'a model id byte printed without its H is still a byte');
  const top = map.tables.find((t) => t.kind === 'offsets');
  assert.deepEqual(top.entries, [{ address: '18 00 00 00', name: 'Temporary Tone', table: 'Tone' }],
    'the bracketed table name is a link, kept apart from the entry\'s name');

  const tone = map.tables.find((t) => t.name === 'Tone Common');
  assert.ok(tone, 'a heading set without its asterisk still names the table under it (and a separator closed the one before)');
  const live = tone.rows.filter((r) => !r.reserved);
  const tune = live.find((r) => r.name === 'Master Tune');
  assert.equal(tune.offset, '00 00');
  assert.equal(tune.nibbles, 4, 'each packet printed with its own offset is still one four-packet value');
  assert.deepEqual(live.map((r) => r.name), ['Master Tune', 'Assign 5', 'Assign 6', 'Fade Width'],
    'a row the manual prints twice is one parameter');
  assert.equal(tone.repeatedRows, 1);
  const fade = live.find((r) => r.name === 'Fade Width');
  assert.deepEqual([fade.min, fade.max, fade.rangeFromDisplay], [0, 127, true], 'a range printed only beneath');
  assert.deepEqual(checkTables(map.tables), [], 'a closing Reserved row stands for the bytes up to Total Size');
});

test('a display line becomes labels only when it counts out', () => {
  const row = (min, max, display, extra = {}) => ({ min, max, display, ...extra });
  assert.deepEqual(interpretRow(row(0, 2, 'LPF, HPF, BPF')).labels, ['LPF', 'HPF', 'BPF']);
  assert.deepEqual(interpretRow(row(0, 1, '-12, -24 [dB]')).labels, ['-12 dB', '-24 dB'], 'a trailing unit belongs to each number');
  assert.equal(interpretRow(row(0, 16, '1 - 16, OFF')).labels.at(-1), 'OFF', 'a span inside a list is opened up');
  assert.deepEqual(interpretRow(row(0, 127, 'L64 - 63R')), { kind: 'number', displayMin: -64, displayMax: 63, unit: '' });
  assert.deepEqual(interpretRow(row(500, 30000, '5.00 - 300.00')), { kind: 'number', displayMin: 5, displayMax: 300, precision: 2 });
  const velocity = interpretRow(row(0, 127, 'REAL, 1 - 127'));
  assert.equal(velocity.kind, 'number', 'a 128-entry menu is a knob with a special value, not a menu');
  assert.equal(velocity.description, 'REAL, 1 - 127');
  const mismatch = interpretRow(row(0, 3, 'A, B, C'));
  assert.equal(mismatch.kind, 'number', 'three labels for four values are not labels');
  assert.equal(mismatch.unresolved, true);
});

test('addresses add in 7-bit digits, with carry', () => {
  assert.equal(addAddress('19 00 00 00', '00 2E 00', '00 7F'), '19 00 2E 7F');
  assert.equal(addAddress('19 00 00 7F', '00 01'), '19 00 01 00');
  assert.equal(addAddress('19 60 00 00', '10 00 00', '00 76 00'), '19 70 76 00');
  assert.equal(flat('00 00 01 43'), 195);
});

/* ------------------------------------------------------------------ the generator's rules */

// A small synthetic synth, built by hand, that meets every rule the six real layouts asked for.
const row = (offset, name, min, max, extra = {}) => ({ offset, bits: ['0aaa aaaa'], name, display: undefined, min, max, ...extra });
const SYNTHETIC_MAP = {
  source: { model: 'TEST-1', packetSize: 4 },
  modelId: '00 00 7A',
  tables: [
    { name: 'TEST-1 (ModelID = 00H 00H 7AH)', kind: 'offsets', entries: [{ address: '10 00 00 00', name: 'Temporary Tone' }], rows: [] },
    {
      name: 'Tone', kind: 'parameters', totalSize: '00 00 00 0C', entries: [],
      rows: [
        ...[0, 1, 2, 3].map((i) => row(`00 0${i}`, 'Name', 32, 127)),   // "Name" printed four times
        row('00 04', 'LFO Step', 0, 127), row('00 05', 'LFO Step', 0, 127), // a repeat with no number
        row('00 06', 'Scale Tune for C', 0, 127), row('00 07', 'Scale Tune for C#', 0, 127),
        row('00 08', '', 0, 31),                                           // printed with no name
        row('00 09', 'Amp Mod', -100, 100),                                // a display range in the wire column
        row('00 0A', 'Level', 0, 127), row('00 0B', 'Pan', 0, 127),
      ],
    },
  ],
};
const SYNTHETIC = {
  id: 'test-1', name: 'Test 1', family: 'T', deviceId: 0x10,
  identity: { familyCode: ['7A', '00'], modelNumber: ['00', '00'] },
  blocks: [{ id: 'tone', table: 'Tone', path: ['Temporary Tone'], group: 'Tone' }],
};

test('the generator: names, repeats, sharps, unnamed rows, impossible ranges', () => {
  const profile = buildProfile(SYNTHETIC_MAP, SYNTHETIC);
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  const name = byId.get('tone.name');
  assert.deepEqual([name?.type, name?.length], ['text', 4], '"Name" printed four times is one four-letter name');
  assert.ok(byId.has('tone.lfoStep1') && byId.has('tone.lfoStep2'), 'a repeated name is numbered in the order printed');
  assert.ok(byId.has('tone.scaleTuneForC') && byId.has('tone.scaleTuneForCSharp'), '# is a sharp, not a collision');
  const unnamed = byId.get('tone.offset0008');
  assert.equal(unnamed?.name, 'Unnamed (offset 00 08)');
  const amp = byId.get('tone.ampMod');
  assert.equal(amp.access.canWrite, false, 'a negative wire range cannot be sent, so it is read-only');
  assert.match(amp.description, /wire range/);
  assert.equal(camel('Scale Tune for C#'), 'scaleTuneForCSharp');
});

test('the generator: a block bigger than one packet is requested in pieces cut between parameters', () => {
  const profile = buildProfile(SYNTHETIC_MAP, SYNTHETIC);
  // 12 bytes at a packet size of 4: the 4-byte name, then 4 single bytes, then 4 more.
  assert.deepEqual(profile.dumpDefinitions.map((d) => [d.id, d.payload.size]), [['tone.part1', 4], ['tone.part2', 4], ['tone.part3', 4]]);
  assert.deepEqual(profile.requests.slice(1).map((r) => [r.address, r.size]),
    [['10 00 00 00', '00 00 00 04'], ['10 00 00 04', '00 00 00 04'], ['10 00 00 08', '00 00 00 04']]);
  const mapped = profile.dumpDefinitions.flatMap((d) => d.mappings.map((m) => m.parameter));
  assert.equal(mapped.length, profile.parameters.length, 'every parameter is in exactly one piece');
});

test('the generator: a block marked noPull is not read at startup', () => {
  const profile = buildProfile(SYNTHETIC_MAP, { ...SYNTHETIC, noPull: [/^tone$/] });
  assert.deepEqual(profile.startup.sync, [{ request: 'identityRequest' }]);
  assert.ok(profile.requests.some((r) => r.id === 'requestTonePart1'), 'still requestable on demand');
  assert.ok(profile.authoringNotes.some((n) => /Not read at startup/.test(n)));
});

/* ------------------------------------------------------------------ the profiles */

// ROLAND_SYNTH=jd-xa,juno-ds checks just those layouts — for working on one while another is open.
const ONLY = process.env.ROLAND_SYNTH ? process.env.ROLAND_SYNTH.split(',') : null;
const BUILT = await Promise.all(SYNTHS.filter((name) => !ONLY || ONLY.includes(name)).map((name) => build(name)));

test('there is at least one Roland profile built from a manual', () => {
  assert.ok(BUILT.length >= 1);
});

for (const { synth, profile, text, out } of BUILT) {
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));

  test(`${synth.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/roland/make-profiles.mjs ${synth.map}`);
  });

  test(`${synth.id}: the manual's own example messages come out byte for byte`, () => {
    // Through the app's engine, not the generator's arithmetic: the generator already refuses to
    // build when its own sum disagrees with the manual, so this is the second, independent reading.
    // A manual whose only printed example contradicts its own table (the JD-XA's p20 puts Reverb
    // Type at the Reverb Switch's address) has no example to check against. The layout must then
    // say so and why, in `examplesUnavailable`; silence is not allowed.
    if (!(synth.examples ?? []).length) {
      assert.match(String(synth.examplesUnavailable ?? ''), /\S{20,}|\S+(\s+\S+){5,}/,
        'a profile from a manual should carry at least one printed example, or say in examplesUnavailable why it cannot');
      return;
    }
    for (const example of synth.examples) {
      const result = localCompileParameter(profile, { parameterId: example.parameter, value: example.value });
      assert.ok(result.ok, result.error);
      assert.equal(result.transaction.hex, example.expectedHex, example.name);
    }
  });

  test(`${synth.id}: every address is 7-bit, unique, and inside exactly one dump`, () => {
    const addresses = new Map();
    for (const p of profile.parameters) {
      for (const byte of p.address.split(' ')) assert.ok(parseInt(byte, 16) <= 0x7f, `${p.id} @${p.address}`);
      assert.ok(!addresses.has(p.address), `${p.id} and ${addresses.get(p.address)} share ${p.address}`);
      addresses.set(p.address, p.id);
    }
    const owners = new Map();
    for (const dump of profile.dumpDefinitions) {
      for (const m of dump.mappings) {
        assert.ok(!owners.has(m.parameter), `${m.parameter} is in ${owners.get(m.parameter)} and ${dump.id}`);
        owners.set(m.parameter, dump.id);
        assert.ok(m.offset >= 0 && m.offset < dump.payload.size, `${m.parameter} is outside ${dump.id}`);
      }
    }
    assert.equal(owners.size, profile.parameters.length, 'a parameter no dump carries is a control a received patch would not fill');
  });

  test(`${synth.id}: every block request carries the right checksum and the manual's size`, () => {
    for (const request of profile.requests.filter((r) => r.id !== 'identityRequest')) {
      // … 11 <address> <size> <checksum> F7: the template must end with exactly that.
      const body = [...request.address.split(' '), ...request.size.split(' ')].map((h) => parseInt(h, 16));
      const tail = request.template.slice(-(body.length + 2)).map((t) => parseInt(t, 16));
      assert.deepEqual(tail.slice(0, -2), body, `${request.id}: the template's address and size are not the request's own`);
      assert.equal(tail.at(-2), rolandChecksum(body), `${request.id}: wrong checksum`);
      assert.equal(request.template.at(-(body.length + 3)), '11', `${request.id}: not an RQ1`);
      const dump = profile.dumpDefinitions.find((d) => d.id === request.response.dump);
      assert.ok(dump, `${request.id} answers with a dump the profile does not define`);
      assert.equal(flat(request.size), dump.payload.size, `${request.id}: asks for one size, parses another`);
    }
  });

  test(`${synth.id}: choices have unique ids and a default that is one of them`, () => {
    for (const p of profile.parameters) {
      if (p.type === 'choice') {
        const ids = p.choices.map((c) => c.id);
        assert.equal(new Set(ids).size, ids.length, `${p.id} has duplicate choice ids`);
        assert.ok(ids.includes(p.default), `${p.id} defaults to ${p.default}, which is not a choice`);
      } else if (p.range) {
        assert.ok(p.default >= p.range.min && p.default <= p.range.max, `${p.id} defaults outside its range`);
      }
    }
  });

  test(`${synth.id}: a whole block read back lands on the right parameters`, () => {
    // The largest block, filled with a pattern, wrapped as the synth would send it, parsed by the
    // app's engine: every mapping must come back, and come back with its own byte.
    const dump = profile.dumpDefinitions.reduce((a, b) => (b.payload.size > a.payload.size ? b : a));
    const data = Array.from({ length: dump.payload.size }, (unused, i) => (i * 5 + 3) % 16);
    // A name field must hold printable ASCII or the engine (rightly) refuses the whole block.
    for (const m of dump.mappings) {
      const p = byId.get(m.parameter);
      if (p.type === 'text') for (let i = 0; i < p.length; i++) data[m.offset + i] = 0x41 + (i % 26);
    }
    const addressLength = dump.matcher.prefix.length - dump.checksum.fromOffset;
    const address = dump.matcher.prefix.slice(-addressLength).map((h) => parseInt(h, 16));
    const header = dump.matcher.prefix.slice(0, dump.checksum.fromOffset).map((h) => (h === '$deviceId' ? synth.deviceId : parseInt(h, 16)));
    const body = [...address, ...data];
    const hex = [...header, ...body, rolandChecksum(body), 0xf7].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

    const parsed = localParseDumpMessage(profile, hex);
    assert.ok(parsed.ok, parsed.error);
    assert.equal(parsed.dumpId, dump.id);
    assert.equal(parsed.checksumStatus, 'ok');
    for (const m of dump.mappings) {
      const p = byId.get(m.parameter);
      if (p.type !== 'integer' && p.type !== 'bipolar') continue;
      const n = p.encoding.nibbles ?? 1;
      const expected = p.encoding.type === 'nibbled'
        ? data.slice(m.offset, m.offset + n).reduce((v, b) => (v << 4) | (b & 0x0f), 0)
        : data[m.offset];
      assert.equal(parsed.values[m.parameter], expected, `${m.parameter} at offset ${m.offset}`);
    }
  });

  test(`${synth.id}: no reply is bigger than one packet`, () => {
    // A bigger block comes back as several DT1s, which no single dump definition can match.
    const map = JSON.parse(readFileSync(new URL(`../../../tools/profiles/roland/maps/${synth.map}.json`, import.meta.url), 'utf8'));
    const packet = map.source.packetSize ?? 128;
    for (const dump of profile.dumpDefinitions) assert.ok(dump.payload.size <= packet, `${dump.id} is ${dump.payload.size} bytes`);
  });

  test(`${synth.id}: says it is unverified on hardware, and where it came from`, () => {
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.equal(profile.status, 'experimental');
    const map = JSON.parse(readFileSync(new URL(`../../../tools/profiles/roland/maps/${synth.map}.json`, import.meta.url), 'utf8'));
    assert.match(map.source.sha256, /^[0-9a-f]{64}$/, 'the map names the exact document it was read from');
    assert.match(profile.sources[0].notes, new RegExp(map.source.sha256));
  });
}
