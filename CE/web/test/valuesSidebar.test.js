// valuesSidebar.test.js — the script editor's Values sidebar, the parts that are not a component:
// where the editor draws its three highlights (editor/codeMarks.js), the rules every edit session
// keeps (editor/valueEditSession.js), the dock remembering its tab (editor/dockTabMemory.js), the
// rows laid out from what the core returns (editor/valueRows.js), what the envelope editor does to
// its points (editor/envelopePointEdit.js), and the catalogues it is given (editor/valuesContext.js).
// docs/design/script-editor-value-editors.md is the record.
//
// The sessions run over the real core (readStatement, writeValue) and an editor that is a string:
// each write is recorded, so "one undo step per settled edit" is "one write per settled edit", and
// the clock is driven by hand.

import test from 'node:test';
import assert from 'node:assert/strict';

import { markBoxes, MARK_KINDS } from '../src/CE_Application/editor/codeMarks.js';
import { createEditSession, extentOf, SETTLE_MS } from '../src/CE_Application/editor/valueEditSession.js';
import { readDockTab, writeDockTab, DOCK_TAB_KEY, DOCK_TABS } from '../src/CE_Application/editor/dockTabMemory.js';
import {
  statementRows, everyArg, argAtOffset, findArg, editLabel, spokenPath, meaningLine, madeByChild, swatchHex, cssOfHex,
  gradientStrip, unitLabel, plainSummary, shownNumber, hasRows, controlToSelect,
} from '../src/CE_Application/editor/valueRows.js';
import { valueCatalogues } from '../src/CE_Application/editor/valuesContext.js';
import {
  editablePoints, movePoint, addPoint, removePoint, levelRange, shapeOf, shapeLine,
} from '../src/CE_Application/editor/envelopePointEdit.js';
import { readStatement, readJsonValues, writeValue } from '../src/CE_Application/scripting/scriptValues.js';
import { lineStartsOf } from '../src/CE_Application/utils/lineIndex.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { controlFileText } from '../src/CE_Application/stores/panelFileText.js';

/* ======================================================================================= marks */

const boxes = (marks, text, view) => markBoxes(marks, text, lineStartsOf(text), view)
  .map(({ kind, line, col, width, band }) => (band ? `${kind}@${line}` : `${kind}@${line}:${col}+${width}`));

test('a statement is a band over every line it covers, and nothing changes a character', () => {
  const text = 'a = 1\nce.anim.to("x", 1, {\n  duration = 250,\n})\nb = 2';
  const start = text.indexOf('ce.anim');
  const end = text.indexOf('})') + 2;
  assert.deepEqual(boxes([{ start, end, kind: 'statement' }], text), ['statement@1', 'statement@2', 'statement@3']);
  const [band] = markBoxes([{ start, end, kind: 'statement' }], text, lineStartsOf(text));
  assert.deepEqual([band.band, band.col, band.width], [true, 0, 0], 'a band is the whole width, not a box of characters');
});

test('a value over several lines gets one box per line: from its start, from each indent, to its end', () => {
  const text = 'x({\n    a = 1,\n\n    b = 2 })\n';
  const start = text.indexOf('{');
  const end = text.indexOf('}') + 1;
  // Line 0 from the brace to the end of the line, line 1 from its indent, the blank line none, the
  // last from its indent to the closing brace.
  assert.deepEqual(boxes([{ start, end, kind: 'edit' }], text), ['edit@0:2+1', 'edit@1:4+6', 'edit@3:4+7']);
  const one = text.indexOf('1');
  assert.deepEqual(boxes([{ start: one, end: one + 1, kind: 'hover' }], text), ['hover@1:8+1']);
});

test('marks are drawn in their order, placed only in the window drawn, and not at all when folded', () => {
  const text = Array.from({ length: 10 }, (_, i) => `line${i} = "${i}"`).join('\n');
  const starts = lineStartsOf(text);
  const all = [
    { start: starts[2], end: starts[8], kind: 'statement' },
    { start: starts[5] + 8, end: starts[5] + 11, kind: 'edit' },
    { start: starts[5] + 8, end: starts[5] + 11, kind: 'hover' },
  ];
  assert.deepEqual(boxes(all, text).map((b) => b.split('@')[0]).filter((k, i, a) => a.indexOf(k) === i), MARK_KINDS,
    'statement, then hover, then edit on top');
  assert.deepEqual(boxes(all, text, { first: 4, last: 6 }), ['statement@4', 'statement@5', 'hover@5:8+3', 'edit@5:8+3']);
  assert.deepEqual(boxes(all, text, { folded: true }), []);
  assert.deepEqual(boxes([{ start: 4, end: 4, kind: 'hover' }, { start: -5, end: 3, kind: 'edit' }, { start: 0, end: 3, kind: 'nope' }], text),
    ['edit@0:0+3'], 'an empty range is nothing, a range is clamped to the text, an unknown kind is not drawn');
  assert.deepEqual(markBoxes(null, text, starts), []);
});

/* ==================================================================================== sessions */

/** A clock and timers driven by hand. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    timers: {
      now: () => now,
      setTimeout: (fn, ms) => { const id = next++; pending.set(id, { fn, at: now + ms }); return id; },
      clearTimeout: (id) => { pending.delete(id); },
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    get waiting() { return pending.size; },
  };
}

/** An editor that is a string, and the core read the way the sidebar reads it. */
function harness(source, language, find, { kind = 'colour', clock = fakeClock() } = {}) {
  const editor = { text: source, writes: [] };
  const write = (start, end, text) => {
    editor.writes.push({ start, end, text });
    editor.text = editor.text.slice(0, start) + text + editor.text.slice(end);
    return editor.text;
  };
  const statement = readStatement(source, language, source.indexOf(find) + 1, {});
  const arg = find === '' ? null : everyArg(statement).find((a) => a.kind === kind && source.slice(a.range.start, a.range.end).includes(find))
    ?? argAtOffset(statement, source.indexOf(find) + 1);
  assert.ok(arg, `no ${kind} at ${find}`);
  const updates = [];
  const session = createEditSession({
    source, language, arg, writeValue, write, timers: clock.timers,
    reread: (src, start) => findArg(readStatement(src, language, start, {}), start, arg.kind),
    onupdate: (s) => updates.push(s.ended ?? 'open'),
  });
  return { editor, session, clock, arg, updates };
}

test('a drag writes once, when it settles: nothing while values keep coming, nothing while a pointer is held', () => {
  const src = 'ce.core.set("Title.Text.Fill.colour", "SteelBlue")\n';
  const { editor, session, clock } = harness(src, 'lua', 'SteelBlue');
  session.pointerDown();
  for (let i = 0; i < 60; i += 1) { session.preview(`FF${(0x100000 + i * 0x010203).toString(16).toUpperCase().slice(-6)}`); clock.advance(16); }
  assert.equal(editor.writes.length, 0, 'sixty values in a second, none written');
  clock.advance(SETTLE_MS * 3);
  assert.equal(editor.writes.length, 0, 'still held: the gesture has not settled');
  session.pointerUp();
  assert.equal(editor.writes.length, 1, 'released after standing long enough: written at once, once');
  assert.match(editor.text, /^ce\.core\.set\("Title\.Text\.Fill\.colour", "#[0-9A-F]{6}"\)\n$/);
  // A value that has not stood long enough when the pointer lifts waits out the rest.
  session.preview('FF102030');
  clock.advance(100);
  session.pointerDown();
  session.pointerUp();
  assert.equal(editor.writes.length, 1);
  clock.advance(SETTLE_MS - 100 - 1);
  assert.equal(editor.writes.length, 1);
  clock.advance(1);
  assert.equal(editor.writes.length, 2);
  assert.equal(editor.text, 'ce.core.set("Title.Text.Fill.colour", "#102030")\n');
  // Without a pointer at all (the keyboard, a hex typed in), it settles by time alone.
  session.preview('FF405060');
  clock.advance(SETTLE_MS);
  assert.equal(editor.writes.length, 3);
  assert.equal(clock.waiting, 0, 'no timer is left behind');
});

test('Done writes what is held at once; a value equal to what is written is no write at all', () => {
  const src = 'ce.draw.fill("#5B9BD5")';
  const { editor, session, clock } = harness(src, 'lua', '#5B9BD5');
  session.preview('FF5B9BD5');
  clock.advance(SETTLE_MS);
  assert.equal(editor.writes.length, 0, 'the colour it already has: no edit, so no undo step');
  session.preview('FF112233');
  session.done();
  assert.deepEqual(editor.writes, [{ start: 13, end: 22, text: '"#112233"' }]);
  assert.equal(session.ended, 'done');
  session.preview('FF445566');
  clock.advance(SETTLE_MS * 2);
  assert.equal(editor.writes.length, 1, 'an ended session writes nothing');
});

test('Cancel puts the original characters back exactly, in one edit, whatever was written in between', () => {
  const src = 'local t = 1\nce.core.set("Title.Text.Fill.colour", "SteelBlue") -- the title\n';
  const { editor, session, clock } = harness(src, 'lua', 'SteelBlue');
  for (const hex of ['FF102030', 'FF4682B4', '80102030']) { session.preview(hex); clock.advance(SETTLE_MS); }
  assert.equal(editor.writes.length, 3);
  // Back at SteelBlue's colour, the text is "#4682B4" at one point: Cancel does not re-form it, it
  // puts back the name that was written.
  session.cancel();
  assert.equal(editor.writes.length, 4, 'one edit');
  assert.equal(editor.text, src);
  assert.equal(session.ended, 'cancel');
  // A Cancel with nothing written is no edit.
  const fresh = harness(src, 'lua', 'SteelBlue');
  fresh.session.preview('FF000000');
  fresh.session.cancel();
  assert.deepEqual([fresh.editor.writes.length, fresh.editor.text, fresh.session.ended], [0, src, 'cancel'], 'what was held is dropped');
});

test('the range follows the text: a write that changes the value\'s length moves the edit with it', () => {
  const src = 'ce.core.set("Title.Text.Fill.colour", "red") ce.draw.rect(0, 0, 4, 4)\n';
  const { editor, session, clock } = harness(src, 'lua', '"red"');
  assert.deepEqual(session.range, { start: src.indexOf('"red"'), end: src.indexOf('"red"') + 5 });
  session.preview('FF4A7FB0');
  clock.advance(SETTLE_MS);
  const at = editor.text.indexOf('"#4A7FB0"');
  assert.deepEqual(session.range, { start: at, end: at + 9 }, 'the box covers the new value');
  assert.equal(session.arg.text, '"#4A7FB0"', 'and the value is read again where it now is');
  session.preview('FFFF0000');
  clock.advance(SETTLE_MS);
  assert.equal(editor.text.slice(session.range.start, session.range.end), '"#FF0000"', 'the next write uses the new form');
  session.cancel();
  assert.equal(editor.text, src);
});

test('a session ends when the text moves under it, and writes nothing after', () => {
  const src = 'ce.draw.fill("#5B9BD5")\nce.draw.rect(0, 0, 4, 4)\n';
  const { editor, session, clock } = harness(src, 'lua', '#5B9BD5');
  session.preview('FF102030');
  clock.advance(SETTLE_MS);
  session.sourceChanged(editor.text);
  assert.equal(session.ended, null, 'its own write is not the text moving');
  session.preview('FF203040');
  session.sourceChanged(`${editor.text}-- typed\n`);
  assert.equal(session.ended, 'moved');
  clock.advance(SETTLE_MS * 2);
  assert.equal(editor.writes.length, 1, 'the colour held when it ended is dropped');
  // Every other way: another script, a fold, the editor gone.
  for (const reason of ['left', 'folded']) {
    const h = harness(src, 'lua', '#5B9BD5');
    h.session.preview('FF000000');
    h.session.end(reason);
    h.clock.advance(SETTLE_MS * 2);
    assert.deepEqual([h.session.ended, h.editor.writes.length], [reason, 0]);
  }
  // An editor that cannot take the write (folded, read-only) ends it too.
  const refused = harness(src, 'lua', '#5B9BD5');
  const s = createEditSession({ source: src, language: 'lua', arg: refused.arg, writeValue, write: () => null,
    reread: () => null, timers: refused.clock.timers });
  s.commit('FF000000');
  assert.equal(s.ended, 'failed');
});

test('a value the form cannot carry is not written, and the session stays open', () => {
  // A "#RRGGBB" claimed by its form alone has no reader to say which way round an alpha is read.
  const src = 'local accent = "#5B9BD5"\n';
  const { editor, session } = harness(src, 'lua', '#5B9BD5');
  assert.equal(session.arg.meaning.takesAlpha, false);
  assert.equal(session.commit('805B9BD5'), false);
  assert.deepEqual([editor.writes.length, session.refused, session.ended], [0, '805B9BD5', null]);
  assert.equal(session.commit('FF112233'), true);
  assert.equal(editor.text, 'local accent = "#112233"\n');
  assert.equal(session.refused, null);
});

test('a gradient\'s edit covers its stops and its angle, and an angle it adds is taken out by Cancel', () => {
  const src = 'ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }))\n';
  const { editor, session, clock, arg } = harness(src, 'lua', '"#2A6BD4", "#0A1830"', { kind: 'gradient' });
  assert.deepEqual(extentOf(arg), arg.range, 'no angle written: the stops alone');
  session.preview({ angle: 135, stops: [{ position: 0, colour: '2A6BD4' }, { position: 100, colour: '0A1830' }] });
  clock.advance(SETTLE_MS);
  assert.equal(editor.text, 'ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 135))\n', 'one write, the angle added after the stops');
  assert.equal(editor.writes.length, 1);
  assert.equal(editor.text.slice(session.range.start, session.range.end), '{ "#2A6BD4", "#0A1830" }, 135', 'the range reaches the angle now');
  session.preview({ angle: 135, stops: [{ position: 0, colour: 'FF0000' }, { position: 30, colour: '00FF00' }, { position: 100, colour: '0A1830' }] });
  clock.advance(SETTLE_MS);
  assert.match(editor.text, /\{ at = 0\.3, colour = "#00FF00" \}/);
  assert.equal(editor.writes.length, 2, 'stops and angle in one write');
  session.cancel();
  assert.equal(editor.text, src);
  // Opened at the runtime's 180 and left there, nothing is added.
  const same = harness(src, 'lua', '"#2A6BD4", "#0A1830"', { kind: 'gradient' });
  same.session.preview({ angle: 180, stops: [{ position: 0, colour: '2A6BD4' }, { position: 100, colour: '0A1830' }] });
  same.clock.advance(SETTLE_MS);
  assert.equal(same.editor.writes.length, 0);
});

test('a choice and a number are written at once, each one edit, in the form the old value had', () => {
  const lua = 'ce.anim.to("Cutoff.value", 1, { duration = 250, curve = "outBack" })\n';
  const curve = harness(lua, 'lua', '"outBack"', { kind: 'curve' });
  curve.session.commit('inOutQuad');
  assert.deepEqual([curve.editor.writes.length, curve.editor.text], [1, lua.replace('"outBack"', '"inOutQuad"')]);
  const duration = harness(lua, 'lua', '250', { kind: 'number' });
  duration.session.commit(400);
  assert.equal(duration.editor.text, lua.replace('250', '400'));
  duration.session.commit(400);
  assert.equal(duration.editor.writes.length, 1, 'the same number again is no edit');
  duration.session.commit(1.5);
  assert.equal(duration.editor.text, lua.replace('250', '1.5'));
});

test('the panel file view\'s rows are edited the same way, in the file\'s own form', () => {
  const label = createControl('Label', { name: 'Title' });
  label._children.Background._children.Fill.colour = 'FF5B9BD5';
  const { text } = controlFileText(label);
  const editor = { text, writes: [] };
  const read = (src, at) => readJsonValues(src, at, { control: label });
  const st = read(text, text.indexOf('"colour"'));
  const arg = st.rows.find((r) => r.name === 'colour');
  const anchor = st.range.start + 1;
  const clock = fakeClock();
  const session = createEditSession({
    source: text, language: 'json', arg, writeValue, timers: clock.timers,
    write: (s, e, t) => { editor.writes.push(t); editor.text = editor.text.slice(0, s) + t + editor.text.slice(e); return editor.text; },
    reread: (src, start) => findArg(read(src, anchor), start, 'colour'),
  });
  session.preview('80123456');
  clock.advance(SETTLE_MS);
  assert.deepEqual(editor.writes, ['"80123456"']);
  assert.equal(JSON.parse(editor.text)._children.Background._children.Fill.colour, '80123456');
  session.cancel();
  assert.equal(editor.text, text);
});

/* ================================================================================== the dock tab */

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('the dock opens on Insert the first time and on the tab last used after that', () => {
  const storage = memoryStorage();
  assert.equal(readDockTab(storage), 'insert');
  assert.equal(writeDockTab('values', storage), true);
  assert.equal(storage.data.get(DOCK_TAB_KEY), 'values');
  assert.equal(readDockTab(storage), 'values');
  assert.deepEqual(DOCK_TABS, ['insert', 'library', 'history', 'values']);
  assert.equal(writeDockTab('drawer', storage), false, 'only a tab the dock has');
  assert.equal(readDockTab(storage), 'values');
  storage.setItem(DOCK_TAB_KEY, 'something old');
  assert.equal(readDockTab(storage), 'insert', 'a value it does not know is Insert');
});

test('storage that is missing or refuses leaves the dock on Insert and never throws', () => {
  const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(readDockTab(throwing), 'insert');
  assert.equal(writeDockTab('values', throwing), false);
  assert.equal(readDockTab(null), 'insert');
  assert.equal(writeDockTab('values', null), false);
  // No storage argument at all: the browser's, which Node does not have (or refuses).
  assert.doesNotThrow(() => readDockTab());
  assert.doesNotThrow(() => writeDockTab('history'));
});

/* ========================================================================================= rows */

const NESTED = `function onValueChanged(value)
  ce.core.set("Title.Text.Fill.colour", "SteelBlue")
  ce.anim.to("Cutoff.value", 100, {
    duration = 250,
    curve = "outBack",
    easing = "in",
  })
  ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 135))
end
`;

test('rows follow the call\'s order: options under their table, a call inside another under it', () => {
  const opts = readStatement(NESTED, 'lua', NESTED.indexOf('duration'), {});
  assert.deepEqual(statementRows(opts).map((r) => `${r.depth}:${r.type}:${r.type === 'call' ? r.call.path : r.arg.name}`),
    ['0:call:ce.anim.to', '0:arg:path', '0:arg:target', '0:arg:opts', '1:arg:duration', '1:arg:curve', '1:arg:easing']);
  const nested = readStatement(NESTED, 'lua', NESTED.indexOf('ce.draw'), {});
  assert.deepEqual(statementRows(nested).map((r) => `${r.depth}:${r.type}:${r.type === 'call' ? r.call.path : r.arg.name}`),
    ['0:call:ce.draw.fill', '0:arg:colour', '1:call:ce.draw.gradient', '1:arg:stops', '2:arg:stop 1', '2:arg:stop 2', '1:arg:angle']);
  const fill = nested.calls[0];
  assert.equal(madeByChild(fill, fill.args[0]), true, 'the colour is the gradient call listed under it');
  assert.equal(meaningLine(fill.args[0], { madeBelow: true }), 'made by the call below: a colour');
  const loose = readStatement('local base = "#2A6BD4"\n', 'lua', 3, {});
  assert.deepEqual(statementRows(loose).map((r) => r.type), ['loose', 'arg']);
  assert.equal(hasRows(readStatement('-- nothing\nlocal x = 1\n', 'lua', 12, {})), false);
  assert.deepEqual(statementRows(null), []);
  // Keys are where a value starts, so a write that changes its length keeps its row.
  const keys = statementRows(opts).map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('the caret selects the innermost value holding it, and a value is found again where it starts', () => {
  const nested = readStatement(NESTED, 'lua', NESTED.indexOf('ce.draw'), {});
  const inStop = NESTED.indexOf('#0A1830');
  assert.deepEqual([argAtOffset(nested, inStop).name, argAtOffset(nested, inStop).kind], ['stop 2', 'colour']);
  assert.equal(argAtOffset(nested, NESTED.indexOf('135') + 1).name, 'angle');
  assert.equal(argAtOffset(nested, NESTED.indexOf('ce.draw.gradient') + 3).name, 'colour', 'on the inner call\'s name: the value it is');
  assert.equal(argAtOffset(nested, NESTED.indexOf('ce.draw.fill')), null);
  const opts = readStatement(NESTED, 'lua', NESTED.indexOf('duration'), {});
  assert.equal(argAtOffset(opts, NESTED.indexOf('duration')), null, 'a key is not its value, and the table is a group');
  const stops = findArg(nested, NESTED.indexOf('{ "#2A6BD4"'), 'gradient');
  assert.equal(stops.kind, 'gradient');
  assert.equal(findArg(nested, NESTED.indexOf('{ "#2A6BD4"'), 'colour'), null);
});

test('the display panel names what it edits from the call and the argument', () => {
  const set = readStatement(NESTED, 'lua', NESTED.indexOf('ce.core'), {});
  assert.equal(editLabel({ call: set.calls[0], arg: set.calls[0].args[1], line: 2 }), 'Script · Title text colour, line 2');
  const nested = readStatement(NESTED, 'lua', NESTED.indexOf('ce.draw'), {});
  const gradient = nested.calls[0].children[0];
  assert.equal(editLabel({ call: gradient, arg: gradient.args[0], line: 8 }), 'Script · ce.draw.gradient stops, line 8');
  assert.equal(editLabel({ arg: { name: 'base' }, line: 1 }), 'Script · base, line 1');
  assert.equal(editLabel({ arg: { name: 'colour' }, line: 12, prefix: 'Panel file', where: 'Title Fill' }), 'Panel file · Title Fill colour, line 12');
  assert.deepEqual(['Cutoff.Background.Effects.Bevel.highlightColour', 'panel.bgColour', 'Knob', 'Knob.value'].map(spokenPath),
    ['Cutoff background highlight colour', 'panel bg colour', 'Knob', 'Knob value']);
});

test('a path whose property holds a control set\'s token names the token, not a quoted string', () => {
  const title = createControl('Label', { name: 'Title' });
  title._children.Text._children.Fill.colour = '{text.primary}';
  const src = 'ce.core.set("Title.Text.Fill.colour", "red")';
  const [path] = readStatement(src, 'lua', 2, { panel: { controls: [title] } }).calls[0].args;
  assert.equal(meaningLine(path), 'Title · Label › Text › Fill › colour · now {text.primary} from the control set');
  title._children.Text._children.Fill.colour = 'FF102030';
  const [plain] = readStatement(src, 'lua', 2, { panel: { controls: [title] } }).calls[0].args;
  assert.equal(meaningLine(plain), 'Title · Label › Text › Fill › colour · now "FF102030"');
});

test('a row that names a control on the panel can select it: a control\'s name, or the control a path names', () => {
  const cutoff = createControl('Knob', { name: 'Cutoff' });
  const title = createControl('Label', { name: 'Title' });
  const panel = { controls: [cutoff, title] };
  const cutoffId = cutoff._children.Core.id;
  const titleId = title._children.Core.id;
  const first = (src, ctx = { panel }) => readStatement(src, 'lua', 2, ctx).calls[0].args[0];
  assert.equal(controlToSelect(first('ce.anim.play("Cutoff", "Pulse")')), cutoffId);
  assert.equal(controlToSelect(first('ce.anim.play("cutoff", "Pulse")')), cutoffId, 'found as the runtime finds it, in any case');
  assert.equal(controlToSelect(first('ce.core.set("Title.Text.Fill.colour", "red")')), titleId);
  assert.equal(controlToSelect(first('ce.core.set("Title.Nowhere.atAll", 1)')), titleId, 'a path that leads nowhere still names its control');
  assert.equal(controlToSelect(first('ce.anim.play("Cutof", "Pulse")')), null, 'no control of that name');
  assert.equal(controlToSelect(first('ce.core.set("Nobody.value", 1)')), null);
  assert.equal(controlToSelect(first('on("*", "valueChanged", f)')), null, 'any control is no one selection');
  assert.equal(controlToSelect(first('ce.core.set("panel.bgColour", "red")')), null, 'the panel itself');
  assert.equal(controlToSelect(first('ce.anim.play("Cutoff", "Pulse")', {})), null, 'with no panel nothing is looked up');
  assert.equal(controlToSelect(first('ce.anim.play(name, "Pulse")')), null, 'a name worked out when the script runs');
  // A component script's self.set names the control it is attached to.
  const self = readStatement('self.set("Background.Fill.colour", "red")', 'lua', 2, { panel, selfControl: 'Title' }).calls[0].args[0];
  assert.equal(controlToSelect(self), titleId);
  assert.equal(controlToSelect({ kind: 'colour', meaning: { id: cutoffId } }), null, 'only a control or a path');
});

test('the line under a value is the core\'s meaning, put into words', () => {
  const opts = readStatement(NESTED, 'lua', NESTED.indexOf('duration'), { tempo: 120 });
  const [path, , , duration, curve, easing] = everyArg(opts);
  assert.equal(meaningLine(duration), '250 ms is half a beat at 120 BPM');
  assert.equal(meaningLine(curve), 'cubic-bezier 0.175, 0.885, 0.32, 1.275');
  assert.equal(meaningLine(easing), '', 'an unknown key has its problem, not a meaning');
  assert.equal(meaningLine(path), '', 'with no panel the path is not looked up');
  const set = readStatement(NESTED, 'lua', NESTED.indexOf('ce.core'), {});
  assert.equal(meaningLine(set.calls[0].args[1]), 'stored as #4682B4');
  const nested = readStatement(NESTED, 'lua', NESTED.indexOf('ce.draw'), {});
  const stops = nested.calls[0].children[0].args[0];
  assert.equal(meaningLine(stops), '2 stops · linear, 135°');
  assert.equal(meaningLine(stops.options[0]), 'drawn as #2A6BD4');
  const seeThrough = readStatement('ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "80FFAA00" }))', 'lua', 2, {}).calls[0].children[0].args[0];
  assert.equal(meaningLine(seeThrough.options[1]), 'drawn as #FFAA00 at 50% opacity');
  const noAngle = readStatement('ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }))', 'lua', 2, {}).calls[0].children[0].args[0];
  assert.equal(meaningLine(noAngle), '2 stops · linear, 180°, as it is when no angle is written');
  const notes = readStatement('ce.midi.sendNote(1, "C4", 100)\nce.midi.sendSysex("F0 41 10 42 F7")\nlocal s = ce.time.step(b, "1/8t")', 'lua', 3, {});
  assert.equal(meaningLine(notes.calls[0].args[1]), 'MIDI note 60, middle C');
  const sysex = readStatement('ce.midi.sendSysex("41 10 42")', 'lua', 3, {}).calls[0].args[0];
  assert.equal(meaningLine(sysex), '3 bytes · sent as F0 41 10 42 F7');
  const division = readStatement('local s = ce.time.step(b, "1/8t")', 'lua', 3, {}).calls[0].args[1];
  assert.match(meaningLine(division), /^8th T, /);
  const computed = readStatement('ce.draw.fill(base)', 'lua', 3, {}).calls[0].args[0];
  assert.equal(meaningLine(computed), 'worked out when the script runs: a colour, so there is nothing to edit here');
});

test('a dash says what it draws and skips, in pixels, and when the line is solid or only its caps show', () => {
  const dashOf = (opts) => everyArg(readStatement(`ce.draw.stroke("#FFF", 1, { ${opts} })`, 'lua', 3, {})).find((a) => a.name === 'dash');
  assert.equal(meaningLine(dashOf('dash = { 3, 3 }')), 'in pixels: 3 drawn, 3 skipped');
  assert.equal(meaningLine(dashOf('dash = { 3, 2, 1 }')),
    'in pixels, an odd list twice over: 3 drawn, 2 skipped, 1 drawn, 3 skipped, 2 drawn, 1 skipped');
  assert.equal(meaningLine(dashOf('dash = {}')), 'no lengths, so the line is solid');
  assert.equal(meaningLine(dashOf('dash = { 0, 0 }')), 'every length is 0, so the line is solid');
  assert.equal(meaningLine(dashOf('dash = { 3, -3 }')), 'nothing is skipped, so the line is solid', 'the -3 drawn as 0, which its problem says');
  assert.equal(meaningLine(dashOf('dash = { 0, 4 }')), 'nothing is drawn: a dash of 0 shows only with a round or square cap, as a dot');
  assert.equal(meaningLine(dashOf('dash = { 0, 4 }, cap = "round"')), 'each dash is 0, so the round cap draws it as a dot');
  assert.equal(meaningLine(dashOf('dash = 3')), '', 'refused, which its problem says');
  assert.match(meaningLine(dashOf('dash = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }')), /^in pixels: 1 drawn, 2 skipped, .*8 skipped, …$/);
});

test('swatches, strips, units and numbers as a row shows them', () => {
  assert.equal(swatchHex({ swatch: { rgb: '4682B4', alpha: 1 } }), 'FF4682B4');
  assert.equal(swatchHex({ swatch: { rgb: '5b9bd5', alpha: 0.5 } }), '805B9BD5');
  assert.equal(swatchHex({}), null);
  assert.deepEqual(['FF102030', '80102030', '#102030', 'nope'].map(cssOfHex), ['#102030', 'rgba(16, 32, 48, 0.502)', '#102030', null]);
  assert.equal(gradientStrip({ stops: [{ css: '#000000', at: 0 }, { css: '#FFFFFF', at: 1 }] }), 'linear-gradient(90deg, #000000 0%, #FFFFFF 100%)');
  assert.equal(gradientStrip({ stops: [{ css: '#000000', at: 0 }] }), null);
  assert.deepEqual(['milliseconds', 'degrees', 'pixels', '0 to 127', '0 to 1', undefined].map(unitLabel), ['ms', 'degrees', 'px', '', '', '']);
  assert.equal(plainSummary('Move a value smoothly to `target` over time.'), 'Move a value smoothly to target over time.');
  assert.deepEqual([shownNumber(0.4200001), shownNumber(3), shownNumber(NaN)], ['0.42', '3', 'NaN']);
});

/* ==================================================================== an envelope's points */

const envelopeArg = (src, lang = 'lua') => readStatement(src, lang, 3, {}).calls[0].args.find((a) => a.name === 'points');

test('an envelope\'s line says how many points, their levels, and what the runtime makes of them', () => {
  assert.equal(meaningLine(envelopeArg('ce.anim.envelope("c", { {x=0,y=0}, {x=0.1,y=1}, {x=1,y=0.25} })')), '3 points · levels 0 to 1');
  assert.equal(meaningLine(envelopeArg('ce.anim.envelope("c", { {x=1,y=0}, {x=0,y=1} })')), '2 points · levels 0 to 1 · played in order of x');
  assert.equal(meaningLine(envelopeArg('ce.anim.envelope("c", { {x=0,y=0}, {x=1,y=1.2} })')), '2 points · levels 0 to 1.2 · above 1 goes past to');
  assert.equal(meaningLine(envelopeArg('ce.anim.envelope("c", { {x=0,y=-1}, {x=1,y=0.5} })')), '2 points · levels -1 to 0.5 · below 0 goes past from');
  assert.equal(meaningLine(envelopeArg('ce.anim.envelope("c", { {x=0,y=0}, {x=50,y=1} })')), '2 points · levels 0 to 1', 'refused: its problem says the rest');
  assert.equal(meaningLine(envelopeArg('ce.anim.envelope("c", { {x=0,y=0}, {x=1,y=peak} })')),
    'worked out when the script runs: an envelope, so there is nothing to edit here');
});

test('a dragged point stays between its neighbours in x and in 0 to 1, to three places', () => {
  const points = editablePoints([{ index: 0, x: 0, y: 0 }, { index: 1, x: 0.2, y: 1 }, { index: 2, x: 0.6, y: 0.4 }, { index: 3, x: 1, y: 0 }]);
  assert.deepEqual(movePoint(points, 1, 0.33333, 0.66666)[1], { x: 0.333, y: 0.667, from: 1 });
  assert.deepEqual(movePoint(points, 1, 0.9, 2)[1], { x: 0.6, y: 1, from: 1 }, 'not past the next point, not above 1');
  assert.deepEqual(movePoint(points, 1, -1, -1)[1], { x: 0, y: 0, from: 1 }, 'not before the one before it, not below 0');
  assert.deepEqual(movePoint(points, 0, 0.5, 0.5)[0], { x: 0.2, y: 0.5, from: 0 }, 'the first stays before the second');
  assert.equal(movePoint(points, 2, 0.5, 0.5)[3], points[3], 'the others are as they were');
  // Written out of order: the neighbours are the ones either side in x, not in the list.
  const unsorted = editablePoints([{ index: 0, x: 1, y: 0 }, { index: 1, x: 0, y: 0 }, { index: 2, x: 0.5, y: 1 }]);
  assert.deepEqual(movePoint(unsorted, 2, 0.99, 1)[2], { x: 0.99, y: 1, from: 2 });
  assert.deepEqual(movePoint(unsorted, 0, 0.2, 0)[0], { x: 0.5, y: 0, from: 0 }, 'the last in x stays after the one before it');
  // A level written past 1 stays there when only the x moves, and moves back toward 0 to 1 only.
  const over = editablePoints([{ index: 0, x: 0, y: 0 }, { index: 1, x: 0.5, y: 1.5 }, { index: 2, x: 1, y: 0 }]);
  assert.deepEqual([movePoint(over, 1, 0.4, 1.5)[1].y, movePoint(over, 1, 0.5, 2)[1].y, movePoint(over, 1, 0.5, 0.75)[1].y], [1.5, 1.5, 0.75]);
  // …and a coordinate given as it was is kept to every place it was written to.
  const fine = editablePoints([{ index: 0, x: 0, y: 0 }, { index: 1, x: 0.12345, y: 1 }]);
  assert.deepEqual(movePoint(fine, 1, 0.12345, 0.5)[1], { x: 0.12345, y: 0.5, from: 1 });
});

test('a point is added after the last one at or before it in x, and taken out leaving two at least', () => {
  const points = editablePoints([{ index: 0, x: 0, y: 0 }, { index: 1, x: 0.5, y: 1 }, { index: 2, x: 1, y: 0 }]);
  const added = addPoint(points, 0.25, 0.75);
  assert.deepEqual([added.at, added.points.map((p) => [p.x, p.y, p.from])], [1, [[0, 0, 0], [0.25, 0.75, undefined], [0.5, 1, 1], [1, 0, 2]]]);
  assert.equal(addPoint(points, 2, 0.5).at, 3, 'past the end: last, at x 1');
  assert.deepEqual(addPoint(editablePoints([{ index: 0, x: 0.5, y: 0 }, { index: 1, x: 1, y: 1 }]), 0.1, 0.1).at, 0, 'before the first');
  assert.deepEqual(removePoint(points, 1).map((p) => p.from), [0, 2]);
  assert.equal(removePoint(removePoint(points, 1), 0), null, 'an envelope keeps two');
  assert.deepEqual(levelRange([{ y: -0.5 }, { y: 0.5 }]), { lo: -0.5, hi: 1 });
});

test('the line is the runtime\'s own sampling of the points, curves and all, as they are while held', () => {
  const written = [{ x: 0, y: 0 }, [0.5, 1, 'exp'], { 1: 1, 2: 0, curve: 'log' }];
  const held = [{ x: 0, y: 0, from: 0 }, { x: 0.25, y: 0.5, from: 1 }, { x: 1, y: 0, from: 2 }, { x: 1, y: 1 }];
  assert.deepEqual(shapeOf(written, held), [{ x: 0, y: 0 }, [0.25, 0.5, 'exp'], { 1: 1, 2: 0, curve: 'log', x: 1, y: 0 }, { x: 1, y: 1 }]);
  const flat = shapeLine([0, 0.5, 1], { width: 20, height: 10, pad: 0, every: 1 });
  assert.equal(flat, 'M0.00 10.00 L10.00 5.00 L20.00 0.00');
  assert.equal(shapeLine(new Array(9).fill(0.5), { width: 8, height: 2, every: 4 }), 'M0.00 1.00 L4.00 1.00 L8.00 1.00');
  assert.equal(shapeLine([], { width: 8, height: 2 }), '');
});

test('an envelope\'s edit is one write, in the script\'s form, and the same points again none', () => {
  const lua = 'ce.anim.envelope("Cutoff.value", { {x=0,y=0}, {x=0.1,y=1}, {x=1,y=0} }, { to = 127 })\n';
  const h = harness(lua, 'lua', '{x=0.1', { kind: 'envelope' });
  const points = movePoint(editablePoints(h.arg.meaning.points), 1, 0.3, 0.8);
  h.session.commit(points);
  assert.deepEqual([h.editor.writes.length, h.editor.text], [1, lua.replace('{x=0.1,y=1}', '{x=0.3,y=0.8}')]);
  h.session.commit(points);
  assert.equal(h.editor.writes.length, 1, 'the same points again are no edit');
  h.session.cancel();
  assert.deepEqual([h.editor.writes.length, h.editor.text], [2, lua], 'Cancel puts the characters back, in one edit');
});

test('an envelope written by numbered keys is edited in place, where the runtime reads its x and y', () => {
  // [language, source, the point as written, the point after the edit]
  const cases = [
    ['javascript', 'ce.anim.envelope("Cutoff.value", [{ 0: 0, 1: 0 }, { 0: 0.1, 1: 1 }, { 0: 1, 1: 0 }]);\n', '{ 0: 0.1, 1: 1 }', '{ 0: 0.3, 1: 0.8 }'],
    ['lua', 'ce.anim.envelope("Cutoff.value", { { [0] = 0, [1] = 0 }, { [0] = 0.1, [1] = 1 }, { [0] = 1, [1] = 0 } })\n', '{ [0] = 0.1, [1] = 1 }', '{ [0] = 0.3, [1] = 0.8 }'],
    ['python', 'ce.anim.envelope("Cutoff.value", [{0: 0, 1: 0}, {0: 0.1, 1: 1}, {0: 1, 1: 0}])\n', '{0: 0.1, 1: 1}', '{0: 0.3, 1: 0.8}'],
    // With no entry 0 the count starts at 1, as a Lua table numbers itself.
    ['lua', 'ce.anim.envelope("Cutoff.value", { { [1] = 0, [2] = 0 }, { [1] = 0.1, [2] = 1 }, { [1] = 1, [2] = 0 } })\n', '{ [1] = 0.1, [2] = 1 }', '{ [1] = 0.3, [2] = 0.8 }'],
  ];
  for (const [lang, src, was, now] of cases) {
    const h = harness(src, lang, '0.1', { kind: 'envelope' });
    assert.deepEqual(h.arg.meaning.points.map((p) => [p.x, p.y]), [[0, 0], [0.1, 1], [1, 0]], `${lang}: read as the runtime reads it`);
    h.session.commit(movePoint(editablePoints(h.arg.meaning.points), 1, 0.3, 0.8));
    assert.deepEqual([h.editor.writes.length, h.editor.text], [1, src.replace(was, now)], `${lang}: ${src}`);
  }
});

/* ================================================================================== catalogues */

test('the fonts are given by their stored value and by their name, and the images whole', () => {
  const { fonts, images } = valueCatalogues({
    fonts: [{ value: 'InterTight-Regular', label: 'Inter Tight' }, 'Arial', { value: 'Arial', label: 'Arial' }],
    icons: [{ id: 'cap', name: 'knob-cap', dataUrl: 'data:image/png;base64,AA==' }, { id: 'off', name: 'off', enabled: false }],
  });
  assert.ok(fonts.includes('Inter Tight') && fonts.includes('Arial'));
  assert.equal(fonts.filter((f) => f === 'Arial').length, 1, 'each once');
  assert.deepEqual(images.map((i) => [i.id, i.name, Boolean(i.dataUrl)]), [['cap', 'knob-cap', true]], 'a disabled icon is not one');
  assert.deepEqual(valueCatalogues(), { fonts: [], images: [] });
});
