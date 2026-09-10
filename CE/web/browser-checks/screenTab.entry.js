/**
 * The Screen tab, in a real browser.
 *
 * The model is unit-tested against the real `composeLayout`, which covers the arithmetic. What that
 * cannot cover is the tab: that an out-of-range zone is called out on screen, that the offered
 * repair writes the properties, that dragging a zone box writes the same row/colStart/colEnd a
 * number field would have, and that page rules can finally be reordered at all.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import ScreenTab from '../src/CE_Application/components/ScreenTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { activateEditorTarget, editorTarget } from '../src/CE_Application/stores/editorTarget.js';
import { lcdDesignLayoutIds } from '../src/CE_Application/stores/lcdDesignLayout.js';

const LCD_ID = 'ctrl_lcd_1';
const PIX_ID = 'ctrl_pix_1';

const lcd = createControl('LcdDisplay');
lcd._children.Core.id = LCD_ID;
lcd._children.Core.name = 'Main LCD';
lcd._children.Transform.width = 320;
lcd._children.Transform.height = 110;

const d = lcd._children.Display;
d.cols = 16;
d.rows = 2;
d.layouts = [
  {
    id: 'l1',
    name: 'Home',
    zones: [
      { id: 'z1', row: 1, colStart: 1, colEnd: 8, show: 'static', text: 'CUTOFF', align: 'left', radix: 'dec' },
      { id: 'z2', row: 1, colStart: 9, colEnd: 16, show: 'static', text: '1240', align: 'right', radix: 'dec' },
      { id: 'z3', row: 2, colStart: 1, colEnd: 16, show: 'static', text: '========', align: 'left', radix: 'dec' },
      // Row 3 of a 2-row screen: composeLayout skips it and it never paints.
      { id: 'z4', row: 3, colStart: 1, colEnd: 16, show: 'static', text: 'GHOST', align: 'left', radix: 'dec' },
      // Columns 20-28 of a 16-column screen: clamped to one cell at the right edge, still painting.
      { id: 'z5', row: 1, colStart: 20, colEnd: 28, show: 'static', text: 'RESO', align: 'left', radix: 'dec' },
    ],
  },
  { id: 'l2', name: 'Edit', zones: [{ id: 'z6', row: 1, colStart: 1, colEnd: 16, show: 'static', text: 'NAME: INIT', align: 'left', radix: 'dec' }] },
  { id: 'l3', name: 'Meters', zones: [{ id: 'z7', row: 1, colStart: 1, colEnd: 16, show: 'static', text: 'L ---- R ----', align: 'left', radix: 'dec' }] },
];
d.pages = {
  selectorSourceId: '',
  defaultLayoutId: 'l1',
  selectorMap: [
    { op: 'eq', when: '0', layoutId: 'l1' },
    { op: 'ge', when: '2', layoutId: 'l3' },
    // Unreachable: '>= 2' above it already claims 3.
    { op: 'eq', when: '3', layoutId: 'l2' },
  ],
  overlays: [],
  activeScope: [],
};

const pix = createControl('PixelDisplay');
pix._children.Core.id = PIX_ID;
pix._children.Core.name = 'OLED';
pix._children.Transform.width = 260;
pix._children.Transform.height = 140;
pix._children.Pixel.elements = [
  { id: 'e1', kind: 'static', x: 0, y: 0, w: 60, h: 8, text: 'PATCH' },
  { id: 'e2', kind: 'static', x: 200, y: 0, w: 40, h: 8, text: 'OFF' },
];

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [lcd, pix] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([LCD_ID]));
activateEditorTarget('screen', LCD_ID);

mount(ScreenTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const control = (id) => get(panels)[0].controls.find((c) => c._children.Core.id === id);
const zonesOf = (layoutId = 'l1') =>
  control(LCD_ID)._children.Display.layouts.find((l) => l.id === layoutId).zones;

window.__sc = {
  target: () => get(editorTarget),
  head: () => textOf(document.querySelector('.who')),

  pages: () => [...document.querySelectorAll('.prow .pn')].map(textOf),
  pageThumbs: () => [...document.querySelectorAll('.prow .thumb')].map((t) => textOf(t)),
  pickPage: (name) => {
    const row = [...document.querySelectorAll('.prow')].find((r) => textOf(r.querySelector('.pn')) === name);
    row?.click();
    return !!row;
  },
  designLayout: () => String(get(lcdDesignLayoutIds)[LCD_ID] ?? ''),

  rules: () => [...document.querySelectorAll('.rule')].map((r) => textOf(r).replace(/^⠿?\s*/, '')),
  liveRule: () => [...document.querySelectorAll('.rule')].findIndex((r) => r.classList.contains('live')),
  shadowedRules: () => [...document.querySelectorAll('.rule')].map((r, i) => (r.classList.contains('shadowed') ? i : -1)).filter((i) => i >= 0),
  setTest: (value) => {
    const input = document.querySelector('#screen-test');
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  storedRules: () => control(LCD_ID)._children.Display.pages.selectorMap.map((r) => `${r.op}${r.when}`),

  boxes: () => document.querySelectorAll('.zbox').length,
  // A zone the renderer paints nowhere gets an edge tab instead of a box, so "how many zones are
  // represented" is the two together.
  edges: () => document.querySelectorAll('.edge').length,
  marks: () => document.querySelectorAll('.zbox, .edge').length,
  badBoxes: () => document.querySelectorAll('.zbox.bad, .edge').length,
  check: () => textOf(document.querySelector('.check')),
  checkClass: () => document.querySelector('.check')?.className ?? '',
  fixes: () => [...document.querySelectorAll('.check .fixes button')].map(textOf),
  applyFix: (index) => { [...document.querySelectorAll('.check .fixes button')][index]?.click(); },

  zone: (i) => {
    const z = zonesOf()[i];
    return z ? { row: z.row, colStart: z.colStart, colEnd: z.colEnd } : null;
  },
  selectBox: (i) => { [...document.querySelectorAll('.zbox')][i]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, clientX: 0, clientY: 0 })); document.querySelector('.stage')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })); },

  /** A real pointer drag on a zone box, in cell steps. */
  dragBox: (i, cellsRight, cellsDown, handle = null) => {
    const stage = document.querySelector('.stage');
    const box = [...document.querySelectorAll('.zbox')][i];
    if (!stage || !box) return false;
    const grip = handle ? box.querySelector(`.h.${handle}`) : box;
    if (!grip) return false;
    const stageBox = stage.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    // One cell in CSS px, from the box itself: its width divided by the zone's cell count.
    const zone = zonesOf()[i];
    const cells = Math.max(1, (zone?.colEnd ?? 1) - (zone?.colStart ?? 1) + 1);
    const cellW = boxRect.width / cells;
    const cellH = boxRect.height;
    const start = { x: boxRect.left + boxRect.width / 2, y: boxRect.top + boxRect.height / 2 };
    const opts = { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse' };
    grip.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: start.x, clientY: start.y }));
    stage.dispatchEvent(new PointerEvent('pointermove', {
      ...opts,
      clientX: start.x + cellsRight * cellW,
      clientY: start.y + cellsDown * cellH,
    }));
    stage.dispatchEvent(new PointerEvent('pointerup', { ...opts }));
    void stageBox;
    return true;
  },

  /** A real pointer drag on a rule row. */
  dragRule: (from, to) => {
    const rows = [...document.querySelectorAll('.rule')];
    const grip = rows[from]?.querySelector('.grip');
    const target = rows[to];
    const container = document.querySelector('.rules');
    if (!grip || !target || !container) return false;
    const box = target.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse' };
    grip.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: 0, clientY: 0 }));
    container.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: box.left + 5, clientY: box.top + 2 }));
    container.dispatchEvent(new PointerEvent('pointerup', { ...opts }));
    return true;
  },

  settingLabels: () => [...document.querySelectorAll('.setbox .r > label')].map(textOf),
  hasPixelRenderer: () => !!document.querySelector('.stage canvas, .stage .pixel-surface, .stage [class*="pixel"]'),
  stageHasLcd: () => !!document.querySelector('.stage .overlay'),

  armPixel: () => {
    selectedComponentIds.set(new Set([PIX_ID]));
    activateEditorTarget('screen', PIX_ID);
  },
  elements: () => control(PIX_ID)._children.Pixel.elements.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h })),

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
};
