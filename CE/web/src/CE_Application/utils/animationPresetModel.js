/**
 * animationPresetModel.js — an animation preset a person saves, applies linked, and shares as a file:
 * the Animation Designer's step 4 (docs/design/animation-designer.md, Presets).
 *
 * The built-in presets (animationPresets.js) are code: each knows the state change it animates and
 * writes it. A person's preset is data, made from animations they built, so it has to carry what
 * those animations depend on to work anywhere else:
 *
 *   { format: 'ceditor-animation-preset', version: 1,
 *     id,                        // stable across machines: what a linked animation follows
 *     name, category, tags,
 *     size,                      // 'effect' (one animation) or 'recipe' (several, on one control)
 *     colours,                   // 'keep' its colours, or leave colour to the 'control' it goes on
 *     revision,                  // goes up each time the preset is changed
 *     animations: { name: node },// as the control stores them, minus the link
 *     states: { Key: { when, rule?, patches: { component, parts } } },  // the changes they ease;
 *                                // `rule` a condition over the value (Overload: valueNormalized > 0.9)
 *     fields: { path: value } }  // settings a recipe needs: the name/value swap's Text.shows, a
 *                                // knob's readout shown (Behavior.showHandleLabels) and hidden at
 *                                // rest (Parts.labelCurrent.opacity)
 *
 * TARGETS ARE ALREADY RELATIVE. A stored target is a path from the control down — `Parts.bodyCap…`,
 * `Background.Fill.colour`, `Transform` — never the control's name, so "Cutoff › Labels › Title" is
 * already "the control's title label". A preset goes on any control that has what its paths and
 * triggers name, and `presetNeeds` says what that is.
 *
 * LINKED, AS A CONTROL SET IS. Applied linked, each animation is written whole — the player and an
 * export need nothing they did not need before — with `preset: { id, revision, from }` naming what it
 * follows (`from` is its name in the preset). A field that differs from the version it follows is an
 * override. When the preset changes, a linked animation takes every field it has not overridden;
 * Revert, Clear overrides and Detach work as they do for a control set; Apply to preset writes a
 * control's overrides into the preset and every animation that follows it.
 */
import { uniqueAnimationName, animationsPatch, triggersTie } from './animationModel.js';
import { controlDrawsValue } from './valueDrawn.js';
import {
  LINK_KEY, PRESET_FORMAT, PRESET_FORMAT_VERSION, cleanPreset,
} from './animationPresetFormat.js';

// The format — reading, checking and writing a preset — lives in animationPresetFormat.js, which
// imports nothing, so the saved document (stores/panelModel.js) and the export tools that run under
// plain Node can read it without the whole animation model.
export {
  PRESET_FORMAT, PRESET_FORMAT_VERSION, PRESET_FILE_EXTENSION, PRESET_SIZES, PRESET_COLOURS, LINK_KEY,
  cleanPreset, readPresetFile, presetFileText, presetFileName,
} from './animationPresetFormat.js';
import { readTrigger } from './interactionRuntime.js';
import { labelShows } from './labelShows.js';
import { sliderWordsRefusal, isSliderFamily } from './anatomyWords.js';
import { setByAuthor } from './authorsStateValue.js';
import { BUTTON_DEVICE_PARTS, BUTTON_DEVICE_TYPES, buttonDeviceDrawn } from '../models/buttonDeviceParts.js';
import { METER_CELL_PART, METER_DEVICE_PARTS, METER_DEVICE_TYPES, meterDeviceDrawn, meterDrawsCells, meterPartNames, meterPlainLamps } from '../models/meterDeviceParts.js';
import { anatomyForm } from '../models/controlAnatomy.js';
import { LEVEL_TRIGGER_TYPES } from './keyframeAnimation.js';
import { choicePartNames } from './choiceGroupLayout.js';

/** The fields of an animation that are its identity in a control, not a setting. */
const IDENTITY = new Set(['_type', 'name', LINK_KEY]);

const deepCopy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Equal as data: object keys in any order, arrays in theirs. */
export function sameValue(a, b) {
  return stableText(a) === stableText(b);
}

function stableText(value) {
  if (Array.isArray(value)) return `[${value.map(stableText).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableText(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** A new preset id: random, so two people's presets never share one. */
export function newPresetId(random = Math.random) {
  let text = '';
  for (let i = 0; i < 12; i += 1) text += Math.floor(random() * 36).toString(36);
  return `ap_${text}`;
}

const COLOUR_PATH = /(^|\.)(colour|color|tint|gradient)$/i;

/** A copy of an animation node with its colours taken out (frames, a text effect's colour). */
function withoutColours(node) {
  const copy = deepCopy(node);
  if (Array.isArray(copy.frames)) {
    copy.frames = copy.frames.map((frame) => {
      const { fill, text, ...rest } = frame ?? {};
      return rest;
    });
  }
  if (copy.kind === 'text') copy.colour = null;
  return copy;
}

/** A state's key in a control, matched as triggers match it: ignoring case. */
function stateKey(states, name) {
  const wanted = String(name ?? '').toLowerCase();
  return Object.keys(states ?? {}).find((key) => key.toLowerCase() === wanted) ?? null;
}

/** The state names an animation's trigger depends on (not '*' or 'default'). */
function triggerStates(node) {
  const trigger = readTrigger(node);
  if (trigger.type !== 'stateChange') return [];
  return [...new Set([...trigger.to, ...(trigger.leaving ? trigger.from : [])])]
    .filter((name) => name && name !== '*' && name !== 'default');
}

/** Whether a state patch path is one of the paths an animation's targets move. */
function patchMoved(path, targets, part = '') {
  return targets.some((target) => {
    const targetPath = String(target?.path ?? '');
    const full = part ? `Parts.${part}.${path}` : path;
    return targetPath === full || targetPath.startsWith(`${full}.`) || full.startsWith(`${targetPath}.`);
  });
}

/**
 * A preset made from some of a control's animations. Only the state changes those animations ease
 * go with them — a Hover state's scale for a hover lift, not everything Hover also does — and,
 * with `colours: 'control'`, no colour at all.
 */
export function buildPreset(control, names, { id = newPresetId(), name = '', category = '', tags = [], colours = 'keep', revision = 1 } = {}) {
  const all = control?._children?.Animations?._children ?? {};
  const chosen = (Array.isArray(names) ? names : [names]).filter((key) => all[key]);
  if (!chosen.length) return { preset: null, reason: 'Choose an animation to save.' };
  const keepColours = colours !== 'control';
  const animations = {};
  for (const key of chosen) {
    const { [LINK_KEY]: _link, ...node } = deepCopy(all[key]);
    animations[key] = keepColours ? node : withoutColours(node);
  }

  const controlStates = control?._children?.States?._children ?? {};
  const states = {};
  for (const node of Object.values(animations)) {
    const targets = Array.isArray(node.targets) ? node.targets : [];
    for (const wanted of triggerStates(node)) {
      const key = stateKey(controlStates, wanted);
      if (!key) continue;
      const source = controlStates[key];
      const entry = states[key] ?? {
        when: deepCopy(source?.when ?? {}),
        ...(String(source?.rule ?? '').trim() ? { rule: String(source.rule).trim() } : {}),
        patches: { component: {}, parts: {} },
      };
      if (String(node.kind ?? 'transition') === 'transition') {
        for (const [path, value] of Object.entries(source?.patches?.component ?? {})) {
          if (!patchMoved(path, targets)) continue;
          if (!keepColours && COLOUR_PATH.test(path)) continue;
          entry.patches.component[path] = deepCopy(value);
        }
        for (const [part, patch] of Object.entries(source?.patches?.parts ?? {})) {
          for (const [path, value] of Object.entries(patch ?? {})) {
            if (!patchMoved(path, targets, part)) continue;
            if (!keepColours && COLOUR_PATH.test(path)) continue;
            entry.patches.parts[part] = { ...(entry.patches.parts[part] ?? {}), [path]: deepCopy(value) };
          }
        }
      }
      states[key] = entry;
    }
  }

  // The name/value swap waits for its words to become the value or the name, which only a Label
  // showing "name, value while touched" ever does.
  const fields = {};
  const waitsForWords = Object.values(animations).some((node) => node.kind === 'text'
    && readTrigger(node).type === 'textChange' && readTrigger(node).to.some((to) => to === 'value' || to === 'name'));
  if (waitsForWords && labelShows(control) === 'nameValue') fields['Text.shows'] = 'nameValue';

  return {
    preset: cleanPreset({
      format: PRESET_FORMAT,
      version: PRESET_FORMAT_VERSION,
      id,
      name: name || chosen[0],
      category,
      tags,
      size: chosen.length > 1 ? 'recipe' : 'effect',
      colours: keepColours ? 'keep' : 'control',
      revision,
      animations,
      states,
      fields,
    }),
  };
}

// --- What it needs, and what it goes on ---------------------------------------------------------

/** What a control must have for a preset to work on it: parts, sections, states. */
export function presetNeeds(preset) {
  const parts = new Set();
  const sections = new Set(['Animations']);
  for (const node of Object.values(preset?.animations ?? {})) {
    for (const target of node.targets ?? []) {
      const path = String(target?.path ?? '');
      if (path.startsWith('Parts.')) parts.add(path.split('.')[1]);
      else if (path.startsWith('Background.')) sections.add('Background');
      else if (path === 'Text' || path.startsWith('Text.')) sections.add('Text');
    }
  }
  for (const [part, patch] of Object.values(preset?.states ?? {}).flatMap((state) => Object.entries(state.patches?.parts ?? {}))) {
    if (patch && Object.keys(patch).length) parts.add(part);
  }
  for (const path of Object.keys(preset?.fields ?? {})) {
    if (path.startsWith('Text.')) sections.add('Text');
    if (path.startsWith('Meter.')) sections.add('Meter');
    if (path.startsWith('Parts.')) parts.add(path.split('.')[1]);
  }
  const states = Object.keys(preset?.states ?? {});
  return { parts: [...parts].sort(), sections: [...sections].sort(), states };
}

/** The parts a control has, by name: its own, and a choice group's drawn from its rows. */
const partNamesOf = (control) => new Set([...Object.keys(control?._children?.Parts?._children ?? {}), ...choicePartNames(control), ...meterPartNames(control)]);

/**
 * Why a preset cannot go on this control, or '' when it can. A control without an Animations section
 * (a Label) is given one; a state it needs is made when the control has States to hold it.
 */
export function presetDoesNotFit(preset, control) {
  if (!preset) return 'Nothing to apply.';
  if (!control?._children) return 'Choose a control to put it on.';
  const needs = presetNeeds(preset);
  const missingParts = needs.parts.filter((part) => !partNamesOf(control).has(part));
  if (missingParts.length) return `It moves ${missingParts.length > 1 ? 'parts' : 'a part'} this control does not have: ${missingParts.join(', ')}.`;
  const missingSections = needs.sections.filter((section) => section !== 'Animations' && !control._children[section]);
  if (missingSections.length) return `It animates this control's ${missingSections.join(' and ')}, and it has none.`;
  if (needs.states.length && !control._children.States) return `It plays on ${needs.states.join(', ')}, and this control has no states.`;
  if (Object.values(preset.animations ?? {}).some((node) => node?.kind === 'value') && !controlDrawsValue(control)) {
    return 'It moves what a value draws, and this control draws none: it goes on a knob, a slider, a Macro or a meter.';
  }
  // Only a meter's level clips or crosses a line (keyframeAnimation.js LEVEL_TRIGGER_TYPES): played
  // so on anything else, it would never play.
  if (Object.values(preset.animations ?? {}).some((node) => LEVEL_TRIGGER_TYPES.includes(node?.trigger?.type))
    && !METER_DEVICE_TYPES.has(String(control._children.Core?.controlType ?? ''))) {
    return 'It plays as a meter\'s level clips or crosses a line, and this control is no meter.';
  }
  // Words are thrown from a knob's or a slider's pointer, from a button's key, or from a meter; a
  // button or a meter throws only words of its own or a count, having no pointer to throw a value from.
  const emits = Object.values(preset.animations ?? {}).filter((node) => node?.kind === 'emit');
  if (emits.length) {
    const type = String(control._children.Core?.controlType ?? '');
    const button = BUTTON_DEVICE_TYPES.has(type);
    const meter = METER_DEVICE_TYPES.has(type);
    if (!button && !meter && !isSliderFamily(control)) return 'It throws words from a pointer, a key or a meter, and this control is none of them: it goes on a knob, a slider, a button or a meter.';
    if (button && emits.some((node) => !['words', 'count'].includes(node.shows))) return 'It throws the value, and a button has none to throw: words of its own or a count go on a button.';
    if (meter && emits.some((node) => !['words', 'count'].includes(node.shows))) return 'It throws the value from a pointer, and a meter has none: words of its own or a count go on a meter.';
  }
  return wordsNotShown(preset, control);
}

/**
 * Why a preset that plays on a key's own parts (its lamp, its legend, the key: models/buttonDeviceParts.js)
 * would play on nothing on this button as its set draws it, or ''. `drawn` is the button with its
 * set's design on it (controlSetFamilies.resolveControlForSet): a button keeps its six parts hidden
 * in the document whatever its set draws, so the stored control cannot say. A set that draws a
 * button whole (a flat face, an illustration) draws none of them; one that draws a key may draw it
 * without a lamp. The Components showcase's Button, second half.
 */
export function keyPartsNotDrawn(preset, drawn) {
  if (!BUTTON_DEVICE_TYPES.has(String(drawn?._children?.Core?.controlType ?? ''))) return '';
  const wanted = presetNeeds(preset).parts.filter((part) => BUTTON_DEVICE_PARTS.includes(part));
  if (!wanted.length) return '';
  const names = (list) => list.join(' and ');
  if (!buttonDeviceDrawn(drawn)) return `It plays on the key's ${names(wanted)}, and this button's set draws it whole, with no parts to play on.`;
  const hidden = wanted.filter((part) => drawn._children.Parts?._children?.[part]?.visible !== true);
  return hidden.length ? `It plays on the key's ${names(hidden)}, which this button's set does not draw.` : '';
}

/**
 * Why a preset that plays on a meter's own parts (its lamp, its needle, its scale, every lamp:
 * models/meterDeviceParts.js) would play on nothing on this meter as its set draws it, or ''. As a
 * button's (keyPartsNotDrawn): a meter keeps its parts hidden in the document whatever its set draws.
 * A part the preset turns on itself (`Parts.lamp.visible`, the clip lamp no set draws) is there once
 * it is applied. The Meter, phase 2.
 */
export function meterPartsNotDrawn(preset, drawn) {
  if (!METER_DEVICE_TYPES.has(String(drawn?._children?.Core?.controlType ?? ''))) return '';
  const wanted = presetNeeds(preset).parts.filter((part) => METER_DEVICE_PARTS.includes(part) || part === METER_CELL_PART);
  if (!wanted.length) return '';
  const label = (part) => (part === METER_CELL_PART ? 'every lamp' : part);
  const names = (list) => list.map(label).join(' and ');
  if (!meterDeviceDrawn(drawn)) {
    // Drawn plain (no form, no parts: editor/MeterRenderer.svelte), its LED segments are its lamps.
    const core = drawn._children.Core ?? {};
    const plain = !anatomyForm(core.controlType, core.controlForm);
    const lampsOnly = wanted.every((part) => part === METER_CELL_PART);
    if (plain && lampsOnly && meterPlainLamps(drawn) > 0) return '';
    if (plain && lampsOnly) return 'It plays on every lamp, and this meter is drawn as one bar: give it segments (the Meter tab\'s Segments) and each is a lamp.';
    return `It plays on the meter's ${names(wanted)}, and this meter's set draws it plain, with no parts to play on.`;
  }
  const turnedOn = (part) => preset.fields?.[`Parts.${part}.visible`] === true;
  const hidden = wanted.filter((part) => (part === METER_CELL_PART
    ? !meterDrawsCells(drawn)
    : drawn._children.Parts?._children?.[part]?.visible !== true && !turnedOn(part)));
  if (hidden.length) return `It plays on the meter's ${names(hidden)}, which this meter's set does not draw.`;
  // Words on its scale want the scale's numbers, which no set shows unless the preset turns them on.
  const onScaleWords = Object.values(preset.animations ?? {}).some((node) => node?.kind === 'text' && (node.targets ?? []).some((t) => String(t?.path ?? '') === 'Parts.scale'));
  if (onScaleWords && drawn._children.Parts?._children?.scale?.numerals !== true && preset.fields?.['Parts.scale.numerals'] !== true) {
    return 'It plays on the scale\'s numbers, and this meter\'s scale shows none.';
  }
  return '';
}

/**
 * Why a text effect in the preset would play on words this knob does not show (its scale's numbers
 * turned off, say), or ''. Judged as the knob will be once the preset's own fields are set, so a
 * preset that turns the readout on is not refused for its being off.
 */
function wordsNotShown(preset, control) {
  const fields = preset.fields ?? {};
  const asApplied = 'Behavior.showHandleLabels' in fields && control._children.Behavior
    ? { ...control, _children: { ...control._children, Behavior: { ...control._children.Behavior, showHandleLabels: fields['Behavior.showHandleLabels'] } } }
    : control;
  for (const node of Object.values(preset.animations ?? {})) {
    if (node?.kind !== 'text') continue;
    for (const target of node.targets ?? []) {
      const path = String(target?.path ?? '');
      if (!path.startsWith('Parts.')) continue;
      const reason = sliderWordsRefusal(asApplied, path.split('.')[1]);
      if (reason) return reason;
    }
  }
  return '';
}

/** The target paths of a transition, as a set to compare. */
const pathSet = (node) => [...new Set((node?.targets ?? []).map((target) => String(target?.path ?? '')))].sort().join('|');

/**
 * The animation of this control a preset's transition takes the place of: the one of the same name
 * that eases exactly the same things on the same change (`triggersTie`), unless it already follows
 * this preset. A knob's own glides are `pointerSlide` and `rangeSlide`; a Glide or a Spring names
 * its animations so, and means "move the value this way" instead of that glide, not beside it, where
 * the two would tie and the Animation tab would call it a clash. A Spring after a Glide takes the
 * Glide's place the same way. Applying a preset a second time to a control that follows it still
 * adds a copy, and an animation of another name is never taken. Null when there is none.
 */
function replacedBy(control, from, node, presetId, taken) {
  if (String(node?.kind ?? 'transition') !== 'transition') return null;
  const own = control?._children?.Animations?._children?.[from];
  if (!own || taken.has(from) || String(own.kind ?? 'transition') !== 'transition') return null;
  if (presetLink(own)?.id === presetId) return null;
  return pathSet(own) === pathSet(node) && triggersTie(readTrigger(own), readTrigger(node)) ? from : null;
}

/** The kinds of control a preset goes on, from the types' own defaults. `create(type)` makes one. */
export function presetFitsTypes(preset, types, create) {
  return types.filter((type) => {
    try { return !presetDoesNotFit(preset, create(type)); } catch { return false; }
  });
}

// --- Applying it --------------------------------------------------------------------------------

/**
 * The patch that puts a preset on a control: each animation under a name the control does not use —
 * or in the place of the one it would tie with (`replacedBy`: a knob's own glide, for a Glide) —
 * linked (`preset: { id, revision, from }`) unless `link` is false; each state merged into one the
 * control has — it keeps everything, and gains only the values it does not set already, as the
 * built-in presets merge (a value still at what its type made it with is not set by anyone:
 * authorsStateValue.js) — or made; and the recipe's fields. `{ patch, names }`, or
 * `{ patch: null, reason }`. With `drawn`, the control as its set draws it, a preset on a key's own
 * parts is refused where the set draws none of them (keyPartsNotDrawn).
 */
export function applyPresetPatch(control, preset, { link = true, drawn = null } = {}) {
  const reason = presetDoesNotFit(preset, control) || (drawn ? keyPartsNotDrawn(preset, drawn) || meterPartsNotDrawn(preset, drawn) : '');
  if (reason) return { patch: null, reason };
  const taken = Object.keys(control._children.Animations?._children ?? {});
  const nodes = {};
  const names = [];
  const replaced = new Set();
  for (const [from, node] of Object.entries(preset.animations)) {
    const instead = replacedBy(control, from, node, preset.id, replaced);
    if (instead) replaced.add(instead);
    const name = instead ?? uniqueAnimationName([...taken, ...names], from);
    names.push(name);
    nodes[name] = { ...deepCopy(node), _type: 'Animation', name, ...(link ? { [LINK_KEY]: { id: preset.id, revision: preset.revision, from } } : {}) };
  }
  const patch = { ...animationsPatch(control, nodes) };

  const states = control._children.States?._children ?? {};
  for (const [key, wanted] of Object.entries(preset.states ?? {})) {
    const existingKey = stateKey(states, key);
    const current = existingKey ? deepCopy(states[existingKey]) : null;
    const component = { ...(current?.patches?.component ?? {}) };
    const stateName = existingKey ?? key;
    for (const [path, value] of Object.entries(wanted.patches?.component ?? {})) {
      if (!setByAuthor(control, stateName, component, path)) component[path] = deepCopy(value);
    }
    const parts = { ...(current?.patches?.parts ?? {}) };
    for (const [part, patchValues] of Object.entries(wanted.patches?.parts ?? {})) {
      const merged = { ...(parts[part] ?? {}) };
      for (const [path, value] of Object.entries(patchValues ?? {})) {
        if (!setByAuthor(control, stateName, merged, path, part)) merged[path] = deepCopy(value);
      }
      parts[part] = merged;
    }
    // A choice group's options, all alike: what the state already sets for them is kept.
    const segments = mergedSegments(current?.patches?.segments, wanted.patches?.segments);
    patch[`States.${existingKey ?? key}`] = current
      ? { ...current, patches: { ...(current.patches ?? {}), component, parts, ...(segments ? { segments } : {}) } }
      : {
        _type: 'State',
        name: key,
        group: 'interaction',
        description: `${preset.name} (animation preset).`,
        enabled: true,
        when: deepCopy(wanted.when ?? {}),
        ...(wanted.rule ? { rule: wanted.rule } : {}),
        patches: { component, parts, ...(segments ? { segments } : {}) },
      };
  }
  for (const [path, value] of Object.entries(preset.fields ?? {})) patch[path] = value;
  return { patch, names };
}

/**
 * A state's options patch (`segments`, choiceGroupStyle.js) with a preset's shared layer laid in:
 * each value the state does not set yet, part by part. Null when the preset brings none.
 */
function mergedSegments(current, wanted) {
  const shared = wanted?.shared;
  if (!shared || typeof shared !== 'object' || !Object.keys(shared).length) return null;
  const out = deepCopy(current && typeof current === 'object' ? current : {});
  out.shared = out.shared && typeof out.shared === 'object' ? out.shared : {};
  for (const [part, values] of Object.entries(shared)) {
    if (!values || typeof values !== 'object') continue;
    const into = out.shared[part] && typeof out.shared[part] === 'object' ? out.shared[part] : {};
    for (const [key, value] of Object.entries(values)) if (into[key] === undefined) into[key] = deepCopy(value);
    out.shared[part] = into;
  }
  return out;
}

// --- Following it -------------------------------------------------------------------------------

/** What an animation node follows, or null. */
export function presetLink(node) {
  const link = node?.[LINK_KEY];
  return link && typeof link === 'object' && typeof link.id === 'string' ? link : null;
}

/** The animation in a preset that a linked node follows. */
export function followedAnimation(node, preset) {
  const link = presetLink(node);
  if (!link || !preset || link.id !== preset.id) return null;
  return preset.animations?.[link.from] ?? null;
}

const settingKeys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((key) => !IDENTITY.has(key)).sort();

/** The settings of a linked node that differ from the animation it follows: its overrides. */
export function presetOverrides(node, followed) {
  if (!followed) return [];
  return settingKeys(node, followed).filter((key) => !sameValue(node?.[key], followed?.[key]));
}

/** The node with one override put back to the preset's value. */
export function revertOverride(node, followed, key) {
  const next = deepCopy(node);
  if (followed?.[key] === undefined) delete next[key];
  else next[key] = deepCopy(followed[key]);
  return next;
}

/** The node as the preset has it, still linked: every override gone. */
export function clearOverrides(node, followed) {
  const link = presetLink(node);
  return { ...deepCopy(followed), _type: 'Animation', name: node.name, ...(link ? { [LINK_KEY]: { ...link } } : {}) };
}

/** The node on its own: the same settings, following nothing. */
export function detachNode(node) {
  const { [LINK_KEY]: _link, ...rest } = deepCopy(node);
  return rest;
}

/**
 * A linked node brought up to a preset's new version: every setting it had not overridden against
 * the version it followed (`before`) takes the new one (`after`); its overrides stay.
 */
export function followNewVersion(node, before, after, revision) {
  const overrides = new Set(presetOverrides(node, before));
  const next = deepCopy(node);
  for (const key of settingKeys(before, after)) {
    if (overrides.has(key)) continue;
    if (after?.[key] === undefined) delete next[key];
    else next[key] = deepCopy(after[key]);
  }
  next[LINK_KEY] = { ...presetLink(node), revision };
  return next;
}

/** The preset with one of its animations replaced by a control's version of it: Apply to preset. */
export function presetWithAnimation(preset, from, node) {
  const { [LINK_KEY]: _link, ...settings } = deepCopy(node);
  return cleanPreset({
    ...preset,
    revision: (preset.revision ?? 1) + 1,
    animations: { ...preset.animations, [from]: { ...settings, name: from } },
  });
}

/**
 * Every animation in these controls that follows `before`, brought to `after`: `[{ controlId, name,
 * node }]`, the writes one undo step makes.
 */
export function followersUpdate(controls, before, after) {
  const writes = [];
  for (const control of controls ?? []) {
    const id = control?._children?.Core?.id;
    for (const [name, node] of Object.entries(control?._children?.Animations?._children ?? {})) {
      const link = presetLink(node);
      if (!link || link.id !== after.id) continue;
      const was = before?.animations?.[link.from];
      const now = after.animations?.[link.from];
      if (!now) continue;
      writes.push({ controlId: id, name, node: followNewVersion(node, was ?? now, now, after.revision) });
    }
  }
  return writes;
}

/** The ids of the presets these controls' animations follow. */
export function presetsInUse(controls) {
  const ids = new Set();
  for (const control of controls ?? []) {
    for (const node of Object.values(control?._children?.Animations?._children ?? {})) {
      const link = presetLink(node);
      if (link) ids.add(link.id);
    }
  }
  return ids;
}
