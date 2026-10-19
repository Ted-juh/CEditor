// scriptVisualValues.test.js — colours, scales and words a script hands to the drawing and colour
// parts of the API, and what happens when one is wrong.
//
// Each of these was a silent failure, reproduced before it was fixed: a colour property took any
// string and painted white for most of them; ce.draw handed the panel's own AARRGGBB to SVG, which
// cannot read it; numbers on a 0..1 scale written out of 100 were clamped or used as they were; text
// alignment ignored "center"; and ce.anim moved a value to 0 when its target was not a number. The
// rule now is the one the rest of the API follows: what cannot be read is refused, nothing is drawn,
// set or answered, and the message names the call and says what to write instead.
//
// A colour property, by the owner's later decision, also takes CSS's shorter forms where each has
// one reading ("#RGB", the names, rgb(), hsl()) and stores them written out, without a word; what
// has two readings (a number, "#" with four digits) or none is refused as before. The ce.math colour
// helpers read a colour as if that written-out form had been given, and refuse what a property
// refuses, ending with the same hint.
//
// scriptPreludeAgreement.test.js holds the exported plug-in's preludes to the same words for the
// ce.math helpers and ce.anim; this file is about the behaviour itself, in the panel view.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get as storeGet } from 'svelte/store';
import { render } from 'svelte/server';

import {
  scriptApiForTesting, setRuntimeHost, drawCommandsFor, clearAllDrawings, tickAnimations,
  stopAllAnimations,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { appSettings } from '../src/CE_Application/stores/appSettings.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { scriptDrawings } from '../src/CE_Application/stores/scriptDraw.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import {
  CSS_NAMED_COLOURS, colourFieldAt, drawColour, isPanelColour, mapColourWrites, panelColour,
} from '../src/CE_Application/scripting/scriptColours.js';
import { parseHexColor } from '../src/CE_Application/editor/canvasControlStyles.js';
import ScriptDrawOverlay from '../src/CE_Application/editor/ScriptDrawOverlay.svelte';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const FORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS '
  + 'colour name, rgb() or hsl().';
const DRAW_FORMS = 'A drawing colour is the panel\'s RRGGBB or AARRGGBB, as get() returns it, or a '
  + 'CSS colour such as "#5B9BD5", "rgb(91, 155, 213)" or "steelblue".';

const errors = () => storeGet(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message);
const warns = () => storeGet(scriptTrace).filter((e) => e.kind === 'warn').map((e) => e.message);
const everything = () => storeGet(scriptTrace).map((e) => `${e.kind}: ${e.message}`);

/** CSS's shorter forms, as a colour property stores them: the panel's RRGGBB, or AARRGGBB with alpha. */
const WRITTEN_OUT = [
  ['#000', '#000000'],
  ['#abc', '#AABBCC'],
  ['red', '#FF0000'],
  ['RED', '#FF0000'],
  ['SteelBlue', '#4682B4'],
  ['transparent', '00000000'],
  ['rgb(0, 0, 0)', '#000000'],
  ['rgb(91 155 213)', '#5B9BD5'],
  ['rgba(255, 0, 0, 0.5)', '80FF0000'],
  ['rgba(255, 0, 0, 1)', '#FF0000'],
  ['rgb(255 0 0 / 50%)', '80FF0000'],
  ['hsl(0, 100%, 50%)', '#FF0000'],
  ['HSL(210deg 60% 60%)', '#5C99D6'],
  ['hsla(120, 100%, 50%, 0.25)', '4000FF00'],
];

/** What stays refused in a colour property, with the end of each refusal: the form to write, if any. */
const STILL_REFUSED = [
  ['000', ' Write "000000".'],
  ['#0008', ' Write "88000000".'],
  ['0008', ' Write "88000000".'],
  ['currentColor', ''],
  [' red', ' Write "#FF0000".'],
  ['#5B9BD5 ', ' Write "#5B9BD5".'],
  ['#12345', ''],
  ['blurple', ''],
  ['nonsense', ''],
  // Text that is the panel's own form once the space is gone is hinted as that text, and "#" with
  // eight digits stays AARRGGBB in the hint as it is without the space, not CSS's RRGGBBAA.
  [' #5B9BD580', ' Write "#5B9BD580".'],
  ['5B9BD5\t', ' Write "5B9BD5".'],
  [' rgb(1, 2, 3)', ' Write "#010203".'],
  // On every object's prototype, and not names: reading them as names threw.
  ['constructor', ''],
  ['__proto__', ''],
  // A hue too large to be a number has no angle: it was stored as "#NANNANNAN".
  ['hsl(1e400, 50%, 50%)', ''],
  ['hsl(1e308turn 50% 50%)', ''],
];

/** An editor panel (the store, not a host) with a Label, a Knob and a Button, every module on. */
function withControls(fn) {
  const label = createControl('Label', { name: 'L' });
  const knob = createControl('Knob', { name: 'K' });
  const button = createControl('Button', { name: 'B' });
  panels.set([{
    id: 'p', name: 'P', controls: [label, knob, button],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'visual-script')); } finally { panels.set([]); }
}

function withIcons(entries, fn) {
  const before = storeGet(appSettings);
  appSettings.set({ ...before, icons: entries });
  try { return fn(); } finally { appSettings.set(before); }
}

/** A drawing surface, as scriptDraw.test.js sets one up. */
function withScreen(fn) {
  const panel = {
    id: 'p', name: 'Scope', width: 400, height: 200, scripting: { modules: ['ce.draw', 'ce.math'] },
    controls: [createControl('Background', { name: 'screen', Transform: { width: 120, height: 60 } })],
  };
  setRuntimeHost({ panel });
  clearScriptTrace();
  try { return fn(scriptApiForTesting('screen', 'draw-script')); } finally {
    clearAllDrawings();
    setRuntimeHost(null);
  }
}

/* ================================================================ which properties are colours */

test('a colour property is one whose section template holds a colour, not one whose name says so', () => {
  const bare = { _children: {} };
  // Typed by its default, a colour, where the name says nothing: the icon tint and the image tints.
  assert.ok(colourFieldAt(bare, 'Icon.tint'));
  assert.ok(colourFieldAt(bare, 'Background.Fill.imageTint'));
  assert.ok(colourFieldAt(bare, 'Pixel.glassTint'));
  // Named like a colour, and a true/false switch: the name alone would have refused true here.
  assert.equal(colourFieldAt(bare, 'Pixel.imageColour'), null);
  // Inside a typed section, below a plain object, and at any position in a list.
  assert.ok(colourFieldAt(bare, 'Background.Border.top.colour'));
  assert.ok(colourFieldAt(bare, 'Meter.zones.7.colour'), 'the template\'s first zone types the eighth');
  // Not colours at all.
  assert.equal(colourFieldAt(bare, 'Text.content'), null);
  assert.equal(colourFieldAt(bare, 'Background.Fill.mode'), null);
  assert.equal(colourFieldAt(bare, 'Value.value'), null);
  // A default of "" is no colour of its own. The name decides those few, and "" stays writable.
  assert.deepEqual(colourFieldAt(bare, 'Text.Font.underlineColour'), { empty: true, tokens: true });
  assert.deepEqual(colourFieldAt(bare, 'Background.Fill.colour'), { empty: false, tokens: true });
  assert.deepEqual(colourFieldAt(bare, 'Icon.tint'), { empty: false, tokens: false },
    'the renderer resolves a control-set reference only under a key it calls a colour');
  // Paths are matched as set() matches them, without regard to case.
  assert.ok(colourFieldAt(bare, 'background.fill.COLOUR'));
});

test('what the panel can read is what its renderer reads', () => {
  for (const ok of ['5B9BD5', '#5B9BD5', 'FF5B9BD5', '#805b9bd5']) {
    assert.ok(isPanelColour(ok), ok);
    assert.ok(!Number.isNaN(parseHexColor(ok, null).r), `${ok} reads as a colour`);
  }
  // Everything the renderer paints white instead of the colour meant.
  for (const bad of ['#000', '000', 'red', 'rgb(0,0,0)', ' 5B9BD5', '#12#34#56', 'x5B9BD5', '', 0xFF0000]) {
    assert.ok(!isPanelColour(bad), String(bad));
  }
});

/* ======================================================================== set() on a colour */

test('set() writes CSS\'s short forms out in full, says nothing, and get() returns what was stored', () => {
  // These were refused, with the long form in the message. The owner chose to accept them.
  withControls((api) => {
    const path = 'L.Background.Fill.colour';
    for (const [value, stored] of WRITTEN_OUT) {
      api.set(path, 'FF112233');
      clearScriptTrace();
      api.set(path, value);
      assert.deepEqual(everything(), [], `${value} is taken without a word`);
      assert.equal(api.get(path), stored, value);
      assert.ok(isPanelColour(stored), `${stored} is a form the panel reads`);
    }
    // What is stored is the colour CSS means: the renderer reads "#4682B4" as steelblue.
    const { r, g, b } = parseHexColor(panelColour('SteelBlue').colour, null);
    assert.deepEqual([r, g, b], [0x46, 0x82, 0xB4]);
  });
});

test('set() still refuses what has more than one reading, or none, and says what to write', () => {
  withControls((api) => {
    const path = 'L.Background.Fill.colour';
    api.set(path, 'FF112233');
    for (const [value, hint] of STILL_REFUSED) {
      clearScriptTrace();
      api.set(path, value);
      assert.deepEqual(errors(), [`set("${path}"): "${value}" is not a colour the panel can read, so nothing `
        + `was set. ${FORMS}${hint}`]);
      assert.equal(api.get(path), 'FF112233', `${value} must not be stored`);
    }
    // A number could be RRGGBB or AARRGGBB, so it is not guessed at; the refusal says how it reads.
    for (const [value, hint] of [
      [0xFF0000, ' As text, 16711680 is "#FF0000".'],
      [0xFF0000FF, ' As text, 4278190335 is "FF0000FF".'],
    ]) {
      clearScriptTrace();
      api.set(path, value);
      assert.deepEqual(errors(), [`set("${path}"): ${value} is not a colour the panel can read, so nothing `
        + `was set. ${FORMS}${hint}`]);
    }
    clearScriptTrace();
    api.set(path, undefined);
    assert.deepEqual(errors(), [`set("${path}"): no colour was given, so nothing was set. ${FORMS}`]);
    assert.equal(api.get(path), 'FF112233');
  });
});

test('set() takes every form the panel reads, exactly as written', () => {
  withControls((api) => {
    for (const value of ['#000000', '000000', 'FF000000', '#80FF0000', 'abcdef']) {
      clearScriptTrace();
      api.set('L.Background.Fill.colour', value);
      assert.deepEqual(errors(), [], value);
      assert.equal(api.get('L.Background.Fill.colour'), value);
    }
    // The set's own named colours, where the renderer resolves them.
    api.set('L.Background.Fill.colour', '{accent}');
    assert.deepEqual(errors(), []);
  });
});

test('"" is a colour only where the property has none of its own', () => {
  withControls((api) => {
    // A Font's underline colour defaults to "": draw it in the text's own colour.
    api.set('L.Text.Font.underlineColour', 'FFFF0000');
    api.set('L.Text.Font.underlineColour', '');
    assert.deepEqual(errors(), []);
    assert.equal(api.get('L.Text.Font.underlineColour'), '');
    api.set('L.Text.Font.underlineColour', '#000');
    assert.deepEqual(errors(), []);
    assert.equal(api.get('L.Text.Font.underlineColour'), '#000000', 'a short form is written out here too');
    api.set('L.Text.Font.underlineColour', 'none');
    assert.deepEqual(errors(), ['set("L.Text.Font.underlineColour"): "none" is not a colour the panel can '
      + 'read, so nothing was set. A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", '
      + 'or "#RGB", a CSS colour name, rgb() or hsl(), or "" for none.']);
    clearScriptTrace();
    api.set('L.Background.Fill.colour', '');
    assert.equal(errors().length, 1, 'a fill has a colour of its own, and "" painted it white');
  });
});

test('a control-set reference is read where the renderer resolves one, and only a name the set has', () => {
  withControls((api) => {
    api.set('L.Background.Fill.colour', '{nosuch}');
    assert.deepEqual(errors(), [`set("L.Background.Fill.colour"): "{nosuch}" is not a colour the panel can `
      + `read, so nothing was set. ${FORMS} The panel's control set has no colour called "nosuch".`]);
    clearScriptTrace();
    api.set('B.Icon.tint', '{accent}');
    assert.deepEqual(errors(), [`set("B.Icon.tint"): "{accent}" is not a colour the panel can read, so `
      + `nothing was set. ${FORMS} A control-set colour is not read in this property.`]);
  });
});

test('a whole section or list written at once is looked into, field by field', () => {
  withControls((api) => {
    const before = api.get('L.Background.Border.top.colour');
    api.set('L.Background.Border.top', { style: 'solid', thickness: 3, colour: '#0008' });
    assert.deepEqual(errors(), ['set("L.Background.Border.top"): at colour, "#0008" is not a colour the panel '
      + `can read, so nothing was set. ${FORMS} Write "88000000".`]);
    assert.equal(api.get('L.Background.Border.top.colour'), before);
    assert.notEqual(api.get('L.Background.Border.top.thickness'), 3, 'and nothing else in it was written');
    // A short form inside it is written out, and the script's own table is left as it wrote it.
    clearScriptTrace();
    const top = { style: 'solid', thickness: 3, colour: 'red' };
    api.set('L.Background.Border.top', top);
    assert.deepEqual(errors(), []);
    assert.equal(api.get('L.Background.Border.top.colour'), '#FF0000');
    assert.equal(api.get('L.Background.Border.top.thickness'), 3);
    assert.equal(top.colour, 'red');
  });
  // A list, at every position, copied only where something changed.
  const bare = { _children: {} };
  const zones = [{ from: 0, colour: 'lime' }, { from: 0.8, colour: 'FFFF0000' }];
  const stored = mapColourWrites(bare, 'Meter.zones', zones, (at, value, field) => panelColour(value, field).colour);
  assert.deepEqual(stored, [{ from: 0, colour: '#00FF00' }, { from: 0.8, colour: 'FFFF0000' }]);
  assert.equal(stored[1], zones[1], 'an entry with nothing to write out is the same entry');
  assert.equal(zones[0].colour, 'lime');
  const unchanged = { from: 0, colour: '#00FF00' };
  assert.equal(mapColourWrites(bare, 'Meter.zones.0', unchanged, (at, value) => value), unchanged);
});

test('a property that is not a colour is left alone, whatever it is called', () => {
  withControls((api) => {
    api.set('L.Text.content', 'red');
    api.set('L.Background.Fill.mode', 'solid');
    assert.deepEqual(errors(), []);
    assert.equal(api.get('L.Text.content'), 'red');
  });
});

/* ========================================================================== ce.panel.patch */

test('ce.panel.patch reads a colour as set() does, and refuses the whole patch over one it cannot read', () => {
  // On the Button, which has a Background to patch (a Knob draws through its parts and has none,
  // so a patch of its Background leads nowhere, which ce.panel.patch reports on its own).
  withControls((api) => {
    api.panelDefine('B', 'States', 'Hot', {});
    clearScriptTrace();
    assert.equal(api.panelPatch('B', 'Hot', { 'Background.Fill.colour': '#0008', 'Transform.opacity': 60 }), 0);
    assert.deepEqual(errors(), ['ce.panel.patch("B", "Hot"): at "Background.Fill.colour", "#0008" is not a '
      + `colour the panel can read, so nothing was patched. ${FORMS} Write "88000000".`]);
    assert.deepEqual(api.panelEntry('B', 'States', 'Hot').patches?.component ?? {}, {},
      'the state is as it was: nothing from the refused patch landed');
    // A part's patch is typed by the part's sections, or by the templates when it has none.
    api.panelDefine('K', 'States', 'Hot', {});
    clearScriptTrace();
    api.panelPatch('K', 'Hot', { 'Background.Fill.colour': 'currentColor' }, 'cap');
    assert.equal(errors().length, 1);
    assert.match(errors()[0], /^ce\.panel\.patch\("K", "Hot"\): at "Background\.Fill\.colour", "currentColor" is not/);
    // A short form is stored written out, as set() stores it; what the panel reads goes in as written.
    for (const [value, stored] of [['#000', '#000000'], ['hsla(0, 100%, 50%, 0.5)', '80FF0000'],
      ['#000000', '#000000']]) {
      clearScriptTrace();
      assert.equal(api.panelPatch('B', 'Hot', { 'Background.Fill.colour': value }), 1, value);
      assert.deepEqual(errors(), []);
      assert.equal(api.panelEntry('B', 'States', 'Hot').patches.component['Background.Fill.colour'], stored);
    }
  });
});

test('ce.panel.patch reads every colour in a whole patch map, and names each one it cannot read', () => {
  withControls((api) => {
    api.panelDefine('B', 'States', 'Hot', {});
    clearScriptTrace();
    assert.equal(api.panelPatch('B', 'Hot', {
      'Background.Fill.colour': 'redd',
      'Text.Fill.colour': '#0008',
      'Background.Border.top.colour': 'red',
      'Transform.opacity': 60,
    }), 0);
    assert.deepEqual(errors(), [
      `ce.panel.patch("B", "Hot"): at "Background.Fill.colour", "redd" is not a colour the panel can read, so `
        + `nothing was patched. ${FORMS}`,
      `ce.panel.patch("B", "Hot"): at "Text.Fill.colour", "#0008" is not a colour the panel can read, so nothing `
        + `was patched. ${FORMS} Write "88000000".`,
    ]);
    assert.deepEqual(api.panelEntry('B', 'States', 'Hot').patches?.component ?? {}, {});
    // Several paths that are all colours it reads are written out together, as one patch.
    clearScriptTrace();
    assert.equal(api.panelPatch('B', 'Hot', {
      'Background.Fill.colour': 'red', 'Text.Fill.colour': 'hsl(120, 100%, 50%)', 'Background.Border.top.colour': 'FF0000FF',
    }), 3);
    assert.deepEqual(errors(), []);
    assert.deepEqual(api.panelEntry('B', 'States', 'Hot').patches.component, {
      'Background.Fill.colour': '#FF0000', 'Text.Fill.colour': '#00FF00', 'Background.Border.top.colour': 'FF0000FF',
    });
  });
});

/* ===================================================================================== tints */

test('ce.image.icon writes a short tint out, refuses one the panel cannot read, and applies the rest', () => {
  // "#000" had its "#" taken off and was stored as "000", which the renderer reads as no tint.
  withIcons([{ id: 'i1', name: 'waveform', enabled: true, dataUrl: PNG }], () => withControls((api) => {
    assert.equal(api.imageIcon('B', 'waveform', { size: 20, tint: '#0008' }), false);
    assert.deepEqual(errors(), [`ce.image.icon("B"): tint refused — "#0008" is not a colour the panel can `
      + `read. ${FORMS} Write "88000000".`]);
    assert.equal(api.get('B.Icon.size'), 20, 'the other options are applied');
    assert.equal(api.get('B.Icon.tint'), 'FFFFFFFF', 'the tint is not');
    // Stored without its "#", as a tint always was, and with its digits written out.
    for (const [tint, stored] of [['#000', '000000'], ['red', 'FF0000'], ['rgba(255, 0, 0, 0.5)', '80FF0000'],
      ['#80FF0000', '80FF0000']]) {
      clearScriptTrace();
      assert.equal(api.imageIcon('B', 'waveform', { tint }), true, tint);
      assert.deepEqual(everything(), [], tint);
      assert.equal(api.get('B.Icon.tint'), stored, tint);
    }
  }));
});

test('ce.image.icon\'s opacity warning only offers a number that is on its scale', () => {
  withIcons([{ id: 'i1', name: 'waveform', enabled: true, dataUrl: PNG }], () => withControls((api) => {
    api.imageIcon('B', 'waveform', { opacity: 150 });
    // It said "write 1.5", which is still above 1.
    assert.deepEqual(warns(), ['ce.image.icon("B"): opacity runs from 0 to 1 here, so 150 is fully solid.']);
    clearScriptTrace();
    api.imageIcon('B', 'waveform', { opacity: 50 });
    assert.deepEqual(warns(), ['ce.image.icon("B"): opacity runs from 0 to 1 here, so 50 is fully solid. '
      + 'If you meant 50 out of 100, write 0.5.']);
  }));
});

test('ce.image.set writes a short tint out, and refuses one the panel cannot read in its own words', () => {
  withControls((api) => {
    const before = api.get('L.Background.Fill.imageTint');
    assert.equal(api.imageSet('L', PNG, { tint: 'currentColor' }), false);
    assert.deepEqual(errors(), [`ce.image.set("L"): tint refused — "currentColor" is not a colour the panel `
      + `can read. ${FORMS}`]);
    assert.equal(api.get('L.Background.Fill.imageSrc'), PNG, 'the picture still goes on');
    assert.equal(api.get('L.Background.Fill.imageTint'), before);
    for (const [tint, stored] of [['red', 'FF0000'], ['#abc', 'AABBCC'], ['hsl(0 100% 50% / 25%)', '40FF0000'],
      ['#5B9BD5', '5B9BD5']]) {
      clearScriptTrace();
      assert.equal(api.imageSet('L', PNG, { tint }), true, tint);
      assert.deepEqual(errors(), [], tint);
      assert.equal(api.get('L.Background.Fill.imageTint'), stored, tint);
    }
  });
});

/* ===================================================================== ce.draw.fill / stroke */

test('a drawing in the panel\'s own colour forms paints that colour', () => {
  // "FF5B9BD5" is what get() returns for a colour property and what ce.math.alpha() makes. SVG
  // cannot read it, so a drawing in a control's own colour painted nothing.
  withScreen((api) => {
    const fills = [];
    for (const colour of ['FF5B9BD5', '5B9BD5', '805B9BD5', api.colourAlpha('#5B9BD5', 0.5)]) {
      api.drawFill(colour);
      api.drawRect(0, 0, 1, 1);
      fills.push(drawCommandsFor('screen').at(-1).fill);
    }
    assert.deepEqual(fills, ['#5B9BD5', '#5B9BD5', 'rgba(91, 155, 213, 0.502)', 'rgba(91, 155, 213, 0.502)']);
    assert.deepEqual(errors(), []);
    const html = render(ScriptDrawOverlay, {
      props: { controlId: Object.keys(storeGet(scriptDrawings))[0], width: 120, height: 60 },
    }).body;
    assert.match(html, /fill="#5B9BD5"/);
  });
});

test('what CSS reads already is kept exactly as written, "#" with eight digits included', () => {
  withScreen((api) => {
    for (const colour of ['#5B9BD5', '#fff', '#5B9BD580', '#0008', 'steelblue', 'RebeccaPurple',
      'transparent', 'rgb(91, 155, 213)', 'rgba(91,155,213,.5)', 'rgb(91 155 213 / 50%)',
      'hsl(210, 60%, 60%)', 'hsla(210deg 60% 60% / 0.5)']) {
      api.drawFill(colour);
      api.drawRect(0, 0, 1, 1);
      assert.equal(drawCommandsFor('screen').at(-1).fill, colour, colour);
    }
    for (const none of ['', 'none', undefined]) {
      api.drawFill(none);
      api.drawRect(0, 0, 1, 1);
      assert.equal(drawCommandsFor('screen').at(-1).fill, null, `${none} stops filling`);
    }
    assert.deepEqual(errors(), []);
  });
});

test('a drawing colour nothing can read is refused, and the fill or stroke in force stays', () => {
  withScreen((api) => {
    api.drawFill('#111');
    api.drawStroke('#222', 2);
    for (const [colour, why, hint] of [
      [0xFF0000, '16711680 is a number, not a colour', ' As text, 16711680 is "#FF0000".'],
      ['blurple', '"blurple" is not a colour', ''],
      ['FF5B9BD5Z', '"FF5B9BD5Z" is not a colour', ''],
      ['000', '"000" is not a colour', ' Write "000000".'],
      [{ r: 1, g: 2, b: 3 }, 'the value given is neither a colour nor a gradient from ce.draw.gradient()', ''],
    ]) {
      clearScriptTrace();
      api.drawFill(colour);
      api.drawStroke(colour, 9);
      assert.deepEqual(errors(), [
        `ce.draw.fill: ${why}, so the fill stays as it was. ${DRAW_FORMS}${hint}`,
        `ce.draw.stroke: ${why}, so the stroke stays as it was. ${DRAW_FORMS}${hint}`,
      ]);
    }
    api.drawRect(0, 0, 1, 1);
    const c = drawCommandsFor('screen').at(-1);
    assert.deepEqual([c.fill, c.stroke, c.strokeWidth], ['#111', '#222', 2]);
  });
});

test('the named colours are CSS\'s own list, all 148', () => {
  const names = Object.keys(CSS_NAMED_COLOURS);
  assert.equal(names.length, 148);
  assert.ok(names.every((n) => /^[a-z]+$/.test(n) && /^[0-9A-F]{6}$/.test(CSS_NAMED_COLOURS[n])));
  assert.equal(CSS_NAMED_COLOURS.rebeccapurple, '663399');
  assert.equal(CSS_NAMED_COLOURS.grey, CSS_NAMED_COLOURS.gray);
  assert.ok(!('currentcolor' in CSS_NAMED_COLOURS), 'a keyword whose colour comes from the page is not one');
  assert.deepEqual(drawColour('currentColor').why, '"currentColor" is not a colour');
});

/* =================================================================================== gradient */

test('a gradient stop is read like a fill, and one that cannot be read refuses the gradient', () => {
  withScreen((api) => {
    const g = api.drawGradient([{ at: 0, colour: 'FF101116' }, { at: 1, colour: '805B9BD5', opacity: 0.5 }]);
    assert.deepEqual(g.stops, [
      { colour: '#101116', at: 0, opacity: 1 },
      { colour: 'rgba(91, 155, 213, 0.502)', at: 1, opacity: 0.5 },
    ]);
    for (const [stops, message] of [
      // `at = 50` was clamped to 1, which sent the middle stop to the end.
      [[{ at: 0, colour: '#000' }, { at: 50, colour: '#888' }, { at: 1, colour: '#fff' }],
        'ce.draw.gradient: the position (at) of stop 2 of 3 is a number from 0 to 1, and 50 is not, so '
        + 'there is no gradient. If you meant 50 out of 100, write 0.5.'],
      [[{ at: 0, colour: '#000' }, { at: '50%', colour: '#fff' }],
        'ce.draw.gradient: the position (at) of stop 2 of 2 is a number from 0 to 1, and "50%" is not, so '
        + 'there is no gradient. If you meant 50%, write 0.5.'],
      [[{ colour: '#000', opacity: 50 }, '#fff'],
        'ce.draw.gradient: the opacity of stop 1 of 2 is a number from 0 to 1, and 50 is not, so there is no '
        + 'gradient. If you meant 50 out of 100, write 0.5.'],
      [['#000', 'nope'],
        `ce.draw.gradient: in stop 2 of 2, "nope" is not a colour, so there is no gradient. ${DRAW_FORMS}`],
      // A stop written as a pair, [at, colour], which is not a form a stop takes.
      [[[0, '#101116'], [1, '#3A6EA5']],
        'ce.draw.gradient: stop 1 of 2 has no colour, so there is no gradient. A stop is a colour, or '
        + '{ at, colour, opacity }.'],
      [['#000', ''],
        'ce.draw.gradient: stop 2 of 2 has no colour, so there is no gradient. A stop is a colour, or '
        + '{ at, colour, opacity }.'],
    ]) {
      clearScriptTrace();
      assert.equal(api.drawGradient(stops), undefined, JSON.stringify(stops));
      assert.deepEqual(errors(), [message]);
    }
    // Fewer than two stops is documented as no gradient, and stays silent.
    clearScriptTrace();
    assert.equal(api.drawGradient(['#000']), undefined);
    assert.deepEqual(errors(), []);
  });
});

/* ==================================================================================== opacity */

test('ce.draw.opacity refuses a number outside 0..1, offering the number out of 100 when it fits', () => {
  withScreen((api) => {
    for (const [a, tail] of [
      [50, ' If you meant 50 out of 100, write 0.5.'],
      [128, ''],
      [-0.5, ''],
      ['50%', ' If you meant 50%, write 0.5.'],
      ['half', ''],
    ]) {
      clearScriptTrace();
      api.drawOpacity(a);
      const shown = typeof a === 'string' ? `"${a}"` : String(a);
      assert.deepEqual(errors(), [`ce.draw.opacity: the opacity is a number from 0 to 1, and ${shown} is not, `
        + `so the opacity stays as it was.${tail}`]);
    }
    api.drawOpacity('0.25');
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen').at(-1).opacity, 0.25, 'text that is a number is read as one');
    api.drawOpacity(1);
    api.drawRect(0, 0, 1, 1);
    assert.equal(drawCommandsFor('screen').at(-1).opacity, 1, 'the ends of the scale are on it');
  });
});

/* ================================================================================ text align */

test('ce.draw.text reads its alignment without regard to case, and every spelling of centre', () => {
  withScreen((api) => {
    for (const [align, read] of [['left', 'left'], ['Right', 'right'], ['MIDDLE', 'middle'],
      ['center', 'middle'], ['centre', 'middle'], ['Centred', 'middle'], [undefined, 'left'], ['', 'left']]) {
      api.drawText(0, 10, 'x', { align });
      assert.equal(drawCommandsFor('screen').at(-1).align, read, String(align));
    }
    assert.deepEqual(errors(), []);
    const count = drawCommandsFor('screen').length;
    assert.equal(api.drawText(0, 10, 'x', { align: 'justify' }), false);
    assert.deepEqual(errors(), ['ce.draw.text: "justify" is not an alignment, so nothing was drawn. The '
      + 'alignments are "left", "middle" (or "center", "centre" or "centred") and "right".']);
    assert.equal(drawCommandsFor('screen').length, count, 'nothing was drawn');
  });
});

/* =================================================================================== ce.anim */

test('ce.anim.to refuses a target that is not a number, and starts nothing', () => {
  stopAllAnimations();
  tickAnimations(0);
  try {
    withControls((api) => {
      api.set('K.Transform.scale', 1);
      for (const target of ['full', '100px', '#FF0000']) {
        clearScriptTrace();
        assert.equal(api.animateTo('K.Transform.scale', target, { duration: 10 }), false);
        assert.deepEqual(errors(), [`ce.anim.to: "${target}" is not a number, so nothing was started.`]);
        assert.equal(api.animateRunning('K.Transform.scale'), false);
      }
      clearScriptTrace();
      assert.equal(api.animateSpring(['K.Transform.scale', 'L.Transform.scale'], undefined), false);
      assert.deepEqual(errors(), ['ce.anim.spring: no number to move to was given, so nothing was started.'],
        'one message for the call, not one per path');
      tickAnimations(1000);
      assert.equal(api.get('K.Transform.scale'), 1, 'and the value did not sweep to 0');
      // Text that is a number is read as one, as it always was.
      clearScriptTrace();
      assert.equal(api.animateTo('K.Transform.scale', '2', { duration: 10, from: 1 }), true);
      tickAnimations(2000);
      assert.equal(api.get('K.Transform.scale'), 2);
      assert.deepEqual(errors(), []);
    });
  } finally { stopAllAnimations(); }
});

test('ce.anim refuses a colour property, where every tick would write a number into it', () => {
  stopAllAnimations();
  tickAnimations(0);
  try {
    withControls((api) => {
      api.set('L.Background.Fill.colour', 'FF112233');
      clearScriptTrace();
      assert.equal(api.animateTo('L.Background.Fill.colour', 1, { duration: 10 }), false);
      assert.deepEqual(errors(), ['ce.anim.to: "L.Background.Fill.colour" is a colour, and ce.anim moves '
        + 'numbers, so nothing was started.']);
      tickAnimations(1000);
      assert.equal(api.get('L.Background.Fill.colour'), 'FF112233');
    });
  } finally { stopAllAnimations(); }
});

/* ===================================================================== ce.math colour readers */

test('ce.math reads a colour as a property does, and refuses what it cannot read in the same words', () => {
  withControls((api) => {
    // Eight digits are AARRGGBB, so a stored colour reads as its colour.
    assert.deepEqual(api.hexToRgb('80336699'), { r: 51, g: 102, b: 153 });
    assert.equal(api.lighten('#5B9BD580', 0), '#9BD580', 'the panel\'s reading of CSS\'s RRGGBBAA');
    assert.deepEqual(errors(), []);
    // It read the last six characters of anything, so these were colours.
    for (const bad of ['x5B9BD5', '#12#34#56', '#5B9BD5800']) {
      clearScriptTrace();
      assert.equal(api.hexToRgb(bad), undefined);
      assert.deepEqual(errors(), [`ce.math.rgb: "${bad}" is not a colour, so there is no answer. ${FORMS}`]);
    }
    clearScriptTrace();
    assert.equal(api.lighten(0xFF0000), undefined);
    assert.deepEqual(errors(), [`ce.math.lighten: 16711680 is not a colour, so there is no answer. ${FORMS} `
      + 'As text, 16711680 is "#FF0000".']);
  });
});

test('ce.math reads CSS\'s short forms as the long form a property stores for them, without a word', () => {
  // set() took "red" and ce.math.lighten("red") refused it, in a message whose own forms left the
  // names out. Each helper now reads the form as if what set() would store had been given.
  withControls((api) => {
    for (const [value, stored] of WRITTEN_OUT) {
      clearScriptTrace();
      for (const [call, verb] of [
        [(c) => api.lighten(c, 0.2), 'lighten'], [(c) => api.darken(c, 0.5), 'darken'],
        [(c) => api.colourAlpha(c, 0.5), 'alpha'], [(c) => api.hexToRgb(c), 'rgb'], [(c) => api.hexToHsl(c), 'hsl'],
        [(c) => api.mixColour(c, '000000', 0.25), 'mix'], [(c) => api.mixColour('FFFFFF', c, 0.75), 'mix'],
      ]) {
        const got = call(value);
        assert.notEqual(got, undefined, `ce.math.${verb} reads ${value}`);
        assert.deepEqual(got, call(stored), `ce.math.${verb}: ${value} is ${stored}`);
      }
      assert.deepEqual(everything(), [], `${value} is read without a word`);
    }
    // The alpha is the long form's, set aside as an AARRGGBB's always was: rgba(…, 0.5) is 80FF0000.
    assert.deepEqual(api.hexToRgb('rgba(255, 0, 0, 0.5)'), { r: 255, g: 0, b: 0 });
    assert.equal(api.colourAlpha('hsla(120, 100%, 50%, 0.25)', 1), 'FF00FF00');
    assert.equal(api.lighten('Transparent', 0), '#000000');
    // Numbers go through JavaScript's Math.round, a half up: 30% is 76.5 and 2.5 is 3.
    assert.deepEqual(api.hexToRgb('hsl(0, 0%, 30%)'), { r: 77, g: 77, b: 77 });
    assert.deepEqual(api.hexToRgb('rgb(2.5 300 -4)'), { r: 3, g: 255, b: 0 });
  });
});

test('ce.math refuses what a property refuses, in its own words and with the same hint', () => {
  withControls((api) => {
    const path = 'L.Background.Fill.colour';
    for (const [value, hint] of STILL_REFUSED) {
      clearScriptTrace();
      api.set(path, value);
      assert.equal(errors()[0], `set("${path}"): "${value}" is not a colour the panel can read, so nothing was `
        + `set. ${FORMS}${hint}`);
      clearScriptTrace();
      assert.equal(api.lighten(value, 0.2), undefined, value);
      assert.equal(api.hexToRgb(value), undefined, value);
      assert.deepEqual(errors(), ['lighten', 'rgb'].map((verb) => `ce.math.${verb}: "${value}" is not a colour, so `
        + `there is no answer. ${FORMS}${hint}`), value);
    }
    clearScriptTrace();
    assert.equal(api.darken(' red ', 0.5), undefined);
    assert.deepEqual(errors(), [`ce.math.darken: " red " is not a colour, so there is no answer. ${FORMS} `
      + 'Write "#FF0000".']);
  });
});

test('ce.math refuses an amount outside 0..1 rather than using it or clamping it', () => {
  withControls((api) => {
    // lighten by 40 was white; alpha 128 was solid.
    for (const [call, message] of [
      [() => api.lighten('5B9BD5', 40), 'ce.math.lighten: the amount is a number from 0 to 1, and 40 is not, so '
        + 'there is no answer. If you meant 40 out of 100, write 0.4.'],
      [() => api.darken('5B9BD5', 55), 'ce.math.darken: the amount is a number from 0 to 1, and 55 is not, so '
        + 'there is no answer. If you meant 55 out of 100, write 0.55.'],
      [() => api.colourAlpha('5B9BD5', 128), 'ce.math.alpha: the alpha is a number from 0 to 1, and 128 is not, '
        + 'so there is no answer.'],
      [() => api.colourAlpha('5B9BD5'), 'ce.math.alpha: the alpha is a number from 0 to 1, and none was given, '
        + 'so there is no answer.'],
    ]) {
      clearScriptTrace();
      assert.equal(call(), undefined);
      assert.deepEqual(errors(), [message]);
    }
    clearScriptTrace();
    assert.equal(api.lighten('000000'), api.lighten('000000', 0.4), 'left out is the default');
    assert.equal(api.colourAlpha('5B9BD5', '0.5'), '805B9BD5', 'text that is a number is read as one');
    assert.deepEqual(errors(), []);
  });
});
