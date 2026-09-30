// panelFormat.test.js — the .cepanel format version, its migrations, and the schema check on open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PANEL_FORMAT_VERSION, migratePanelDocument, panelFormatVersion, readPanelDocument, validatePanelDocument,
} from '../src/CE_Application/utils/panelFormat.js';
import { buildPanelValidatorSource, OUT } from '../scripts/generate-panel-validator.mjs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, deserializePanel, panelOpenReport, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function committedPanels() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'build', 'export-out'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.cepanel')) found.push(full);
    }
  };
  walk(REPO);
  return found;
}

test('the committed validator is generated from the current schema', () => {
  assert.equal(readFileSync(OUT, 'utf8'), buildPanelValidatorSource(),
    'src/CE_Application/generated/panelDocumentValidator.js is stale — run `npm run gen:panel-validator`');
});

test('every committed panel passes the schema', () => {
  const panels = committedPanels();
  assert.ok(panels.length > 20, `expected the repo's panels, found ${panels.length}`);
  for (const file of panels) {
    const read = readPanelDocument(readFileSync(file, 'utf8'));
    assert.equal(read.error, null, `${path.relative(REPO, file)}: ${read.error}`);
  }
});

test('a document with no formatVersion is version 1, and nonsense reads as 1', () => {
  assert.equal(panelFormatVersion({}), 1);
  assert.equal(panelFormatVersion({ formatVersion: 'two' }), 1);
  assert.equal(panelFormatVersion({ formatVersion: 0 }), 1);
  assert.equal(panelFormatVersion({ formatVersion: 2 }), 2);
});

const dotted = () => ({
  controls: [{ _type: 'Knob', _children: { Core: { id: 'k1', name: 'tone1.lfo.rate' } } }],
  scripts: [{ id: 's', language: 'lua', source: '', target: 'tone1.lfo.rate' }],
});

test('a version-1 document runs the chain once and says it changed', () => {
  const input = dotted();
  const before = JSON.stringify(input);
  const result = migratePanelDocument(input);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.toVersion, PANEL_FORMAT_VERSION);
  assert.deepEqual(result.applied, [1]);
  assert.equal(result.changed, true);
  assert.equal(result.doc.controls[0]._children.Core.name, 'tone1_lfo_rate');
  assert.equal(result.doc.scripts[0].target, 'tone1_lfo_rate', 'references move with the name');
  assert.equal(JSON.stringify(input), before, 'the input is never mutated');
});

test('a version-1 document the steps leave alone is not reported as changed', () => {
  const input = { controls: [{ _type: 'Knob', _children: { Core: { name: 'cutoff' } } }] };
  const result = migratePanelDocument(input);
  assert.equal(result.changed, false);
  assert.equal(result.doc, input);
  assert.equal(result.toVersion, PANEL_FORMAT_VERSION);
});

test('a current document runs no steps', () => {
  const input = { ...dotted(), formatVersion: PANEL_FORMAT_VERSION };
  const result = migratePanelDocument(input);
  assert.deepEqual(result.applied, []);
  assert.equal(result.doc, input);
});

test('steps run in order, each from the version it is registered under', () => {
  const seen = [];
  const migrations = {
    1: (doc) => { seen.push(1); return { ...doc, a: true }; },
    2: (doc) => { seen.push(2); return { ...doc, b: doc.a === true }; },
  };
  const result = migratePanelDocument({}, { migrations, target: 3 });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.doc.b, true, 'step 2 saw step 1\'s output');
  assert.equal(result.toVersion, 3);
  const fromTwo = migratePanelDocument({ formatVersion: 2 }, { migrations, target: 3 });
  assert.deepEqual(fromTwo.applied, [2]);
});

test('a document from a newer CEditor opens, with a warning, untouched', () => {
  const input = { formatVersion: PANEL_FORMAT_VERSION + 1, controls: [], somethingNew: { x: 1 } };
  const result = migratePanelDocument(input);
  assert.equal(result.doc, input);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /newer CEditor/);
});

test('broken documents are refused with the path of what is wrong', () => {
  const cases = [
    [{ controls: {} }, /controls: must be array/],
    [{ controls: [{ _children: {} }] }, /controls\/0: is missing "_type"/],
    [{ controls: [{ _type: '   ' }] }, /controls\/0\/_type: must not be empty/],
    [{ controls: [{ _type: 'Knob', _children: { Core: 'x' } }] }, /controls\/0\/_children\/Core: must be object/],
    [{ scripts: [{ source: 12 }] }, /scripts\/0\/source: must be string/],
    [{ layers: ['one'] }, /layers\/0: must be object/],
    [{ fonts: [{ family: 'Inter', data: 'https://example.com/inter.woff2' }] }, /fonts\/0\/data: must be a data: URL/],
    [{ width: -5 }, /width: must be >= 0/],
  ];
  for (const [doc, pattern] of cases) {
    const read = readPanelDocument(JSON.stringify(doc));
    assert.equal(read.doc, null, JSON.stringify(doc));
    assert.match(read.error, pattern);
  }
});

test('every problem is listed, not only the first', () => {
  const { errors } = validatePanelDocument({ controls: [{}, {}, { _type: 1 }], width: 'wide' });
  assert.equal(errors.length, 4, errors.join('\n'));
});

test('unknown keys are allowed everywhere', () => {
  assert.equal(validatePanelDocument({ future: 1, controls: [{ _type: 'Knob', extra: [], _children: { NewSection: {} } }] }).ok, true);
});

test('not JSON, and JSON that is not an object, say so', () => {
  assert.match(readPanelDocument('{').error, /not valid JSON/);
  assert.match(readPanelDocument('[1]').error, /does not contain a panel/);
});

test('a saved panel carries the current format version, first', () => {
  const panel = createPanel('versioned');
  panel.controls = [createControl('Knob', { Core: { id: 'k' } })];
  const json = serializePanel(panel);
  assert.equal(Object.keys(JSON.parse(json))[0], 'formatVersion');
  assert.equal(JSON.parse(json).formatVersion, PANEL_FORMAT_VERSION);
});

test('saving a newer document keeps its number', () => {
  const panel = { ...createPanel('newer'), formatVersion: PANEL_FORMAT_VERSION + 3 };
  assert.equal(JSON.parse(serializePanel(panel)).formatVersion, PANEL_FORMAT_VERSION + 3);
});

test('opening converts an old document, marks it modified, and reports the reason on failure', () => {
  const opened = deserializePanel(JSON.stringify(dotted()), null, 'old');
  assert.ok(opened);
  assert.equal(opened.modified, true);
  assert.equal(opened.formatVersion, PANEL_FORMAT_VERSION);
  assert.equal(opened.controls[0]._children.Core.name, 'tone1_lfo_rate');

  const current = deserializePanel(JSON.stringify({ formatVersion: PANEL_FORMAT_VERSION, controls: [] }), null, 'new');
  assert.equal(current.modified, false);

  assert.equal(deserializePanel(JSON.stringify({ controls: [{ _children: {} }] }), null, 'bad'), null);
  assert.match(panelOpenReport().error, /controls\/0: is missing "_type"/);
});
