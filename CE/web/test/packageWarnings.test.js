// packageWarnings.test.js — what Package & Library shows under an incoming or saved package.
//
// A package's validation warnings are of two kinds. Most say how complete its published contract
// is: an input, output or property with no default value, range or list of choices. Those are for
// its author, who polishes them in Publish › Contract; they do not stop an import or change how the
// component works, and the person importing can do nothing about them. The rest do concern that
// person: a package made by a newer CEditor, a font that is not installed, a link to nothing, an
// image with no picture. Package & Library listed all of them under every import (the SH-201 Knob
// eleven, six of them shown and no word of the rest), and the ones that matter were lost among them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isAuthorNote, splitPackageWarnings, validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';
import { gaiaKnob } from '../../../tools/scripts/gaia-panel/components.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('notes on the published contract are for the author', () => {
  for (const note of [
    'Published input "value" has no package default value.',
    'Published output "value" type "float" differs from channel type "int".',
    'Editable property "minimum" has no complete public min/max range.',
    'Editable property "valueType" has no public enum values.',
    'Editable property "readout" has no package default value.',
    'Image "logo" has no captured width/height metadata.',
  ]) assert.equal(isAuthorNote(note), true, note);
});

test('what changes the import or the component is for whoever imports it', () => {
  for (const warning of [
    'Package format version 9 is newer than supported version 1.',
    'Package compatibility version 9 is newer than supported version 1.',
    'No published inputs or outputs are enabled.',
    'Link "follow" reads unknown source "nowhere".',
    'Image "logo" has no embedded source yet.',
    'Image "logo" is 4.2 MB embedded; consider optimizing it before sharing.',
    'Embedded assets total 9.1 MB. Shrink the images or filmstrips to reduce it.',
    'Arpeggiator output "arpNote" is not published.',
    'Filmstrip generator "strip" has no filmstrip asset to render yet.',
  ]) assert.equal(isAuthorNote(warning), false, warning);
});

test('the split keeps both lists, in order, and loses nothing', () => {
  const warnings = [
    'Published input "value" has no package default value.',
    'Link "follow" reads unknown source "nowhere".',
    'Editable property "step" has no package default value.',
  ];
  const { forUser, forAuthor } = splitPackageWarnings(warnings);
  assert.deepEqual(forUser, ['Link "follow" reads unknown source "nowhere".']);
  assert.deepEqual(forAuthor, [warnings[0], warnings[2]]);
  assert.deepEqual(splitPackageWarnings(undefined), { forUser: [], forAuthor: [] });
});

test('the contract notes the validator actually writes are all recognised as notes', () => {
  // The classifier matches the validator's messages, so it is tested against them, not a copy.
  const control = gaiaKnob({ size: 50 });
  const published = control._children.PublishedProperties = { _type: 'PublishedProperties' };
  published.inputs = { value: { channel: 'value', label: 'Value', type: 'float', enabled: true } };
  published.outputs = { value: { channel: 'value', label: 'Value', type: 'int', enabled: true } };
  published.editableProperties = {
    minimum: { path: 'ValueChannels.value.min', label: 'Minimum', type: 'number', enabled: true },
    valueType: { path: 'ValueChannels.value.type', label: 'Value type', type: 'enum', enabled: true },
  };
  const contract = validateCustomComponentPackage(control).warnings
    .filter((warning) => /^(Published|Editable)/.test(warning));
  assert.ok(contract.length >= 4, `the validator wrote ${contract.length}: ${contract.join(' | ')}`);
  assert.deepEqual(contract.filter((warning) => !isAuthorNote(warning)), []);
});

test('Package & Library shows the importer warnings and folds the author notes, for both kinds of package', () => {
  const library = readFileSync(join(here, '..', 'src', 'CE_Application', 'sections', 'CustomPackageLibrary.svelte'), 'utf8');
  assert.match(library, /let importWarnings = \$derived\(splitPackageWarnings\(importPreview\.envelope\?\.validation\?\.warnings \?\? \[\]\)\);/);
  assert.match(library, /\.\.\.importWarnings\.forUser\.map\(/);
  assert.match(library, /\.\.\.selectedLibraryWarnings\.forUser\.map\(/);
  assert.ok(!/validation\?\.warnings \?\? \[\]\)\.map\(\(warning\) => `Warning:/.test(library), 'a list of every warning is back');
  assert.match(library, /\{@render authorNotes\(importWarnings\.forAuthor\)\}/);
  assert.match(library, /\{@render authorNotes\(selectedLibraryWarnings\.forAuthor\)\}/);
  assert.match(library, /<details class="author-notes">\s*<summary/, 'folded, and opened on a click');
  // Cut to six, they now say how many more there are.
  assert.match(library, /…and \{importIssueList\.length - 6\} more/);
});
