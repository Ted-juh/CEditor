// valueCompletions.test.js — completion over a value already written (scripting/valueCompletions.js):
// with the caret inside a string that is a value the editor knows the choices for, the choices, and
// the range between the quotes that the one accepted replaces whole. docs/design/script-editor-value-
// editors.md, "Order of work", step 3. The code editor's side (Ctrl+Space, typing, one undo step) is
// driven in browser-checks/valueCompletion.mjs.
//
// What has to hold:
//   - forced, the caret anywhere between the quotes gives every choice, in the choices' own order,
//     the written one selected, and from..to is exactly the text between the quotes;
//   - accepting a choice there writes it in place of the whole value, the quotes as they were;
//   - typing filters by the text before the caret, the way word completion does;
//   - in Lua, JavaScript and Python, and in C++, C# and Java handler code where the core reads the call;
//   - outside a known value, and for a value that is not a written string, there is nothing (null),
//     so the editor completes words as it always did.

import test from 'node:test';
import assert from 'node:assert/strict';

import { valueCompletions } from '../src/CE_Application/scripting/valueCompletions.js';
import { ANIM_CURVE_NAMES } from '../src/CE_Application/scripting/easingTables.js';
import { DIVISION_NAMES } from '../src/CE_Application/scripting/timeTables.js';
import { SCALE_NAMES } from '../src/CE_Application/scripting/musicTheory.js';
import { ALL_EVENTS, MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const BLEND_MODES = MEMBER_BY_ID.drawBlend.params[0].values;
const HANDLERS = ALL_EVENTS.map((e) => e.fn);

function demoPanel() {
  const cutoff = createControl('Knob', { name: 'Cutoff' });
  cutoff._children.Animations = {
    _type: 'Animations',
    _children: { Pulse: { name: 'Pulse', kind: 'keyframes' }, Hover: { name: 'Hover', kind: 'transition' } },
  };
  return { id: 'demo', name: 'Demo', controls: [cutoff, createControl('Label', { name: 'Title' }), createControl('Slider', { name: 'Resonance' })] };
}
const CONTEXT = () => ({ panel: demoPanel(), fonts: ['Inter', 'Inter Tight', { family: 'Fira Code' }], images: [{ id: 'a1', name: 'knob-cap' }] });

const forced = (src, lang, caret, context = CONTEXT()) => valueCompletions(src, lang, caret, context, { force: true });
const typed = (src, lang, caret, context = CONTEXT()) => valueCompletions(src, lang, caret, context, { force: false });
const labels = (r) => r.options.map((o) => o.label);
const selectedLabel = (r) => r.options[r.selected]?.label;
/** The source after accepting `label`, as the editor writes it: [from, to) replaced by its insert. */
function accept(src, r, label) {
  const option = r.options.find((o) => o.label === label);
  assert.ok(option, `${label} is offered`);
  return src.slice(0, r.from) + option.insert + src.slice(r.to);
}
/** Every caret offset from just after the opening quote of `quoted` to just before its closing one. */
function insideOf(src, quoted) {
  const start = src.indexOf(quoted) + 1;
  return Array.from({ length: quoted.length - 1 }, (_, i) => start + i);
}

/* =================================================================================== the kinds */

const CURVES = {
  lua: 'ce.anim.to("Cutoff.value", 100, { curve = "outBack" })',
  javascript: 'ce.anim.to("Cutoff.value", 100, { curve: "outBack" });',
  typescript: 'ce.anim.to("Cutoff.value", 100, { curve: "outBack" });',
  python: 'ce.anim.to("Cutoff.value", 100, {"curve": "outBack"})',
};

for (const [lang, src] of Object.entries(CURVES)) {
  test(`a curve in ${lang}: forced anywhere inside it, every curve in order, the written one selected`, () => {
    const from = src.indexOf('outBack');
    for (const caret of insideOf(src, '"outBack"')) {
      const r = forced(src, lang, caret);
      assert.ok(r, `caret at ${caret - from} of outBack`);
      assert.deepEqual([r.from, r.to, r.current], [from, from + 'outBack'.length, 'outBack'], `range, caret at ${caret - from}`);
      assert.deepEqual(labels(r), ANIM_CURVE_NAMES, 'the curves in their own order, not alphabetised');
      assert.equal(selectedLabel(r), 'outBack', 'Enter keeps what is written');
    }
    const r = forced(src, lang, from + 3);
    assert.equal(accept(src, r, 'inOutBack'), src.replace('"outBack"', '"inOutBack"'), 'the whole value replaced, not only the part before the caret');
    assert.ok(r.options.every((o) => o.kind === 'value' && o.detail.endsWith('curve')));
  });
}

test('a division, in Lua and Python: the divisions in the table\'s order, with what each is', () => {
  const lua = 'ce.time.step(b, "1/8T")';
  const r = forced(lua, 'lua', lua.indexOf('8T'));
  assert.deepEqual(labels(r), DIVISION_NAMES);
  assert.deepEqual([selectedLabel(r), r.options[r.selected].detail], ['1/8T', 'now · 8th T, 0.33 beats']);
  assert.equal(r.options.find((o) => o.label === '1/4').detail, 'Quarter, 1 beat');
  assert.equal(accept(lua, r, '1/16'), 'ce.time.step(b, "1/16")');

  // Single quotes are kept as they are.
  const py = "ce.time.step(b, '1/4')";
  const p = forced(py, 'python', py.indexOf('/4'));
  assert.deepEqual([selectedLabel(p), p.from, p.to], ['1/4', py.indexOf('1/4'), py.indexOf('1/4') + 3]);
  assert.equal(accept(py, p, '1/8D'), "ce.time.step(b, '1/8D')");
});

test('a value the runtime reads as a choice, written another way, is listed as written in its place', () => {
  // ce.time reads a division in any case: "1/8t" is the 1/8T row, as written, so Enter keeps it exactly.
  const src = 'ce.time.step(b, "1/8t")';
  const r = forced(src, 'lua', src.indexOf('8t'));
  assert.equal(r.selected, DIVISION_NAMES.indexOf('1/8T'));
  assert.equal(selectedLabel(r), '1/8t');
  assert.equal(accept(src, r, '1/8t'), src);
  assert.equal(labels(r).filter((l) => l.toLowerCase() === '1/8t').length, 1, 'once, in its own place');

  // A curve's name is read in any case too (it was read only as spelled, and "outback" was refused
  // and selected as outBack): it is listed as written, in outBack's place, and Enter keeps it.
  const curve = 'ce.anim.to("x", 1, { curve = "outback" })';
  const c = forced(curve, 'lua', curve.indexOf('back'));
  assert.equal(c.selected, ANIM_CURVE_NAMES.indexOf('outBack'));
  assert.equal(selectedLabel(c), 'outback');
  assert.equal(accept(curve, c, 'outback'), curve);
});

test('a scale and a chord, in Lua, JavaScript and Python', () => {
  for (const [lang, src] of [['lua', 'ce.music.scale("C3", "dorian")'], ['javascript', 'ce.music.scale("C3", "dorian");'], ['python', 'ce.music.scale("C3", "dorian")']]) {
    const r = forced(src, lang, src.indexOf('dorian') + 2);
    assert.deepEqual(labels(r), SCALE_NAMES, lang);
    assert.equal(selectedLabel(r), 'dorian', lang);
    assert.deepEqual([r.from, r.to], [src.indexOf('dorian'), src.indexOf('dorian') + 6], lang);
    assert.equal(accept(src, r, 'lydian'), src.replace('dorian', 'lydian'), lang);
  }
  const chord = 'ce.music.chord("C4", "maj7")';
  assert.equal(selectedLabel(forced(chord, 'lua', chord.indexOf('maj7'))), 'maj7');
});

test('a value from a fixed list (an enum), in Lua, JavaScript and Python', () => {
  for (const [lang, src] of [['lua', 'ce.draw.blend("multiply")'], ['javascript', "ce.draw.blend('multiply');"], ['python', 'ce.draw.blend("multiply")']]) {
    const r = forced(src, lang, src.indexOf('multiply') + 8);
    assert.deepEqual(labels(r), BLEND_MODES, lang);
    assert.deepEqual([selectedLabel(r), r.options[r.selected].detail], ['multiply', 'now · mode'], lang);
    assert.equal(accept(src, r, 'color-dodge'), src.replace('multiply', 'color-dodge'), lang);
  }
});

test('an event, in Lua, JavaScript, Python and C++ handler code: the handler names, the written one selected', () => {
  const cases = [
    ['lua', 'ce.core.on("Cutoff", "onValueChanged", function(e) end)'],
    ['javascript', 'ce.core.on("Cutoff", "onValueChanged", (e) => {});'],
    ['python', 'ce.core.on("Cutoff", "onValueChanged", handler)'],
    ['cpp', 'void setup(CeContext& ctx) {\n    ctx.on("Cutoff", "onValueChanged", handler);\n}\n'],
  ];
  for (const [lang, src] of cases) {
    const r = forced(src, lang, src.indexOf('ValueChanged'));
    assert.deepEqual(labels(r), HANDLERS, lang);
    assert.equal(selectedLabel(r), 'onValueChanged', lang);
    assert.match(r.options[r.selected].detail, /^now · Runs once, when the value settles/, lang);
    assert.equal(accept(src, r, 'onClick'), src.replace('"onValueChanged"', '"onClick"'), lang);
  }
  // An event written by its id ("valueChanged") is the same event: listed as written in its
  // handler's place, so Enter keeps the script's own spelling.
  const byId = 'ce.core.on("Cutoff", "valueChanged", f)';
  const r = forced(byId, 'lua', byId.indexOf('Changed'));
  assert.equal(r.selected, HANDLERS.indexOf('onValueChanged'));
  assert.equal(selectedLabel(r), 'valueChanged');
  assert.equal(accept(byId, r, 'valueChanged'), byId);
});

test('a control\'s name when the panel has controls, an animation\'s name on that control, and a font', () => {
  const on = 'ce.core.on("Cutoff", "onClick", f)';
  const r = forced(on, 'lua', on.indexOf('Cutoff') + 1);
  assert.deepEqual(labels(r), ['Cutoff', 'Title', 'Resonance']);
  assert.deepEqual(r.options.map((o) => o.detail), ['now · Knob', 'Label', 'Slider']);
  assert.equal(accept(on, r, 'Resonance'), on.replace('"Cutoff"', '"Resonance"'));
  // No panel, no names to offer: the editor completes words.
  assert.equal(forced(on, 'lua', on.indexOf('Cutoff') + 1, {}), null);

  const play = 'ce.anim.play("Cutoff", "Pulse")';
  assert.deepEqual(labels(forced(play, 'lua', play.indexOf('Pulse'))), ['Pulse'], 'only its keyframe animations');

  for (const [lang, src] of [['lua', 'ce.text.style("Title", { family = "Inter" })'], ['javascript', 'ce.text.style("Title", { family: "Inter" });']]) {
    const f = forced(src, lang, src.indexOf('Inter') + 2);
    assert.deepEqual(labels(f), ['Inter', 'Inter Tight', 'Fira Code'], lang);
    assert.equal(selectedLabel(f), 'Inter', lang);
    assert.equal(accept(src, f, 'Fira Code'), src.replace('"Inter"', '"Fira Code"'), lang);
  }
});

test('C# and Java handler code, where the core reads the call through ctx', () => {
  const cs = 'public void OnValueChanged(CeContext ctx, CeEvent e) {\n    ctx.ce.time.step(0, @"1/4");\n}\n';
  const r = forced(cs, 'csharp', cs.indexOf('1/4') + 1);
  assert.equal(selectedLabel(r), '1/4');
  assert.equal(accept(cs, r, '1/2'), cs.replace('@"1/4"', '@"1/2"'), 'the verbatim string\'s @ is kept');
  const java = 'public void onValueChanged(CeContext ctx, CeEvent e) {\n    ctx.on("Cutoff", "onClick", h);\n}\n';
  const j = forced(java, 'java', java.indexOf('Click'));
  assert.equal(selectedLabel(j), 'onClick');
});

/* ==================================================================================== typing */

test('typing filters by the text before the caret: the ones it starts, then the ones holding it, each in order', () => {
  const src = 'ce.anim.to("x", 1, { curve = "out" })';
  const r = typed(src, 'lua', src.indexOf('out') + 3);
  const starts = ANIM_CURVE_NAMES.filter((n) => n.toLowerCase().startsWith('out'));
  const holds = ANIM_CURVE_NAMES.filter((n) => !n.toLowerCase().startsWith('out') && n.toLowerCase().includes('out'));
  assert.deepEqual(labels(r), [...starts, ...holds]);
  assert.equal(r.selected, 0);
  assert.deepEqual([r.from, r.to], [src.indexOf('out'), src.indexOf('out') + 3]);

  // Only the text before the caret: in the middle of "outBack", "ou" is what is typed, and the
  // accepted choice still replaces the whole value.
  const mid = 'ce.anim.to("x", 1, { curve = "outBack" })';
  const m = typed(mid, 'lua', mid.indexOf('outBack') + 2);
  assert.ok(labels(m).includes('outQuad') && labels(m).includes('inOutBack'));
  assert.equal(accept(mid, m, 'outQuad'), mid.replace('outBack', 'outQuad'));

  // A choice typed out in full is left out, as word completion leaves out the word typed; a case
  // apart, it is offered, to be put right.
  const whole = 'ce.time.step(b, "1/8")';
  assert.deepEqual(labels(typed(whole, 'lua', whole.indexOf('1/8') + 3)), ['1/8D', '1/8T']);
  const lower = 'ce.anim.to("x", 1, { curve = "outback" })';
  assert.deepEqual(labels(typed(lower, 'lua', lower.indexOf('outback') + 7)), ['outBack', 'inOutBack']);

  // Nothing typed yet: every choice, and the editor opens the list only when asked (Ctrl+Space).
  const empty = 'ce.draw.blend("")';
  const e = typed(empty, 'lua', empty.indexOf('""') + 1);
  assert.deepEqual([labels(e), e.from, e.to], [BLEND_MODES, empty.indexOf('""') + 1, empty.indexOf('""') + 1]);

  // Nothing fits what is typed: an empty list, which closes, and no word completion in its place.
  const none = 'ce.time.step(b, "zz")';
  assert.deepEqual(labels(typed(none, 'lua', none.indexOf('zz') + 2)), []);
  // Forced over a value that is none of the choices, with nothing in it that fits: every choice.
  assert.deepEqual(labels(forced(none, 'lua', none.indexOf('zz') + 2)), DIVISION_NAMES);
});

/* ================================================================================ and not */

test('outside a known value there is nothing, so the editor completes words', () => {
  const src = 'ce.anim.to("Cutoff.value", 100, { curve = "outBack" })';
  const quoted = src.indexOf('"outBack"');
  const none = [
    ['the call\'s name', src.indexOf('anim')],
    ['a number', src.indexOf('100') + 1],
    ['the option\'s key', src.indexOf('curve') + 2],
    ['before the opening quote', quoted],
    ['after the closing quote', quoted + '"outBack"'.length],
    ['the end of the line', src.length],
  ];
  for (const [what, caret] of none) assert.equal(forced(src, 'lua', caret), null, what);
  assert.equal(forced('log("outBack")', 'lua', 6), null, 'free text');
  assert.equal(forced('-- curve = "outBack"', 'lua', 14), null, 'a comment');
  assert.equal(forced('', 'lua', 0), null);
  assert.equal(forced('{ "curve": "outBack" }', 'json', 13), null, 'the panel file view has no completion');
});

test('a value that is not a written string gets no completion: a variable, joined text, interpolation', () => {
  const variable = 'local c = "outBack"\nce.anim.to("x", 1, { curve = c })';
  assert.equal(forced(variable, 'lua', variable.lastIndexOf('c }') + 1), null);
  const joined = 'ce.anim.to("x", 1, { curve = "out" .. "Back" })';
  assert.equal(forced(joined, 'lua', joined.indexOf('out') + 1), null);
  const template = 'ce.anim.to("x", 1, { curve: `${kind}Back` });';
  assert.equal(forced(template, 'javascript', template.indexOf('Back')), null);
  const fstring = 'ce.time.step(b, f"1/{n}")';
  assert.equal(forced(fstring, 'python', fstring.indexOf('1/')), null);
  const unclosed = 'ce.time.step(b, "1/8';
  assert.equal(forced(unclosed, 'lua', unclosed.length), null, 'a string that never closes is still being typed');
  // ce.draw.image takes an image's data, so no image name is offered there.
  const image = 'ce.draw.image("knob-cap", 0, 0, 10, 10)';
  assert.equal(forced(image, 'lua', image.indexOf('knob') + 1), null);
  const asset = 'ce.image.asset("knob-cap")';
  assert.deepEqual(labels(forced(asset, 'lua', asset.indexOf('knob') + 1)), ['knob-cap']);
});

test('other forms of string keep their quotes: Lua\'s long strings, Python\'s raw strings', () => {
  const long = 'ce.anim.to("x", 1, { curve = [[outBack]] })';
  const r = forced(long, 'lua', long.indexOf('Back'));
  assert.deepEqual([r.from, r.to, selectedLabel(r)], [long.indexOf('outBack'), long.indexOf('outBack') + 7, 'outBack']);
  assert.equal(accept(long, r, 'inQuad'), long.replace('outBack', 'inQuad'));
  const raw = "ce.draw.blend(r'screen')";
  const p = forced(raw, 'python', raw.indexOf('screen') + 1);
  assert.deepEqual([p.from, p.to, selectedLabel(p)], [raw.indexOf('screen'), raw.indexOf('screen') + 6, 'screen']);
  assert.equal(accept(raw, p, 'hard-light'), "ce.draw.blend(r'hard-light')");
});

test('a choice that would need other quotes is not offered, and one that needs escaping is escaped', () => {
  const panel = { id: 'q', controls: [createControl('Knob', { name: 'Say "hi"' }), createControl('Knob', { name: 'Plain' })] };
  const dq = 'ce.core.on("Plain", "onClick", f)';
  const r = forced(dq, 'lua', dq.indexOf('Plain') + 1, { panel });
  assert.deepEqual(labels(r), ['Say "hi"', 'Plain']);
  assert.equal(accept(dq, r, 'Say "hi"'), 'ce.core.on("Say \\"hi\\"", "onClick", f)', 'escaped as the literal\'s own quotes need it');
  // A Lua long string cannot hold its own closing bracket written any other way, but a quote is
  // nothing to it; and a Python raw string cannot escape its quote at all, so that name is left out.
  const raw = "ce.core.on(r'Plain', 'onClick', f)";
  const p = forced(raw, 'python', raw.indexOf('Plain') + 1, { panel });
  assert.deepEqual(labels(p), ['Say "hi"', 'Plain']);
  const rawSingle = { id: 'r', controls: [createControl('Knob', { name: "it's" }), createControl('Knob', { name: 'Plain' })] };
  assert.deepEqual(labels(forced(raw, 'python', raw.indexOf('Plain') + 1, { panel: rawSingle })), ['Plain']);
});

test('a read stays well under what a keystroke allows, and a keystroke outside a string costs nothing', (t) => {
  const lines = [];
  for (let i = 0; i < 400; i += 1) lines.push(`ce.anim.to("Cutoff.value", ${i}, { duration = 250, curve = "outBack" })`);
  const src = lines.join('\n');
  const caret = src.lastIndexOf('outBack') + 3;
  const context = CONTEXT();
  forced(src, 'lua', caret, context);
  // Every keystroke is a new source, so each read here is one after an edit, as typing makes it.
  const t0 = performance.now();
  for (let i = 0; i < 20; i += 1) forced(`${src}\n-- ${i}`, 'lua', caret, context);
  const each = (performance.now() - t0) / 20;
  // A keystroke nowhere near a string does not read the statement at all.
  const plain = `${src}\nlocal x = 1`;
  const t1 = performance.now();
  for (let i = 0; i < 200; i += 1) assert.equal(typed(plain, 'lua', plain.length - 2, context), null);
  const outside = (performance.now() - t1) / 200;
  t.diagnostic(`a 400-line script: ${each.toFixed(1)} ms a read after an edit, ${outside.toFixed(3)} ms a keystroke outside a string`);
  // Generous bounds, as the core's own timing test has them, so a slow runner does not fail it.
  assert.ok(each < 250, `${each.toFixed(1)} ms a read of a 400-line script`);
  assert.ok(outside < 2, `${outside.toFixed(3)} ms a keystroke outside any string`);
});

/* ============================================================================== a property path */
// Inside a path, completion lists the segment under the caret, from what the segments before it
// lead to, and an accepted one replaces that segment alone: a path is built a segment at a time.

test('a path is completed a segment at a time, from the panel', () => {
  const start = 'set("", 1)';
  const first = forced(start, 'lua', 5);
  assert.deepEqual(labels(first), ['Cutoff', 'Title', 'Resonance', 'panel']);
  assert.equal(first.options[0].detail, 'Knob');
  assert.equal(first.openEmpty, false, 'nothing opens by itself on an empty path');

  // After "Cutoff." the list is open with nothing typed: the value's forms, the shorthands, the sections.
  const src = 'set("Cutoff.", 1)';
  const second = typed(src, 'lua', src.indexOf('.') + 1);
  assert.equal(second.openEmpty, true);
  assert.deepEqual(labels(second).slice(0, 3), ['value', 'normalizedValue', 'midiValue']);
  assert.ok(labels(second).includes('opacity'), 'a shorthand');
  assert.equal(second.options.find((o) => o.label === 'Parts').detail, 'section', 'a section the knob has');
  // A knob draws with parts and has made no Background; a path into it is still one, from the templates.
  assert.equal(second.options.find((o) => o.label === 'Background').detail, 'section, not made yet');
  assert.ok(labels(second).indexOf('Parts') < labels(second).indexOf('Background'), 'its own sections first');

  // Typed, the list narrows; accepted, the segment alone is written.
  const partial = 'set("Cutoff.Backg", 1)';
  const narrowed = typed(partial, 'lua', partial.indexOf('Backg') + 5);
  assert.deepEqual(labels(narrowed), ['Background']);
  assert.equal(accept(partial, narrowed, 'Background'), 'set("Cutoff.Background", 1)');

  // Deeper, a section's sections and settings, each with its value now.
  const deep = 'set("Cutoff.Background.", 1)';
  const third = typed(deep, 'lua', deep.lastIndexOf('.') + 1);
  assert.ok(labels(third).includes('Fill'), labels(third).join(', '));
  const fill = 'set("Cutoff.Background.Fill.", 1)';
  const fourth = typed(fill, 'lua', fill.lastIndexOf('.') + 1);
  const colour = fourth.options.find((o) => o.label === 'colour');
  assert.ok(colour, labels(fourth).join(', '));
  assert.match(colour.detail, /^"/, 'a setting shows what it holds');
});

test('a segment in the middle is replaced up to its dot, and the one written is selected', () => {
  const src = 'set("Cutoff.Backgound.Fill.colour", "red")';
  const at = src.indexOf('Backgound') + 4;
  const r = forced(src, 'lua', at);
  assert.equal(src.slice(r.from, r.to), 'Backgound', 'the segment under the caret, not the rest of the path');
  assert.equal(accept(src, r, 'Background'), 'set("Cutoff.Background.Fill.colour", "red")');
  const right = 'set("Cutoff.Background.Fill.colour", "red")';
  const sel = forced(right, 'lua', right.indexOf('Fill') + 2);
  assert.equal(selectedLabel(sel), 'Fill');
  // The panel's own settings, and get(), ce.anim.to and JavaScript the same.
  const panel = 'set("panel.", 1)';
  assert.ok(labels(typed(panel, 'lua', panel.indexOf('.') + 1)).length > 0);
  const js = 'ce.anim.to("Resonance.", 1);';
  assert.ok(labels(typed(js, 'javascript', js.indexOf('.', js.indexOf('Resonance')) + 1)).includes('value'));
  const get = 'local v = get("Title.T")';
  assert.ok(labels(typed(get, 'lua', get.indexOf('.T') + 2)).includes('Text'), 'a label has a Text section');
});

test('a self.set path starts at the script\'s own control, and an unknown one lists nothing', () => {
  // Its first segment is the control's: a form of its value, a shorthand or a section.
  const src = 'self.set("", 1)';
  const own = forced(src, 'lua', src.indexOf('"') + 1, { ...CONTEXT(), selfControl: 'Cutoff' });
  assert.ok(own && labels(own).includes('Parts') && labels(own).includes('value'), own && labels(own).join(', '));
  const deeper = 'self.set("Transform.", 1)';
  assert.ok(labels(typed(deeper, 'lua', deeper.indexOf('.', 12) + 1, { ...CONTEXT(), selfControl: 'Cutoff' })).includes('x'));
  assert.equal(forced(src, 'lua', src.indexOf('"') + 1, CONTEXT()), null, 'no control is known for self');
  const nowhere = 'set("Nobody.", 1)';
  assert.equal(typed(nowhere, 'lua', nowhere.indexOf('.') + 1), null);
});
