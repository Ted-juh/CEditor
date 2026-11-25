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
import { debugDockState } from '../src/CE_Application/stores/debugDock.js';
import { displayTabRequest } from '../src/CE_Application/stores/displayTab.js';
import { keyframeOverlays } from '../src/CE_Application/stores/keyframeOverlays.js';
import { updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { animationPresetLibrary } from '../src/CE_Application/stores/animationPresetLibrary.js';
import { editorTarget, activateEditorTarget } from '../src/CE_Application/stores/editorTarget.js';

const CONTROL_ID = 'ctrl_anim';

const control = createControl('CustomComponent');
control._children.Core.id = CONTROL_ID;
control._children.Core.name = 'Big Knob';
control._children.Parts = createCustomComponentPartsDefaults();
control._children.ValueChannels = { _type: 'ValueChannels', _children: {
  mainValue: { _type: 'ValueChannel', name: 'mainValue', label: 'Knob Value', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.5, currentValue: 0.5 },
} };

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

// A knob beside it, for the Value kind (step 6), which only a control that draws a value is offered.
const knob = createControl('Knob');
knob._children.Core.id = 'ctrl_knob';
knob._children.Core.name = 'Cutoff';
knob._children.Transform.x = 600;

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [control, knob] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([CONTROL_ID]));

mount(AnimationTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const live = () => get(panels)[0].controls[0];
const animation = (name) => live()._children.Animations._children[name];

window.__anim = {
  kindLabels: () => [...document.querySelectorAll('[aria-label="Kind"] button')].map(textOf),
  // The tab follows its own target, not the selection (stores/editorTarget.js): open it on the knob.
  selectKnob: () => { selectedComponentIds.set(new Set(['ctrl_knob'])); activateEditorTarget('animation', 'ctrl_knob'); },
  addAnimationNamed: (name) => {
    const input = document.querySelector('input[aria-label="New animation name"]');
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  },
  knobAnimation: (name) => JSON.parse(JSON.stringify(get(panels)[0].controls.find((c) => c._children.Core.id === 'ctrl_knob')._children.Animations?._children?.[name] ?? null)),
  valueFrameRows: () => document.querySelectorAll('[data-value-animation] [data-value-frame]').length,
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

  // A row reads as a path (Body › Cap, Scale); the stored path it stands for is its data-path.
  targetPaths: () => [...document.querySelectorAll('.trow .what')].map((what) => what.dataset.path),
  // The verdict without the "solid only" note a colour target carries beside it.
  targetVerdicts: () => [...document.querySelectorAll('.trow .does')].map((d) => textOf(d).replace(/\s*solid only$/, '')),
  targetNotes: () => [...document.querySelectorAll('.trow .does .note')].map((n) => n.getAttribute('title')),
  deadRows: () => [...document.querySelectorAll('.trow.bad .what')].map((what) => what.dataset.path),
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
  pickKind: (kind) => { [...document.querySelectorAll('[aria-label="Kind"] button')].find((b) => new RegExp(`^${kind}$`, 'i').test(b.textContent.trim()))?.click(); },
  // The add row's path bar (components/animation/PathBar.svelte), which replaced the "On" and
  // "Change" lists on 2026-11-24: a Where step (the control itself, Background, Text, Channels, a
  // part by its name), a Part step for a knob's role groups only, and the property.
  changeOptions: () => [...document.querySelectorAll('.addbox [data-step="property"] option')].map((o) => o.textContent.trim()),
  placeOptions: () => [...document.querySelectorAll('.addbox [data-step="place"] option')].map((o) => o.textContent.trim()),
  partStepShown: () => !!document.querySelector('.addbox [data-step="part"] select'),
  pathBarText: () => [...document.querySelectorAll('.addbox .pathbar .steps select')].map((s) => s.selectedOptions[0]?.textContent.trim() ?? ''),
  storedTargetPaths: (name) => animation(name).targets.map((t) => t.path),
  storedKeyframes: (name) => animation(name).targets.map((t) => (t.keyframes ?? []).map((k) => [k.time, k.value])),
  storedLoopHold: (name) => ({ loop: animation(name).loop, hold: animation(name).hold, duration: animation(name).duration }),
  trackTimelines: () => document.querySelectorAll('.seqtl').length,
  trackLabels: () => [...document.querySelectorAll('.seqtl .tl-track .lbl')].map(textOf),
  playheadText: () => textOf(document.querySelector('.transport .time')),
  addKeyframe: () => { [...document.querySelectorAll('.transport .mk')].find((b) => /Keyframe at/.test(b.textContent))?.click(); },
  selectTrack: (index) => { document.querySelectorAll('.seqtl .tl-track .tl-name')[index]?.click(); },
  keyframeBox: () => !!document.querySelector('.kfbox'),
  selectedKeyframeText: () => textOf(document.querySelector('.transport .kfat')),
  keyframeTimeCell: () => document.querySelector('.kfbox input')?.value ?? '',
  /** The ruler (the playhead's strip), and one track's lane (its keyframes' strip). Same x and width. */
  axisRect: () => {
    const r = document.querySelector('.seqtl .tl-ruler')?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  },
  laneRect: (index) => {
    const r = document.querySelectorAll('.seqtl .tl-lane')[index]?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  },
  /** The track list: whether it is taller than its box, and whether the ruler stays at the top when it is scrolled. */
  trackScroll: () => {
    const box = document.querySelector('.seqtl .tl-scroll');
    const ruler = document.querySelector('.seqtl .tl-ruler');
    if (!box || !ruler) return null;
    const listScrolls = box.scrollHeight > box.clientHeight + 1;
    box.scrollTop = box.scrollHeight;
    const rulerPinned = Math.abs(ruler.getBoundingClientRect().top - box.getBoundingClientRect().top) < 2;
    box.scrollTop = 0;
    return { tracks: document.querySelectorAll('.seqtl .tl-track').length, listScrolls, rulerPinned };
  },
  /** Whether anything in the tab scrolls the tab itself, rather than a list inside it. */
  tabScrolls: () => {
    const tab = document.querySelector('.anim-tab');
    return { tab: tab.scrollHeight > tab.clientHeight + 1, page: document.documentElement.scrollHeight > window.innerHeight + 1 };
  },
  smallestText: () => {
    let smallest = 99;
    for (const el of document.querySelectorAll('.anim-tab *')) {
      if (el.closest('.stage')) continue;
      if (![...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) continue;
      smallest = Math.min(smallest, parseFloat(getComputedStyle(el).fontSize));
    }
    return smallest;
  },
  /** The fourth column: Details or Preview. */
  showSide: (label) => { [...document.querySelectorAll('.segmented[aria-label="Side panel"] button')].find((b) => textOf(b) === label)?.click(); },
  /** The row that asks what to add is closed until Add is pressed, and then stays open. */
  openAdd: () => { if (!document.querySelector('.addbox')) document.querySelector('.addtoggle')?.click(); },
  addOpen: () => !!document.querySelector('.addbox'),
  deleteKeyframe: () => { document.querySelector('.kfbox .danger')?.click(); },
  overlay: () => get(keyframeOverlays)[CONTROL_ID] ?? null,
  play: () => { document.querySelector('.transport .mk[aria-label="Play"]')?.click(); },
  stop: () => { document.querySelector('.transport .mk[aria-label="Stop"]')?.click(); },
  storedKind: (name) => animation(name).kind,
  pickEasing: (name) => {
    const button = [...document.querySelectorAll('.easing')].find((b) => textOf(b.querySelector('span')) === name);
    button?.click();
    return !!button;
  },
  activeEasing: () => textOf(document.querySelector('.easing.on span')),
  storedAnimation: (name) => JSON.parse(JSON.stringify(animation(name))),
  bezierEditor: () => !!document.querySelector('.bezier svg'),
  springCells: () => [...document.querySelectorAll('.curvebox .r .lab')].map(textOf).filter((t) => t === 'Damping' || t === 'Bounce'),
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
  /** Choose where a change lands: a Where entry, or a part within a role group. */
  choosePart: (label) => {
    for (const step of ['place', 'part']) {
      const select = document.querySelector(`.addbox [data-step="${step}"] select`);
      const option = [...(select?.options ?? [])].find((o) => o.textContent.trim() === label);
      if (!select || !option) continue;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  },
  addDisabledNow: () => document.querySelector('.addbtn')?.disabled === true,
  chooseChange: (label) => {
    const select = document.querySelector('.addbox [data-step="property"] select');
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

  // --- animation presets (step 4) ------------------------------------------------------------
  presetPanel: () => document.querySelector('[data-preset-library]')?.dataset.presetLibrary ?? null,
  openSavePreset: () => document.querySelector('[data-save-preset]')?.click(),
  typeSaveName: (value) => {
    const input = document.querySelector('[aria-label="Preset name"]');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  },
  saveNeeds: () => textOf(document.querySelector('[data-needs]')),
  clickSave: () => document.querySelector('.lib .go')?.click(),
  linkCard: () => {
    const card = document.querySelector('[data-preset-link]');
    return card ? { text: textOf(card.querySelector('.what')), overrides: [...card.querySelectorAll('[data-override]')].map((row) => row.dataset.override) } : null;
  },
  editByHand: (name, key, value) => updateControlProperty(CONTROL_ID, `Animations.${name}.${key}`, value),
  revertOverride: (key) => document.querySelector(`[data-override="${key}"] .rv`)?.click(),
  openLibrary: () => document.querySelector('[data-library]')?.click(),
  libraryRows: () => ({
    mine: [...document.querySelectorAll('[data-preset] .nm')].map(textOf),
    panel: [...document.querySelectorAll('[data-panel-preset] .nm')].map(textOf),
  }),
  libraryButton: (id, label) => [...(document.querySelector(`[data-preset="${id}"], [data-panel-preset="${id}"]`)?.querySelectorAll('button') ?? [])]
    .find((button) => textOf(button) === label)?.click(),
  importClick: () => document.querySelector('.lib .imp')?.click(),
  adoptNotice: () => textOf(document.querySelector('[data-adopt]')),
  clickAdopt: () => document.querySelector('[data-adopt] button')?.click(),
  panelPresets: () => JSON.parse(JSON.stringify(get(panels)[0].animationPresets ?? [])),
  libraryPresets: () => JSON.parse(JSON.stringify(get(animationPresetLibrary))),
  addLoops: (n) => {
    for (let i = 0; i < n; i += 1) {
      updateControlProperty(CONTROL_ID, `Animations.loop${i}`, { _type: 'Animation', name: `loop${i}`, enabled: true, kind: 'keyframes',
        trigger: { type: 'always' }, duration: 900, delay: 0, easing: 'linear', targets: [{ path: 'Transform' }], frames: [{ at: 0, opacity: 1 }, { at: 1, opacity: 0.9 }] });
    }
  },
  dropLoops: () => panels.update((list) => list.map((panel) => ({ ...panel, controls: panel.controls.map((c) => {
    if (c._children.Core.id !== CONTROL_ID) return c;
    const kept = Object.fromEntries(Object.entries(c._children.Animations._children).filter(([key]) => !key.startsWith('loop')));
    return { ...c, _children: { ...c._children, Animations: { ...c._children.Animations, _children: kept } } };
  }) }))),
  loopAlarm: () => textOf(document.querySelector('[data-loop-alarm]')),
  clickLoopAlarm: () => document.querySelector('[data-loop-alarm]')?.click(),
  target: () => JSON.parse(JSON.stringify(get(editorTarget) ?? null)),
  carryPreset: (preset) => panels.update((list) => list.map((panel) => ({ ...panel, animationPresets: [...(panel.animationPresets ?? []), preset] }))),
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

  // --- keyframes ----------------------------------------------------------------------
  chooseSelect: (ariaLabel, value) => {
    const select = document.querySelector(`select[aria-label="${ariaLabel}"]`);
    if (!select) return false;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  frameRows: () => document.querySelectorAll('.frames .frow').length,
  frameMarks: () => [...document.querySelectorAll('.frames .mark')].map((m) => m.style.left),
  addFrame: () => { document.querySelector('.frames .addframe')?.click(); },
  targetListShown: () => !!document.querySelector('.targets'),
  /** The animation running on a part of the control on the stage, as the browser computed it. */
  stagePartAnimation: (part) => {
    const el = document.querySelector(`.stage-box .interactive-part[data-part-name="${part}"]`);
    return el ? getComputedStyle(el).animationName : null;
  },
  firstPart: () => first,

  // --- presets and costs --------------------------------------------------------------
  costTags: () => [...document.querySelectorAll('.trow .cost')].map(textOf),
  presetLabels: () => [...document.querySelectorAll('.presets .preset')].map(textOf),
  presetHint: (label) => [...document.querySelectorAll('.presets .preset')].find((b) => textOf(b) === label)?.getAttribute('title') ?? '',
  addPreset: (label) => {
    const btn = [...document.querySelectorAll('.presets .preset')].find((b) => textOf(b) === label);
    btn?.click();
    return !!btn;
  },
  presetReport: () => textOf(document.querySelector('.strip .report')),
  /** Give the knob a Label that shows its name, attached to it, as the editor's Add label does. */
  addNameLabel: () => {
    const label = createControl('Label');
    label._children.Core.id = 'ctrl_name';
    label._children.Core.name = 'Knob Name';
    label._children.Core.attachedTo = CONTROL_ID;
    label._children.Text.shows = 'name';
    panels.update((list) => list.map((panel) => (panel.id === 'p1' ? { ...panel, controls: [...panel.controls, label] } : panel)));
  },
  storedLabel: () => {
    const label = get(panels)[0].controls.find((entry) => entry._children?.Core?.id === 'ctrl_name');
    return label ? JSON.parse(JSON.stringify({ shows: label._children.Text.shows, animations: label._children.Animations ?? null })) : null;
  },
  storedState: (key) => JSON.parse(JSON.stringify(live()._children.States._children[key] ?? null)),

  clickDebug: () => document.querySelector('.dbg')?.click(),
  debugDock: () => get(debugDockState),
  tabRequest: () => get(displayTabRequest),
  undo: () => undo(),
  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
  jsonBoxes: () => document.querySelectorAll('textarea').length,
};
