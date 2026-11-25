// animValueKinds.js — what the Values tab reads in the Animation Designer's script calls (the design
// record's "Scripting": "The Values tab offers library effects and presets, each with its preview,
// for an effect's name, and the path bar for a target"): an effect's name, a swap's text effect, a
// scene's name, and where on a control an effect plays.
//
// Each reader returns `{ meaning, problem }` as scriptValueKinds.js's do: `meaning.choices` makes the
// row a choice the sidebar writes back, `meaning.cards` the effects shown under the row with their
// previews (components/animation/EffectPreview.svelte), and `problem` is the runtime's refusal
// (panelRuntime.js animateEffectImpl, animateSwapImpl, animatePlayImpl), said before it runs.
//
// Its own module, so the value kinds do not take the scene model with them.

import { SCENE_EFFECTS, effectFromPreset, targetLabel, patternPlacesOf } from '../utils/sceneModel.js';
import { findEffect, effectNames, resolvePlace, swapFamily } from '../utils/sceneScript.js';
import { TEXT_EFFECT_NAMES, TEXT_EFFECTS } from '../utils/textEffects.js';
import { cleanSceneList } from '../utils/sceneFormat.js';
import { controlDrawsValue } from '../utils/valueDrawn.js';
import { controlNamed, didYouMean } from './scriptValueKinds.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();
const entryOf = (made) => (made ? { target: made.target, length: made.length, effect: made.effect } : null);
const presetsOf = (panel) => (Array.isArray(panel?.animationPresets) ? panel.animationPresets : []);

/** Every effect a script can name on this panel, as cards: the library's, then the panel's presets. */
export function effectCards(panel) {
  return [
    ...SCENE_EFFECTS.map((entry) => ({ name: entry.label, category: entry.category, entry: entryOf(entry) })),
    ...presetsOf(panel).map((preset) => ({ name: String(preset?.name ?? ''), category: 'This panel', entry: entryOf(effectFromPreset(preset)) }))
      .filter((card) => card.name && card.entry),
  ];
}

/** ce.anim.effect's effect: a library effect's name ("Fade in", or its id "move:fadeIn") or a preset the panel carries. */
export function readAnimEffect(value, { panel = null } = {}) {
  const names = effectNames({ panelPresets: presetsOf(panel) });
  const meaning = { name: value, found: null, choices: names, cards: effectCards(panel), entry: null };
  if (typeof value !== 'string') return { meaning, problem: null };
  const made = findEffect(value, { panelPresets: presetsOf(panel) });
  if (made) {
    meaning.found = true;
    meaning.entry = entryOf(made);
    meaning.label = made.label;
    return { meaning, problem: null };
  }
  meaning.found = false;
  return {
    meaning,
    problem: { severity: 'error', message: `ce.anim.effect: no effect or preset called "${value}". Pick one from the list.${didYouMean(value, names)}` },
  };
}

/** ce.anim.swap's effect: a text effect, its "out" on the old words and its "in" on the new. */
export function readSwapEffect(value) {
  const cards = TEXT_EFFECT_NAMES.map((name) => ({
    name, category: 'Text', entry: entryOf(SCENE_EFFECTS.find((entry) => entry.id === `text:${name}:in`)),
  }));
  const meaning = { name: value, found: null, choices: [...TEXT_EFFECT_NAMES], choiceNames: Object.fromEntries(TEXT_EFFECT_NAMES.map((name) => [name, TEXT_EFFECTS[name].label])), cards, entry: null };
  if (typeof value !== 'string') return { meaning, problem: null };
  const family = swapFamily(value);
  if (family) {
    meaning.found = true;
    meaning.entry = cards.find((card) => card.name === family)?.entry ?? null;
    return { meaning, problem: null };
  }
  meaning.found = false;
  return {
    meaning,
    problem: { severity: 'error', message: `ce.anim.swap: "${value}" is not a text effect; try ${TEXT_EFFECT_NAMES.join(', ')}.${didYouMean(value, TEXT_EFFECT_NAMES)}` },
  };
}

/** ce.anim.play's or ce.anim.seek's scene: one of the panel's scenes, by name or id, any case. */
export function readScene(value, { panel = null, verb = 'ce.anim.play' } = {}) {
  const scenes = cleanSceneList(panel?.animationScenes);
  const meaning = { name: value, found: null, choices: scenes.map((scene) => scene.name) };
  if (typeof value !== 'string' || !panel) return { meaning, problem: null };
  const scene = scenes.find((entry) => lower(entry.name) === lower(value) || lower(entry.id) === lower(value));
  if (scene) {
    meaning.found = true;
    meaning.sceneId = scene.id;
    return { meaning, problem: null };
  }
  meaning.found = false;
  return {
    meaning,
    problem: {
      severity: 'error',
      message: `${verb}: this panel has no scene called "${value}". ${scenes.length ? `Its scenes: ${meaning.choices.join(', ')}.` : 'Make one in the Animation Designer.'}${didYouMean(value, meaning.choices)}`,
    },
  };
}

/** The ways to write each place on a control a script can name, as full targets: "Cutoff", "Cutoff.Text", "Cutoff.bodyCap". */
export function targetChoices(control) {
  const name = String(control?._children?.Core?.name ?? control?._children?.Core?.id ?? '');
  if (!name) return { choices: [], choiceNames: {} };
  const places = [
    ['', 'Transform'],
    ...(control._children?.Text ? [['.Text', 'Text']] : []),
    ...(controlDrawsValue(control) ? [['.Value', 'Value']] : []),
    ...Object.keys(control._children?.Parts?._children ?? {}).map((part) => [`.${part}`, `Parts.${part}`]),
    ...patternPlacesOf(control).map((place) => [`.${place.replace(/^Parts\./, '')}`, place]),
  ];
  const choices = places.map(([suffix]) => `${name}${suffix}`);
  const choiceNames = Object.fromEntries(places.map(([suffix, place]) => [`${name}${suffix}`, targetLabel(place)]));
  return { choices, choiceNames };
}

/** ce.anim.effect's target: a control's name, then .Text, .Value, a part's name, or a pattern's path. */
export function readAnimTarget(value, { controls = [] } = {}) {
  const meaning = { name: value, found: null, choices: null, place: null };
  if (typeof value !== 'string' || !controls.length) return { meaning, problem: null };
  const steps = value.split('.').map((step) => step.trim()).filter(Boolean);
  const control = controlNamed(controls, steps[0]);
  if (!control) {
    const names = controls.map((entry) => String(entry._children?.Core?.name ?? '')).filter(Boolean);
    meaning.found = false;
    meaning.choices = names;
    return { meaning, problem: { severity: 'error', message: `ce.anim.effect: no control named "${steps[0] ?? value}".${didYouMean(steps[0] ?? value, names)}` } };
  }
  Object.assign(meaning, targetChoices(control), { controlId: control._children?.Core?.id ?? null });
  const place = resolvePlace(control, steps.slice(1));
  if (place) {
    meaning.found = true;
    meaning.place = place;
    meaning.label = targetLabel(place);
    return { meaning, problem: null };
  }
  meaning.found = false;
  return {
    meaning,
    problem: { severity: 'error', message: `ce.anim.effect: "${steps.slice(1).join('.')}" is not on ${steps[0]}. Pick a place from the list.` },
  };
}
