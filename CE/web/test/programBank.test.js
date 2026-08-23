// programBank.test.js — the editor half of Total Recall S4.
//
// The plugin reported one nameless program, so a DAW's program menu was empty and there was no
// host-automatable way to change patch — while the preset librarian had persisted banks, captured
// patch data and recall sitting in browser storage, where neither the Node exporter nor the plugin
// can reach them. So the bank is baked into the panel document at author time.
//
// Two ends of one shape, and they are compiled by different toolchains weeks apart: this file
// writes the document and `CE/src/Player/ProgramBank.h` reads it. A mismatch is silent in the worst
// way — a DAW showing an empty program menu with no error anywhere — so the last test here reads
// the C++ and checks it looks for the same field names.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MAX_PROGRAMS,
  bakeProgramBank,
  bakeReport,
  programBankFromPanel,
  programFromEntry,
} from '../src/CE_Application/utils/programBank.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const READER = readFileSync(join(REPO, 'CE/src/Player/ProgramBank.h'), 'utf8');
const EXPORT_TAB = readFileSync(
  join(REPO, 'CE/web/src/CE_Application/panels/PanelCardContent.svelte'), 'utf8');

const bank = (entries, label = 'Live set') => ({ id: 'b1', label, entries });

test('a captured patch and a name-only entry are both programs', () => {
  // A scan can find a patch called "Big Saw" in slot 12 and never capture it. That is still usable:
  // recall sends the profile's own action for the slot and the synth loads whatever it has there.
  const captured = programFromEntry({ slot: 12, name: 'Big Saw', hex: 'F0 41 F7' });
  const nameOnly = programFromEntry({ slot: 3, name: 'Pad' });
  assert.equal(captured.hex, 'F0 41 F7');
  assert.equal(nameOnly.hex, '');
  assert.equal(nameOnly.name, 'Pad');
});

test('an entry with no slot is not a program', () => {
  // Nothing for either kind of recall to address.
  for (const junk of [{ name: 'x' }, { slot: -1 }, { slot: 'abc' }, null, {}]) {
    assert.equal(programFromEntry(junk), null, JSON.stringify(junk));
  }
});

test('an unnamed slot gets a name', () => {
  // A blank row in a DAW's program menu reads as the plugin being broken, not the patch being
  // unnamed. The C++ reader does the same, for documents written by anything else.
  assert.equal(programFromEntry({ slot: 40, name: '   ' }).name, 'Slot 40');
});

test('programs come out in slot order, not capture order', () => {
  // A DAW's program menu is a numbered list, and a user reading it against the synth's front panel
  // expects those to line up. The librarian's own order is a capture order and means nothing here.
  const baked = bakeProgramBank(bank([
    { slot: 9, name: 'Nine' }, { slot: 1, name: 'One' }, { slot: 5, name: 'Five' },
  ]));
  assert.deepEqual(baked.programs.map((p) => p.slot), [1, 5, 9]);
});

test('a bank with nothing usable in it bakes to nothing, not to an empty bank', () => {
  // Baking an empty `programBank` key would make a panel claim a feature it does not have.
  assert.equal(bakeProgramBank(bank([])), null);
  assert.equal(bakeProgramBank(bank([{ name: 'no slot' }])), null);
  assert.equal(bakeProgramBank(null), null);
});

test('multi-line captured hex is flattened, because a person reads this document', () => {
  const baked = bakeProgramBank(bank([{ slot: 0, name: 'x', hex: 'F0 7E F7\nF0 41 F7' }]));
  assert.equal(baked.programs[0].hex, 'F0 7E F7 F0 41 F7');
});

test('the report says what was dropped, rather than dropping it quietly', () => {
  // A bank of 200 patches silently becoming 128 programs reads as a bug in the DAW.
  const many = Array.from({ length: MAX_PROGRAMS + 20 }, (_, i) => ({ slot: i, name: `P${i}` }));
  const report = bakeReport(bank([...many, { name: 'unusable' }]));
  assert.equal(report.ok, true);
  assert.equal(report.total, MAX_PROGRAMS + 21);
  assert.equal(report.usable, MAX_PROGRAMS + 20);
  assert.equal(report.unusable, 1);
  assert.equal(report.dropped, 20);
  assert.equal(report.bank.programs.length, MAX_PROGRAMS);
});

test('the report counts captured patches separately from names', () => {
  // The two recall differently and one is much weaker, so the count is worth showing.
  const report = bakeReport(bank([
    { slot: 0, name: 'a', hex: 'F0 F7' }, { slot: 1, name: 'b' }, { slot: 2, name: 'c' },
  ]));
  assert.equal(report.withData, 1);
  assert.equal(report.nameOnly, 2);
});

test('a baked bank survives a save and reopen', () => {
  const panel = createPanel('x');
  panel.programBank = bakeProgramBank(bank([{ slot: 4, name: 'Keys', hex: 'F0 F7' }]));
  const reopened = deserializePanel(serializePanel(panel), null, 'x');
  assert.equal(reopened.programBank.programs.length, 1);
  assert.equal(reopened.programBank.programs[0].name, 'Keys');
});

test('a panel with no bank writes no key at all', () => {
  // Same "right or absent" rule as `name` and `cardPresets`: every committed .cepanel would
  // otherwise grow a `"programBank": null`, and the reader would have to tell that from an empty
  // bank for no reason.
  const document = JSON.parse(serializePanel(createPanel('x')));
  assert.ok(!('programBank' in document), 'an unbanked panel should carry no programBank key');
});

test('reading a panel back is as forgiving as the C++ reader', () => {
  assert.equal(programBankFromPanel({}), null);
  assert.equal(programBankFromPanel({ programBank: { programs: [] } }), null);
  assert.equal(programBankFromPanel({ programBank: { programs: 'nope' } }), null);
  const read = programBankFromPanel({ programBank: { programs: [{ slot: 2, name: 'ok' }] } });
  assert.equal(read.programs[0].slot, 2);
});

test('the C++ reader looks for the fields this writes', () => {
  // Compiled by a different toolchain, weeks apart, and a mismatch shows up as an empty program
  // menu with no error anywhere.
  for (const field of ['programBank', 'programs', 'slot', 'name', 'hex', 'label']) {
    assert.ok(READER.includes(`"${field}"`), `ProgramBank.h does not read "${field}"`);
  }
  // And it must never report zero programs — some hosts refuse to instantiate such a plugin.
  assert.match(READER, /juce::jmax \(1, bank\.size\(\)\)/,
    'hostProgramCount must never be able to return zero');
});

test('the Export tab says this is a curated list, not the synth', () => {
  // The honest limit of baking. Without it, a user reasonably expects the menu to track what is
  // actually in the instrument.
  assert.match(EXPORT_TAB, /not a live view of the synth/i);
  assert.match(EXPORT_TAB, /bakeProgramBank|bakeReport/);
});
