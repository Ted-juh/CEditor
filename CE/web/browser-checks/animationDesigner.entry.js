/**
 * The Animation Designer, its own tab, in a real browser (step 5a).
 *
 * The model is unit-tested (sceneModel.test.js): clips, tracks, what a clip plays as. What only a
 * browser shows is the editor: that the stage draws the panel and a click on it picks the control
 * under the pointer, that an effect from the library becomes a clip on a track, that dragging a clip
 * retimes it and the ruler scrubs, that the stage is posed at the playhead — paused animations, a
 * negative delay — and that a control's own animation, shown as a scene, is retimed in place.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import AnimationDesigner from '../src/CE_Application/components/animationDesigner/AnimationDesigner.svelte';
import { panels, activePanelId, activeEditorTab, animationDesignerTabs } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { undo, flushHistory, initHistory } from '../src/CE_Application/stores/history.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { valueEffectAt } from '../src/CE_Application/utils/valueDrawn.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';

function place(control, id, name, x, y, w, h) {
  control._children.Core.id = id;
  control._children.Core.name = name;
  Object.assign(control._children.Transform, { x, y, width: w, height: h });
  return control;
}
const wave = place(createControl('Label'), 'wave', 'Wave', 40, 40, 220, 60);
// A pattern behind its words, for the Pattern effects.
const { patch: wavePattern } = addPatternPatch(wave._children.Background, 'Background', { speed: 30 });
wave._children.Background._children.Patterns = wavePattern['Background.Patterns'];
wave._children.Text.content = 'Wave';
const cutoff = place(createControl('Knob'), 'cutoff', 'Cutoff', 320, 30, 120, 120);
const start = place(createControl('Button'), 'start', 'Start', 40, 160, 160, 44);
start._children.Animations._children = {
  blink: { _type: 'Animation', name: 'blink', enabled: true, kind: 'keyframes', duration: 900, delay: 0, easing: 'linear', iterations: 'infinite',
    trigger: { type: 'always' }, targets: [{ path: 'Transform' }], frames: [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.4 }, { at: 1, opacity: 1 }] },
};

panels.set([{ id: 'p1', name: 'Wave Demo', width: 520, height: 260, bgColour: 'FF1E1E1E', controls: [wave, cutoff, start] }]);
activePanelId.set('p1');
animationDesignerTabs.set(['p1']);
activeEditorTab.set({ type: 'animation', id: 'p1' });
initHistory();
flushHistory();

mount(AnimationDesigner, { target: document.getElementById('host'), props: { panelId: 'p1' } });

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const panel = () => get(panels)[0];
const scenes = () => JSON.parse(JSON.stringify(panel().animationScenes ?? []));

window.__designer = {
  cards: () => [...document.querySelectorAll('[data-effect]')].map((el) => el.dataset.effect),
  stageControls: () => document.querySelectorAll('.board .canvas-control').length,
  sceneRows: () => [...document.querySelectorAll('[data-scene]')].map((el) => text(el)),
  clickScene: (id) => document.querySelector(`[data-scene="${id}"]`)?.click(),
  addScene: () => document.querySelector('[data-add-scene]')?.click(),
  scenes,
  /** A click on the stage, in the panel's own pixels. */
  pickAt: (x, y) => {
    const pick = document.querySelector('[data-pick]');
    const box = pick.getBoundingClientRect();
    const scale = box.width / panel().width;
    pick.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + x * scale, clientY: box.top + y * scale }));
  },
  pickedLabel: () => text(document.querySelector('.picked i')),
  clickEffect: (id) => document.querySelector(`[data-effect="${id}"]`)?.click(),
  tracks: () => [...document.querySelectorAll('[data-track]')].map((el) => el.dataset.track),
  clipRect: (id) => { const r = document.querySelector(`[data-clip="${id}"]`)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; },
  rulerRect: () => { const r = document.querySelector('.ruler').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
  time: () => text(document.querySelector('[data-time]')),
  play: () => document.querySelector('[data-play]')?.click(),
  settingsFor: () => document.querySelector('[data-clip-settings]')?.dataset.clipSettings ?? null,
  /** Where the stage draws a knob's value (step 6), and how many frames its value clip shows. */
  stageDrawn: (id) => Number(document.querySelector(`.board .canvas-control[data-control-id="${id}"] svg.slider-svg`)?.dataset.drawn),
  valueFrameRows: () => document.querySelectorAll('[data-value-frame]').length,
  /** The library's filter, by its label. */
  showCategory: (name) => [...document.querySelectorAll('.cats button')].find((b) => b.textContent.trim() === name)?.click(),
  clickPreset: (id) => document.querySelector(`[data-scene-preset="${id}"]`)?.click(),
  presetCards: () => [...document.querySelectorAll('[data-scene-preset]')].map((el) => [el.dataset.scenePreset, text(el)]),
  presetApplyText: () => text(document.querySelector('[data-scene-preset-apply]')),
  presetSlots: () => [...document.querySelectorAll('[data-preset-slot]')].map((el) => el.value),
  addFromPreset: () => document.querySelector('[data-preset-add]')?.click(),
  saveScenePreset: () => document.querySelector('[data-save-scene-preset]')?.click(),
  /** Where the engine says a ring sweep draws, that far through it, from that value. */
  sweepAt: (progress, live) => valueEffectAt(sceneEffect('value:sweep').effect, progress, live),
  /** What the stage draws on a control's words and its own box right now. */
  stagePose: (id) => {
    const root = document.querySelector(`.board .canvas-control[data-control-id="${id}"]`);
    if (!root) return null;
    const pieces = [...root.querySelectorAll('.text-glyphs span')].filter((span) => !span.classList.contains('text-line'));
    const style = getComputedStyle(root);
    return {
      pieces: pieces.length,
      pieceAnimation: pieces[0] ? { name: getComputedStyle(pieces[0]).animationName, delay: getComputedStyle(pieces[0]).animationDelay, state: getComputedStyle(pieces[0]).animationPlayState } : null,
      rootAnimation: { name: style.animationName, delay: style.animationDelay, state: style.animationPlayState },
      opacity: style.opacity,
    };
  },
  ownAnimation: () => JSON.parse(JSON.stringify(panel().controls.find((c) => c._children.Core.id === 'start')._children.Animations._children.blink)),
  undo: () => { flushHistory(); undo(); },
  flush: () => flushHistory(),
  saved: () => JSON.parse(serializePanel(panel())).animationScenes ?? null,
  note: () => text(document.querySelector('.head .note')),
};
window.__designerMounted = true;
