/**
 * Panel scenes playing on their triggers, in a live surface (step 5b): what Preview and the plug-in
 * draw. The runtime's timing is unit-tested (sceneRuntime.test.js); what only a browser shows is that
 * a live surface starts the panel's opening scene by itself, that a click and a hover on a control
 * start the scenes waiting on them, that a scene that ends holds its last frame, posed and still,
 * that a loop starts again, and that inside the Designer's stage nothing plays by itself. Step 5c:
 * a script's calls reach the runtime, and a drag or a control's value moves a scene's playhead.
 * Step 6: a value effect moves what a knob draws, then hands back to its value.
 */
import { mount } from 'svelte';
import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
import SceneStageHost from './SceneStageHost.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';
import { setRuntimeHost, scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

function place(control, id, name, x, y, w, h) {
  control._children.Core.id = id;
  control._children.Core.name = name;
  Object.assign(control._children.Transform, { x, y, width: w, height: h });
  return control;
}
const fade = sceneEffect('move:fadeIn').effect;
const pop = sceneEffect('move:pop').effect;
const typewriter = sceneEffect('text:typewriter:in').effect;
const ringSweep = sceneEffect('value:sweep').effect;
const clip = (id, controlId, target, start, length, effect) => ({ id, controlId, target, start, length, effect });

function panel(prefix) {
  const wave = place(createControl('Label'), `${prefix}wave`, 'Wave', 30, 30, 220, 60);
  wave._children.Text.content = 'Wave';
  const cutoff = place(createControl('Knob'), `${prefix}cutoff`, 'Cutoff', 300, 20, 120, 120);
  // Its own value animation (the Animation tab's Value kind): a wiggle that loops while it is hovered.
  cutoff._children.Animations = { _type: 'Animations', enabled: true, _children: { wiggle: {
    _type: 'Animation', name: 'wiggle', enabled: true, kind: 'value', duration: 700, delay: 0, iterations: 'infinite', easing: 'inOutQuad',
    frames: sceneEffect('value:wiggle').effect.frames, trigger: { type: 'stateChange', from: ['*'], to: ['hover'] }, targets: [{ path: 'Value' }],
  } } };
  const start = place(createControl('Button'), `${prefix}start`, 'Start', 30, 150, 160, 44);
  const lamp = place(createControl('Label'), `${prefix}lamp`, 'Lamp', 460, 30, 120, 40);
  lamp._children.Text.content = 'Lamp';
  // Step 5c: a scene a drag on the pad drives, and one the Level knob's value drives.
  const pad = place(createControl('Label'), `${prefix}pad`, 'Pad', 220, 160, 120, 90);
  pad._children.Text.content = 'Pad';
  const level = place(createControl('Knob'), `${prefix}level`, 'Level', 460, 100, 80, 80);
  const gauge = place(createControl('Label'), `${prefix}gauge`, 'Gauge', 460, 200, 120, 40);
  gauge._children.Text.content = 'Gauge';
  // Step 6: a knob drawn as a form (ControlAnatomy), not from parts.
  const dial = place(createControl('Knob'), `${prefix}dial`, 'Dial', 360, 160, 80, 80);
  dial._children.Core.controlForm = 'disc';
  // And a linear slider, which the same renderer draws.
  const fader = place(createControl('Slider'), `${prefix}fader`, 'Fader', 220, 255, 180, 24);
  const exactly = (source, controlId, more = {}) => ({ source, controlId, follow: 'exact', ...more });
  return {
    id: `${prefix}p`, name: 'Scenes', width: 620, height: 280, bgColour: 'FF1E1E1E', controls: [wave, cutoff, start, lamp, pad, level, gauge, dial, fader],
    scripting: { modules: ['ce.core', 'ce.anim'] },
    animationScenes: [
      { id: 'sc_open', name: 'Intro', trigger: { type: 'panelOpen' }, length: 900, loop: false,
        clips: [clip('c1', `${prefix}wave`, 'Text', 0, 800, typewriter), clip('c2', `${prefix}cutoff`, 'Transform', 100, 600, fade)] },
      { id: 'sc_click', name: 'Flash', trigger: { type: 'event', controlId: `${prefix}start`, event: 'click' }, length: 700, loop: false,
        clips: [clip('c3', `${prefix}start`, 'Transform', 0, 700, pop)] },
      { id: 'sc_hover', name: 'Glow', trigger: { type: 'state', controlId: `${prefix}cutoff`, to: 'hover' }, length: 700, loop: false,
        clips: [clip('c4', `${prefix}lamp`, 'Transform', 0, 700, pop)] },
      { id: 'sc_loop', name: 'Blink', trigger: { type: 'panelOpen' }, length: 500, loop: true,
        clips: [clip('c5', `${prefix}lamp`, 'Transform', 0, 400, fade)] },
      { id: 'sc_drag', name: 'Slide', trigger: { type: 'script' }, length: 1000, loop: false,
        clock: exactly('drag', `${prefix}pad`, { span: 100, direction: 'up', release: 'stay' }),
        clips: [clip('c6', `${prefix}pad`, 'Transform', 0, 1000, fade)] },
      { id: 'sc_value', name: 'Follow', trigger: { type: 'script' }, length: 1000, loop: false,
        clock: exactly('value', `${prefix}level`),
        clips: [clip('c7', `${prefix}gauge`, 'Transform', 0, 1000, fade)] },
      // Step 6: what the Level knob's value draws, swept round to full and handed back.
      { id: 'sc_sweep', name: 'Sweep', trigger: { type: 'script' }, length: 1200, loop: false,
        clips: [clip('c8', `${prefix}level`, 'Value', 0, 1200, ringSweep), clip('c9', `${prefix}dial`, 'Value', 0, 1200, ringSweep), clip('c10', `${prefix}fader`, 'Value', 0, 1200, ringSweep)] },
    ],
  };
}

const livePanel = panel('');
mount(PanelPreviewSurface, { target: document.getElementById('live'), props: { panel: livePanel, scale: 1, bgLayers: {}, gridStyle: '' } });
// A script on the live panel (step 5c): its calls find the surface's runtime by the panel's id.
const textWrites = [];
setRuntimeHost({
  panel: livePanel, scripts: [], readValue: () => undefined,
  writeValue: (control, path, value) => { textWrites.push([control._children.Core.name, path, value]); return true; },
});
const script = scriptApiForTesting('', 'scene-fixture');
mount(SceneStageHost, { target: document.getElementById('still'), props: { panel: panel('still_') } });

const root = (id) => document.querySelector(`.canvas-control[data-control-id="${id}"]`);
window.__scenes = {
  ready: () => ['wave', 'cutoff', 'start', 'lamp', 'pad', 'level', 'gauge', 'dial', 'fader', 'still_wave'].every((id) => root(id)),
  /** Every animation drawn on a control's box: name, delay, state. */
  box: (id) => {
    const el = root(id);
    if (!el) return null;
    const style = getComputedStyle(el);
    const names = style.animationName.split(',').map((s) => s.trim());
    const delays = style.animationDelay.split(',').map((s) => s.trim());
    const states = style.animationPlayState.split(',').map((s) => s.trim());
    return names.map((name, i) => ({ name, delay: delays[i % delays.length], state: states[i % states.length] })).filter((a) => a.name !== 'none');
  },
  /** The first letter's animation on a control's words. */
  letters: (id) => {
    const piece = [...(root(id)?.querySelectorAll('.text-glyphs span') ?? [])].find((span) => !span.classList.contains('text-line'));
    if (!piece) return null;
    const style = getComputedStyle(piece);
    return { name: style.animationName, delay: style.animationDelay, state: style.animationPlayState };
  },
  rect: (id) => { const r = root(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
  /** Where a knob draws its value (step 6), and where its pointer is. */
  drawn: (id) => {
    const svg = root(id)?.querySelector('svg.slider-svg');
    const pointer = svg?.querySelector('[data-pointer="current"]');
    // A knob's handle is a circle, a slider's a rect.
    const at = (round, square) => Number(pointer?.getAttribute(round) ?? pointer?.getAttribute(square));
    if (svg) return { drawn: Number(svg.dataset.drawn), x: at('cx', 'x'), y: at('cy', 'y') };
    const form = root(id)?.querySelector('svg.anatomy');
    return form ? { drawn: Number(form.dataset.position) } : null;
  },
  /** A script's call, as a panel script makes it; `done` is recorded under `doneKey`. */
  script: (name, args, doneKey = '') => {
    const list = [...args];
    if (doneKey) list.push({ ...(list.pop() ?? {}), done: (completed) => { window.__scenes.dones[doneKey] = completed; } });
    return script[name](...list);
  },
  dones: {},
  writes: () => textWrites.slice(),
};
window.__scenesMounted = true;
