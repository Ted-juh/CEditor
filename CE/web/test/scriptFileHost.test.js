// ce.file's dialogs in the panel view, over a fake native side: what goes out on "scriptFile", what
// a script is handed from "scriptFileResult", and what is refused before anything goes out.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFileDialogs, toBase64, fromBase64, encodeFileData, decodeFileData, fileTypeOfName, isPlainFileName } from '../src/CE_Application/scripting/scriptFileHost.js';

const ID = '0123456789abcdef0123456789abcdef';
const FOLDER = 'fedcba9876543210fedcba9876543210';

function harness({ native = true } = {}) {
  const sent = [];
  const said = [];
  const calls = [];
  const dialogs = createFileDialogs({
    say: (level, text) => said.push(`${level}: ${text}`),
    send: (payload) => { if (!native) return false; sent.push(payload); return true; },
    call: (fn, ...args) => { calls.push(args); fn(...args); },
  });
  const answer = (result) => dialogs.receive({ requestId: sent[sent.length - 1].requestId, ...result });
  return { dialogs, sent, said, calls, answer };
}

test('base64 and the contents of each type', () => {
  for (const bytes of [[], [1], [1, 2], [1, 2, 3], [0xF0, 0x41, 0x10, 0xF7, 0, 255]]) assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.equal(toBase64([0xF0, 0x41, 0xF7]), Buffer.from([0xF0, 0x41, 0xF7]).toString('base64'));
  assert.deepEqual(encodeFileData('syx', 'F0 41 F7'), { bytes: [0xF0, 0x41, 0xF7] });
  assert.match(encodeFileData('syx', 'hello').error, /from bytes/);
  assert.deepEqual(encodeFileData('txt', 'hé'), { bytes: [0x68, 0xC3, 0xA9] });
  assert.match(encodeFileData('csv', [1]).error, /from text/);
  assert.equal(new TextDecoder().decode(Uint8Array.from(encodeFileData('json', { a: [1] }, { indent: 2 }).bytes)), '{\n  "a": [\n    1\n  ]\n}');
  assert.deepEqual(decodeFileData('json', Array.from(Buffer.from('{"a":1}'))), { value: { a: 1 } });
  assert.match(decodeFileData('json', Array.from(Buffer.from('{\n"a": 1,\n}'))).error, /not valid JSON/);
  assert.deepEqual(decodeFileData('txt', [0x68, 0xC3, 0xA9]), { value: 'hé' });
  assert.equal(fileTypeOfName('Song.MIDI'), 'mid');
  assert.equal(isPlainFileName('001 Brass.syx'), true);
  for (const bad of ['a/b.syx', 'a\\b.syx', '../x.syx', 'C:x.syx', '', '  ']) assert.equal(isPlainFileName(bad), false, bad);
});

test('open asks for the types, and hands the script the file value and its contents', () => {
  const { dialogs, sent, calls, answer, said } = harness();
  let got = null;
  assert.equal(dialogs.open({ types: ['syx'], title: 'Import a bank' }, (file, bytes) => { got = { file, bytes }; }), true);
  assert.deepEqual({ ...sent[0], requestId: undefined }, { op: 'open', types: ['syx'], title: 'Import a bank', multiple: false, writable: false, read: true, requestId: undefined });
  answer({ ok: true, files: [{ id: ID, name: 'Bank A.syx', type: 'syx', size: 3, canWrite: false, isFolder: false, data: toBase64([0xF0, 1, 0xF7]) }] });
  assert.deepEqual(got, { file: { id: ID, name: 'Bank A.syx', type: 'syx', size: 3, canWrite: false, isFolder: false }, bytes: [0xF0, 1, 0xF7] });
  assert.deepEqual(said, []);
  dialogs.open({ types: ['syx'] }, (file) => { got = file; });
  answer({ ok: false, cancelled: true });
  assert.equal(got, undefined, 'a cancel calls fn with nothing');
  assert.equal(calls.length, 2);
});

test('a json file that does not parse gives fn the file and nothing, and says where', () => {
  const { dialogs, answer, said } = harness();
  let got;
  dialogs.open({ types: 'json' }, (...args) => { got = args; });
  answer({ ok: true, files: [{ id: ID, name: 'p.json', type: 'json', size: 5, data: toBase64(Array.from(Buffer.from('{\n\n x'))) }] });
  assert.equal(got[0].name, 'p.json');
  assert.equal(got[1], undefined);
  assert.match(said.join('\n'), /ce\.file\.open: "p\.json": it is not valid JSON/);
});

test('what is refused before anything goes out', () => {
  const { dialogs, sent, said } = harness();
  assert.equal(dialogs.open({}, () => {}), false);
  assert.equal(dialogs.open({ types: ['exe'] }, () => {}), false);
  assert.equal(dialogs.open({ types: ['syx'] }), false);
  assert.equal(dialogs.save('notes', 'x'), false);
  assert.equal(dialogs.save('../x.syx', [1]), false);
  assert.equal(dialogs.save('Bank.syx', 'not hex'), false);
  assert.equal(dialogs.read({ id: 'made up', name: 'x' }, () => {}), false);
  assert.equal(dialogs.write({ id: ID, name: 'Bank A.syx', type: 'syx', canWrite: false }, [1]), false);
  assert.equal(dialogs.saveIn({ id: FOLDER, isFolder: true, canWrite: false }, 'a.syx', [1]), false);
  assert.equal(dialogs.saveIn({ id: FOLDER, isFolder: true, canWrite: true }, 'in/a.syx', [1]), false);
  assert.equal(dialogs.read({ id: FOLDER, isFolder: true }, () => {}), false, 'a folder is not read as a file');
  assert.deepEqual(sent, []);
  assert.equal(said.length, 11);
  assert.match(said[1], /"exe" is not a type ce\.file opens/);
  assert.match(said[7], /the person must save to it first/);
});

test('no native side: the dialog commands say so and answer false', () => {
  const { dialogs, said } = harness({ native: false });
  assert.equal(dialogs.open({ types: ['syx'] }, () => {}), false);
  assert.match(said[0], /ce\.file\.open: there is no file dialog here/);
});

test('save, write, folder, list and saveIn go out as base64, and come back as file values', () => {
  const { dialogs, sent, answer } = harness();
  let saved;
  dialogs.save('Bank B.json', { name: 'pad' }, { indent: 1 }, (file) => { saved = file; });
  assert.equal(sent[0].op, 'save');
  assert.equal(Buffer.from(sent[0].data, 'base64').toString(), '{\n "name": "pad"\n}');
  answer({ ok: true, file: { id: ID, name: 'Bank B.json', type: 'json', size: 18, canWrite: true } });
  assert.equal(saved.canWrite, true);
  let written;
  assert.equal(dialogs.write(saved, { name: 'lead' }, (ok) => { written = ok; }), true);
  assert.equal(Buffer.from(sent[1].data, 'base64').toString(), '{"name":"lead"}');
  answer({ ok: true });
  assert.equal(written, true);

  let dir;
  dialogs.folder({ writable: true }, (d) => { dir = d; });
  answer({ ok: true, file: { id: FOLDER, name: 'bank', isFolder: true, canWrite: true }, files: [{ id: ID, name: '2.syx', type: 'syx' }, { id: ID.replace('0', '1'), name: 'notes.txt', type: 'txt' }] });
  assert.equal(dir.isFolder, true);
  assert.deepEqual(dialogs.list(dir, { types: ['syx'] }).map((f) => f.name), ['2.syx']);
  assert.equal(sent[sent.length - 1].op, 'list', 'list asks again, for the next call');
  let one;
  dialogs.saveIn(dir, '001 Brass.syx', [0xF0, 0xF7], { replace: true }, (f) => { one = f; });
  const out = sent[sent.length - 1];
  assert.deepEqual({ op: out.op, id: out.id, name: out.name, replace: out.replace, data: out.data }, { op: 'saveIn', id: FOLDER, name: '001 Brass.syx', replace: true, data: toBase64([0xF0, 0xF7]) });
  answer({ ok: true, file: { id: ID, name: '001 Brass.syx', type: 'syx', canWrite: true }, files: [{ id: ID, name: '001 Brass.syx', type: 'syx' }] });
  assert.equal(one.name, '001 Brass.syx');
  assert.deepEqual(dialogs.list(dir).map((f) => f.name), ['001 Brass.syx']);

  dialogs.forget();
  assert.deepEqual(sent[sent.length - 1], { op: 'forget', requestId: '' });
  assert.deepEqual(dialogs.list(dir), [], 'after the panel closes, a folder lists nothing');
});
