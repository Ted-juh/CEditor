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
  CSS_NAMED_COLOURS, colourFieldAt, drawColour, isPanelColour,
} from '../src/CE_Application/scripting/scriptColours.js';
import { parseHexColor } from '../src/CE_Application/editor/canvasControlStyles.js';
import ScriptDrawOverlay from '../src/CE_Application/editor/ScriptDrawOverlay.svelte';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const FORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#".';
const DRAW_FORMS = 'A drawing colour is the panel\'s RRGGBB or AARRGGBB, as get() returns it, or a '
  + 'CSS colour such as "#5B9BD5", "rgb(91, 155, 213)" or "steelblue".';

const errors = () => storeGet(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message);
const warns = () => storeGet(scriptTrace).filter((e) => e.kind === 'warn').map((e) => e.message);

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

test('set() refuses a colour the panel cannot read, writes nothing, and says what to write', () => {
  withControls((api) => {
    const path = 'L.Background.Fill.colour';
    api.set(path, 'FF112233');
    for (const [value, hint] of [
      ['#000', ' Write "#000000".'],
      ['000', ' Write "000000".'],
      ['#0008', ' Write "88000000".'],
      ['red', ' Write "#FF0000".'],
      ['rgb(0, 0, 0)', ' Write "#000000".'],
      ['rgba(255, 0, 0, 0.5)', ' Write "80FF0000".'],
      ['hsl(0, 100%, 50%)', ' Write "#FF0000".'],
      ['transparent', ' Write "00000000".'],
      ['nonsense', ''],
    ]) {
      clearScriptTrace();
      api.set(path, value);
      assert.deepEqual(errors(), [`set("${path}"): "${value}" is not a colour the panel can read, so nothing `
        + `was set. ${FORMS}${hint}`]);
      assert.equal(api.get(path), 'FF112233', `${value} must not be stored`);
    }
    clearScriptTrace();
    api.set(path, 0xFF0000);
    assert.deepEqual(errors(), [`set("${path}"): 16711680 is not a colour the panel can read, so nothing `
      + `was set. ${FORMS} As text, 16711680 is "#FF0000".`]);
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
    assert.deepEqual(errors(), [`set("L.Text.Font.underlineColour"): "#000" is not a colour the panel can `
      + 'read, so nothing was set. A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", '
      + 'or "" for none. Write "#000000".']);
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
    api.set('L.Background.Border.top', { style: 'solid', thickness: 3, colour: 'red' });
    assert.deepEqual(errors(), ['set("L.Background.Border.top"): at colour, "red" is not a colour the panel '
      + `can read, so nothing was set. ${FORMS} Write "#FF0000".`]);
    assert.equal(api.get('L.Background.Border.top.colour'), before);
    assert.notEqual(api.get('L.Background.Border.top.thickness'), 3, 'and nothing else in it was written');
  });
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

test('ce.panel.patch refuses an unreadable colour as set() does, and the whole patch with it', () => {
  // On the Button, which has a Background to patch (a Knob draws through its parts and has none,
  // so a patch of its Background leads nowhere, which ce.panel.patch reports on its own).
  withControls((api) => {
    api.panelDefine('B', 'States', 'Hot', {});
    clearScriptTrace();
    api.panelPatch('B', 'Hot', { 'Background.Fill.colour': '#000', 'Transform.opacity': 60 });
    assert.deepEqual(errors(), ['ce.panel.patch("B", "Hot"): at "Background.Fill.colour", "#000" is not a '
      + `colour the panel can read, so nothing was patched. ${FORMS} Write "#000000".`]);
    assert.deepEqual(api.panelEntry('B', 'States', 'Hot').patches?.component ?? {}, {},
      'the state is as it was: nothing from the refused patch landed');
    // A part's patch is typed by the part's sections, or by the templates when it has none.
    api.panelDefine('K', 'States', 'Hot', {});
    clearScriptTrace();
    api.panelPatch('K', 'Hot', { 'Background.Fill.colour': 'red' }, 'cap');
    assert.equal(errors().length, 1);
    assert.match(errors()[0], /^ce\.panel\.patch\("K", "Hot"\): at "Background\.Fill\.colour", "red" is not/);
    // What the panel reads goes in as written.
    clearScriptTrace();
    api.panelPatch('B', 'Hot', { 'Background.Fill.colour': '#000000' });
    assert.deepEqual(errors(), []);
    assert.equal(api.panelEntry('B', 'States', 'Hot').patches.component['Background.Fill.colour'], '#000000');
  });
});

/* ===================================================================================== tints */

test('ce.image.icon refuses a tint the panel cannot read, and applies the rest', () => {
  // "#000" had its "#" taken off and was stored as "000", which the renderer reads as no tint.
  withIcons([{ id: 'i1', name: 'waveform', enabled: true, dataUrl: PNG }], () => withControls((api) => {
    assert.equal(api.imageIcon('B', 'waveform', { size: 20, tint: '#000' }), false);
    assert.deepEqual(errors(), [`ce.image.icon("B"): tint refused — "#000" is not a colour the panel can `
      + `read. ${FORMS} Write "#000000".`]);
    assert.equal(api.get('B.Icon.size'), 20, 'the other options are applied');
    assert.equal(api.get('B.Icon.tint'), 'FFFFFFFF', 'the tint is not');
    clearScriptTrace();
    assert.equal(api.imageIcon('B', 'waveform', { tint: '#80FF0000' }), true);
    assert.equal(api.get('B.Icon.tint'), '80FF0000');
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

test('ce.image.set refuses a tint the panel cannot read, in its own refusal\'s words', () => {
  withControls((api) => {
    assert.equal(api.imageSet('L', PNG, { tint: 'red' }), false);
    assert.deepEqual(errors(), [`ce.image.set("L"): tint refused — "red" is not a colour the panel can `
      + `read. ${FORMS} Write "#FF0000".`]);
    assert.equal(api.get('L.Background.Fill.imageSrc'), PNG, 'the picture still goes on');
    assert.notEqual(api.get('L.Background.Fill.imageTint'), 'red');
    clearScriptTrace();
    assert.equal(api.imageSet('L', PNG, { tint: '#5B9BD5' }), true);
    assert.equal(api.get('L.Background.Fill.imageTint'), '5B9BD5');
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
