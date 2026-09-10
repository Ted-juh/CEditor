// dockOpeners.test.js — the way from the properties panel into a dock tab.
//
// Every row here is checked against two shipped sources: the dock's own tab strip and the target
// registry the tabs read. An opener naming a tab that does not exist, or a target kind the store
// would refuse, opens nothing and says nothing — which is exactly the failure this handoff was
// built to end, so it fails here instead.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { get } from 'svelte/store';

import {
  DOCK_OPENERS, openerFor, dockOpenerTabs, acceptsDomain, openerTitle,
} from '../src/CE_Application/utils/dockOpeners.js';
import {
  EDITOR_TARGET_KINDS, editorTarget, activateEditorTarget, armEditorTargetIfIdle,
  clearEditorTarget,
} from '../src/CE_Application/stores/editorTarget.js';
import { DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS } from '../src/CE_Application/utils/displayDock.js';

const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

/** The tab ids the dock will actually accept, read out of its own sanitiser. */
function shippedTabIds() {
  const panel = src('panels/DisplayPanel.svelte');
  const line = panel.match(/const DISPLAY_TAB_IDS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(line, 'DisplayPanel no longer declares DISPLAY_TAB_IDS as a flat list');
  return line[1].split(',').map((part) => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/** The tab strip's labels, so the button in the panel says what the tab says. */
function shippedTabLabels() {
  const panel = src('panels/DisplayPanel.svelte');
  const labels = {};
  for (const match of panel.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label:\s*'([^']+)'/g)) {
    labels[match[1]] = match[2];
  }
  return labels;
}

test('every opener names a tab the dock will accept', () => {
  const ids = shippedTabIds();
  for (const [key, opener] of Object.entries(DOCK_OPENERS)) {
    assert.equal(key, opener.tab, `${key} is filed under the wrong key`);
    assert.ok(ids.includes(opener.tab), `${opener.tab} is not in DISPLAY_TAB_IDS`);
  }
});

test('and says what the tab strip says', () => {
  const labels = shippedTabLabels();
  for (const opener of Object.values(DOCK_OPENERS)) {
    assert.equal(opener.label, labels[opener.tab], `${opener.tab}: button says "${opener.label}", strip says "${labels[opener.tab]}"`);
  }
});

test('every opener that arms a target names a kind the store accepts', () => {
  for (const opener of Object.values(DOCK_OPENERS)) {
    if (!opener.kind) continue;
    const row = EDITOR_TARGET_KINDS[opener.kind];
    assert.ok(row, `${opener.tab} arms kind "${opener.kind}", which the store does not know`);
    assert.equal(row.tab, opener.tab, `kind "${opener.kind}" routes to ${row.tab}, not ${opener.tab}`);
  }
});

test('and its domains are the domains that kind accepts', () => {
  for (const opener of Object.values(DOCK_OPENERS)) {
    const allowed = opener.kind ? (EDITOR_TARGET_KINDS[opener.kind].domains ?? []) : [];
    assert.deepEqual(opener.domains, allowed, `${opener.tab} offers domains the store would drop`);
  }
});

test('the Library opener deliberately arms nothing', () => {
  // It edits the library, not a control, so there is no target to carry.
  assert.equal(DOCK_OPENERS.library.kind, '');
  assert.ok(!Object.hasOwn(EDITOR_TARGET_KINDS, 'library'));
});

test('all eight tabs have a first-run height, so an opener never lands on a squashed dock', () => {
  for (const tab of dockOpenerTabs()) {
    assert.ok(DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS[tab] > 0, `${tab} has no default height`);
  }
});

test('a domain is accepted only where the tab has one', () => {
  assert.equal(acceptsDomain('effects', 'lighting'), true);
  assert.equal(acceptsDomain('effects', 'flow'), false);
  assert.equal(acceptsDomain('type', 'flow'), true);
  assert.equal(acceptsDomain('assets', 'anything'), false);
  assert.equal(acceptsDomain('assets', null), true, 'no domain is always fine');
  assert.equal(acceptsDomain('assets', ''), true);
});

test('lookups fail closed', () => {
  assert.equal(openerFor('nope'), null);
  assert.equal(openerFor(''), null);
  assert.equal(openerTitle('nope'), '');
});

test('the tooltip names the tab, and the thing when there is one', () => {
  assert.equal(openerTitle('effects'), 'Open the Effects tab');
  assert.equal(openerTitle('effects', 'these effects'), 'Edit these effects in the Effects tab');
});

test('the eight openers are the eight tabs built for the space plan', () => {
  assert.deepEqual(
    dockOpenerTabs().sort(),
    ['animation', 'api', 'assets', 'designer', 'effects', 'library', 'screen', 'type']
  );
});

test('the button does both halves of the handoff, the way the colour swatch does', () => {
  // The claim the whole handoff rests on: arming a target without requesting the tab lands the user
  // on whatever tab they left open. Pinned against both shipped sources.
  const swatch = src('properties/SwatchCluster.svelte');
  assert.match(swatch, /activateColorTarget\(/);
  assert.match(swatch, /displayTabRequest\.set\(\{ tab: 'colors' \}\)/);

  const button = src('properties/OpenInDock.svelte');
  assert.match(button, /activateEditorTarget\(opener\.kind, controlId, domain\)/);
  assert.match(button, /displayTabRequest\.set\(\{ tab: opener\.tab \}\)/);

  // And the dock un-hides itself on a tab request, which is why the button need not.
  const app = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
  assert.match(app, /\$displayTabRequest\)\s*\{\s*\n\s*showDisplayPanel\.set\(true\)/);
});


// --- The rule that made the openers work ------------------------------------
// Every tab opens with "if nothing is pointed at me, point me at the selection". That used to read
// "if nothing of MY kind is pointed at me", which is a different thing: there is one target store
// and one dock, so a target of another kind means another tab is being opened right now. Measured
// on the day the openers were added — clicking the Sequence opener armed designer:ctrl_seq and the
// still-mounted Animation tab immediately armed animation:ctrl_custom over the top of it.

test('an idle arm takes an empty target', () => {
  clearEditorTarget();
  const armed = armEditorTargetIfIdle('designer', 'ctrl_seq');
  assert.equal(armed?.kind, 'designer');
  assert.equal(get(editorTarget).controlId, 'ctrl_seq');
});

test('and refuses a target of ANOTHER kind, which is the bug it exists to stop', () => {
  clearEditorTarget();
  activateEditorTarget('designer', 'ctrl_seq');
  assert.equal(armEditorTargetIfIdle('animation', 'ctrl_other'), null);
  assert.equal(get(editorTarget).kind, 'designer', 'the designer target survived');
  assert.equal(get(editorTarget).controlId, 'ctrl_seq');
});

test('and refuses a target of its own kind too — it is not a re-arm', () => {
  clearEditorTarget();
  activateEditorTarget('effects', 'ctrl_a', 'text');
  assert.equal(armEditorTargetIfIdle('effects', 'ctrl_b', 'component'), null);
  assert.equal(get(editorTarget).controlId, 'ctrl_a');
  assert.equal(get(editorTarget).domain, 'text');
});

test('the explicit path still takes the target from whoever holds it', () => {
  // The "Use selection" button in each tab is the user saying so out loud.
  clearEditorTarget();
  activateEditorTarget('designer', 'ctrl_seq');
  activateEditorTarget('animation', 'ctrl_other');
  assert.equal(get(editorTarget).kind, 'animation');
  clearEditorTarget();
});

test('every tab arms from the selection through the idle path, not the explicit one', () => {
  // The mount-time arm is the one that must not steal. Read out of the shipped tabs so a new tab
  // copying the old shape fails here rather than breaking the opener that points at it.
  const tabs = ['EffectsTab', 'TypographyTab', 'AssetsTab', 'ScreenTab', 'ApiTab', 'AnimationTab', 'DesignerTab'];
  for (const tab of tabs) {
    const source = src(`components/${tab}.svelte`);
    const mount = source.slice(source.indexOf('onMount(() => {'), source.indexOf('});', source.indexOf('onMount(() => {')));
    assert.ok(mount, `${tab} has no onMount`);
    assert.match(mount, /armEditorTargetIfIdle\(/, `${tab} arms from the selection without the idle guard`);
    assert.ok(!/activateEditorTarget\(/.test(mount), `${tab} still arms explicitly on mount`);
  }
});
