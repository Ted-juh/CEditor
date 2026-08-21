// PropertySection header tools (W6) — the header carries an icon anchor and
// an inline tool slot, so a section whose single decision is a master enable
// needs no body rows until there is something to show. Rendered through a
// fixture because the section takes snippets.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import Fixture from './support/PropertySectionFixture.svelte';

test('header renders chevron, icon anchor, title, and the tools slot', () => {
  const html = render(Fixture, { props: { enabled: false } }).body;

  assert.match(html, /class="chevron/, 'chevron present');
  assert.match(html, /header-icon/, 'icon anchor present');
  assert.match(html, /header-icon[^>]*>(\s|<!--[^>]*-->)*<svg/, 'icon renders as svg');
  assert.match(html, /property-section-title[^>]*>Shadow</, 'title unchanged');
  assert.match(html, /header-tools/, 'tools slot rendered');
  assert.match(html, /header-pill/, 'pill lives in the tools slot');
});

test('the toggle stays a button and the tools sit outside it', () => {
  const html = render(Fixture, { props: { enabled: false } }).body;

  const toggle = html.match(/<button class="header-toggle[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.match(toggle, /aria-expanded/, 'toggle announces expanded state');
  assert.doesNotMatch(toggle, /header-pill/, 'no interactive tools nested in the toggle');
});

test('pill state gates the body: off = no rows, on = rows', () => {
  const off = render(Fixture, { props: { enabled: false } }).body;
  assert.match(off, /aria-pressed="false"[^>]*>[^<]*Off|>Off</, 'pill shows Off');
  assert.doesNotMatch(off, /property-cell/, 'no body rows while off');

  const on = render(Fixture, { props: { enabled: true } }).body;
  assert.match(on, />On</, 'pill shows On');
  assert.match(on, /property-cell/, 'body rows render when on');
});
