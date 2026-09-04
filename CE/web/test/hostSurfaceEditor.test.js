import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../src/CE_Application/sections/HostSurfacePanel.svelte', import.meta.url), 'utf8');

test('controller controls select safely instead of hiding destructive gestures', () => {
  const plate = source.match(/<div class="surface-plate"[\s\S]*?<aside class="control-inspector"/)?.[0] ?? '';
  assert.match(plate, /selectedControlId = control\.controlId/);
  assert.doesNotMatch(plate, /altKey/);
  assert.doesNotMatch(plate, /oncontextmenu/);
  assert.doesNotMatch(plate, /clearControlSlot/);
});

test('the selected-control inspector exposes assignment and mapping options', () => {
  assert.match(source, /data-testid="surface-control-inspector"/);
  assert.match(source, />Assign selected<\/button>/);
  assert.match(source, /Learn hardware/);
  assert.match(source, /rangeMin/);
  assert.match(source, /rangeMax/);
  assert.match(source, /Invert control direction/);
  assert.match(source, /Pad mode/);
  assert.match(source, /Clear MIDI binding/);
  assert.match(source, /Confirm clear/);
});

test('the controller editor foregrounds pages, useful regions and explicit states', () => {
  assert.match(source, /CONTROL PAGE \{Math\.max/);
  assert.match(source, /\['encoders', 'faders', 'pads'\]/);
  assert.match(source, />Empty<\/span>/);
  assert.match(source, />Mapped<\/span>/);
  assert.match(source, />Unresolved<\/span>/);
  assert.match(source, />Moving<\/span>/);
});
