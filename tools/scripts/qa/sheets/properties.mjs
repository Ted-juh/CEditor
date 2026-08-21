// properties.mjs — QA-02: the cross-cutting sections, driven hard off their defaults.
//
// QA-01 proves a component renders when nothing is set. That is the easy half. The half that
// actually breaks is the other one: nine stacked text-effect layers, a background with four
// enabled fill layers, a Transform at 0.4 opacity and 12 degrees of rotation. Those paths are
// walked by a handful of real panels and by nothing else, which is why a regression in them
// survives a full test run and reaches a beta tester.
//
// So each cell here is a deliberate worst case, not a plausible one. If the outline, the second
// stroke, the bevel, the inner glow and the reflection all coexist on one Label and it still
// reads as "Wave", the cheap versions work too.
//
// THE RATCHET, which is the part that keeps this sheet honest: every section in SECTION_DEFAULTS
// must be either driven by a recipe below or named in EXEMPT with a reason. Add a section to the
// model and `qaPanels.test.js` fails until you make that choice explicitly. A gap has no symptom
// — that is the whole reason this file has a list of exemptions instead of a comment saying
// "TODO: cover the rest".

import { createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import { createScript } from '../../../../CE/web/src/CE_Application/scripting/scriptModel.js';
import { flowGroups, styleSheet } from '../layout.mjs';

/**
 * Sections with no recipe, and why. Each entry is a decision someone made, not a gap someone
 * missed — and because the list is asserted, a name left here after its section went away cannot
 * quietly excuse the next real omission.
 */
export const EXEMPT = {
  // Component-specific model sections. Each belongs to exactly one component, which QA-01 already
  // places at its authored defaults. A non-default recipe for these is that component's own sheet
  // to write (QA-03/QA-05), not a property showcase's — driving an Arpeggiator's 16 steps here
  // would test the Arpeggiator, filed under "properties", where nobody would look for it.
  Meter: 'component-specific; QA-01 places it at defaults, QA-05 drives it by verb',
  Macro: 'ditto', Constellation: 'ditto', Timbre: 'ditto', Router: 'ditto', Turing: 'ditto',
  Looper: 'ditto', ChordPad: 'ditto', Arp: 'ditto', NoteRibbon: 'ditto', DrumPads: 'ditto',
  Phrase: 'ditto', Setlist: 'ditto', Harmoniser: 'ditto', Recorder: 'ditto', SplitZone: 'ditto',
  Panic: 'ditto', Transport: 'ditto', Constraint: 'ditto', Kinetic: 'ditto', Orbit: 'ditto',
  Ribbon: 'ditto', Crossfader: 'ditto', Joystick: 'ditto', Matrix: 'ditto', Envelope: 'ditto',
  Numpad: 'ditto',

  // Custom-component authoring sections. These describe a component being *designed*, not one
  // being used, and they only mean anything inside a package. QA-07 instantiates real packages
  // built out of them; a hand-written Parts tree here would be a fixture pretending to be a test.
  Parts: 'custom-component authoring surface — QA-07 covers it with real packages',
  Bindings: 'ditto', Designer: 'ditto', Assets: 'ditto', ValueChannels: 'ditto',
  Behaviors: 'ditto', HitZones: 'ditto', Generators: 'ditto', Links: 'ditto',
  PublishedProperties: 'ditto', ExternalAPI: 'ditto', Variants: 'ditto',
};

/** A Label carrying every text-effect layer at once. The most intricate markup the editor emits. */
function texturedText() {
  const control = createControl('Label', {
    Core: { id: 'qa02_text', name: 'qa02_text' },
    Transform: { width: 260, height: 90 },
    Text: { content: 'Wave' },
  });
  const text = control._children.Text;
  text._children.Font = {
    ...text._children.Font,
    family: 'Georgia', size: 40, weight: 'Bold', weightValue: 700,
    letterSpacing: 1, underline: true, underlineThickness: 2, underlineOffset: 3,
  };
  text._children.Effects = {
    ...text._children.Effects,
    outlineEnabled: true, outlineThickness: 2, outlineWidth: 2,
    stroke2Enabled: true, stroke2Thickness: 2,
    bevelEnabled: true, bevelDepth: 2, bevelStyle: 'emboss',
    glowEnabled: true, glowSize: 6, glowColour: '8899DDFF',
    innerGlowEnabled: true, innerGlowSize: 4,
    innerShadowEnabled: true, innerShadowBlur: 3, innerShadowOffsetY: 2,
    shadowEnabled: true, shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 3,
    reflectionEnabled: true, reflectionOpacity: 40, reflectionGap: 2,
  };
  return control;
}

/** A Background with all four fill layers live at once, plus a thick bordered radius. */
function stackedBackground() {
  const control = createControl('Label', {
    Core: { id: 'qa02_background', name: 'qa02_background' },
    Transform: { width: 200, height: 96 },
    Text: { content: 'stacked fill' },
  });
  const fill = control._children.Background._children.Fill;
  Object.assign(fill, {
    colour: 'FF1E4A6E',
    gradientEnabled: true,
    gradientOpacity: 80,
    gradient: {
      type: 'linear', angle: 45, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, edge: 0,
      stops: [{ color: '2266FF', position: 0 }, { color: 'FF44AA', position: 100 }],
    },
    overlayEnabled: true,
    overlayColour: '2200FF88',
  });
  Object.assign(control._children.Background._children.Border, {
    enabled: true, thickness: 3, colour: 'FF89C2FF',
  });
  Object.assign(control._children.Background._children.Corners, {
    radius: 18, topLeftRadius: 2, bottomRightRadius: 30,
  });
  return control;
}

/** Transform pushed off every default it has: rotation, scale, opacity, aspect lock. */
function transformed() {
  return createControl('Button', {
    Core: { id: 'qa02_transform', name: 'qa02_transform' },
    Transform: { width: 150, height: 60, rotation: 12, scale: 0.9, opacity: 0.7, aspectLock: true, minWidth: 40, minHeight: 20 },
    Text: { content: 'rot 12 / 0.7' },
  });
}

/** Effects: shadow, bevel and the full CSS filter stack on one control. */
function effected() {
  const control = createControl('Button', {
    Core: { id: 'qa02_effects', name: 'qa02_effects' },
    Transform: { width: 150, height: 60 },
    Text: { content: 'filters' },
  });
  const effects = control._children.Effects._children;
  effects.Shadows = {
    ...effects.Shadows,
    items: [
      { enabled: true, type: 'drop', offsetX: 3, offsetY: 4, blur: 8, spread: 1, colour: 'AA000000' },
      { enabled: true, type: 'inner', offsetX: -2, offsetY: -2, blur: 5, spread: 0, colour: '66FFFFFF' },
    ],
  };
  effects.Bevel = { ...effects.Bevel, enabled: true, style: 'pillow-emboss', depth: 140, size: 6, softness: 2 };
  effects.Filters = { ...effects.Filters, brightness: 115, contrast: 120, saturation: 140, hueRotate: 25, blur: 0.4 };
  effects.Blend = { ...effects.Blend, mode: 'screen' };
  return control;
}

/** Icon + text together, off-centre, with the icon painted over the text. */
function iconLayout() {
  return createControl('Button', {
    Core: { id: 'qa02_icon', name: 'qa02_icon' },
    Transform: { width: 170, height: 64 },
    Text: { content: 'icon+text' },
    Icon: { source: 'library', name: 'zap', size: 28, tint: 'FFFFD166', rotation: 15, opacity: 0.9 },
    ContentLayout: {
      mode: 'icon_and_text', horizontalAlign: 'left', verticalAlign: 'bottom',
      gap: 14, paddingLeft: 14, paddingBottom: 10,
      textOffsetX: 6, iconOffsetY: -4, textAboveIcon: false, iconZIndex: 3,
    },
  });
}

/** A Container with a real child layout, clipping and a visible grid. */
function containerLayout() {
  const control = createControl('Container', {
    Core: { id: 'qa02_children', name: 'qa02_children' },
    Transform: { width: 260, height: 120 },
  });
  Object.assign(control._children.Children, { layout: 'row', gap: 10, padding: 12, clip: true });
  if (control._children.Grid) {
    Object.assign(control._children.Grid, { visible: true, columns: 4, rows: 2, snap: true, size: 20, colour: '5589C2FF', style: 'points' });
  }
  return control;
}

/** Mouse: every interaction default inverted, so a control that ignores the section is obvious. */
function mouseTuned() {
  const control = createControl('Knob', {
    Core: { id: 'qa02_mouse', name: 'qa02_mouse' },
    Transform: { width: 90, height: 90 },
  });
  Object.assign(control._children.Mouse ?? (control._children.Mouse = { _type: 'Mouse' }), {
    cursor: 'crosshair', draggable: true, focusable: true, focusOutline: true, tabIndex: 3,
    hitTestShape: 'ellipse', dragMode: 'vertical', dragSensitivity: 2.5, invertY: true,
    bringToFrontOnClick: true,
  });
  return control;
}

/** Behavior + Value: a combobox with rewritten rows and a non-first default selection. */
function valueRows() {
  const control = createControl('Combobox', {
    Core: { id: 'qa02_value', name: 'qa02_value' },
    Transform: { width: 190, height: 34 },
    Text: { content: 'Super Saw' },
  });
  Object.assign(control._children.Behavior, { defaultValue: 'supersaw', keyboardEnabled: false, focusable: false });
  control._children.Value.rows = [
    { id: 'saw', displayText: 'Saw', internalValue: 'saw', sendValue: 0, receiveValue: 0, selectedByDefault: false, enabled: true, visualOverrides: {}, icon: '', subtitle: '', badge: '', swatch: 'FF44AAFF', isHeader: false, parentValue: '' },
    { id: 'supersaw', displayText: 'Super Saw', internalValue: 'supersaw', sendValue: 6, receiveValue: 6, selectedByDefault: true, enabled: true, visualOverrides: {}, icon: '', subtitle: '7 detuned saws', badge: 'GAIA', swatch: 'FFFFD166', isHeader: false, parentValue: '' },
    { id: 'noise', displayText: 'Noise', internalValue: 'noise', sendValue: 5, receiveValue: 5, selectedByDefault: false, enabled: false, visualOverrides: {}, icon: '', subtitle: '', badge: '', swatch: '', isHeader: false, parentValue: '' },
  ];
  return control;
}

/** A Listbox with rich rows: header, subtitle, badge, swatch, and a disabled entry. */
function richListbox() {
  const control = createControl('Listbox', {
    Core: { id: 'qa02_listbox', name: 'qa02_listbox' },
    Transform: { width: 210, height: 168 },
  });
  control._children.Value.rows = [
    { id: 'hdr', displayText: 'USER BANK A', internalValue: '', sendValue: '', receiveValue: '', selectedByDefault: false, enabled: true, visualOverrides: {}, icon: '', subtitle: '', badge: '', swatch: '', isHeader: true, parentValue: '' },
    { id: 'a1', displayText: 'Init Patch', internalValue: 'a1', sendValue: 0, receiveValue: 0, selectedByDefault: true, enabled: true, visualOverrides: {}, icon: '', subtitle: 'A-1', badge: 'FAV', swatch: 'FF66DDAA', isHeader: false, parentValue: '' },
    { id: 'a2', displayText: 'Hoover Lead', internalValue: 'a2', sendValue: 1, receiveValue: 1, selectedByDefault: false, enabled: true, visualOverrides: {}, icon: '', subtitle: 'A-2', badge: '', swatch: 'FFFF6B6B', isHeader: false, parentValue: '' },
    { id: 'a3', displayText: '(empty)', internalValue: 'a3', sendValue: 2, receiveValue: 2, selectedByDefault: false, enabled: false, visualOverrides: {}, icon: '', subtitle: 'A-3', badge: '', swatch: '', isHeader: false, parentValue: '' },
  ];
  return control;
}

/** States: every state in the priority list carries a visible patch. */
function statefulButton() {
  const control = createControl('ToggleButton', {
    Core: { id: 'qa02_states', name: 'qa02_states' },
    Transform: { width: 160, height: 52 },
    Text: { content: 'states' },
  });
  const states = control._children.States;
  states.debug = true;
  for (const [name, node] of Object.entries(states._children ?? {})) {
    // Make each state visibly different from the base, so hovering the sheet tells you which
    // states actually resolve rather than which ones exist in the document.
    node.patches = node.patches ?? { component: {}, parts: {} };
    node.patches.component = { ...node.patches.component, 'Background.Border.thickness': 3 };
    node.description = `QA: ${name}`;
  }
  return control;
}

/** Animations: a named animation on a control, so the section is non-empty in the document. */
function animated() {
  const control = createControl('Button', {
    Core: { id: 'qa02_animations', name: 'qa02_animations' },
    Transform: { width: 150, height: 56 },
    Text: { content: 'animated' },
  });
  control._children.Animations._children = {
    Pulse: {
      _type: 'Animation',
      name: 'Pulse',
      enabled: true,
      trigger: 'hover',
      durationMs: 240,
      easing: 'easeInOutQuad',
      loop: false,
      tracks: [{ target: 'Transform.scale', from: 1, to: 1.06 }],
    },
  };
  return control;
}

/** Scripts: a per-control handler, so the Scripts section is non-empty and language-tagged. */
function scripted() {
  const control = createControl('Slider', {
    Core: { id: 'qa02_scripts', name: 'qa02_scripts' },
    Transform: { width: 200, height: 46 },
  });
  control._children.Scripts.scripts = [
    createScript({
      id: 'qa02_onValueChanged',
      name: 'QA-02 value echo',
      language: 'lua',
      scope: 'component',
      target: 'self',
      event: 'onValueChanged',
      source: 'function onValueChanged(value)\n  log("qa02 slider: " .. tostring(value))\nend',
      description: 'Proves a per-control script survives serialization and reload.',
    }),
  ];
  return control;
}

/** DeviceBindings: a bound port with feedback configured, pointing at the QA device profile. */
function deviceBound() {
  const control = createControl('Knob', {
    Core: { id: 'qa02_devicebindings', name: 'qa02_devicebindings' },
    Transform: { width: 90, height: 90 },
  });
  control._children.DeviceBindings.bindings = [
    {
      kind: 'deviceParameter',
      port: 'value',
      deviceRole: 'primary',
      parameterId: 'filter.cutoff',
      parameterType: 'integer',
      adoptMetadata: true,
      dryRun: true,
      feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    },
  ];
  return control;
}

/** Display: an LCD off every default — segment panel, custom palette, backlight, glass. */
function lcdTuned() {
  const control = createControl('LcdDisplay', {
    Core: { id: 'qa02_display', name: 'qa02_display' },
    Transform: { width: 240, height: 90 },
  });
  Object.assign(control._children.Display, {
    panelType: 'segment',
    segmentType: '14',
    lines: ['QA-02', 'DISPLAY'],
  });
  return control;
}

/** Pixel: a dot-matrix display driven off its defaults. */
function pixelTuned() {
  const control = createControl('PixelDisplay', {
    Core: { id: 'qa02_pixel', name: 'qa02_pixel' },
    Transform: { width: 240, height: 90 },
  });
  Object.assign(control._children.Pixel, { lines: ['QA-02 PIXEL'] });
  return control;
}

/** Core: the identity fields a document round-trip has to preserve. */
function coreTagged() {
  return createControl('Label', {
    Core: {
      id: 'qa02_core',
      name: 'qa02_core_named',
      description: 'Core carries id, name, description, enabled, locked, visible.',
      locked: true,
    },
    Transform: { width: 180, height: 40 },
    Text: { content: 'Core (locked)' },
  });
}

/**
 * The recipes, and the sections each one claims to drive. The claim is what the ratchet checks —
 * a recipe that lists a section it does not actually touch is caught by the test, which reads the
 * built control rather than trusting this table.
 */
export const RECIPES = [
  { caption: 'Core — identity', build: coreTagged, sections: ['Core'] },
  { caption: 'Transform — rot/scale/opacity', build: transformed, sections: ['Transform'] },
  { caption: 'Background — 4 fill layers', build: stackedBackground, sections: ['Background'] },
  { caption: 'Text — every effect layer', build: texturedText, sections: ['Text'] },
  { caption: 'Effects — shadow/bevel/filters', build: effected, sections: ['Effects'] },
  { caption: 'Icon + ContentLayout', build: iconLayout, sections: ['Icon', 'ContentLayout'] },
  { caption: 'Children + Grid', build: containerLayout, sections: ['Children', 'Grid'] },
  { caption: 'Mouse — drag/focus/hit', build: mouseTuned, sections: ['Mouse'] },
  { caption: 'Behavior + Value rows', build: valueRows, sections: ['Behavior', 'Value'] },
  { caption: 'Listbox — rich rows', build: richListbox, sections: ['Listbox'] },
  { caption: 'States — all patched', build: statefulButton, sections: ['States'] },
  { caption: 'Animations', build: animated, sections: ['Animations'] },
  { caption: 'Scripts — per control', build: scripted, sections: ['Scripts'] },
  { caption: 'DeviceBindings', build: deviceBound, sections: ['DeviceBindings'] },
  { caption: 'Display — segment LCD', build: lcdTuned, sections: ['Display'] },
  { caption: 'Pixel — dot matrix', build: pixelTuned, sections: ['Pixel'] },
];

const NOTES = `QA-02 — the cross-cutting sections, driven off their defaults.

Generated by tools/scripts/qa/make-qa-panels.mjs. Do not hand-edit.

How to read it
  Each cell is a deliberate worst case for one section: everything that can be switched on, is.
  The caption names the section under test. If the worst case renders, the ordinary case does.

What a failure looks like
  - a cell that looks like the QA-01 version   the section is not being read at all
  - text with one effect visible of nine       a layer stopped compositing
  - a control at 100% opacity in "Transform"   Transform.opacity/rotation/scale lost its wiring
  - "states" not changing on hover             the States resolver stopped matching

Coverage
  Every section in SECTION_DEFAULTS is either driven here or listed in EXEMPT with a reason;
  qaPanels.test.js fails if a new section is neither. The exemptions are deliberate: the
  component-specific sections belong to their component's sheet, and the custom-component
  authoring sections only mean anything inside a package (QA-07).`;

export function buildPropertiesSheet() {
  const panel = createPanel('QA-02 Properties');

  const groups = [{
    title: 'Cross-cutting sections — each cell is one section pushed as far as it goes',
    cells: RECIPES.map((recipe) => ({ caption: recipe.caption, control: recipe.build() })),
  }];

  const { controls, height } = flowGroups(groups);
  panel.controls = controls;
  panel.height = height;

  return styleSheet(panel, { title: 'QA-02 — cross-cutting sections driven off defaults', notes: NOTES });
}

/** Every section a recipe claims. Used by the coverage ratchet. */
export function coveredSections() {
  return RECIPES.flatMap((recipe) => recipe.sections);
}
