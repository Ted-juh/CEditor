// panelStructure.test.js — ce.panel: panels that build themselves (design doc §6 phase 4).
//
// The capability the options UI structurally cannot provide: ask the device what it has, then
// generate a control per thing you found. Panel view only, because creating a control needs a
// renderer and there is none with the window shut.
//
// The rule that makes it safe to ship is idempotence, and most of this file is about that: every
// control a script creates is MARKED, cleared before onPanelBuild runs, and stripped when the panel
// is saved. Without those three the author's document fills up with something they never drew.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, setRuntimeHost, clearGeneratedControls, isGeneratedControl,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import {
  WEBVIEW_ONLY_MEMBERS, LIFECYCLE_HOOKS, handlerNamesForRuntime, RUNTIME_PLAYER, RUNTIME_WEBVIEW,
  memberPath,
} from '../src/CE_Application/scripting/panelApi.js';

// The panel declares ce.panel explicitly. On `auto` it would be derived from the panel's scripts,
// and these fixtures have none — so without this the module is (correctly) gated off and every
// verb is a stub. Declaring it is what a panel that builds itself would do anyway.
function panelWith(controls = []) {
  return {
    id: 'p', name: 'Build', width: 800, height: 400, controls,
    scripting: { modules: ['ce.panel'] },
  };
}

/** Install a panel as the runtime's host document and hand the api to `fn`. */
function withPanel(panel, fn) {
  setRuntimeHost({ panel });
  try { return fn(scriptApiForTesting('', 'build-script'), panel); } finally { setRuntimeHost(null); }
}

const names = (panel) => flatControls(panel.controls).map((c) => c._children.Core.name);
const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* ------------------------------------------------------------------------------ creating */

test('create makes a real control and returns its name', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    const name = api.panelCreate('Knob', { name: 'cutoff', x: 20, y: 40, width: 60, height: 60 });
    assert.equal(name, 'cutoff');
    assert.deepEqual(names(panel), ['cutoff']);

    const info = api.panelInfo('cutoff');
    assert.equal(info.type, 'Knob');
    assert.equal(info.x, 20);
    assert.equal(info.y, 40);
    assert.equal(info.width, 60);
    assert.equal(info.generated, true, 'a script-made control is marked as such');
  });
});

test('section overrides merge rather than replace', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    api.panelCreate('Knob', { name: 'k', Behavior: { min: 0, max: 127 } });
    const behavior = flatControls(panel.controls)[0]._children.Behavior;
    assert.equal(behavior.min, 0);
    assert.equal(behavior.max, 127);
    // A script that sets one field must not wipe the rest of the section.
    assert.ok(Object.keys(behavior).length > 2, 'the section kept its other defaults');
  });
});

test('an unknown type is refused by name, and the types are discoverable', () => {
  withPanel(panelWith(), (api) => {
    clearScriptTrace();
    assert.equal(api.panelCreate('Wurlitzer', { name: 'x' }), null);
    assert.match(traced(), /no such component type/);
    assert.match(traced(), /ce\.panel\.types\(\) lists them/, 'and says how to find out');

    const types = api.panelTypes();
    assert.ok(types.includes('Knob') && types.includes('Container'));
  });
});

test('names never collide — a generated control cannot shadow an authored one', () => {
  // Two controls answering to the same name is how set("cutoff", …) becomes ambiguous, and the
  // script cannot know what the author already used.
  const panel = panelWith([createControl('Knob', { name: 'cutoff' })]);
  withPanel(panel, (api) => {
    assert.equal(api.panelCreate('Knob', { name: 'cutoff' }), 'cutoff2');
    assert.equal(api.panelCreate('Knob', { name: 'cutoff' }), 'cutoff3');
    assert.deepEqual(names(panel), ['cutoff', 'cutoff2', 'cutoff3']);
  });
});

/* ------------------------------------------------------------------- cloning and parenting */

test('clone copies a control the author designed, including its sections', () => {
  const template = createControl('Knob', { name: 'template', Behavior: { min: 5, max: 99 } });
  const panel = panelWith([template]);
  withPanel(panel, (api) => {
    const copy = api.panelClone('template', { name: 'osc1', y: 120 });
    assert.equal(copy, 'osc1');

    const made = flatControls(panel.controls).find((c) => c._children.Core.name === 'osc1');
    assert.equal(made._children.Behavior.min, 5, 'the copy inherited the section the author set');
    assert.equal(made._children.Behavior.max, 99);
    assert.equal(made._children.Transform.y, 120, 'and the override applied');
    assert.notEqual(made._children.Core.id, template._children.Core.id, 'with a fresh id');
    assert.equal(api.panelInfo('osc1').generated, true);
    assert.equal(api.panelInfo('template').generated, false, 'the source is still the author\'s');
  });
});

test('parent moves a control into a container and back out', () => {
  const panel = panelWith([createControl('Container', { name: 'row' }), createControl('Knob', { name: 'k' })]);
  withPanel(panel, (api) => {
    assert.equal(api.panelParent('k', 'row'), true);
    assert.equal(api.panelInfo('k').parent, 'row');
    assert.equal(panel.controls.length, 1, 'it left the top level');
    assert.deepEqual(names(panel).sort(), ['k', 'row']);

    assert.equal(api.panelParent('k', null), true);
    assert.equal(api.panelInfo('k').parent, null);
    assert.equal(panel.controls.length, 2);
  });
});

test('parenting refuses the moves that would detach the tree', () => {
  const panel = panelWith([createControl('Container', { name: 'outer' }), createControl('Knob', { name: 'k' })]);
  withPanel(panel, (api) => {
    api.panelCreate('Container', { name: 'inner', parent: 'outer' });

    clearScriptTrace();
    assert.equal(api.panelParent('outer', 'outer'), false);
    assert.match(traced(), /cannot contain itself/);

    clearScriptTrace();
    assert.equal(api.panelParent('outer', 'inner'), false,
      'moving a container into its own child would detach both');
    assert.match(traced(), /would detach both/);

    clearScriptTrace();
    assert.equal(api.panelParent('k', 'nope'), false);
    assert.match(traced(), /no control named "nope"/);

    clearScriptTrace();
    assert.equal(api.panelParent('outer', 'k'), false, 'a Knob is not a container');
    assert.match(traced(), /is not a container/);
  });
});

/* ------------------------------------------------------------------- finding and destroying */

test('find narrows by name, type, parent and generated', () => {
  const panel = panelWith([createControl('Knob', { name: 'authored' })]);
  withPanel(panel, (api) => {
    api.panelCreate('Container', { name: 'row' });
    api.panelCreate('Knob', { name: 'osc1', parent: 'row' });
    api.panelCreate('Knob', { name: 'osc2', parent: 'row' });
    api.panelCreate('Label', { name: 'title' });

    assert.equal(api.panelFind().length, 5, 'no query means every control, nested ones included');
    assert.deepEqual(api.panelFind({ type: 'Knob' }).sort(), ['authored', 'osc1', 'osc2']);
    assert.deepEqual(api.panelFind({ parent: 'row' }).sort(), ['osc1', 'osc2']);
    assert.deepEqual(api.panelFind({ generated: false }), ['authored']);
    assert.deepEqual(api.panelFind('osc').sort(), ['osc1', 'osc2'], 'a bare string is a name match');
    assert.deepEqual(api.panelFind({ type: 'Knob', generated: true }).sort(), ['osc1', 'osc2']);
  });
});

test('destroy removes a control and everything inside it', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    api.panelCreate('Container', { name: 'row' });
    api.panelCreate('Knob', { name: 'inside', parent: 'row' });
    assert.equal(api.panelFind().length, 2);

    assert.equal(api.panelDestroy('row'), true);
    assert.deepEqual(api.panelFind(), [], 'the child went with its container');
    assert.equal(api.panelDestroy('gone'), false, 'destroying nothing reports nothing');
  });
});

/* --------------------------------------------------------------------------- IDEMPOTENCE */

test('clearGeneratedControls removes exactly what a script made', () => {
  const panel = panelWith([createControl('Knob', { name: 'authored' })]);
  withPanel(panel, (api) => {
    api.panelCreate('Knob', { name: 'gen1' });
    api.panelCreate('Container', { name: 'genRow' });
    api.panelCreate('Knob', { name: 'gen2', parent: 'genRow' });
    assert.equal(api.panelFind().length, 4);

    const removed = clearGeneratedControls();
    assert.equal(removed, 3);
    assert.deepEqual(names(panel), ['authored'], 'the authored panel is exactly as the author left it');
  });
});

test('running a build twice cannot double the layout', () => {
  // The failure this prevents: onPanelBuild fires on every load, so without the clear a panel
  // that generates eight rows has sixteen the second time and twenty-four the third.
  const panel = panelWith([createControl('Knob', { name: 'template' })]);
  const build = (api) => {
    for (let i = 1; i <= 4; i++) api.panelClone('template', { name: `osc${i}`, y: i * 40 });
  };

  withPanel(panel, (api) => {
    clearGeneratedControls(); build(api);
    assert.equal(api.panelFind({ generated: true }).length, 4);

    clearGeneratedControls(); build(api);
    assert.equal(api.panelFind({ generated: true }).length, 4, 'still four, not eight');
    assert.deepEqual(api.panelFind({ generated: true }).sort(), ['osc1', 'osc2', 'osc3', 'osc4'],
      'and with the same names — no osc1_copy2 drift');
  });
});

test('saving a panel does not persist what a script generated', () => {
  const panel = panelWith([createControl('Container', { name: 'row' })]);
  withPanel(panel, (api) => {
    api.panelCreate('Knob', { name: 'gen' });
    api.panelCreate('Knob', { name: 'genChild', parent: 'row' });
    assert.equal(api.panelFind().length, 3);
  });

  const saved = JSON.parse(serializePanel(panel));
  const savedNames = flatControls(saved.controls).map((c) => c._children.Core.name);
  assert.deepEqual(savedNames, ['row'],
    'the document on disk is the panel the author drew, top level and nested alike');
});

test('isGeneratedControl is the one marker everything keys off', () => {
  const panel = panelWith([createControl('Knob', { name: 'authored' })]);
  withPanel(panel, (api) => {
    api.panelCreate('Knob', { name: 'made' });
    const [authored, made] = flatControls(panel.controls);
    assert.equal(isGeneratedControl(authored), false);
    assert.equal(isGeneratedControl(made), true);
  });
});

/* ------------------------------------------------------------------- the runtime boundary */

test('the structure verbs are declared webview-only and stubbed in the C++ engines', () => {
  for (const id of ['panelCreate', 'panelClone', 'panelDestroy', 'panelParent', 'panelFind', 'panelInfo', 'panelTypes']) {
    assert.ok(WEBVIEW_ONLY_MEMBERS.includes(id), `${id} must be declared webview-only`);
  }
  assert.match(memberPath('panelCreate'), /^ce\.panel\.create$/);
});

test('onPanelBuild is a hook, not a stub, and never fires window-closed', () => {
  const hook = LIFECYCLE_HOOKS.find((h) => h.id === 'onPanelBuild');
  assert.ok(hook, 'onPanelBuild is declared');
  assert.equal(hook.runtime, RUNTIME_WEBVIEW);

  // A hook is a function the SCRIPT defines. Stubbing it in the C++ engines would define a handler
  // that shadows the user's, so it must not be in the stub list…
  assert.ok(!WEBVIEW_ONLY_MEMBERS.includes('onPanelBuild'));
  // …and the player must not probe for it either.
  assert.ok(!handlerNamesForRuntime(RUNTIME_PLAYER).includes('onPanelBuild'));
  assert.ok(handlerNamesForRuntime(RUNTIME_WEBVIEW).includes('onPanelBuild'));
});

test('a panel that has not enabled ce.panel gets the gate, not the verbs', () => {
  // The module is webview-only AND opt-in: a panel that never asked for it should not silently
  // gain the ability to rewrite itself.
  const panel = { id: 'p', name: 'Plain', controls: [], scripting: { modules: [] } };
  setRuntimeHost({ panel });
  try {
    clearScriptTrace();
    const api = scriptApiForTesting('', 'gated');
    api.panelCreate('Knob', { name: 'x' });
    assert.match(traced(), /panelCreate\(\) needs the ce\.panel module/);
    assert.deepEqual(panel.controls, [], 'and nothing was created');
  } finally { setRuntimeHost(null); }
});

test('with no panel, the verbs report it instead of throwing', () => {
  clearScriptTrace();
  const api = scriptApiForTesting('', 'no-panel');
  assert.equal(api.panelCreate('Knob', { name: 'x' }), null);
  assert.match(traced(), /no active panel to build/);
  assert.deepEqual(api.panelFind(), []);
  assert.equal(api.panelInfo('x'), null);
  assert.equal(api.panelDestroy('x'), false);
});
