/**
 * The Designer tab, in a real browser.
 *
 * The model is unit-tested, and a node test pins the two claims the tab rests on. What neither can
 * cover is the drawing: that clicking the grid really writes a pattern nothing else in the app could
 * write, that the picture is the component's OWN renderer rather than a second grid, that dragging
 * an envelope node moves it, and that drawing on the Turing bars writes the register.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import DesignerTab from '../src/CE_Application/components/DesignerTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { activateEditorTarget, clearEditorTarget } from '../src/CE_Application/stores/editorTarget.js';
import { sequencerPattern, sequencerGeometry, cellRect } from '../src/CE_Application/utils/stepSequencerLayout.js';
import { envelopePoints } from '../src/CE_Application/utils/envelopeLayout.js';
import { turingSteps, turingGeometry } from '../src/CE_Application/utils/turingLayout.js';

const IDS = { StepSequencer: 'ctrl_seq', Envelope: 'ctrl_env', Turing: 'ctrl_tur', Knob: 'ctrl_knob', Phrase: 'ctrl_phr' };

const controls = Object.entries(IDS).map(([type, id]) => {
  const control = createControl(type);
  control._children.Core.id = id;
  control._children.Core.name = `The ${type}`;
  return control;
});

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([IDS.StepSequencer]));

mount(DesignerTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const live = (id) => get(panels)[0].controls.find((c) => c._children.Core.id === id);

function pointer(element, type, x, y) {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, clientX: box.left + x, clientY: box.top + y,
  }));
}

window.__des = {
  aim: (type) => { selectedComponentIds.set(new Set([IDS[type]])); activateEditorTarget('designer', IDS[type]); },
  clear: () => clearEditorTarget(),
  head: () => textOf(document.querySelector('.who')),
  emptyTitle: () => textOf(document.querySelector('.empty strong')),
  emptyBody: () => textOf(document.querySelector('.empty')),
  foot: () => textOf(document.querySelector('.foot')),
  alarm: () => textOf(document.querySelector('.alarm')),

  // --- the stage is the component's own renderer -------------------------------------------
  stageSvgs: () => document.querySelectorAll('.stage svg').length,
  // The renderer sits in an absolutely-positioned .fill layer, so this is a descendant match.
  rendererClass: () => [...document.querySelectorAll('.stage svg')].map((s) => s.getAttribute('class')),
  stageRects: () => document.querySelectorAll('.stage svg rect').length,
  stageBox: () => {
    const el = document.querySelector('.stage');
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height) };
  },

  // --- sequencer ---------------------------------------------------------------------------
  seqCells: () => Object.keys(sequencerPattern(live(IDS.StepSequencer))).length,
  seqPattern: () => Object.entries(sequencerPattern(live(IDS.StepSequencer)))
    .filter(([, cell]) => cell.on).map(([key, cell]) => `${key}@${cell.velocity}`).sort(),
  seqHeader: () => textOf(document.querySelector('.stagecol .colh s')),
  seqBlank: () => textOf(document.querySelector('.stage .blank')),
  // The click point comes from the SHIPPED geometry, not from numbers copied out of it — a check
  // that carries its own copy of the layout can pass while the tab clicks the wrong cell.
  clickCell: (step, trackIndex) => {
    const stage = document.querySelector('.stage');
    const box = stage.getBoundingClientRect();
    const geom = sequencerGeometry(box.width, box.height, live(IDS.StepSequencer));
    const rect = cellRect(geom, trackIndex, step);
    pointer(stage, 'pointerdown', rect.x + rect.w / 2, rect.y + rect.h / 2);
    pointer(stage, 'pointerup', rect.x + rect.w / 2, rect.y + rect.h / 2);
  },
  dragCells: (trackIndex, fromStep, toStep) => {
    const stage = document.querySelector('.stage');
    const box = stage.getBoundingClientRect();
    const geom = sequencerGeometry(box.width, box.height, live(IDS.StepSequencer));
    const at = (step) => {
      const rect = cellRect(geom, trackIndex, step);
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    };
    const start = at(fromStep);
    pointer(stage, 'pointerdown', start.x, start.y);
    for (let step = fromStep + 1; step <= toStep; step += 1) {
      const p = at(step);
      pointer(stage, 'pointermove', p.x, p.y);
    }
    const end = at(toStep);
    pointer(stage, 'pointerup', end.x, end.y);
  },
  tracks: () => [...document.querySelectorAll('.track .tname')].map(textOf),
  trackCounts: () => [...document.querySelectorAll('.track .tcount')].map(textOf),
  pickTrack: (name) => {
    const btn = [...document.querySelectorAll('.track')].find((b) => textOf(b.querySelector('.tname')) === name);
    btn?.click();
    return !!btn;
  },
  tool: (label) => {
    const btn = [...document.querySelectorAll('.railcol .chip')].find((b) => textOf(b) === label);
    btn?.click();
    return !!btn;
  },
  wipe: () => document.querySelector('.wipe')?.click(),
  wipeDisabled: () => document.querySelector('.wipe')?.disabled === true,
  velocityBox: () => document.querySelectorAll('.railcol .cell input').length,
  // NumberCell commits on blur or Enter, not on `change` — focus, type, blur, the way a person does.
  setVelocity: (value) => {
    const input = document.querySelector('.railcol .cell input');
    if (!input) return false;
    input.focus();
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return true;
  },

  // --- envelope ----------------------------------------------------------------------------
  envPoints: () => envelopePoints(live(IDS.Envelope)).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`),
  envHandles: () => document.querySelectorAll('.handles circle').length,
  envNodeRows: () => [...document.querySelectorAll('.node .nxy')].map(textOf),
  envHeader: () => textOf(document.querySelector('.stagecol .colh s')),
  dragEnvNode: (index, toX, toY) => {
    const stage = document.querySelector('.stage');
    const box = stage.getBoundingClientRect();
    const circles = [...document.querySelectorAll('.handles circle')];
    const dot = circles[index];
    if (!dot) return false;
    const at = dot.getBoundingClientRect();
    const fromX = at.left + at.width / 2 - box.left;
    const fromY = at.top + at.height / 2 - box.top;
    pointer(stage, 'pointerdown', fromX, fromY);
    pointer(stage, 'pointermove', toX, toY);
    pointer(stage, 'pointerup', toX, toY);
    return true;
  },
  addEnvNode: (x, y) => {
    const stage = document.querySelector('.stage');
    pointer(stage, 'pointerdown', x, y);
    pointer(stage, 'pointerup', x, y);
  },
  preset: (name) => {
    const btn = [...document.querySelectorAll('.railcol .chip')].find((b) => textOf(b) === name);
    btn?.click();
    return !!btn;
  },
  removeNode: () => {
    const btn = [...document.querySelectorAll('.railcol .chip')].find((b) => textOf(b).includes('remove'));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  },
  removeDisabled: () => {
    const btn = [...document.querySelectorAll('.railcol .chip')].find((b) => textOf(b).includes('remove'));
    return btn ? btn.disabled === true : null;
  },
  pickNode: (index) => { [...document.querySelectorAll('.node')][index]?.click(); },
  sustainIndex: () => Number(live(IDS.Envelope)._children.Envelope.sustainIndex),

  // --- turing ------------------------------------------------------------------------------
  turSteps: () => turingSteps(live(IDS.Turing)).map((v) => Number(v.toFixed(2))),
  turRows: () => [...document.querySelectorAll('.srow .sv')].map(textOf),
  turGates: () => document.querySelectorAll('.srow.gate').length,
  drawTuring: (stepIndex, fraction) => {
    const stage = document.querySelector('.stage');
    const box = stage.getBoundingClientRect();
    const geom = turingGeometry(box.width, box.height, turingSteps(live(IDS.Turing)).length, 8);
    const x = geom.x0 + stepIndex * (geom.stepW + geom.gap) + geom.stepW / 2;
    const y = geom.y0 + (1 - fraction) * geom.h;
    pointer(stage, 'pointerdown', x, y);
    pointer(stage, 'pointerup', x, y);
  },
  turThresholdLine: () => document.querySelectorAll('.handles line').length,

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
  jsonBoxes: () => document.querySelectorAll('textarea').length,
};
