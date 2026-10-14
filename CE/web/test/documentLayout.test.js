// documentLayout.test.js — a .cepanel is written one line per control section.
//
// The layout is only whitespace, so the first thing to hold is that it changes nothing a reader sees.
// The second is the reason for its shape: an edit lands on the line that holds it, so a panel's git
// history stays readable at a third of the size.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { panelDocumentText } from '../src/CE_Application/stores/documentLayout.js';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GAIA = 'CE/panels/Roland GAIA SH-01.cepanel';
const AN1X = 'CE/panels/Yamaha AN1x.cepanel';

const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);

/** Every control, containers' children included, with the depth it sits at. */
function* everyControl(controls, depth = 0) {
  for (const control of controls ?? []) {
    yield [control, depth];
    yield* everyControl(Object.values(control?._children?.Children?._children ?? {}), depth + 1);
  }
}

test('the text reads back as the same document, saved and complete', () => {
  for (const rel of [GAIA, AN1X]) {
    const panel = open(rel);
    for (const elide of [true, false]) {
      const text = serializePanel(panel, { elide });
      const doc = JSON.parse(text);
      assert.deepEqual(JSON.parse(panelDocumentText(doc)), doc, `${rel} (elide ${elide}) reads differently`);
      assert.equal(panelDocumentText(doc), text, 'laying out a laid-out document again changes nothing');
    }
  }
});

test('each section of each control is one line, nested controls and parts included', () => {
  const text = serializePanel(open(GAIA));
  const lines = new Set(text.split('\n').map((line) => line.trim().replace(/,$/, '')));
  const doc = JSON.parse(text);
  let sections = 0;
  let parts = 0;
  let nested = 0;
  for (const [control, depth] of everyControl(doc.controls)) {
    if (depth > 0) nested++;
    for (const [name, section] of Object.entries(control._children)) {
      if (name === 'Children') continue;
      if (name === 'Parts') {
        for (const [partName, part] of Object.entries(section._children ?? {})) {
          assert.ok(lines.has(`${JSON.stringify(partName)}: ${JSON.stringify(part)}`),
            `part ${partName} of ${control._children.Core?.id} is not on a line of its own`);
          parts++;
        }
        continue;
      }
      assert.ok(lines.has(`${JSON.stringify(name)}: ${JSON.stringify(section)}`),
        `${name} of ${control._children.Core?.id} is not on one line`);
      sections++;
    }
  }
  assert.ok(nested > 800 && sections > 4000 && parts > 3000,
    `the GAIA panel should exercise all three: ${nested} nested controls, ${sections} sections, ${parts} parts`);
});

test('everything outside the controls keeps the layout it had', () => {
  const doc = JSON.parse(serializePanel(open(GAIA)));
  const before = JSON.stringify({ ...doc, controls: [] }, null, 2);
  const after = panelDocumentText({ ...doc, controls: [] });
  assert.equal(after, before);
});

test('an edit is one changed line', () => {
  const panel = open(GAIA);
  const before = serializePanel(panel).split('\n');
  // A button inside a container, so the line is found at depth and not only at the top.
  const [button] = [...everyControl(panel.controls)]
    .find(([c, depth]) => depth > 0 && c._children.Core.controlType === 'Button') ?? [];
  assert.ok(button, 'the GAIA panel has a button inside a container');
  button._children.Transform.x += 7;
  const after = serializePanel(panel).split('\n');
  assert.equal(after.length, before.length, 'moving a control adds or removes no lines');
  const changed = after.filter((line, i) => line !== before[i]);
  assert.equal(changed.length, 1, `moving one button changed ${changed.length} lines`);
  assert.match(changed[0], /^\s+"Transform": \{/);
});

test('it writes what JSON.stringify would, wherever it lays out the value itself', () => {
  const doc = {
    formatVersion: 2,
    gone: undefined,
    fn() {},
    controls: [
      { _type: 'Control', skipped: undefined, _children: { Core: { id: 'a', when: new Date(0) }, Empty: {} } },
      { _type: 'Control', _children: { Children: { _type: 'Children', _children: {} }, Parts: { _children: {} } } },
    ],
    empty: [],
  };
  const text = panelDocumentText(doc);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(doc)));
  assert.equal(panelDocumentText({ controls: [] }), '{\n  "controls": []\n}');
  assert.equal(panelDocumentText({}), '{}');
});
