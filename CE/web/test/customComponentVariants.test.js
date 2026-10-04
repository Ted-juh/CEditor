// customComponentVariants.test.js — a variant a copy picks is the look it draws with.
//
// Until 2026-09-29 nothing that drew a custom component read Variants: picking one changed the
// document and nothing on screen, in the editor or the exported plug-in. These pin the repair at
// resolveInteractiveControl, the one path all of them draw through, and the rules around it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeVariantOf, applyVariantPatches, describeVariantPatches, variantPathRefusal,
} from '../src/CE_Application/utils/customComponentVariants.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import {
  createCustomComponentBehaviorsDefaults, createCustomComponentGeneratorsDefaults, createCustomComponentPartsDefaults,
  createCustomComponentValueChannelsDefaults,
} from '../src/CE_Application/utils/customComponentFactory.js';

function component({ variants = {}, active = 'default', designerActive, parts, states = {}, generators } = {}) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'cc', controlType: 'CustomComponent' },
      Transform: { _type: 'Transform', width: 160, height: 80 },
      Designer: { _type: 'Designer', ...(designerActive !== undefined ? { activeVariant: designerActive } : {}) },
      Parts: parts ?? createCustomComponentPartsDefaults(),
      States: { _type: 'States', _children: states },
      ...(generators ? { Generators: generators } : {}),
      Variants: {
        _type: 'Variants',
        active,
        _children: {
          default: { _type: 'Variant', name: 'default', enabled: true, patches: {} },
          ...variants,
        },
      },
    },
  };
}

const dark = { _type: 'Variant', name: 'dark', enabled: true, patches: {
  'Parts.background.Background.Fill.colour': 'FF15171A',
  'Parts.label.Text.Fill.colour': 'FFEFEFEF',
  'Parts.handle.Layout.scale': 0.85,
} };
const drawn = (control) => resolveInteractiveControl(control, {}).control._children.Parts._children;

test('the variant a copy picks is what it draws', () => {
  const parts = drawn(component({ variants: { dark }, active: 'dark' }));
  assert.equal(parts.background._children.Background._children.Fill.colour, 'FF15171A');
  assert.equal(parts.label._children.Text._children.Fill.colour, 'FFEFEFEF');
  assert.equal(parts.handle._children.Layout.scale, 0.85);
});

test('the default variant, or none, draws the base look — and the document is never changed', () => {
  const control = component({ variants: { dark } });
  const base = drawn(control).background._children.Background._children.Fill.colour;
  assert.notEqual(base, 'FF15171A');
  const chosen = component({ variants: { dark }, active: 'dark' });
  drawn(chosen);
  assert.notEqual(chosen._children.Parts._children.background._children.Background._children.Fill.colour, 'FF15171A', 'resolving works on a copy');
});

test('a script or published property choosing through Designer.activeVariant is honoured', () => {
  const parts = drawn(component({ variants: { dark }, active: 'default', designerActive: 'dark' }));
  assert.equal(parts.background._children.Background._children.Fill.colour, 'FF15171A');
});

test('a stale or disabled choice falls back instead of blanking the component', () => {
  assert.equal(activeVariantOf(component({ variants: { dark }, designerActive: 'gone', active: 'dark' })).name, 'dark');
  assert.equal(activeVariantOf(component({ variants: { dark: { ...dark, enabled: false } }, active: 'dark' })), null);
  assert.equal(activeVariantOf(component({ active: 'nope' })), null);
});

test('states still act on top of the variant', () => {
  // An empty `when` and no rule is a state that is always on.
  const always = { _type: 'State', name: 'always', when: {},
    patches: { parts: { background: { 'Background.Fill.colour': 'FF00FF00' } } } };
  const parts = drawn(component({ variants: { dark }, active: 'dark', states: { always } }));
  assert.equal(parts.background._children.Background._children.Fill.colour, 'FF00FF00', 'the state wins');
  assert.equal(parts.label._children.Text._children.Fill.colour, 'FFEFEFEF', 'and the rest of the variant stays');
});

test('a patch on a part a generator makes applies once the generator has run', () => {
  const control = component({
    generators: createCustomComponentGeneratorsDefaults(),
    variants: { quiet: { _type: 'Variant', name: 'quiet', enabled: true, patches: { 'Parts.tick_major_1.visible': false } } },
    active: 'quiet',
  });
  control._children.Behaviors = createCustomComponentBehaviorsDefaults();
  control._children.ValueChannels = createCustomComponentValueChannelsDefaults();
  const parts = drawn(control);
  assert.equal(parts.tick_major_1?.visible, false, 'hidden');
  assert.notEqual(parts.tick_major_2?.visible, false, 'and only that one');
});

test('a variant cannot move a copy, resize it, or change how it behaves', () => {
  assert.match(variantPathRefusal('Transform.width'), /does not move or resize/);
  assert.match(variantPathRefusal('HitZones.knob.bounds.x'), /HitZones is how it behaves/);
  assert.match(variantPathRefusal('Designer.width'), /Designer is how it behaves/);
  assert.equal(variantPathRefusal('Parts.label.visible'), '');
  assert.equal(variantPathRefusal('Background.Fill.colour'), '');
  const control = component();
  const missed = applyVariantPatches(control, { 'Transform.width': 999, 'Parts.label.visible': false });
  assert.deepEqual(missed, {});
  assert.equal(control._children.Transform.width, 160, 'refused, not written');
  assert.equal(control._children.Parts._children.label.visible, false);
});

test('a patch on a path the component does not have is reported, not written somewhere new', () => {
  const control = component();
  const missed = applyVariantPatches(control, { 'Parts.label.Transform.scale': 0.5, 'Parts.nothing.visible': false });
  assert.deepEqual(Object.keys(missed).sort(), ['Parts.label.Transform.scale', 'Parts.nothing.visible']);
  assert.equal(control._children.Parts._children.label._children.Transform, undefined);
  const rows = describeVariantPatches({ 'Parts.label.Transform.scale': 0.5, 'Transform.x': 3, 'Parts.label.visible': false }, control);
  assert.deepEqual(rows.map((row) => row.status), ['missing', 'refused', 'ok']);
});

test('the starter presets target paths the default component really has', () => {
  // The presets the Variants tab offers, as it now builds them against the default parts.
  const presetPaths = [
    'Parts.label.Text.Font.size', 'Parts.handle.Layout.scale',
    'Parts.background.Background.Fill.colour', 'Parts.handle.Background.Fill.colour', 'Parts.label.Text.Fill.colour',
  ];
  const rows = describeVariantPatches(Object.fromEntries(presetPaths.map((path) => [path, 1])), component());
  assert.deepEqual(rows.filter((row) => row.status !== 'ok'), []);
});
