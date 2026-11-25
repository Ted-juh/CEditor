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
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { latestMidiInputMessage } from '../src/CE_Application/stores/deviceProfileStores.js';

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
  // A pattern behind its words, scrolling, for a pattern clip.
  const { patch: wavePattern } = addPatternPatch(wave._children.Background, 'Background', { speed: 40 });
  wave._children.Background._children.Patterns = wavePattern['Background.Patterns'];
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
  // A Macro and a meter, which draw a value of their own; the meter has its own needle test too.
  const macro = place(createControl('Macro'), `${prefix}macro`, 'Macro', 20, 300, 160, 160);
  const vu = place(createControl('Meter'), `${prefix}vu`, 'VU', 220, 300, 200, 40);
  // Two scenes on MIDI in: a kick drum's note, and the sustain pedal going down.
  const kick = place(createControl('Label'), `${prefix}kick`, 'Kick', 460, 250, 120, 30);
  kick._children.Text.content = 'Kick';
  const pedal = place(createControl('Label'), `${prefix}pedal`, 'Pedal', 460, 290, 120, 30);
  pedal._children.Text.content = 'Pedal';
  // A drag heard on a button's key only: its margin, outside the key, moves nothing.
  const knock = place(createControl('Button'), `${prefix}knock`, 'Knock', 20, 400, 200, 60);
  // A background image a scene drifts: zoomed and panned inside its clip, the label still.
  const photo = place(createControl('Label'), `${prefix}photo`, 'Photo', 460, 400, 140, 60);
  photo._children.Text.content = 'Photo';
  Object.assign(photo._children.Background._children.Fill, {
    imageEnabled: true,
    imageSrc: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="20" height="20" fill="#c33"/><rect x="20" y="20" width="20" height="20" fill="#3c3"/></svg>')}`,
    imageFit: 'tile',
  });
  // A part's pattern: Strip's band, a part of its own with a scrolling pattern, which a scene pulses.
  const strip = place(createControl('Label'), `${prefix}strip`, 'Strip', 240, 480, 200, 60);
  strip._children.Text.content = 'Strip';
  const band = createPartNode('band', { layout: { width: 180, height: 30 }, sections: { Background: { _type: 'Background', _children: {} } } });
  const { patch: bandPattern } = addPatternPatch(band._children.Background, 'Background', { speed: 40 });
  band._children.Background._children.Patterns = bandPattern['Background.Patterns'];
  strip._children.Parts = { _type: 'Parts', _children: { band } };
  // A knob's own words: the numbers round its scale, which a scene types in one at a time.
  const scale = place(createControl('Knob'), `${prefix}scale`, 'Scale', 20, 470, 80, 80);
  scale._children.Behavior.scaleNumberCount = 6;
  // A pattern a state changes — fainter, larger, faster on Hover — on a colour timing of 600 ms.
  const glow = place(createControl('Label'), `${prefix}glow`, 'Glow', 240, 400, 200, 60);
  glow._children.Text.content = 'Glow';
  const { patch: glowPattern } = addPatternPatch(glow._children.Background, 'Background', { speed: 40 });
  glow._children.Background._children.Patterns = glowPattern['Background.Patterns'];
  glow._children.States = { _type: 'States', enabled: true, priority: [], _children: { Hover: { _type: 'State', name: 'Hover', enabled: true, when: { hover: true },
    patches: { component: { 'Background.Patterns.pattern1.opacity': 30, 'Background.Patterns.pattern1.scale': 2, 'Background.Patterns.pattern1.speed': 160 }, parts: {} } } } };
  glow._children.Animations = { _type: 'Animations', enabled: true, _children: { tint: { _type: 'Animation', name: 'tint', enabled: true, kind: 'transition',
    trigger: { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true }, duration: 600, delay: 0, easing: 'linear', targets: [{ path: 'Background.Fill.colour' }] } } };
  vu._children.Animations = { _type: 'Animations', enabled: true, _children: { needle: {
    _type: 'Animation', name: 'needle', enabled: true, kind: 'value', duration: 1000, delay: 0, iterations: 1, easing: 'inOutCubic',
    frames: sceneEffect('value:sweep').effect.frames, trigger: { type: 'script' }, targets: [{ path: 'Value' }],
  } } };
  const exactly = (source, controlId, more = {}) => ({ source, controlId, follow: 'exact', ...more });
  return {
    id: `${prefix}p`, name: 'Scenes', width: 620, height: 560, bgColour: 'FF1E1E1E', controls: [wave, cutoff, start, lamp, pad, level, gauge, dial, fader, macro, vu, kick, pedal, knock, glow, photo, scale, strip],
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
      { id: 'sc_kick', name: 'Kick', trigger: { type: 'midi', message: 'note', note: 36, channel: 0 }, length: 400, loop: false,
        clips: [clip('c14', `${prefix}kick`, 'Transform', 0, 400, pop)] },
      { id: 'sc_pedal', name: 'Pedal', trigger: { type: 'midi', message: 'cc', cc: 64, above: 63, channel: 0 }, length: 400, loop: false,
        clips: [clip('c15', `${prefix}pedal`, 'Transform', 0, 400, pop)] },
      { id: 'sc_keydrag', name: 'Key drag', trigger: { type: 'script' }, length: 1000, loop: false,
        clock: exactly('drag', `${prefix}knock`, { span: 100, direction: 'up', release: 'stay', part: 'key' }),
        clips: [clip('c16', `${prefix}knock`, 'Transform', 0, 1000, fade)] },
      { id: 'sc_drift', name: 'Drift', trigger: { type: 'script' }, length: 6000, loop: false,
        clips: [clip('c17', `${prefix}photo`, 'Transform', 0, 6000, sceneEffect('paint:imageDrift').effect)] },
      // Markers (sceneFormat.js): moments that call a script's action as the scene passes them.
      { id: 'sc_cues', name: 'Cues', trigger: { type: 'script' }, length: 600, loop: false,
        clips: [clip('c21', `${prefix}lamp`, 'Transform', 0, 600, fade)],
        markers: [{ id: 'mk_b', at: 400, action: 'beam' }, { id: 'mk_a', at: 100, action: 'lights' }, { id: 'mk_x', at: 500, action: 'nobody' }] },
      // A text clip on a knob's numbers (utils/anatomyWords.js): typed round the dial, one a number.
      { id: 'sc_numbers', name: 'Numbers', trigger: { type: 'script' }, length: 600, loop: false,
        clips: [clip('c18', `${prefix}scale`, 'Parts.tickNumber', 0, 600, typewriter)] },
      // And rolled up into place, each number through a box of its own.
      { id: 'sc_numbers_roll', name: 'Numbers roll', trigger: { type: 'script' }, length: 600, loop: false,
        clips: [clip('c19', `${prefix}scale`, 'Parts.tickNumber', 0, 600, sceneEffect('text:roll:in').effect)] },
      // A clip on a part's pattern: Strip's band's, pulsed, the band and the label still.
      { id: 'sc_band', name: 'Band pulse', trigger: { type: 'script' }, length: 800, loop: false,
        clips: [clip('c20', `${prefix}strip`, 'Parts.band.Patterns.pattern1', 0, 800, sceneEffect('pattern:pulse').effect)] },
      // A pattern clip: Wave's pattern pulsed, its scroll going on underneath.
      { id: 'sc_shimmer', name: 'Shimmer', trigger: { type: 'script' }, length: 800, loop: false,
        clips: [clip('c13', `${prefix}wave`, 'Patterns.pattern1', 0, 800, sceneEffect('pattern:pulse').effect)] },
      // Step 6: what the Level knob's value draws, swept round to full and handed back.
      { id: 'sc_sweep', name: 'Sweep', trigger: { type: 'script' }, length: 1200, loop: false,
        clips: [clip('c8', `${prefix}level`, 'Value', 0, 1200, ringSweep), clip('c9', `${prefix}dial`, 'Value', 0, 1200, ringSweep), clip('c10', `${prefix}fader`, 'Value', 0, 1200, ringSweep),
          clip('c11', `${prefix}macro`, 'Value', 0, 1200, ringSweep), clip('c12', `${prefix}vu`, 'Value', 0, 1200, ringSweep)] },
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
// The actions a scene's markers call, as a script registers them with ce.core.action.
const markerCalls = [];
script.defineAction('lights', () => { markerCalls.push(['lights', Math.round(performance.now())]); });
script.defineAction('beam', () => { markerCalls.push(['beam', Math.round(performance.now())]); });
mount(SceneStageHost, { target: document.getElementById('still'), props: { panel: panel('still_') } });

const root = (id) => document.querySelector(`.canvas-control[data-control-id="${id}"]`);
window.__scenes = {
  ready: () => ['wave', 'cutoff', 'start', 'lamp', 'pad', 'level', 'gauge', 'dial', 'fader', 'macro', 'vu', 'kick', 'pedal', 'knock', 'glow', 'photo', 'scale', 'strip', 'still_wave'].every((id) => root(id)),
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
  /** A pattern's clip animation, and its scroll's (PatternLayers.svelte); `part` for a part's pattern. */
  pattern: (id, name, part = '') => {
    const host = part ? root(id)?.querySelector(`.interactive-part[data-part-name="${part}"]`) : root(id);
    const layer = host?.querySelector(`.pattern-layer[data-pattern="${name}"]`);
    if (!layer) return null;
    const clipStyle = getComputedStyle(layer.querySelector('.pattern-clip'));
    const mover = layer.querySelector('.pattern-move-x, .pattern-move-y');
    return {
      clip: { name: clipStyle.animationName, state: clipStyle.animationPlayState, delay: clipStyle.animationDelay },
      scroll: mover ? { name: getComputedStyle(mover).animationName, state: getComputedStyle(mover).animationPlayState } : null,
    };
  },
  /** A knob's scale numbers as drawn: each one's words, whether it is a piece of an effect, and its animation and look now. */
  scaleWords: (id) => [...(root(id)?.querySelectorAll('[data-scale-number]') ?? [])].map((el) => {
    const style = getComputedStyle(el);
    const clip = el.parentElement?.getAttribute('clip-path') ?? '';
    const box = clip ? document.getElementById(/#([^)]+)/.exec(clip)?.[1] ?? '')?.querySelector('rect') : null;
    return {
      text: el.textContent, piece: el.hasAttribute('data-word-piece'), name: style.animationName, delay: style.animationDelay, state: style.animationPlayState,
      opacity: Number(style.opacity), fill: style.fill, transform: style.transform, clip: box ? { y: Number(box.getAttribute('y')), h: Number(box.getAttribute('height')) } : null,
    };
  }),
  /** A control's background image as drawn: the picture's own animation, and the control's. */
  imageMotion: (id) => {
    const paint = root(id)?.querySelector('.bg-fill-paint.image');
    const style = paint ? getComputedStyle(paint) : null;
    return {
      picture: style ? { name: style.animationName, state: style.animationPlayState, delay: style.animationDelay, scale: style.scale, translate: style.translate } : null,
      control: getComputedStyle(root(id)).animationName,
    };
  },
  /** A pattern as drawn now: its layer's opacity, its tile's size, and its scroll's place and rate. */
  patternDrawn: (id, name) => {
    const layer = root(id)?.querySelector(`.pattern-layer[data-pattern="${name}"]`);
    if (!layer) return null;
    const mover = layer.querySelector('.pattern-move-x, .pattern-move-y');
    const animation = mover?.getAnimations?.()?.find((entry) => entry.animationName);
    const duration = Number(animation?.effect?.getTiming?.().duration) || 0;
    return {
      opacity: Number(getComputedStyle(layer).opacity),
      tile: mover ? mover.getBoundingClientRect().width : 0,
      place: animation && duration ? (Number(animation.currentTime) % duration) / duration : null,
      rate: animation ? animation.playbackRate : null,
      duration,
    };
  },
  /** Where a knob draws its value (step 6), and where its pointer is. */
  drawn: (id) => {
    const svg = root(id)?.querySelector('svg.slider-svg');
    const pointer = svg?.querySelector('[data-pointer="current"]');
    // A knob's handle is a circle, a slider's a rect.
    const at = (round, square) => Number(pointer?.getAttribute(round) ?? pointer?.getAttribute(square));
    if (svg) return { drawn: Number(svg.dataset.drawn), x: at('cx', 'x'), y: at('cy', 'y') };
    const form = root(id)?.querySelector('svg.anatomy');
    if (form) return { drawn: Number(form.dataset.position) };
    // The Macro and a meter say where they draw too (MacroRenderer, MeterRenderer).
    const own = root(id)?.querySelector('svg.macro, .meter');
    // The Macro's number under its knob: what it reads, which an effect leaves alone.
    const reading = own?.querySelector('text[style*="font-weight:700"]')?.textContent ?? null;
    return own ? { drawn: Number(own.dataset.drawn), reading } : null;
  },
  /** A script's call, as a panel script makes it; `done` is recorded under `doneKey`. */
  /** What the markers have called, in order, and when (ms on the page's clock). */
  markerCalls: () => markerCalls.map((entry) => [...entry]),
  /** The console lines a scene's marker left: one naming an action no script defines. */
  markerTrace: async () => {
    const { scriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
    let lines = [];
    scriptTrace.subscribe((list) => { lines = list.map((t) => t.message); })();
    return lines.filter((line) => line.startsWith('Scene "Cues"'));
  },
  script: (name, args, doneKey = '') => {
    const list = [...args];
    if (doneKey) list.push({ ...(list.pop() ?? {}), done: (completed) => { window.__scenes.dones[doneKey] = completed; } });
    return script[name](...list);
  },
  dones: {},
  /** A MIDI message arriving, where the editor's and the plug-in's MIDI input put it. */
  midiIn: (hex) => latestMidiInputMessage.set({ hex, messageType: 'midi', at: performance.now() }),
  writes: () => textWrites.slice(),
};
window.__scenesMounted = true;
