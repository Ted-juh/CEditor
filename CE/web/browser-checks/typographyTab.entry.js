/**
 * The Typography tab, in a real browser.
 *
 * The model is unit-tested and that covers the per-mode parameter map and the point maths. What it
 * cannot cover is what the tab exists for: that a mode's own parameters appear and the other modes'
 * do NOT, that every family row and mode thumbnail actually drew, and that dragging a bezier point
 * writes the property a number field would have written.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import TypographyTab from '../src/CE_Application/components/TypographyTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { activateEditorTarget, setEditorTargetDomain, editorTarget } from '../src/CE_Application/stores/editorTarget.js';

const CONTROL_ID = 'ctrl_ty_1';

const label = createControl('Label');
label._children.Core.id = CONTROL_ID;
label._children.Core.name = 'CUTOFF';
label._children.Transform.x = 30;
label._children.Transform.y = 20;
label._children.Transform.width = 220;
label._children.Transform.height = 90;
label._children.Text.content = 'CUTOFF';
label._children.Text._children.Font.size = 28;
label._children.Text._children.Font.weightValue = 700;
label._children.Text._children.Font.underline = true;

panels.set([{ id: 'p1', name: 'Check', width: 640, height: 360, bgColour: 'FF1E1E1E', controls: [label] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([CONTROL_ID]));
activateEditorTarget('typography', CONTROL_ID, 'type');

mount(TypographyTab, { target: document.getElementById('host') });

const previewInk = (node) => (node?.querySelector('.effect-preview')?.innerHTML ?? '').length;
const textOf = (node) => node?.textContent?.trim() ?? '';
const position = () => get(panels)[0].controls[0]._children.Text._children.Position;
const font = () => get(panels)[0].controls[0]._children.Text._children.Font;

window.__ty = {
  target: () => get(editorTarget),
  half: () => [...document.querySelectorAll('.halves button')].find((b) => b.classList.contains('on'))?.textContent.trim(),
  setHalf: (name) => setEditorTargetDomain(name),

  families: () => [...document.querySelectorAll('.fam .nm')].map(textOf),
  familyFaces: () => [...document.querySelectorAll('.fam .nm')].map((n) => getComputedStyle(n).fontFamily),
  pickFamily: (name) => {
    const node = [...document.querySelectorAll('.fam')].find((f) => textOf(f.querySelector('.nm')) === name);
    node?.click();
    return !!node;
  },
  family: () => font().family,

  weights: () => [...document.querySelectorAll('.rampcell .n')].map(textOf),
  weightInk: () => [...document.querySelectorAll('.rampcell .box')].map(previewInk),
  pickWeight: (value) => {
    const node = [...document.querySelectorAll('.rampcell')].find((c) => textOf(c.querySelector('.n')) === String(value));
    node?.click();
    return !!node;
  },
  weight: () => font().weightValue,

  specimenInk: () => previewInk(document.querySelector('.spec')),
  settingLabels: () => [...document.querySelectorAll('.setbox .r > label, .setbox .r > .rl')].map(textOf),
  decorationKind: () => [...document.querySelectorAll('.setbox .r')]
    .find((r) => textOf(r.querySelector('.rl')) === 'Line')
    ?.querySelectorAll('.seg .on, [aria-checked="true"]')?.[0]?.textContent?.trim(),
  setDecorationKind: (labelText) => {
    const row = [...document.querySelectorAll('.setbox .r')].find((r) => textOf(r.querySelector('.rl')) === 'Line');
    const btn = [...(row?.querySelectorAll('button') ?? [])].find((b) => textOf(b) === labelText);
    btn?.click();
    return !!btn;
  },
  fontKeys: () => Object.keys(font()),

  modes: () => [...document.querySelectorAll('.mode .model')].map(textOf),
  modeInk: () => [...document.querySelectorAll('.mode .modebox')].map(previewInk),
  pickMode: (name) => {
    const node = [...document.querySelectorAll('.mode')].find((m) => textOf(m.querySelector('.model')) === name);
    node?.click();
    return !!node;
  },
  mode: () => position().flowMode,

  paramLabels: () => [...document.querySelectorAll('.paramcol .r > label')].map(textOf),
  paramCount: () => textOf(document.querySelector('.paramcol .colh s')),
  hiddenNote: () => textOf(document.querySelector('.hidden-note')),

  presets: () => [...document.querySelectorAll('.presets button')].map(textOf),
  applyPreset: (name) => {
    const node = [...document.querySelectorAll('.presets button')].find((b) => textOf(b) === name);
    node?.click();
    return !!node;
  },

  handles: () => document.querySelectorAll('.patheditor .handle').length,
  bezier: () => {
    const p = position();
    return { c1x: p.flowPathC1X, c1y: p.flowPathC1Y, startX: p.flowPathStartX };
  },
  polyline: () => position().flowPolylinePoints.map((pt) => ({ x: pt.x, y: pt.y })),

  /** A real pointer drag on a path handle — the gesture the feature is for. */
  dragHandle: (index, xPercent, yPercent) => {
    const editor = document.querySelector('.patheditor');
    const handle = editor?.querySelectorAll('.handle')[index];
    if (!editor || !handle) return false;
    const box = editor.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse' };
    handle.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: box.left + 5, clientY: box.top + 5 }));
    editor.dispatchEvent(new PointerEvent('pointermove', {
      ...opts,
      clientX: box.left + (box.width * xPercent) / 100,
      clientY: box.top + (box.height * yPercent) / 100,
    }));
    editor.dispatchEvent(new PointerEvent('pointerup', { ...opts }));
    return true;
  },

  addPoint: () => { document.querySelector('.addpoint')?.click(); return !!document.querySelector('.addpoint'); },

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
};
