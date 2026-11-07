// textStyles.test.js — named text styles (utils/textStyles.js, stores/textStyles.js).
//
// The promise: change a style once and every text that uses it follows, in one undo step; a text
// changed by hand afterwards shows it, and can be put back or can become the style; deleting a style
// or detaching from it changes nothing anybody can see.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  captureTextStyle, differencesFromStyle, newTextStyleId, textStylePatch, unusedTextStyleName,
} from '../src/CE_Application/utils/textStyles.js';
import { initHistory, flushHistory, undo } from '../src/CE_Application/stores/history.js';
import { panels, activePanelId, activeEditorTab, selectedComponentIds, addPanel, createPanel } from '../src/CE_Application/stores/panels.js';
import { addControl, updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel as newPanel, serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';
import {
  applyTextStyle, createTextStyleFrom, deleteTextStyle, detachTextStyle, renameTextStyle, resetToTextStyle,
  textStyleUsers, updateTextStyleFrom,
} from '../src/CE_Application/stores/textStyles.js';

// A control with nothing a set decides: its Font is all its own, so all of it goes in the style.
function plainText() {
  return {
    _children: {
      Core: { id: 'x', controlType: 'NotAType' },
      Text: {
        content: 'FILTER',
        _children: {
          Font: { family: 'Inter', size: 14, weightValue: 700, weight: 'Bold', letterSpacing: 1.5, caseMode: 'uppercase', ligatures: true },
          Fill: { colour: '{text.primary}', mode: 'solid' },
          Multiline: { lineHeight: 1.1, wrapMode: 'word' },
          Effects: { shadowEnabled: true },
        },
      },
    },
  };
}

test('a style is the type of a text — font, colour, line height — and not its words or its layout', () => {
  const control = plainText();
  const style = captureTextStyle(control);
  assert.deepEqual(style, {
    text: {
      Font: { family: 'Inter', size: 14, weightValue: 700, weight: 'Bold', letterSpacing: 1.5, caseMode: 'uppercase' },
      Fill: { colour: '{text.primary}' },
      Multiline: { lineHeight: 1.1 },
    },
    fromSet: [],
  }, 'a colour linked to the set stays linked');
  assert.deepEqual(textStylePatch(style, control, 'heading'), {
    'Text.Font.family': 'Inter', 'Text.Font.size': 14, 'Text.Font.weightValue': 700, 'Text.Font.weight': 'Bold',
    'Text.Font.letterSpacing': 1.5, 'Text.Font.caseMode': 'uppercase', 'Text.Fill.colour': '{text.primary}',
    'Text.Multiline.lineHeight': 1.1, 'Text.textStyle': 'heading',
  });
  assert.deepEqual(differencesFromStyle(control, style), []);
  control._children.Text._children.Font.size = 16;
  assert.deepEqual(differencesFromStyle(control, style), [{ section: 'Font', key: 'size' }]);
});

test('what the control set draws stays with the set: a style does not pin the factory typeface', () => {
  // A new Label holds Arial 400 in the document and the canvas draws its set's lettering instead.
  const source = createControl('Label');
  source._children.Text._children.Font.size = 20;
  const style = captureTextStyle(source);
  assert.ok(!Object.hasOwn(style.text.Font, 'family'), 'the factory typeface is not copied');
  assert.ok(style.fromSet.includes('Font.family') && style.fromSet.includes('Font.weightValue'));
  assert.equal(style.text.Font.size, 20);

  // A label the author set in Courier gets the set's typeface back, and is unpinned from Courier.
  const follower = createControl('Label');
  follower._children.Text._children.Font.family = 'Courier';
  follower._children.Core.setOverrides = ['Text.Font.family'];
  const patch = textStylePatch(style, follower, 'heading');
  assert.equal(patch['Text.Font.family'], 'Arial');
  assert.ok(!patch['Core.setOverrides'].includes('Text.Font.family'));
  assert.ok(differencesFromStyle(follower, style).some((entry) => entry.key === 'family'), 'Courier is a difference');

  // A style whose author chose the factory typeface on purpose pins it on every text it reaches.
  const chosen = createControl('Label');
  chosen._children.Core.setOverrides = ['Text.Font.family'];
  const own = captureTextStyle(chosen);
  assert.equal(own.text.Font.family, 'Arial');
  assert.ok(textStylePatch(own, createControl('Label'))['Core.setOverrides'].includes('Text.Font.family'));
});

test('names and ids', () => {
  assert.equal(newTextStyleId('Section heading', []), 'section-heading');
  assert.equal(newTextStyleId('Section heading', [{ id: 'section-heading' }]), 'section-heading-2');
  assert.equal(unusedTextStyleName('Caption', [{ name: 'caption' }]), 'Caption 2');
});

function setUp() {
  componentWorkspaceMode.set('panel'); panels.set([]); activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null }); selectedComponentIds.set(new Set());
  initHistory(); addPanel(createPanel('Styles')); flushHistory();
  const ids = ['A', 'B', 'C'].map(() => addControl('Label')._children.Core.id);
  flushHistory();
  return ids;
}
const panel = () => get(panels)[0];
const label = (id) => panel().controls.find((control) => control._children.Core.id === id);
const size = (id) => label(id)._children.Text._children.Font.size;

test('change the style once, and every text using it follows — one undo step', () => {
  const [a, b, c] = setUp();
  updateControlProperty(a, 'Text.Font.size', 20);
  updateControlProperty(a, 'Text.Font.letterSpacing', 2);
  flushHistory();

  const style = createTextStyleFrom(a, 'Heading');
  assert.equal(style.text.Font.size, 20);
  assert.equal(label(a)._children.Text.textStyle, style.id);
  assert.equal(applyTextStyle(style.id, [b, c]), 2);
  assert.deepEqual([size(b), size(c)], [20, 20]);
  assert.equal(label(c)._children.Text._children.Font.letterSpacing, 2);
  assert.deepEqual(textStyleUsers(panel(), style.id).map((control) => control._children.Core.id).sort(), [a, b, c].sort());

  // Changed by hand: it shows, and the others do not move on their own.
  updateControlProperty(a, 'Text.Font.size', 24);
  flushHistory();
  assert.deepEqual([size(b), size(c)], [20, 20]);
  // Made the style: the others follow.
  assert.equal(updateTextStyleFrom(a), 2);
  assert.deepEqual([size(a), size(b), size(c)], [24, 24, 24]);
  assert.equal(panel().textStyles[0].text.Font.size, 24);
  undo();
  assert.deepEqual([size(a), size(b), size(c)], [24, 20, 20], 'one undo puts every follower and the style back');
  assert.equal(panel().textStyles[0].text.Font.size, 20);
});

test('reset, detach, rename and delete', () => {
  const [a, b] = setUp();
  const style = createTextStyleFrom(a, 'Caption');
  applyTextStyle(style.id, [b]);
  updateControlProperty(b, 'Text.Font.size', 30);
  flushHistory();
  resetToTextStyle([b]);
  assert.equal(size(b), style.text.Font.size, 'reset puts the text back to its style');

  renameTextStyle(style.id, 'Small caption');
  assert.equal(panel().textStyles[0].name, 'Small caption');
  assert.equal(panel().textStyles[0].id, style.id, 'the id does not change, so the links hold');

  detachTextStyle([b]);
  assert.equal(label(b)._children.Text.textStyle, '');
  assert.equal(size(b), style.text.Font.size, 'detaching changes nothing you can see');

  updateControlProperty(a, 'Text.Font.size', 9);
  deleteTextStyle(style.id);
  assert.deepEqual(panel().textStyles, []);
  assert.equal(label(a)._children.Text.textStyle, '');
  assert.equal(size(a), 9, 'deleting the style leaves the text as it was');
});

test('the styles and the links are saved with the panel, and no empty list is written', () => {
  const panelDoc = newPanel('Saved');
  const control = createControl('Label', { Core: { id: 'a' } });
  control._children.Text._children.Font.size = 20;
  control._children.Text.textStyle = 'heading';
  panelDoc.controls = [control];
  panelDoc.textStyles = [{ id: 'heading', name: 'Heading', text: { Font: { size: 20 } }, fromSet: ['Font.family'] }];
  const back = deserializePanel(serializePanel(panelDoc), '/panels/Saved.cepanel');
  assert.deepEqual(back.textStyles, panelDoc.textStyles);
  assert.equal(back.controls[0]._children.Text.textStyle, 'heading');
  assert.equal(back.controls[0]._children.Text._children.Font.size, 20);
  const none = newPanel('None');
  none.textStyles = [];
  assert.ok(!String(serializePanel(none)).includes('textStyles'));
});
