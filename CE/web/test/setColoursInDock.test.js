// setColoursInDock.test.js — the Colors dock offers the set's colours (docs/design/
// changeable-control-sets.md, piece D1): a role links a control's or a layer's colour to the set it
// is drawn with, so a component follows the panel's set.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import {
  activateColorTarget, applyRoleToTarget, clearColorTarget, colorTarget, colorTargetAcceptsRoles, colorTargetSet,
} from '../src/CE_Application/stores/colorTarget.js';
import { designerFillTarget } from '../src/CE_Application/stores/designerColourTarget.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { ROLE_GROUPS, roleLabel } from '../src/CE_Application/models/setEditing.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';

const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

function withPanel(controls, fn, controlSet = { id: 'graphite' }) {
  panels.set([{ id: 'p1', name: 'P', width: 400, height: 300, controlSet, controlSets: [], controls }]);
  activePanelId.set('p1');
  try { return fn(); } finally { clearColorTarget(); panels.set([]); activePanelId.set(null); }
}

test('a colour of a control or a layer can hold a role; the panel and other callbacks cannot', () => {
  assert.ok(colorTargetAcceptsRoles({ type: 'control', controlId: 'k', path: 'Parts.bodyCap.Background.Fill.colour' }));
  assert.ok(colorTargetAcceptsRoles({ type: 'control', controlId: 'k', path: 'Text.Fill.colour' }));
  assert.ok(colorTargetAcceptsRoles({ type: 'control', controlId: 'k', path: 'Parts.arc.meta.arcTrack.colour' }));
  assert.ok(!colorTargetAcceptsRoles({ type: 'control', controlId: 'k', path: 'Text.Font.size' }), 'not a colour');
  assert.ok(!colorTargetAcceptsRoles({ type: 'panel', prop: 'bgColour' }), 'the panel has its own Surface role');
  assert.ok(!colorTargetAcceptsRoles({ type: 'callback', apply() {} }), 'a callback expects a colour code');
  assert.ok(colorTargetAcceptsRoles({ type: 'callback', apply() {}, acceptsRoles: true }));
  const many = designerFillTarget({ kind: 'custom', controlId: 'c1', layers: ['a', 'b'] });
  assert.ok(colorTargetAcceptsRoles(many), 'several designer layers take a role together');
});

test('a role written links the colour, and the set the control is drawn with draws it', () => {
  const knob = createControl('Knob', { Core: { id: 'k1', name: 'k1' } });
  withPanel([knob], () => {
    activateColorTarget({ type: 'control', controlId: 'k1', path: 'Parts.bodyCap.Background.Fill.colour' }, 'FFF6F6F6');
    assert.equal(colorTargetSet(get(colorTarget)).id, 'graphite', "the panel's set");
    const literal = applyRoleToTarget('accent');
    const stored = get(panels)[0].controls[0];
    assert.equal(stored._children.Parts._children.bodyCap._children.Background._children.Fill.colour, '{accent}');
    assert.match(literal, /^[0-9A-F]{8}$/, 'the dock shows the colour the role gives');
    // Drawn with another set, the same control takes that set's accent.
    const tolex = getControlSet('tolex');
    const drawn = resolveControlForSet(stored, tolex);
    assert.equal(drawn._children.Parts._children.bodyCap._children.Background._children.Fill.colour, tolex.tokens.accent.toUpperCase?.() ?? tolex.tokens.accent);
  });
});

test('a control given a set of its own offers that set', () => {
  const knob = createControl('Knob', { Core: { id: 'k2', name: 'k2', controlSetId: 'tolex' } });
  withPanel([knob], () => {
    assert.equal(colorTargetSet({ type: 'control', controlId: 'k2', path: 'Background.Fill.colour' }).id, 'tolex');
  });
});

test('roles go by the names the Settings page gives them', () => {
  assert.equal(roleLabel('control.cap'), 'Knob / fader cap');
  assert.equal(roleLabel('{accent}'), 'Accent');
  assert.equal(roleLabel('series.one'), 'Series 1');
  assert.equal(ROLE_GROUPS.flatMap((group) => group.roles).length, 45);
});

test('the dock shows the set colours and the link; the look bar marks a linked swatch', () => {
  const dock = read('panels/DisplayPanel.svelte');
  for (const words of ['data-testid="set-colours"', 'Set colours', "the panel's set", 'data-testid="colour-role-link"', 'onclick={() => pickRole(key)}',
    'Click a role to link the colour to it. A colour picked here, or a chip below, unlinks it.']) {
    assert.ok(dock.includes(words), words);
  }
  assert.match(dock, /noteRecentColour\(userPickedColor\);\s*\/\/[^\n]*\n\s*linkedRole = '';/, 'a colour picked breaks the link');
  const bar = read('sections/SurfaceLookBar.svelte');
  assert.match(bar, /class:linked=\{isTokenReference\(selectedFill\?\.colour\)\}/);
  assert.match(bar, /linked to the set's/);
  assert.match(read('sections/CustomDesignSurfaceEditor.svelte'), /acceptsRoles: true,\s*controlId,/);
});
