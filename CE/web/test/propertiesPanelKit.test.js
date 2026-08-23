// propertiesPanelKit.test.js — the properties-panel foundation from the 2026-08-14 review.
//
// Everything here is the kind of thing that has no failing symptom until a person looks at the
// panel and says it feels untidy. That is exactly why the review's recommendations sat unactioned
// for months: nothing broke, so nothing forced the issue. These tests make the invariants
// mechanical, so the next 20 editors cannot quietly drift back out of them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..', 'src', 'CE_Application');
const read = (rel) => readFileSync(resolve(APP, rel), 'utf8');
const sections = readdirSync(resolve(APP, 'sections')).filter((f) => f.endsWith('.svelte'));

/** The base `.val` rule of a file — not `.val:focus`, not `textarea.val`, not `.foo .val`. */
function baseValRule(source) {
  const match = source.match(/\n[ \t]*\.val \{([^}]*)\}/);
  return match ? match[1] : null;
}

// --- The overflow bug ---------------------------------------------------------------------
// 18 of the pasted `.val` copies had lost `box-sizing: border-box`. In a `min-width: 0` grid
// column that is not cosmetic: padding and border are added OUTSIDE the declared width, so the
// field runs past its track and the row scrolls sideways. It reads as a panel layout bug.

test('every .val rule sets box-sizing, because the grid column cannot absorb the overflow', () => {
  const offenders = [];
  for (const file of sections) {
    const rule = baseValRule(read(`sections/${file}`));
    if (rule && !rule.includes('box-sizing')) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

// --- One skin -------------------------------------------------------------------------------
// There were 19 distinct `.val` bodies. Two dominant skins disagreed on font size, padding AND
// radius, so two fields in the same grid row sat at different heights with misaligned baselines.

test('every .val rule takes its metrics from the panel tokens, not from literals', () => {
  const offenders = [];
  for (const file of sections) {
    const rule = baseValRule(read(`sections/${file}`));
    if (!rule) continue;
    for (const token of ['--pp-field-height', '--pp-field-padding', '--pp-field-bg', '--pp-field-font']) {
      if (!rule.includes(token)) { offenders.push(`${file} (missing ${token})`); break; }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the tokens are declared once, on the panel root', () => {
  const panel = read('panels/PropertiesPanel.svelte');
  for (const token of ['--pp-field-height', '--pp-field-padding', '--pp-field-radius',
                       '--pp-field-bg', '--pp-field-border', '--pp-field-fg', '--pp-field-font']) {
    assert.match(panel, new RegExp(`${token}:`), `${token} must be defined on .properties-panel`);
  }
  // 26px is PropertyToggle's height; a field that does not match it will not line up beside one.
  assert.match(panel, /--pp-field-height:\s*26px/);
  assert.match(read('properties/PropertyToggle.svelte'), /height:\s*26px/);
});

test('the purple fork is gone — no editor styles its fields off-palette', () => {
  const offenders = [];
  for (const file of sections) {
    const rule = baseValRule(read(`sections/${file}`));
    if (rule && (rule.includes('141420') || rule.includes('E8E8EE'))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'these five made switching tabs visibly change the input skin');
});

test('a textarea wearing .val is not crushed to the single-line height', () => {
  // The shared skin sets a fixed height. A `<textarea class="val" rows="12">` needs to opt out,
  // or twelve rows render as one — which is the regression this rule exists to prevent.
  for (const file of sections) {
    const source = read(`sections/${file}`);
    if (!/<textarea[^>]*class="val\b/.test(source)) continue;
    assert.ok(
      /textarea\.val\s*\{/.test(source) || /\.val-textarea\s*\{/.test(source),
      `${file} puts .val on a textarea and must override the fixed height`,
    );
  }
});

// --- The silent span ------------------------------------------------------------------------

test('PropertyCell honours every span it is given', () => {
  const cell = read('properties/PropertyCell.svelte');
  for (const n of [1, 2, 3, 4]) {
    assert.match(cell, new RegExp(`class:span-${n}=\\{span === ${n}\\}`), `span=${n} needs a class`);
    assert.match(cell, new RegExp(`\\.span-${n} \\{ grid-column: span ${n}; \\}`), `span=${n} needs a rule`);
  }
});

test('span={3} is actually used, so the missing rule was not theoretical', () => {
  const used = sections.reduce(
    (total, f) => total + (read(`sections/${f}`).match(/span=\{3\}/g) ?? []).length, 0);
  assert.ok(used > 0, 'if this ever hits zero the span-3 rule can go too');
});

// --- Collapse that survives a click somewhere else --------------------------------------------

test('PropertySection persists its own collapse when the caller does not', async () => {
  const s = read('properties/PropertySection.svelte');
  assert.match(s, /collapsed = \$bindable\(undefined\)/,
    'undefined is what distinguishes "caller did not say" from "caller said false"');
  assert.match(s, /getContext\('propertySectionScope'\)/);
  assert.match(s, /registerSectionKey\(scope, storeKey\)/);
  assert.match(s, /setCollapsed\(storeKey, next\)/);
  // An explicit collapsed prop must still win — BackgroundEditor and TextEditor rely on it.
  assert.match(s, /callerOwnsCollapse/);
});

test('the collapse scope is the tab, not the control', () => {
  // Keying on the control id is the bug: SectionRenderer remounts the editor per control, so a
  // per-control key means every selection change reopens everything.
  const s = read('panels/SectionRenderer.svelte');
  assert.match(s, /setContext\('propertySectionScope', \(\) => `\$\{contextMode\}:\$\{tabId\}`\)/);
  assert.ok(!/propertySectionScope[^\n]*controlId/.test(s));
});

test('collapse-all acts on the sections that actually rendered', async () => {
  const store = await import('../src/CE_Application/stores/sectionCollapse.js');
  const { registerSectionKey, sectionKeysInScope, setAllCollapsedInScope, sectionCollapse } = store;

  const drop1 = registerSectionKey('component:text', 'component:text/Font');
  const drop2 = registerSectionKey('component:text', 'component:text/Fill');
  assert.deepEqual(sectionKeysInScope('component:text').sort(),
    ['component:text/Fill', 'component:text/Font']);

  assert.equal(setAllCollapsedInScope('component:text', true), 2);
  let state;
  sectionCollapse.subscribe((v) => { state = v; })();
  assert.equal(state['component:text/Font'], true);
  assert.equal(state['component:text/Fill'], true);

  // Refcounted: the pinned-split view mounts the same tab twice, and the first unmount must not
  // take the second view's sections with it.
  const drop3 = registerSectionKey('component:text', 'component:text/Font');
  drop1();
  assert.ok(sectionKeysInScope('component:text').includes('component:text/Font'));
  drop3();
  assert.ok(!sectionKeysInScope('component:text').includes('component:text/Font'));
  drop2();
  assert.deepEqual(sectionKeysInScope('component:text'), []);
});

// --- Search, for everyone ----------------------------------------------------------------------

test('property search lives in the toolbar, not behind the custom-component gate', () => {
  const toolbar = read('panels/PropertiesToolbar.svelte');
  assert.match(toolbar, /propertyFilter\.set\(/, 'the toolbar owns the input now');
  assert.match(toolbar, /clearPropertyFilter/);

  const panel = read('panels/PropertiesPanel.svelte');
  const footer = panel.slice(panel.indexOf('component-footer'));
  assert.ok(!/placeholder="Search properties/.test(footer),
    'the footer copy must be gone, not merely duplicated');
  assert.match(panel, /\{collapseScopes\}/, 'the toolbar needs to know what is on screen');
});

test('the filter plumbing it drives was already there', () => {
  assert.match(read('properties/PropertyCell.svelte'), /propertyFilter/);
  assert.match(read('properties/PropertySection.svelte'), /titleMatches/);
});

// --- The new widgets --------------------------------------------------------------------------

test('the shared control widgets exist and are token-driven and border-box', () => {
  for (const widget of ['PropertyText', 'PropertySelect', 'PropertyButton']) {
    const s = read(`properties/${widget}.svelte`);
    assert.match(s, /box-sizing: border-box/, `${widget} must not repeat the overflow bug`);
    assert.match(s, /var\(--pp-field-height/, `${widget} must take its height from the token`);
    assert.match(s, /var\(--pp-field-font/, `${widget} must take its font from the token`);
  }
  // A select's intrinsic width is set by its longest option, so it needs min-width:0 as well or
  // it widens the grid track instead of merely overflowing it.
  assert.match(read('properties/PropertySelect.svelte'), /min-width: 0/);
});
