// builtColours.test.js — a colour a script builds from numbers it writes out, ce.math.hex(r, g, b)
// and ce.math.fromHsl(h, s, l): the call's colour row, its swatch, and the Colors tab's colour
// written back as the call's three numbers, in the form they were written.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readStatement, writeValue } from '../src/CE_Application/scripting/scriptValues.js';
import { statementRows, findArg, meaningLine, madeByChild, swatchHex } from '../src/CE_Application/editor/valueRows.js';
import { createEditSession } from '../src/CE_Application/editor/valueEditSession.js';
import { builtNumbers, buildsColour } from '../src/CE_Application/scripting/builtColours.js';
import { colourFromHsl } from '../src/CE_Application/scripting/scriptColours.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const rowsOf = (src, lang = 'lua') => statementRows(readStatement(src, lang, src.indexOf('(') + 1, {}));
const builtOf = (src, lang = 'lua') => rowsOf(src, lang).find((r) => r.type === 'arg' && r.arg.meaning?.built)?.arg ?? null;
const write = (src, lang, value) => {
  const edit = writeValue(src, lang, builtOf(src, lang), value);
  return edit ? `${src.slice(0, edit.start)}${edit.text}${src.slice(edit.end)}` : null;
};

test('a colour built from numbers written out has a row of its own, with its swatch, under the call', () => {
  const src = 'set("Title.Text.colour", ce.math.hex(255, 128, 0))';
  const rows = rowsOf(src);
  const shape = rows.map((r) => (r.type === 'call' ? `call ${r.call.path}` : `${r.arg.name} ${r.arg.kind}`));
  assert.deepEqual(shape, ['call set', 'path path', 'value computed', 'call ce.math.hex', 'colour colour', 'r unknown', 'g unknown', 'b unknown']);
  const colour = rows[4].arg;
  assert.equal(colour.editable, 'colour');
  assert.deepEqual([colour.meaning.stored, colour.meaning.css, swatchHex(colour.meaning), colour.meaning.takesAlpha], ['#FF8000', '#FF8000', 'FFFF8000', false]);
  assert.equal(meaningLine(colour), '#FF8000, built from red 255, green 128, blue 0');
  // The value it fills shows it too, still: it is edited on the colour row.
  const value = rows[2];
  assert.equal(value.arg.meaning.css, '#FF8000');
  assert.equal(meaningLine(value.arg, { madeBelow: madeByChild(value.call, value.arg) }), 'made by the call below: a colour, #FF8000');
  // The swatch is the colour the runtime makes of the numbers.
  const api = scriptApiForTesting();
  assert.equal(api.ce.math.hex(255, 128, 0), colour.meaning.stored);
  assert.equal(api.ce.math.fromHsl(200, 50, 40), builtOf('ce.math.fromHsl(200, 50, 40)').meaning.stored);
  // Held in range and rounded, as the runtime holds it: 300 is 255.
  assert.equal(builtOf('ce.math.hex(300, -4, 127.6)').meaning.stored, '#FF0080');
});

test('a part not written out, or a call still open, is computed as before', () => {
  assert.equal(builtOf('ce.math.hex(r, 0, 0)'), null);
  assert.equal(builtOf('ce.math.hex(255, 0)'), null, 'a part left out');
  assert.equal(builtOf('ce.math.fromHsl(h * 2, 50, 50)'), null);
  assert.equal(rowsOf('set("Title.Text.colour", ce.math.hex(r, 0, 0))').find((r) => r.arg?.name === 'value').arg.meaning.css, undefined);
  assert.equal(builtOf('ce.math.hex(255, 0, 0').editable, null, 'no editor while the bracket is open');
});

test('the Colors tab\'s colour is written as the three numbers, each in its form, the call as it was', () => {
  assert.equal(write('ce.math.hex(255, 128, 0)', 'lua', 'FF3366CC'), 'ce.math.hex(51, 102, 204)');
  // Hex stays hex, and what is between and around the numbers stays.
  assert.equal(write('ce.math.hex( 0xFF ,0x80,  0 ) -- warm', 'lua', '#3366CC'), 'ce.math.hex( 0x33 ,0x66,  204 ) -- warm');
  assert.equal(write('const c = rgbToHex(255, 128, 0);', 'javascript', '336699'), 'const c = rgbToHex(51, 102, 153);');
  assert.equal(write('ctx.RgbToHex(255, 128, 0);', 'csharp', 'FF000000'), 'ctx.RgbToHex(0, 0, 0);');
  // Python's keywords, in any order: each number goes to its own name.
  assert.equal(write('ce.math.hex(b=0, r=255, g=128)', 'python', 'FF102030'), 'ce.math.hex(b=48, r=16, g=32)');
  // Numbers that already build the colour stay as written: 300 makes 255.
  assert.equal(write('ce.math.hex(300, 0, 0)', 'lua', 'FFFF0000'), 'ce.math.hex(300, 0, 0)');
  // It takes no alpha: a colour that is not solid is refused, and nothing is written.
  assert.equal(write('ce.math.hex(255, 0, 0)', 'lua', '80FF0000'), null);
});

test('hue, saturation and lightness are written to the fewest decimals that build the colour again', () => {
  assert.equal(write('ce.math.fromHsl(30, 100, 50)', 'lua', 'FF3366CC'), 'ce.math.fromHsl(220, 60, 50)');
  // A grey has no hue of its own, so it keeps the one written.
  assert.equal(write('ce.math.fromHsl(30, 100, 50)', 'lua', 'FF808080'), 'ce.math.fromHsl(30, 0, 50)');
  assert.equal(write('ce.math.fromHsl(30, 100, 50)', 'lua', 'FF818181'), 'ce.math.fromHsl(30, 0, 50.6)');
  // Every colour comes back exactly, at no more than three decimals.
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % 256; };
  for (let i = 0; i < 400; i += 1) {
    const rgb = [rand(), rand(), rand()].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    const numbers = builtNumbers('hsl', rgb, [0]);
    assert.ok(buildsColour('hsl', numbers, rgb), `${rgb} from ${numbers}`);
    assert.equal(colourFromHsl(...numbers), `#${rgb}`);
    for (const n of numbers) assert.ok(Number(n.toFixed(3)) === n, `${n} has more than three decimals`);
  }
});

test('an edit session over the colour row writes once it settles, and reads the colour row back', () => {
  const src = 'ce.draw.fill(ce.math.hex(255, 128, 0))\n';
  const editor = { text: src };
  const arg = builtOf(src);
  const session = createEditSession({
    source: src, language: 'lua', arg, writeValue,
    write: (start, end, text) => { editor.text = editor.text.slice(0, start) + text + editor.text.slice(end); return editor.text; },
    reread: (s, start) => findArg(readStatement(s, 'lua', start, {}), start, 'colour'),
  });
  session.preview('FF3366CC');
  session.done();
  assert.equal(editor.text, 'ce.draw.fill(ce.math.hex(51, 102, 204))\n');
  // A second edit opens on what the first wrote; Cancel puts back the characters there were.
  const again = createEditSession({
    source: editor.text, language: 'lua', arg: builtOf(editor.text), writeValue,
    write: (start, end, text) => { editor.text = editor.text.slice(0, start) + text + editor.text.slice(end); return editor.text; },
    reread: (s, start) => findArg(readStatement(s, 'lua', start, {}), start, 'colour'),
  });
  again.preview('FF000000');
  again.done();
  assert.equal(editor.text, 'ce.draw.fill(ce.math.hex(0, 0, 0))\n');
  const undo = createEditSession({
    source: editor.text, language: 'lua', arg: builtOf(editor.text), writeValue,
    write: (start, end, text) => { editor.text = editor.text.slice(0, start) + text + editor.text.slice(end); return editor.text; },
    reread: (s, start) => findArg(readStatement(s, 'lua', start, {}), start, 'colour'),
  });
  undo.commit('FFFFFFFF');
  assert.equal(editor.text, 'ce.draw.fill(ce.math.hex(255, 255, 255))\n');
  undo.cancel();
  assert.equal(editor.text, 'ce.draw.fill(ce.math.hex(0, 0, 0))\n');
});
