// textOutline.test.js — text as glyph outlines (utils/textOutline.js) from the font file itself
// (utils/fontSources.js): the right face for each character, variable fonts at their weight, the
// metric twins for Arial / Times / Courier, and the layout of InteractivePartRenderer's text box.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PANEL_FONT_FACES } from '../src/CE_Application/models/panelFontFaces.js';
import { FontUnavailableError, matchPanelFace, primaryFamily, resolveFont } from '../src/CE_Application/utils/fontSources.js';
import { textOutline } from '../src/CE_Application/utils/textOutline.js';

const text = (content, font = {}, extra = {}) => ({
  kind: 'rectangle',
  _children: { Text: { content, _children: { Font: { family: 'Rubik', size: 20, ...font }, Position: { justification: extra.justification ?? 'centred' }, ...(extra.multiline ? { Multiline: { maxLines: 3, lineHeight: 1.2 } } : {}) } } },
});
function extent(pathData) {
  const numbers = pathData.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

test('the face table is panelFonts.css, rule for rule', () => {
  const css = readFileSync(new URL('../src/assets/fonts/panelFonts.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const get = (key) => body.match(new RegExp(`${key}\\s*:\\s*([^;]+);`))?.[1].trim();
    const [low, high = low] = get('font-weight').split(/\s+/).map(Number);
    return {
      family: get('font-family').replace(/['"]/g, ''),
      style: get('font-style'),
      weight: [low, high],
      file: body.match(/url\('\.\/([^']+)\.woff2'\)/)[1],
      unicodeRange: get('unicode-range'),
    };
  });
  assert.deepEqual(PANEL_FONT_FACES, rules);
});

test('faces are matched as the browser matches them: style, weight, and the subset for the character', () => {
  assert.equal(matchPanelFace('Barlow', 700, 'normal').face.file, 'barlow-700-latin');
  assert.equal(matchPanelFace('Barlow', 650, 'normal').face.weight[0], 600, 'the nearest cut');
  assert.equal(matchPanelFace('DM Sans', 400, 'normal', 'ő'.codePointAt(0)).face.file, 'dm-sans-var-latin-ext');
  assert.equal(matchPanelFace('DM Sans', 400, 'italic').synthesizedItalic, true, 'no italic cut: the browser slants it');
  assert.equal(primaryFamily("'Space Grotesk', sans-serif"), 'Space Grotesk');
  assert.equal(primaryFamily('sans-serif'), 'Arial');
});

test('system families: Arial, Times and Courier through their metric twins; others refused by name', async () => {
  assert.equal((await resolveFont('Arial', { weight: 700 })).key, 'twin:liberation-sans-bold');
  assert.equal((await resolveFont('Times New Roman', { style: 'italic' })).key, 'twin:liberation-serif-italic');
  assert.equal((await resolveFont('Courier New')).key, 'twin:liberation-mono-regular');
  await assert.rejects(resolveFont('Verdana'), (error) => error instanceof FontUnavailableError && /Verdana/.test(error.message));
});

test('a variable face draws the weight asked for', async () => {
  const light = await textOutline(text('Hi', { weightValue: 400 }), 200, 40);
  const heavy = await textOutline(text('Hi', { weightValue: 800 }), 200, 40);
  assert.equal(light.fonts[0], 'panel:rubik-var-latin');
  assert.notEqual(light.pathData, heavy.pathData);
  const width = (outline) => { const e = extent(outline.pathData); return e.right - e.left; };
  assert.ok(width(heavy) > width(light), 'bolder is wider');
});

test('laid out as the text box lays it out: justification, padding, spacing, case, wrapping', async () => {
  const at = async (justification) => extent((await textOutline(text('Hi', {}, { justification }), 200, 40)).pathData);
  const left = await at('left');
  const centre = await at('centred');
  const right = await at('right');
  assert.ok(left.left >= 8 && left.left < 12, `left, inside the 8px padding: ${left.left}`);
  assert.ok(right.right <= 192 && right.right > 186, `right: ${right.right}`);
  assert.ok(Math.abs((centre.left + centre.right) / 2 - 100) < 3, 'centred');
  assert.ok(centre.top > 10 && centre.bottom < 30, 'centred vertically in the 40px box');

  const tight = extent((await textOutline(text('HH'), 200, 40)).pathData);
  const spaced = extent((await textOutline(text('HH', { letterSpacing: 10 }), 200, 40)).pathData);
  assert.ok(spaced.right - spaced.left > tight.right - tight.left + 8, 'letter-spacing opens the pair');

  const upper = await textOutline(text('hi', { caseMode: 'uppercase' }), 200, 40);
  assert.equal(upper.pathData, (await textOutline(text('HI'), 200, 40)).pathData);

  const wrapped = extent((await textOutline(text('one two three four', {}, { multiline: true }), 90, 90)).pathData);
  const single = extent((await textOutline(text('one'), 90, 90)).pathData);
  assert.ok(wrapped.bottom - wrapped.top > (single.bottom - single.top) * 2, 'several lines');
  assert.ok(wrapped.right <= 90 && wrapped.left >= 0, 'within the box');
});

test('empty text is no outline', async () => {
  assert.equal((await textOutline(text('   '), 100, 20)).pathData, '');
});
