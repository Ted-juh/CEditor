// componentSchema.js — what a given KIND of control can actually do.
//
// The API is organised by module: ce.midi, ce.draw, ce.components.arp. That answers "what can this
// module do", and it is the right shape for the contract. It is the wrong shape for somebody
// holding a Slider, who wants the opposite question answered: *what of all this applies to me?*
//
// Nothing answered that. `arpRate("cutoffslider", 4)` was a name a script could type, reach for in
// the picker, and only discover was meaningless by running it. A Slider has no Arp section, so the
// verb reports "not an Arpeggiator" — after the fact, at runtime, once.
//
// This module is the missing half. It maps a component TYPE to the sections it has, and answers
// whether an API member applies to a control of that type. One source, three surfaces:
//
//   ScriptPicker        the tree narrows to the selected control
//   languageService     autocomplete offers what applies and nothing else
//   panelRuntime        the error message can name what the control DOES have
//
// It is derived, not declared: COMPONENT_TYPES already says which sections each type carries, and
// COMPONENT_FAMILIES already says which section each family drives. Restating either would be a
// third list to keep in step with the other two.

import { COMPONENT_TYPES } from '../models/componentTypes.js';
import { COMPONENT_FAMILIES } from './componentVerbs.js';
import { memberModule } from './panelApi.js';

/**
 * The five hand-written families predate the phase-7 spec, so their section is not declared
 * anywhere machine-readable — it only exists inside each reducer. Stated once here rather than
 * inferred, because guessing "ce.components.harmony -> Harmoniser" from the id would be a rule
 * that works until a family is named differently from its section, which `split` and `harmony`
 * already are.
 */
const LEGACY_FAMILY_SECTIONS = {
  'ce.components.split': 'SplitZone',
  'ce.components.phrase': 'Phrase',
  'ce.components.recorder': 'Recorder',
  'ce.components.harmony': 'Harmoniser',
  'ce.components.setlist': 'Setlist',
};

/** module id -> the model section its verbs drive. Empty for every non-component module. */
export const FAMILY_SECTIONS = {
  ...LEGACY_FAMILY_SECTIONS,
  ...Object.fromEntries(COMPONENT_FAMILIES.map((f) => [`ce.components.${f.id}`, f.section])),
};

/** Component type -> its sections. Unknown type -> empty, which makes nothing apply rather than
    everything: a type this build has never heard of should narrow to nothing, loudly. */
export function sectionsForType(type) {
  return COMPONENT_TYPES[String(type ?? '')]?.sections ?? [];
}

/** Is `type` a component type this build knows? */
export function isKnownType(type) {
  return Object.prototype.hasOwnProperty.call(COMPONENT_TYPES, String(type ?? ''));
}

/** The component type of a control object, or '' if it has not got one. */
export function typeOfControl(control) {
  return String(control?._children?.Core?.type ?? '');
}

/**
 * Does `moduleId` apply to a control of this type?
 *
 * Only the component families are type-specific. Everything else — ce.core, ce.midi, ce.draw,
 * ce.anim, ce.panel, the lot — is cross-cutting by design: you can draw on any control, animate
 * any value, send MIDI from anywhere. Narrowing those would be a lie in the other direction.
 */
export function moduleAppliesToType(moduleId, type) {
  const section = FAMILY_SECTIONS[moduleId];
  if (!section) return true;                    // not a component family — applies everywhere
  return sectionsForType(type).includes(section);
}

/** Does an API member apply to a control of this type? */
export function memberAppliesToType(memberId, type) {
  const owner = memberModule()[memberId];
  if (!owner) return true;                      // unowned members are core-ish; never narrowed
  return moduleAppliesToType(owner.module, type);
}

/**
 * The component families a control of this type actually has, as module ids.
 * Usually none (a Slider), sometimes one (an Arpeggiator). Never more in practice, but the shape
 * allows it rather than asserting a rule the model does not enforce.
 */
export function familiesForType(type) {
  const sections = sectionsForType(type);
  return Object.entries(FAMILY_SECTIONS)
    .filter(([, section]) => sections.includes(section))
    .map(([moduleId]) => moduleId);
}

/**
 * A one-line summary of what a control IS, for an error message or a tooltip:
 *   "a Slider (Mouse, Behavior, Parts, Bindings, DeviceBindings, States, Animations, Scripts)"
 * The point is that somebody who aimed the wrong verb at it is told what it does have, rather than
 * only what it has not.
 */
export function describeType(type) {
  const sections = sectionsForType(type);
  if (!sections.length) return String(type ?? 'control');
  return `${type} (${sections.join(', ')})`;
}
