/**
 * animationPresets.js — ready-made animations, each with the change it animates.
 *
 * A transition eases a change; it does not make one. "Hover lift" is two things: a Hover state that
 * scales the control up a little, and an animation that eases into it. A preset that wrote only the
 * animation would add something that plays and moves nothing — the properties panel's old Quick
 * buttons knew this and wrote the state too, but REPLACED any state of that name, so pressing
 * "Scale" on a button threw away its own Pressed colour. These merge: an existing state keeps
 * everything it had and gains the one value the preset needs, unless it already sets that value,
 * in which case it is left alone — the author's number wins over the preset's.
 *
 * Every preset is applied to every selected control in one undo step (the Animation tab does the
 * transaction; this file only builds patches and has no stores in it).
 */
import { uniqueAnimationName, keyframeTargets } from './animationModel.js';
import { readTrigger } from './interactionRuntime.js';

const transition = (name, trigger, targets, duration, easing) => ({
  _type: 'Animation', name, enabled: true, kind: 'transition', trigger, targets, duration, delay: 0, easing,
});

const keyframes = (name, trigger, frames, duration, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'keyframes', trigger, targets: keyframeTargets(''),
  frames, duration, delay: 0, easing: 'inOutQuad', ...extra,
});

/**
 * The presets. `state` is the state a preset needs — its key, its condition, and the one value it
 * patches; `needs` names a part the control must have; `signal` a session flag the control must be
 * able to reach for the state to ever hold.
 */
export const ANIMATION_PRESETS = [
  {
    id: 'hoverLift',
    label: 'Hover lift',
    summary: 'Grows a little under the pointer, and settles back when it leaves.',
    state: { key: 'Hover', when: { hover: true }, path: 'Transform.scale', value: 1.04 },
    animation: (name) => transition(name, { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true },
      [{ path: 'Transform.scale', properties: ['transform'] }], 140, 'outCubic'),
  },
  {
    id: 'pressSquish',
    label: 'Press squish',
    summary: 'Squashes on press and springs back on release.',
    state: { key: 'Pressed', when: { pressed: true }, path: 'Transform.scale', value: 0.94 },
    animation: (name) => transition(name, { type: 'stateChange', from: ['*'], to: ['pressed'], reverse: true },
      [{ path: 'Transform.scale', properties: ['transform'] }], 90, 'outBack'),
  },
  {
    id: 'fadeWhenDisabled',
    label: 'Fade when disabled',
    summary: 'Fades to half strength when the control is disabled, and back when it is enabled.',
    state: { key: 'Disabled', when: { disabled: true }, path: 'Transform.opacity', value: 0.45 },
    animation: (name) => transition(name, { type: 'stateChange', from: ['*'], to: ['disabled'], reverse: true },
      [{ path: 'Transform.opacity', properties: ['opacity'] }], 220, 'inOutQuad'),
  },
  {
    id: 'blinkWhileOn',
    label: 'Blink while on',
    summary: 'Blinks gently for as long as the control is checked — an LED that says "armed".',
    signal: 'checked',
    state: { key: 'Checked', when: { checked: true } },
    animation: (name) => keyframes(name, { type: 'stateChange', to: ['checked'] },
      [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.35 }, { at: 1, opacity: 1 }], 900, { iterations: 'infinite' }),
  },
  {
    id: 'beatPulse',
    label: 'Beat pulse',
    summary: 'A small pulse on every beat while the transport runs.',
    animation: (name) => keyframes(name, { type: 'beat', every: 1 },
      [{ at: 0, scale: 1 }, { at: 0.2, scale: 1.06 }, { at: 1, scale: 1 }], 260, { easing: 'outQuad', iterations: 1 }),
  },
  {
    id: 'valueGlide',
    label: 'Value glide',
    summary: 'The pointer glides to a value that arrives from outside — MIDI, automation — and tracks a drag exactly.',
    needs: 'pointerCurrent',
    animation: (name) => transition(name, { type: 'valueChange', source: 'value.normalized', origin: 'external' },
      ['pointerCurrent', 'pointerStart', 'pointerEnd'].flatMap((part) => [
        { path: `Parts.${part}.Layout.x`, properties: ['transform'] },
        { path: `Parts.${part}.Layout.y`, properties: ['transform'] },
      ]), 160, 'outCubic'),
  },
];

export const PRESET_BY_ID = Object.fromEntries(ANIMATION_PRESETS.map((preset) => [preset.id, preset]));

/** Can this control reach the flag a preset's state waits for? Only toggles are ever checked. */
function reachesSignal(control, signal) {
  if (signal !== 'checked') return true;
  const behavior = control?._children?.Behavior ?? {};
  const states = Object.values(control?._children?.States?._children ?? {});
  return String(behavior.buttonType ?? '') === 'toggle'
    || behavior.valueType === 'bool'
    || states.some((state) => state?.when?.checked === true);
}

/**
 * A transition this control already has that eases its pointer on a value change. Knobs and sliders
 * ship one (pointerSlide), and a second would only tie with it — a clash, not a glide.
 */
function existingPointerGlide(control) {
  const animations = control?._children?.Animations?._children ?? {};
  return Object.entries(animations).find(([, animation]) => animation && animation.enabled !== false
    && String(animation.kind ?? 'transition') !== 'keyframes'
    && readTrigger(animation).type === 'valueChange'
    && (animation.targets ?? []).some((target) => String(target?.path ?? '').startsWith('Parts.pointerCurrent.')))?.[0] ?? null;
}

/** Why a preset cannot go on this control, or '' when it can. */
export function presetBlockedBecause(control, preset) {
  if (!control || !preset) return 'Nothing to add it to.';
  if (!control._children?.Animations) return 'This control has no Animations section.';
  if (preset.needs && !control._children?.Parts?._children?.[preset.needs]) {
    return `It moves the pointer, and this control has no part called ${preset.needs}.`;
  }
  if (preset.id === 'valueGlide') {
    const already = existingPointerGlide(control);
    if (already) return `It already glides its pointer with ${already}; a second would only clash with it.`;
  }
  if (preset.signal && !reachesSignal(control, preset.signal)) {
    return 'It plays while the control is checked, and this control is never checked.';
  }
  return '';
}

/**
 * The patch that adds a preset to one control: the animation under a name not already taken, and
 * the state it needs, merged into one the control has (matched by name, ignoring case) or new.
 * Returns `{ patch, name }`, or `{ patch: null, reason }` when it cannot go on this control.
 */
export function presetPatch(control, presetId) {
  const preset = PRESET_BY_ID[presetId];
  const reason = presetBlockedBecause(control, preset);
  if (reason) return { patch: null, reason };
  const existing = Object.keys(control._children.Animations._children ?? {});
  const name = uniqueAnimationName(existing, preset.id);
  const patch = { [`Animations.${name}`]: preset.animation(name) };

  if (preset.state) {
    const states = control._children.States?._children ?? {};
    const key = Object.keys(states).find((k) => k.toLowerCase() === preset.state.key.toLowerCase());
    // A copy: the new state node must share nothing with the one it replaces, which undo keeps.
    const current = key ? JSON.parse(JSON.stringify(states[key])) : null;
    const component = { ...(current?.patches?.component ?? {}) };
    if (preset.state.path && !(preset.state.path in component)) component[preset.state.path] = preset.state.value;
    // A state the control already has keeps its condition, group and part patches as they were.
    patch[`States.${key ?? preset.state.key}`] = current
      ? { ...current, patches: { ...(current.patches ?? {}), component } }
      : {
        _type: 'State',
        name: preset.state.key,
        group: 'interaction',
        description: `${preset.label} (animation preset).`,
        enabled: true,
        when: { ...preset.state.when },
        patches: { component, parts: {} },
      };
  }
  return { patch, name };
}
