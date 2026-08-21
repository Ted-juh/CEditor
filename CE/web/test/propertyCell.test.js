// PropertyCell compact mode — cells whose control carries its own label
// (NumberCell) suppress the label strip but keep the label prop for the
// filter/hint plumbing. Rendered through a fixture because PropertyCell
// takes its content as a children snippet.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import Fixture from './support/PropertyCellFixture.svelte';

const html = render(Fixture, { props: {} }).body;

test('labelled cell renders its label strip', () => {
  assert.match(html, /property-label[^>]*>Speed</);
});

test('compact cell drops the strip but keeps the inner label', () => {
  assert.doesNotMatch(html, /property-label[^>]*>Offset X</, 'no outer strip');
  assert.match(html, /property-cell[^"]*compact/, 'carries the compact class');
  assert.match(html, /nc-label[^>]*>X</, 'inner NumberCell label present');
});
