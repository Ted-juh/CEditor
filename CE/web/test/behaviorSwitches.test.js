// behaviorSwitches.test.js — a behaviour's Pointer, Keyboard, Wheel and Snap switches do what they say.
//
// Component Designer › Behaviors draws four switches on every behaviour and saves them, and nothing
// read them: a knob with Wheel off turned on the wheel on the panel, in the designer's Preview and in
// an exported plug-in, and Pointer, Keyboard and Snap off changed nothing either. The owner chose to
// make them work. The panels this repository generates (GAIA, AN1x, SH-201) had Wheel off on every
// value control and turned on the wheel; they now say Wheel on, and turn as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  behaviorTakesInput,
  channelForBehaviorInput,
  constrainCustomValues,
  denormalizeCustomChannelValue,
  resolveCustomInteractionPatch,
  snapCustomChannelValue,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import { createBehaviorModule } from '../src/CE_Application/utils/customComponentFactory.js';
import { gaiaFader, gaiaKnob, gaiaLeds, stepCell } from '../../../tools/scripts/gaia-panel/components.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
const src = (path) => readFileSync(join(here, '..', 'src', 'CE_Application', path), 'utf8');

test('the switches read as they are drawn: Pointer, Keyboard and Snap on unless off, Wheel off unless on', () => {
  const behavior = (interaction) => ({ interaction });
  for (const input of ['pointer', 'keyboard']) {
    assert.equal(behaviorTakesInput(behavior({}), input), true, `${input} with nothing set`);
    assert.equal(behaviorTakesInput(behavior({ [input]: false }), input), false, `${input} off`);
  }
  assert.equal(behaviorTakesInput(behavior({}), 'wheel'), false, 'wheel with nothing set');
  assert.equal(behaviorTakesInput(behavior({ wheel: true }), 'wheel'), true);
  // Input no behaviour handles is taken as it always was.
  assert.equal(behaviorTakesInput(null, 'wheel'), true);
});

test('with Snap off a behaviour sets values between the channel\'s steps; with it on, on them', () => {
  const channel = { type: 'float', min: 0, max: 100, step: 10, snap: { enabled: true } };
  assert.equal(denormalizeCustomChannelValue(channel, 0.37), 40);
  const free = channelForBehaviorInput(channel, { interaction: { snap: false } });
  assert.equal(denormalizeCustomChannelValue(free, 0.37), 37);
  assert.equal(channelForBehaviorInput(channel, { interaction: {} }), channel, 'Snap on leaves the channel as it is');
  assert.equal(channel.snap.enabled, true, 'the channel itself is not changed');
  // An int channel still sets whole numbers.
  assert.equal(snapCustomChannelValue(channelForBehaviorInput({ ...channel, type: 'int' }, { interaction: { snap: false } }), 36.6), 37);
});

test('a drag through the shared interaction honours Snap', () => {
  const control = (snap) => ({
    _children: {
      ValueChannels: { _children: { value: { name: 'value', type: 'float', min: 0, max: 100, step: 10, defaultValue: 0, snap: { enabled: true } } } },
      Behaviors: { _children: { drive: { name: 'drive', type: 'slider', valueChannel: 'value', geometry: 'linear', dragMode: 'horizontal', interaction: { snap } } } },
      HitZones: { _children: { grab: { name: 'grab', action: 'dragValue', targetBehavior: 'drive', targetValueChannel: 'value' } } },
    },
  });
  const point = { rect: { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }, clientX: 37, clientY: 10 };
  const hit = (c) => ({ name: 'grab', zone: c._children.HitZones._children.grab });
  const snapped = resolveCustomInteractionPatch(control(true), {}, hit(control(true)), point).customValues.value;
  const free = resolveCustomInteractionPatch(control(false), {}, hit(control(false)), point).customValues.value;
  assert.equal(snapped % 10, 0, `with Snap on the drag landed on ${snapped}`);
  assert.notEqual(free % 10, 0, `with Snap off the drag still landed on a step, ${free}`);
  // And it is drawn where it landed: the preview's own constraint pass does not snap it back.
  assert.equal(constrainCustomValues(control(false), { value: free }).value, free);
  assert.equal(constrainCustomValues(control(true), { value: 37 }).value, 40);
});

test('new behaviours start the way the Behaviors editor\'s templates do', () => {
  for (const type of ['slider', 'dial', 'scroll', 'filmstrip-control']) {
    assert.equal(createBehaviorModule('b', { type }).interaction.wheel, true, `${type} takes the wheel`);
  }
  for (const type of ['button', 'toggle', 'cycle', 'xy-pad', 'piano-bar', 'selector']) {
    assert.equal(createBehaviorModule('b', { type }).interaction.wheel, false, `${type} does not`);
  }
  assert.equal(createBehaviorModule('b', { type: 'slider', interaction: { wheel: false } }).interaction.wheel, false, 'a choice made wins');
  const editor = src('sections/CustomBehaviorsEditor.svelte');
  for (const [template, wheel] of [['slider', true], ['dial', true], ['scroll', true], ['button', false], ['xyPad', false]]) {
    assert.match(editor, new RegExp(`\\{ id: '${template}'[^\\n]*wheel: ${wheel}`), `the ${template} template`);
  }
});

test('the generated panels\' value controls take the wheel, as they always turned', () => {
  for (const make of [() => gaiaKnob(), () => gaiaFader(), () => gaiaLeds({ options: [{ label: 'A', value: 0 }, { label: 'B', value: 1 }] }), () => stepCell()]) {
    for (const behavior of Object.values(make()._children.Behaviors._children)) {
      assert.equal(behavior.interaction.wheel, true, `${behavior.name} (${behavior.role})`);
    }
  }
  const panels = readdirSync(join(REPO, 'CE/panels')).filter((f) => /\.(cepanel|json)$/.test(f));
  let seen = 0;
  for (const file of panels) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node._type === 'BehaviorModule') {
        seen += 1;
        assert.equal(node.interaction?.wheel, true, `${file}: ${node.name} (${node.role}) has Wheel off`);
      }
      for (const value of Object.values(node)) visit(value);
    };
    visit(JSON.parse(readFileSync(join(REPO, 'CE/panels', file), 'utf8')));
  }
  assert.ok(seen > 700, `only ${seen} behaviours found in the panels`);
});

test('the panel (and the player it draws) and the test surface both ask the switches', () => {
  for (const [name, source] of [['PanelPreviewSurface', src('editor/PanelPreviewSurface.svelte')], ['InteractiveTestSurface', src('components/InteractiveTestSurface.svelte')]]) {
    for (const input of ['wheel', 'pointer', 'keyboard']) {
      assert.match(source, new RegExp(`behaviorTakesInput\\([^;]*'${input}'\\)`), `${name} does not ask ${input}`);
    }
    assert.match(source, /channelForBehaviorInput\(/, `${name} does not ask Snap`);
  }
});
