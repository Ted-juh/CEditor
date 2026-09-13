// publicApiModel.test.js — the API tab's model.
//
// The headline tests are the disagreement ones. Three places in the application answer "will a
// consumer see this published entry?" and they do not agree; the tab gives the author the answer
// that actually decides it. Rather than assert that from prose, the tests below run the shipped
// package validator and the shipped path resolver side by side and show where they part company —
// including on the contract the application's own factory ships.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_KINDS,
  API_MAP_BY_KIND,
  API_KIND_META,
  API_TYPES,
  API_COLUMNS,
  entryPath,
  rowKey,
  parseRowKey,
  targetOf,
  readContract,
  describeRow,
  rowIssue,
  contractRows,
  attachValidation,
  sortRows,
  rangeText,
  contractCounts,
  rowFields,
  isNumericApiType,
  isEnumApiType,
  allApiFieldLabels,
  cleanEntryName,
  uniqueEntryName,
  newEntryShape,
} from '../src/CE_Application/utils/publicApiModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  createCustomComponentPartsDefaults,
  createCustomComponentPublishedPropertiesDefaults,
} from '../src/CE_Application/utils/customComponentFactory.js';
import { validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

function component(published = {}) {
  const control = createControl('CustomComponent');
  control._children.Parts = createCustomComponentPartsDefaults();
  control._children.PublishedProperties = {
    _type: 'PublishedProperties',
    inputs: {},
    outputs: {},
    editableProperties: {},
    ...published,
  };
  return control;
}

const channelNames = (control) => Object.keys(control._children.ValueChannels?._children ?? {});

// --- The disagreement -------------------------------------------------------

test('a path the package validator passes can still be dropped by the instance panel', () => {
  // The validator checks the FIRST segment of a path and passes everything after it, so a real
  // part with a nonsense leaf is "valid" to it. The consumer view resolves the whole path.
  const control = component({
    editableProperties: {
      bogus: { enabled: true, label: 'Bogus', type: 'color', path: 'Parts.background.Background.Fill.nonsenseKey' },
    },
  });

  const pathMessages = [...validateCustomComponentPackage(control).issues]
    .filter((message) => /Editable property .* target/.test(message));
  assert.deepEqual(pathMessages, [], 'the package validator says nothing about this path');

  const issue = rowIssue(contractRows(control)[0], control);
  assert.equal(issue?.status, 'unresolvedPath', 'and the tab is the one that says it');
  assert.match(issue.message, /does not resolve/);
});

test('a path that does resolve is not flagged', () => {
  const control = component({
    editableProperties: {
      colour: { enabled: true, label: 'Colour', type: 'color', path: 'Parts.background.Background.Fill.colour' },
    },
  });
  assert.equal(contractRows(control)[0].issue, null);
});

test('the shipped default contract carries an input no consumer can see', () => {
  // createCustomComponentPublishedPropertiesDefaults publishes `accentColour` against a `variable`
  // rather than a channel. Nothing in the application reads `variable`: the instance panel tests
  // `entry.channel` only, and package validation does not mention it.
  const control = component(createCustomComponentPublishedPropertiesDefaults());
  const rows = contractRows(control);
  const accent = rows.find((row) => row.name === 'accentColour');
  assert.ok(accent, 'the default contract still has this entry');
  assert.equal(accent.targetField, 'variable');
  assert.equal(accent.issue?.status, 'legacyVariable');

  const said = validateCustomComponentPackage(control).issues
    .concat(validateCustomComponentPackage(control).warnings)
    .filter((message) => message.includes('accentColour'));
  assert.deepEqual(said, [], 'and nothing else in the application mentions it');
});

test('a variable target offers the channel of the same name when there is one', () => {
  const control = component({
    inputs: { mainValue: { enabled: true, label: 'Main', type: 'float', variable: 'mainValue' } },
  });
  assert.ok(channelNames(control).includes('mainValue'), 'the fixture needs that channel');
  const issue = contractRows(control)[0].issue;
  assert.equal(issue.status, 'legacyVariable');
  assert.deepEqual(issue.fix, { field: 'channel', value: 'mainValue' });
  assert.match(issue.fixLabel, /mainValue/);
});

test('a channel that does not exist is a different fault from one that was never set', () => {
  const control = component({
    inputs: {
      empty: { enabled: true, label: 'Empty', type: 'float', channel: '' },
      gone: { enabled: true, label: 'Gone', type: 'float', channel: 'noSuchChannel' },
    },
  });
  const rows = contractRows(control);
  assert.equal(rows.find((r) => r.name === 'empty').issue.status, 'noTarget');
  assert.equal(rows.find((r) => r.name === 'gone').issue.status, 'missingChannel');
});

test('a disabled entry is switched off, not broken', () => {
  const control = component({
    inputs: { off: { enabled: false, label: 'Off', type: 'float', channel: 'noSuchChannel' } },
  });
  assert.equal(contractRows(control)[0].issue, null);
});

// --- The contract as one list -----------------------------------------------

test('all three maps come back as one list, tagged by direction', () => {
  const control = component({
    inputs: { a: { channel: 'mainValue', type: 'float' } },
    outputs: { b: { channel: 'mode', type: 'enum' } },
    editableProperties: { c: { path: 'Core.name', type: 'text' } },
  });
  const rows = readContract(control);
  assert.deepEqual(rows.map((row) => row.kind), ['input', 'output', 'property']);
  assert.deepEqual(rows.map((row) => row.name), ['a', 'b', 'c']);
});

test('an input and a property of the same name stay separable', () => {
  const control = component({
    inputs: { size: { channel: 'mainValue', type: 'float' } },
    editableProperties: { size: { path: 'Core.name', type: 'text' } },
  });
  const keys = readContract(control).map((row) => row.key);
  assert.equal(new Set(keys).size, 2);
  assert.deepEqual(parseRowKey(keys[0]), { kind: 'input', name: 'size' });
});

test('a key round-trips even when the name contains a colon', () => {
  assert.deepEqual(parseRowKey(rowKey('property', 'odd:name')), { kind: 'property', name: 'odd:name' });
  assert.equal(parseRowKey('nonsense'), null);
  assert.equal(parseRowKey('fonts:x'), null);
});

test('the write path matches what the shipped editor writes', () => {
  assert.equal(entryPath('input', 'gain', 'label'), 'PublishedProperties.inputs.gain.label');
  assert.equal(entryPath('output', 'level'), 'PublishedProperties.outputs.level');
  assert.equal(entryPath('property', 'caption', 'path'), 'PublishedProperties.editableProperties.caption.path');
  assert.equal(entryPath('nope', 'x', 'y'), '');
});

test('the maps named here are the maps the section actually defines', () => {
  const defaults = SECTION_DEFAULTS.PublishedProperties;
  for (const kind of API_KINDS) {
    assert.ok(Object.hasOwn(defaults, API_MAP_BY_KIND[kind]), `${API_MAP_BY_KIND[kind]} is not on the section`);
  }
});

test('readContract ignores entries that are not entries', () => {
  const control = component({ inputs: { broken: null, gone: 'nope' } });
  assert.deepEqual(readContract(control), []);
  assert.deepEqual(readContract(null), []);
});

// --- Sorting and reading ----------------------------------------------------

const sortable = [
  describeRow('property', 'zeta', { path: 'Core.name', type: 'text', enabled: true }),
  describeRow('input', 'beta', { channel: 'b', type: 'int', min: 5, max: 9, enabled: false }),
  describeRow('input', 'alpha', { channel: 'a', type: 'float', min: 0, max: 1, enabled: true }),
  describeRow('output', 'gamma', { channel: 'c', type: 'bool', enabled: true }),
];

test('sorting by name is a total order, so an unrelated rename cannot reshuffle it', () => {
  assert.deepEqual(sortRows(sortable, 'name').map((r) => r.name), ['alpha', 'beta', 'gamma', 'zeta']);
  assert.deepEqual(sortRows(sortable, 'name', 'desc').map((r) => r.name), ['zeta', 'gamma', 'beta', 'alpha']);
});

test('sorting by direction groups inputs, then outputs, then properties', () => {
  assert.deepEqual(sortRows(sortable, 'kind').map((r) => r.kind), ['input', 'input', 'output', 'property']);
  assert.deepEqual(sortRows(sortable, 'kind').map((r) => r.name), ['alpha', 'beta', 'gamma', 'zeta']);
});

test('ties break the same way every time', () => {
  const once = sortRows(sortable, 'enabled').map((r) => r.key);
  const twice = sortRows([...sortable].reverse(), 'enabled').map((r) => r.key);
  assert.deepEqual(once, twice, 'a stable order must not depend on the input order');
});

test('an unknown column falls back rather than throwing', () => {
  assert.equal(sortRows(sortable, 'nonsense').length, sortable.length);
});

test('the range column reads for every kind of type', () => {
  assert.equal(rangeText(sortable[2]), '0 … 1');
  assert.equal(rangeText(describeRow('input', 'x', { type: 'float' })), '—');
  assert.equal(rangeText(describeRow('input', 'x', { type: 'float', min: 0 })), '0 … ?');
  assert.equal(rangeText(describeRow('input', 'x', { type: 'enum', values: ['a', 'b'] })), '2 values');
  assert.equal(rangeText(describeRow('input', 'x', { type: 'text' })), '');
});

test('the counts say how big the contract is and how much of it is dropped', () => {
  const control = component({
    inputs: { a: { channel: 'mainValue', type: 'float', enabled: true }, b: { channel: 'gone', type: 'float', enabled: true } },
    outputs: { c: { channel: 'mode', type: 'enum', enabled: false } },
  });
  const counts = contractCounts(contractRows(control));
  assert.equal(counts.total, 3);
  assert.equal(counts.input, 2);
  assert.equal(counts.enabled, 2);
  assert.equal(counts.dropped, 1);
});

// --- Validation, attached to its row ----------------------------------------

test('package messages land on the row they name', () => {
  const rows = [
    describeRow('input', 'mainValue', { channel: 'mainValue', type: 'float' }),
    describeRow('property', 'label', { path: 'Core.name', type: 'text' }),
  ];
  const attached = attachValidation(rows, [
    { severity: 'warning', message: 'Published input "mainValue" has no package default value.' },
    { severity: 'issue', message: 'Editable property "label" has no package default value.' },
    { severity: 'warning', message: 'Animation "spin" has an empty target path.' },
  ]);
  assert.equal(attached[0].warnings.length, 1);
  assert.equal(attached[1].warnings[0].severity, 'issue');
  assert.ok(attached.every((row) => row.warnings.every((w) => !w.message.includes('Animation'))));
});

test('a message about a name in no map is dropped rather than guessed at', () => {
  const rows = [describeRow('input', 'a', { channel: 'x', type: 'float' })];
  const attached = attachValidation(rows, ['Published input "notHere" has no package default value.']);
  assert.deepEqual(attached[0].warnings, []);
});

test('the real validator produces messages this can attach', () => {
  const control = component(createCustomComponentPublishedPropertiesDefaults());
  const report = validateCustomComponentPackage(control);
  const rows = attachValidation(contractRows(control), [
    ...report.issues.map((message) => ({ severity: 'issue', message })),
    ...report.warnings.map((message) => ({ severity: 'warning', message })),
  ]);
  assert.ok(rows.some((row) => row.warnings.length), 'the shipped default contract does produce some');
});

// --- Fields -----------------------------------------------------------------

test('the fields offered follow the type, the way the shipped editor branches', () => {
  assert.deepEqual(rowFields({ type: 'float' }).map((f) => f.key), ['label', 'min', 'max', 'step', 'defaultValue']);
  assert.deepEqual(rowFields({ type: 'enum' }).map((f) => f.key), ['label', 'values', 'defaultValue']);
  assert.deepEqual(rowFields({ type: 'bool' }).map((f) => f.key), ['label', 'defaultValue']);
  assert.deepEqual(rowFields({ type: 'text' }).map((f) => f.key), ['label', 'defaultValue']);
  assert.deepEqual(rowFields(null), []);
});

test('every field carries a hint', () => {
  for (const type of API_TYPES) {
    for (const field of rowFields({ type })) assert.ok(field.hint, `${type}.${field.key} has no hint`);
  }
});

test('the type predicates agree with the vocabulary they were taken from', () => {
  assert.equal(isNumericApiType('float'), true);
  assert.equal(isNumericApiType('note'), true);
  assert.equal(isNumericApiType('text'), false);
  assert.equal(isEnumApiType('enum'), true);
  assert.equal(isEnumApiType('Enum'), true);
});

test('every kind has the prose the table needs', () => {
  for (const kind of API_KINDS) {
    const meta = API_KIND_META[kind];
    assert.ok(meta?.label && meta?.one && meta?.targetLabel, `${kind} is missing its prose`);
  }
});

test('field labels are collected for the day the panel rows come out', () => {
  const labels = allApiFieldLabels();
  assert.ok(labels.includes('Label'));
  assert.ok(labels.includes('Default'));
  assert.ok(labels.includes('Target'));
  assert.equal(new Set(labels).size, labels.length, 'a duplicate label would double a search hit');
});

test('every column can sort every row without throwing', () => {
  for (const column of API_COLUMNS) {
    assert.equal(sortRows(sortable, column.key).length, sortable.length, `${column.key} failed`);
  }
});


// --- Making and unmaking an entry -------------------------------------------
// Adding an entry used to stay in the properties panel, which is a gap the moment the panel's rows
// come out. The shapes live in the model so both surfaces make the same thing.

test('an entry name is cleaned to something usable as a path segment', () => {
  assert.equal(cleanEntryName('  my value!  '), 'myvalue');
  assert.equal(cleanEntryName('gain_2'), 'gain_2');
  assert.equal(cleanEntryName(null), '');
});

test('a duplicate name is suffixed rather than silently doing nothing', () => {
  // All three of the panel's Add functions bail on a duplicate, which looks like a broken button.
  assert.equal(uniqueEntryName(['gain'], 'gain'), 'gain2');
  assert.equal(uniqueEntryName(['gain', 'gain2'], 'gain'), 'gain3');
  assert.equal(uniqueEntryName([], '', 'input'), 'input', 'an empty name falls back to the kind');
  assert.equal(uniqueEntryName([], '', ''), 'entry');
});

test('an input and an output point at a channel; a property points at a path', () => {
  const input = newEntryShape('input', 'gain', 'mainValue');
  assert.equal(input.channel, 'mainValue');
  assert.equal(input.label, 'gain');
  assert.equal(input.enabled, true);
  assert.ok(!('path' in input));

  const property = newEntryShape('property', 'size', 'Layout.w');
  assert.equal(property.path, 'Layout.w');
  assert.equal(property.type, 'text');
  assert.equal(property.defaultValue, '');
  assert.ok(!('channel' in property));

  assert.equal(newEntryShape('nope', 'x'), null);
});

test('and a new entry reads back through the tab own reader', () => {
  // The whole point of putting the shape here: what is written is what contractRows understands.
  const control = createControl('CustomComponent');
  control._children.PublishedProperties = {
    _type: 'PublishedProperties',
    inputs: { gain: newEntryShape('input', 'gain', 'mainValue') },
    outputs: {},
    editableProperties: {},
  };
  const rows = contractRows(control);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'input');
  assert.equal(rows[0].name, 'gain');
  assert.equal(rows[0].enabled, true);
});
