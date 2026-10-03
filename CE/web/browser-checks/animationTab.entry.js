/**
 * The Animation tab, in a real browser.
 *
 * The model is unit-tested against the real animation runtime, which covers the rule about which
 * targets do anything. What that cannot cover is the tab: that a dead target is marked as dead on
 * screen, that removing and reordering a target writes the control instead of asking you to edit
 * JSON, that every easing is drawn as a curve, and that adding a change warns you before you add it.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import AnimationTab from '../src/CE_Application/components/AnimationTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults } from '../src/CE_Application/utils/customComponentFactory.js';
import { undo } from '../src/CE_Application/stores/history.js';

const CONTROL_ID = 'ctrl_anim';

const control = createControl('CustomComponent');
control._children.Core.id = CONTROL_ID;
control._children.Core.name = 'Big Knob';
control._children.Parts = createCustomComponentPartsDefaults();

const partNames = Object.keys(control._children.Parts._children);
const first = partNames[0];

// Triggers name states by the control's own States keys, so the control needs some to name.
const state = (name, when) => ({ _type: 'State', name, enabled: true, when, patches: { component: {}, parts: {} } });
control._children.States = {
  _type: 'States',
  enabled: true,
  priority: [],
  _children: { Hover: state('Hover', { hover: true }), Pressed: state('Pressed', { pressed: true }) },
};

control._children.Animations = {
  _type: 'Animations',
  enabled: true,
  debug: false,
  _children: {
    pressMotion: {
      _type: 'Animation',
      name: 'pressMotion',
      enabled: true,
      kind: 'transition',
      trigger: { type: 'stateChange', from: ['*'], to: ['pressed'] },
      duration: 90,
      delay: 0,
      easing: 'outQuad',
      targets: [
        // Works.
        { path: `Parts.${first}.Layout.scale`, properties: ['transform'] },
        // Works now. This was the tab's first dead target: the runtime had no colour bucket.
        { path: `Parts.${first}.Background.Fill.colour`, properties: ['background-color'] },
        // Works.
        { path: `Parts.${first}.opacity`, properties: ['opacity'] },
        // Dead: there is no part called this.
        { path: 'Parts.nosuchpart.Layout.rotation', properties: ['transform'] },
        // Dead in a different way: the runtime does not animate text content.
        { path: `Parts.${first}.Text.content` },
      ],
    },
    hoverGlow: {
      _type: 'Animation',
      name: 'hoverGlow',
      enabled: false,
      kind: 'transition',
      trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
      duration: 140,
      delay: 0,
      easing: 'inOutQuad',
      targets: [{ path: 'Transform.opacity', properties: ['opacity'] }],
    },
    // Ties with pressMotion for the first part's scale on a press, and is later in the list, so
    // pressMotion never plays there. And one of its states is misspelt.
    pressEcho: {
      _type: 'Animation',
      name: 'pressEcho',
      enabled: true,
      kind: 'transition',
      trigger: { type: 'stateChange', from: ['*'], to: ['pressed', 'presed'] },
      duration: 60,
      delay: 0,
      easing: 'outQuad',
      targets: [{ path: `Parts.${first}.Layout.scale`, properties: ['transform'] }],
    },
  },
};

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [control] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([CONTROL_ID]));

mount(AnimationTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const live = () => get(panels)[0].controls[0];
const animation = (name) => live()._children.Animations._children[name];

window.__anim = {
  head: () => textOf(document.querySelector('.who')),
  alarm: () => textOf(document.querySelector('.alarm')),

  animationNames: () => [...document.querySelectorAll('.arow .nm')].map(textOf),
  animationMeta: () => [...document.querySelectorAll('.arow .meta')].map(textOf),
  selectAnimation: (name) => {
    const row = [...document.querySelectorAll('.arow')].find((r) => textOf(r.querySelector('.nm')) === name);
    row?.click();
    return !!row;
  },
  selectedAnimation: () => textOf(document.querySelector('.arow.sel .nm')),
  toggleAnimation: (name) => {
    const row = [...document.querySelectorAll('.arow')].find((r) => textOf(r.querySelector('.nm')) === name);
    row?.querySelector('.dot')?.click();
    return !!row;
  },
  storedEnabled: (name) => animation(name).enabled,

  targetPaths: () => [...document.querySelectorAll('.trow .what')].map(textOf),
  // The verdict without the "solid only" note a colour target carries beside it.
  targetVerdicts: () => [...document.querySelectorAll('.trow .does')].map((d) => textOf(d).replace(/\s*solid only$/, '')),
  targetNotes: () => [...document.querySelectorAll('.trow .does .note')].map((n) => n.getAttribute('title')),
  deadRows: () => [...document.querySelectorAll('.trow.bad .what')].map(textOf),
  targetCount: () => document.querySelectorAll('.trow').length,
  removeTarget: (index) => { document.querySelectorAll('.trow')[index]?.querySelector('.drop')?.click(); },
  storedTargets: (name) => animation(name).targets.map((t) => t.path),

  /** Every easing is a drawn curve, not a name in a dropdown. */
  easingNames: () => [...document.querySelectorAll('.easing span')].map(textOf),
  easingCurves: () => [...document.querySelectorAll('.easing svg path')].length,
  easingPathData: (name) => {
    const button = [...document.querySelectorAll('.easing')].find((b) => textOf(b.querySelector('span')) === name);
    return [...(button?.querySelectorAll('svg path') ?? [])].map((p) => p.getAttribute('d'));
  },
  pickEasing: (name) => {
    const button = [...document.querySelectorAll('.easing')].find((b) => textOf(b.querySelector('span')) === name);
    button?.click();
    return !!button;
  },
  activeEasing: () => textOf(document.querySelector('.easing.on span')),
  storedAnimation: (name) => JSON.parse(JSON.stringify(animation(name))),
  bezierEditor: () => !!document.querySelector('.bezier svg'),
  springCells: () => [...document.querySelectorAll('.setbox .r .lab')].map(textOf).filter((t) => t === 'Damping' || t === 'Bounce'),
  /** Drag the second bezier handle by (dx, dy) screen pixels, as a person would. */
  dragHandle: async (dx, dy) => {
    const handle = document.querySelector('.bezier .handle.h2');
    const svg = document.querySelector('.bezier svg');
    if (!handle || !svg) return false;
    const box = handle.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const opts = (cx, cy) => ({ bubbles: true, clientX: cx, clientY: cy, pointerId: 7, isPrimary: true });
    handle.dispatchEvent(new PointerEvent('pointerdown', opts(x, y)));
    for (let i = 1; i <= 4; i += 1) svg.dispatchEvent(new PointerEvent('pointermove', opts(x + (dx * i) / 4, y + (dy * i) / 4)));
    svg.dispatchEvent(new PointerEvent('pointerup', opts(x + dx, y + dy)));
    return true;
  },
  storedEasing: (name) => animation(name).easing,

  addOptions: () => [...document.querySelectorAll('.addbox select')].map((s) => [...s.options].map((o) => o.textContent.trim())),
  chooseChange: (label) => {
    const select = document.querySelectorAll('.addbox select')[1];
    const option = [...(select?.options ?? [])].find((o) => o.textContent.trim() === label);
    if (!select || !option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  addWarning: () => textOf(document.querySelector('.addbox .warn')),
  add: () => { document.querySelector('.addbtn')?.click(); },

  // --- making and unmaking ---------------------------------------------------------------
  storedNames: () => Object.keys(live()._children.Animations._children),
  typeNewName: (value) => {
    const input = [...document.querySelectorAll('.newrow input')][0];
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  clickAdd: () => {
    const btn = [...document.querySelectorAll('.newrow .mk')].find((b) => textOf(b).includes('Add'));
    btn?.click();
    return !!btn;
  },
  addDisabled: () => {
    const btn = [...document.querySelectorAll('.newrow .mk')].find((b) => textOf(b).includes('Add'));
    return btn ? btn.disabled === true : null;
  },
  removeAnimation: (name) => {
    const row = [...document.querySelectorAll('.arow')].find((r) => textOf(r.querySelector('.nm')) === name);
    row?.querySelector('.rt.del')?.click();
    return !!row;
  },
  beginRename: (name) => {
    const row = [...document.querySelectorAll('.arow')].find((r) => textOf(r.querySelector('.nm')) === name);
    row?.querySelector('.rt:not(.del)')?.click();
    return !!row;
  },
  typeRename: (value) => {
    const input = [...document.querySelectorAll('.newrow input')][0];
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  clickRename: () => {
    const btn = [...document.querySelectorAll('.newrow .mk')].find((b) => textOf(b) === 'Rename');
    btn?.click();
    return !!btn;
  },
  renameError: () => textOf(document.querySelector('.renerr')),

  // --- triggers, clashes ---------------------------------------------------------------
  clashAlarm: () => textOf(document.querySelector('.alarm.clashes')),
  unknownAlarm: () => textOf(document.querySelector('.alarm.unknown')),
  rowMarkers: (name) => {
    const row = [...document.querySelectorAll('.arow')].find((r) => textOf(r.querySelector('.nm')) === name);
    return [...(row?.querySelectorAll('.meta i') ?? [])].map((i) => [...i.classList].filter((c) => c !== 'bad' && !c.startsWith('svelte-')).join(' ') || 'dead');
  },
  chips: (label) => [...document.querySelectorAll(`.chips[aria-label="${label}"] .chip`)]
    .map((chip) => `${textOf(chip)}${chip.classList.contains('on') ? '*' : ''}${chip.classList.contains('bad') ? '!' : ''}`),
  clickChip: (label, name) => {
    const chip = [...document.querySelectorAll(`.chips[aria-label="${label}"] .chip`)].find((c) => textOf(c) === name);
    chip?.click();
    return !!chip;
  },
  unknownWarning: () => textOf(document.querySelector('.unknownwarn')),
  clashWarnings: () => [...document.querySelectorAll('.clashwarn')].map(textOf),
  storedTrigger: (name) => JSON.parse(JSON.stringify(animation(name).trigger)),
  clickSegment: (ariaLabel, label) => {
    const button = [...document.querySelectorAll(`.segmented[aria-label="${ariaLabel}"] button`)].find((b) => textOf(b) === label);
    button?.click();
    return !!button;
  },
  undo: () => undo(),

  // --- the stage ----------------------------------------------------------------------
  stageControls: () => document.querySelectorAll('.stage-box .canvas-control').length,
  playTitle: () => document.querySelector('.stage-box .play')?.getAttribute('title') ?? '',
  playDisabled: () => document.querySelector('.stage-box .play')?.disabled === true,
  clickPlay: () => { document.querySelector('.stage-box .play')?.click(); },
  toggleSlow: () => { document.querySelector('.stage-box .slow')?.click(); },
  stepLabel: () => textOf(document.querySelector('.stage-box .steplabel')),
  stageWhy: () => textOf(document.querySelector('.stage-box .why')),
  stageTransition: () => {
    const el = document.querySelector('.stage-box .canvas-control');
    if (!el) return null;
    const style = getComputedStyle(el);
    return { property: style.transitionProperty, duration: style.transitionDuration };
  },
  lamps: () => [...document.querySelectorAll('.arow')].filter((r) => r.querySelector('.lamp')).map((r) => textOf(r.querySelector('.nm'))),

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
  jsonBoxes: () => document.querySelectorAll('textarea').length,
};
