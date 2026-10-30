// packageShot.test.js — a saved component's picture is the component, at its own proportions.
//
// Package & Library and the Insert panel's library drew a schematic: up to 18 of the component's
// parts as plain boxes, placed in percentages of a box as wide as the card and a clamped 42-120 px
// high. A round knob came out as a flat oval in a wide strip, and nothing in it looked like the
// component. They draw the canvas's renderer now, fitted whole, as the dock's Library tab did.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from 'svelte/server';

import PackageShot from '../src/CE_Application/components/library/PackageShot.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (path) => readFileSync(join(here, '..', 'src', 'CE_Application', path), 'utf8');

function stageBox(html) {
  const match = html.match(/class="stage-box[^"]*" style="width:\s*([\d.]+)px;\s*height:\s*([\d.]+)px/);
  assert.ok(match, 'no picture was drawn');
  return { width: Number(match[1]), height: Number(match[2]) };
}

test('a round control stays round in a box of another shape', () => {
  const knob = createControl('Knob', { Core: { id: 'k', name: 'knob' }, Transform: { x: 300, y: 200, width: 50, height: 50 } });
  const html = render(PackageShot, { props: { component: knob, width: 200, height: 64 } }).body;
  assert.match(html, /class="effect-preview/, 'drawn by the real renderer');
  const box = stageBox(html);
  assert.equal(box.width, box.height, `a 50x50 knob drawn ${box.width}x${box.height}`);
  assert.ok(box.height <= 64 - 2, 'and inside the box');
});

test('a wide control keeps its width to height', () => {
  const strip = createControl('Label', { Core: { id: 'w', name: 'wide' }, Transform: { width: 400, height: 40 } });
  const box = stageBox(render(PackageShot, { props: { component: strip, width: 48, height: 32 } }).body);
  assert.ok(Math.abs(box.width / box.height - 10) < 0.01, `a 400x40 control drawn ${box.width}x${box.height}`);
  assert.ok(box.width <= 48 - 2);
});

test('no component says so instead of drawing an empty box', () => {
  assert.match(render(PackageShot, { props: { component: null, width: 48, height: 32 } }).body, /no component/);
});

test('Package & Library and the Insert panel draw it, and the schematic is gone from both', () => {
  const library = src('sections/CustomPackageLibrary.svelte');
  assert.equal([...library.matchAll(/<PackageShot component=\{/g)].length, 3, 'the card, the selected entry and the incoming package');
  assert.match(library, /<PackageShot component=\{importPreview\.envelope\.component\}/);
  const insert = src('layout/IconPanel.svelte');
  assert.match(insert, /<PackageShot component=\{entry\.component\} width=\{48\} height=\{32\} \/>/);
  for (const [name, source] of [['CustomPackageLibrary', library], ['IconPanel', insert]]) {
    assert.ok(!/thumbnailPartStyle|thumbnail\?\.parts/.test(source), `${name} still draws the schematic`);
  }
});

test('the ten counts are one line, or two even lines of five, across the whole detail', () => {
  // A fixed 7 columns (4 for the Manifest) put the last of the ten counts on a line of their own,
  // and in the detail they had the summary's column only, half the width.
  const library = src('sections/CustomPackageLibrary.svelte');
  const css = library.slice(library.indexOf('<style>'));
  assert.match(css, /\.manifest-wrap \{\s*container-type: inline-size;/);
  assert.match(css, /\.manifest-grid \{\s*display: grid;\s*grid-template-columns: repeat\(10, minmax\(0, 1fr\)\);/);
  assert.match(css, /@container \(max-width: 499px\) \{\s*\.manifest-grid \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.library-detail-main > \.manifest-wrap \{\s*grid-column: 1 \/ -1;/);
  assert.ok(!/repeat\(7, minmax/.test(css), 'the seven-column compact grid is back');
  assert.equal([...library.matchAll(/<div class="manifest-wrap">\s*<div class="manifest-grid/g)].length, 3,
    'every count grid sits in the container its query measures');
});

test('the drawing does not size its own box, so a narrower panel can shrink it', () => {
  const shot = readFileSync(join(here, '..', 'src', 'CE_Application', 'components', 'library', 'PackageShot.svelte'), 'utf8');
  assert.match(shot, /<span class="fit">\s*<EffectPreview/);
  assert.match(shot, /\.fit \{\s*position: absolute;\s*inset: 0;/);
});
