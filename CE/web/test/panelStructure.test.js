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
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import {
  WEBVIEW_ONLY_MEMBERS, LIFECYCLE_HOOKS, handlerNamesForRuntime, RUNTIME_PLAYER, RUNTIME_WEBVIEW,
  memberPath, MEMBER_BY_ID, refusalOf,
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

/* ---------------------------------------------------------------------- colours in the props */
// A colour in create's or clone's props used to be stored as written, so "red" or "#000" painted
// white. They are read as set() reads a section written whole: what the panel reads is stored as
// written, CSS's short forms are written out, and one the panel cannot read refuses the whole call.

const FORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS '
  + 'colour name, rgb() or hsl().';
const errors = () => get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message);
const warnings = () => get(scriptTrace).filter((t) => t.kind === 'warn').map((t) => t.message);
const made = (panel, name) => flatControls(panel.controls).find((c) => c._children.Core.name === name);

test('a colour in create\'s props is stored as set() stores it, in a section and in a list inside one', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    const zones = [{ from: 0, colour: 'lime' }, { from: 0.8, colour: 'FFFF0000' }];
    const props = { name: 'm', Meter: { trackColour: '#abc', zones }, Core: { formFaceColour: 'teal' } };
    assert.equal(api.panelCreate('Meter', props), 'm');
    assert.equal(traced(), '', 'without a word, as set() writes a short form out');

    const sections = made(panel, 'm')._children;
    assert.equal(sections.Meter.trackColour, '#AABBCC');
    assert.deepEqual(sections.Meter.zones, [{ from: 0, colour: '#00FF00' }, { from: 0.8, colour: 'FFFF0000' }]);
    assert.equal(sections.Core.formFaceColour, '#008080');
    assert.equal(sections.Meter.peakColour, SECTION_DEFAULTS.Meter.peakColour, 'the rest of the section is kept');
    assert.equal(zones[0].colour, 'lime', 'and the script\'s own table is left as it wrote it');
  });
});

test('a colour create cannot read refuses the whole call: each is named, and nothing is made', () => {
  const panel = panelWith([createControl('Knob', { name: 'k' })]);
  withPanel(panel, (api) => {
    clearScriptTrace();
    const props = {
      name: 'm', x: 10, Meter: { trackColour: 'redd', label: 'Level', zones: [{ from: 0, colour: '#0008' }] },
    };
    const answer = api.panelCreate('Meter', props);
    assert.equal(answer, null, 'what create answers for any other refusal');
    assert.equal(refusalOf(MEMBER_BY_ID.panelCreate), 'nothing');
    assert.deepEqual(errors(), [
      `ce.panel.create("Meter"): at "Meter.trackColour", "redd" is not a colour the panel can read, so nothing `
        + `was created. ${FORMS}`,
      `ce.panel.create("Meter"): at "Meter.zones.0.colour", "#0008" is not a colour the panel can read, so `
        + `nothing was created. ${FORMS} Write "88000000".`,
    ]);
    assert.deepEqual(names(panel), ['k'], 'the panel is as it was');

    // A section's child given inside it is read where set() reads a section written whole.
    clearScriptTrace();
    assert.equal(api.panelCreate('Button', { name: 'b', Background: { Fill: { colour: 'redd' } } }), null);
    assert.deepEqual(errors(), [`ce.panel.create("Button"): at "Background.Fill.colour", "redd" is not a colour `
      + `the panel can read, so nothing was created. ${FORMS}`]);
    assert.deepEqual(names(panel), ['k']);
  });
});

test('create\'s props are sections of settings: a path as a key is refused as an option it does not take', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    assert.equal(api.panelCreate('Button', { name: 'b', 'Background.Fill.colour': 'red' }), undefined);
    assert.deepEqual(errors(), ['ce.panel.create: "Background.Fill.colour" is not one of its options, so nothing '
      + 'was done. Its options are: name, x, y, width, height, parent, and the name of any section, such as Behavior.']);
    assert.deepEqual(names(panel), []);
  });
});

test('clone reads the colours its props pass, and copies the source\'s own as they are stored', () => {
  const template = createControl('Meter', { name: 'template' });
  // Stored before the rule, and nothing the script passed: only what a script passes is read.
  template._children.Meter.peakColour = 'redd';
  const panel = panelWith([template]);
  withPanel(panel, (api) => {
    clearScriptTrace();
    assert.equal(api.panelClone('template', { name: 'a', Meter: { trackColour: 'SteelBlue' } }), 'a');
    assert.deepEqual(errors(), []);
    assert.equal(made(panel, 'a')._children.Meter.trackColour, '#4682B4');
    assert.equal(made(panel, 'a')._children.Meter.peakColour, 'redd');

    clearScriptTrace();
    assert.equal(api.panelClone('template', { name: 'b', y: 40, Meter: { trackColour: 0xFF0000 } }), null);
    assert.equal(refusalOf(MEMBER_BY_ID.panelClone), 'nothing');
    assert.deepEqual(errors(), [`ce.panel.clone("template"): at "Meter.trackColour", 16711680 is not a colour the `
      + `panel can read, so nothing was copied. ${FORMS} As text, 16711680 is "#FF0000".`]);
    assert.deepEqual(names(panel), ['template', 'a'], 'no copy was made');
  });
});

test('a Lua table of props is read as wasmoon hands it over', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  const panel = panelWith();
  setRuntimeHost({ panel });
  try {
    const api = scriptApiForTesting('', 'build-script');
    // As the runtime binds a host function for Lua: wasmoon cannot take a bare null back.
    lua.global.set('create', (...args) => api.panelCreate(...args) ?? undefined);
    clearScriptTrace();
    await lua.doString(`
      made = create("Meter", { name = "m", Meter = { trackColour = "red" }, Core = { formFaceColour = "#000" } })
      refused = create("Meter", { name = "n", Meter = { trackColour = "redd" } })
      nested = create("Button", { name = "b", Background = { Fill = { colour = "teal", gradient = {
        type = "linear", stops = { { color = "navy", position = 0 }, { color = "FF5B9BD5", position = 100 } } } } } })`);
    assert.equal(lua.global.get('made'), 'm');
    assert.equal(lua.global.get('refused'), null, 'nil in Lua');
    assert.equal(made(panel, 'm')._children.Meter.trackColour, '#FF0000');
    assert.equal(made(panel, 'm')._children.Core.formFaceColour, '#000000');
    assert.deepEqual(errors(), [`ce.panel.create("Meter"): at "Meter.trackColour", "redd" is not a colour the `
      + `panel can read, so nothing was created. ${FORMS}`]);
    assert.equal(lua.global.get('nested'), 'b');
    const fill = made(panel, 'b')._children.Background._children.Fill;
    assert.equal(fill.colour, '#008080', 'a child inside a section, from a Lua table');
    assert.deepEqual(fill.gradient.stops, [{ color: '000080', position: 0 }, { color: '5B9BD5', position: 100 }]);
    assert.deepEqual(names(panel), ['m', 'b']);
  } finally {
    lua.global.close();
    setRuntimeHost(null);
  }
});

/* ------------------------------------------------------------ a section's children in the props */
// A table inside a section whose key names one of the section's children ({ Background = { Fill =
// … } }) used to be stored beside the section's _children, where nothing reads it, so the colour in
// it was read and then had no effect. It is merged into that child, at every depth, keeping the
// child's other fields; a child the control has not made yet is made from its template first, as
// set() makes one on the way down a path.

test('a section\'s child given inside create\'s props lands where the renderer reads it', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    const props = { name: 'b', Background: { mode: 'gradient', Fill: { colour: '#FF0000' } }, Text: { Font: { size: 20 } } };
    assert.equal(api.panelCreate('Button', props), 'b');
    assert.equal(traced(), '');

    const background = made(panel, 'b')._children.Background;
    assert.equal(background._children.Fill.colour, '#FF0000', 'the colour is the Fill\'s, which the renderer reads');
    assert.equal('Fill' in background, false, 'and nothing is left beside _children');
    assert.equal(background.mode, 'gradient', 'a plain field of the section stays a plain field');
    const fill = SECTION_DEFAULTS.Background._children.Fill;
    assert.equal(background._children.Fill.solidEnabled, fill.solidEnabled, 'the Fill keeps its other fields');
    assert.deepEqual(background._children.Fill.layerOrder, fill.layerOrder);
    assert.deepEqual(Object.keys(background._children), ['Fill', 'Border', 'Corners'], 'and its siblings');
    const text = made(panel, 'b')._children.Text;
    assert.equal(text._children.Font.size, 20);
    assert.equal(text._children.Font.family, SECTION_DEFAULTS.Text._children.Font.family);
    assert.equal(props.Background.Fill.colour, '#FF0000', 'the script\'s table is left as it wrote it');
  });
});

test('a child two deep is merged the same way, made from its template where the control has none yet', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    // Background's Effects is made only when edited, from the Effects template, as set() makes it.
    const props = { name: 'b', Background: { Effects: { Bevel: { highlightColour: 'red', enabled: true } } } };
    assert.equal(api.panelCreate('Button', props), 'b');
    assert.equal(traced(), '');
    const effects = made(panel, 'b')._children.Background._children.Effects;
    assert.equal(effects._type, 'Effects');
    assert.equal(effects._children.Bevel.highlightColour, '#FF0000', 'written out, as set() writes it');
    assert.equal(effects._children.Bevel.enabled, true);
    assert.equal(effects._children.Bevel.depth, SECTION_DEFAULTS.Effects._children.Bevel.depth, 'the rest of the Bevel kept');
    assert.deepEqual(effects._children.Shadows, SECTION_DEFAULTS.Effects._children.Shadows, 'and the Effects\' other children');
    assert.notEqual(effects._children.Shadows, SECTION_DEFAULTS.Effects._children.Shadows, 'copied, not the template itself');

    // Fill's effect targets live in a _children the Fill does not have until one is made.
    assert.equal(api.panelCreate('Button', { name: 'c', Background: { Fill: { SolidEffects: { Bevel: { shadowColour: 'navy' } } } } }), 'c');
    const fill = made(panel, 'c')._children.Background._children.Fill;
    assert.equal(fill._children.SolidEffects._type, 'SolidEffects');
    assert.equal(fill._children.SolidEffects._children.Bevel.shadowColour, '#000080');
    assert.equal(fill.colour, SECTION_DEFAULTS.Background._children.Fill.colour, 'the Fill keeps its own fields');

    // Two sections, each with a child, in one call.
    assert.equal(api.panelCreate('Button', { name: 'd', Background: { Border: { colour: 'teal' } }, Text: { Fill: { colour: 'lime' } } }), 'd');
    assert.equal(made(panel, 'd')._children.Background._children.Border.colour, '#008080');
    assert.equal(made(panel, 'd')._children.Text._children.Fill.colour, '#00FF00');
    assert.equal(made(panel, 'd')._children.Background._children.Fill.colour, SECTION_DEFAULTS.Background._children.Fill.colour);
  });
});

test('a colour a nested child cannot read refuses the call, named by its whole path', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    const props = { name: 'b', Background: { Fill: { colour: 'teal' }, Effects: { Bevel: { highlightColour: 'redd' } } } };
    assert.equal(api.panelCreate('Button', props), null);
    assert.deepEqual(errors(), [`ce.panel.create("Button"): at "Background.Effects.Bevel.highlightColour", "redd" is `
      + `not a colour the panel can read, so nothing was created. ${FORMS}`]);
    assert.deepEqual(names(panel), []);
  });
});

test('a child and a field are matched in any case, as a set() path is, and a key that is neither is written with set()\'s warning', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    // The colour check reads `fill` as the Fill, since a path is matched in any case, and the merge
    // now does too. Matched exactly, `fill` was stored as a field beside Fill that nothing reads, its
    // colour read and written out for nothing.
    const props = { name: 'b', Background: { fill: { Colour: 'red' }, Mode: 'gradient', Fil: { colour: 'x' } } };
    assert.equal(api.panelCreate('Button', props), 'b');
    const background = made(panel, 'b')._children.Background;
    assert.equal(background._children.Fill.colour, '#FF0000', 'fill is the Fill, and Colour its colour');
    assert.equal(background.mode, 'gradient', 'a field is written under the document\'s own spelling');
    assert.equal('fill' in background || 'Mode' in background || 'Colour' in background._children.Fill, false);
    // A key that is neither a child nor a field of the section's template is written, as set()
    // writes one, and said in set()'s words: nothing reads it.
    assert.deepEqual(background.Fil, { colour: 'x' });
    assert.deepEqual(errors(), []);
    assert.deepEqual(warnings(), ['ce.panel.create("Button"): "Background.Fil" is a new property on a section '
      + 'with a fixed shape. It was written, but nothing reads it — check the spelling.']);

    // Two deep, the path names where the new key is; clone says it in its own name.
    clearScriptTrace();
    assert.equal(api.panelClone('b', { name: 'c', Background: { Fill: { colur: 'red' } } }), 'c');
    assert.deepEqual(warnings(), ['ce.panel.clone("b"): "Background.Fill.colur" is a new property on a section '
      + 'with a fixed shape. It was written, but nothing reads it — check the spelling.']);
  });
});

test('clone merges a child given in its props into the copy\'s, and leaves the source alone', () => {
  const template = createControl('Button', { name: 'template' });
  template._children.Background._children.Fill.colour = 'FF112233';
  template._children.Background._children.Fill.solidBlend = 'multiply';
  const panel = panelWith([template]);
  withPanel(panel, (api) => {
    clearScriptTrace();
    assert.equal(api.panelClone('template', { name: 'a', Background: { Fill: { colour: 'SteelBlue' } } }), 'a');
    assert.deepEqual(errors(), []);
    const fill = made(panel, 'a')._children.Background._children.Fill;
    assert.equal(fill.colour, '#4682B4');
    assert.equal(fill.solidBlend, 'multiply', 'the copy keeps what the source\'s Fill had');
    assert.equal(made(panel, 'template')._children.Background._children.Fill.colour, 'FF112233', 'the source is as it was');

    clearScriptTrace();
    assert.equal(api.panelClone('template', { name: 'b', Background: { Fill: { colour: 'redd' } } }), null);
    assert.deepEqual(errors(), [`ce.panel.clone("template"): at "Background.Fill.colour", "redd" is not a colour the `
      + `panel can read, so nothing was copied. ${FORMS}`]);
    assert.deepEqual(names(panel), ['template', 'a']);
  });
});

test('a gradient given in create\'s props has its stops stored in a stop\'s form, or refused by the stop', () => {
  const panel = panelWith();
  withPanel(panel, (api) => {
    clearScriptTrace();
    const gradient = { type: 'linear', angle: 90, stops: [{ color: 'red', position: 0 }, { color: '#5b9bd5', position: 100 }] };
    assert.equal(api.panelCreate('Button', { name: 'b', Background: { Fill: { gradientEnabled: true, gradient } } }), 'b');
    assert.equal(traced(), '');
    const fill = made(panel, 'b')._children.Background._children.Fill;
    assert.equal(fill.gradientEnabled, true);
    assert.deepEqual(fill.gradient, { type: 'linear', angle: 90, stops: [{ color: 'FF0000', position: 0 }, { color: '5B9BD5', position: 100 }] });
    assert.equal(gradient.stops[0].color, 'red', 'the script\'s table is left as it wrote it');

    clearScriptTrace();
    const seeThrough = { stops: [{ color: 'navy', position: 0 }, { color: 'rgba(0, 0, 255, 0.5)', position: 100 }] };
    assert.equal(api.panelCreate('Button', { name: 'c', Background: { Fill: { gradient: seeThrough } } }), null);
    assert.deepEqual(errors(), ['ce.panel.create("Button"): at "Background.Fill.gradient.stops.1.color", "rgba(0, 0, 255, '
      + '0.5)" has an alpha, and a gradient stop has none: its opacity is the gradient layer\'s, so nothing was created. '
      + 'Write "0000FF", the colour without its alpha.']);
    assert.deepEqual(names(panel), ['b']);
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

test('find refuses a filter it does not know, or a value of the wrong kind, rather than finding everything', () => {
  // Each of these filtered nothing and answered with every control on the panel, which the script
  // then went on to move, recolour or destroy.
  const panel = panelWith([createControl('Knob', { name: 'k1' }), createControl('Label', { name: 'l1' })]);
  withPanel(panel, (api) => {
    const refused = (query, message) => {
      clearScriptTrace();
      assert.deepEqual(api.panelFind(query), [], `find(${JSON.stringify(query)}) found something`);
      const errors = get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message);
      assert.deepEqual(errors, [message]);
    };
    const filters = 'Its filters are: name, type, generated, parent.';
    refused({ Type: 'Knob' }, `ce.panel.find: "Type" is not one of its filters, so nothing was found. ${filters}`);
    refused({ kind: 'Knob', parnt: 'row' },
      `ce.panel.find: "kind" and "parnt" are not among its filters, so nothing was found. ${filters}`);
    refused({ generated: 'true' }, 'ce.panel.find: generated takes true or false, not "true", so nothing was found.');
    refused({ type: 5 }, 'ce.panel.find: type takes text, not 5, so nothing was found.');
    refused(42, `ce.panel.find: the query is 42, not part of a name or a table of filters, so nothing was found. ${filters}`);
    // A Lua list arrives as an object of numbered keys, and is called a list, not filter "1".
    refused({ 1: 'Knob' }, `ce.panel.find: the query is a list, not part of a name or a table of filters, so nothing was found. ${filters}`);
    refused(['Knob'], `ce.panel.find: the query is a list, not part of a name or a table of filters, so nothing was found. ${filters}`);

    // What it understands still works, and an empty table is no filter at all.
    clearScriptTrace();
    assert.deepEqual(api.panelFind({ type: 'Knob' }), ['k1']);
    assert.deepEqual(api.panelFind({}).sort(), ['k1', 'l1']);
    assert.deepEqual(api.panelFind({ name: 'l' }), ['l1']);
    assert.equal(get(scriptTrace).filter((t) => t.kind === 'error' || t.kind === 'warn').length, 0);
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
