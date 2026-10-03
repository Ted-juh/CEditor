/**
 * animationPlayback.js — playing one animation on demand, for the Animation tab's stage.
 *
 * Until now the only way to see an animation was to leave the editor for Preview, find the
 * control, and do whatever its trigger listens for — and for "from hover to pressed" that means
 * performing the press yourself, at full speed, while trying to watch it. The stage in the tab
 * draws the control on a preview session of its own, and Play drives that session through the
 * animation's trigger: the state it starts in, the change, and back again if the animation plays in
 * reverse.
 *
 * This file is the plan — which session patches, in what order, held for how long — and has no
 * Svelte or timers in it. components/animation/AnimationStage.svelte runs it.
 *
 * A state is entered by making its `when` true: `{ hover: true }` is the session's hover flag. A
 * state with a compound `rule` over a custom component's value channels (`active >= 1`) is entered
 * by setting those channels — the session holds them as `customValues` — to values the rule accepts,
 * found by trying each channel's obvious settings against the runtime's own rule evaluator. Running
 * the app showed why: the status lamp starter's glow is on such a state, and Play could not light
 * it. A condition the session cannot hold at all is reported (`exact: false`) and played as near as
 * it can be, because a near miss shown honestly beats a Play button that does nothing.
 */
import { readTrigger } from './interactionRuntime.js';
import { getCustomValueChannels, customChannelDefaultValue, customConditionMatches } from './customComponentInteraction.js';
import { controlStateNames, ANY_STATE, DEFAULT_STATE } from './animationModel.js';
import { isSliderBehavior, getSliderMin, getSliderMax } from './sliderBehavior.js';
import { isRangeBehavior, getRangeMin, getRangeMax } from './rangeBehavior.js';

/** The session flags a state's `when` can name, at rest. */
export const REST_SESSION = Object.freeze({
  hover: false,
  pressed: false,
  focused: false,
  dragging: false,
  disabled: false,
  checked: false,
  mixed: false,
  pending: false,
  executed: false,
  activeHandle: 'current',
});

const FLAGS = Object.keys(REST_SESSION).filter((key) => typeof REST_SESSION[key] === 'boolean');

/** How long the stage holds the frame before a change, so the eye has something to start from. */
export const LEAD_MS = 320;
/** How long it holds after a transition has had time to finish, before the next step. */
export const TAIL_MS = 380;

/**
 * A real gesture never presses without hovering, or drags without pressing. Entering "pressed" from
 * nothing would enter hover in the same frame, and a hover animation would tie with the press one.
 */
function implied(patch) {
  const out = { ...patch };
  if (out.dragging === true) out.pressed = true;
  if (out.pressed === true && out.hover === undefined) out.hover = true;
  return out;
}

/** The settings worth trying for one value channel: both ways for a switch, each choice, the ends. */
function channelCandidates(channel) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  if (type === 'bool' || type === 'boolean') return [true, false];
  if (type === 'enum') {
    const values = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
    return values.map((value) => (value && typeof value === 'object' ? (value.value ?? value.id ?? value.label) : value));
  }
  if (type === 'array' || type === 'text' || type === 'note') return [];
  const min = Number.isFinite(Number(channel?.min)) ? Number(channel.min) : 0;
  const max = Number.isFinite(Number(channel?.max)) ? Number(channel.max) : min + 1;
  return [...new Set([max, min, (min + max) / 2, customChannelDefaultValue(channel)])];
}

const escapeName = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Custom channel values that make a state's rule true, or null when the rule names no channel the
 * control has, or no combination of the channels' obvious settings satisfies it. `flags` are the
 * session flags the state's `when` sets, so a rule like `hover == true && level > 0.5` sees them.
 * Only the channels the rule names are tried, and at most 256 combinations.
 */
export function ruleValues(control, rule, flags = {}) {
  const text = String(rule ?? '').trim();
  if (!text) return null;
  const channels = getCustomValueChannels(control) ?? {};
  const named = Object.keys(channels).filter((name) => new RegExp(`(^|[^\\w.])${escapeName(name)}(?![\\w])`).test(text));
  if (!named.length) return null;
  const base = Object.fromEntries(Object.entries(channels).map(([name, channel]) => [name, customChannelDefaultValue(channel)]));
  const flagValues = Object.fromEntries(FLAGS.map((flag) => [flag, flags?.[flag] === true]));
  let combos = [{}];
  for (const name of named) {
    const candidates = channelCandidates(channels[name]);
    if (!candidates.length) return null;
    combos = combos.flatMap((combo) => candidates.map((value) => ({ ...combo, [name]: value })));
    if (combos.length > 256) return null;
  }
  return combos.find((combo) => customConditionMatches(text, { ...base, ...flagValues, ...combo })) ?? null;
}

/** The channels' own values, for the channels a set of custom values names: where the stage starts. */
function channelDefaults(control, values) {
  const channels = getCustomValueChannels(control) ?? {};
  return Object.fromEntries(Object.keys(values ?? {}).map((name) => [name, customChannelDefaultValue(channels[name])]));
}

/**
 * The session patch that makes a state true, or null when the control has no such state.
 * `exact` is false when part of the state's condition is beyond what a preview session holds.
 */
export function statePatch(control, stateName) {
  const name = String(stateName ?? '').trim().toLowerCase();
  if (!name || name === DEFAULT_STATE) return { patch: {}, exact: true, name: DEFAULT_STATE };
  const states = control?._children?.States?._children ?? {};
  const found = Object.entries(states).find(([key]) => String(key).trim().toLowerCase() === name);
  if (!found) return null;
  const [, state] = found;
  const patch = {};
  let exact = true;
  for (const [key, expected] of Object.entries(state?.when ?? {})) {
    const value = Array.isArray(expected) ? expected[0] : expected;
    if (FLAGS.includes(key) && typeof value === 'boolean') patch[key] = value;
    else if (key === 'activeHandle' && typeof value === 'string') patch[key] = value;
    else exact = false;
  }
  const rule = String(state?.rule ?? '').trim();
  if (rule) {
    const values = ruleValues(control, rule, patch);
    if (values) patch.customValues = values;
    else exact = false;
  }
  return { patch, exact, name };
}

/**
 * How long the stage should hold to show a row: a transition's run; a keyframe one-shot's run, all
 * its repeats; a loop's first two cycles — it never ends, and two is enough to see it is one.
 */
function spanOf(row, timeScale) {
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
  const duration = Math.max(0, Number(row?.duration) || 0);
  const delay = Math.max(0, Number(row?.delay) || 0);
  if (row?.kind === 'keyframes') {
    const cycles = row.iterations === 'infinite' ? 2 : Math.max(1, Number(row.iterations) || 1);
    return (delay + duration * cycles) * scale;
  }
  return (duration + delay) * scale;
}

const firstNamed = (list, known) => (list ?? []).find((name) => name !== ANY_STATE && name !== DEFAULT_STATE && known.includes(name));

/**
 * The session patch that puts a control's value at `t` (0..1), or null for a control whose value
 * the stage cannot set directly.
 */
export function valuePatch(control, t) {
  const behavior = control?._children?.Behavior ?? null;
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  if (isSliderBehavior(behavior)) {
    const min = getSliderMin(behavior);
    const max = getSliderMax(behavior);
    return { valueOverrideEnabled: true, valueOverride: min + (max - min) * x };
  }
  if (isRangeBehavior(behavior)) {
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    return { valueOverrideEnabled: true, valueOverride: min + (max - min) * x };
  }
  return null;
}

/**
 * The steps that play one animation: `{ ok, steps: [{ label, session, hold }], exact, note }`, or
 * `{ ok: false, reason }`. Each step's `session` is a whole patch over REST_SESSION, so a step never
 * inherits a flag the previous one set; `hold` is how long to wait before the next step, in ms.
 */
export function playbackPlan(control, row, { timeScale = 1 } = {}) {
  if (!control || !row) return { ok: false, reason: 'Nothing to play.' };
  const trigger = row.trigger ?? readTrigger(row.animation ?? row);
  const span = spanOf(row, timeScale);
  const keyframes = row.kind === 'keyframes';

  if (keyframes && trigger.type === 'always') {
    return { ok: false, reason: 'It plays all the time — it is already playing on the stage.' };
  }
  if (keyframes && (trigger.type === 'beat' || trigger.type === 'script')) {
    // Nothing on the stage makes a beat or a script call happen, so Play asks for the animation
    // directly — exactly what ce.anim.play does.
    return { ok: true, request: true, steps: [], exact: true, note: '' };
  }

  if (trigger.type === 'stateChange') {
    const known = controlStateNames(control);
    const toAny = !trigger.to.length || trigger.to.includes(ANY_STATE);
    const fromName = firstNamed(trigger.from, known) ?? (trigger.from.includes(DEFAULT_STATE) ? DEFAULT_STATE : null);
    let toName = firstNamed(trigger.to, known);
    if (!toName && trigger.to.includes(DEFAULT_STATE)) toName = DEFAULT_STATE;
    if (!toName && toAny) toName = known.find((name) => name !== fromName) ?? null;
    if (!toName) {
      return { ok: false, reason: known.length
        ? `None of the states this animation goes to (${trigger.to.join(', ') || 'none'}) is one this control has.`
        : 'This control has no states, so a state animation has nothing to play.' };
    }
    const to = statePatch(control, toName);
    if (!to) return { ok: false, reason: `This control has no state called "${toName}".` };
    const toSession = implied(to.patch);

    // Where the change starts. A named From is entered as itself; "any" starts wherever the change
    // naturally comes from — the press from hover, the hover from rest.
    let fromSession;
    let fromLabel;
    let exact = to.exact;
    if (fromName) {
      const from = statePatch(control, fromName);
      fromSession = implied(from?.patch ?? {});
      fromLabel = fromName;
      exact = exact && (from?.exact ?? true);
    } else {
      fromSession = Object.fromEntries(Object.entries(toSession).filter(([key]) => !(key in to.patch)));
      fromLabel = Object.keys(fromSession).filter((key) => fromSession[key] === true).join(' + ') || DEFAULT_STATE;
    }

    // Channels a rule set are put back to their own values wherever the stage is not in the To
    // state, or the lamp lit for the change would still be lit on the way back.
    const touched = { ...(fromSession.customValues ?? {}), ...(toSession.customValues ?? {}) };
    const rest = Object.keys(touched).length ? channelDefaults(control, touched) : null;
    const at = (...sessions) => {
      const session = Object.assign({}, REST_SESSION, ...sessions);
      if (rest) session.customValues = Object.assign({}, rest, ...sessions.map((entry) => entry.customValues ?? {}));
      return session;
    };
    const steps = [
      { label: fromLabel, session: at(fromSession), hold: LEAD_MS },
      { label: toName, session: at(fromSession, toSession), hold: span + TAIL_MS },
    ];
    // A keyframe animation has no reverse — a loop stops, a one-shot has finished — but the stage still
    // goes back where it started, so the next Play begins from the same place.
    if (trigger.reverse || keyframes) steps.push({ label: `${fromLabel} again`, session: at(fromSession), hold: keyframes ? TAIL_MS : span + TAIL_MS });
    return {
      ok: true,
      steps,
      exact,
      note: exact ? '' : 'Part of a state\'s condition is beyond what the stage can set, so this is as close as it gets.',
    };
  }

  if (trigger.type === 'valueChange') {
    if (!/^value\./.test(trigger.source)) {
      return { ok: false, reason: `Play sweeps the control's own value; ${trigger.source} is not it. Move the control on the stage instead.` };
    }
    const low = valuePatch(control, 0.15);
    const high = valuePatch(control, 0.85);
    if (!low || !high) return { ok: false, reason: 'Play cannot set this control\'s value. Move it on the stage instead.' };
    // "Mine" is a change made while the person is on the control; "outside" one made while not.
    const on = trigger.origin === 'user' ? { hover: true } : {};
    return {
      ok: true,
      exact: true,
      note: '',
      steps: [
        { label: 'low', session: { ...REST_SESSION, ...on, ...low }, hold: LEAD_MS },
        { label: 'high', session: { ...REST_SESSION, ...on, ...high }, hold: span + TAIL_MS },
        { label: 'low again', session: { ...REST_SESSION, ...on, ...low }, hold: span + TAIL_MS },
      ],
    };
  }

  return { ok: false, reason: `Play does not know the trigger "${trigger.type}".` };
}
