// scriptText.test.js — ce.text: the rules around the 41 font fields (design doc §46).
//
// Text.Font was fully reachable with set() before this module existed, so nothing here is testing
// reach. What is being pinned is the three things a bare path write got wrong:
//
//  1. weight/weightValue are a pair read by two different consumers, so writing one desynchronises
//     the editor from the render. Both halves, every time.
//  2. A family, a variable axis and a feature are only usable if the font has them, and a write
//     that cannot be honoured must be refused and reported rather than stored.
//  3. Measuring has to go through the renderer's own layout, or it is a second implementation that
//     agrees until one of them changes.
//
// Everything is asserted against the app's own tables and the app's own layout function — never
// against numbers copied out of them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { appSettings, availableFonts } from '../src/CE_Application/stores/appSettings.js';
import { get as storeGet } from 'svelte/store';
import { buildBlockTextLayout } from '../src/CE_Application/editor/canvasControlTextLayout.js';
import { lineCanvasFont } from '../src/CE_Application/editor/canvasControlStyles.js';
import {
  BOLD_AT, CASE_MODES, FEATURE_KEYS, JUSTIFICATIONS, SCRIPT_MODES,
  fontCatalogue, findFont, planAxis, planStyle, resolvedWeight, weightDisagrees, weightFields,
} from '../src/CE_Application/scripting/textStyle.js';
import {
  TEXT_CASE_OPTIONS, TEXT_SCRIPT_OPTIONS, TYPOGRAPHY_FEATURE_OPTIONS,
} from '../src/CE_Application/sections/textEditorVocabulary.js';
import { MEMBER_BY_ID, moduleMemberMap } from '../src/CE_Application/scripting/panelApi.js';

/** A panel with one Label (which has a Text section) and one Knob (which has none). */
function withText(fn) {
  const label = createControl('Label', { name: 'L' });
  const knob = createControl('Knob', { name: 'K' });
  panels.set([{
    id: 'p', name: 'P', controls: [label, knob],
    scripting: { modules: ['ce.core', 'ce.text'] },
  }]);
  activePanelId.set('p');
  try { return fn(scriptApiForTesting('', 'text-script'), label, knob); } finally {
    panels.set([]);
  }
}

/** Install a variable font in the settings the catalogue derives from, so the axis and feature
 *  paths can be tested at all — every builtin family reports supportsWeight: false. */
function withVariableFont(fn) {
  const before = storeGet(appSettings);
  appSettings.set({
    ...before,
    fonts: [{
      id: 'vf1', family: 'Probe Variable', cssFamily: 'Probe Variable', enabled: true,
      sourceType: 'local', supportsWeight: true,
      axes: [{ tag: 'wght', min: 200, default: 400, max: 800 },
             { tag: 'wdth', min: 75, default: 100, max: 125 }],
      supportedFeatures: ['liga', 'clig', 'tnum'], featureSupportKnown: true,
    }],
  });
  try { return fn(); } finally { appSettings.set(before); }
}

/* ------------------------------------------------------------------ the contract itself */

test('every ce.text member is declared, and the flat names all keep the prefix', () => {
  const map = moduleMemberMap('ce.text');
  assert.deepEqual(Object.keys(map).sort(),
    ['axis', 'fit', 'font', 'fonts', 'measure', 'read', 'style'].sort());
  for (const [short, flat] of Object.entries(map)) {
    // §1: every namespaced spelling in this module is a bare English word, so no flat alias may be
    // one — `read` or `style` as a global is a collision waiting to happen.
    assert.ok(flat.startsWith('text'), `${short} -> ${flat} should keep the text prefix`);
    assert.ok(MEMBER_BY_ID[flat], `${flat} is mapped but not declared`);
  }
});

test('the runtime exposes exactly what the contract declares', () => {
  withText((api) => {
    for (const flat of Object.values(moduleMemberMap('ce.text'))) {
      assert.equal(typeof api[flat], 'function', `${flat} missing from the runtime`);
    }
  });
});

/* ------------------------------------------------------------------ the weight pair */

test('the bold threshold and the weight pair agree with the renderer', () => {
  // weightFields is only correct if it produces a pair the renderer resolves back to the same
  // number, so assert through lineCanvasFont rather than against a literal.
  for (const value of [100, 399, 400, 600, BOLD_AT, 900]) {
    const pair = weightFields(value);
    assert.equal(resolvedWeight(pair), value, `resolved weight for ${value}`);
    assert.ok(lineCanvasFont({ ...pair, size: 12 }, 'Arial').includes(` ${value} `),
      `the renderer should draw ${value}`);
    assert.equal(weightDisagrees(pair), false, `${value} should be self-consistent`);
  }
});

test('weightDisagrees catches the desync a bare set() leaves behind, in both directions', () => {
  // This is the bug the module exists for. The renderer reads weightValue first; the Properties
  // panel reads `weight` for a non-variable face. Half a pair is a control that renders one weight
  // and displays another.
  assert.equal(weightDisagrees({ weightValue: 700, weight: 'Regular' }), true);
  assert.equal(weightDisagrees({ weightValue: 400, weight: 'Bold' }), true);
  assert.equal(weightDisagrees({ weightValue: 700, weight: 'Bold' }), false);
});

test('style() writes both halves of the weight pair', () => {
  withText((api) => {
    assert.equal(api.textStyle('L', { bold: true }), true);
    const font = api.textRead('L').font;
    assert.equal(font.weightValue, BOLD_AT);
    assert.equal(font.weight, 'Bold');
    assert.equal(weightDisagrees(font), false);

    assert.equal(api.textStyle('L', { bold: false }), true);
    assert.equal(weightDisagrees(api.textRead('L').font), false);
    // And the raw path write it replaces still leaves the control inconsistent, which is why the
    // verb is not merely a convenience.
    api.set('L.Text.Font.weightValue', BOLD_AT);
    assert.equal(weightDisagrees(api.textRead('L').font), true);
  });
});

/* ------------------------------------------------------------------ the catalogue */

test('the catalogue reports every available font, and marks only builtins portable', () => {
  const entries = storeGet(availableFonts);
  const catalogue = fontCatalogue(entries);
  assert.equal(catalogue.length, entries.length);
  for (const descriptor of catalogue) {
    const entry = entries.find((e) => (e.value ?? e.family) === descriptor.family);
    assert.ok(entry, `${descriptor.family} should come from the store`);
    // portable is exactly "builtin", because nothing else survives an export: the font library is
    // app settings, not part of the panel document, and no export path registers a FontFace.
    assert.equal(descriptor.portable, entry.sourceType === 'builtin');
    assert.equal(descriptor.variable, entry.supportsWeight === true);
  }
  assert.ok(catalogue.some((f) => f.portable), 'the builtins should be portable');
});

test('a library font is reported, and reported as not portable', () => {
  withVariableFont(() => {
    const found = findFont(fontCatalogue(storeGet(availableFonts)), 'Probe Variable');
    assert.ok(found, 'the installed font should be in the catalogue');
    assert.equal(found.portable, false);
    assert.equal(found.variable, true);
    assert.deepEqual(found.axes.map((a) => a.tag), ['wght', 'wdth']);
    assert.equal(found.featuresKnown, true);
  });
});

test('findFont matches case-insensitively and reports nothing for an absent family', () => {
  const catalogue = fontCatalogue(storeGet(availableFonts));
  const first = catalogue[0];
  assert.equal(findFont(catalogue, first.family.toLowerCase())?.family, first.family);
  assert.equal(findFont(catalogue, first.family.toUpperCase())?.family, first.family);
  assert.equal(findFont(catalogue, 'NoSuchFontAnywhere'), null);
  assert.equal(findFont(catalogue, ''), null);
});

test('font() answers from the catalogue and returns nothing for an unknown family', () => {
  withText((api) => {
    const first = fontCatalogue(storeGet(availableFonts))[0];
    assert.equal(api.textFont(first.family).family, first.family);
    assert.equal(api.textFont('NoSuchFontAnywhere'), undefined);
  });
});

test('fonts() narrows by portable and by variable', () => {
  withVariableFont(() => withText((api) => {
    const all = api.textFonts();
    assert.ok(all.length > 1);
    assert.ok(api.textFonts({ portable: true }).every((f) => f.portable));
    const variable = api.textFonts({ variable: true });
    assert.ok(variable.every((f) => f.variable));
    assert.ok(variable.some((f) => f.family === 'Probe Variable'));
  }));
});

/* ------------------------------------------------------------------ refusals */

test('style() refuses a family nobody has, and does not store it', () => {
  withText((api) => {
    const before = api.textRead('L', 'family');
    assert.equal(api.textStyle('L', { family: 'NoSuchFontAnywhere' }), false);
    assert.equal(api.textRead('L', 'family'), before, 'the bad family must not be stored');
  });
});

test('style() accepts a family the catalogue does have', () => {
  withText((api) => {
    const portable = api.textFonts({ portable: true });
    const target = portable.find((f) => f.family !== api.textRead('L', 'family')) ?? portable[0];
    assert.equal(api.textStyle('L', { family: target.family }), true);
    assert.equal(api.textRead('L', 'family'), target.family);
  });
});

test('style() refuses an unknown option rather than writing a dead key', () => {
  withText((api) => {
    assert.equal(api.textStyle('L', { fontHeight: 20 }), false);
    // …and the field it was mistaken for is untouched.
    assert.equal(api.textRead('L', 'size'), 12);
  });
});

test('style() refuses values outside the app\'s own vocabularies', () => {
  withText((api) => {
    for (const [option, legal] of [['caseMode', CASE_MODES], ['scriptMode', SCRIPT_MODES],
                                   ['justification', JUSTIFICATIONS]]) {
      assert.equal(api.textStyle('L', { [option]: 'nonsense' }), false, `${option} should refuse`);
      // Every legal value must be accepted, so the vocabulary the module reports is the vocabulary
      // it honours — asserted against the table the Properties panel renders from.
      for (const value of legal) {
        assert.equal(api.textStyle('L', { [option]: value }), true, `${option} = ${value}`);
      }
    }
  });
});

test('the reported vocabularies are the editor\'s own tables', () => {
  assert.deepEqual(CASE_MODES, TEXT_CASE_OPTIONS.map((o) => o.value));
  assert.deepEqual(SCRIPT_MODES, TEXT_SCRIPT_OPTIONS.map((o) => o.value));
  assert.deepEqual(FEATURE_KEYS, TYPOGRAPHY_FEATURE_OPTIONS.map((o) => o.key));
});

test('a feature the font is known to lack is refused; an unscanned font is not', () => {
  withVariableFont(() => withText((api) => {
    api.textStyle('L', { family: 'Probe Variable' });
    // tnum is in the probe font's feature list, salt is not, and the list is known.
    assert.equal(api.textStyle('L', { tabularFigures: true }), true);
    assert.equal(api.textStyle('L', { stylisticAlternates: true }), false);
    // Turning one OFF is always honoured — there is nothing to support.
    assert.equal(api.textStyle('L', { stylisticAlternates: false }), true);
  }));

  withText((api) => {
    // A builtin reports featureSupportKnown: false. Unknown is not absent, so this must NOT refuse.
    assert.equal(api.textStyle('L', { stylisticAlternates: true }), true);
  });
});

/* ------------------------------------------------------------------ axes */

test('axis() refuses a tag the font has not got, and clamps one it has', () => {
  withVariableFont(() => withText((api) => {
    api.textStyle('L', { family: 'Probe Variable' });
    assert.equal(api.textAxis('L', 'slnt', 10), false);
    assert.equal(api.textAxis('L', 'wdth', 110), true);
    assert.equal(api.textRead('L', 'variationAxes').wdth, 110);
    // Past the declared maximum lands at the maximum rather than being stored out of range.
    assert.equal(api.textAxis('L', 'wdth', 999), true);
    const axis = api.textFont('Probe Variable').axes.find((a) => a.tag === 'wdth');
    assert.equal(api.textRead('L', 'variationAxes').wdth, axis.max);
  }));
});

test('the wght axis drags the weight pair with it', () => {
  withVariableFont(() => withText((api) => {
    api.textStyle('L', { family: 'Probe Variable' });
    assert.equal(api.textAxis('L', 'wght', 750), true);
    const font = api.textRead('L').font;
    assert.equal(font.variationAxes.wght, 750);
    assert.equal(font.weightValue, 750);
    assert.equal(font.weight, 'Bold');
    assert.equal(weightDisagrees(font), false);
  }));
});

test('style() moves the wght axis too, so a variable face does not render its old weight', () => {
  withVariableFont(() => withText((api) => {
    api.textStyle('L', { family: 'Probe Variable' });
    assert.equal(api.textStyle('L', { weight: 800 }), true);
    assert.equal(api.textRead('L', 'variationAxes').wght, 800);
  }));
});

test('a weight past the font\'s own axis range is clamped to it', () => {
  withVariableFont(() => withText((api) => {
    api.textStyle('L', { family: 'Probe Variable' });
    api.textStyle('L', { weight: 5000 });
    const axis = api.textFont('Probe Variable').axes.find((a) => a.tag === 'wght');
    assert.equal(api.textRead('L', 'weightValue'), axis.max);
  }));
});

test('planAxis and planStyle refuse without inventing writes', () => {
  // The planners are where the rules live, so they are worth asserting directly: a refusal must
  // produce NO writes, or a caller applying the plan would store half a decision.
  assert.deepEqual(planAxis(null, 'wght', 700).writes, []);
  assert.equal(planStyle({ family: 'Nope' }, { catalogue: [] }).writes.length, 0);
  assert.equal(planStyle({ nonsense: 1 }, { catalogue: [] }).refused[0].option, 'nonsense');
});

/* ------------------------------------------------------------------ read */

test('read() finds a field on whichever node owns it', () => {
  withText((api) => {
    api.textStyle('L', { size: 18, lineHeight: 1.5, justification: 'left' });
    assert.equal(api.textRead('L', 'size'), 18);              // Font
    assert.equal(api.textRead('L', 'lineHeight'), 1.5);       // Multiline
    assert.equal(api.textRead('L', 'justification'), 'left'); // Position
    assert.equal(api.textRead('L', 'content'), 'Label');      // Text itself
    assert.equal(api.textRead('L', 'nosuchfield'), undefined);
  });
});

test('read() with no name returns the whole state, grouped, with the resolved weight', () => {
  withText((api, label) => {
    api.textStyle('L', { bold: true });
    const state = api.textRead('L');
    assert.deepEqual(Object.keys(state).sort(),
      ['content', 'font', 'multiline', 'position', 'resolvedWeight']);
    assert.equal(state.resolvedWeight, BOLD_AT);
    // The whole Font node, minus the private keys — and it must be the real one, so compare field
    // names against the control the app built rather than a list written here.
    const live = label._children.Text._children.Font;
    assert.deepEqual(Object.keys(state.font).sort(),
      Object.keys(live).filter((k) => !k.startsWith('_')).sort());
  });
});

/* ------------------------------------------------------------------ measure and fit */

test('measure() agrees with the renderer\'s own layout', () => {
  withText((api, label) => {
    const font = label._children.Text._children.Font;
    const position = label._children.Text._children.Position;
    const width = label._children.Transform.width
      - position.paddingLeft - position.paddingRight;
    const expected = buildBlockTextLayout('Label', {
      fontSection: font, family: font.family, maxWidth: width,
      wrapMode: 'word', overflowMode: 'clip', maxLines: 0, lineHeightMultiplier: 1.2,
    });
    const got = api.textMeasure('L');
    // Asserted against the app's own function, not a captured number: if the layout changes, this
    // follows it rather than becoming a lie about what will be painted.
    assert.equal(got.width, expected.width);
    assert.equal(got.height, expected.height);
    assert.equal(got.lines, expected.lines.length);
  });
});

test('measure() can be asked about a string the control does not hold yet', () => {
  withText((api) => {
    const short = api.textMeasure('L', 'I');
    const long = api.textMeasure('L', 'IIIIIIIIIIIIIIIIIIII');
    assert.ok(long.width > short.width, 'more glyphs must measure wider');
    assert.equal(api.textRead('L', 'content'), 'Label', 'measuring must not write');
  });
});

test('measure() reports exact honestly for the surface it had', () => {
  withText((api) => {
    // No document under node:test, so there is no canvas and the answer is the per-glyph estimate.
    // The flag has to say so rather than presenting an estimate as a measurement.
    const hasSurface = typeof document !== 'undefined'
      && typeof document.createElement === 'function';
    assert.equal(api.textMeasure('L').exact, hasSurface);
  });
});

test('fit() shrinks until the text fits, and writes the size it chose', () => {
  withText((api) => {
    api.textStyle('L', { size: 40 });
    api.set('L.Text.content', 'a rather long label that will not fit at forty points');
    const result = api.textFit('L', { min: 4, max: 40 });
    assert.ok(result.fits, 'it should find a size that fits');
    assert.ok(result.size < 40, 'and that size must be smaller than it started');
    assert.equal(result.changed, true);
    // The written size is the reported size — the point of the verb over paint-time shrink.
    assert.equal(api.textRead('L', 'size'), result.size);
    // And the chosen size really does fit, measured the same way the renderer will.
    const at = api.textMeasure('L');
    assert.ok(at.width <= api.get('L.Transform.width') + 0.5);
  });
});

test('fit() reports fits:false rather than failing when even the minimum overflows', () => {
  withText((api) => {
    api.set('L.Text.content', 'x'.repeat(4000));
    const result = api.textFit('L', { min: 40, max: 40 });
    assert.equal(result.fits, false);
    assert.equal(result.size, 40, 'the minimum is still what it settled on');
  });
});

test('fit() leaves a size that already fits alone', () => {
  withText((api) => {
    api.textStyle('L', { size: 8 });
    api.set('L.Text.content', 'ok');
    const result = api.textFit('L', { min: 4, max: 8 });
    assert.equal(result.fits, true);
    assert.equal(result.size, 8);
    assert.equal(result.changed, false);
  });
});

/* ------------------------------------------------------------------ wrong target */

test('every verb reports rather than throwing on a control with no Text section', () => {
  withText((api) => {
    // A Knob has no Text section at all. Each verb has to say so and return nothing-ish.
    assert.equal(api.textStyle('K', { size: 20 }), false);
    assert.equal(api.textAxis('K', 'wght', 700), false);
    assert.equal(api.textRead('K'), undefined);
    assert.equal(api.textMeasure('K'), undefined);
    assert.equal(api.textFit('K'), undefined);
  });
});

test('every verb reports rather than throwing on a control that is not there', () => {
  withText((api) => {
    assert.equal(api.textStyle('Nope', { size: 20 }), false);
    assert.equal(api.textRead('Nope'), undefined);
    assert.equal(api.textMeasure('Nope'), undefined);
  });
});
