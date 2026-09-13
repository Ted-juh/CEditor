// animationModel.test.js — the Animation tab's working parts.
//
// The headline test runs the REAL animation runtime over every property the editor's dropdown
// offers, and checks that this file's answer matches. That is the whole point of the tab: two of
// the seven do nothing, and the editor does not say so. If the runtime ever starts accepting more
// paths, this test fails rather than the tab quietly keeping an out-of-date warning.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ANIMATION_KINDS,
  newAnimationShape,
  cleanAnimationName,
  uniqueAnimationName,
  renameBlockedBecause,
  TRIGGER_TYPES,
  PART_PATHS,
  ROOT_PATHS,
  OFFERED_PROPERTIES,
  EASING_NAMES,
  EASING_BEZIERS,
  targetStatus,
  describeAnimation,
  readAnimations,
  animationsEnabled,
  describeTargets,
  deadTargetCount,
  addTarget,
  removeTarget,
  moveTarget,
  buildTarget,
  easingPoints,
  unofferedEasings,
  allAnimationFieldLabels,
} from '../src/CE_Application/utils/animationModel.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults } from '../src/CE_Application/utils/customComponentFactory.js';

/** A control with real parts and one animation carrying the given targets. */
function withAnimation(targets) {
  const control = createControl('CustomComponent');
  control._children.Parts = createCustomComponentPartsDefaults();
  control._children.Animations = {
    _type: 'Animations',
    _children: {
      test: {
        kind: 'transition',
        enabled: true,
        duration: 200,
        delay: 0,
        easing: 'outQuad',
        trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
        targets,
      },
    },
  };
  return control;
}

const partsOf = (control) => Object.keys(control._children.Parts._children);

/** What the runtime actually builds for a part: the buckets it filled in. */
function runtimeAnimates(control, partName) {
  const { runtime } = resolveInteractiveControl(control, {});
  const bucket = runtime?.transitions?.partTransitions?.get?.(partName) ?? null;
  return bucket ? Object.entries(bucket).filter(([, value]) => value).map(([key]) => key) : [];
}

// --- The headline -----------------------------------------------------------

test('this file agrees with the runtime about every property the editor offers', () => {
  for (const offered of OFFERED_PROPERTIES) {
    const base = createControl('CustomComponent');
    base._children.Parts = createCustomComponentPartsDefaults();
    const part = partsOf(base)[0];
    const target = buildTarget(part, offered);
    const control = withAnimation([target]);

    const said = targetStatus(target, partsOf(control));
    const did = runtimeAnimates(control, part);

    assert.equal(
      said.works,
      did.length > 0,
      `${offered.label}: this file says ${said.works ? 'works' : 'does nothing'}, the runtime ${did.length ? 'animates ' + did.join(', ') : 'does nothing'}`
    );
    if (said.works) assert.ok(did.includes(said.animates), `${offered.label} animates ${did.join(', ')}, not ${said.animates}`);
  }
});

test('and the two dead ones are the two the properties panel offers', () => {
  const dead = OFFERED_PROPERTIES
    .filter((offered) => !targetStatus(buildTarget('label', offered), ['label']).works)
    .map((offered) => offered.label);
  assert.deepEqual(dead, ['Fill colour', 'Text colour']);
});

test('a dead target says what the runtime does accept', () => {
  const status = targetStatus({ path: 'Parts.label.Background.Fill.colour', properties: ['background-color'] }, ['label']);
  assert.equal(status.works, false);
  assert.equal(status.reason, 'dead path');
  assert.match(status.detail, /Layout\.scale/);
});

// --- The other ways a target can do nothing ---------------------------------

test('a target with no path is reported, not skipped in silence', () => {
  assert.equal(targetStatus({}, ['label']).reason, 'no path');
  assert.equal(targetStatus({ path: '   ' }, ['label']).reason, 'no path');
});

test('a target on a part that does not exist is a different problem', () => {
  const status = targetStatus({ path: 'Parts.typo.Layout.scale', properties: ['transform'] }, ['label', 'body']);
  assert.equal(status.works, false);
  assert.equal(status.reason, 'missing part');
  assert.equal(status.part, 'typo');
  assert.match(status.detail, /no part called "typo"/);
});

test('the runtime really does build a transition for a part that is not there', () => {
  // Which is why the check above is worth having: nothing downstream complains.
  const control = withAnimation([{ path: 'Parts.typo.Layout.scale', properties: ['transform'] }]);
  assert.deepEqual(runtimeAnimates(control, 'typo'), ['transform']);
});

test('size works on a part and does nothing on the control itself', () => {
  assert.equal(targetStatus({ path: 'Parts.label.Layout.width' }, ['label']).works, true);
  const root = targetStatus({ path: 'Transform.width', properties: ['size'] }, ['label']);
  assert.equal(root.works, false);
  assert.equal(root.reason, 'no size at root');
});

test('a target on the control itself works for the three paths that exist', () => {
  for (const path of Object.keys(ROOT_PATHS)) {
    assert.equal(targetStatus({ path }, []).works, true, `${path} should work`);
  }
  assert.equal(targetStatus({ path: 'Transform.x' }, []).works, false);
});

test('a properties hint works even when the path is not in the table', () => {
  // This is the runtime's own escape hatch, and it is why a colour target could be made to work
  // one day without changing the editor — the runtime would need a colour bucket first.
  assert.equal(targetStatus({ path: 'Parts.label.Anything', properties: ['transform'] }, ['label']).works, true);
  assert.equal(targetStatus({ path: 'Parts.label.Anything', properties: ['colour'] }, ['label']).works, false);
});

test('every path in the tables maps to a bucket the runtime fills', () => {
  const base = createControl('CustomComponent');
  base._children.Parts = createCustomComponentPartsDefaults();
  const part = partsOf(base)[0];
  for (const [path, bucket] of Object.entries(PART_PATHS)) {
    const control = withAnimation([{ path: `Parts.${part}.${path}` }]);
    assert.ok(runtimeAnimates(control, part).includes(bucket), `${path} should animate ${bucket}`);
  }
});

// --- Reading animations -----------------------------------------------------

test('an animation reads with sensible values when it is half empty', () => {
  const row = describeAnimation('fade', {});
  assert.equal(row.kind, 'transition');
  assert.equal(row.duration, 120);
  assert.equal(row.delay, 0);
  assert.equal(row.easing, 'outQuad');
  assert.equal(row.triggerType, 'stateChange');
  assert.deepEqual(row.targets, []);
  assert.equal(row.enabled, true);
});

test('readAnimations lists them and ignores rubbish', () => {
  const control = withAnimation([]);
  control._children.Animations._children.broken = null;
  control._children.Animations._children.alsoBroken = 'nope';
  assert.deepEqual(readAnimations(control).map((row) => row.name), ['test']);
  assert.deepEqual(readAnimations(null), []);
});

test('the section switch turns everything off', () => {
  const control = withAnimation([]);
  assert.equal(animationsEnabled(control), true);
  control._children.Animations.enabled = false;
  assert.equal(animationsEnabled(control), false);
});

test('describeTargets attaches a status to each one and counts the dead', () => {
  const control = withAnimation([
    { path: 'Parts.label.Layout.scale', properties: ['transform'] },
    { path: 'Parts.label.Background.Fill.colour', properties: ['background-color'] },
    { path: '' },
  ]);
  const row = readAnimations(control)[0];
  const rows = describeTargets(row, partsOf(control));
  assert.deepEqual(rows.map((entry) => entry.status.works), [true, false, false]);
  assert.equal(deadTargetCount(row, partsOf(control)), 2);
});

// --- Editing the list -------------------------------------------------------

test('adding, removing and moving a target all return a new list', () => {
  const list = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
  assert.deepEqual(addTarget(list, { path: 'd' }).map((t) => t.path), ['a', 'b', 'c', 'd']);
  assert.deepEqual(removeTarget(list, 1).map((t) => t.path), ['a', 'c']);
  assert.deepEqual(moveTarget(list, 2, 0).map((t) => t.path), ['c', 'a', 'b']);
  assert.deepEqual(list.map((t) => t.path), ['a', 'b', 'c'], 'the original must not change');
});

test('the edits cope with nonsense indexes', () => {
  const list = [{ path: 'a' }];
  assert.deepEqual(removeTarget(list, 9), [{ path: 'a' }]);
  assert.deepEqual(removeTarget(list, -1), [{ path: 'a' }]);
  assert.deepEqual(moveTarget(list, 5, 0), [{ path: 'a' }]);
  assert.deepEqual(moveTarget([], 0, 1), []);
});

test('buildTarget writes the same shape the properties panel writes', () => {
  const built = buildTarget('body', OFFERED_PROPERTIES[0]);
  assert.deepEqual(built, { path: 'Parts.body.Layout.scale', properties: ['transform'] });
  assert.equal(buildTarget('body', null), null);
});

// --- Easing -----------------------------------------------------------------

test('the easing curve is the one the runtime hands to CSS', () => {
  for (const name of Object.keys(EASING_BEZIERS)) {
    const points = easingPoints(name, 8);
    assert.equal(points.length, 9);
    assert.ok(Math.abs(points[0].y) < 0.001, `${name} should start at 0`);
    assert.ok(Math.abs(points.at(-1).y - 1) < 0.001, `${name} should end at 1`);
  }
});

test('linear is a straight line', () => {
  const points = easingPoints('linear', 4);
  for (const point of points) assert.ok(Math.abs(point.y - point.x) < 0.001);
});

test('an ease-out really is fast at the start', () => {
  const out = easingPoints('outQuad', 10);
  const linear = easingPoints('linear', 10);
  assert.ok(out[2].y > linear[2].y, 'outQuad should be ahead of linear early on');
});

test('the panel offers four easings and the runtime knows five', () => {
  assert.deepEqual(unofferedEasings(), ['inQuad']);
  assert.ok(EASING_NAMES.includes('inQuad'));
});

// --- Odds and ends ----------------------------------------------------------

test('only one animation kind does anything', () => {
  assert.deepEqual(ANIMATION_KINDS, ['transition']);
  assert.deepEqual(TRIGGER_TYPES, ['stateChange', 'valueChange']);
});

test('field labels are collected for when the panel rows come out', () => {
  const labels = allAnimationFieldLabels();
  assert.ok(labels.includes('Easing'));
  assert.equal(new Set(labels).size, labels.length);
});

// --- Making and unmaking an animation ---------------------------------------
// Creating one used to stay in the properties panel, which is a gap the moment the panel's rows
// come out. The shape lives in the model so both surfaces make the same thing.

test('a new animation is the shape the properties panel makes', () => {
  const made = newAnimationShape('hoverGlow');
  assert.equal(made.name, 'hoverGlow');
  assert.equal(made.kind, 'transition');
  assert.equal(made.easing, 'outQuad');
  assert.equal(made.duration, 120);
  assert.deepEqual(made.targets, []);
  assert.deepEqual(made.trigger, { type: 'stateChange', from: ['*'], to: ['hover'] });
  // And it reads back through the tab's own reader without special-casing.
  const described = describeAnimation('hoverGlow', made);
  assert.equal(described.enabled, true);
  assert.equal(described.triggerType, 'stateChange');
});

test('a name is cleaned to something usable as a path segment', () => {
  assert.equal(cleanAnimationName('  hover glow!  '), 'hoverglow');
  assert.equal(cleanAnimationName('press_2'), 'press_2');
  assert.equal(cleanAnimationName('   '), '');
  assert.equal(cleanAnimationName(null), '');
});

test('a duplicate name is suffixed rather than silently doing nothing', () => {
  // The panel's Add bails on a duplicate — `if (… || animations?._children?.[name]) return;` — which
  // looks like a broken button.
  assert.equal(uniqueAnimationName(['a'], 'a'), 'a2');
  assert.equal(uniqueAnimationName(['a', 'a2'], 'a'), 'a3');
  assert.equal(uniqueAnimationName([], 'fresh'), 'fresh');
  assert.equal(uniqueAnimationName([], '  '), '', 'nothing usable means nothing made');
});

test('a rename says why it cannot happen', () => {
  assert.equal(renameBlockedBecause(['a', 'b'], 'a', 'c'), '');
  assert.equal(renameBlockedBecause(['a', 'b'], 'a', 'a'), '', 'renaming to itself is fine');
  assert.match(renameBlockedBecause(['a', 'b'], 'a', 'b'), /already an animation called b/);
  assert.match(renameBlockedBecause(['a'], 'a', '   '), /letters, digits or underscores/);
});

// --- What the properties panel still does -----------------------------------
// Everything above is about the tab. This last test reads the shipped panel and pins the four
// things the tab exists to fix. If somebody fixes one of them in the panel, this fails, and the
// tab's reason for existing has to be rewritten rather than left standing as a stale claim.

test('the properties panel really is the way this tab says it is', () => {
  const source = readFileSync(
    new URL('../src/CE_Application/sections/AnimationsEditor.svelte', import.meta.url),
    'utf8'
  );

  // 1. Seven properties on offer, and the two dead ones among them.
  const list = source.slice(source.indexOf('const TARGET_PROPERTIES'), source.indexOf('const QUICK_STATES'));
  assert.equal((list.match(/path: '/g) ?? []).length, 7, 'the panel offers seven properties');
  assert.match(list, /Background\.Fill\.colour/);
  assert.match(list, /Text\.Fill\.colour/);
  assert.ok(!/Layout\.width/.test(list), 'the panel has never offered width');

  // 2. The target list is a raw JSON textarea.
  assert.match(source, /targetsDraft/);
  assert.match(source, /<textarea[^>]*rows="12"/);

  // 3. Four easings, no picture of any of them.
  assert.match(source, /const EASING_OPTIONS = \['linear', 'outQuad', 'inOutQuad', 'outCubic'\]/);

  // 4. Kind is a free text box you can type any word into. The panel's own hint says transition is
  //    the only kind that does anything, so this one is a small tidy-up rather than a trap.
  const kindCell = source.slice(source.indexOf('label="Kind"'), source.indexOf('label="Kind"') + 400);
  assert.match(kindCell, /<input class="val" type="text"/);
  assert.match(kindCell, /only runtime kind/, 'the panel does warn about this one');
});
