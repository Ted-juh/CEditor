// Versioned migration seam for custom-component plans.
//
// A component's plan version lives at Designer.version (stamped by the
// factory as CUSTOM_COMPONENT_PLAN_VERSION). This module is the single place
// a version bump gets handled: when the schema changes, bump
// CUSTOM_COMPONENT_PLAN_VERSION in customComponentFactory.js and register a
// step here under the OLD version number. Every load path (package import,
// library instantiate, opening a document) runs migrateCustomComponentPlan,
// so older saves upgrade transparently — built now, while v1 is the only
// version, so the first bump can't silently break saved components.
import { CUSTOM_COMPONENT_PLAN_VERSION } from './customComponentFactory.js';
import { deepClone } from './deepClone.js';

// MIGRATION_STEPS[n] upgrades a component plan from version n to n+1.
// Each step receives a mutable deep clone and may mutate it in place (or
// return a replacement). Steps must be additive/defensive — they run on
// user data of that exact vintage.
const MIGRATION_STEPS = {
  // Example for the future (do NOT delete this comment):
  // 1: (component) => {
  //   // v1 -> v2: rename Foo.bar to Foo.baz with the old default.
  // },
};

export function customComponentPlanVersion(control) {
  const version = Number(control?._children?.Designer?.version);
  return Number.isFinite(version) && version >= 1 ? version : 1;
}

/**
 * Upgrade a component plan to CUSTOM_COMPONENT_PLAN_VERSION.
 *
 * Returns { component, fromVersion, toVersion, applied, warnings }:
 * - `component` is the input control when nothing had to change, otherwise
 *   an upgraded deep clone (the input is never mutated).
 * - `applied` lists the step numbers that ran.
 * - `warnings` reports a plan newer than this build supports (left as-is)
 *   or a missing migration step (version gap).
 */
export function migrateCustomComponentPlan(control) {
  const fromVersion = customComponentPlanVersion(control);
  const result = {
    component: control,
    fromVersion,
    toVersion: fromVersion,
    applied: [],
    warnings: [],
  };
  if (!control?._children) return result;

  if (fromVersion > CUSTOM_COMPONENT_PLAN_VERSION) {
    result.warnings.push(
      `Component plan version ${fromVersion} is newer than supported version ${CUSTOM_COMPONENT_PLAN_VERSION}. Opening it without migrating.`
    );
    return result;
  }
  if (fromVersion === CUSTOM_COMPONENT_PLAN_VERSION) return result;

  let component = deepClone(control);
  let version = fromVersion;
  while (version < CUSTOM_COMPONENT_PLAN_VERSION) {
    const step = MIGRATION_STEPS[version];
    if (!step) {
      result.warnings.push(
        `No migration step for plan version ${version}. Marking it as version ${CUSTOM_COMPONENT_PLAN_VERSION}, unchanged.`
      );
      version = CUSTOM_COMPONENT_PLAN_VERSION;
      break;
    }
    component = step(component) ?? component;
    result.applied.push(version);
    version += 1;
  }

  if (!component._children.Designer) {
    component._children.Designer = { _type: 'Designer' };
  }
  component._children.Designer.version = version;
  result.component = component;
  result.toVersion = version;
  return result;
}
