// liveValue.js — one answer to "where does a control's current value live".
//
// It lives in the preview session, not in the document. A control's position is runtime state: the
// user drags it, inbound MIDI moves it, a script sets it, and none of that is a fact about how the
// panel was authored. The renderer already reads it from there
// (utils/interactionRuntime.js: `previewSession?.valueOverrideEnabled ? valueOverride : defaultValue`).
//
// This module exists because that answer used to be given twice, differently:
//
//   • the exported player routed `.value` writes to the session, so set("Cutoff.value", 8000) moved
//     the knob and drove host-parameter sync;
//   • the editor had no host, so the same call fell through to a document write at `Value.value` —
//     a key Knob and Slider do not have at all (so the write was REFUSED), and which Button has a
//     section for but no such field (so it landed as a fresh key that nothing reads).
//
// The result was the API's most-documented call working in the shipped plugin and doing nothing in
// the preview the author was testing in. Both runtimes now import from here, so they cannot drift
// apart again.
//
// What this does NOT do is make every `.value` write legal. A control with no Behavior section has
// no value in this sense — a Label, a Container, and the components (Ribbon, Macro, Crossfader,
// Envelope, Meter) whose values live in their own sections and are driven by their own
// ce.components.* verbs. Those keep falling through to the document write, which reports honestly
// that the path leads nowhere and points at ce.panel.info(). Silently accepting a write that moves
// nothing is what this module is fixing, so it must not introduce a second one.

import { resolveInteractionContext } from '../utils/interactionRuntime.js';
import { constrainCustomValues } from '../utils/customComponentInteraction.js';

/**
 * Is this resolved model path a control's live value?
 *
 * Takes the path AFTER shorthand resolution, so `value` has already become `Value.value`. Both
 * spellings are matched because both reach here: the shorthand from a script, and the raw path
 * from a host that was handed one.
 */
export function isLiveValuePath(modelPath) {
  const p = String(modelPath ?? '').toLowerCase();
  return p === 'value' || p === 'value.value' || p.endsWith('.currentvalue');
}

/**
 * Does this control HAVE a live value?
 *
 * The Behavior section is what the interaction runtime resolves a value from, so its presence is
 * the same question asked the same way. Controls without one are either decorative or components
 * that own their value in their own section.
 */
export function hasLiveValue(control) {
  return control?._children?.Behavior != null;
}

/**
 * The value channel a model path addresses on a custom component, or null.
 *
 * A CustomComponent has no `Behavior`; it keeps its values in `ValueChannels`, one per named
 * channel, and `channelizePath` already rewrites a path landing on one to end in `.currentValue`.
 * So `ValueChannels._children.arpPattern.currentValue` -> `arpPattern`.
 */
export function customChannelOfPath(control, modelPath) {
  const channels = control?._children?.ValueChannels?._children;
  if (!channels) return null;

  // BOTH spellings, because the runtime produces both. walkCaseInsensitive joins only the key names
  // it walked ("ValueChannels.arpPattern.currentValue") while a path written out by hand or by the
  // shorthand fallback carries the `_children` hop. valueAtPath accepts either, so this has to as
  // well — matching only one of them is a bug that shows up on exactly half the channels.
  const parts = String(modelPath ?? '').split('.').filter((seg) => seg !== '_children');
  if (parts.length !== 3) return null;
  const [section, name, leaf] = parts;
  if (section !== 'ValueChannels' || leaf !== 'currentValue') return null;
  return name in channels ? name : null;
}

/**
 * Does a READ of this path have somewhere live to read from?
 *
 * Deliberately separate from hasLiveValue, which the WRITE paths use. A custom component's channel
 * is live to read — the session holds what the screen is showing — but writing one is not the same
 * operation as writing a native control's value: liveValuePatch sets `valueOverride`, a single
 * unnamed value, which for a named channel would move the wrong thing. Widening the shared
 * predicate would have quietly rerouted every set() on a custom component into that. So reads widen
 * and writes do not, and the write side keeps going through the document exactly as it did.
 */
export function readsLiveValue(control, modelPath) {
  if (isLiveValuePath(modelPath) && hasLiveValue(control)) return true;
  return customChannelOfPath(control, modelPath) != null;
}

/** The session patch that moves a control to `value`. Both handles, as the player has always written. */
export function liveValuePatch(value) {
  return {
    valueOverrideEnabled: true,
    valueOverride: value,
    currentValueOverrideEnabled: true,
    currentValueOverride: value,
  };
}

/**
 * Read a control's live value: what it is showing right now.
 *
 * The session override if something has moved it, and otherwise the value the control resolves to
 * on its own — which is what the renderer draws, and therefore the honest answer to "what is this
 * control set to". Both runtimes used to answer `undefined` for a control nobody had touched yet,
 * because they read the document at a path that holds nothing.
 */
export function readLiveValue(sessions, control, modelPath = null) {
  const session = sessions?.[String(control?._children?.Core?.id ?? '')];

  // A named channel on a custom component answers for ITSELF, not for the component's main value.
  // The resolution order is interactionRuntime's own — the session's customValues, then the
  // channel's currentValue, then its default — so a script and the screen cannot disagree about
  // what the channel holds. constrainCustomValues is what turns raw session state into that,
  // including the arpeggiator's derived channels.
  const channelName = customChannelOfPath(control, modelPath);
  if (channelName) {
    const declared = control._children.ValueChannels._children[channelName];
    const values = constrainCustomValues(control, session?.customValues ?? {});
    return values?.[channelName] ?? declared?.currentValue ?? declared?.defaultValue;
  }

  if (session?.valueOverrideEnabled) return session.valueOverride;
  if (session && 'currentValueOverride' in session && session.currentValueOverrideEnabled) {
    return session.currentValueOverride;
  }
  // No override: ask the same resolver the renderer uses. `valueRaw` is the drawn value for every
  // family — range, select, bool — so a script and the screen cannot disagree.
  try {
    const resolved = resolveInteractionContext(control, session ?? {});
    return resolved?.valueRaw;
  } catch {
    return undefined;
  }
}
