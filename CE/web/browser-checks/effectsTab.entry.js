/**
 * The Effects tab, in a real browser.
 *
 * The stack model is unit-tested (`test/effectStack.test.js`) and that covers the sort and the
 * reorder round trip. What it cannot cover is the half this feature is actually for: that the tab
 * mounts, that the previews are the REAL renderer rather than an approximation, that dragging a row
 * writes an order that comes back in the new position, and that the specimen changes when an effect
 * is switched off. All of that only happens in a browser.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import EffectsTab from '../src/CE_Application/components/EffectsTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { activateEditorTarget, editorTarget } from '../src/CE_Application/stores/editorTarget.js';

const CONTROL_ID = 'ctrl_fx_1';

const label = createControl('Label');
label._children.Core.id = CONTROL_ID;
label._children.Core.name = 'CUTOFF';
label._children.Transform.x = 40;
label._children.Transform.y = 30;
label._children.Transform.width = 180;
label._children.Transform.height = 64;
label._children.Text.content = 'CUTOFF';
label._children.Text._children.Font.size = 34;
label._children.Text._children.Font.weightValue = 800;

// A couple of effects on, so the stack has something to show and the thumbnails have something to
// draw. Deliberately NOT all of them: an author's document normally has two or three.
Object.assign(label._children.Text._children.Effects, {
  outlineEnabled: true,
  outlineColour: 'FF5B9BD5',
  outlineThickness: 1.4,
  glowEnabled: true,
  glowColour: 'CC14B8A6',
  glowSize: 8,
  shadowEnabled: true,
  shadowColour: '99000000',
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowBlur: 4,
});

// A state that switches the glow off, so the state strip has the case it exists to reveal.
label._children.States = {
  _type: 'States',
  enabled: true,
  debug: false,
  priority: ['pressed'],
  _children: {
    pressed: {
      _type: 'State',
      enabled: true,
      when: 'pressed',
      patch: { 'Text.Effects.glowEnabled': false },
    },
  },
};

panels.set([{ id: 'p1', name: 'Check', width: 640, height: 360, bgColour: 'FF1E1E1E', controls: [label] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([CONTROL_ID]));
activateEditorTarget('effects', CONTROL_ID, 'text');

mount(EffectsTab, { target: document.getElementById('host') });

// The stack proper. `.ungrouped .srow` holds Blur and Copy, which have no *Order of their own and
// so cannot be dragged — they are listed under "Not stacked" and are counted separately.
const rowNodes = () => [...document.querySelectorAll('.stack .srow')]
  .filter((node) => !node.closest('.ungrouped'));
const looseNodes = () => [...document.querySelectorAll('.stack .ungrouped .srow')];
const nameOf = (node) => node.querySelector('.snm')?.textContent?.trim().split('—')[0].trim() ?? '';
const rowNames = () => rowNodes().map(nameOf);
// Exact, not `includes`: "Inner Glow" sits above "Glow" and "Inner Shadow" above "Shadow", so a
// substring match drives the wrong row and the check passes or fails for the wrong reason.
const byName = (name) => [...rowNodes(), ...looseNodes()].find((node) => nameOf(node) === name);

/** Every preview in the tab renders through CanvasControl, so a real preview has real markup in
 *  it. An empty box would mean the renderer never mounted. */
const previewInk = (node) => (node?.querySelector('.effect-preview')?.innerHTML ?? '').length;

window.__fx = {
  target: () => get(editorTarget),

  rows: rowNames,

  stackRowCount: () => rowNodes().length,

  looseRows: () => looseNodes().map(nameOf),

  looseThumbInk: () => looseNodes().map((node) => previewInk(node.querySelector('.thumb'))),

  /** The order numbers as the document now holds them. */
  orders: () => {
    const fx = get(panels)[0].controls[0]._children.Text._children.Effects;
    return {
      reflection: fx.reflectionOrder, shadow: fx.shadowOrder, glow: fx.glowOrder,
      motion: fx.motionOrder, outline: fx.outlineOrder, stroke2: fx.stroke2Order,
      innerShadow: fx.innerShadowOrder, bevel: fx.bevelOrder, innerGlow: fx.innerGlowOrder,
      fill: get(panels)[0].controls[0]._children.Text._children.Fill.order,
    };
  },

  enabled: () => {
    const fx = get(panels)[0].controls[0]._children.Text._children.Effects;
    return { outline: fx.outlineEnabled, glow: fx.glowEnabled, shadow: fx.shadowEnabled };
  },

  /** How many rows drew something — the per-row thumbnails, which are the expensive half of the
   *  design and the part most likely to silently render nothing. */
  rowThumbInk: () => rowNodes().map((node) => previewInk(node.querySelector('.thumb'))),

  specimenInk: () => previewInk(document.querySelector('.spec')),

  stateNames: () => [...document.querySelectorAll('.states .stl')].map((n) => n.textContent.trim()),
  stateInk: () => [...document.querySelectorAll('.states .stbox')].map(previewInk),
  stateFlags: () => [...document.querySelectorAll('.states .st')].map((n) => !!n.querySelector('.stflag')),

  lookNames: () => [...document.querySelectorAll('.looks .lookl')].map((n) => n.textContent.trim()),
  lookInk: () => [...document.querySelectorAll('.looks .lookbox')].map(previewInk),

  settingsLabels: () => [...document.querySelectorAll('.fxbox .r > label')].map((n) => n.textContent.trim()),

  /** No sliders. The rule for this tab, asserted against the rendered DOM rather than trusted. */
  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,

  selectRow: (name) => {
    const node = byName(name);
    node?.click();
    return !!node;
  },

  toggleRow: (name) => {
    const node = byName(name);
    node?.querySelector('.dot')?.click();
    return !!node;
  },

  /** A real pointer drag on the grip, which is how the feature is actually used. */
  dragRow: (fromName, toIndex) => {
    const nodes = rowNodes();
    const from = nodes.find((entry) => nameOf(entry) === fromName);
    const target = nodes[toIndex];
    if (!from || !target) return false;
    const grip = from.querySelector('.grip');
    const fromBox = from.getBoundingClientRect();
    const toBox = target.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' };
    grip.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: fromBox.left + 6, clientY: fromBox.top + 6 }));
    const list = document.querySelector('.stack');
    list.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: toBox.left + 6, clientY: toBox.top + toBox.height / 2 - 1 }));
    list.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: toBox.left + 6, clientY: toBox.top + toBox.height / 2 - 1 }));
    return true;
  },

  applyLook: (name) => {
    const node = [...document.querySelectorAll('.looks .look')]
      .find((entry) => entry.querySelector('.lookl')?.textContent?.replace('✓', '').trim() === name);
    node?.click();
    return !!node;
  },
};
