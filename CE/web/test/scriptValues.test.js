// scriptValues.test.js — the Values sidebar's pure core: which statement the caret is in, which calls
// and values it holds, what each value means to the runtime that reads it, and how a new value is
// written back in the old one's form. docs/design/script-editor-value-editors.md is the record; its
// fifteen examples are tested here where they apply ("record example N").
//
// What has to hold:
//   - the statement is the whole statement covering the caret's line, every statement on that line,
//     and never a whole block (a function, an `if`) when the caret is on a statement inside it, in
//     all seven languages, parsed or scanned, mid-edit included, and never a throw;
//   - a value is recognised by where it is first (the contract, a path, a key), by its form last;
//   - a reader's refusal is in the runtime's own words: the runtime is called here and compared;
//   - writing the value an argument already holds gives its text back exactly, and writing a new one
//     reads back as the new one;
//   - the panel file view's text is read by the section templates;
//   - and a read stays well under the time a caret move allows.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'svelte/store';

import {
  readStatement, writeValue, readJsonValues, resolveCallee, clearValueCacheForTesting, VALUE_LANGUAGES,
} from '../src/CE_Application/scripting/scriptValues.js';
import { MEMBER_BY_ID, ALL_MEMBERS, allModules, memberMapFor } from '../src/CE_Application/scripting/panelApi.js';
import {
  resetScriptStateForTesting, scriptApiForTesting, setRuntimeHost, clearDeviceRuntimeDefinitions, drawCommandsFor, clearAllDrawings,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { planImage, imageLayer } from '../src/CE_Application/utils/imageLayers.js';
import { controlFileText, panelSettingsFileText, wholeFileText } from '../src/CE_Application/stores/panelFileText.js';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { readText } from './support/readText.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/* ------------------------------------------------------------------------------------ helpers */

/** The offset of `needle` in `src` (plus `delta`), failing loudly when it is not there. */
function at(src, needle, delta = 0) {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `"${needle}" is not in the source`);
  return i + delta;
}

/** The statement with the caret on `needle`. */
const read = (src, lang, needle, ctx) => readStatement(src, lang, at(src, needle, 1), ctx);

/** Its first call (or the call named `pathOf`), searching nested calls too. */
function callOf(statement, pathOf) {
  assert.ok(statement, 'no statement');
  const all = [];
  const visit = (calls) => { for (const c of calls) { all.push(c); visit(c.children); } };
  visit(statement.calls);
  const found = pathOf ? all.find((c) => c.path === pathOf || c.memberId === pathOf) : all[0];
  assert.ok(found, `no call ${pathOf ?? ''} in [${all.map((c) => c.path).join(', ')}]`);
  return found;
}

const argOf = (call, name) => {
  const found = call.args.find((a) => a.name === name);
  assert.ok(found, `${call.path} has no argument ${name} (has ${call.args.map((a) => a.name).join(', ')})`);
  return found;
};
const optOf = (arg, name) => {
  const found = (arg.options ?? []).find((o) => o.name === name);
  assert.ok(found, `no option ${name} (has ${(arg.options ?? []).map((o) => o.name).join(', ')})`);
  return found;
};
const textOf = (src, statement) => src.slice(statement.range.start, statement.range.end);
const apply = (src, edit) => src.slice(0, edit.start) + edit.text + src.slice(edit.end);

/** Every Arg of a statement, options and stops included, depth first. */
function everyArg(statement) {
  const out = [];
  const visitArg = (a) => { out.push(a); for (const o of a.options ?? []) visitArg(o); };
  const visitCall = (c) => { for (const a of c.args) visitArg(a); for (const ch of c.children) visitCall(ch); };
  for (const c of statement.calls) visitCall(c);
  for (const v of statement.values ?? []) visitArg(v);
  return out;
}

/* ------------------------------------------------------------- the runtime, to compare words with */

/** The warnings and errors a call to the WebView runtime writes, and its plain log lines. */
function runtimeLines(fn, kinds = ['warn', 'error']) {
  clearScriptTrace();
  fn();
  return get(scriptTrace).filter((t) => kinds.includes(t.kind)).map((t) => t.message);
}

/** A host over a panel, as the player has, so a call that needs a control finds one. */
function withPanel(controls, fn) {
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls,
    scripting: { modules: ['ce.core', 'ce.anim', 'ce.device', 'ce.panel', 'ce.ui', 'ce.draw', 'ce.math', 'ce.time', 'ce.music', 'ce.midi', 'ce.image', 'ce.text'] } };
  setRuntimeHost({
    panel, scripts: [],
    readValue: (control, p) => valueAtPath(control, p),
    writeValue: (control, p, value) => (setNestedValue(control, p, value), true),
  });
  clearDeviceRuntimeDefinitions();
  try { return fn(scriptApiForTesting('', 'values-probe'), panel); } finally { setRuntimeHost(null); }
}

test.after(() => resetScriptStateForTesting());

/** A panel with a few named controls, for the checks that need one. */
function demoPanel() {
  const cutoff = createControl('Knob', { name: 'Cutoff' });
  cutoff._children.Value = { ...(cutoff._children.Value ?? {}), value: 0.42 };
  cutoff._children.Animations = {
    _type: 'Animations',
    _children: { Pulse: { name: 'Pulse', kind: 'keyframes' }, Hover: { name: 'Hover', kind: 'transition' } },
  };
  const label = createControl('Label', { name: 'Title' });
  return { id: 'demo', name: 'Demo', controls: [cutoff, label] };
}

/* ======================================================================== callee resolution */

test('a call is known by every name the contract gives it', () => {
  const cases = [
    ['ce.anim.to', 'animateTo'], ['animateTo', 'animateTo'], ['set', 'set'], ['ce.core.set', 'set'],
    ['ce.core.warn', 'logWarn'], ['logWarn', 'logWarn'], ['ce.draw.gradient', 'drawGradient'],
    ['ce.components.setlist.jump', 'setlistGoto'], ['to14Bit', 'to14bit'], ['ce.midi.sendCC', 'sendCC'],
    // C++, C# and Java reach the API through ctx; C# in its .NET capitals, Java with typed reads.
    ['ctx.set', 'set'], ['ctx.setValue', 'set'], ['ctx.SetValue', 'set'], ['ctx.GetValue', 'get'],
    ['ctx.SendCC', 'sendCC'], ['ctx.Log', 'log'], ['ctx.getDouble', 'get'], ['ctx.getBoolean', 'get'],
    ['ctx.ce.midi.sendNote', 'sendNote'],
  ];
  for (const [callee, id] of cases) assert.equal(resolveCallee(callee)?.memberId, id, callee);
  assert.deepEqual([resolveCallee('self.set')?.memberId, resolveCallee('self.set')?.self], ['set', true]);
  for (const callee of ['tostring', 'math.floor', 'self.width', 'ce.anim.easing', 'onPanelLoad', 'ctx.nope']) {
    assert.equal(resolveCallee(callee), null, callee);
  }
});

test('every kind the contract gives a parameter or an option is one the sidebar reads, and its type is kept', () => {
  const READ = new Set(['colour', 'gradient', 'curve', 'envelope', 'division', 'scale', 'chord', 'enum', 'number', 'control',
    'path', 'deviceParameter', 'note', 'event', 'animation', 'font', 'image', 'bytes', 'dash', 'options', 'patch', 'componentIndex', 'componentWord', 'deviceRole', 'dumpKind', 'sharedName', 'noteList', 'lcdLine', 'presetSlot', 'componentType', 'fontAxis']);
  let count = 0;
  for (const member of ALL_MEMBERS) {
    for (const p of member.params ?? []) {
      for (const each of [p, ...(Array.isArray(p.fields) ? p.fields : [])]) {
        if (!each.kind) continue;
        assert.ok(READ.has(each.kind), `${member.id}(${p.name}${each === p ? '' : `.${each.name}`}): kind ${each.kind}`);
        assert.equal(typeof each.type, 'string', `${member.id}(${p.name}): the kind is beside the type, not instead of it`);
        count += 1;
      }
    }
  }
  assert.ok(count > 80, `only ${count} kinds`);
  assert.deepEqual([MEMBER_BY_ID.drawGradient.params[0].kind, MEMBER_BY_ID.drawGradient.params[0].type], ['gradient', 'list']);
});

test('ce.anim.to( resolves, where signature help stops at the word before the bracket', () => {
  const src = 'ce.anim.to("cutoff", 127, { duration = 500 })';
  const call = callOf(read(src, 'lua', 'ce.anim'));
  assert.deepEqual([call.memberId, call.path], ['animateTo', 'ce.anim.to']);
  assert.equal(call.summary, undefined, 'what the call does is the picker\'s and the hover card\'s to say, not the Values tab\'s');
  assert.deepEqual(call.nameRange, { start: 0, end: 'ce.anim.to'.length });
  assert.deepEqual(call.range, { start: 0, end: src.length });
});

/* ======================================================================= finding the statement */

test('a call written over several lines is one statement, wherever on it the caret is', () => {
  const src = 'local x = 1\nce.anim.to("cutoff", 127, {\n  duration = 500,\n  curve = "outBack",\n})\nlocal y = 2\n';
  for (const lang of ['lua']) {
    for (const needle of ['ce.anim', 'duration', 'curve', '})']) {
      const st = read(src, lang, needle);
      assert.deepEqual(st.lines, { first: 2, last: 5 }, needle);
      assert.equal(textOf(src, st), 'ce.anim.to("cutoff", 127, {\n  duration = 500,\n  curve = "outBack",\n})');
      assert.deepEqual(st.calls.map((c) => c.path), ['ce.anim.to']);
    }
  }
  const js = 'const x = 1;\nce.anim.to("cutoff", 127, {\n  duration: 500,\n  curve: "outBack",\n});\n';
  for (const lang of ['javascript', 'typescript']) {
    const st = read(js, lang, 'curve');
    assert.deepEqual(st.lines, { first: 2, last: 5 }, lang);
    assert.equal(optOf(argOf(st.calls[0], 'opts'), 'curve').kind, 'curve');
  }
  const py = 'x = 1\nce.anim.to("cutoff", 127, {\n    "duration": 500,\n    "curve": "outBack",\n})\n';
  const st = read(py, 'python', '"curve"');
  assert.deepEqual(st.lines, { first: 2, last: 5 });
  assert.equal(optOf(argOf(st.calls[0], 'opts'), 'duration').kind, 'number');
});

test('every statement on the caret\'s line is read, in source order', () => {
  const lua = 'ce.draw.fill("#5B9BD5") ce.draw.rect(0, 0, 10, 10)\nlog("next")';
  const st = read(lua, 'lua', 'rect');
  assert.deepEqual(st.calls.map((c) => c.path), ['ce.draw.fill', 'ce.draw.rect']);
  assert.equal(textOf(lua, st), 'ce.draw.fill("#5B9BD5") ce.draw.rect(0, 0, 10, 10)');
  const js = 'ce.draw.fill("#5B9BD5"); ce.draw.rect(0, 0, 10, 10);\nlog("next");';
  assert.deepEqual(read(js, 'javascript', 'fill').calls.map((c) => c.path), ['ce.draw.fill', 'ce.draw.rect']);
  assert.deepEqual(read(js, 'typescript', 'fill').calls.map((c) => c.path), ['ce.draw.fill', 'ce.draw.rect']);
  const py = 'set("a", 1); log("b")\nlog("c")';
  assert.deepEqual(read(py, 'python', 'log("b")').calls.map((c) => c.path), ['set', 'log']);
  const cs = 'ctx.SetValue("a", 1); ctx.Log("b");\nctx.Log("c");';
  assert.deepEqual(read(cs, 'csharp', 'Log("b")').calls.map((c) => c.path), ['set', 'log']);
});

test('a caret inside a function body or an if reads its own statement, not the block', () => {
  const lua = 'function onValueChanged(e)\n  if e.value > 0.5 then\n    set("Lbl.Text.content", "high")\n  else\n    log("low")\n  end\nend\n';
  const inner = read(lua, 'lua', 'set(');
  assert.equal(textOf(lua, inner), 'set("Lbl.Text.content", "high")');
  assert.deepEqual(inner.lines, { first: 3, last: 3 });
  assert.equal(textOf(lua, read(lua, 'lua', 'log(')), 'log("low")');
  // The header lines are the block's own text: a band over them, and nothing of the body.
  assert.equal(textOf(lua, read(lua, 'lua', 'if e')), 'if e.value > 0.5 then');
  assert.equal(textOf(lua, read(lua, 'lua', 'function')), 'function onValueChanged(e)');
  assert.deepEqual(read(lua, 'lua', 'else').calls, []);

  const js = 'function onValueChanged(e) {\n  if (e.value > 0.5) {\n    set("Lbl.Text.content", "high");\n  } else {\n    log("low");\n  }\n}\n';
  for (const lang of ['javascript', 'typescript']) {
    assert.equal(textOf(js, read(js, lang, 'set(')), 'set("Lbl.Text.content", "high");', lang);
    assert.equal(textOf(js, read(js, lang, 'log(')), 'log("low");', lang);
    assert.deepEqual(read(js, lang, 'if (').lines, { first: 2, last: 2 }, lang);
  }
  const cpp = 'void onValueChanged(CeContext& ctx, const CeEvent& event) {\n    if (event.value > 0.5)\n        ctx.set("Lbl.Text.content", "high");\n}\n';
  assert.equal(textOf(cpp, read(cpp, 'cpp', 'ctx.set')), 'ctx.set("Lbl.Text.content", "high");');
  assert.equal(textOf(cpp, read(cpp, 'cpp', 'if (')), 'if (event.value > 0.5)');
  const java = 'public void onValueChanged(CeContext ctx, CeEvent event) {\n    ctx.set("A", 1);\n    ctx.log("b");\n}\n';
  assert.deepEqual(read(java, 'java', 'ctx.log').calls.map((c) => c.path), ['log']);
});

test('a callback\'s body is its own statements; the call that takes it keeps its own text', () => {
  const lua = 'on("Cutoff", "onValueChanged", function(e)\n  set("Lbl.Text.content", tostring(e.value))\nend)\n';
  const header = read(lua, 'lua', 'on(');
  assert.equal(textOf(lua, header), 'on("Cutoff", "onValueChanged", function(e)');
  const on = callOf(header, 'on');
  assert.deepEqual(on.args.map((a) => a.kind), ['control', 'event', 'computed']);
  assert.deepEqual(on.children, [], 'the body is no part of the call\'s rows');
  assert.deepEqual(read(lua, 'lua', 'set(').calls.map((c) => c.path), ['set']);
  // The closing line is the call's too.
  assert.deepEqual(read(lua, 'lua', 'end)').calls.map((c) => c.path), ['on']);

  const js = 'on("Cutoff", "onValueChanged", (e) => {\n  set("Lbl.Text.content", String(e.value));\n});\n';
  for (const lang of ['javascript', 'typescript']) {
    assert.deepEqual(read(js, lang, 'on(').calls.map((c) => c.path), ['on'], lang);
    assert.deepEqual(read(js, lang, 'set(').calls.map((c) => c.path), ['set'], lang);
  }
  // An arrow with an expression body is no statement: its call is the outer call's child.
  const arrow = 'on("x", "valueChanged", (e) => set("B", e.value));';
  const call = callOf(read(arrow, 'javascript', 'on('), 'on');
  assert.deepEqual(call.children.map((c) => c.path), ['set']);
});

test('a comment line and a blank line hold no statement', () => {
  const lua = '-- a comment\nset("a", 1)\n\nlog("b")\n--[[ a long\ncomment ]]\n';
  assert.equal(read(lua, 'lua', '-- a'), null);
  assert.equal(readStatement(lua, 'lua', lua.indexOf('\n\n') + 1), null);
  assert.equal(read(lua, 'lua', 'comment ]]'), null);
  const js = '// a comment\nset("a", 1);\n/* block\n   comment */\n';
  assert.equal(read(js, 'javascript', 'a comment'), null);
  assert.equal(read(js, 'javascript', 'comment */'), null);
  const py = '# a comment\nset("a", 1)\n';
  assert.equal(read(py, 'python', 'a comment'), null);
  assert.equal(readStatement('', 'lua', 0), null);
  assert.equal(readStatement('set(1)', 'cobol', 0), null);
});

test('a source mid-edit is read by the scanner, without a throw or a range outside it', () => {
  // An unclosed bracket above a line no deeper than the statement it opened: the line below is a
  // statement of its own.
  const unclosed = 'set("A.Background.Fill.colour", foo(1, "x"\nlog("b")\n';
  for (const lang of ['lua', 'javascript', 'typescript', 'python']) {
    const first = read(unclosed, lang, 'set(');
    assert.equal(first.parsed, false, lang);
    assert.deepEqual(first.lines, { first: 1, last: 1 }, lang);
    const call = callOf(first, 'set');
    assert.equal(call.open, true, `${lang}: the call never closes`);
    assert.equal(argOf(call, 'path').kind, 'path');
    assert.deepEqual(read(unclosed, lang, 'log(').calls.map((c) => c.path), ['log'], lang);
  }
  // An unclosed string runs to its line's end.
  const string = 'set("Lbl.Text.content", "unclosed\nlog("b")\n';
  for (const lang of ['lua', 'javascript', 'python']) {
    const call = callOf(read(string, lang, 'set('), 'set');
    assert.equal(argOf(call, 'value').kind, 'computed', `${lang}: an open string is not written out`);
    assert.deepEqual(read(string, lang, 'log(').calls.map((c) => c.path), ['log'], lang);
  }
  // Half a call, typed into the middle of a script.
  const lua = 'function onDraw(info)\n  ce.draw.fill(\n  ce.draw.rect(0, 0, 10, 10)\nend\n';
  assert.doesNotThrow(() => read(lua, 'lua', 'fill('));
});

test('no caret anywhere in any truncated script throws, and the range always holds the caret\'s line', () => {
  const scripts = {
    lua: 'function onDraw(info)\n  ce.draw.fill(ce.draw.gradient({ "#2A6BD4", { at = 0.3, colour = "#5B9BD5" } }, 135))\n  local t = [[long\nstring]] -- note\n  if x then ce.anim.to("c", 1, { curve = "outBack" }) end\nend\n',
    javascript: 'function onDraw(info) {\n  ce.draw.fill(ce.draw.gradient(["#2A6BD4", { at: 0.3, colour: "#5B9BD5" }], 135));\n  const re = /a[)]+/g; const t = `x${1}y`;\n  if (x) { ce.anim.to("c", 1, { curve: [0.2, 0.9, 0.3, 1.4] }); }\n}\n',
    typescript: 'const x: number = 1;\ninterface P { a: string; }\nfunction f(a: { b: number }): void {\n  set("A.Background.Fill.colour", "#FF0000" as string);\n}\n',
    python: '@dec(1)\ndef on_value_changed(e):\n    """doc"""\n    if e.value > 0.5: set("A", f"{e.value}")\n    ce.anim.to("c", 1, {"curve": "outBack"})\n',
    cpp: 'void onValueChanged(CeContext& ctx, const CeEvent& event) {\n    auto f = [&](int a) { ctx.log(R"(x)y)"); };\n    ctx.set("A", event.value * 2.0f);\n}\n',
    csharp: 'public void OnValueChanged(CeContext ctx, CeEvent e) {\n    var s = $"{e.Value}"; var v = @"a""b";\n    ctx.SetValue("A", e.Value);\n}\n',
    java: 'public void onValueChanged(CeContext ctx, CeEvent e) {\n    String t = """\n      block""";\n    ctx.set("A", ctx.getDouble("B"));\n}\n',
  };
  assert.deepEqual(Object.keys(scripts).sort(), [...VALUE_LANGUAGES].sort(), 'every language the sidebar reads');
  for (const [lang, full] of Object.entries(scripts)) {
    for (let cut = 1; cut <= full.length; cut += 3) {
      const src = full.slice(0, cut);
      for (let caret = 0; caret <= src.length; caret += 7) {
        let st;
        assert.doesNotThrow(() => { st = readStatement(src, lang, caret); }, `${lang} at ${cut}/${caret}`);
        if (!st) continue;
        const line = src.slice(0, caret).split('\n').length;
        assert.ok(st.range.start >= 0 && st.range.end <= src.length && st.range.start < st.range.end, `${lang} ${cut}/${caret}: range`);
        assert.ok(st.lines.first <= line && line <= st.lines.last, `${lang} ${cut}/${caret}: line ${line} not in ${st.lines.first}-${st.lines.last}`);
        for (const a of everyArg(st)) {
          assert.ok(a.range.start >= 0 && a.range.end <= src.length, `${lang} ${cut}/${caret}: an argument's range`);
          assert.equal(src.slice(a.range.start, a.range.end), a.text);
        }
      }
    }
  }
});

test('the scanner finds the statements a parse finds, in a script that parses', () => {
  // TypeScript is always scanned, and plain JavaScript is TypeScript; a stray `)` at the end of a
  // Lua script makes it scanned and changes nothing above it.
  const js = 'function onDraw(info) {\n  ce.draw.clear();\n  ce.draw.fill("#5B9BD5")\n  if (info.width > 10) { ce.draw.rect(0, 0, 10, 10); }\n  else ce.draw.circle(5, 5, 5);\n  for (let i = 0; i < 3; i++) {\n    ce.draw.line(i, 0, i, 10);\n  }\n}\non("x", "valueChanged", (e) => {\n  set("y", e.value);\n});\nconst opts = { duration: 500,\n  curve: "outBack" };\n';
  const lua = 'function onDraw(info)\n  ce.draw.clear()\n  ce.draw.fill("#5B9BD5")\n  if info.width > 10 then ce.draw.rect(0, 0, 10, 10)\n  else ce.draw.circle(5, 5, 5) end\n  for i = 0, 2 do\n    ce.draw.line(i, 0, i, 10)\n  end\nend\non("x", "valueChanged", function(e)\n  set("y", e.value)\nend)\nlocal opts = { duration = 500,\n  curve = "outBack" }\nrepeat x = x + 1 until x > 3\n';
  // The start of every line but the last, empty one (where the stray `)` goes).
  const lines = (src) => src.split('\n').slice(0, -1).map((_, i) => src.split('\n').slice(0, i).join('\n').length + (i ? 1 : 0));
  for (const offset of lines(js)) {
    const parsed = readStatement(js, 'javascript', offset);
    const scanned = readStatement(js, 'typescript', offset);
    assert.equal(parsed?.parsed ?? true, true);
    assert.deepEqual(scanned && { calls: scanned.calls.map((c) => c.path), lines: scanned.lines },
      parsed && { calls: parsed.calls.map((c) => c.path), lines: parsed.lines }, `javascript line at ${offset}: ${JSON.stringify(js.slice(offset, js.indexOf('\n', offset)))}`);
  }
  for (const offset of lines(lua)) {
    const parsed = readStatement(lua, 'lua', offset);
    const scanned = readStatement(`${lua})`, 'lua', offset);
    assert.equal(scanned?.parsed ?? false, false);
    assert.deepEqual(scanned && { calls: scanned.calls.map((c) => c.path), lines: scanned.lines },
      parsed && { calls: parsed.calls.map((c) => c.path), lines: parsed.lines }, `lua line at ${offset}: ${JSON.stringify(lua.slice(offset, lua.indexOf('\n', offset)))}`);
  }
});

test('Lua\'s method calls are read, and self:set is said to pass self as the path', () => {
  const lua = 'local up = name:upper()\nself:set("Background.Fill.colour", "red")\nself.set("Background.Fill.colour", "red")\n';
  assert.deepEqual(read(lua, 'lua', 'name:').calls, [], 'a string method is not the API, and holds nothing');
  const colon = callOf(read(lua, 'lua', 'self:'), 'set');
  assert.equal(colon.self, true);
  assert.equal(colon.problem?.severity, 'error');
  assert.match(colon.problem.message, /^self:set passes self itself as the first argument.*Write self\.set\(…\)\.$/);
  const dot = callOf(read(lua, 'lua', 'self.'), 'set');
  assert.equal(dot.problem, null);
});

test('chained and nested calls: each API call has its rows, a call inside another indented under it', () => {
  const lua = 'set("Lbl.Background.Fill.colour", ce.math.lighten("red", 0.2))';
  const st = read(lua, 'lua', 'set(');
  assert.deepEqual(st.calls.map((c) => c.path), ['set']);
  const outer = st.calls[0];
  assert.equal(argOf(outer, 'value').kind, 'computed');
  assert.deepEqual(argOf(outer, 'value').meaning, { expression: 'ce.math.lighten("red", 0.2)', expects: 'colour' });
  assert.deepEqual(outer.children.map((c) => c.path), ['ce.math.lighten']);
  const lighten = outer.children[0];
  assert.deepEqual([argOf(lighten, 'colour').kind, argOf(lighten, 'colour').meaning.reader], ['colour', 'math']);
  assert.deepEqual([argOf(lighten, 'amount').kind, argOf(lighten, 'amount').meaning.unit], ['number', '0 to 1']);
  // A call made on another call's answer, and calls inside a call that is not the API: hoisted.
  const js = 'const names = ce.panel.find({ type: "Knob" }).map((n) => n.toUpperCase());\nprint(ce.math.darken("#123456"));';
  assert.deepEqual(read(js, 'javascript', 'ce.panel').calls.map((c) => c.path), ['ce.panel.find']);
  assert.deepEqual(read(js, 'javascript', 'print').calls.map((c) => c.path), ['ce.math.darken']);
  // A call that is not the API is kept for a colour it is given.
  const own = read('myPaint("#FF0000")', 'lua', 'myPaint');
  assert.deepEqual([own.calls[0].memberId, own.calls[0].path, own.calls[0].args[0].kind], [null, 'myPaint', 'colour']);
});

test('Python: decorators, indentation, one-line blocks, keyword arguments, dict(…)', () => {
  const py = '@decorate(ce.math.lighten("red"))\ndef on_value_changed(e):\n    if e.value > 0.5: set("Lbl.Background.Fill.colour", "#FF0000")\n\n    ce.music.scale("C3", scale="harmonicMinor")\n    set("Lbl.Background", dict(colour="red"))\n';
  assert.deepEqual(read(py, 'python', '@dec').calls.map((c) => c.path), ['ce.math.lighten']);
  assert.deepEqual(read(py, 'python', 'def ').calls, []);
  const oneLine = read(py, 'python', 'if e');
  assert.deepEqual(oneLine.calls.map((c) => c.path), ['set']);
  assert.equal(textOf(py, oneLine), 'if e.value > 0.5: set("Lbl.Background.Fill.colour", "#FF0000")');
  assert.equal(readStatement(py, 'python', at(py, '\n\n', 1)), null);
  const scale = callOf(read(py, 'python', 'ce.music'), 'ce.music.scale');
  assert.deepEqual(scale.args.map((a) => [a.name, a.kind]), [['root', 'note'], ['scale', 'scale']]);
  assert.deepEqual(argOf(scale, 'scale').meaning.notes, ['C', 'D', 'E♭', 'F', 'G', 'A♭', 'B']);
  const dict = callOf(read(py, 'python', 'dict('), 'set');
  assert.deepEqual(dict.children, [], 'dict(…) is the argument\'s table, not a call of its own');
  const colour = optOf(argOf(dict, 'value'), 'colour');
  assert.deepEqual([colour.kind, colour.meaning.stored], ['colour', '#FF0000']);
});

test('the parameters a call leaves out are listed, and Python\'s keyword arguments count', () => {
  assert.deepEqual(callOf(read('ce.anim.to("cutoff")', 'lua', 'ce.anim')).missing.map((p) => p.name), ['target']);
  assert.deepEqual(callOf(read('ce.anim.to("cutoff", target=1)', 'python', 'ce.anim')).missing, []);
  assert.deepEqual(callOf(read('sendNote(1)', 'lua', 'send')).missing.map((p) => p.name), ['note', 'velocity']);
  // The helpers carry no params: they are read off the signature, brackets and all.
  const scale = callOf(read('scale(0.5)', 'lua', 'scale'));
  assert.deepEqual(scale.missing.map((p) => p.name), ['inLo', 'inHi', 'outLo', 'outHi']);
  assert.deepEqual(callOf(read('ce.math.random()', 'lua', 'ce.math')).missing, []);
});

/* =================================================================================== the kinds */
// One call per kind, written in Lua, JavaScript (and so TypeScript) and Python, each checked for the
// kind its argument is read as, what it means, and the edit the sidebar may offer.

const KIND_CASES = [
  // [lua, javascript, python, member path, argument (or "opts.key"), kind, editable, check(meaning, arg)]
  ['set("Cutoff.Background.Fill.colour", "FF5B9BD5")', null, null, 'set', 'value', 'colour', 'colour',
    (m) => assert.deepEqual([m.reader, m.stored, m.css, m.claimedBy], ['property', 'FF5B9BD5', '#5B9BD5', 'path'])],
  ['ce.draw.fill("FF5B9BD5")', null, null, 'ce.draw.fill', 'colour', 'colour', 'colour',
    (m) => assert.deepEqual([m.reader, m.css, m.alpha], ['drawing', '#5B9BD5', 1])],
  ['ce.math.lighten("red", 0.2)', null, null, 'ce.math.lighten', 'colour', 'colour', 'colour',
    (m) => assert.deepEqual([m.reader, m.stored], ['math', '#FF0000'])],
  ['ce.draw.gradient({ "#2A6BD4", "#0A1830" })', 'ce.draw.gradient(["#2A6BD4", "#0A1830"])', 'ce.draw.gradient(["#2A6BD4", "#0A1830"])',
    'ce.draw.gradient', 'stops', 'gradient', 'gradient',
    (m, a) => { assert.deepEqual(m.stops.map((s) => [s.at, s.css]), [[0, '#2A6BD4'], [1, '#0A1830']]); assert.equal(m.defaultAngle, 180); assert.equal(m.angle, null); assert.equal(a.options.length, 2); }],
  ['ce.anim.to("cutoff", 1, { curve = "outBack" })', 'ce.anim.to("cutoff", 1, { curve: "outBack" })', 'ce.anim.to("cutoff", 1, {"curve": "outBack"})',
    'ce.anim.to', 'opts.curve', 'curve', 'curve',
    (m) => { assert.equal(m.name, 'outBack'); assert.deepEqual(m.bezier, [0.175, 0.885, 0.32, 1.275]); assert.ok(m.choices.includes('spring')); }],
  ['ce.anim.to("cutoff", 1, { curve = { 0.2, 0.9, 0.3, 1.4 } })', 'ce.anim.to("cutoff", 1, { curve: [0.2, 0.9, 0.3, 1.4] })', 'ce.anim.to("cutoff", 1, {"curve": [0.2, 0.9, 0.3, 1.4]})',
    'ce.anim.to', 'opts.curve', 'curve', 'curve', (m) => assert.deepEqual([m.name, m.bezier], [null, [0.2, 0.9, 0.3, 1.4]])],
  ['ce.anim.envelope("cutoff", { {x=0,y=0}, {x=0.25,y=1}, {x=1,y=0} })', 'ce.anim.envelope("cutoff", [{x:0,y:0},{x:0.25,y:1},[1,0]])',
    'ce.anim.envelope("cutoff", [{"x": 0, "y": 0}, {"x": 0.25, "y": 1}, (1, 0)])', 'ce.anim.envelope', 'points', 'envelope', 'envelope',
    (m) => assert.deepEqual([m.points.map((p) => [p.x, p.y]), m.count, m.complete, m.sorted, m.low, m.high], [[[0, 0], [0.25, 1], [1, 0]], 3, true, true, 0, 1])],
  ['ce.time.step(0, "1/8t")', null, null, 'ce.time.step', 'division', 'division', 'choice',
    (m) => assert.deepEqual([m.id, m.label, m.beats], ['1/8T', '8th T', 1 / 3])],
  ['ce.music.scale("C3", "harmonicMinor")', null, null, 'ce.music.scale', 'scale', 'scale', 'choice',
    (m) => { assert.deepEqual(m.notes, ['C', 'D', 'E♭', 'F', 'G', 'A♭', 'B']); assert.deepEqual(m.numbers, [48, 50, 51, 53, 55, 56, 59]); }],
  ['ce.music.chord("C4", "maj7")', null, null, 'ce.music.chord', 'type', 'chord', 'choice',
    (m) => assert.deepEqual(m.notes, ['C', 'E', 'G', 'B'])],
  ['ce.draw.blend("multiply")', null, null, 'ce.draw.blend', 'mode', 'enum', 'choice', (m) => assert.equal(m.choices.length, 12)],
  ['ce.draw.stroke("#FFF", 1, { dash = { 3, 3 }, cap = "round" })', 'ce.draw.stroke("#FFF", 1, { dash: [3, 3], cap: "round" })', 'ce.draw.stroke("#FFF", 1, {"dash": [3, 3], "cap": "round"})',
    'ce.draw.stroke', 'opts.dash', 'dash', null,
    (m) => assert.deepEqual([m.dasharray, m.lengths, m.odd, m.drawn, m.skipped, m.cap], ['3 3', [3, 3], false, 3, 3, 'round'])],
  ['ce.anim.to("cutoff", 1, { duration = 250 })', 'ce.anim.to("cutoff", 1, { duration: 250 })', 'ce.anim.to("cutoff", 1, {"duration": 250})',
    'ce.anim.to', 'opts.duration', 'number', 'number', (m) => assert.deepEqual([m.unit, m.min, m.hint], ['milliseconds', 0, '250 ms is half a beat at 120 BPM'])],
  ['ce.draw.arc(30, 30, 24, -135, 135)', null, null, 'ce.draw.arc', 'from', 'number', 'number',
    (m) => assert.deepEqual([m.unit, m.hint], ['degrees', "0 is twelve o'clock, increasing clockwise"])],
  ['ce.anim.play("Cutoff", "Pulse")', null, null, 'ce.anim.play', 'control', 'control', 'choice',
    (m) => assert.deepEqual([m.name, m.type, m.found], ['Cutoff', 'Knob', true])],
  ['ce.anim.play("Cutoff", "Pulse")', null, null, 'ce.anim.play', 'animation', 'animation', 'choice',
    (m) => assert.deepEqual([m.found, m.choices], [true, ['Pulse']])],
  ['ce.panel.keep("Cutoff.value")', null, null, 'ce.panel.keep', 'path', 'path', null,
    (m) => assert.deepEqual([m.control, m.type, m.found, m.value], ['Cutoff', 'Knob', true, 0.42])],
  ['ce.midi.sendNote(1, "C4", 100)', null, null, 'ce.midi.sendNote', 'note', 'note', null,
    (m) => assert.deepEqual([m.number, m.name, m.hint], [60, 'C4', 'middle C'])],
  ['on("Cutoff", "valueChanged", f)', null, null, 'on', 'event', 'event', 'choice',
    (m) => assert.deepEqual([m.handler, m.found], ['onValueChanged', true])],
  ['ce.text.style("Title", { family = "Inter Tight" })', 'ce.text.style("Title", { family: "Inter Tight" })', 'ce.text.style("Title", {"family": "Inter Tight"})',
    'ce.text.style', 'opts.family', 'font', 'font', (m) => assert.deepEqual([m.family, m.found], ['Inter Tight', true])],
  ['ce.image.asset("knob-cap")', null, null, 'ce.image.asset', 'idOrName', 'image', 'image',
    (m) => assert.deepEqual([m.name, m.dataUrl, m.found], ['knob-cap', false, true])],
  ['ce.midi.sendSysex("F0 41 10 42 F7")', null, null, 'ce.midi.sendSysex', 'bytes', 'bytes', null,
    (m) => assert.deepEqual([m.count, m.hex, m.sent], [5, 'F0 41 10 42 F7', 'F0 41 10 42 F7'])],
  ['ce.midi.sendSysex({ 0x41, 0x10 })', 'ce.midi.sendSysex([0x41, 0x10])', 'ce.midi.sendSysex([0x41, 0x10])', 'ce.midi.sendSysex', 'bytes', 'bytes', null,
    (m) => assert.deepEqual([m.count, m.sent], [2, 'F0 41 10 F7'])],
  ['log("F0411000")', null, null, 'log', 'message', 'text', null, (m) => assert.deepEqual(m, {})],
  ['ce.draw.fill(base)', null, null, 'ce.draw.fill', 'colour', 'computed', null,
    (m) => assert.deepEqual(m, { expression: 'base', expects: 'colour' })],
];

const CONTEXT = () => ({ panel: demoPanel(), fonts: ['Inter Tight', { family: 'Fira Code' }], images: [{ id: 'a1', name: 'knob-cap' }] });

for (const lang of ['lua', 'javascript', 'typescript', 'python']) {
  test(`every kind is read in ${lang}`, () => {
    const context = CONTEXT();
    for (const [lua, js, py, pathOf, name, kind, editable, check] of KIND_CASES) {
      const src = lang === 'lua' ? lua : lang === 'python' ? (py ?? js ?? lua) : (js ?? lua);
      const call = callOf(readStatement(src, lang, 1, context), pathOf);
      const [argName, key] = name.split('.');
      let a = argOf(call, argName);
      if (key) a = optOf(a, key);
      assert.equal(a.kind, kind, `${lang} ${src}: kind`);
      assert.equal(a.editable, editable, `${lang} ${src}: editable`);
      assert.equal(a.problem, null, `${lang} ${src}: ${a.problem?.message}`);
      check(a.meaning, a);
    }
  });
}

test('C++, C# and Java read the core commands through ctx', () => {
  const context = CONTEXT();
  const cpp = 'void onValueChanged(CeContext& ctx, const CeEvent& event) {\n    ctx.set("Cutoff.Background.Fill.colour", "#FF0000");\n    ctx.sendCC(1, 74, 64);\n    ctx.log("x");\n}\n';
  const cs = 'public void OnValueChanged(CeContext ctx, CeEvent e) {\n    ctx.SetValue("Cutoff.Background.Fill.colour", "#FF0000");\n    ctx.SendCC(1, 74, 64);\n    ctx.Log("x");\n}\n';
  const java = 'public void onValueChanged(CeContext ctx, CeEvent e) {\n    ctx.setValue("Cutoff.Background.Fill.colour", "#FF0000");\n    ctx.sendCC(1, 74, 64);\n    ctx.log("x");\n}\n';
  for (const [lang, src, setName, ccName] of [['cpp', cpp, 'ctx.set', 'ctx.sendCC'], ['csharp', cs, 'ctx.SetValue', 'ctx.SendCC'], ['java', java, 'ctx.setValue', 'ctx.sendCC']]) {
    const set = callOf(read(src, lang, setName, context), 'set');
    assert.equal(argOf(set, 'path').meaning.type, 'Knob', lang);
    assert.deepEqual([argOf(set, 'value').kind, argOf(set, 'value').meaning.reader, argOf(set, 'value').meaning.css], ['colour', 'property', '#FF0000'], lang);
    const cc = callOf(read(src, lang, ccName, context), 'ce.midi.sendCC');
    assert.deepEqual(cc.args.map((a) => [a.name, a.kind, a.meaning.min, a.meaning.max]),
      [['channel', 'number', 1, 16], ['cc', 'number', 0, 127], ['value', 'number', 0, 127]], lang);
    assert.equal(callOf(read(src, lang, 'og("x")', context)).memberId, 'log', lang);
  }
  // Java's typed reads are get.
  const getDouble = callOf(read('double v = ctx.getDouble("Cutoff");', 'java', 'ctx', context), 'get');
  assert.deepEqual([argOf(getDouble, 'path').kind, argOf(getDouble, 'path').meaning.value], ['path', 0.42]);
});

test('record example 14: a control, a path and an animation are checked against the panel when there is one', () => {
  const context = CONTEXT();
  const src = 'ce.panel.keep("Cuttoff.Background.Fill.colour")\nce.anim.play("Cutoff", "Pluse")\nce.anim.play("Cutoff", "Hover")\nset("Cutoff.Backgrund.Fill.colour", 1)\nce.text.style("Titel", {})';
  const keep = argOf(callOf(read(src, 'lua', 'keep', context)), 'path');
  assert.deepEqual([keep.meaning.found, keep.problem.severity], [false, 'warning']);
  assert.equal(keep.problem.message, 'No control named "Cuttoff" on this panel. Did you mean "Cutoff"?');
  const pluse = argOf(callOf(read(src, 'lua', 'Pluse', context)), 'animation');
  assert.equal(pluse.problem.message, 'ce.anim.play: "Cutoff" has no animation called "Pluse". Its keyframe animations: Pulse. Did you mean "Pulse"?');
  const hover = argOf(callOf(read(src, 'lua', 'Hover', context)), 'animation');
  assert.equal(hover.problem.message, 'ce.anim.play: "Hover" is a transition, which plays when its trigger does. Its keyframe animations: Pulse.');
  const path = argOf(callOf(read(src, 'lua', 'Backgrund', context)), 'path');
  assert.match(path.problem.message, /^"Backgrund\.Fill\.colour" leads nowhere on Cutoff \(Knob\): it has no "Backgrund"\. Did you mean "Background"\?$/);
  const titel = argOf(callOf(read(src, 'lua', 'Titel', context)), 'target');
  assert.equal(titel.problem.message, 'No control named "Titel" on this panel. Did you mean "Title"?');
  assert.deepEqual(titel.meaning.choices, ['Cutoff', 'Title']);
  // A control found on the panel is given with its type and its value now, for its row.
  const cutoff = argOf(callOf(read(src, 'lua', 'play("Cutoff", "Pluse"', context)), 'control');
  assert.deepEqual([cutoff.meaning.found, cutoff.meaning.type, cutoff.meaning.value], [true, 'Knob', 0.42]);
  // Without a panel nothing is said: the context cannot tell.
  assert.equal(argOf(callOf(read(src, 'lua', 'keep')), 'path').problem, null);
  assert.equal(argOf(callOf(read(src, 'lua', 'Pluse')), 'animation').problem, null);
});

test('self.set reads its path on the control the script is attached to', () => {
  const panel = demoPanel();
  const knob = panel.controls[0];
  for (const context of [{ panel, selfControl: knob }, { panel, selfControl: 'Cutoff' }]) {
    const set = callOf(read('self.set("Background.Fill.colour", "redd")', 'lua', 'self', context), 'set');
    assert.deepEqual([argOf(set, 'path').meaning.control, argOf(set, 'path').meaning.found], ['Cutoff', true]);
    assert.equal(argOf(set, 'value').problem.message,
      'set("Cutoff.Background.Fill.colour"): "redd" is not a colour the panel can read, so nothing was set. '
      + 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS colour name, rgb() or hsl().');
  }
});

test('a component verb\'s value is typed by its spec: the divisions, the scales, a range, a colour', () => {
  const src = 'ce.components.arp.division("Arp", "1/8T")\nce.components.arp.scale("Arp", "dorian")\nce.components.arp.gate("Arp", 1.5)\nce.components.drumpads.colour("Kit", 3, "redd")';
  const division = argOf(callOf(read(src, 'lua', 'division')), 'division');
  assert.deepEqual([division.kind, division.editable, division.meaning.label], ['division', 'choice', '8th T']);
  assert.equal(argOf(callOf(read(src, 'lua', 'scale(')), 'scale').kind, 'scale');
  const gate = argOf(callOf(read(src, 'lua', 'gate')), 'gate');
  // Past its range the verb uses the nearest end, and says so in the console's words: it is not refused.
  assert.deepEqual([gate.kind, gate.meaning.min, gate.meaning.max, gate.problem?.severity], ['number', 0, 1, 'warning']);
  assert.equal(gate.problem.message, 'arp Arp: gate(1.5) — the gate 1.5 is outside 0 to 1, so 1 was used.');
  const colour = argOf(callOf(read(src, 'lua', 'drumpads')), 'colour');
  assert.deepEqual([colour.kind, colour.problem?.severity], ['colour', 'error']);
});

/* ================================================================================ option keys */

test('an options table\'s keys are typed by the fields the contract lists', () => {
  const lua = 'ce.anim.to("cutoff", 127, { duration = 500, ["repeat"] = 3, pingpong = true, done = function() end })';
  const opts = argOf(callOf(read(lua, 'lua', 'ce.anim')), 'opts');
  assert.deepEqual(opts.options.map((o) => [o.name, o.kind, o.param?.name]),
    [['duration', 'number', 'duration'], ['repeat', 'unknown', 'repeat'], ['pingpong', 'unknown', 'pingpong'], ['done', 'computed', 'done']]);
  const rep = optOf(opts, 'repeat');
  assert.equal(lua.slice(rep.keyRange.start, rep.keyRange.end), '["repeat"]');
  assert.equal(lua.slice(rep.range.start, rep.range.end), '3');
  assert.ok(opts.options.every((o) => o.problem === null));
  // An option that lists fields of its own is read a level down.
  const nrpn = optOf(argOf(callOf(read('ce.device.defineParameter("p", { nrpn = { msb = 1, lsb = 2 } })', 'lua', 'ce.')), 'spec'), 'nrpn');
  assert.deepEqual(nrpn.options.map((o) => o.name), ['msb', 'lsb']);
});

test('an unknown key is refused in the runtime\'s words, with the key it most likely meant', () => {
  const ANIM_TO = 'duration, beats, sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done';
  const cases = [
    ['ce.anim.to("x", 1, { easing = "outBack" })', 'lua', 'easing',
      `ce.anim.to: "easing" is not one of its options, so nothing was done. Its options are: ${ANIM_TO}.`],
    ['ce.anim.to("x", 1, { curv: "s" })', 'javascript', 'curv',
      `ce.anim.to: "curv" is not one of its options, so nothing was done. Its options are: ${ANIM_TO}. Did you mean "curve"?`],
    ['ce.draw.transform({"rotation": 45})', 'python', 'rotation',
      'ce.draw.transform: "rotation" is not one of its options, so nothing was done. Its options are: rotate, cx, cy, x, y, scale. Did you mean "rotate"?'],
    ['ce.time.syncTimer("t", 1, { folow = false })', 'lua', 'folow',
      'ce.time.syncTimer: "folow" is not one of its options, so nothing was done. Its only option is follow. Did you mean "follow"?'],
    ['ce.panel.create("Knob", { name = "k", behavior = { min = 0 } })', 'lua', 'behavior',
      'ce.panel.create: "behavior" is not one of its options, so nothing was done. Its options are: name, x, y, width, height, parent, and the name of any section, such as Behavior. Did you mean "Behavior"?'],
  ];
  for (const [src, lang, key, message] of cases) {
    const st = read(src, lang, 'ce.');
    const opts = callOf(st).args.find((a) => a.kind === 'options');
    const row = optOf(opts, key);
    assert.deepEqual(row.problem, { severity: 'error', message }, src);
    assert.equal(row.param, null);
  }
  const nested = optOf(optOf(argOf(callOf(read('ce.device.defineParameter("p", { nrpn = { mbs = 1, lsb = 2 } })', 'lua', 'ce.')), 'spec'), 'nrpn'), 'mbs');
  assert.equal(nested.problem.message,
    'ce.device.defineParameter: "nrpn.mbs" is not one of its options, so nothing was done. The options of nrpn are: msb, lsb. Did you mean "msb"?');
  // ce.image.set reads its keys in any case, as the runtime does.
  const image = argOf(callOf(read('ce.image.set("Logo", src, { Opacity = 50 })', 'lua', 'ce.')), 'opts');
  assert.deepEqual([optOf(image, 'Opacity').param?.name, optOf(image, 'Opacity').problem], ['opacity', null]);
  // A table the contract lists no fields for is not checked; its colour-named keys are still read.
  const define = argOf(callOf(read('ce.panel.define("k", "States", "Held", { anything = 1, colour = "red" })', 'lua', 'ce.')), 'spec');
  assert.deepEqual(define.options.map((o) => [o.name, o.kind, o.problem]), [['colour', 'colour', null]]);
});

test('ce.panel.create\'s sections, a patch map and a table written whole are typed by the templates', () => {
  const panel = demoPanel();
  const create = read('ce.panel.create("Meter", { name = "m", Meter = { trackColour = "redd", orientation = "arc" } })', 'lua', 'ce.');
  const meter = optOf(argOf(callOf(create), 'props'), 'Meter');
  assert.deepEqual(meter.meaning, { section: 'Meter' });
  const track = optOf(meter, 'trackColour');
  assert.deepEqual([track.kind, track.meaning.claimedBy, track.problem.message],
    ['colour', 'path', 'ce.panel.create("Meter"): at "Meter.trackColour", "redd" is not a colour the panel can read, so nothing was created. A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS colour name, rgb() or hsl().']);
  const notTable = optOf(argOf(callOf(read('ce.panel.clone("Cutoff", { Behavior = 5 })', 'lua', 'ce.', { panel })), 'props'), 'Behavior');
  assert.equal(notTable.problem.message, 'ce.panel.clone("Cutoff"): "Behavior" takes a table of its settings, not 5, so nothing was copied.');
  const patch = read('ce.panel.patch("Cutoff", "Hover", { ["Background.Fill.colour"] = "redd", ["Transform.x"] = 4 })', 'lua', 'ce.', { panel });
  const rows = argOf(callOf(patch), 'patch').options;
  assert.deepEqual(rows.map((r) => [r.name, r.kind]), [['Background.Fill.colour', 'colour'], ['Transform.x', 'unknown']]);
  assert.match(rows[0].problem.message, /^ce\.panel\.patch\("Cutoff", "Hover"\): at "Background\.Fill\.colour", "redd" is not a colour the panel can read, so nothing was patched\. /);
  // set() of a section written whole, and of the panel's own colours.
  const whole = argOf(callOf(read('set("Cutoff.Background.Fill", { colour = "red", mode = "solid" })', 'lua', 'set', { panel })), 'value');
  assert.deepEqual(whole.options.map((r) => [r.name, r.kind]), [['colour', 'colour'], ['mode', 'text']]);
  const bg = argOf(callOf(read('set("panel.bgColour", "#000")', 'lua', 'set', { panel })), 'value');
  assert.deepEqual([bg.kind, bg.meaning.stored, bg.meaning.claimedBy], ['colour', '#000000', 'path']);
  const stop = argOf(callOf(read('set("panel.bgGradient.stops.0.color", "80FF0000")', 'lua', 'set', { panel })), 'value');
  assert.deepEqual([stop.meaning.reader, stop.problem?.severity], ['stop', 'error']);
  assert.match(stop.problem.message, /a gradient stop has none/);
});

/* ======================================================================== the runtime's words */
// Each reader's refusal is said here in the words the WebView runtime writes to the console when the
// script runs. The runtime is called, and the line it writes compared (a row may add "Did you mean").

test('a refusal is said in the words the runtime says it in', () => {
  const knob = createControl('Knob', { name: 'X' });
  knob._children.Animations = { _type: 'Animations', _children: { Pulse: { name: 'Pulse', kind: 'keyframes' } } };
  const cases = [
    // [script (Lua), needle, how to find the row, the runtime call]
    ['ce.midi.sendSysex("F0411000")', 'ce.', (c) => argOf(c, 'bytes'), (api) => api.ce.midi.sendSysex('F0411000')],
    // ce.time's numbers, which the helpers read as the transport does and say once (timeWords.js);
    // each helper and argument once here, for that reason.
    ['ce.time.position(-1)', 'ce.', (c) => argOf(c, 'beats'), (api) => api.ce.time.position(-1)],
    ['ce.time.position(4, 0)', 'ce.', (c) => argOf(c, 'beatsPerBar'), (api) => api.ce.time.position(4, 0)],
    ['ce.time.step("x", "1/16")', 'ce.', (c) => argOf(c, 'beats'), (api) => api.ce.time.step('x', '1/16')],
    ['ce.time.steps(0, 4, "1/4", 0.4)', 'ce.', (c) => argOf(c, 'max'), (api) => api.ce.time.steps(0, 4, '1/4', 0.4)],
    ['ce.time.swing(1, 2, "1/16")', 'ce.', (c) => argOf(c, 'amount'), (api) => api.ce.time.swing(1, 2, '1/16')],
    ['ce.time.cycle(4, 100)', 'ce.', (c) => argOf(c, 'bars'), (api) => api.ce.time.cycle(4, 100)],
    ['ce.time.looped(8, 0, 0)', 'ce.', (c) => argOf(c, 'lengthBeats'), (api) => api.ce.time.looped(8, 0, 0)],
    ['ce.time.beatsToMs(2, -5)', 'ce.', (c) => argOf(c, 'bpm'), (api) => api.ce.time.beatsToMs(2, -5)],
    ['ce.time.msToBeats("soon")', 'ce.', (c) => argOf(c, 'ms'), (api) => api.ce.time.msToBeats('soon')],
    // MIDI numbers the runtime already refused in its words, now typed so their rows read them.
    ['ce.midi.sendNRPN(1, 200, 0, 5)', 'ce.', (c) => argOf(c, 'msb'), (api) => api.ce.midi.sendNRPN(1, 200, 0, 5)],
    ['ce.midi.sendRPN(1, 0, 300, 5)', 'ce.', (c) => argOf(c, 'lsb'), (api) => api.ce.midi.sendRPN(1, 0, 300, 5)],
    ['ce.midi.panic({ channel = 20 })', 'ce.', (c) => optOf(argOf(c, 'opts'), 'channel'), (api) => api.ce.midi.panic({ channel: 20 })],
    // defineParameter's spec, refused on the field the definition names.
    ['ce.device.defineParameter("p", { cc = 74, channel = 20 })', 'ce.', (c) => optOf(argOf(c, 'spec'), 'channel'),
      (api) => api.ce.device.defineParameter('p', { cc: 74, channel: 20 })],
    ['ce.device.defineParameter("q", { nrpn = { msb = 200, lsb = 0 } })', 'ce.', (c) => optOf(optOf(argOf(c, 'spec'), 'nrpn'), 'msb'),
      (api) => api.ce.device.defineParameter('q', { nrpn: { msb: 200, lsb: 0 } })],
    ['ce.midi.sendSysex({ 0xF0, 300 })', 'ce.', (c) => argOf(c, 'bytes'), (api) => api.ce.midi.sendSysex([0xF0, 300])],
    ['ce.midi.sendNote(1, "c4", 100)', 'ce.', (c) => argOf(c, 'note'), (api) => api.ce.midi.sendNote(1, 'c4', 100)],
    ['ce.midi.sendNote(1, "C10", 100)', 'ce.', (c) => argOf(c, 'note'), (api) => api.ce.midi.sendNote(1, 'C10', 100)],
    ['ce.midi.sendCC(1, 200, 64)', 'ce.', (c) => argOf(c, 'cc'), (api) => api.ce.midi.sendCC(1, 200, 64)],
    ['ce.midi.sendCC(17, 74, 64)', 'ce.', (c) => argOf(c, 'channel'), (api) => api.ce.midi.sendCC(17, 74, 64)],
    // A note name where the channel goes: sendNote's channel comes first.
    ['ce.midi.sendNote("C4", 100, 1)', 'ce.', (c) => argOf(c, 'channel'), (api) => api.ce.midi.sendNote('C4', 100, 1)],
    ['ce.midi.sendCC(1, "Cutoff", 64)', 'ce.', (c) => argOf(c, 'cc'), (api) => api.ce.midi.sendCC(1, 'Cutoff', 64)],
    ['ce.music.scale("c4")', 'ce.', (c) => argOf(c, 'root'), (api) => api.ce.music.scale('c4')],
    ['ce.music.scale("C3", "harmonicMinr")', 'ce.', (c) => argOf(c, 'scale'), (api) => api.ce.music.scale('C3', 'harmonicMinr')],
    ['ce.music.chord("C3", "maj8")', 'ce.', (c) => argOf(c, 'type'), (api) => api.ce.music.chord('C3', 'maj8')],
    ['ce.time.step(0, "1/6")', 'ce.', (c) => argOf(c, 'division'), (api) => api.ce.time.step(0, '1/6')],
    ['ce.time.syncTimer("t", "1/6")', 'ce.', (c) => argOf(c, 'beats'), (api) => api.ce.time.syncTimer('t', '1/6')],
    ['ce.time.afterBeats("1/6", f)', 'ce.', (c) => argOf(c, 'beats'), (api) => api.ce.time.afterBeats('1/6', () => {})],
    ['ce.draw.blend("multipy")', 'ce.', (c) => argOf(c, 'mode'), (api) => api.ce.draw.blend('multipy')],
    ['ce.draw.fill("redd")', 'ce.', (c) => argOf(c, 'colour'), (api) => api.ce.draw.fill('redd')],
    ['ce.draw.stroke(5)', 'ce.', (c) => argOf(c, 'colour'), (api) => api.ce.draw.stroke(5)],
    ['ce.draw.opacity(50)', 'ce.', (c) => argOf(c, 'a'), (api) => api.ce.draw.opacity(50)],
    ['ce.draw.image("knob-cap", 0, 0, 32, 32)', 'ce.', (c) => argOf(c, 'src'), (api) => api.ce.draw.image('knob-cap', 0, 0, 32, 32)],
    ['ce.draw.gradient({ "#2A6BD4", "redd" })', 'ce.', (c) => argOf(c, 'stops'), (api) => api.ce.draw.gradient(['#2A6BD4', 'redd'])],
    ['ce.draw.gradient({ "#2A6BD4", { at = 50, colour = "#000000" } })', 'ce.', (c) => argOf(c, 'stops'), (api) => api.ce.draw.gradient(['#2A6BD4', { at: 50, colour: '#000000' }])],
    ['ce.draw.gradient({ "#2A6BD4" })', 'ce.', (c) => argOf(c, 'stops'), (api) => api.ce.draw.gradient(['#2A6BD4'])],
    ['ce.math.lighten("redd")', 'ce.', (c) => argOf(c, 'colour'), (api) => api.ce.math.lighten('redd')],
    ['ce.math.lighten("red", 40)', 'ce.', (c) => argOf(c, 'amount'), (api) => api.ce.math.lighten('red', 40)],
    ['ce.math.alpha("red", 2)', 'ce.', (c) => argOf(c, 'a'), (api) => api.ce.math.alpha('red', 2)],
    ['set("X.Background.Fill.colour", "redd")', 'set', (c) => argOf(c, 'value'), (api) => api.set('X.Background.Fill.colour', 'redd')],
    ['set("X.Background.Fill.colour", "#0008")', 'set', (c) => argOf(c, 'value'), (api) => api.set('X.Background.Fill.colour', '#0008')],
    ['ce.anim.play("X", "Pluse")', 'ce.', (c) => argOf(c, 'animation'), (api) => api.ce.anim.play('X', 'Pluse')],
    ['ce.anim.to("X", 1, { easing = "outBack" })', 'ce.', (c) => optOf(argOf(c, 'opts'), 'easing'), (api) => api.ce.anim.to('X', 1, { easing: 'outBack' })],
    // The time arguments, as panelRuntime's timeRefused and noteLength say them.
    ['ce.time.after(-5, f)', 'ce.', (c) => argOf(c, 'ms'), (api) => api.ce.time.after(-5, () => {})],
    ['ce.time.after("250", f)', 'ce.', (c) => argOf(c, 'ms'), (api) => api.ce.time.after('250', () => {})],
    ['ce.time.startTimer("t", 0)', 'ce.', (c) => argOf(c, 'ms'), (api) => api.ce.time.startTimer('t', 0)],
    ['ce.time.syncTimer("t", -1)', 'ce.', (c) => argOf(c, 'beats'), (api) => api.ce.time.syncTimer('t', -1)],
    ['ce.time.afterBeats(-0.5, f)', 'ce.', (c) => argOf(c, 'beats'), (api) => api.ce.time.afterBeats(-0.5, () => {})],
    ['ce.midi.sendNote(1, 60, 100, -5)', 'ce.', (c) => argOf(c, 'ms'), (api) => api.ce.midi.sendNote(1, 60, 100, -5)],
    ['ce.midi.sendNote(1, 60, 100, "long")', 'ce.', (c) => argOf(c, 'ms'), (api) => api.ce.midi.sendNote(1, 60, 100, 'long')],
    // A colour written with its alpha in a stated place.
    ['ce.math.fromARGB("nope")', 'ce.', (c) => argOf(c, 'colour'), (api) => api.ce.math.fromARGB('nope')],
    ['ce.math.fromRGBA("#12345")', 'ce.', (c) => argOf(c, 'colour'), (api) => api.ce.math.fromRGBA('#12345')],
    ['ce.math.fromRGBA(5)', 'ce.', (c) => argOf(c, 'colour'), (api) => api.ce.math.fromRGBA(5)],
    // ce.anim moves numbers: a target that is not one, and a colour property as the path.
    ['ce.anim.to("X.value", "Tomato")', 'ce.', (c) => argOf(c, 'target'), (api) => api.ce.anim.to('X.value', 'Tomato')],
    ['ce.anim.spring("X.value", true)', 'ce.', (c) => argOf(c, 'target'), (api) => api.ce.anim.spring('X.value', true)],
    ['ce.anim.to("X.Background.Fill.colour", 1)', 'ce.', (c) => argOf(c, 'path'), (api) => api.ce.anim.to('X.Background.Fill.colour', 1)],
    ['ce.anim.to("panel.bgColour", 1)', 'ce.', (c) => argOf(c, 'path'), (api) => api.ce.anim.to('panel.bgColour', 1)],
    ['ce.anim.envelope("X.Background.Fill.colour", { { x = 0, y = 0 }, { x = 1, y = 1 } })', 'ce.', (c) => argOf(c, 'path'),
      (api) => api.ce.anim.envelope('X.Background.Fill.colour', [{ x: 0, y: 0 }, { x: 1, y: 1 }])],
  ];
  for (const [src, needle, rowOf, run] of cases) {
    const st = readStatement(src, 'lua', at(src, needle, 1), { panel: { controls: [knob] } });
    const row = rowOf(callOf(st));
    const lines = withPanel([knob], (api) => runtimeLines(() => run(api)));
    assert.ok(row.problem, `${src}: no problem read, the runtime said ${JSON.stringify(lines)}`);
    assert.ok(lines.length, `${src}: the runtime said nothing`);
    const said = lines[0].replace(/ This is said only the first time\.$/, '');
    assert.ok(row.problem.message.startsWith(said), `${src}:\n  read:    ${row.problem.message}\n  runtime: ${said}`);
  }
});

test('ce.time\'s numbers say nothing when the helper uses them as written, and convert at the call\'s own tempo', () => {
  const rowsOf = (src) => callOf(readStatement(src, 'lua', 3, { tempo: 120 })).args;
  for (const src of ['ce.time.position("8")', 'ce.time.position(9, 3)', 'ce.time.step(2.5, "1/8")', 'ce.time.cycle(0, 2)',
    'ce.time.looped(10, 4, 8)', 'ce.time.beatsToMs(2, 90)', 'ce.time.msToBeats(500)', 'ce.time.swing(3, 0.5, "1/16")']) {
    assert.deepEqual(rowsOf(src).filter((a) => a.problem).map((a) => a.problem.message), [], src);
  }
  assert.equal(argOf(callOf(readStatement('ce.time.msToBeats(250, 60)', 'lua', 3, { tempo: 120 })), 'ms').meaning.hint,
    '250 ms is a quarter of a beat at 60 BPM');
  assert.equal(argOf(callOf(readStatement('ce.time.msToBeats(250)', 'lua', 3, { tempo: 120 })), 'ms').meaning.hint,
    '250 ms is half a beat at 120 BPM', 'no bpm given: the transport\'s');
  // A beat position before the start is a warning, not a range error: the helper reads it as 0.
  assert.equal(argOf(callOf(readStatement('ce.time.position(-2)', 'lua', 3, {})), 'beats').problem.severity, 'warning');
});

test('a dash is read as ce.draw.stroke reads it: the line its row draws is the runtime\'s, and what it says is in its words', () => {
  const panel = { id: 'p', name: 'P', width: 400, height: 200, scripting: { modules: ['ce.draw'] },
    controls: [createControl('Background', { name: 'screen' })] };
  /** What the runtime draws for `dash`, and what it writes to the console. */
  const drawn = (dash) => {
    resetScriptStateForTesting();
    setRuntimeHost({ panel });
    try {
      const api = scriptApiForTesting('screen', 'values-probe');
      clearScriptTrace();
      clearAllDrawings();
      api.ce.draw.stroke('#FFF', 1, { dash });
      api.ce.draw.line(0, 0, 10, 10);
      return { dash: drawCommandsFor('screen')[0]?.dash, said: get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error') };
    } finally { clearAllDrawings(); setRuntimeHost(null); }
  };
  const cases = [
    // [the dash in Lua, the same as the runtime is given it]
    ['{ 3, 3 }', [3, 3]], ['{ 3, -3 }', [3, -3]], ['{ "x", 3 }', ['x', 3]], ['{ 3, true }', [3, true]], ['{ "4", 2.5 }', ['4', 2.5]],
    ['3', 3], ['"3 3"', '3 3'], ['{ 3, 2, 1 }', [3, 2, 1]], ['{}', []], ['{ 0, 0 }', [0, 0]], ['{ 0, 4 }', [0, 4]],
  ];
  for (const [lua, dash] of cases) {
    const src = `ce.draw.stroke("#FFF", 1, { dash = ${lua} })`;
    const row = optOf(argOf(callOf(readStatement(src, 'lua', 3, {})), 'opts'), 'dash');
    const runtime = drawn(dash);
    assert.equal(row.kind, 'dash', src);
    assert.equal(row.meaning.dasharray, runtime.dash ?? null, `${src}: the row's line is drawn with what the overlay is handed`);
    assert.equal(runtime.said.length, row.problem ? 1 : 0, `${src}: ${JSON.stringify(runtime.said.map((t) => t.message))}`);
    if (!row.problem) continue;
    assert.equal(runtime.said[0].message, `${row.problem.message} This is said only the first time.`, src);
    assert.equal(runtime.said[0].kind, row.problem.severity === 'error' ? 'error' : 'warn', src);
  }
  resetScriptStateForTesting();
});

test('a cap or a join is read as ce.draw.stroke reads it, and what it says is in its words, once', () => {
  const panel = { id: 'p', name: 'P', width: 400, height: 200, scripting: { modules: ['ce.draw'] },
    controls: [createControl('Background', { name: 'screen' })] };
  /** What the runtime hands the overlay for `opts`, and what it writes to the console, drawn twice. */
  const drawn = (opts) => {
    resetScriptStateForTesting();
    setRuntimeHost({ panel });
    try {
      const api = scriptApiForTesting('screen', 'values-probe');
      clearScriptTrace();
      clearAllDrawings();
      for (let frame = 0; frame < 2; frame += 1) { api.ce.draw.stroke('#FFF', 1, opts); api.ce.draw.line(0, 0, 10, 10); }
      const command = drawCommandsFor('screen')[0];
      return { cap: command?.cap ?? null, join: command?.join ?? null, said: get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error') };
    } finally { clearAllDrawings(); setRuntimeHost(null); }
  };
  const cases = [
    // [the option in Lua, the option as the runtime is given it, what the overlay is handed]
    ['cap = "round"', { cap: 'round' }, 'round'], ['cap = "square"', { cap: 'square' }, 'square'],
    ['cap = "sausage"', { cap: 'sausage' }, null], ['cap = "Round"', { cap: 'Round' }, 'round'],
    ['cap = 5', { cap: 5 }, null], ['cap = true', { cap: true }, null], ['cap = false', { cap: false }, null],
    ['join = "bevel"', { join: 'bevel' }, 'bevel'], ['join = "mitre"', { join: 'mitre' }, null],
    ['join = " ROUND "', { join: ' ROUND ' }, 'round'], ['join = "Rund"', { join: 'Rund' }, null],
  ];
  for (const [lua, opts, handed] of cases) {
    const name = Object.keys(opts)[0];
    const src = `ce.draw.stroke("#FFF", 1, { ${lua} })`;
    const row = optOf(argOf(callOf(readStatement(src, 'lua', 3, {})), 'opts'), name);
    const runtime = drawn(opts);
    assert.equal(runtime[name], handed, `${src}: the overlay is handed ${runtime[name]}`);
    assert.equal(runtime.said.length, handed === null && opts[name] !== false ? 1 : 0,
      `${src}: said once over two frames, or not at all: ${JSON.stringify(runtime.said.map((t) => t.message))}`);
    assert.equal(Boolean(row.problem), runtime.said.length === 1, `${src}: the row says something exactly when the runtime does`);
    if (!row.problem) continue;
    const said = runtime.said[0].message.replace(/ This is said only the first time\.$/, '');
    assert.ok(runtime.said[0].message.endsWith(' This is said only the first time.'), src);
    assert.ok(row.problem.message.startsWith(said), `${src}:\n  read:    ${row.problem.message}\n  runtime: ${said}`);
    // A warning, not an error: the default is drawn. An error means the call did nothing.
    assert.equal(runtime.said[0].kind, 'warn', src);
    assert.equal(row.problem.severity, 'warning', src);
  }
  assert.equal(optOf(argOf(callOf(readStatement('ce.draw.stroke("#FFF", 1, { join = "Rund" })', 'lua', 3, {})), 'opts'), 'join').problem.message,
    'ce.draw.stroke: the join is "Rund", not "miter", "round" or "bevel", so "miter" is drawn. Did you mean "round"?');
  // ce.draw.blend reads its word in any case too, and its row refuses only what the call refuses.
  assert.equal(argOf(callOf(readStatement('ce.draw.blend("Multiply")', 'lua', 3, {})), 'mode').problem, null);
  const blend = argOf(callOf(readStatement('ce.draw.blend("Multiplied")', 'lua', 3, {})), 'mode');
  resetScriptStateForTesting();
  setRuntimeHost({ panel });
  try {
    clearScriptTrace();
    const api = scriptApiForTesting('screen', 'values-probe');
    assert.equal(api.ce.draw.blend('Multiply'), true, 'a capital letter is still the word');
    assert.equal(api.ce.draw.blend('Multiplied'), false);
    const [line] = get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message);
    assert.ok(blend.problem.message.startsWith(line), `read: ${blend.problem.message}\nruntime: ${line}`);
  } finally { setRuntimeHost(null); resetScriptStateForTesting(); }
});

test('ce.anim\'s duration, delay and beats are said in the words the move says them in, once', () => {
  const knob = createControl('Knob', { name: 'X' });
  const optionOf = (src, name) => optOf(argOf(callOf(readStatement(src, 'lua', 3, { panel: { controls: [knob] } })), 'opts'), name);
  const cases = [
    // [option written in Lua, the option, the runtime call]
    ['duration = -5', 'duration', (api) => api.ce.anim.to('X.value', 1, { duration: -5 })],
    ['duration = "1/4"', 'duration', (api) => api.ce.anim.to('X.value', 1, { duration: '1/4' })],
    ['duration = "long"', 'duration', (api) => api.ce.anim.to('X.value', 1, { duration: 'long' })],
    ['delay = "soon"', 'delay', (api) => api.ce.anim.to('X.value', 1, { delay: 'soon' })],
    ['delay = -100', 'delay', (api) => api.ce.anim.to('X.value', 1, { delay: -100 })],
    ['beats = "1/4"', 'beats', (api) => api.ce.anim.to('X.value', 1, { beats: '1/4' })],
    ['beats = 0', 'beats', (api) => api.ce.anim.to('X.value', 1, { beats: 0 })],
    // A stagger is read only for a list of paths: it spaces their starts.
    ['stagger = "lots"', 'stagger', (api) => api.ce.anim.to(['X.value'], 1, { stagger: 'lots' })],
    ['damping = "soft"', 'damping', (api) => api.ce.anim.to('X.value', 1, { damping: 'soft' })],
    ['frequency = true', 'frequency', (api) => api.ce.anim.to('X.value', 1, { frequency: true })],
  ];
  for (const [opt, name, run] of cases) {
    const row = optionOf(`ce.anim.to("X.value", 1, { ${opt} })`, name);
    resetScriptStateForTesting();
    const lines = withPanel([knob], (api) => runtimeLines(() => run(api)));
    assert.equal(lines.length, 1, `${opt}: the runtime says it once, ${JSON.stringify(lines)}`);
    assert.equal(row.problem?.severity, 'warning', opt);
    assert.equal(lines[0], `${row.problem.message} This is said only the first time.`, opt);
  }
  // spring's default is its own, and it is said once per command: a second time is quiet.
  assert.match(optionOf('ce.anim.spring("X.value", 1, { duration = "long" })', 'duration').problem.message, /takes 600 ms, as it does when no duration is given\.$/);
  resetScriptStateForTesting();
  const twice = withPanel([knob], (api) => runtimeLines(() => { api.ce.anim.to('X.value', 1, { duration: -5 }); api.ce.anim.to('X.value', 1, { duration: -9 }); }));
  assert.equal(twice.length, 1);
  for (const ok of ['duration = 0', 'duration = 250', 'duration = "250"', 'delay = 0', 'beats = 2', 'beats = "0.5"',
    'stagger = -50', 'stagger = "40"', 'damping = 3', 'frequency = -2']) {
    const [field] = ok.split(' ');
    assert.equal(optionOf(`ce.anim.to("X.value", 1, { ${ok} })`, field).problem, null, ok);
    resetScriptStateForTesting();
    assert.deepEqual(withPanel([knob], (api) => runtimeLines(() => api.ce.anim.to('X.value', 1, { [field]: JSON.parse(ok.split(' = ')[1]) }))), [], ok);
  }
  resetScriptStateForTesting();
});

test('a time the runtime takes is not reported: 0 delays, text sendNote reads, a message kept up', () => {
  const problems = (src) => callOf(readStatement(src, 'lua', 3, {})).args.flatMap((a) => [a.problem, ...(a.options ?? []).map((o) => o.problem)]).filter(Boolean);
  for (const src of ['ce.time.after(0, f)', 'ce.time.startTimer("t", 16)', 'ce.time.syncTimer("t", 0.25)', 'ce.time.afterBeats(0, f)',
    'ce.midi.sendNote(1, 60, 100, "500")', 'ce.midi.sendNote(1, 60, 100)', 'ce.ui.notify("Saved", { duration = -1 })', 'ce.ui.notify("Saved", { duration = 0 })']) {
    assert.deepEqual(problems(src), [], src);
  }
});

test('a ce.<module>.<name> the module does not have is said on its call, with the one meant', () => {
  const callIn = (src, lang) => readStatement(src, lang, 3, {}).calls[0];
  const on = callIn('ce.panel.on("Cutoff", "valueChanged", function() end)', 'lua');
  assert.deepEqual([on.memberId, on.path, on.problem.severity], [null, 'ce.panel.on', 'error']);
  assert.equal(on.problem.message, 'ce.panel.on is not a call ce.panel has, so the script stops with an error here when it runs. Did you mean ce.core.on?');
  assert.equal(on.args.length, 3, 'its values are still listed');
  assert.match(callIn('ce.midi.send_note(1, 60, 100)', 'python').problem.message, /Did you mean ce\.midi\.sendNote\?$/);
  assert.equal(callIn('ce.core.set("A", 1)', 'lua').problem, null);
  assert.deepEqual(readStatement('foo.bar(1)', 'lua', 2, {})?.calls ?? [], [], 'a call of the script\'s own is none of this');
});

test('every member the WebView runtime has under a module is in the contract\'s map, so none is named unknown', () => {
  const api = withPanel([], (a) => a);
  const extra = [];
  for (const module of allModules().filter((m) => /^ce\.\w+$/.test(m.id))) {
    const own = api.ce?.[module.id.slice(3)];
    if (!own) continue;
    const map = memberMapFor(module.id);
    for (const key of Object.keys(own)) if (!Object.hasOwn(map, key)) extra.push(`${module.id}.${key}`);
  }
  assert.deepEqual(extra, []);
});

test('a font and an image name carry their lists, and ce.draw.image, which takes the picture, says so', () => {
  const ctx = { fonts: ['Arial', 'Georgia'], images: [{ id: 'i1', name: 'knob-cap' }, { id: 'i2', name: 'fader-cap' }] };
  const firstOf = (src) => everyArg(readStatement(src, 'lua', 3, ctx)).find((a) => a.kind === 'font' || a.kind === 'image');
  const font = firstOf('ce.text.style("Title", { family = "Arial" })');
  assert.deepEqual([font.editable, font.meaning.choices, font.meaning.found], ['font', ['Arial', 'Georgia'], true]);
  const named = firstOf('ce.image.set("Title", "knob-cap")');
  assert.deepEqual([named.editable, named.meaning.choices, named.meaning.wantsData], ['image', ['knob-cap', 'fader-cap'], false]);
  const drawn = firstOf('ce.draw.image("knob-cap", 0, 0, 8, 8)');
  assert.equal(drawn.meaning.wantsData, true, 'the Values tab offers no names for it');
});

test('ce.anim takes text that is a number as its target, and a number property as its path', () => {
  const knob = createControl('Knob', { name: 'X' });
  for (const src of ['ce.anim.to("X.value", "50")', 'ce.anim.to("X.value", 0.5)', 'ce.anim.spring("X.Transform.x", 40)', 'ce.anim.to("Nowhere.colour", 1)']) {
    const call = callOf(readStatement(src, 'lua', 3, { panel: { controls: [knob] } }));
    // (A path to no control is still said to lead nowhere; ce.anim itself refuses none of these.)
    assert.deepEqual(call.args.slice(0, 2).map((a) => /ce\.anim/.test(a.problem?.message ?? '')), [false, false], src);
  }
});

test('a curve the runtime does not know is said in its words, and the move runs straight', () => {
  const knob = createControl('Knob', { name: 'X' });
  for (const [src, run] of [
    ['ce.anim.to("X", 1, { curve = "outBak" })', (api) => api.ce.anim.to('X', 1, { curve: 'outBak' })],
    ['ce.anim.to("X", 1, { curve = { 2, 0, 1, 1 } })', (api) => api.ce.anim.to('X', 1, { curve: [2, 0, 1, 1] })],
  ]) {
    const row = optOf(argOf(callOf(read(src, 'lua', 'ce.')), 'opts'), 'curve');
    // The runtime says a curve once per command (warnAnimTiming), so each case starts afresh, and
    // its "said only the first time" is the runtime's alone.
    resetScriptStateForTesting();
    const lines = withPanel([knob], (api) => runtimeLines(() => run(api), ['log', 'warn', 'error']));
    const line = String(lines[0] ?? '').replace(/ This is said only the first time\.$/, '');
    assert.equal(row.problem.severity, 'warning');
    assert.ok(line && row.problem.message.startsWith(line), `${src}:\n  read:    ${row.problem.message}\n  runtime: ${lines[0]}`);
  }
});

test('an envelope\'s points are refused in the words the runtime says them in, too few in its note', () => {
  const knob = createControl('Knob', { name: 'X' });
  const cases = [
    // [the points in Lua, as the runtime is given them]
    ['{ {x=0,y=0}, {x=50,y=1} }', [{ x: 0, y: 0 }, { x: 50, y: 1 }]],
    ['{ {x=0,y=0}, {x="50",y=1} }', [{ x: 0, y: 0 }, { x: '50', y: 1 }]],
    ['{ {0,0}, {1.5,0} }', [[0, 0], [1.5, 0]]],
    ['{ {x=-0.25,y=0}, {x=1,y=1} }', [{ x: -0.25, y: 0 }, { x: 1, y: 1 }]],
    ['{ {x=0,y=0}, 0.5 }', [{ x: 0, y: 0 }, 0.5]],
    ['{ {x=0,y=0}, "up" }', [{ x: 0, y: 0 }, 'up']],
    ['{ {x=0,y=0}, {x=1,y="high"} }', [{ x: 0, y: 0 }, { x: 1, y: 'high' }]],
    ['{ {x=0,y=0}, {x=1} }', [{ x: 0, y: 0 }, { x: 1 }]],
    ['{ {x=0,y=0}, {y=1} }', [{ x: 0, y: 0 }, { y: 1 }]],
    ['{ {0,0}, {1,true} }', [[0, 0], [1, true]]],
    ['{ {x=0,y=0} }', [{ x: 0, y: 0 }]],
    ['{}', []],
  ];
  for (const [lua, given] of cases) {
    const src = `ce.anim.envelope("X.value", ${lua})`;
    const row = argOf(callOf(read(src, 'lua', 'ce.', { panel: { controls: [knob] } })), 'points');
    resetScriptStateForTesting();
    const lines = withPanel([knob], (api) => runtimeLines(() => api.ce.anim.envelope('X.value', given), ['log', 'warn', 'error']));
    assert.equal(lines.length, 1, `${src}: the runtime says one thing, ${JSON.stringify(lines)}`);
    assert.deepEqual([row.kind, row.problem?.severity, row.problem?.message, row.editable], ['envelope', 'error', lines[0], null], src);
  }
  const fifty = argOf(callOf(read('ce.anim.envelope("X.value", { {x=0,y=0}, {x=50,y=1} })', 'lua', 'ce.')), 'points');
  assert.equal(fifty.problem.message, 'ce.anim.envelope: the x of point 2 of 2 is a number from 0 to 1, and 50 is not, so nothing was started. If you meant 50 out of 100, write 0.5.');
  resetScriptStateForTesting();
});

test('an envelope the runtime plays is drawn and edited: text that is a number, levels past 0 to 1, any order', () => {
  const knob = createControl('Knob', { name: 'X' });
  const cases = [
    // [the points in Lua, as the runtime is given them, what the reading says]
    ['{ {x="0",y="0.5"}, {x=" 1 ",y=1} }', [{ x: '0', y: '0.5' }, { x: ' 1 ', y: 1 }], { low: 0.5, high: 1, sorted: true }],
    ['{ {x=0,y=-0.5}, {x=1,y=1.5} }', [{ x: 0, y: -0.5 }, { x: 1, y: 1.5 }], { low: -0.5, high: 1.5, sorted: true }],
    ['{ {x=1,y=0}, {x=0,y=1} }', [{ x: 1, y: 0 }, { x: 0, y: 1 }], { low: 0, high: 1, sorted: false }],
    ['{ {0,0}, {0,1}, {1,0} }', [[0, 0], [0, 1], [1, 0]], { low: 0, high: 1, sorted: true }],
    // Lua's table with numbered items and a key, as wasmoon hands it over.
    ['{ {0,0}, {0.5,1,curve="exp"}, {1,0} }', [[0, 0], { 1: 0.5, 2: 1, curve: 'exp' }, [1, 0]], { low: 0, high: 1, sorted: true }],
  ];
  for (const [lua, given, want] of cases) {
    const src = `ce.anim.envelope("X.value", ${lua})`;
    const row = argOf(callOf(read(src, 'lua', 'ce.', { panel: { controls: [knob] } })), 'points');
    resetScriptStateForTesting();
    let started;
    const lines = withPanel([knob], (api) => runtimeLines(() => { started = api.ce.anim.envelope('X.value', given); }, ['log', 'warn', 'error']));
    assert.deepEqual([started, lines], [true, []], src);
    assert.deepEqual([row.problem, row.editable, row.meaning.complete], [null, 'envelope', true], src);
    assert.deepEqual({ low: row.meaning.low, high: row.meaning.high, sorted: row.meaning.sorted }, want, src);
  }
  resetScriptStateForTesting();
  const computed = argOf(callOf(read('ce.anim.envelope("X.value", { {x=0,y=0}, {x=0.5,y=peak} })', 'lua', 'ce.')), 'points');
  assert.deepEqual([computed.kind, computed.editable, computed.meaning.expects], ['computed', null, 'envelope'], 'a point worked out when it runs: no editor');
});

test('an envelope\'s points are written in the form they were written in, and only what moved changes', () => {
  /** `src` with its points' writeValue given what `edit` makes of the points as read. */
  const write = (src, lang, edit) => {
    const arg = argOf(callOf(readStatement(src, lang, 3, {})), 'points');
    const points = arg.meaning.points.map((p) => ({ x: p.x, y: p.y, from: p.index }));
    const e = writeValue(src, lang, arg, edit(points, arg));
    return e === null ? null : apply(src, e);
  };
  const move = (at, x, y) => (points) => points.map((p, i) => (i === at ? { ...p, x, y } : p));
  // A drag: one point's x and y, in each language's spelling.
  assert.equal(write('ce.anim.envelope("c", { {x=0,y=0}, {x=0.1,y=1}, {x=1,y=0} })', 'lua', move(1, 0.25, 0.875)),
    'ce.anim.envelope("c", { {x=0,y=0}, {x=0.25,y=0.875}, {x=1,y=0} })');
  assert.equal(write('ce.anim.envelope("c", [{ x: 0, y: 0 }, { x: 0.1, y: 1 }, { x: 1, y: 0 }]);', 'javascript', move(1, 0.25, 0.875)),
    'ce.anim.envelope("c", [{ x: 0, y: 0 }, { x: 0.25, y: 0.875 }, { x: 1, y: 0 }]);');
  assert.equal(write('ce.anim.envelope("c", [[0, 0], [0.1, 1], [1, 0]]);', 'typescript', move(1, 0.25, 0.875)),
    'ce.anim.envelope("c", [[0, 0], [0.25, 0.875], [1, 0]]);');
  assert.equal(write('ce.anim.envelope("c", [{"x": 0, "y": 0}, (0.1, 1), {\'x\': 1, \'y\': 0}])', 'python', move(2, 0.75, 0.5)),
    'ce.anim.envelope("c", [{"x": 0, "y": 0}, (0.1, 1), {\'x\': 0.75, \'y\': 0.5}])');
  // A number keeps its decimals where it can, text that is a number stays text, a key stays where it
  // was written, and a point's curve and the comments around it stay.
  assert.equal(write('ce.anim.envelope("c", { {x=0,y=0}, {y=1.00, x=0.10} })', 'lua', move(1, 0.5, 0.25)),
    'ce.anim.envelope("c", { {x=0,y=0}, {y=0.25, x=0.50} })');
  assert.equal(write('ce.anim.envelope("c", { {x="0",y="0"}, {x="1",y="1"} })', 'lua', move(1, 1, 0.5)),
    'ce.anim.envelope("c", { {x="0",y="0"}, {x="1",y="0.5"} })');
  const multi = 'ce.anim.envelope("c", {\n  { 0, 0 },\n  { 0.5, 1, curve = "exp" }, -- the peak\n  { 1, 0 },\n})';
  assert.equal(write(multi, 'lua', move(1, 0.4, 0.9)),
    'ce.anim.envelope("c", {\n  { 0, 0 },\n  { 0.4, 0.9, curve = "exp" }, -- the peak\n  { 1, 0 },\n})');
  // A point added is a copy of the one after it, in its own line; one taken out goes with its line,
  // and the last taken out leaves the comment on the line before it.
  assert.equal(write(multi, 'lua', (points) => [points[0], { x: 0.25, y: 0.5 }, ...points.slice(1)]),
    'ce.anim.envelope("c", {\n  { 0, 0 },\n  { 0.25, 0.5, curve = "exp" },\n  { 0.5, 1, curve = "exp" }, -- the peak\n  { 1, 0 },\n})');
  assert.equal(write(multi, 'lua', (points) => [...points, { x: 1, y: 1 }]),
    'ce.anim.envelope("c", {\n  { 0, 0 },\n  { 0.5, 1, curve = "exp" }, -- the peak\n  { 1, 0 },\n  { 1, 1 },\n})');
  assert.equal(write(multi, 'lua', (points) => [points[0], points[2]]),
    'ce.anim.envelope("c", {\n  { 0, 0 },\n  { 1, 0 },\n})');
  assert.equal(write(multi, 'lua', (points) => points.slice(0, 2)),
    'ce.anim.envelope("c", {\n  { 0, 0 },\n  { 0.5, 1, curve = "exp" }, -- the peak\n})');
  assert.equal(write('ce.anim.envelope("c", [\n  [0, 0],\n  [0.5, 1], // the peak\n  [1, 0]\n]);', 'javascript', (points) => points.slice(0, 2)),
    'ce.anim.envelope("c", [\n  [0, 0],\n  [0.5, 1] // the peak\n]);', 'no comma after the last point where the list had none');
  assert.equal(write('ce.anim.envelope("c", [{x:0,y:0}, {x:1,y:0}]);', 'javascript', (points) => [points[0], { x: 0.5, y: 1 }, points[1]]),
    'ce.anim.envelope("c", [{x:0,y:0}, {x:0.5,y:1}, {x:1,y:0}]);');
  // The points as written give the text back; a point that is not a number is not written.
  for (const [src, lang] of [[multi, 'lua'], ['ce.anim.envelope("c", [{"x": "0", "y": 0}, (1, 1)])', 'python']]) {
    assert.equal(write(src, lang, (points) => points), src);
    assert.equal(write(src, lang, (_p, arg) => arg.value), src);
  }
  assert.equal(write(multi, 'lua', move(1, Number.NaN, 0.5)), null);
});

test('the two image opacity scales warn in the runtime\'s words', () => {
  const set = optOf(argOf(callOf(read('ce.image.set("Logo", data, { opacity = 0.5 })', 'lua', 'ce.')), 'opts'), 'opacity');
  const { warnings } = planImage(imageLayer('image'), 'data:image/png;base64,AA', { opacity: 0.5 });
  assert.deepEqual(set.problem, { severity: 'warning', message: `ce.image.set("Logo"): ${warnings[0]}` });
  const icon = optOf(argOf(callOf(read('ce.image.icon("Badge", "star", { opacity = 50 })', 'lua', 'ce.')), 'opts'), 'opacity');
  assert.deepEqual(icon.problem, { severity: 'warning', message: 'ce.image.icon("Badge"): opacity runs from 0 to 1 here, so 50 is fully solid. If you meant 50 out of 100, write 0.5.' });
  assert.equal(optOf(argOf(callOf(read('ce.image.icon("Badge", "star", { opacity = 0.5 })', 'lua', 'ce.')), 'opts'), 'opacity').problem, null);
  assert.equal(optOf(argOf(callOf(read('ce.image.set("Logo", data, { opacity = 50 })', 'lua', 'ce.')), 'opts'), 'opacity').problem, null);
});

/* ============================================================================ the record's examples */

test('record example 1: one hex string, two readers', () => {
  const src = 'function onDraw(info)\n  ce.draw.clear()\n  ce.draw.fill("#5B9BD580")\n  ce.draw.rect(0, 0, info.width, info.height)\nend\n\nce.core.set("Cutoff.Background.Fill.colour", "#5B9BD580")\n';
  const drawing = argOf(callOf(read(src, 'lua', 'fill')), 'colour');
  assert.deepEqual([drawing.meaning.reader, drawing.meaning.swatch.rgb, Math.round(drawing.meaning.alpha * 255)], ['drawing', '5B9BD5', 0x80]);
  assert.equal(drawing.meaning.css, 'rgba(91, 155, 213, 0.502)');
  assert.equal(drawing.problem, null, 'CSS reads the last pair as alpha, as it says it does');
  const property = argOf(callOf(read(src, 'lua', 'ce.core')), 'value');
  assert.deepEqual([property.meaning.reader, property.meaning.swatch.rgb, Math.round(property.meaning.alpha * 255)], ['property', '9BD580', 0x5B]);
  assert.equal(property.problem.severity, 'warning');
  assert.equal(property.problem.message, 'The panel reads "#5B9BD580" as AARRGGBB: the colour 9BD580 at alpha 5B. A drawing would read it as 5B9BD5 at alpha 80; for that colour here, write "805B9BD5". '
    + 'ce.math.fromARGB() and ce.math.fromRGBA() say which order is meant.');
  // Line 3 is written back as #RRGGBBAA, line 7 as AARRGGBB: the one edit that changes the form.
  assert.equal(writeValue(src, 'lua', drawing, '405B9BD5').text, '"#5B9BD540"');
  assert.equal(writeValue(src, 'lua', property, '805B9BD5').text, '"805B9BD5"');
});

test('record example 2: the same characters, three meanings', () => {
  const src = 'ce.midi.sendSysex("F0411000")\nce.core.set("Pad1.Background.Fill.colour", "F0411000")\nce.core.log("F0411000")\n';
  const bytes = argOf(callOf(read(src, 'lua', 'sendSysex')), 'bytes');
  assert.deepEqual([bytes.kind, bytes.problem.message],
    ['bytes', 'sendSysex: "F0411000" is not one byte, so nothing was sent. Put a space between the bytes: "F0 41 10 00".']);
  const colour = argOf(callOf(read(src, 'lua', 'set(')), 'value');
  assert.deepEqual([colour.kind, colour.meaning.swatch.rgb, Math.round(colour.meaning.alpha * 100)], ['colour', '411000', 94]);
  assert.equal(argOf(callOf(read(src, 'lua', 'log(')), 'message').kind, 'text');
});

test('record example 4: a gradient with no angle opens at 180 and is rebuilt in the script\'s syntax', () => {
  const lua = 'ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }))';
  const stops = argOf(callOf(read(lua, 'lua', 'gradient'), 'ce.draw.gradient'), 'stops');
  assert.deepEqual([stops.meaning.angle, stops.meaning.defaultAngle, stops.editable], [null, 180, 'gradient']);
  const next = { angle: 135, stops: [{ at: 0, colour: '2A6BD4' }, { at: 0.3, colour: '5B9BD5' }, { at: 1, colour: '0A1830' }] };
  assert.equal(apply(lua, writeValue(lua, 'lua', stops, next)),
    'ce.draw.fill(ce.draw.gradient({\n  { at = 0, colour = "#2A6BD4" }, { at = 0.3, colour = "#5B9BD5" }, { at = 1, colour = "#0A1830" },\n}, 135))');
  const js = 'ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"]));';
  const jsStops = argOf(callOf(read(js, 'javascript', 'gradient'), 'ce.draw.gradient'), 'stops');
  assert.equal(apply(js, writeValue(js, 'javascript', jsStops, next)),
    'ce.draw.fill(ce.draw.gradient([\n  { at: 0, colour: "#2A6BD4" }, { at: 0.3, colour: "#5B9BD5" }, { at: 1, colour: "#0A1830" },\n], 135));');
  // The Gradient tab's own object, positions out of 100, is taken as it is.
  const tab = { type: 'linear', angle: 135, stops: [{ color: '2A6BD4', position: 0 }, { color: '5B9BD5', position: 30 }, { color: '0A1830', position: 100 }] };
  assert.deepEqual(writeValue(js, 'javascript', jsStops, tab), writeValue(js, 'javascript', jsStops, next));
  // Evenly spaced again, they are bare colours; a stop's opacity is kept, so they are not.
  const back = writeValue(js, 'javascript', jsStops, { stops: [{ at: 0, colour: '000000' }, { at: 0.5, colour: '808080' }, { at: 1, colour: 'FFFFFF' }] });
  assert.equal(back.text, '["#000000", "#808080", "#FFFFFF"]');
  const withOpacity = 'ce.draw.gradient({ { at = 0, colour = "#2A6BD4", opacity = 0.5 }, { at = 1, colour = "#0A1830" } }, 90)';
  const op = argOf(callOf(read(withOpacity, 'lua', 'ce.')), 'stops');
  const kept = writeValue(withOpacity, 'lua', op, { angle: 90, stops: [{ at: 0, colour: 'FF0000' }, { at: 1, colour: '0A1830' }] });
  assert.equal(apply(withOpacity, kept), 'ce.draw.gradient({ { at = 0, colour = "#FF0000", opacity = 0.5 }, { at = 1, colour = "#0A1830" } }, 90)');
  // Nothing changed: the text exactly.
  const same = writeValue(withOpacity, 'lua', op, { angle: 90, stops: [{ at: 0, colour: '2A6BD4' }, { at: 1, colour: '0A1830' }] });
  assert.equal(apply(withOpacity, same), withOpacity);
});

test('record example 5: a computed value gets no editor, and the literal it comes from does', () => {
  const src = 'local base = "#2A6BD4"\nce.draw.fill(ce.draw.gradient({ base, ce.math.darken(base) }, 180))\n';
  const loose = read(src, 'lua', 'local');
  assert.deepEqual(loose.calls, []);
  assert.deepEqual(loose.values.map((v) => [v.name, v.kind, v.editable, v.meaning.swatch.rgb]), [['base', 'colour', 'colour', '2A6BD4']]);
  const stops = argOf(callOf(read(src, 'lua', 'ce.draw'), 'ce.draw.gradient'), 'stops');
  assert.deepEqual([stops.kind, stops.literal, stops.editable, stops.meaning.complete], ['gradient', false, null, false]);
  assert.deepEqual(stops.options.map((o) => o.kind), ['computed', 'computed']);
});

test('record example 6: an easing curve, and a duration in milliseconds', () => {
  const lua = 'ce.anim.to("cutoff", 127, { duration = 500, curve = "outBack" })';
  const opts = argOf(callOf(read(lua, 'lua', 'ce.')), 'opts');
  assert.deepEqual(optOf(opts, 'curve').meaning.bezier, [0.175, 0.885, 0.32, 1.275]);
  assert.equal(optOf(opts, 'duration').meaning.hint, '500 ms is 1 beat at 120 BPM');
  assert.equal(optOf(argOf(callOf(read(lua, 'lua', 'ce.', { tempo: 60 })), 'opts'), 'duration').meaning.hint, '500 ms is half a beat at 60 BPM');
  // Dragging a handle writes four numbers, in each language's list; a name comes back as a name.
  const curve = optOf(opts, 'curve');
  assert.equal(writeValue(lua, 'lua', curve, [0.2, 0.9, 0.3, 1.4]).text, '{ 0.2, 0.9, 0.3, 1.4 }');
  const js = 'ce.anim.to("cutoff", 127, { duration: 500, curve: "outBack" })';
  assert.equal(writeValue(js, 'javascript', optOf(argOf(callOf(read(js, 'javascript', 'ce.')), 'opts'), 'curve'), [0.2, 0.9, 0.3, 1.4]).text, '[0.2, 0.9, 0.3, 1.4]');
  const drawn = 'ce.anim.to("cutoff", 127, { curve = { 0.2, 0.9, 0.3, 1.4 } })';
  assert.equal(writeValue(drawn, 'lua', optOf(argOf(callOf(read(drawn, 'lua', 'ce.')), 'opts'), 'curve'), 'outBack').text, '"outBack"');
  const typo = optOf(argOf(callOf(read('ce.anim.to("cutoff", 127, { curve = "outBak" })', 'lua', 'ce.')), 'opts'), 'curve');
  assert.match(typo.problem.message, /^ce\.anim\.to: "outBak" is not a curve this build knows — animating linear\..* Did you mean "outBack"\?$/);
});

test('record example 7: note names, what was the silent C-1', () => {
  const src = 'ce.midi.sendNote(1, "c4", 100, 250)\nlocal triad = ce.music.chord("C4", "major")\nce.midi.sendNote(1, 48, 100)';
  assert.equal(argOf(callOf(read(src, 'lua', 'sendNote(1, "c4"')), 'note').problem.message,
    'sendNote: "c4" is not a note name, so nothing was sent. A name is a capital letter, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".');
  const c4 = argOf(callOf(read(src, 'lua', 'ce.music')), 'root');
  assert.deepEqual([c4.meaning.number, c4.meaning.hint, c4.editable], [60, 'middle C', null]);
  assert.deepEqual(argOf(callOf(read(src, 'lua', 'sendNote(1, 48')), 'note').meaning, { number: 48, name: 'C3' });
  assert.deepEqual(argOf(callOf(read(src, 'lua', 'ce.music')), 'type').meaning.notes, ['C', 'E', 'G']);
});

test('record example 8: divisions and scales', () => {
  const src = 'local step = ce.time.step(beats, "1/6")\nlocal notes = ce.music.scale("C3", "harmonicMinr")\nlocal ok = ce.time.step(beats, "1/8t")';
  assert.match(argOf(callOf(read(src, 'lua', 'step(beats, "1/6"')), 'division').problem.message,
    /^ce\.time\.step: "1\/6" is not a division, so there is no answer\. The divisions are 1\/1, 1\/2, .*1\/16T\.$/);
  const scale = argOf(callOf(read(src, 'lua', 'ce.music')), 'scale');
  assert.match(scale.problem.message, /^ce\.music\.scale: "harmonicMinr" is not a scale, so there is no answer\. .* Did you mean "harmonicMinor"\?$/);
  const ok = argOf(callOf(read(src, 'lua', '"1/8t"')), 'division');
  assert.deepEqual([ok.problem, ok.meaning.label], [null, '8th T']);
});

test('record examples 9 to 13: a fixed list, a font, an image, two opacity scales, arc degrees', () => {
  const ctx = { fonts: ['Inter Tight'], images: [{ id: 'knob-cap-id', name: 'knob-cap' }] };
  const src = 'ce.draw.blend("multipy")\nce.text.style("Title", { family = "Inter Tigt", size = 18 })\nce.draw.image("knob-cap", 0, 0, 32, 32)\nlocal cap = ce.image.asset("knob-cap")\nce.image.asset("knob-cop")\nce.draw.arc(cx, cy, 40, -135, 135)\n';
  assert.match(argOf(callOf(read(src, 'lua', 'blend')), 'mode').problem.message, /^ce\.draw\.blend\("multipy"\): not a blend mode\. One of: normal, multiply, .* Did you mean "multiply"\?$/);
  const style = argOf(callOf(read(src, 'lua', 'style', ctx)), 'opts');
  assert.deepEqual(optOf(style, 'family').problem, { severity: 'warning', message: '"Inter Tigt" is not an available font. ce.text.style will refuse it. Did you mean "Inter Tight"?' });
  assert.deepEqual([optOf(style, 'size').meaning.unit, optOf(style, 'size').editable], ['pixels', 'number']);
  assert.equal(argOf(callOf(read(src, 'lua', 'ce.draw.image', ctx)), 'src').problem.message,
    'ce.draw.image: "knob-cap" is an icon\'s name, not its image, so nothing was drawn. Pass ce.image.asset("knob-cap").dataUrl.');
  assert.deepEqual(argOf(callOf(read(src, 'lua', 'local cap', ctx)), 'idOrName').meaning.found, true);
  assert.equal(argOf(callOf(read(src, 'lua', 'knob-cop', ctx)), 'idOrName').problem.message,
    'No image called "knob-cop" in the library or the panel. Did you mean "knob-cap"?');
  const arc = callOf(read(src, 'lua', 'arc'));
  assert.deepEqual([argOf(arc, 'from').meaning.unit, argOf(arc, 'to').value, argOf(arc, 'radius').kind], ['degrees', 135, 'number']);
});

test('record example 15: a SysEx template, read by the encoder the runtime sends with', () => {
  const src = 'ce.device.defineParameter("level", {\n  name = "Level", min = 0, max = 127,\n  sysex = { "F0", "41", "10", "42", "12", "$checksumStart", "40", "01", "33", "$value", "$checksum", "F7" },\n  checksum = "roland-7bit",\n})\n';
  const sysex = optOf(argOf(callOf(read(src, 'lua', 'sysex')), 'spec'), 'sysex');
  assert.equal(sysex.kind, 'bytes');
  assert.equal(sysex.problem, null);
  assert.deepEqual(sysex.meaning.messages.map((m) => m.value), [0, 64, 127]);
  assert.equal(sysex.meaning.messages[1].hex, 'F0 41 10 42 12 40 01 33 40 4C F7');
  const noStart = src.replace('"$checksumStart", ', '');
  const warned = optOf(argOf(callOf(read(noStart, 'lua', 'sysex')), 'spec'), 'sysex');
  assert.deepEqual(warned.problem, { severity: 'warning', message: 'defineParameter("level"): this is a Roland template (41 after F0) with $checksum and no $checksumStart, so the checksum includes the header, and a Roland synth ignores the message. Put $checksumStart where the address begins.' });
  assert.equal(warned.meaning.messages[1].hex.split(' ').slice(-2)[0], '27');
  // A bare literal says where nothing starts: its bytes as sent, its checksum left alone.
  const reset = argOf(callOf(read('ce.midi.sendSysex("F0 41 10 42 12 40 00 7F 00 41 F7")', 'lua', 'ce.')), 'bytes');
  assert.deepEqual([reset.meaning.count, reset.meaning.checksum, reset.problem], [11, undefined, null]);
  // ce.midi.checksum's answer, when both of its arguments are written out.
  const sum = argOf(callOf(read('ce.midi.checksum("roland", { 0x40, 0x00, 0x7F, 0x00 })', 'lua', 'ce.')), 'bytes');
  assert.deepEqual(sum.meaning.checksum, { type: 'roland-7bit', value: 0x41, hex: '41' });
});

/* ================================================================================== writeValue */

/** The value with the colour of an Arg as the colour chooser hands it back: AARRGGBB. */
const chooserColour = (a) => `${Math.round(a.meaning.swatch.alpha * 255).toString(16).toUpperCase().padStart(2, '0')}${a.meaning.swatch.rgb}`;

/** Write `value` into the first colour argument of `src` and give back the new text of that argument. */
function rewriteColour(src, lang, value, ctx) {
  const st = readStatement(src, lang, 1, ctx);
  const a = everyArg(st).find((x) => x.kind === 'colour');
  assert.ok(a, `no colour in ${src}`);
  return writeValue(src, lang, a, value).text;
}

test('ce.math.fromARGB and fromRGBA read the alpha where they say it is, and the warnings point at them', () => {
  const colourOf = (src) => everyArg(readStatement(src, 'lua', 3, {})).find((a) => a.kind === 'colour');
  const first = colourOf('ce.math.fromARGB("#80123456")');
  const last = colourOf('ce.math.fromRGBA("#12345680")');
  for (const a of [first, last]) {
    assert.deepEqual([a.meaning.stored, a.meaning.swatch, a.problem, a.editable], ['80123456', { rgb: '123456', alpha: 128 / 255 }, null, 'colour']);
  }
  assert.deepEqual([first.meaning.reader, last.meaning.reader], ['argb', 'rgba']);
  assert.equal(colourOf('ce.math.fromRGBA("#5B9BD5FF")').meaning.stored, '#5B9BD5', 'solid is "#RRGGBB"');
  // What they answer is the panel's form, which every reader reads the same way.
  const web = withPanel([], (api) => [api.ce.math.fromARGB('#80123456'), api.ce.math.fromRGBA('#12345680'), api.ce.math.fromRGBA('#1238')]);
  assert.deepEqual(web, ['80123456', '80123456', '88112233']);
  // The "#" with eight digits warnings name them.
  for (const src of ['set("X.Background.Fill.colour", "#80123456")', 'ce.math.lighten("#80123456")']) {
    assert.match(colourOf(src).problem.message, /ce\.math\.fromARGB\(\) and ce\.math\.fromRGBA\(\) say which order is meant\.$/, src);
  }
});

test('a colour keeps its notation where it can carry the new one, and the reader\'s alpha form where not', () => {
  const cases = [
    // [script, new colour (the chooser's AARRGGBB), the argument written]
    ['ce.draw.fill("#5B9BD5")', 'FF123456', '"#123456"'],
    ['ce.draw.fill("#5b9bd5")', 'FFABCDEF', '"#abcdef"'],
    ['ce.draw.fill("#5B9BD5")', '80123456', '"#12345680"'],
    ['set("A.Background.Fill.colour", "#5B9BD5")', '80123456', '"80123456"'],
    ['set("A.Background.Fill.colour", "5B9BD5")', 'FF123456', '"123456"'],
    ['set("A.Background.Fill.colour", "5B9BD5")', '80123456', '"80123456"'],
    ['set("A.Background.Fill.colour", "FF5B9BD5")', 'FF123456', '"FF123456"'],
    ['ce.draw.fill("FF5B9BD5")', '40123456', '"40123456"'],
    ['ce.draw.fill("#5B9BD580")', '40123456', '"#12345640"'],
    ['set("A.Background.Fill.colour", "#5B9BD580")', '40123456', '"40123456"'],
    ['ce.draw.fill("red")', 'FFFF0000', '"red"'],
    ['ce.draw.fill("red")', 'FF123456', '"#123456"'],
    ['ce.draw.fill("red")', '80123456', '"#12345680"'],
    ['set("A.Background.Fill.colour", "red")', '80123456', '"80123456"'],
    ['ce.draw.fill("#abc")', 'FFDDEEFF', '"#def"'],
    ['ce.draw.fill("#abc")', 'FF123456', '"#123456"'],
    ['ce.draw.fill("rgb(91, 155, 213)")', 'FF123456', '"rgb(18, 52, 86)"'],
    ['ce.draw.fill("rgb(91,155,213)")', '80123456', '"rgba(18,52,86,0.502)"'],
    ['ce.draw.fill("rgb(91 155 213)")', '80123456', '"rgb(18 52 86 / 0.502)"'],
    ['ce.draw.fill("rgba(91, 155, 213, 0.5)")', 'FF123456', '"rgba(18, 52, 86, 1)"'],
    ['ce.draw.fill("rgb(50%, 20%, 10%)")', 'FF336699', '"rgb(20%, 40%, 60%)"'],
    ['ce.draw.fill("hsl(210, 60%, 60%)")', 'FFFF0000', '"hsl(0, 100%, 50%)"'],
    ['ce.draw.fill("hsl(210deg 60% 60%)")', '80FF0000', '"hsl(0deg 100% 50% / 0.502)"'],
    ['ce.math.lighten("#5B9BD5")', '80123456', '"80123456"'],
    // A stored gradient's stop is written in a stop's own form; ce.draw.gradient's stops are drawings.
    ['set("A.Background.Fill.gradient.stops.0.color", "FFFFFF")', 'FFabcdef', '"ABCDEF"'],
    ['ce.draw.gradient({ "#2A6BD4", "#0A1830" })', '80123456', '"#12345680"'],
    // ce.math.fromARGB / fromRGBA: the alpha where the call names it, the "#" and the digits as written.
    ['ce.math.fromRGBA("#12345680")', '40AABBCC', '"#AABBCC40"'],
    ['ce.math.fromARGB("80123456")', '40AABBCC', '"40AABBCC"'],
    ['ce.math.fromRGBA("#12345680")', 'FFAABBCC', '"#AABBCCFF"'],
    ['ce.math.fromRGBA("#1238")', 'FFAABBCC', '"#ABCF"'],
    ['ce.math.fromARGB("#abc")', '88112233', '"#8123"'],
    ['ce.math.fromARGB("#abc")', 'FF112233', '"#123"'],
    ['ce.math.fromRGBA("5b9bd5")', '40aabbcc', '"aabbcc40"'],
  ];
  for (const [src, value, expected] of cases) assert.equal(rewriteColour(src, 'lua', value), expected, src);
  // Quotes as written: single, double, long brackets, a template, Python's raw, C#'s verbatim.
  assert.equal(rewriteColour("ce.draw.fill('#5B9BD5')", 'lua', 'FF123456'), "'#123456'");
  assert.equal(rewriteColour('ce.draw.fill([[#5B9BD5]])', 'lua', 'FF123456'), '[[#123456]]');
  assert.equal(rewriteColour('ce.draw.fill(`#5B9BD5`)', 'javascript', 'FF123456'), '`#123456`');
  assert.equal(rewriteColour("ce.draw.fill(r'#5B9BD5')", 'python', 'FF123456'), "r'#123456'");
  assert.equal(rewriteColour('ctx.SetValue("A.Background.Fill.colour", @"#5B9BD5");', 'csharp', 'FF123456'), '@"#123456"');
  // The chooser's other spellings are taken too.
  assert.equal(rewriteColour('ce.draw.fill("#5B9BD5")', 'lua', '#123456'), '"#123456"');
  assert.equal(rewriteColour('ce.draw.fill("#5B9BD5")', 'lua', { rgb: '123456', alpha: 0.5 }), '"#12345680"');
  assert.equal(writeValue('ce.draw.fill("#5B9BD5")', 'lua', everyArg(readStatement('ce.draw.fill("#5B9BD5")', 'lua', 1))[0], 'not a colour'), null);
  // No alpha where nothing could read one: a stored stop (its opacity is a field of its own), and a
  // "#RRGGBB" claimed by its form alone, whose reader nobody knows.
  for (const src of ['set("A.Background.Fill.gradient.stops.0.color", "FFFFFF")', 'local base = "#2A6BD4"']) {
    const a = everyArg(readStatement(src, 'lua', 1)).find((x) => x.kind === 'colour');
    assert.equal(a.meaning.takesAlpha, false, src);
    assert.equal(writeValue(src, 'lua', a, '80123456'), null, src);
  }
  assert.equal(rewriteColour('local base = "#2A6BD4"', 'lua', 'FF123456'), '"#123456"');
  assert.equal(everyArg(readStatement('local fill = { colour = "#2A6BD4" }', 'lua', 1))[0].meaning.takesAlpha, true);
});

test('a number keeps its notation, a string its quotes, a list or a table the language\'s syntax', () => {
  const write = (src, lang, name, value) => {
    const st = readStatement(src, lang, 1);
    const a = everyArg(st).find((x) => x.name === name);
    assert.ok(a, `${src}: no ${name}`);
    return apply(src, writeValue(src, lang, a, value));
  };
  assert.equal(write('ce.anim.to("c", 1, { duration = 500 })', 'lua', 'duration', 250), 'ce.anim.to("c", 1, { duration = 250 })');
  assert.equal(write('ce.anim.to("c", 1, { duration = 500 })', 'lua', 'duration', 250.5), 'ce.anim.to("c", 1, { duration = 250.5 })');
  assert.equal(write('ce.math.lighten("red", 0.20)', 'lua', 'amount', 0.5), 'ce.math.lighten("red", 0.50)');
  assert.equal(write('ce.math.lighten("red", 0.20)', 'lua', 'amount', 0.125), 'ce.math.lighten("red", 0.125)');
  assert.equal(write('ce.midi.sendCC(1, 0x4A, 64)', 'lua', 'cc', 75), 'ce.midi.sendCC(1, 0x4B, 64)');
  assert.equal(write('ce.midi.sendCC(1, 0x0a, 64)', 'javascript', 'cc', 11), 'ce.midi.sendCC(1, 0x0b, 64)');
  assert.equal(write('ce.draw.arc(0, 0, 4, -135, 135)', 'lua', 'from', -90), 'ce.draw.arc(0, 0, 4, -90, 135)');
  assert.equal(write('ce.draw.arc(0, 0, 4, -135, 135)', 'lua', 'to', -45), 'ce.draw.arc(0, 0, 4, -135, -45)');
  assert.equal(write('ctx.set("A", 0.5f);', 'cpp', 'value', 2), 'ctx.set("A", 2.0f);');
  assert.equal(write("ce.draw.blend('multiply')", 'lua', 'mode', 'screen'), "ce.draw.blend('screen')");
  assert.equal(write('ce.time.step(0, "1/8t")', 'javascript', 'division', '1/16'), 'ce.time.step(0, "1/16")');
  assert.equal(write('ce.time.step(0, "it\'s")', 'javascript', 'division', 'a"b'), 'ce.time.step(0, "a\\"b")');
  // Lists and tables: entries edited in place, so the layout and comments around them stay…
  assert.equal(write('ce.anim.to("c", 1, { curve = { 0.2, 0.9, --[[x1, y1]] 0.3, 1.4 } })', 'lua', 'curve', [0.2, 0.8, 0.3, 1.4]),
    'ce.anim.to("c", 1, { curve = { 0.2, 0.8, --[[x1, y1]] 0.3, 1.4 } })');
  assert.equal(write('ce.anim.to("c", 1, {"curve": [0.2, 0.9, 0.3, 1.4]})', 'python', 'curve', 'linear'), 'ce.anim.to("c", 1, {"curve": "linear"})');
  // …and rebuilt in the language's own syntax when their shape changes.
  assert.equal(write('ce.midi.sendSysex({ 0xF0, 0x41 })', 'lua', 'bytes', [0xF0, 0x41, 0xF7]), 'ce.midi.sendSysex({ 0xF0, 0x41, 0xF7 })');
  assert.equal(write('ce.midi.sendSysex([0xF0, 0x41])', 'javascript', 'bytes', [0xF0, 0x41, 0xF7]), 'ce.midi.sendSysex([0xF0, 0x41, 0xF7])');
  assert.equal(write('ce.midi.sendSysex([0xF0, 0x41])', 'python', 'bytes', [0xF0, 0x41, 0xF7]), 'ce.midi.sendSysex([0xF0, 0x41, 0xF7])');
  assert.equal(write('set("A.Background.Fill", { colour = "red" })', 'lua', 'value', { colour: 'red', mode: 'solid' }), 'set("A.Background.Fill", { colour = "red", mode = "solid" })');
  assert.equal(write('set("A.Background.Fill", { colour: "red" })', 'javascript', 'value', { colour: 'red', "odd key": 1 }), 'set("A.Background.Fill", { colour: "red", "odd key": 1 })');
  assert.equal(write('set("A.Background.Fill", {"colour": "red"})', 'python', 'value', { colour: 'red', on: true, off: null }), 'set("A.Background.Fill", {"colour": "red", "on": True, "off": None})');
  assert.equal(write('set("A.Background.Fill", { colour = "red" })', 'lua', 'value', { ['repeat']: 2 }), 'set("A.Background.Fill", { ["repeat"] = 2 })');
});

/** For every literal argument in a script: writing what it holds gives its text back exactly, and
 *  writing something else reads back as that. */
function roundTrips(src, lang, ctx) {
  const offsets = [];
  src.split('\n').reduce((at, line) => { if (line.trim()) offsets.push(at); return at + line.length + 1; }, 0);
  let checked = 0;
  for (const offset of offsets) {
    const st = readStatement(src, lang, offset, ctx);
    if (!st) continue;
    const args = everyArg(st);
    args.forEach((a, index) => {
      if (!a.literal) return;
      let same;
      let next;
      let readBack;
      if (a.kind === 'colour') {
        if (!a.meaning.swatch) return;
        same = chooserColour(a);
        next = a.meaning.takesAlpha ? '80123456' : 'FF123456';
        readBack = (b) => assert.deepEqual([b.meaning.swatch.rgb, Math.round(b.meaning.swatch.alpha * 255)], ['123456', a.meaning.takesAlpha ? 0x80 : 255], `${lang}: ${a.text}`);
      } else if (a.kind === 'gradient') {
        same = { angle: a.meaning.angle ?? undefined, stops: a.meaning.stops.map((s) => ({ at: s.at, colour: chooserColour({ meaning: { swatch: { ...cssColour(s.css) } } }), opacity: s.opacity })) };
        next = { angle: 45, stops: [{ at: 0, colour: '112233' }, { at: 0.25, colour: '445566' }, { at: 1, colour: '778899' }] };
        readBack = (b) => assert.deepEqual([b.meaning.angle, b.meaning.stops.map((s) => [s.at, s.css])], [45, [[0, '#112233'], [0.25, '#445566'], [1, '#778899']]], `${lang}: ${a.text}`);
      } else {
        same = a.value;
        if (typeof a.value === 'number') next = Number.isInteger(a.value) ? a.value + 1 : a.value + 0.25;
        else if (typeof a.value === 'string') next = a.meaning.choices?.find((c) => c !== a.value) ?? `${a.value}x`;
        else if (Array.isArray(a.value)) next = [...a.value, a.value[0]];
        else if (typeof a.value === 'boolean') next = !a.value;
        else return;
        readBack = (b) => assert.deepEqual(b.value, next, `${lang}: ${a.text}`);
      }
      const unchanged = writeValue(src, lang, a, same);
      assert.ok(unchanged, `${lang}: ${a.text} cannot be written`);
      assert.equal(apply(src, unchanged), src, `${lang}: writing what ${a.text} holds changed the text`);
      const edit = writeValue(src, lang, a, next);
      const changed = apply(src, edit);
      const again = readStatement(changed, lang, offset, ctx);
      const b = a.kind === 'gradient' ? everyArg(again).find((x) => x.kind === 'gradient') : everyArg(again)[index];
      assert.ok(b, `${lang}: ${a.text} is gone after writing ${JSON.stringify(next)}:\n${changed}`);
      readBack(b);
      checked += 1;
    });
  }
  return checked;
}

/** The swatch a CSS colour paints, as the tests compare it. */
function cssColour(css) {
  const m = /^#([0-9A-F]{6})$/.exec(css);
  if (m) return { rgb: m[1], alpha: 1 };
  const r = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(css);
  return { rgb: [r[1], r[2], r[3]].map((x) => Number(x).toString(16).toUpperCase().padStart(2, '0')).join(''), alpha: Number(r[4]) };
}

test('every literal kind round-trips: its own value gives its text back, a new one reads back', () => {
  const ctx = CONTEXT();
  const lua = [
    'ce.core.set("Cutoff.Background.Fill.colour", "#5B9BD580")',
    'ce.draw.fill("FF5B9BD5") ce.draw.stroke("rgb(91, 155, 213)", 2)',
    'ce.draw.fill(ce.draw.gradient({ "#2A6BD4", { at = 0.3, colour = "#5B9BD5", opacity = 0.5 }, "#0A1830" }, 135))',
    'ce.anim.to("Cutoff", 127, {\n  duration = 500,\n  curve = "outBack",\n  ["repeat"] = 3,\n})',
    'ce.anim.to("Cutoff", 1, { curve = { 0.2, 0.9, 0.3, 1.4 }, delay = 0.5 })',
    'local s = ce.time.step(0, "1/8T") local n = ce.music.scale("C3", "dorian")',
    'ce.music.chord(48, "maj7")',
    'ce.draw.blend("screen")',
    'ce.midi.sendNote(1, 60, 100, 250)',
    'ce.midi.sendSysex({ 0xF0, 0x41, 0xF7 })',
    'ce.text.style("Title", { family = "Inter Tight", size = 18, bold = true })',
    'ce.image.set("Logo", data, { opacity = 50, tint = "#FFAA00" })',
    'local base = "#2A6BD4"',
    'set("panel.bgColour", "red")',
    'ce.anim.envelope("Cutoff.value", { {x=0,y=0}, {x=0.25,y=1}, {x=1,y=0} }, { duration = 800 })',
  ].join('\n');
  const js = [
    'ce.core.set("Cutoff.Background.Fill.colour", \'#5B9BD580\');',
    'ce.draw.fill(ce.draw.gradient(["#2A6BD4", { at: 0.3, colour: "#5B9BD5" }, "#0A1830"]));',
    'ce.anim.to("Cutoff", 127, { duration: 500, curve: [0.2, 0.9, 0.3, 1.4] });',
    'ce.time.step(0, "1/16"); ce.music.scale("C3", "minor");',
    'ce.draw.arc(30, 30, 24, -135, 135)',
    'ce.midi.sendSysex([0xF0, 0x41, 0xF7]);',
    'const accent = { colour: "FF5B9BD5" };',
    'ce.anim.envelope("Cutoff.value", [[0, 0], [0.5, 1], [1, 0]]);',
  ].join('\n');
  const py = [
    'ce.core.set("Cutoff.Background.Fill.colour", "#5B9BD5")',
    'ce.draw.fill(ce.draw.gradient(["#2A6BD4", {"at": 0.3, "colour": "#5B9BD5"}, "#0A1830"], 90))',
    'ce.anim.to("Cutoff", 127, {"duration": 500, "curve": "outBack"})',
    'ce.music.scale("C3", scale="harmonicMinor")',
    'ce.midi.sendNote(1, 60, 100)',
    'ce.anim.envelope("Cutoff.value", [{"x": 0, "y": 0}, {"x": 0.5, "y": 1}, {"x": 1, "y": 0}])',
  ].join('\n');
  const cs = 'ctx.SetValue("Cutoff.Background.Fill.colour", "FF5B9BD5");\nctx.SendCC(1, 74, 64);\nctx.Log("hi");';
  let total = 0;
  for (const [src, lang] of [[lua, 'lua'], [js, 'javascript'], [js, 'typescript'], [py, 'python'], [cs, 'csharp'], [cs.replace(/ctx\.SetValue/g, 'ctx.set').replace(/SendCC/g, 'sendCC'), 'cpp']]) {
    total += roundTrips(src, lang, ctx);
  }
  assert.ok(total > 60, `only ${total} values round-tripped`);
});

/* ============================================================================== readJsonValues */

/** A Label whose fill differs from its type's in its colour and its gradient: record example 3. */
function filledLabel() {
  const label = createControl('Label', { name: 'Title' });
  const fill = label._children.Background._children.Fill;
  fill.colour = 'FF5B9BD5';
  fill.gradient = { type: 'linear', angle: 90, stops: [{ color: 'FFFFFF', position: 0 }, { color: '000000', position: 100 }] };
  return label;
}

test('record example 3: the panel file view is read by the section templates, keys and no calls', () => {
  const label = filledLabel();
  const { text } = controlFileText(label);
  // With the live control, as the view has it, and from the text alone.
  for (const context of [{ control: label }, {}]) {
    const r = readJsonValues(text, at(text, '"colour"'), context);
    assert.deepEqual([r.item, r.path, r.calls], [{ kind: 'control', controlType: 'Label' }, ['_children', 'Background', '_children', 'Fill'], []]);
    const [colour, gradient] = r.rows;
    assert.deepEqual([colour.name, colour.kind, colour.editable, colour.meaning.reader, colour.meaning.claimedBy, colour.meaning.swatch],
      ['colour', 'colour', 'colour', 'property', 'path', { rgb: '5B9BD5', alpha: 1 }]);
    assert.equal(text.slice(colour.range.start, colour.range.end), '"FF5B9BD5"');
    assert.equal(text.slice(colour.keyRange.start, colour.keyRange.end), '"colour"');
    // A stored gradient, so the Gradient tab with all it has: not a ce.draw one.
    assert.deepEqual([gradient.kind, gradient.editable, gradient.meaning.stored, gradient.meaning.angle, gradient.meaning.stopsTakeOpacity],
      ['gradient', 'gradient', true, 90, false]);
    assert.deepEqual(gradient.meaning.stops.map((s) => [s.at, s.css]), [[0, '#FFFFFF'], [1, '#000000']]);
    assert.deepEqual(gradient.options.map((s) => [s.name, s.meaning.reader, s.meaning.takesAlpha, s.text]),
      [['stop 1', 'stop', false, '"FFFFFF"'], ['stop 2', 'stop', false, '"000000"']]);
  }
  // The caret in a stop is in that stop's object, and its colour row is the stop's.
  const inStop = readJsonValues(text, at(text, '"000000"'), { control: label });
  assert.deepEqual(inStop.path, ['_children', 'Background', '_children', 'Fill', 'gradient', 'stops', 1]);
  assert.deepEqual(inStop.rows.map((x) => [x.name, x.meaning.reader, x.meaning.swatch?.rgb]), [['color', 'stop', '000000']]);
  // Nothing to show in no text, and text that is not JSON yet is not a throw.
  assert.equal(readJsonValues('', 0), null);
  for (let cut = 0; cut <= text.length; cut += 7) readJsonValues(text.slice(0, cut), cut);
});

test('a row of the panel file view is written as the file writes it', () => {
  const label = filledLabel();
  const { text } = controlFileText(label);
  const [colour, gradient] = readJsonValues(text, at(text, '"colour"'), { control: label }).rows;
  const fillOf = (t) => JSON.parse(t)._children.Background._children.Fill;
  const write = (row, value) => { const e = writeValue(text, 'json', row, value); return e && apply(text, e); };
  // A property is AARRGGBB; a stop is RRGGBB, with no alpha of its own.
  assert.equal(fillOf(write(colour, '80123456')).colour, '80123456');
  assert.equal(write(colour, 'FF5B9BD5'), text);
  assert.equal(fillOf(write(gradient.options[1], '#123456')).gradient.stops[1].color, '123456');
  assert.equal(writeValue(text, 'json', gradient.options[1], '80123456'), null);
  // The Gradient tab's object: positions 0 to 100, colours RRGGBB, the file's key order, the rest kept.
  assert.equal(write(gradient, { angle: 90, stops: [{ at: 0, colour: 'FFFFFF' }, { at: 1, colour: '000000' }] }), text);
  const next = write(gradient, { angle: 45, stops: [{ at: 0, colour: '112233' }, { at: 0.25, colour: '#445566' }, { position: 100, color: '778899' }] });
  assert.deepEqual(fillOf(next).gradient, { type: 'linear', angle: 45,
    stops: [{ color: '112233', position: 0 }, { color: '445566', position: 25 }, { color: '778899', position: 100 }] });
  assert.equal(fillOf(next).colour, 'FF5B9BD5', 'the rest of the object is as it was');
  const again = readJsonValues(next, at(next, '"colour"'), {}).rows[1];
  assert.deepEqual([again.meaning.angle, again.meaning.stops.map((s) => [s.at, s.css])], [45, [[0, '#112233'], [0.25, '#445566'], [1, '#778899']]]);
  // A stop asking for an opacity, or an alpha, has nowhere to go in a stored gradient.
  assert.equal(writeValue(text, 'json', gradient, { stops: [{ at: 0, colour: '112233', opacity: 0.5 }, { at: 1, colour: '445566' }] }), null);
  assert.equal(writeValue(text, 'json', gradient, { stops: [{ at: 0, colour: '80112233' }, { at: 1, colour: '445566' }] }), null);
});

test('the panel\'s own settings, and a component\'s closed lists, in the panel file view', () => {
  const panel = deserializePanel(readText(path.join(REPO, 'CE/qa/QA-08-export.cepanel')), 'QA-08-export.cepanel', null);
  const settings = panelSettingsFileText(panel).text;
  const r = readJsonValues(settings, at(settings, '"bgColour"'), { panel });
  assert.deepEqual(r.item, { kind: 'panel', controlType: null });
  const bg = r.rows.find((x) => x.name === 'bgColour');
  assert.deepEqual([bg.kind, bg.meaning.reader, bg.meaning.swatch], ['colour', 'property', { rgb: '1C2024', alpha: 1 }]);
  // An Arpeggiator's pattern and division: its verbs' values.
  const arp = createControl('Arp', { name: 'Arp' });
  arp._children.Arp.pattern = 'updown';
  arp._children.Arp.division = '1/8T';
  const text = controlFileText(arp).text;
  const rows = readJsonValues(text, at(text, '"pattern"'), { control: arp }).rows;
  assert.deepEqual(rows.map((x) => [x.name, x.kind, x.editable, x.problem]), [['pattern', 'enum', 'choice', null], ['division', 'enum', 'choice', null]]);
  assert.ok(rows[0].meaning.choices.includes('downup'));
  assert.equal(JSON.parse(apply(text, writeValue(text, 'json', rows[0], 'random')))._children.Arp.pattern, 'random');
  const bad = text.replace('"updown"', '"sideways"');
  assert.equal(readJsonValues(bad, at(bad, '"pattern"')).rows[0].problem.message,
    '"sideways" is not one of the values pattern takes. They are "up", "down", "updown", "downup", "asPlayed", "random" or "chord".');
});

test('every line of a committed panel\'s whole file reads, and every row writes its own value back exactly', () => {
  let rows = 0;
  const kinds = new Set();
  for (const rel of ['CE/qa/QA-01-components.cepanel', 'CE/qa/QA-02-properties.cepanel', 'CE/qa/QA-03-states.cepanel']) {
    const panel = deserializePanel(readText(path.join(REPO, rel)), rel, null);
    const { text } = wholeFileText(serializePanel(panel));
    const seen = new Set();
    let offset = 0;
    for (const line of text.split('\n')) {
      const r = readJsonValues(text, offset + Math.min(line.length, line.search(/\S|$/) + 1));
      offset += line.length + 1;
      for (const row of r?.rows ?? []) {
        for (const each of [row, ...(row.options ?? [])]) {
          if (seen.has(each.range.start)) continue;
          seen.add(each.range.start);
          // The committed panels are clean: nothing in them is refused.
          assert.equal(each.problem, null, `${rel}: ${each.name} ${each.text}: ${each.problem?.message}`);
          assert.equal(text.slice(each.range.start, each.range.end), each.text);
          let same = each.value;
          if (each.kind === 'colour') {
            if (!each.meaning.swatch) continue;
            same = chooserColour(each);
          }
          const edit = writeValue(text, 'json', each, same);
          assert.ok(edit, `${rel}: ${each.name} ${each.text} cannot be written`);
          assert.equal(apply(text, edit), text, `${rel}: writing what ${each.name} holds changed the text`);
          kinds.add(each.kind);
          rows += 1;
        }
      }
    }
  }
  // (No component in these three has a closed list set away from its default; the test above has one.)
  assert.deepEqual([...kinds].sort(), ['colour', 'gradient']);
  assert.ok(rows > 250, `only ${rows} rows`);
});

/* ================================================================================ performance */

/** A long script in the shape panel scripts have: handlers, drawing, a table or two. */
function longScript(lang, lines) {
  const out = [];
  for (let i = 0; out.length < lines; i += 1) {
    if (lang === 'lua') {
      out.push(`function onValueChanged${i}(control, value)`,
        '  ce.core.set("Cutoff.Background.Fill.colour", "#5B9BD5")',
        `  ce.anim.to("Cutoff", value, { duration = ${i * 10}, curve = "outBack" })`,
        `  if value > 0.5 then ce.midi.sendCC(1, ${i % 128}, 64) end`,
        '  ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 135))',
        'end', '');
    } else if (lang === 'python') {
      out.push(`def on_value_changed_${i}(control, value):`,
        '    ce.core.set("Cutoff.Background.Fill.colour", "#5B9BD5")',
        `    ce.anim.to("Cutoff", value, {"duration": ${i * 10}, "curve": "outBack"})`,
        `    if value > 0.5: ce.midi.sendCC(1, ${i % 128}, 64)`,
        '    ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 135))',
        '', '');
    } else {
      out.push(`function onValueChanged${i}(control, value) {`,
        '  ce.core.set("Cutoff.Background.Fill.colour", "#5B9BD5");',
        `  ce.anim.to("Cutoff", value, { duration: ${i * 10}, curve: "outBack" });`,
        `  if (value > 0.5) ce.midi.sendCC(1, ${i % 128}, 64);`,
        '  ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 135));',
        '}', '');
    }
  }
  return out.slice(0, lines).join('\n');
}

test('a read stays well under the time a caret move allows, on a 500-line script', (t) => {
  const context = CONTEXT();
  for (const lang of ['lua', 'javascript', 'python', 'cpp']) {
    const src = longScript(lang === 'cpp' ? 'javascript' : lang, 500);
    const starts = [0];
    for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') starts.push(i + 1);
    const middle = (from) => starts.findIndex((s, i) => i >= from && src.startsWith('ce.', s + src.slice(s).search(/\S/)));
    clearValueCacheForTesting();
    // Cold: the first read parses (or scans) the whole script.
    let t0 = performance.now();
    const first = readStatement(src, lang, starts[middle(250)] + 6, context);
    const cold = performance.now() - t0;
    assert.ok(first?.calls.length, `${lang}: nothing read`);
    // Warm: the caret moving through it, every line once.
    const each = [];
    for (const s of starts) {
      t0 = performance.now();
      readStatement(src, lang, s + 3, context);
      each.push(performance.now() - t0);
    }
    each.sort((a, b) => a - b);
    const median = each[Math.floor(each.length / 2)];
    const worst = each[each.length - 1];
    // An edit: the text changes, so the parse is redone.
    const line = middle(300);
    const edited = `${src.slice(0, starts[line])} ${src.slice(starts[line])}`;
    t0 = performance.now();
    const again = readStatement(edited, lang, starts[line] + 7, context);
    const afterEdit = performance.now() - t0;
    assert.ok(again?.calls.length, `${lang}: nothing read after the edit`);
    t.diagnostic(`${lang}: cold ${cold.toFixed(2)} ms, after an edit ${afterEdit.toFixed(2)} ms, warm median ${median.toFixed(3)} ms, worst ${worst.toFixed(2)} ms`);
    // Generous bounds, so a slow runner does not fail it; the diagnostics say what it really took.
    assert.ok(cold < 250, `${lang}: a cold read took ${cold.toFixed(1)} ms`);
    assert.ok(afterEdit < 250, `${lang}: a read after an edit took ${afterEdit.toFixed(1)} ms`);
    assert.ok(median < 50, `${lang}: a warm read took ${median.toFixed(1)} ms`);
  }
});
