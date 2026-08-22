// coreEditorCard.test.js — the Core card (finding E3, third clause; finding C6's rename clause
// as it reaches the properties panel).
//
// `Core.stylePreset` was an editable text field on the most-visited card in the app, wired to a
// document field that nothing has ever read — no renderer, no exporter, no script API, no C++
// side. Typing in it did nothing except dirty the panel. The input is gone; the row survives only
// for a document that already carries a value, so the author can see and clear the leftover
// rather than having it deleted behind their back.
//
// The Name field had the second half of the rename bug: it wrote `Core.name` straight through,
// and for a multi-selection it wrote it to every selected control at once — twelve controls, one
// script handle, one keystroke.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { render } from 'svelte/server';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import CoreEditor from '../src/CE_Application/sections/CoreEditor.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src', 'CE_Application', 'sections', 'CoreEditor.svelte'), 'utf8');

const renderCard = (control) => render(CoreEditor, { props: { control } }).body;

test('the Preset row is gone from a control that does not carry one', () => {
  const html = renderCard(createControl('Knob', { Core: { id: 'k', name: 'cutoff' } }));

  assert.ok(!/>Preset</.test(html), 'the dead Preset input is still on the card');
  assert.match(html, />Name</, 'the rest of the card is still there');
  assert.match(html, />Tooltip</);
});

test('a document that already carries a stylePreset can see and clear it', () => {
  const control = createControl('Knob', { Core: { id: 'k', name: 'cutoff', stylePreset: 'chrome-v2' } });
  const html = renderCard(control);

  assert.match(html, />Preset</, 'a value already in the document must not vanish silently');
  assert.match(html, /chrome-v2/);
  assert.match(html, />Clear</, 'and there must be a way to be rid of it');
  assert.ok(!/value="chrome-v2"/.test(html), 'it is shown, not offered as an input again');
});

test('the Name field goes through renameControl, and never through the multi-select path', () => {
  assert.match(source, /import \{[^}]*renameControl[^}]*\} from '\.\.\/stores\/controls\.js'/);
  assert.match(source, /function handleNameChange/);
  // The old wiring. If either comes back, the uniqueness and blank-name rules are bypassed again.
  assert.ok(!/handleInput\('name'/.test(source), 'the Name field is writing Core.name blind again');
  const handler = source.slice(source.indexOf('function handleNameChange'), source.indexOf('</script>'));
  assert.ok(!/updateSelectedProperty/.test(handler), 'a name is never a multi-edit — that is twelve controls, one handle');
});
