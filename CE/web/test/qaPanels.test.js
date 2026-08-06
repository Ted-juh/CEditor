// qaPanels.test.js — the gate under the generated QA panel suite.
//
// The suite exists because "the amount of things to check is getting enormous" and a human
// checklist grows faster than anyone updates it. That only works if the sheets cannot fall behind
// the model, which is what this file enforces. Three jobs, in order of how much time they save:
//
//   1. COVERAGE RATCHET. Every component type must appear on QA-01; every model section must be
//      driven by QA-02 or exempted with a written reason. Add either without doing so and this
//      fails. The same shape as componentCoverage.test.js, for the same reason — a gap has no
//      symptom, so the gap itself has to be the thing that fails.
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

import { render } from 'svelte/server';

import { COMPONENT_TYPES } from '../src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';

import { SHEETS, serializeSheet } from '../../../tools/scripts/qa/make-qa-panels.mjs';
import { coveredTypes, GROUPS } from '../../../tools/scripts/qa/sheets/components.mjs';
import { coveredSections, EXEMPT, RECIPES } from '../../../tools/scripts/qa/sheets/properties.mjs';
import { gaiaProfile } from '../../../tools/scripts/qa/sheets/gaia.mjs';

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

/* ------------------------------------------------------------------ 2. document integrity */

for (const sheet of SHEETS) {
  test(`${sheet.file} serializes to a loadable document`, () => {
    const doc = JSON.parse(serializeSheet(sheet));

    assert.ok(Array.isArray(doc.controls) && doc.controls.length > 0, 'a sheet with no controls checks nothing');
    assert.ok(doc.panelGuid, 'every panel document carries an export identity');
    assert.ok(doc.width > 0 && doc.height > 0, 'a sheet shorter than its content hides its last row');

    const ids = doc.controls.map((control) => control._children?.Core?.id);
    assert.ok(ids.every(Boolean), 'every control needs a Core.id');
    assert.equal(new Set(ids).size, ids.length, 'duplicate Core.id — two controls would share one selection');
  });

  test(`${sheet.file} is laid out inside the sheet, with nothing stacked at the origin`, () => {
    const doc = JSON.parse(serializeSheet(sheet));
    for (const control of doc.controls) {
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
    const allControls = doc.controls;
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
      committed = readFileSync(path.join(QA_DIR, sheet.file), 'utf8');
    } catch {
      assert.fail(`CE/qa/${sheet.file} is missing — run: node tools/scripts/qa/make-qa-panels.mjs`);
    }
    assert.equal(committed, serializeSheet(sheet), `CE/qa/${sheet.file} is stale — run: node tools/scripts/qa/make-qa-panels.mjs`);
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
  for (const control of doc.controls) {
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

  for (const control of doc.controls) {
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
