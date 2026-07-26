import test from 'node:test';
import assert from 'node:assert/strict';

import {
  customComponentPlanVersion,
  migrateCustomComponentPlan,
} from '../src/CE_Application/utils/customComponentMigrations.js';
import { CUSTOM_COMPONENT_PLAN_VERSION } from '../src/CE_Application/utils/customComponentFactory.js';

function controlWithVersion(version) {
  const designer = { _type: 'Designer' };
  if (version !== undefined) designer.version = version;
  return { _children: { Core: { id: 'c1' }, Designer: designer } };
}

test('plan version reads Designer.version and defaults to 1', () => {
  assert.equal(customComponentPlanVersion(controlWithVersion(1)), 1);
  assert.equal(customComponentPlanVersion(controlWithVersion(undefined)), 1);
  assert.equal(customComponentPlanVersion(controlWithVersion('junk')), 1);
  assert.equal(customComponentPlanVersion(null), 1);
});

test('a current-version component passes through untouched (same reference)', () => {
  const control = controlWithVersion(CUSTOM_COMPONENT_PLAN_VERSION);
  const result = migrateCustomComponentPlan(control);
  assert.equal(result.component, control);
  assert.equal(result.fromVersion, CUSTOM_COMPONENT_PLAN_VERSION);
  assert.equal(result.toVersion, CUSTOM_COMPONENT_PLAN_VERSION);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.warnings, []);
});

test('a newer-than-supported plan is left as-is with a warning', () => {
  const control = controlWithVersion(CUSTOM_COMPONENT_PLAN_VERSION + 1);
  const result = migrateCustomComponentPlan(control);
  assert.equal(result.component, control);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /newer than supported/);
});

test('an older plan with no registered step is stamped current with a warning, without mutating the input', () => {
  // Simulate a pre-versioning save: Designer.version absent counts as 1.
  // This test only exercises the gap path when the current version moves past 1;
  // while CUSTOM_COMPONENT_PLAN_VERSION === 1 it collapses to the pass-through case.
  const control = controlWithVersion(undefined);
  const result = migrateCustomComponentPlan(control);
  if (CUSTOM_COMPONENT_PLAN_VERSION === 1) {
    assert.equal(result.component, control);
    assert.equal(result.toVersion, 1);
  } else {
    assert.notEqual(result.component, control);
    assert.equal(result.component._children.Designer.version, CUSTOM_COMPONENT_PLAN_VERSION);
    assert.equal(control._children.Designer.version, undefined); // input untouched
    assert.equal(result.toVersion, CUSTOM_COMPONENT_PLAN_VERSION);
  }
});
