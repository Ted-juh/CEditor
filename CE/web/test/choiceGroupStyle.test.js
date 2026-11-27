// choiceGroupStyle.test.js — how one option of a choice group looks in its style and its own states
// (src/CE_Application/utils/choiceGroupStyle.js), and that the control's state engine leaves those
// states to the options (utils/interactionRuntime.js). docs/design/choice-group.md.
import test from 'node:test';
import assert from 'node:assert/strict';

import { backgroundTone, chosenUnderPointer, colourContrast, fillTone, resolveChoiceOption, standsOutFrom } from '../src/CE_Application/utils/choiceGroupStyle.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const palette = { panelText: 'FFE8E8E8', mutedText: 'FF8A8A8A', accent: 'FF2D9CDB', thumb: 'FF4A90D9' };
const rows = [
  { id: 'off', displayText: 'Off', internalValue: 'off', enabled: true },
  { id: 'bpf', displayText: 'BPF', internalValue: 'bpf', enabled: true },
];
const state = (when, component = {}, segments = undefined) => ({ enabled: true, when, patches: { component, parts: {}, ...(segments ? { segments } : {}) } });

function sections(overrides = {}) {
  return {
    background: {
      _type: 'Background',
      _children: {
        Fill: { colour: 'FF3A3A3A', solidEnabled: true, gradientEnabled: false },
        Border: { enabled: true, linked: true, thickness: 1, colour: 'FF5A5A5A' },
        Corners: { linked: true, radius: 8 },
      },
    },
    text: { _children: { Fill: { colour: 'FFEEEEEE' }, Font: { size: 11, weightValue: 600 } } },
    contentLayout: { lamp: 'led', lampSize: 9, lampColour: 'FFFF3B30', lampOffColour: 'FF331111', lampBezelColour: '66FFFFFF' },
    valueSection: { rows, segmentStyle: { shared: {}, rows: {} } },
    statesSection: {
      _children: {
        Hover: state({ hover: true }, { 'Background.Fill.colour': 'FF505050' }),
        Pressed: state({ pressed: true }, { 'Background.Fill.colour': 'FF2A2A2A', 'Transform.scale': 0.985 }),
        Selected: state({ checked: true }, { 'Background.Fill.colour': 'FF4A90D9', 'Text.Fill.colour': 'FFFFFFFF' }),
        Disabled: state({ disabled: true }, { 'Transform.opacity': 0.55 }),
      },
    },
    ...overrides,
  };
}

const option = (style, flags = {}, extra = {}, rowIndex = 0) => resolveChoiceOption({ style, row: rows[rowIndex], flags, palette, ...sections(), ...extra });

test('segmented: an option at rest draws no box of its own; the chosen one is the thumb in the Selected fill', () => {
  assert.equal(option('segmented').body, null, 'no frame inside the frame');
  const chosen = option('segmented', { selected: true });
  assert.equal(chosen.body._children.Fill.colour, 'FF4A90D9');
  assert.equal(chosen.body._children.Border.enabled, false);
  assert.equal(chosen.body._children.Corners.radius, 6, 'the frame\'s radius less the 2 px inset');
  assert.equal(chosen.label.colour, 'FFFFFFFF');
});

test('hover and press are the option\'s own: only the one under the pointer changes, and nothing but its body and text', () => {
  assert.equal(option('segmented', { hover: true }).body._children.Fill.colour, 'FF505050');
  assert.equal(option('segmented', { hover: false }).body, null);
  const pressed = option('segmented', { pressed: true });
  assert.equal(pressed.body._children.Fill.colour, 'FF2A2A2A');
  assert.equal(pressed.body.scale, undefined, 'the group does not shrink');
  assert.equal(option('segmented', { selected: true, hover: true }).body._children.Fill.colour, 'FF4A90D9', 'hovering the chosen one keeps the thumb');
});

test('a chosen option always shows: a set whose Selected state only colours a border still gets a thumb', () => {
  const statesSection = { _children: { Selected: state({ checked: true }, { 'Background.Border.colour': 'FFFFAA00', 'Text.Fill.colour': 'FF101010' }) } };
  const chosen = option('segmented', { selected: true }, { statesSection });
  assert.ok(chosen.body, 'drawn');
  assert.equal(chosen.body._children.Fill.colour, palette.thumb);
  assert.ok(colourContrast(chosen.label.colour, palette.thumb) >= 3, `and its label reads on it: ${chosen.label.colour}`);
});

test('a chosen key whose fill no state changed takes the thumb, so it differs by more than an outline', () => {
  const statesSection = { _children: { Selected: state({ checked: true }, { 'Background.Border.colour': 'FFFFAA00' }) } };
  const background = sections().background;
  background._children.Fill = { colour: 'FF3A3A3A', solidEnabled: true, gradientEnabled: true, gradient: { stops: [] } };
  const chosen = option('buttons', { selected: true }, { statesSection, background });
  assert.equal(chosen.body._children.Fill.colour, palette.thumb);
  assert.equal(chosen.body._children.Fill.gradientEnabled, false, 'flat, over the face\'s gradient');
  assert.equal(chosen.body._children.Border.colour, 'FFFFAA00', 'the set\'s edge kept');
  assert.equal(option('buttons', {}, { statesSection, background }).body._children.Fill.gradientEnabled, true, 'the others untouched');
});

test('under the pointer a chosen option keeps the thumb, a shade off it, where the set\'s Hover and Pressed would paint it as any other', () => {
  // As in most sets: Selected colours only an edge, so the thumb is what shows the choice, and
  // Hover and Pressed paint every option's fill alike. They painted the chosen one as if it were not.
  const statesSection = { _children: {
    Hover: state({ hover: true }, { 'Background.Fill.colour': 'FFD8D8D8' }),
    Pressed: state({ pressed: true }, { 'Background.Fill.colour': 'FFC4C4C4' }),
    Selected: state({ checked: true }, { 'Background.Border.colour': 'FFFFAA00' }),
  } };
  const background = { ...sections().background, _children: { ...sections().background._children, Fill: { colour: 'FFF4F4F4', solidEnabled: true } } };
  const fill = (flags) => option('buttons', flags, { statesSection, background }).body._children.Fill.colour;
  const thumb = 'FF2D6F9C';
  const look = (flags) => resolveChoiceOption({ style: 'buttons', row: rows[0], flags, palette: { ...palette, thumb }, ...sections(), statesSection, background }).body._children.Fill.colour;
  assert.equal(look({ selected: true }), thumb, 'at rest, the thumb, as ever');
  const hovered = look({ selected: true, hover: true });
  const pressed = look({ selected: true, hover: true, pressed: true });
  assert.equal(hovered, chosenUnderPointer(thumb, false, 'FFF4F4F4'));
  assert.equal(pressed, chosenUnderPointer(thumb, true, 'FFF4F4F4'));
  assert.equal(new Set([thumb, hovered, pressed, 'FFD8D8D8', 'FFC4C4C4']).size, 5, 'not the thumb, not the hover colour; pressed apart from hovered');
  assert.ok(colourContrast(hovered, 'FFF4F4F4') > colourContrast(thumb, 'FFF4F4F4'), 'darker, away from the light keys beside it');
  assert.equal(fill({ hover: true }), 'FFD8D8D8', 'an option not chosen is hovered as the set says');
  assert.equal(fill({ pressed: true }), 'FFC4C4C4');
});

test('under the pointer, what a state about the chosen option paints still wins; and a state of another kind is left alone', () => {
  assert.equal(option('buttons', { selected: true, hover: true }).body._children.Fill.colour, 'FF4A90D9', 'a Selected that paints the fill');
  const authored = { _children: { ...sections().statesSection._children,
    Selected: state({ checked: true }, { 'Background.Border.colour': 'FFFFAA00' }),
    ChosenHover: state({ hover: true, checked: true }, { 'Background.Fill.colour': 'FF8844CC' }) } };
  assert.equal(option('buttons', { selected: true, hover: true }, { statesSection: authored }).body._children.Fill.colour, 'FF8844CC', 'an author\'s chosen-and-hovered colour');
  const rule = { _children: { Selected: state({ checked: true }, { 'Background.Border.colour': 'FFFFAA00' }), Low: { enabled: true, when: {}, rule: 'value < 1', patches: { component: { 'Background.Fill.colour': 'FF00AA00' }, parts: {} } } } };
  const ruled = option('buttons', { selected: true, hover: true }, { statesSection: rule, signals: { value: 0 } });
  assert.equal(ruled.body._children.Fill.colour, 'FF00AA00', 'a state about something else keeps the colour it gives');
});

test('the shade goes away from the options not chosen, the other way where it cannot move, and never so far it blends in', () => {
  const darker = (a, b) => colourContrast(a, 'FFFFFFFF') > colourContrast(b, 'FFFFFFFF');
  assert.ok(darker(chosenUnderPointer('FF2D6F9C', false, 'FFF4F4F4'), 'FF2D6F9C'), 'dark on light keys: darker');
  assert.ok(darker('FF4A90D9', chosenUnderPointer('FF4A90D9', false, 'FF1E1E1E')), 'on dark keys: lighter');
  assert.ok(darker('FF101010', chosenUnderPointer('FF101010', false, 'FFF4F4F4')), 'a near-black cannot get darker: lighter');
  const pale = 'FFF2F2F2';
  for (const pressed of [false, true]) {
    const shade = chosenUnderPointer(pale, pressed, 'FF2A3A44');
    assert.ok(darker(shade, pale), 'a near-white cannot get lighter: darker');
    assert.ok(colourContrast(shade, 'FF2A3A44') >= 1 + 0.6 * (colourContrast(pale, 'FF2A3A44') - 1), `still stands out from the others${pressed ? ', pressed' : ''}`);
  }
  assert.notEqual(chosenUnderPointer('FF2D6F9C', true, 'FFF4F4F4'), chosenUnderPointer('FF2D6F9C', false, 'FFF4F4F4'));
  assert.equal(chosenUnderPointer('{accent}'), '{accent}', 'not a colour: as it was');
});

test('the thumb is the first of the set\'s colours that stands out from the face', () => {
  assert.equal(standsOutFrom('FF3A3A3A', ['FF3A3A3A', 'FF2D9CDB', 'FFFFFFFF']), 'FF2D9CDB', 'the "on" body is the face: the accent');
  assert.equal(standsOutFrom('FF3A3A3A', ['FF4A90D9', 'FF2D9CDB']), 'FF4A90D9', 'the "on" body when it stands out');
  assert.equal(standsOutFrom('FF808080', ['FF828282', 'FF6A6A6A']), 'FF6A6A6A', 'none does: the one that stands out most');
  assert.equal(standsOutFrom('{token}', ['FF112233']), 'FF112233', 'a face that is no colour: the first');
  assert.equal(standsOutFrom('FF000000', ['{nothing}']), null);
});

test('what a label sits on is measured as drawn: a gradient at its opacity, a see-through fill over the panel, a lit material', () => {
  const gloss = { colour: 'FF161A21', solidEnabled: true, gradientEnabled: true, gradientOpacity: 22, gradient: { stops: [{ color: 'FFFFFF' }, { color: 'FFFFFF' }, { color: '161A21' }, { color: '161A21' }] } };
  const tone = fillTone(gloss, 'FF202A34');
  assert.ok(colourContrast(tone, 'FF161A21') < 2, `a 22% gloss barely lifts a dark face: ${tone}`);
  assert.equal(fillTone({ colour: '38FFFFFF', solidEnabled: true }, 'FF6A5BD6').slice(0, 2), 'FF', 'frosted glass is the panel, a little lighter');
  assert.equal(fillTone({ colour: '38FFFFFF', solidEnabled: true }), null, 'unknown with no panel under it');
  assert.equal(fillTone({ colour: 'FF101010', imageEnabled: true }), null, 'a picture cannot be told');
  const glass = { _children: { Fill: gloss, Effects: { _children: { Material: { enabled: true, kind: 'glass', strength: 50, shine: 120 } } } } };
  const lit = backgroundTone(glass, 'FF202A34');
  assert.ok(colourContrast('FFF2F2F2', lit) < 3, `white does not read on lit glass: ${lit}`);

  const background = { _type: 'Background', _children: { Fill: { colour: 'FF3B3D42', solidEnabled: true, gradientEnabled: true, gradientOpacity: 100, gradient: { stops: [{ color: 'F6EFE0' }, { color: 'F1E6CF' }, { color: 'A9A191' }] } }, Border: { enabled: false }, Corners: { radius: 8 } } };
  const label = resolveChoiceOption({ style: 'segmented', row: rows[0], flags: {}, palette, ...sections(), background }).label.colour;
  assert.equal(label, 'FF141414', 'light lettering on a cream gradient face takes black');
});

test('a label that would not read on its option\'s fill takes black or white', () => {
  const statesSection = { _children: { Selected: state({ checked: true }, { 'Background.Fill.colour': 'FFE8E4D8', 'Text.Fill.colour': 'FFFFFFFF' }) } };
  const chosen = option('segmented', { selected: true }, { statesSection });
  assert.equal(chosen.label.colour, 'FF141414');
  const fine = option('segmented', { selected: true });
  assert.equal(fine.label.colour, 'FFFFFFFF', 'a designed colour that reads is kept');
});

test('buttons: every option is a key painted with the control\'s Background, its states those of a button', () => {
  const background = sections().background;
  background._children.Fill = { colour: 'FF3A3A3A', solidEnabled: true, gradientEnabled: true, gradient: { stops: [] } };
  const rest = option('buttons', {}, { background });
  assert.equal(rest.body._children.Fill.gradientEnabled, true, 'the face as the set draws it');
  assert.equal(rest.body._children.Border.enabled, true);
  assert.equal(option('buttons', { selected: true }).body._children.Fill.colour, 'FF4A90D9');
  assert.equal(option('buttons', { hover: true }).body._children.Fill.colour, 'FF505050');
});

test('radio: no box, a ring on every option and a dot on the chosen one, lettered in the panel\'s text', () => {
  const rest = option('radio');
  assert.equal(rest.body, null);
  assert.equal(rest.indicatorOuter.visible, true);
  assert.equal(rest.indicatorInner.shown, false);
  assert.equal(rest.label.colour, palette.panelText);
  const chosen = option('radio', { selected: true });
  assert.equal(chosen.indicatorInner.shown, true);
  assert.equal(chosen.indicatorInner.fillColour, palette.accent);
  assert.equal(chosen.indicatorOuter.borderColour, palette.accent);
  assert.equal(chosen.body, null, 'the Selected state\'s fill paints nothing on the panel');
  assert.equal(chosen.label.colour, palette.panelText, 'nor its inverse text');
});

test('LED: the set\'s button lamp, dark at rest and lit when chosen', () => {
  const rest = option('led');
  assert.equal(rest.indicatorOuter.fillColour, 'FF331111');
  assert.equal(rest.indicatorInner.shown, false);
  const lit = option('led', { selected: true });
  assert.equal(lit.indicatorInner.shown, true);
  assert.equal(lit.indicatorInner.fillColour, 'FFFF3B30');
  assert.equal(option('led', {}, { contentLayout: { lamp: 'window', lampSize: 8 } }).indicatorOuter.width, 8 * 1.8, 'a window lamp is a slot');
});

test('tabs: an underline on the chosen one; the others are quiet until the pointer is over them', () => {
  assert.equal(option('tab').indicatorInner.shown, false);
  assert.equal(option('tab').label.colour, palette.mutedText);
  assert.equal(option('tab', { hover: true }).label.colour, palette.panelText);
  const chosen = option('tab', { selected: true });
  assert.equal(chosen.indicatorInner.shown, true);
  assert.equal(chosen.indicatorInner.shape, 'bar');
  assert.equal(chosen.label.colour, palette.panelText);
});

test('the Segments tab\'s layers: shared, then the row\'s, then each state\'s shared and row patches', () => {
  const valueSection = { rows, segmentStyle: { shared: { label: { colour: 'FFBBBBBB' } }, rows: { bpf: { label: { colour: 'FF00AA55' } } } } };
  const hoverSegments = { shared: { label: { colour: 'FFFFAA00' } }, rows: { bpf: { label: { colour: 'FF123456' } } } };
  const statesSection = { _children: { Hover: state({ hover: true }, {}, hoverSegments) } };
  const at = (rowIndex, flags) => resolveChoiceOption({ style: 'segmented', row: rows[rowIndex], flags, palette, ...sections(), valueSection, statesSection }).label.colour;
  assert.equal(at(0, {}), 'FFBBBBBB');
  assert.equal(at(1, {}), 'FF00AA55');
  assert.equal(at(0, { hover: true }), 'FFFFAA00');
  assert.equal(at(1, { hover: true }), 'FF123456');
  assert.equal(resolveChoiceOption({ style: 'segmented', row: rows[1], flags: {}, palette, ...sections(), valueSection, statesSection, includeRowBase: false }).label.colour, 'FFBBBBBB', 'without the row layer');
  assert.equal(resolveChoiceOption({ style: 'segmented', row: rows[0], flags: {}, palette, ...sections(), valueSection, statesSection, previewState: 'Hover' }).label.colour, 'FFFFAA00', 'a previewed state is forced');
});

test('old files: legacy shell fields and row colours are still read', () => {
  const valueSection = { rows, segmentStyle: { shared: { whole: { fillColour: 'FF223344', borderColour: 'FFAA0000', borderWidth: 2, shape: 'pill' } }, rows: {} } };
  const legacy = option('buttons', {}, { valueSection });
  assert.equal(legacy.body._children.Fill.colour, 'FF223344');
  assert.equal(legacy.body._children.Fill.gradientEnabled, false, 'a Segments fill is flat');
  assert.deepEqual([legacy.body._children.Border.colour, legacy.body._children.Border.thickness, legacy.body._children.Border.enabled], ['FFAA0000', 2, true]);
  assert.equal(legacy.body._children.Corners.radius, 999);

  const legacyRow = { ...rows[0], visualOverrides: { textColour: 'FF00FF00', selectedTextColour: 'FFFF00FF' } };
  const statesSection = { _children: {} };
  assert.equal(resolveChoiceOption({ style: 'segmented', row: legacyRow, flags: {}, palette, ...sections(), statesSection }).label.colour, 'FF00FF00');
  assert.equal(resolveChoiceOption({ style: 'segmented', row: legacyRow, flags: { selected: true }, palette, ...sections(), statesSection }).label.colour, 'FFFF00FF');
});

test('a state of the whole control reaches every option through its segments patch', () => {
  const statesSection = { _children: { Disabled: state({ disabled: true }, { 'Transform.opacity': 0.5 }, { shared: { label: { colour: 'FF777777' } } }) } };
  assert.equal(option('radio', {}, { statesSection, signals: { disabled: true } }).label.colour, 'FF777777');
  assert.equal(option('radio', {}, { statesSection, signals: { disabled: false } }).label.colour, palette.panelText);
});

test('the control\'s state engine leaves hover, press and choice to the options, and still reports them', () => {
  const group = createControl('RadioButtonGroup');
  const fill = group._children.Background._children.Fill.colour;
  const { control, runtime } = resolveInteractiveControl(group, { hover: true, pressed: true, valueOverrideEnabled: true, valueOverride: 'option_2' });
  assert.equal(control._children.Background._children.Fill.colour, fill, 'the frame is not repainted');
  assert.equal(control._children.Transform.scale ?? 1, 1, 'nor shrunk');
  assert.ok(runtime.activeStates.includes('Hover') && runtime.activeStates.includes('Pressed') && runtime.activeStates.includes('Selected'), runtime.activeStates.join(','));

  const toggle = createControl('ToggleButton');
  const hovered = resolveInteractiveControl(toggle, { hover: true });
  assert.notEqual(hovered.control._children.Background._children.Fill.colour, toggle._children.Background._children.Fill.colour, 'a toggle still takes its Hover');
});

test('a new choice group is a segmented strip that reports its changes, with its padding paid once', () => {
  const group = createControl('RadioButtonGroup');
  const behavior = group._children.Behavior;
  assert.equal(behavior.visualStyle, 'segmented');
  assert.equal(behavior.emitValueChange, true);
  assert.equal(behavior.optionSizing, 'auto');
  const layout = group._children.ContentLayout;
  assert.deepEqual([layout.paddingLeft, layout.paddingRight, layout.paddingTop, layout.paddingBottom, layout.gap], [2, 2, 2, 2, 4]);
});
