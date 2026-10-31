// authorWords.js — the words the editor shows an author for things the model names as identifiers.
//
// The 2026-10 designer review found the model's own names on screen: a knob converted from the panel
// badged "SLIDERC…" in the layer list (its part kind, `slidercontrol`); the Interact card reading
// "float · slidercontrol" and "Type slidercontrol"; a binding's target as
// `Parts.Cutoff.meta.sliderControl.value`; a state's condition as `hoveredCustomHitZone: CutoffZone`;
// the contract as "Cutoff > Cutoff (float)"; the Core tab's "A11y" and "CustomComponent". Each is
// exact in the file and opaque on screen.
//
// These turn them into words. NOTHING HERE CHANGES WHAT IS STORED: a path is still the path, and the
// fields that edit one still show it. A name with no word of its own comes back as readable words
// rather than hidden, so a new kind or key is never worse than it was.

import { INSERT_CATEGORIES } from '../models/insertCatalog.js';
import { SLIDER_CONTROL_KIND } from './sliderControlPart.js';

/** `xy-pad` → `xy pad`, `filmstripControl` → `filmstrip control`. */
export function identifierWords(name) {
  return String(name ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function capitalised(text) {
  const value = String(text ?? '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const CHANNEL_TYPE_WORDS = {
  float: 'number',
  int: 'whole number',
  integer: 'whole number',
  bool: 'on/off',
  boolean: 'on/off',
  enum: 'choice',
  string: 'text',
  text: 'text',
  array: 'list',
  color: 'colour',
  colour: 'colour',
  trigger: 'trigger',
};

/** A value channel's type as the author would say it: float → number, enum → choice. */
export function channelTypeWord(type) {
  const key = String(type ?? 'float').trim().toLowerCase() || 'float';
  return CHANNEL_TYPE_WORDS[key] ?? identifierWords(key);
}

/** What a knob or slider carried as a part (sliderControlPart.js) was on the panel: `knob`, `slider`. */
export function carriedControlWord(part) {
  const type = String(part?.meta?.sliderControl?.control?._children?.Core?.controlType ?? '').trim();
  return type ? type.toLowerCase() : 'knob or slider';
}

export function isCarriedControlBehavior(behavior) {
  return String(behavior?.type ?? '').trim().toLowerCase() === SLIDER_CONTROL_KIND;
}

// The behaviour types BEHAVIOR_TEMPLATES in CustomBehaviorsEditor.svelte offers, by their labels there.
const BEHAVIOR_TYPE_WORDS = {
  button: 'button',
  toggle: 'toggle',
  slider: 'slider',
  dial: 'dial',
  'xy-pad': 'XY pad',
  'piano-bar': 'piano',
  scroll: 'scroll',
  'filmstrip-control': 'filmstrip',
};

/**
 * A behaviour's type in words. A carried panel control's behaviour is named for what the control was
 * (`panel knob`), found through the part the behaviour names; `parts` is the component's Parts children.
 */
export function behaviorTypeWord(behavior, parts = {}) {
  const type = String(behavior?.type ?? '').trim().toLowerCase();
  if (type === SLIDER_CONTROL_KIND) return `panel ${carriedControlWord(parts?.[behavior?.part])}`;
  return BEHAVIOR_TYPE_WORDS[type] ?? (identifierWords(type) || 'behaviour');
}

// Sections that only say where a property lives, not what it is.
const HOLDER_SECTIONS = new Set(['Background', 'Layout', 'Style', 'Transform']);
const PATH_WORDS = {
  'Text.content': 'text',
  'Background.colour': 'fill',
};
// Under `meta`, keys whose words are not their own: `domFocus` is the browser's name for it.
const META_KEY_WORDS = {
  domFocus: 'keyboard focus',
};

/**
 * A property path inside a part, in words: `Background.Border.colour` → `border colour`,
 * `meta.sliderControl.hover` → `hover` (under `meta`, the second name is the part's renderer, and the
 * rest is what changes).
 */
export function propertyPathWords(path) {
  const value = String(path ?? '').trim();
  if (!value) return '';
  if (PATH_WORDS[value]) return PATH_WORDS[value];
  const segments = value.split('.').filter(Boolean);
  if (segments[0] === 'meta' && segments.length >= 3) {
    const rest = segments.slice(2);
    return rest.length === 1 && META_KEY_WORDS[rest[0]] ? META_KEY_WORDS[rest[0]] : identifierWords(rest.join(' '));
  }
  const kept = HOLDER_SECTIONS.has(segments[0]) && segments.length > 1 ? segments.slice(1) : segments;
  return identifierWords(kept.join(' '));
}

/** A binding's or a published property's target: `Parts.Cutoff.meta.sliderControl.value` → `Cutoff › value`. */
export function targetPathWords(target) {
  const value = String(target ?? '').trim();
  const part = /^Parts\.([^.]+)\.(.+)$/.exec(value);
  if (part) return `${part[1]} › ${propertyPathWords(part[2])}`;
  return propertyPathWords(value);
}

const FLAG_WORDS = {
  hover: 'hovered',
  pressed: 'pressed',
  focused: 'focused',
  dragging: 'dragging',
  disabled: 'disabled',
  checked: 'checked',
  mixed: 'mixed',
  pending: 'pending',
};

const either = (value) => (Array.isArray(value) ? value.join(' or ') : String(value));

/**
 * A state's `when` in words: `{ hoveredCustomHitZone: 'cutoffZone' }` → `pointer over cutoffZone`,
 * `{ activeCustomHitZone: 'cutoffZone', dragging: true }` → `cutoffZone pressed, dragging`. The keys
 * are the interaction signals interactionRuntime.js gives a component. A state with no condition is
 * applied by hand, and says `manual` as it always has. Not capitalised: most begin with a name, and a
 * name is the author's, letter for letter.
 */
export function stateConditionWords(when) {
  const entries = Object.entries(when ?? {});
  if (!entries.length) return 'manual';
  const words = entries.map(([key, value]) => {
    switch (key) {
      case 'hoveredCustomHitZone':
      case 'hoveredCustomBehavior':
        return `pointer over ${either(value)}`;
      case 'activeCustomHitZone':
      case 'activeCustomBehavior':
        return `${either(value)} pressed`;
      case 'focusedCustomHitZones':
        return `${either(value)} focused`;
      case 'domFocusCustomHitZone':
        return `${either(value)} has the keyboard focus`;
      case 'valueEnum':
      case 'mode':
        return `mode ${either(value)}`;
      case 'value':
        return `value ${either(value)}`;
      case 'valueNormalized':
        return `value at ${either(value)}`;
      default:
        if (FLAG_WORDS[key] && typeof value === 'boolean') return value ? FLAG_WORDS[key] : `not ${FLAG_WORDS[key]}`;
        return `${identifierWords(key)} ${either(value)}`;
    }
  });
  return words.join(', ');
}

const TYPE_LABELS = new Map(
  INSERT_CATEGORIES.flatMap((category) => category.items ?? [])
    // "Harmoniser (one finger, full chord)" is the Insert menu's description; the type is the name.
    .map((item) => [item.type, String(item.label ?? '').replace(/\s*\(.*\)\s*$/, '')]),
);

/** A control's type as the Insert menu names it: `CustomComponent` → `Custom Component`. */
export function controlTypeLabel(type) {
  const value = String(type ?? '').trim();
  return TYPE_LABELS.get(value) || value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
