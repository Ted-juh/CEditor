// jsonText.test.js — JSON laid out for a person, and a person's JSON mistakes located.
//
// formatJson has to give back exactly the value it was made from, whatever it lays on one line;
// jsonSyntaxError has to find the line on every platform, since JavaScriptCore's JSON.parse message
// carries none; jsonFoldRegions feeds the editor's gutter.

import test from 'node:test';
import assert from 'node:assert/strict';

import { formatJson, jsonFoldRegions, jsonSyntaxError } from '../src/CE_Application/utils/jsonText.js';

test('a value comes back from its text exactly, key order included', () => {
  const value = {
    _type: 'Control',
    _children: {
      Core: { name: 'cutoff', id: 'k1', controlType: 'Knob' },
      Transform: { x: 28, y: 118, width: 120, height: 53 },
      Value: { steps: [0, 0.25, 0.5, 1], labels: ['low', 'high'], nested: { deep: { deeper: [{ a: 1 }, { b: [2, 3] }] } } },
      Text: { content: 'a "quoted" line\nand another', empty: '', emptyList: [], emptyObject: {} },
    },
    zeta: null, alpha: true, minus: -1.5e-7,
  };
  const text = formatJson(value);
  assert.equal(JSON.stringify(JSON.parse(text)), JSON.stringify(value));
  // As JSON keeps it: an undefined property is not there, and in a list it reads null.
  assert.deepEqual(JSON.parse(formatJson({ a: undefined, b: [undefined, 1] })), { b: [null, 1] });
});

test('what fits stays on one line; the outermost value and what does not fit open up', () => {
  const text = formatJson({ Transform: { x: 28, y: 118, width: 120, height: 53 }, Long: { list: Array.from({ length: 40 }, (_, i) => i) } });
  const lines = text.split('\n');
  assert.equal(lines[0], '{', 'the outermost object always opens');
  assert.ok(lines.includes('  "Transform": { "x": 28, "y": 118, "width": 120, "height": 53 },'), text);
  assert.ok(lines.some((line) => line.trim() === '"list": ['), 'a list too long for the line is broken over lines');
  assert.ok(lines.every((line) => line.length <= 80), 'nothing passes the width when it can be broken');
  assert.equal(formatJson({ a: { b: 1 } }, { width: 10 }).split('\n').length, 5, 'a narrower width opens more');
});

test('a mistake is found at its line and column, with a sentence a person can act on', () => {
  const at = (text) => { const e = jsonSyntaxError(text); return e && [e.line, e.col, e.message]; };
  assert.equal(jsonSyntaxError('{\n  "a": [1, 2],\n  "b": { "c": null }\n}'), null, 'valid JSON has no mistake');
  assert.deepEqual(at('{\n  "a": 1,\n}').slice(0, 2), [3, 1]);
  assert.match(at('{\n  "a": 1,\n}')[2], /comma before "}"/);
  assert.deepEqual(at('[1, 2,]').slice(0, 2), [1, 7]);
  assert.deepEqual(at('{\n  "a": 1\n  "b": 2\n}').slice(0, 2), [3, 3], 'a missing comma, at the next property');
  assert.match(at("{ 'a': 1 }")[2], /double quotes/);
  assert.match(at('{ "a": \'x\' }')[2], /double quotes/);
  assert.deepEqual(at('{ "a": "open\n}').slice(0, 2), [1, 8], 'an unclosed string, where it opened');
  assert.match(at('{ "a": 01 }')[2], /after the number/);
  assert.match(at('{ "a": tru }')[2], /Expected a value/);
  assert.match(at('{ "a": 1 } x')[2], /after the end/);
  assert.match(at('{ "a": "\\q" }')[2], /escape/);
  assert.match(at('')[2], /Expected a value/);
});

test('every object and list over several lines folds, brackets in strings aside', () => {
  const text = '{\n  "a": {\n    "s": "} not a close {",\n    "b": [\n      1\n    ]\n  },\n  "c": { "one": 1 }\n}';
  assert.deepEqual(jsonFoldRegions(text), [
    { startLine: 1, endLine: 9 },
    { startLine: 2, endLine: 7 },
    { startLine: 4, endLine: 6 },
  ]);
});
