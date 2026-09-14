import test from 'node:test';
import assert from 'node:assert/strict';

import {
  needsImageRole,
  resolveAriaLabel,
  resolveTooltip,
} from '../src/CE_Application/utils/coreAccessibility.js';

// The two Core fields that describe a control in words: a hover tooltip and a screen-reader label.
// Both shipped in the model and in the Core tab with nothing reading them — the element carried no
// `title` at all, and the surface's generated "<name> preview" was written straight over whatever
// the author had typed into the A11y box.

const core = (patch) => ({ _children: { Core: { name: 'Cutoff', ...patch } } });

test('resolveTooltip returns the authored text, trimmed', () => {
  assert.equal(resolveTooltip(core({ tooltip: '  Filter cutoff  ' })), 'Filter cutoff');
});

test('resolveTooltip returns empty for a control that has none, so no attribute is written', () => {
  // An empty `title` is not the same as no title: it is a tooltip that flashes a blank box.
  assert.equal(resolveTooltip(core({})), '');
  assert.equal(resolveTooltip(core({ tooltip: '   ' })), '');
  assert.equal(resolveTooltip(null), '');
});

test('resolveAriaLabel lets the author win over the surface\'s generated name', () => {
  // The point of the field. The generated name was always there, which is why this reads as a
  // default being preferred rather than as an attribute being missing.
  assert.equal(resolveAriaLabel(core({ screenReaderText: 'Filter cutoff' }), 'Cutoff preview'),
    'Filter cutoff');
});

test('resolveAriaLabel falls back when the author wrote nothing, rather than leaving it nameless', () => {
  assert.equal(resolveAriaLabel(core({}), 'Cutoff preview'), 'Cutoff preview');
  assert.equal(resolveAriaLabel(core({ screenReaderText: '  ' }), 'Cutoff preview'), 'Cutoff preview');
  assert.equal(resolveAriaLabel(null, 'Cutoff preview'), 'Cutoff preview');
});

test('the fallback is the caller\'s, because it differs by element', () => {
  // The control root says "<name> preview"; a spinner's inner input says "<name> value". Both defer
  // to the author, and neither should have to know how the other phrases itself.
  const control = core({ screenReaderText: '' });
  assert.equal(resolveAriaLabel(control, 'Cutoff value'), 'Cutoff value');
  assert.equal(resolveAriaLabel(control, ''), '');
});

test('needsImageRole only where the author wrote a label AND there is no role to displace', () => {
  // `aria-label` on a role-less div is ignored by screen readers, so a name without a role reaches
  // nobody — the same failure as a field nothing reads, one layer down.
  assert.equal(needsImageRole(core({ screenReaderText: 'Section heading' }), ''), true);
  // A control with its own semantics keeps them: the name goes on the slider, not on an image.
  assert.equal(needsImageRole(core({ screenReaderText: 'Section heading' }), 'slider'), false);
  // And no label means nothing to announce, so no role is invented for it either.
  assert.equal(needsImageRole(core({}), ''), false);
  assert.equal(needsImageRole(core({ screenReaderText: '   ' }), ''), false);
  assert.equal(needsImageRole(null, ''), false);
});
