/**
 * sceneScript.js — what the scene calls a script makes need resolved (scripting/panelRuntime.js,
 * step 5c): an effect or a preset by its name, a target by its path, a one-off scene to play it in,
 * and a text swap's two halves. Pure; the runtime does the playing (utils/sceneRuntime.js).
 *
 * Names are the ones the Designer shows: a library effect by its label ("Fade in", "Typewriter in")
 * or id ("move:fadeIn"), a preset by its name, any case. A target is a control's name, then
 * `.Text` for its words or a part's name (`Knob01.bodyCap`, or `Knob01.Parts.bodyCap`); the control
 * alone is its whole box. `.Value` is what a knob's value draws (step 6), where a value effect plays;
 * `.Patterns.<name>` one of its own background patterns.
 */
import { SCENE_EFFECTS, effectFromPreset } from './sceneModel.js';
import { TEXT_EFFECTS, TEXT_EFFECT_NAMES, splitText, textEffectSpan } from './textEffects.js';
import { controlDrawsValue } from './valueDrawn.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** The swap family a name means — "roll", "Roll in", "text:push:out" — or null. */
export function swapFamily(name) {
  const text = lower(name).replace(/^text:/, '').replace(/[:\s]+(in|out)$/, '');
  const byLabel = TEXT_EFFECT_NAMES.find((key) => lower(TEXT_EFFECTS[key].label) === text);
  return TEXT_EFFECT_NAMES.includes(text) ? text : byLabel ?? null;
}

/**
 * An effect by name: `{ label, effect, length, target }` (`target` where it goes on a control when
 * the script names none), or null. The library first, then the panel's presets, then yours.
 */
export function findEffect(name, { panelPresets = [], myPresets = [] } = {}) {
  const wanted = lower(name);
  if (!wanted) return null;
  const library = SCENE_EFFECTS.find((entry) => entry.id.toLowerCase() === wanted || lower(entry.label) === wanted);
  if (library) return { label: library.label, effect: library.effect, length: library.length, target: library.target };
  for (const preset of [...(panelPresets ?? []), ...(myPresets ?? [])]) {
    if (lower(preset?.name) !== wanted) continue;
    const made = effectFromPreset(preset);
    if (made) return { label: preset.name, ...made };
  }
  return null;
}

/** The names a script can use, for an error that lists them. */
export function effectNames({ panelPresets = [], myPresets = [] } = {}) {
  return [...SCENE_EFFECTS.map((entry) => entry.label), ...[...(panelPresets ?? []), ...(myPresets ?? [])].map((preset) => preset?.name).filter(Boolean)];
}

/**
 * Where on a control a path after its name points: 'Transform' (nothing: the box), 'Text',
 * 'Value' (what its value draws), 'Patterns.<name>' for a pattern it has, or 'Parts.<name>' for a part
 * it has. Null when it names nothing there.
 */
export function resolvePlace(control, rest) {
  const steps = (Array.isArray(rest) ? rest : String(rest ?? '').split('.')).map((step) => String(step).trim()).filter(Boolean);
  if (!steps.length) return 'Transform';
  if (steps.length === 1 && lower(steps[0]) === 'text') return control?._children?.Text ? 'Text' : null;
  if (steps.length === 1 && lower(steps[0]) === 'value') return controlDrawsValue(control) ? 'Value' : null;
  if (steps.length === 2 && lower(steps[0]) === 'patterns') {
    const patterns = Object.keys(control?._children?.Background?._children?.Patterns?._children ?? {});
    const key = patterns.find((name) => lower(name) === lower(steps[1]));
    return key ? `Patterns.${key}` : null;
  }
  const parts = control?._children?.Parts?._children ?? {};
  const name = lower(steps[0]) === 'parts' ? steps[1] : steps[0];
  if (steps.length > (lower(steps[0]) === 'parts' ? 2 : 1)) return null;
  const key = Object.keys(parts).find((part) => lower(part) === lower(name));
  return key ? `Parts.${key}` : null;
}

/** How long a text effect takes over these words: each piece a little after the last. */
export function textSpanFor(effect, words) {
  const count = splitText(String(words ?? ''), effect?.split).filter((piece) => piece.animated).length;
  return Math.max(10, Math.round(textEffectSpan(effect, Math.max(1, count))));
}

let seq = 0;

/** A one-off scene of one clip, for the runtime's `effect`: `{ id, name, trigger, length, loop, clips }`. */
export function oneOffScene({ controlId, target, effect, length, start = 0, label = '' }) {
  seq += 1;
  const begin = Math.max(0, Math.round(Number(start) || 0));
  const span = Math.max(10, Math.round(Number(length) || 600));
  return {
    id: `fx_${seq}`,
    name: label || 'effect',
    trigger: { type: 'script' },
    length: begin + span,
    loop: false,
    clips: [{ id: `fxc_${seq}`, controlId, target, start: begin, length: span, effect: { ...effect, iterations: 1 } }],
  };
}
