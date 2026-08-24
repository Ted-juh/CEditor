// qaPanels.test.js — the gate under the generated QA panel suite.
//
// The suite exists because "the amount of things to check is getting enormous" and a human
// checklist grows faster than anyone updates it. That only works if the sheets cannot fall behind
// the model, which is what this file enforces. Three jobs, in order of how much time they save:
//
//   1. COVERAGE RATCHET. One per sheet, each reading its list from the model rather than from a
//      copy of it, so none of them can be satisfied by editing this file:
//
//        QA-01  every component type appears, exactly once, filed under a titled group
//        QA-02  every model section is driven by a recipe or exempted with a written reason
//        QA-03  every type carrying a States section appears in every state the model resolves
//        QA-04  every script language × every panel-API event
//        QA-05  every verb family resolves to a component — an orphaned family fails here
//        QA-07  every custom-component starter appears, and still validates as a package
//        QA-08  every component type carries an export verdict, with a reason when it exports
//               nothing, and every derivation recipe still exercises its branch
//
//      Add a component, a section, a state, an event, a verb family or a starter without the sheet
//      following, and this fails. The same shape as componentCoverage.test.js, for the same reason
//      — a gap has no symptom, so the gap itself has to be the thing that fails.
//
//   2. HEADLESS RENDER. Every control on every sheet is server-rendered through CanvasControl and
//      asserted to draw something. This catches the failure the sheets were built to catch —
//      "a component stopped rendering" — in seconds, on every `npm test`, without launching the
//      app. That is the difference between finding it now and finding it in a beta tester's hands.
//
//   3. FRESHNESS. The committed .cepanel files must match what the generator emits, so the copy a
//      tester opens is the copy this file just checked.
//
// Regenerate with: node tools/scripts/qa/make-qa-panels.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSameText, readText } from './support/readText.mjs';

import { render } from 'svelte/server';

import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';

import { SHEETS, serializeSheet } from '../../../tools/scripts/qa/make-qa-panels.mjs';
import { coveredTypes, GROUPS } from '../../../tools/scripts/qa/sheets/components.mjs';
import { coveredSections, EXEMPT, RECIPES } from '../../../tools/scripts/qa/sheets/properties.mjs';
import { STATE_NAMES, statefulTypes } from '../../../tools/scripts/qa/sheets/states.mjs';
import { allScripts, EVENTS, LANGUAGES } from '../../../tools/scripts/qa/sheets/scripting.mjs';
import { componentForSection, familyComponentMap } from '../../../tools/scripts/qa/sheets/verbs.mjs';
import { gaiaProfile } from '../../../tools/scripts/qa/sheets/gaia.mjs';
import { STARTER_IDS, buildStarterControl } from '../../../tools/scripts/qa/sheets/packages.mjs';
import {
  classifyAllTypes,
  DEFERRED_TYPES,
  parametersFor,
  RECIPES as EXPORT_RECIPES,
} from '../../../tools/scripts/qa/sheets/export.mjs';
import { COMPONENT_FAMILIES } from '../src/CE_Application/scripting/componentVerbs.js';
import { ALL_EVENTS } from '../src/CE_Application/scripting/panelApi.js';
import { SCRIPT_LANGUAGES } from '../src/CE_Application/scripting/scriptModel.js';
import { CUSTOM_COMPONENT_STARTERS } from '../src/CE_Application/utils/customComponentFactory.js';
import { analyzeCustomComponentReadiness } from '../src/CE_Application/utils/customComponentPackage.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const QA_DIR = path.join(REPO, 'CE/qa');

/**
 * Controls that cannot be server-rendered, and why. This is not a list of components that are
 * allowed to be broken — it is a list of components this particular gate cannot see, which is
 * worth knowing precisely because they are the ones nothing else checks either.
 */
const NO_SSR = {
  // PixelDisplayRenderer reaches for `window` while rendering, so it has no server pass. Every
  // other component has one. Guarding that access would bring PixelDisplay under this gate too.
  PixelDisplay: 'PixelDisplayRenderer touches `window` during render — no server pass',
};

/* ------------------------------------------------------------------ 1. coverage ratchet */

test('QA-01 places every component type, once', () => {
  const covered = coveredTypes();
  const declared = Object.keys(COMPONENT_TYPES);

  const duplicates = covered.filter((type, i) => covered.indexOf(type) !== i);
  assert.deepEqual(duplicates, [], `filed under two groups: ${duplicates.join(', ')}`);

  const missing = declared.filter((type) => !covered.includes(type));
  assert.deepEqual(missing, [], `new component type with no QA-01 group — add it to GROUPS in tools/scripts/qa/sheets/components.mjs: ${missing.join(', ')}`);

  const stale = covered.filter((type) => !declared.includes(type));
  assert.deepEqual(stale, [], `QA-01 lists a component type that no longer exists: ${stale.join(', ')}`);
});

test('QA-01 groups all have a title and at least one member', () => {
  for (const group of GROUPS) {
    assert.ok(group.title?.length > 0, 'a group with no title is a band of unexplained controls');
    assert.ok(group.types.length > 0, `empty group: ${group.title}`);
  }
});

test('QA-02 accounts for every model section — driven or exempted, never silently skipped', () => {
  const covered = coveredSections();
  const exempt = Object.keys(EXEMPT);
  const declared = Object.keys(SECTION_DEFAULTS);

  const both = covered.filter((name) => exempt.includes(name));
  assert.deepEqual(both, [], `section is both driven and exempted — pick one: ${both.join(', ')}`);

  const unaccounted = declared.filter((name) => !covered.includes(name) && !exempt.includes(name));
  assert.deepEqual(unaccounted, [], `new model section with no QA-02 recipe and no exemption — add one to tools/scripts/qa/sheets/properties.mjs: ${unaccounted.join(', ')}`);

  const stale = [...covered, ...exempt].filter((name) => !declared.includes(name));
  assert.deepEqual(stale, [], `QA-02 names a section that is no longer in the model: ${stale.join(', ')}`);
});

test('every QA-02 exemption carries a reason', () => {
  for (const [section, reason] of Object.entries(EXEMPT)) {
    assert.ok(typeof reason === 'string' && reason.trim().length > 3, `exemption for "${section}" has no reason — an exemption without one is just an omission`);
  }
});

test('every QA-02 recipe actually builds the sections it claims', () => {
  // The claim in RECIPES is what the ratchet counts, so an inaccurate claim would let a section
  // be reported as covered by a control that does not carry it. Check the built control instead.
  for (const recipe of RECIPES) {
    const control = recipe.build();
    for (const section of recipe.sections) {
      assert.ok(control._children?.[section], `"${recipe.caption}" claims section "${section}" but the control it builds has no such section`);
    }
  }
});

/* --- QA-03: states --- */

test('QA-03 covers every stateful type in every state', () => {
  // Both halves come from the model — the types by looking for a States section, the state names
  // from SECTION_DEFAULTS.States.priority — so this cannot be satisfied by editing a list here.
  // What it defends is the sheet: a state added to the model with no cell on QA-03 is a visual
  // state nobody ever looks at, which is exactly how a broken :hover ships.
  const types = statefulTypes();
  assert.ok(types.length > 0, 'no component type carries a States section — the sheet proves nothing');
  assert.deepEqual(STATE_NAMES, [...SECTION_DEFAULTS.States.priority],
    'QA-03 reads its state list from the model; this should be impossible');

  const doc = JSON.parse(serializeSheet(SHEETS.find((s) => s.file === 'QA-03-states.cepanel')));
  const ids = new Set(doc.controls.map((control) => control._children?.Core?.id));

  const missing = [];
  for (const type of types) {
    for (const state of STATE_NAMES) {
      const id = `qa03_${type}_${state}`;
      if (!ids.has(id)) missing.push(id);
    }
  }
  assert.deepEqual(missing, [], `QA-03 is missing cells — regenerate: ${missing.slice(0, 8).join(', ')}`);
});

/* --- QA-04: scripting --- */

test('QA-04 carries every language × event pair', () => {
  assert.equal(LANGUAGES.length, SCRIPT_LANGUAGES.length, 'a script language appeared without reaching QA-04');
  assert.equal(EVENTS.length, ALL_EVENTS.length, 'an event appeared without reaching QA-04');

  const scripts = allScripts();
  assert.equal(scripts.length, LANGUAGES.length * EVENTS.length,
    'QA-04 is not the full cross product — a language or event pair is missing');

  // Every pair, exactly once. A duplicate would inflate the count and hide an absence.
  const pairs = new Set(scripts.map((script) => `${script.language}::${script.event}`));
  assert.equal(pairs.size, scripts.length, 'QA-04 builds the same language/event pair twice');
});

test('QA-04 scripts all name an event the API actually declares', () => {
  const declared = new Set(ALL_EVENTS.map((event) => event.fn));
  const phantom = allScripts().filter((script) => !declared.has(script.event));
  assert.deepEqual(phantom.map((s) => s.event), [],
    'QA-04 carries a handler for an event the panel API no longer has');
});

/* --- QA-05: component verbs --- */

test('QA-05 finds a component for every verb family', () => {
  // An orphaned family is a real defect, not a sheet problem: 400-odd verbs address a section, and
  // if no component carries that section the verbs reach nothing. The sheet renders one in red; the
  // test is what makes it fail rather than merely look odd.
  const map = familyComponentMap();
  const orphans = COMPONENT_FAMILIES.filter((family) => !map[family.id]);
  assert.deepEqual(orphans.map((f) => `${f.id} → section "${f.section}"`), [],
    'verb families whose section no component carries');
});

test('QA-05 resolves each family to exactly one section, and the lookup is honest', () => {
  for (const family of COMPONENT_FAMILIES) {
    assert.ok(family.section, `family ${family.id} declares no section`);
    const type = componentForSection(family.section);
    assert.ok(type, `no component carries section "${family.section}"`);
    assert.ok(family.verbs.length > 0, `family ${family.id} has no verbs`);
  }
});

/* --- QA-07: custom-component packages --- */

test('QA-07 places every custom-component starter', () => {
  const doc = JSON.parse(serializeSheet(SHEETS.find((s) => s.file === 'QA-07-packages.cepanel')));
  const ids = new Set(doc.controls.map((control) => control._children?.Core?.id));

  const missing = STARTER_IDS
    .map((id) => `qa07_${id.replace(/\W+/g, '_')}`)
    .filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `starters with no cell on QA-07 — regenerate: ${missing.join(', ')}`);
  assert.equal(STARTER_IDS.length, CUSTOM_COMPONENT_STARTERS.length,
    'QA-07 reads its starter list from the model; this should be impossible');
});

test('every custom-component starter still validates as a package', () => {
  // The verdict is printed on the sheet so a human sees it, but a starter that stops validating
  // should not wait for a human. A user who picks one out of the flyout and cannot publish it has
  // hit a dead end in the designer, and nothing else in the suite would notice.
  const broken = [];
  for (const starter of CUSTOM_COMPONENT_STARTERS) {
    const control = buildStarterControl(starter, `t_${starter.id.replace(/\W+/g, '_')}`);
    const readiness = analyzeCustomComponentReadiness(control);
    if (!readiness.ok) broken.push(`${starter.id}: ${readiness.validation.issues.join('; ') || 'a required step is unmet'}`);
  }
  assert.deepEqual(broken, [], `starters that no longer produce a valid package:\n  ${broken.join('\n  ')}`);
});

/* --- QA-08: export parameters --- */

test('QA-08 accounts for every component type, with a verdict', () => {
  const classified = classifyAllTypes();
  assert.equal(classified.length, Object.keys(COMPONENT_TYPES).length,
    'QA-08 classifies fewer types than the model has');

  // 'deferred' joined the three on 2026-08-23, when the last unexamined types were ruled: it marks
  // a question nobody has answered yet, which is not the same as one answered "no".
  const unverdicted = classified.filter((entry) => !['exports', 'declined', 'deferred', 'unseen'].includes(entry.verdict));
  assert.deepEqual(unverdicted.map((e) => e.type), [], 'a type reached QA-08 with no verdict');

  // Every non-exporting type owes a reason. "It exports nothing" without one is the state this
  // sheet exists to end.
  const unexplained = classified.filter((entry) => entry.verdict !== 'exports' && !entry.reason?.trim());
  assert.deepEqual(unexplained.map((e) => e.type), [], 'a type exports nothing and the sheet does not say why');
});

// The eight types that were named in known-issues.md as unautomatable-and-undecided. Each is now
// ruled: five export, three declare that they do not. Listed here rather than derived, because the
// point of the test is that a specific list of open questions got specific answers — a derived
// version would go green again the moment someone quietly deleted a ruling.
const RULED = {
  Numpad: 1, Crossfader: 1, Ribbon: 1, Macro: 1, VectorJoystick: 2,
  Meter: 0, Matrix: 0, Envelope: 0,
};

test('the eight undecided types are all ruled, none of them by accident', () => {
  const byType = new Map(classifyAllTypes().map((entry) => [entry.type, entry]));
  const wrong = [];

  for (const [type, expected] of Object.entries(RULED)) {
    const entry = byType.get(type);
    if (!entry) { wrong.push(`${type}: no longer a component type`); continue; }

    if (entry.params.length !== expected) {
      wrong.push(`${type}: exports ${entry.params.length} parameters, the ruling was ${expected}`);
    }
    // Zero parameters is only acceptable as a DECISION. 'unseen' means the type says nothing and
    // the deriver never looked, which is the state this whole exercise existed to end.
    if (expected === 0 && entry.verdict !== 'declined') {
      wrong.push(`${type}: exports nothing but is "${entry.verdict}" — it must say so with exportValues: []`);
    }
  }
  assert.deepEqual(wrong, [], `rulings that no longer hold:\n  ${wrong.join('\n  ')}`);
});

test('a declared export range matches what the component actually stores', () => {
  // The trap this pins: Crossfader, Ribbon and VectorJoystick all carry a `bipolar` flag, and it is
  // a DISPLAY flag — RibbonRenderer's readout does `value * 2 - 1` while storage stays 0..1.
  // Exporting -1..1 for them would hand the host a range the control never holds, and the first
  // draft of exportValues did exactly that.
  for (const type of ['Crossfader', 'Ribbon', 'VectorJoystick', 'Macro']) {
    const control = createControl(type, { Core: { id: `t_${type}`, name: type } });
    for (const param of parametersFor(control)) {
      assert.equal(param.min, 0, `${param.path} exports a min of ${param.min}; these store 0..1`);
      assert.equal(param.max, 1, `${param.path} exports a max of ${param.max}; these store 0..1`);
      assert.ok(param.defaultValue >= param.min && param.defaultValue <= param.max,
        `${param.path} defaults to ${param.defaultValue}, outside its own range`);
    }
  }
});

test('no component type is unexamined for export', () => {
  // All fifty are ruled as of 2026-08-23: they export something, or they declare exportValues: []
  // with a reason. "Unseen" — nothing in the type says anything, so the deriver never looks — is the
  // state this whole exercise existed to end, and a new type must not quietly reintroduce it.
  const unseen = classifyAllTypes().filter((entry) => entry.verdict === 'unseen');
  assert.deepEqual(unseen.map((e) => e.type), [],
    'a component type says nothing about what it exports. Give it an exportValues declaration —\n'
    + '  a list if it has automatable values, or [] with a comment saying why not.');
});

test('every deferred type is genuinely undecided, and every decided one is not deferred', () => {
  // DEFERRED_TYPES is what stops "we have not decided" being filed as "we decided no". It has to
  // stay in step with the model in both directions: a type that gains real exportValues has been
  // decided and must leave the set, and a type in the set must actually export nothing.
  const byType = new Map(classifyAllTypes().map((entry) => [entry.type, entry]));
  const wrong = [];

  for (const type of DEFERRED_TYPES) {
    const entry = byType.get(type);
    if (!entry) { wrong.push(`${type}: no longer a component type — drop it from DEFERRED_TYPES`); continue; }
    if (entry.params.length) {
      wrong.push(`${type}: now exports ${entry.params.length} parameter(s) — it has been decided, remove it from DEFERRED_TYPES`);
    }
  }
  assert.deepEqual(wrong, [], `DEFERRED_TYPES is out of step with the model:\n  ${wrong.join('\n  ')}`);
});

test('an empty exportValues always comes with a stated reason', () => {
  // The declaration alone says "nothing"; the comment beside it says why, and the why is the whole
  // difference between a ruling and a shrug. Checked against the source, since a comment is the one
  // thing the model cannot carry.
  const source = readFileSync(
    path.join(REPO, 'CE/web/src/CE_Application/models/componentTypes.js'), 'utf8');
  const bare = [];
  for (const entry of classifyAllTypes()) {
    if (entry.params.length) continue;
    if (!COMPONENT_TYPES[entry.type]?.exportValues) continue;   // declines via Behavior, not a list
    const at = source.indexOf(`  ${entry.type}: {`);
    if (at < 0) continue;
    const block = source.slice(at, source.indexOf('exportValues:', at));
    if (!block.includes('// HOST AUTOMATION')) bare.push(entry.type);
  }
  assert.deepEqual(bare, [],
    `exportValues: [] with no "// HOST AUTOMATION" comment explaining it: ${bare.join(', ')}`);
});

test('QA-08 recipes each still cover the derivation branch they claim', () => {
  // The recipe cards re-check themselves at generation time and go red, which a reader would see.
  // This is the same check with no reader required — a recipe that stops exercising its branch is
  // a hole in the coverage, and holes are the thing this suite is for.
  const lapsed = [];
  for (const recipe of EXPORT_RECIPES) {
    const params = parametersFor(recipe.build(), recipe.panel ?? {});
    if (!recipe.expect(params)) lapsed.push(`${recipe.id} — derived: ${JSON.stringify(params)}`);
  }
  assert.deepEqual(lapsed, [], `QA-08 recipes no longer covering their branch:\n  ${lapsed.join('\n  ')}`);
});

test('every derived parameter declares what kind of host parameter it is', () => {
  // The gap this closes: PanelParameters.h branches on `valueKind` to choose an
  // AudioParameterChoice / Bool / Float, and a parameter that omits it silently reads as a float.
  // That is what shipped for a long time — every combobox arrived in the DAW as an anonymous 0..1
  // number — and nothing in the editor showed it, because the editor never reads valueKind.
  const KINDS = new Set(['float', 'bool', 'choice']);
  const bad = [];
  for (const entry of classifyAllTypes()) {
    for (const param of entry.params) {
      if (!KINDS.has(param.valueKind)) bad.push(`${entry.type}: ${param.path} → ${param.valueKind}`);
      // A choice with no menu is a menu the host cannot draw; the C++ side degrades it to a float,
      // and a selector that reaches that fallback has lost its option names somewhere.
      if (param.valueKind === 'choice' && !(param.choiceLabels?.length > 1)) {
        bad.push(`${entry.type}: ${param.path} is a choice with ${param.choiceLabels?.length ?? 0} labels`);
      }
    }
  }
  assert.deepEqual(bad, [], `parameters with a missing or unusable valueKind:\n  ${bad.join('\n  ')}`);
});

test('QA-06 exports the GAIA\'s switches and menus as switches and menus', () => {
  // The end-to-end version of the above, on the one sheet that is a real instrument. Before
  // valueKind, all 162-odd of the GAIA's bound controls exported as anonymous floats — every
  // waveform selector, every on/off. This asserts the shape a host would actually be handed.
  const doc = JSON.parse(serializeSheet(SHEETS.find((s) => s.file === 'QA-06-roland-gaia.cepanel')));
  const byKind = { float: 0, bool: 0, choice: 0, other: 0 };
  for (const param of doc.exportParameters ?? []) {
    byKind[param.valueKind] = (byKind[param.valueKind] ?? byKind.other) + 1;
  }
  assert.ok(byKind.choice > 0,
    'not one of the GAIA\'s choice parameters exports as a choice — they are all anonymous numbers again');
  const menuless = (doc.exportParameters ?? [])
    .filter((p) => p.valueKind === 'choice' && !(p.choiceLabels?.length > 1));
  assert.deepEqual(menuless.map((p) => p.id), [], 'a GAIA choice parameter carries no option names');
});

test('QA-08 recipe ids are unique and every recipe explains itself', () => {
  const ids = EXPORT_RECIPES.map((recipe) => recipe.id);
  assert.equal(new Set(ids).size, ids.length, 'two QA-08 recipes share an id');
  for (const recipe of EXPORT_RECIPES) {
    assert.ok(recipe.caption?.trim(), `recipe ${recipe.id} has no caption`);
    assert.ok(recipe.note?.trim().length > 10, `recipe ${recipe.id} has no note — a card that does not say what it proves proves nothing`);
  }
});

/* ------------------------------------------------------------------ 2. document integrity */

for (const sheet of SHEETS) {
  test(`${sheet.file} serializes to a loadable document`, () => {
    const doc = JSON.parse(serializeSheet(sheet));

    assert.ok(Array.isArray(doc.controls) && doc.controls.length > 0, 'a sheet with no controls checks nothing');
    assert.ok(doc.panelGuid, 'every panel document carries an export identity');
    assert.ok(doc.width > 0 && doc.height > 0, 'a sheet shorter than its content hides its last row');

    // Core.id and Core.controlType are never elided — expandControl looks the type up by them.
    const ids = doc.controls.map((control) => control._children?.Core?.id);
    assert.ok(ids.every(Boolean), 'every control needs a Core.id');
    assert.equal(new Set(ids).size, ids.length, 'duplicate Core.id — two controls would share one selection');
  });

  test(`${sheet.file} is laid out inside the sheet, with nothing stacked at the origin`, () => {
    // Expanded, not raw: the document stores controls as a diff against their type's defaults, so
    // a control sitting at its default width has no `width` in the file at all. Reading geometry
    // off the raw document would compare against undefined and pass by accident.
    const doc = JSON.parse(serializeSheet(sheet));
    for (const control of doc.controls.map(expandControl)) {
      const { x, y, width, height } = control._children.Transform;
      const id = control._children.Core.id;
      assert.ok(x >= 0 && y >= 0, `${id} placed off the top-left of the sheet at ${x},${y}`);
      assert.ok(x + width <= doc.width, `${id} runs off the right edge (${x}+${width} > ${doc.width})`);
      assert.ok(y + height <= doc.height, `${id} runs off the bottom (${y}+${height} > ${doc.height})`);
    }
  });
}

/* ------------------------------------------------------------------ 3. headless render */

for (const sheet of SHEETS) {
  test(`${sheet.file} — every control renders`, () => {
    const doc = JSON.parse(serializeSheet(sheet));
    // Render what the editor would hold, not what the file holds.
    const allControls = doc.controls.map(expandControl);
    const failures = [];
    let rendered = 0;

    for (const control of allControls) {
      const id = control._children.Core.id;
      const type = control._children.Core.controlType;
      if (NO_SSR[type]) continue;

      try {
        const { body } = render(CanvasControl, {
          props: { control, allControls, editorInteractionEnabled: false },
        });
        // A renderer that throws is obvious; one that quietly emits an empty shell is not, and
        // that is the failure mode this sheet was built for.
        if (!body || body.length < 32) failures.push(`${id} (${type}): rendered ${body?.length ?? 0} bytes`);
        else rendered++;
      } catch (error) {
        failures.push(`${id} (${type}): ${error.message}`);
      }
    }

    assert.deepEqual(failures, [], `controls failed to render:\n  ${failures.join('\n  ')}`);
    assert.ok(rendered > 0, 'nothing was rendered — the gate proved nothing');
  });
}

test('the SSR exemption list names real component types, with reasons', () => {
  for (const [type, reason] of Object.entries(NO_SSR)) {
    assert.ok(COMPONENT_TYPES[type], `NO_SSR names "${type}", which is not a component type`);
    assert.ok(reason.trim().length > 3, `NO_SSR["${type}"] has no reason`);
  }
});

/* ------------------------------------------------------------------ 4. freshness */

for (const sheet of SHEETS.filter((s) => s.commit)) {
  test(`${sheet.file} on disk matches the generator`, () => {
    let committed;
    try {
      committed = readText(path.join(QA_DIR, sheet.file));
    } catch {
      assert.fail(`CE/qa/${sheet.file} is missing — run: node tools/scripts/qa/make-qa-panels.mjs`);
    }
    assertSameText(committed, serializeSheet(sheet),
      `CE/qa/${sheet.file} is stale — run: node tools/scripts/qa/make-qa-panels.mjs`,
      { actual: 'committed', expected: 'the generator' });
  });
}

/* ------------------------------------------------------------------ 5. QA-06 device bindings */

test('QA-06 binds every parameter the GAIA profile declares', () => {
  // A device sheet that covers most of a profile is the same defect as the fifteen-parameter
  // profile it replaced: it looks complete, and the parameter nobody bound is the one nobody
  // finds. So the assertion is equality, not coverage.
  const sheet = SHEETS.find((s) => s.file === 'QA-06-roland-gaia.cepanel');
  const doc = JSON.parse(serializeSheet(sheet));

  const bound = new Set();
  for (const control of doc.controls.map(expandControl)) {
    for (const binding of control._children?.DeviceBindings?.bindings ?? []) {
      if (binding.parameterId) bound.add(binding.parameterId);
    }
  }

  const declared = new Set(gaiaProfile().parameters.map((p) => p.id));
  const unbound = [...declared].filter((id) => !bound.has(id));
  const phantom = [...bound].filter((id) => !declared.has(id));

  assert.deepEqual(unbound, [], `profile parameters with no control on QA-06: ${unbound.join(', ')}`);
  assert.deepEqual(phantom, [], `QA-06 binds parameters the profile does not declare: ${phantom.join(', ')}`);
});

test('QA-06 keeps the three tones on separate addresses', () => {
  // The failure this catches is a copy-paste one: three columns that all drive tone 1, which
  // looks completely correct on screen and sends every edit to the wrong layer.
  const sheet = SHEETS.find((s) => s.file === 'QA-06-roland-gaia.cepanel');
  const doc = JSON.parse(serializeSheet(sheet));
  const perTone = { tone1: 0, tone2: 0, tone3: 0 };

  for (const control of doc.controls.map(expandControl)) {
    for (const binding of control._children?.DeviceBindings?.bindings ?? []) {
      const prefix = String(binding.parameterId ?? '').split('.')[0];
      if (prefix in perTone) perTone[prefix] += 1;
    }
  }

  assert.ok(perTone.tone1 > 0, 'no tone 1 bindings at all');
  assert.equal(perTone.tone1, perTone.tone2, 'tone 1 and tone 2 have different numbers of bound controls');
  assert.equal(perTone.tone2, perTone.tone3, 'tone 2 and tone 3 have different numbers of bound controls');
});

test('QA-06 declares the profile it needs', () => {
  const sheet = SHEETS.find((s) => s.file === 'QA-06-roland-gaia.cepanel');
  const doc = JSON.parse(serializeSheet(sheet));
  assert.deepEqual(doc.requiredProfiles, [{ role: 'primary', profileId: 'roland-gaia-sh01', version: '*' }]);
});

test('QA-06 controls actually carry the profile\'s ranges and choices', () => {
  // The gap this closes, found by looking at the sheet rather than at the tests: the first draft
  // set `adoptMetadata: true` on every binding and stopped. Every assertion above still passed —
  // the bindings were all there, all correct, all pointing at the right parameter — and every
  // knob on screen read 0.00–1.00 and every combobox said "Option 1", because `adoptMetadata` is
  // a flag the editor reads when a parameter is DROPPED, and a generated sheet has no drop.
  //
  // "Is it bound" and "is it shaped like what it is bound to" are two questions. Only the first
  // was being asked.
  const sheet = SHEETS.find((s) => s.file === 'QA-06-roland-gaia.cepanel');
  const doc = JSON.parse(serializeSheet(sheet));
  const byId = new Map(gaiaProfile().parameters.map((p) => [p.id, p]));
  const wrong = [];

  for (const control of doc.controls.map(expandControl)) {
    const binding = control._children?.DeviceBindings?.bindings?.[0];
    const parameter = binding?.parameterId ? byId.get(binding.parameterId) : null;
    if (!parameter) continue;

    const behavior = control._children.Behavior ?? {};
    const id = control._children.Core.id;

    if (parameter.type === 'integer' || parameter.type === 'bipolar') {
      if (behavior.min !== parameter.range.min || behavior.max !== parameter.range.max) {
        wrong.push(`${id}: reads ${behavior.min}..${behavior.max}, profile says ${parameter.range.min}..${parameter.range.max}`);
      }
    } else if (parameter.type === 'choice') {
      const rows = control._children.Value?.rows ?? [];
      if (rows.length !== parameter.choices.length) {
        wrong.push(`${id}: has ${rows.length} options, profile declares ${parameter.choices.length}`);
      } else if (rows[0]?.displayText !== parameter.choices[0].label) {
        wrong.push(`${id}: first option reads "${rows[0]?.displayText}", profile says "${parameter.choices[0].label}"`);
      }
    }
  }

  assert.deepEqual(wrong, [], `controls bound to a parameter but not shaped like it:\n  ${wrong.slice(0, 12).join('\n  ')}`);
});
