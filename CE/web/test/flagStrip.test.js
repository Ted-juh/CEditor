// FlagStrip — related booleans as icon chips in one shared well. Each chip is
// a real button with the full flag name as its accessible label and tooltip,
// and aria-pressed carrying the state, so the compression costs no semantics.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import FlagStrip from '../src/CE_Application/properties/FlagStrip.svelte';
import Eye from 'lucide-svelte/icons/eye';
import Lock from 'lucide-svelte/icons/lock';

const FLAGS = [
  { key: 'visible', title: 'Visible', on: true, icon: Eye },
  { key: 'locked', title: 'Locked', on: false, icon: Lock },
];

const html = render(FlagStrip, { props: { flags: FLAGS } }).body;

test('renders one chip per flag with full names as labels', () => {
  assert.match(html, /aria-label="Visible"/);
  assert.match(html, /aria-label="Locked"/);
  assert.match(html, /title="Visible"/);
});

test('chip state is carried by aria-pressed and the on class', () => {
  assert.match(html, /aria-pressed="true"[^>]*aria-label="Visible"|aria-label="Visible"[^>]*aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"[^>]*aria-label="Locked"|aria-label="Locked"[^>]*aria-pressed="false"/);
  assert.match(html, /class="flag[^"]*\bon\b/, 'the on flag gets the lit class');
});

test('chips render their icons as inline svg', () => {
  const svgs = html.match(/<svg/g) ?? [];
  assert.equal(svgs.length, 2, 'one svg per chip');
});
