// formAsParts.js — a control form (models/controlAnatomy.js) drawn with the control's own parts:
// the recipe for each form (models/knobFormParts.js, buttonFormParts.js, meterFormParts.js) and the
// patch that writes it on a control, as Core › Control design › Convert to Parts does
// (stores/controlSets.js applyFormAsParts), and as Create Component from Selection does on a copy
// before it makes the control into layers.

import { createControl } from './componentTypes.js';
import { readControlPath, withSetPins } from './controlSetFamilies.js';
import { resolveColourLiteral } from './controlSets.js';
import { KNOB_FORMS_AS_PARTS, knobFormFamily } from './knobFormParts.js';
import { buttonFormFamily } from './buttonFormParts.js';
import { BUTTON_DEVICE_PARTS, BUTTON_DEVICE_TYPES } from './buttonDeviceParts.js';
import { METER_DEVICE_PARTS, METER_DEVICE_TYPES } from './meterDeviceParts.js';
import { meterFormFamily } from './meterFormParts.js';
import { anatomyForm, isIllustratedForm } from './controlAnatomy.js';
import { setNestedValue } from '../stores/controlTreeUtils.js';
import { deepClone } from '../utils/deepClone.js';

/**
 * The patch that draws `form` on `control` with its own parts, or null when the form has none (an
 * illustrated one): the form's name cleared, its parts written, the parts it does not use turned
 * off, and what a form shapes and moves back to the factory's unless this form says.
 */
export function formAsPartsPatch(control, form, set = null, { own = false } = {}) {
  const recipe = own
    ? inOwnColours(formAsPartsRecipe(control?._children?.Core?.controlType, form, set, ownColours(control, set)), ownColours(control, set))
    : formAsPartsRecipe(control?._children?.Core?.controlType, form, set);
  if (!recipe) return null;
  const type = String(control._children.Core.controlType);
  const patch = { 'Core.controlForm': '', ...recipe.component };
  const deviceParts = BUTTON_DEVICE_TYPES.has(type) ? BUTTON_DEVICE_PARTS : METER_DEVICE_TYPES.has(type) ? METER_DEVICE_PARTS : [];
  for (const name of deviceParts) if (!recipe.parts[name]) patch[`Parts.${name}.visible`] = false;
  // A knob's plates and scale that only the synth sets' knobs draw (models/directionKnobParts.js):
  // off again under a form that does not.
  if (type === 'Knob') {
    for (const name of ['bodySkirt', 'bodyInsert']) if (!recipe.parts[name]) patch[`Parts.${name}.visible`] = false;
    for (const [path, value] of [['Behavior.tickRadius', 0], ['Behavior.scaleNumberCount', 0], ['Behavior.secondScaleRadius', 0], ['Behavior.secondScaleCount', 0]]) {
      if (!(path in recipe.component)) patch[path] = value;
    }
  }
  // What a form shapes and moves, back to the factory's unless this form says: a switch made a
  // lever and then a slide must not still swing, a knob made scalloped and then a disc must not
  // keep its scallop.
  const factory = createControl(type);
  for (const [part, values] of Object.entries(recipe.parts)) {
    for (const key of FORM_PART_KEYS) {
      if (!(key in values)) patch[`Parts.${part}.${key}`] = readControlPath(factory, `Parts.${part}.${key}`);
    }
    for (const [path, value] of Object.entries(values)) patch[`Parts.${part}.${path}`] = value;
  }
  return patch;
}

/**
 * `control` drawn in its form's parts instead of by the form's name, the values pinned against the
 * set as Convert to Parts pins them; the control as it is when it names no form, or one that is not
 * parts. A copy: the control is not changed.
 *
 * In the form's own colours, unlike Convert to Parts. The form on the panel is drawn in the five
 * colours on Core (Face, Housing, Ink, Legends, Indicator: editor/ControlAnatomy.svelte), which a
 * set fills with its roles when it makes the control and an author may since have changed; Convert
 * to Parts hands the control back to the set and so writes the roles. A copy made to look like the
 * control has to take what the control shows.
 */
export function withFormAsParts(control, set = null) {
  const type = String(control?._children?.Core?.controlType ?? '');
  const form = anatomyForm(type, control?._children?.Core?.controlForm);
  if (!form || isIllustratedForm(form)) return control;
  const patch = formAsPartsPatch(control, form, set, { own: true });
  if (!patch) return control;
  const next = deepClone(control);
  const pinned = withSetPins(next, patch);
  for (const [path, value] of Object.entries(pinned)) setNestedValue(next, path, deepClone(value));
  return next;
}

// The part properties a form decides beyond the ones every recipe writes: its outline or shape,
// its pattern, its motion, its finish.
export const FORM_PART_KEYS = [
  'outline', 'outlineCount', 'outlineDepth', 'outlineRotation', 'turns',
  'shape', 'shapeDepth', 'shapePath', 'shapePathOn', 'pattern', 'patternCount', 'patternRows', 'travelX', 'travelY', 'swing', 'pivotX', 'pivotY',
  'follows', 'activeColour', 'activeOpacity', 'offText', 'onText', 'fontSize', 'opacity', 'Layout.rotation',
  'Background.Effects.Material.enabled',
  // A knob plate's shadow, perspective and grooves, a bar pointer's taper and second bar
  // (models/directionKnobParts.js).
  'shadowOffset', 'shadowBlur', 'shadowColour', 'taper', 'aspect', 'shiftY',
  'grooves', 'grooveLength', 'grooveWidth', 'grooveColour', 'markFrom', 'markTo', 'markWidth', 'markColour',
  // A plate's rendered look (utils/renderedLook.js): off again under a form that does not render.
  'look', 'renderProfile', 'renderCount', 'renderDepth', 'renderTaper', 'renderHeight', 'renderTop', 'renderMaterial', 'renderTopMaterial', 'renderTopColour', 'renderCorner',
  // A meter's (models/meterDeviceParts.js).
  'motion', 'fillFrom', 'lightFrom', 'source', 'cellWidth', 'cellHeight', 'zoneFrom', 'zoneColours', 'clipFrom', 'textSource', 'legendText', 'fontFamily',
  'majorCount', 'minorCount', 'majorLength', 'minorLength', 'majorWidth', 'minorWidth', 'numerals', 'numeralSize', 'numeralPlacement', 'numeralUnits',
];

/** The recipe that draws `form` on a control of `type` with its own parts, or null. `set`, where
 * known, gives a meter's sheen and a synth knob's glass their face colour. `colours`, when given,
 * are the form's own (ownColours): its ink, face, housing and divisions in place of the set's. */
export function formAsPartsRecipe(type, form, set = null, colours = null) {
  // A synth set's tinted glass is its face and track colours with an alpha: literals, from the set.
  const face = colours?.face ?? (set ? resolveColourLiteral('{surface}', set, '') : '');
  const housing = colours?.housing ?? (set ? resolveColourLiteral('{control.track}', set, '') : '');
  const ink = colours?.ink ?? '{text.primary}';
  const divisions = colours?.divisions ?? 12;
  if (type === 'Knob') {
    return KNOB_FORMS_AS_PARTS.includes(String(form ?? '')) ? knobFormFamily(form, { ink, divisions, ...(face ? { face } : {}), ...(housing ? { housing } : {}) }) : null;
  }
  if (type === 'Meter' || type === 'ProgressBar') {
    return meterFormFamily(type, form, { ink, divisions, face, housing });
  }
  return buttonFormFamily(type, form, { ink, face, housing, ...(colours?.depth != null ? { depth: colours.depth } : {}) });
}

// The roles the recipes write (the same four in each recipe module), and the Core field and
// factory colour each stands for on a form drawn in its own colours.
const ROLE_FIELDS = [
  ['{surface}', 'face', 'formFaceColour', 'FFDEDBD2'],
  ['{control.track}', 'housing', 'formHousingColour', 'FF171A20'],
  ['{text.primary}', 'legend', 'formLabelColour', null],
  ['{accent}', 'accent', 'formAccentColour', 'FF40BCCC'],
];

/**
 * The colours a form is drawn in on the panel, as literals: Core's five, each read through the set
 * when it names a role, the factory's where it names nothing. Legends fall back to the ink, as the
 * drawing's do.
 */
export function ownColours(control, set = null) {
  const core = control?._children?.Core ?? {};
  const literal = (value, fallback) => {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    return resolveColourLiteral(text, set ?? undefined, fallback);
  };
  const ink = literal(core.formInkColour, 'FF20282C');
  const out = {
    ink,
    divisions: Math.max(4, Math.min(48, Math.round(Number(core.formDivisions)) || 12)),
    // The form's Depth, how strong its shading and how deep its press.
    depth: Math.max(0, Math.min(100, Number.isFinite(Number(core.formDepth)) ? Number(core.formDepth) : 60)),
  };
  for (const [, key, field, fallback] of ROLE_FIELDS) out[key] = literal(core[field], fallback ?? ink);
  return out;
}

/** `recipe` with every role it writes replaced by the colour it stands for in `colours`. */
function inOwnColours(recipe, colours) {
  if (!recipe) return recipe;
  const byRole = new Map(ROLE_FIELDS.map(([role, key]) => [role, colours[key]]));
  const swap = (node) => {
    if (typeof node === 'string') return byRole.has(node.trim()) ? byRole.get(node.trim()) : node;
    if (Array.isArray(node)) return node.map(swap);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, swap(value)]));
    return node;
  };
  return swap(recipe);
}

// The base forms whose parts draw them otherwise than the form's own drawing (editor/ControlAnatomy.svelte),
// by the control kind whose forms they are, refused by name with Convert to Parts suggested first.
// None now: measured with browser-checks/knobLayers.mjs, a control in each form against its layers
// on Graphite, the last five (the cushion and hexagonal keys; the rocker, latch and strap switches)
// had shapes their parts only approximated and keys their drawings redraw when on, and are drawn
// outlines now (utils/deviceShapes.js `path`, `shapePathOn`). Kept for a form that may need it. The
// knobs' forms are not here: they come in as their drawings (utils/formDrawingLayers.js).
const PARTS_DIFFER = {
  Button: new Set(),
  ToggleButton: new Set(),
  Meter: new Set(),
  Knob: new Set(),
};

/** The kind of control whose forms `type` takes (anatomyOptions): a momentary button a button's. */
function formFamily(type) {
  if (['Button', 'MomentaryButton', 'TimedButton', 'OneShotButton'].includes(type)) return 'Button';
  if (type === 'ProgressBar') return 'Meter';
  return type;
}

// The synth sets' forms (`new-<set id>`, drawn by PhysicalAnatomy and the two series after it) whose
// parts draw them as their drawings do, by kind and set id; measured as above (2026-11-04, on Graphite
// in the form's own colours: the sets' default ones). Any other synth form's
// parts differ: the devices leave out a line or a lit border here and there, or draw a well or a
// scale another way (models/directionDeviceParts.js). The knobs come in as their drawings
// (utils/synthKnobDrawings.js), so none is listed.
const SYNTH_PARTS_MATCH = {
  // Unpressed (a button holds its value only while pressed): 19 of 36, at most 1.7 % of pixels apart.
  Button: new Set(['brassworks', 'bakelite', 'hi-fi', 'porcelain', 'flightdeck', 'stompbox', 'switchboard', 'chronograph',
    'cassette-deck', 'diesel', 'gemstone', 'leatherbound', 'heritage', 'compact-rack', 'valve-console', 'deep-flute',
    'concave-studio', 'coin-edge', 'castellated']),
  // Off and on: 16 of 36, at most 2 %.
  ToggleButton: new Set(['hi-fi', 'porcelain', 'stompbox', 'switchboard', 'chronograph', 'cassette-deck', 'diesel', 'gemstone',
    'leatherbound', 'heritage', 'compact-rack', 'valve-console', 'deep-flute', 'concave-studio', 'coin-edge', 'castellated']),
  // At four readings: 22 of 36, at most 1.9 %.
  Meter: new Set(['bakelite', 'porcelain', 'flightdeck', 'stompbox', 'switchboard', 'chronograph', 'cassette-deck', 'diesel',
    'gemstone', 'leatherbound', 'valve-console', 'chicken-head', 'turret-stack', 'deep-flute', 'concave-studio', 'hex-drive',
    'coin-edge', 'gimbal-ring', 'lever-dial', 'castellated', 'floating-halo', 'prism-cap']),
  // Their parts, 6 to 16 % apart; drawn instead.
  Knob: new Set(),
};

/** Whether `form`'s parts draw a control of `type` otherwise than the form's drawing does. */
export function formPartsDiffer(type, form) {
  const family = formFamily(String(type ?? ''));
  const name = String(form ?? '');
  if (PARTS_DIFFER[family]?.has(name)) return true;
  return name.startsWith('new-') && !isIllustratedForm(name) && SYNTH_PARTS_MATCH[family]?.has(name.slice(4)) !== true;
}

/**
 * Why a control of `type` drawn in `form` cannot come in as layers that look as it does, in the
 * window's words: an illustration, which has no parts, or a form whose parts draw it otherwise.
 */
export function formLayersRefusal(type, form) {
  if (isIllustratedForm(form)) return `drawn in the "${form}" control form, a whole illustration with no parts`;
  if (formPartsDiffer(type, form)) return `drawn in the "${form}" control form, which its parts do not draw exactly; Core › Control design › Convert to Parts first`;
  return `drawn in the "${form}" control form, which is not made of parts`;
}
