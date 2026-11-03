// setFromControl.js — a control's look given to its set (docs/design/changeable-control-sets.md,
// piece C): style one knob on the panel, then make that look the set's Knobs, as Unity applies a
// prefab instance's overrides and Figma pushes changes to the main component.
//
// The overrides are what the inspector marks (models/controlSetOwnership.js setOwnership): the
// looks a control holds that its set does not give it. Applying them writes each into the set's
// family for the control's type, as the control holds it: a colour role stays a role (it follows
// the set's colours), a colour picked stays that colour. The family is then the author's own design
// (chosenFamilies), so no derived design writes over it. The control hands the applied looks back
// to the set (resetToSetPatch) and follows it again.
//
// Pure: the store (stores/setFromControl.js) writes the set and the panel.

import { readControlPath } from './controlSetFamilies.js';
import { setOwnership, colourRoleName } from './controlSetOwnership.js';
import { isTokenReference } from './controlSets.js';
import { deepClone } from '../utils/deepClone.js';

// The parts by the names the inspector's tabs give them.
const PART_LABELS = {
  bodyHousing: 'Housing', bodySkirt: 'Skirt', bodyCap: 'Cap', bodyInsert: 'Insert', bodyTrackBase: 'Track', bodyTrackFill: 'Value Arc', bodySelectedRange: 'Range',
  tickMajor: 'Ticks', tickMinor: 'Minor Ticks', tickNumber: 'Scale Numbers',
  pointerCurrent: 'Pointer', pointerStart: 'Start Handle', pointerEnd: 'End Handle', labelValue: 'Readout', labelTitle: 'Title',
  housing: 'Housing', guard: 'Guard', key: 'Key', symbol: 'Symbol', indicator: 'Indicator', legend: 'Legend',
  face: 'Face', track: 'Track', scale: 'Scale', marker: 'Marker', cover: 'Cover', lamp: 'Clip Lamp',
};

// A property by the name its field has, where the path alone would not say it.
const PROPERTY_LABELS = {
  'Background.Fill.colour': 'Fill', 'Background.Fill.gradientEnabled': 'Gradient', 'Background.Fill.gradient': 'Gradient Stops',
  'Background.Fill.gradientOpacity': 'Gradient Opacity', 'Background.Border.enabled': 'Border', 'Background.Border.colour': 'Border Colour',
  'Background.Border.thickness': 'Border Width', 'Background.Corners.radius': 'Corner', 'Background.Corners.style': 'Corner Style',
  'Background.Effects.Material.enabled': 'Finish', 'Background.Effects.Material.kind': 'Finish', 'Effects.Shadows.items': 'Shadows',
  'Text.Fill.colour': 'Text Colour', 'Text.Font.family': 'Typeface', 'Text.Font.weight': 'Weight', 'Text.Font.weightValue': 'Weight',
  'Text.Font.letterSpacing': 'Letter Spacing', 'Layout.x': 'X', 'Layout.y': 'Y', 'Layout.width': 'Width', 'Layout.height': 'Height',
  'Layout.rotation': 'Rotation', outlineCount: 'Points', outlineDepth: 'Depth', outlineRotation: 'Outline Turn', kind: 'Shape',
  shapeDepth: 'Depth', patternCount: 'Count', patternRows: 'Rows', travelX: 'Move X', travelY: 'Move Y', activeColour: 'Lit Colour',
  activeOpacity: 'Lit Opacity', 'Core.controlForm': 'Form', 'Core.formSize': 'Form Size', 'Core.formDepth': 'Form Depth',
  'Core.formDivisions': 'Divisions', 'Core.formShowValue': 'Readout',
  shadowOffset: 'Shadow', shadowBlur: 'Shadow Softness', shadowColour: 'Shadow Colour', 'Text.Font.size': 'Size',
  aspect: 'Height', shiftY: 'Offset Y',
  'Behavior.tickRadius': 'Scale Radius', 'Behavior.scaleNumberCount': 'Numbers', 'Behavior.scaleNumberFrom': 'Numbers From',
  'Behavior.scaleNumberTo': 'Numbers To',
};

const words = (text) => String(text).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ')
  .replace(/\b\w/g, (ch) => ch.toUpperCase()).trim();

/** Where an override sits and what it is called: `{ part, property }`, in the inspector's words. */
export function describeLookPath(path) {
  const match = /^Parts\.([^.]+)\.(.+)$/.exec(String(path));
  const part = match ? (PART_LABELS[match[1]] ?? words(match[1])) : '';
  const tail = match ? match[2] : String(path);
  const property = PROPERTY_LABELS[tail] ?? words(tail.split('.').slice(-1)[0]);
  return { part, property };
}

/** A value as the Apply window shows it: a role by its name, a colour by its code, a word for the rest. */
export function describeLookValue(value) {
  // Nothing written there: the control's own factory default.
  if (value === undefined || value === null) return 'Default';
  if (value === '') return 'None';
  if (typeof value === 'string' && isTokenReference(value)) return `🔗 ${colourRoleName(value)}`;
  if (typeof value === 'string' && /^[0-9a-f]{8}$/i.test(value)) return `#${value.slice(2).toUpperCase()}`;
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return value.type ? words(value.type) : 'Set';
  return words(value);
}

/**
 * The overrides of `control` against the set it is drawn with, in a stable order (the control's
 * own sections first, then its parts): `{ set, entries: [{ path, value, was, part, property }] }`.
 * A detached control has none: its whole look is its own.
 */
export function controlOverrides(control, panelSet, sources = {}) {
  const ownership = setOwnership(control, panelSet, sources);
  if (ownership.detached) return { set: ownership.set, entries: [] };
  const order = (path) => (String(path).startsWith('Parts.') ? 1 : 0);
  const entries = [...ownership.own]
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((path) => ({
      path,
      value: deepClone(readControlPath(control, path)),
      was: ownership.setValues.get(path),
      ...describeLookPath(path),
    }));
  return { set: ownership.set, entries };
}

/** The family patch that takes `paths` of `control`, as it holds them: `{ component, parts }`. */
export function familyPatchFromControl(control, paths) {
  const patch = { component: {}, parts: {} };
  for (const path of paths ?? []) {
    const value = deepClone(readControlPath(control, path));
    const match = /^Parts\.([^.]+)\.(.+)$/.exec(String(path));
    if (match) patch.parts[match[1]] = { ...(patch.parts[match[1]] ?? {}), [match[2]]: value };
    else patch.component[path] = value;
  }
  return patch;
}

/** How many looks a family patch holds. */
export function familySize(family) {
  return Object.keys(family?.component ?? {}).length
    + Object.values(family?.parts ?? {}).reduce((sum, part) => sum + Object.keys(part ?? {}).length, 0);
}

/**
 * The set with its `type` family taking `patch` over what it held, and that family marked the
 * author's own design, so the set's derived designs leave it as written.
 */
export function setWithFamilyPatch(set, type, patch) {
  if (!set || !type) return set;
  const next = deepClone(set);
  const family = deepClone(next.families?.[type] ?? {});
  family.component = { ...(family.component ?? {}), ...(patch?.component ?? {}) };
  const parts = { ...(family.parts ?? {}) };
  for (const [name, values] of Object.entries(patch?.parts ?? {})) parts[name] = { ...(parts[name] ?? {}), ...values };
  if (Object.keys(parts).length) family.parts = parts;
  next.families = { ...(next.families ?? {}), [type]: family };
  next.chosenFamilies = { ...(next.chosenFamilies ?? {}), [type]: 'own' };
  if (next.designed?.[type]) {
    const { [type]: _, ...designed } = next.designed;
    next.designed = designed;
  }
  return next;
}

/**
 * What applying `paths` of `control` to its set does to the panel's other controls of its type
 * that are drawn with that set: how many follow it and change, and how many hold one of those looks
 * as their own and keep it. `drawnSetOf(control)` names the set a control is drawn with.
 */
export function applyReach(control, paths, panelControls, { setId, ownershipOf } = {}) {
  const type = String(control?._children?.Core?.controlType ?? '');
  const id = control?._children?.Core?.id;
  let follow = 0;
  let keep = 0;
  for (const other of panelControls ?? []) {
    const core = other?._children?.Core;
    if (!core || core.id === id || String(core.controlType) !== type) continue;
    const ownership = ownershipOf(other);
    if (!ownership || ownership.detached || String(ownership.set?.id ?? '') !== String(setId)) continue;
    if (paths.some((path) => ownership.own.has(path))) keep += 1;
    else follow += 1;
  }
  return { follow, keep };
}
