// panelWholeFile.test.js — the whole file, as the panel file view shows it to read.
//
// What has to hold: the text is the document Save writes, laid out (it parses back to exactly that);
// every control in it, at any depth, is found at the lines that are it, so the outline can go there;
// a line is placed in the innermost control holding it, else the section, else the panel settings;
// and an embedded image is shortened to a placeholder rather than written as one enormous line.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { wholeFileItemAt, wholeFileText } from '../src/CE_Application/stores/panelFileText.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);
const kids = (control) => Object.values(control?._children?.Children?._children ?? {}).filter((child) => child?._children?.Core);
function* everyControl(controls) {
  for (const control of controls ?? []) { yield control; yield* everyControl(kids(control)); }
}
// A document with its embedded values (and the placeholders standing for them) set aside.
const withoutData = (value) => JSON.parse(JSON.stringify(value, (key, v) => (typeof v === 'string'
  && ((v.startsWith('data:') && v.length > 160) || (v.startsWith('‹') && v.includes('shortened here'))) ? '(embedded)' : v)));
const PANELS = ['CE/panels/Roland GAIA SH-01.cepanel', 'CE/panels/Yamaha AN1x.cepanel',
  ...['01-components', '03-states', '06-roland-gaia', '07-packages', '08-export', '09-custom-stress'].map((n) => `CE/qa/QA-${n}.cepanel`)];

test('the whole file is the saved document, and every control is at the lines that are it', () => {
  for (const rel of PANELS) {
    const saved = serializePanel(open(rel));
    const doc = JSON.parse(saved);
    const whole = wholeFileText(saved);
    const lines = whole.text.split('\n');
    assert.equal(whole.lineCount, lines.length);
    assert.deepEqual(withoutData(JSON.parse(whole.text)), withoutData(doc), `${rel}: the text is the document`);

    let count = 0;
    for (const control of everyControl(doc.controls)) {
      const id = control._children.Core.id;
      const span = whole.controls.get(id);
      assert.ok(span, `${rel}: ${id} is found`);
      const piece = lines.slice(span.start - 1, span.end).join('\n').trim().replace(/,$/, '').replace(/^"[^"]*": /, '');
      assert.deepEqual(withoutData(JSON.parse(piece)), withoutData(control), `${rel}: ${id}'s lines are it`);
      assert.deepEqual(wholeFileItemAt(whole, span.start), { kind: 'control', id }, `${rel}: ${id}'s first line is in it`);
      count++;
    }
    assert.equal(whole.controls.size, count, `${rel}: nothing else is taken for a control`);
  }
});

test('a line is in the innermost control holding it, else its section, else the panel settings', () => {
  const whole = wholeFileText(serializePanel(open('CE/panels/Roland GAIA SH-01.cepanel')));
  const tone1 = whole.controls.get('tone1');
  const cutoff = whole.controls.get('gaia_tone1_filter_cutoff_342');
  assert.ok(tone1.start < cutoff.start && cutoff.end < tone1.end, 'the cutoff is inside tone1');
  assert.deepEqual(wholeFileItemAt(whole, cutoff.start + 3), { kind: 'control', id: 'gaia_tone1_filter_cutoff_342' });
  assert.deepEqual(wholeFileItemAt(whole, tone1.start + 1), { kind: 'control', id: 'tone1' });

  assert.deepEqual(wholeFileItemAt(whole, 1), { kind: 'panel' });
  const scripts = whole.sections.find((s) => s.key === 'scripts');
  assert.deepEqual({ name: scripts.name, count: scripts.count }, { name: 'Scripts', count: 232 });
  assert.deepEqual(wholeFileItemAt(whole, scripts.start + 1), { kind: 'section', key: 'scripts', name: 'Scripts' });
  const drawings = whole.sections.find((s) => s.key === 'drawings');
  assert.equal(drawings.count, Object.keys(JSON.parse(serializePanel(open('CE/panels/Roland GAIA SH-01.cepanel'))).drawings).length,
    'a map of drawings counts its entries');
  const settings = whole.sections.find((s) => s.key === 'exportSettings');
  assert.deepEqual(wholeFileItemAt(whole, settings.start + 1), { kind: 'panel' }, 'a setting with a section of its own is a panel setting');
  assert.equal(whole.sections.find((s) => s.key === 'notepad')?.count ?? null, null, 'the notes are no list of entries');
});

test('an embedded image is shortened to a placeholder, and the rest of the file is as it was', () => {
  const image = `data:image/png;base64,${'A'.repeat(40000)}`;
  const panel = createPanel('pictures');
  panel.controls = [createControl('Image', { Core: { id: 'pic', name: 'pic' }, Background: { _children: { Fill: { imageSrc: image } } } })];
  const saved = JSON.parse(serializePanel(panel));
  const whole = wholeFileText(saved);
  assert.equal(whole.shortened, 1);
  assert.ok(!whole.text.includes('AAAA'), 'the image is not in the text');
  assert.ok(whole.text.includes('‹image/png, 39 KB — shortened here #1›'), whole.text.slice(0, 400));
  assert.ok(whole.text.split('\n').every((line) => line.length < 400), 'no line is the image');
  assert.ok(whole.controls.has('pic'));
});
