/**
 * Panel animations, played by the real renderers in a real browser.
 *
 * The unit tests pin which transition the tracker picks for each change. What they cannot see is
 * whether that choice reaches the screen: that CanvasControl writes it into the control's style, that
 * a part's painting layers read the colour timing through the inherited custom property, that the
 * slider glide moves the drawn pointer, and that the operating system's reduced-motion setting is
 * honoured. This mounts the preview surface over a small panel and drives its preview sessions.
 */
import '../src/assets/fonts/panelFonts.css';
import { mount } from 'svelte';
import { get } from 'svelte/store';
import GaiaPagesHarness from './GaiaPagesHarness.svelte';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  panelPreviewSessions,
  createInteractionPreviewSession,
  setPreviewModeEnabled,
  updatePanelPreviewSession,
} from '../src/CE_Application/stores/interactionPreview.js';
import { animationActivity } from '../src/CE_Application/stores/animationActivity.js';
import { startTransport, stopTransport, setTransportBpm } from '../src/CE_Application/stores/transport.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

window.__JUCE__ = undefined;

function place(control, id, x, y, w, h) {
  control._children.Core.id = id;
  control._children.Core.name = id;
  Object.assign(control._children.Transform, { x, y, width: w, height: h });
  return control;
}

const animation = (name, trigger, targets, duration, easing = 'linear') => ({
  _type: 'Animation', name, enabled: true, kind: 'transition', trigger, targets, duration, delay: 0, easing,
});

// A Button whose Hover state patches its fill colour and whose Pressed state patches colour and scale
// — the shipped states — with two animations that differ in timing, the case the audit led with.
const button = place(createControl('Button'), 'btn', 20, 20, 160, 48);
button._children.Animations._children = {
  hoverIn: animation('hoverIn', { type: 'stateChange', from: ['*'], to: ['hover'] },
    [{ path: 'Transform.scale', properties: ['transform'] }, { path: 'Background.Fill.colour', properties: ['colour'] }], 400),
  pressIn: animation('pressIn', { type: 'stateChange', from: ['*'], to: ['pressed'] },
    [{ path: 'Transform.scale', properties: ['transform'] }], 80),
};

// A Knob with its shipped animations: pointerSlide and rangeSlide, on a value change. Slowed to
// 600ms so "mid-glide" is a wide window and not a race with the frame clock.
const knob = place(createControl('Knob'), 'knob', 220, 20, 120, 120);
for (const name of ['pointerSlide', 'rangeSlide']) knob._children.Animations._children[name].duration = 600;

// Two Ranges whose press animation uses the two easings CSS has no name for: a spring, written as
// CSS linear(), and a curve drawn by hand.
const springy = place(createControl('Range'), 'springy', 20, 100, 120, 28);
Object.assign(springy._children.Animations._children.pressIn, { easing: 'spring', spring: { damping: 6, frequency: 12 }, duration: 500 });
const drawn = place(createControl('Range'), 'drawn', 20, 150, 120, 28);
Object.assign(drawn._children.Animations._children.pressIn, { easing: 'custom', bezier: [0.1, 0.7, 0.2, 1.3] });

// Keyframes, the second kind: a slow pulse that never stops, on a control turned 20° by its own
// transform — the pulse has to compose with that, not replace it — and a flash on every beat.
const keyframes = (name, trigger, frames, duration) => ({
  _type: 'Animation', name, enabled: true, kind: 'keyframes', trigger, targets: [{ path: 'Transform' }],
  frames, duration, delay: 0, easing: 'linear',
});
const pulser = place(createControl('Range'), 'pulser', 220, 150, 100, 28);
pulser._children.Transform.rotation = 20;
pulser._children.Animations._children = {
  pulse: keyframes('pulse', { type: 'always' }, [{ at: 0, scale: 1 }, { at: 0.5, scale: 1.5 }, { at: 1, scale: 1 }], 2000),
};
const beater = place(createControl('Range'), 'beater', 340, 150, 50, 28);
beater._children.Animations._children = {
  flash: keyframes('flash', { type: 'beat', every: 1 }, [{ at: 0, opacity: 0.2 }, { at: 1, opacity: 1 }], 200),
  wink: keyframes('wink', { type: 'script' }, [{ at: 0, scale: 1 }, { at: 0.5, scale: 0.6 }, { at: 1, scale: 1 }], 400),
};

// ce.anim is declared because this panel has no script of its own for the runtime to derive it from;
// a panel whose script calls ce.anim.play gets the module from that script.
const panel = {
  id: 'motion', name: 'Motion', width: 400, height: 200, bgColour: 'FF1E1E1E',
  controls: [button, knob, springy, drawn, pulser, beater],
  scripting: { modules: ['ce.core', 'ce.anim'] },
};
panels.set([]);
addPanel(panel);
setActivePanel(panel.id);
panelPreviewSessions.set(Object.fromEntries([button, knob, springy, drawn, pulser, beater].map((c) => [c._children.Core.id, createInteractionPreviewSession(c)])));
mount(GaiaPagesHarness, { target: document.getElementById('host'), props: { panelId: panel.id } });
setPreviewModeEnabled(true);

const root = (id) => document.querySelector(`.canvas-control[data-control-id="${id}"]`);

window.__motion = {
  set: (id, patch) => updatePanelPreviewSession(id, patch),
  session: (id) => get(panelPreviewSessions)[id],
  /** The control's own transition, as the browser computed it. */
  rootTransition: (id) => {
    const style = getComputedStyle(root(id));
    return { property: style.transitionProperty, duration: style.transitionDuration, timing: style.transitionTimingFunction, colourVar: style.getPropertyValue('--ce-colour-transition').trim() };
  },
  /** Every element inside the control that is transitioning a colour, and its computed background. */
  paintLayers: (id) => [...root(id).querySelectorAll('*')]
    .map((el) => ({ el, style: getComputedStyle(el) }))
    .filter(({ style }) => /background-color/.test(style.transitionProperty))
    .map(({ el, style }) => ({ cls: String(el.className?.baseVal ?? el.className), duration: style.transitionDuration, background: style.backgroundColor })),
  /** The plain fill layer of a control: its colour now, and the transition it is running. */
  fill: (id) => {
    const style = getComputedStyle(root(id).querySelector('.control-content'));
    return { background: style.backgroundColor, property: style.transitionProperty, duration: style.transitionDuration };
  },
  /** What the knob draws, as markup — a pointer that moved is markup that changed. */
  knobMarkup: () => root('knob')?.querySelector('svg')?.outerHTML ?? '',
  activity: () => get(animationActivity),
  /** The keyframe animation on a control and where it has the control right now. */
  keyframes: (id) => {
    const style = getComputedStyle(root(id));
    return { name: style.animationName, scale: style.scale, transform: style.transform };
  },
  startTransport: (bpm) => { setTransportBpm(bpm); startTransport(0); },
  /** A script's ce.anim.play, through the real script API. */
  scriptPlay: (control, name) => scriptApiForTesting('', 'motion-script').animatePlay(control, name),
  stopTransport: () => stopTransport(),
};
