// The animation target as a path a person picks: Knob01 › Text › Colour (utils/targetPaths.js).
// The owner asked for it to be easy to pick a control or any part of it (2026-11-24,
// docs/design/animation-designer.md). Nothing stored changes, so the first thing held here is that
// the picker offers exactly what the Animation tab offers and writes exactly what it writes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  CONTROL_ITSELF,
  OFFERED_PROPERTIES,
  buildTarget,
  offeredTargetsFor,
  readAnimations,
  resolvedPartsOf,
} from '../src/CE_Application/utils/animationModel.js';
import {
  CRUMB_SEPARATOR,
  describeTargetPath,
  flattenTargets,
  partPlace,
  resolveShortPath,
  searchTargets,
  targetSteps,
  targetTree,
} from '../src/CE_Application/utils/targetPaths.js';

const knob = () => createControl('Knob', { Core: { name: 'Knob01' } });
const pathsOf = (tree) => flattenTargets(tree).map((item) => item.target.path).sort();

test('a knob\'s parts are grouped by their role, under the names the slider editor uses', () => {
  assert.deepEqual(partPlace('bodyCap'), { group: 'Body', label: 'Cap' });
  assert.deepEqual(partPlace('bodyTrackFill'), { group: 'Body', label: 'Value fill' });
  assert.deepEqual(partPlace('bodyTrackBase'), { group: 'Body', label: 'Track base' });
  assert.deepEqual(partPlace('pointerCurrent'), { group: 'Pointer', label: 'Current' });
  assert.deepEqual(partPlace('tickNumber'), { group: 'Ticks', label: 'Numbers' });
  assert.deepEqual(partPlace('labelTitle'), { group: 'Labels', label: 'Title' });
  // A name that only starts like a role is not one: a custom component's part called "labels".
  assert.deepEqual(partPlace('labels'), { group: '', label: 'labels' });
  assert.deepEqual(partPlace('legend'), { group: '', label: 'legend' });

  // No Background or Text: a knob has neither section; its words are its Labels parts.
  const places = targetTree(knob()).map((place) => place.label);
  assert.deepEqual(places, ['Whole control', 'Body', 'Pointer', 'Ticks', 'Labels']);
  const parts = Object.keys(resolvedPartsOf(knob()));
  const grouped = targetTree(knob()).flatMap((place) => place.parts.map((part) => part.id));
  assert.deepEqual(grouped.sort(), [...parts].sort(), 'every one of the knob\'s parts is somewhere in the groups');
});

test('the path bar reads a stored path as the person\'s example does', () => {
  const control = knob();
  assert.equal(describeTargetPath(control, { path: 'Text.Fill.colour' }), ['Knob01', 'Text', 'Colour'].join(CRUMB_SEPARATOR));
  assert.equal(describeTargetPath(control, { path: 'Background.Fill.colour' }), 'Knob01 › Background › Fill colour');
  assert.equal(describeTargetPath(control, { path: 'Background.Border.colour' }), 'Knob01 › Background › Border colour');
  assert.equal(describeTargetPath(control, { path: 'Transform.scale' }), 'Knob01 › Whole control › Scale');
  assert.equal(describeTargetPath(control, { path: 'Parts.bodyCap.Layout.scale' }), 'Knob01 › Body › Cap › Scale');
  assert.equal(describeTargetPath(control, { path: 'Parts.labelTitle.Text.Fill.colour' }), 'Knob01 › Labels › Title › Text colour');
  // A keyframe animation's target is a place.
  assert.equal(describeTargetPath(control, { path: 'Transform' }), 'Knob01 › Whole control');
  assert.equal(describeTargetPath(control, { path: 'Parts.pointerCurrent' }), 'Knob01 › Pointer › Current');
  // The knob ships two animations; every one of their targets reads without a raw step left in it.
  for (const row of readAnimations(control)) {
    for (const target of row.targets) {
      assert.ok(!targetSteps(target).some((step) => step.includes('.')), `${target.path} reads as ${targetSteps(target).join(' › ')}`);
    }
  }
});

test('the picker offers exactly what the Animation tab offers, written the way the tab writes it', () => {
  for (const type of ['Knob', 'Button', 'CustomComponent']) {
    const control = createControl(type);
    for (const kind of ['transition', 'sequence']) {
      const parts = Object.keys(resolvedPartsOf(control));
      // Less one thing: a property of a section the control does not have (a Knob's Text colour).
      const hasSection = (offered) => offered.scope !== 'root' || !/^(Background|Text)\./.test(offered.path) || !!control._children[offered.path.split('.')[0]];
      const expected = [
        ...offeredTargetsFor(control, kind, { onControl: true }).filter(hasSection).map((offered) => buildTarget(CONTROL_ITSELF, offered)),
        ...parts.flatMap((partName) => offeredTargetsFor(control, kind, { onControl: false })
          .filter((offered) => offered.scope === 'part')
          .map((offered) => buildTarget(partName, offered))),
      ].map((target) => target.path).sort();
      assert.deepEqual(pathsOf(targetTree(control, kind)), expected, `${type}, ${kind}`);
      for (const item of flattenTargets(targetTree(control, kind))) {
        assert.ok(Array.isArray(item.target.properties) && item.target.properties.length, `${item.target.path} carries the properties the runtime reads`);
      }
    }
  }
});

test('a keyframe animation picks a place, not a property', () => {
  const tree = targetTree(knob(), 'keyframes');
  assert.equal(tree[0].label, 'Whole control');
  assert.deepEqual(tree[0].target, { path: 'Transform' });
  const paths = pathsOf(tree);
  assert.ok(paths.includes('Parts.bodyCap'));
  assert.ok(paths.every((path) => path === 'Transform' || /^Parts\.[^.]+$/.test(path)), paths.join(', '));
});

test('a part that is not named by role is listed under its own name, after the control\'s places', () => {
  const button = createControl('Button');
  const tree = targetTree(button);
  assert.deepEqual(tree.slice(0, 3).map((place) => place.label), ['Whole control', 'Background', 'Text']);
  const own = tree.slice(3).map((place) => place.label);
  assert.deepEqual(own.sort(), Object.keys(resolvedPartsOf(button)).sort());
  assert.equal(tree.find((place) => place.label === 'legend').properties.length, OFFERED_PROPERTIES.length);
});

// A Button has Text and Background sections of its own, and parts; a Knob has parts only.
const button = () => createControl('Button', { Core: { name: 'Btn01' } });

test('short paths: a step that can only be one thing may be left out; two candidates are refused, both named', () => {
  const paths = [...pathsOf(targetTree(button())), ...pathsOf(targetTree(knob())).filter((path) => path.startsWith('Parts.body'))];
  assert.deepEqual(resolveShortPath(paths, 'Text.Fill.colour'), { path: 'Text.Fill.colour' });
  assert.deepEqual(resolveShortPath(paths, 'Text.colour'), { path: 'Text.Fill.colour' }, 'the owner\'s example');
  assert.deepEqual(resolveShortPath(paths, 'text.COLOUR'), { path: 'Text.Fill.colour' }, 'case is ignored');
  assert.deepEqual(resolveShortPath(paths, 'bodyCap.scale'), { path: 'Parts.bodyCap.Layout.scale' }, 'a part may leave out Parts');
  assert.deepEqual(resolveShortPath(paths, 'Parts.bodyCap.scale'), { path: 'Parts.bodyCap.Layout.scale' });

  const both = resolveShortPath(paths, 'Background.colour');
  assert.equal(both.path, undefined);
  assert.deepEqual(both.candidates.sort(), ['Background.Border.colour', 'Background.Fill.colour']);
  assert.match(both.error, /could be 2 things/);

  const none = resolveShortPath(paths, 'Text.size');
  assert.deepEqual(none.candidates, []);
  assert.match(none.error, /Nothing is called/);
  assert.match(resolveShortPath(paths, '').error, /No path/);

  // Every whole path resolves to itself: an exact path always wins over a shorter reading of it.
  for (const path of paths) assert.deepEqual(resolveShortPath(paths, path), { path });
});

test('typing in the path bar finds a target by the words it shows', () => {
  const items = flattenTargets(targetTree(button()));
  const first = (query, list = items, controlName = 'Btn01') => searchTargets(list, query, { controlName })[0]?.target.path;
  assert.equal(first('btn01 text col'), 'Text.Fill.colour', 'the owner\'s example, typed');
  assert.equal(first('text col'), 'Text.Fill.colour');
  assert.equal(first('Btn01.Text.colour'), 'Text.Fill.colour', 'a dotted entry is a short path');
  assert.deepEqual(searchTargets(items, 'Background.colour').map((item) => item.target.path).sort(),
    ['Background.Border.colour', 'Background.Fill.colour'], 'and an ambiguous one shows its candidates');
  const knobItems = flattenTargets(targetTree(knob()));
  assert.equal(first('cap scale', knobItems, 'Knob01'), 'Parts.bodyCap.Layout.scale');
  assert.equal(first('knob01 body › cap › scale', knobItems, 'Knob01'), 'Parts.bodyCap.Layout.scale');
  assert.equal(first('title text col', knobItems, 'Knob01'), 'Parts.labelTitle.Text.Fill.colour', 'a knob\'s name is its title label');
  assert.deepEqual(searchTargets(items, 'nothing like this'), []);
  assert.deepEqual(searchTargets(items, ''), []);
});
