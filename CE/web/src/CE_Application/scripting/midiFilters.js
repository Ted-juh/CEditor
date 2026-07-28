// midiFilters.js — the seam a script's MIDI filters sit in.
//
// `ce.midi.interceptIn` / `interceptOut` have to act on EVERY message, not just the ones a script
// sent or received. Inbound reaches the panel's bindings, the note input and the transport; outbound
// leaves from a control's own binding as often as from a script. Filtering only the scripting path
// would be a rule that holds for scripts and not for the panel — the same half-measure `ce.core
// .intercept` had to avoid.
//
// Both paths already have exactly one choke point:
//
//   inbound   deviceProfileSession.js  →  latestMidiInputMessage.set(...)
//   outbound  bridge.js                →  triggerRawMidiAction(...)
//
// Neither of those can import panelRuntime — the runtime imports both, so it would be a cycle. So
// this module holds the registration instead: panelRuntime puts its filters in, the two choke points
// call them, and nothing imports anything it did not already.
//
// Filters are stored, not stacked: the runtime keeps its own per-script list and installs ONE
// function here. Which script's rule wins, and in what order, is the runtime's business, not this
// module's.

let inbound = null;
let outbound = null;

/** Install the runtime's inbound filter. Pass null to remove it (a panel closing, a reset). */
export function setInboundMidiFilter(fn) { inbound = typeof fn === 'function' ? fn : null; }

/** Install the runtime's outbound filter. Pass null to remove it. */
export function setOutboundMidiFilter(fn) { outbound = typeof fn === 'function' ? fn : null; }

/** Is anything filtering? Lets a hot path skip the call entirely. */
export function hasMidiFilters() { return inbound !== null || outbound !== null; }

/**
 * Run the inbound filter over a message.
 * Returns the payload to deliver, or null to swallow it.
 *
 * A throwing filter passes the message through UNCHANGED rather than dropping it. A broken script
 * must not be able to silence a synth: the failure is reported by the runtime, and the MIDI keeps
 * flowing.
 */
export function filterInboundMidi(payload) {
  if (!inbound || !payload) return payload;
  try { return inbound(payload); } catch { return payload; }
}

/** The same, outbound. Returns the payload to send, or null to drop it. */
export function filterOutboundMidi(payload) {
  if (!outbound || !payload) return payload;
  try { return outbound(payload); } catch { return payload; }
}

/** Drop both filters. Called when the script set is torn down. */
export function clearMidiFilters() { inbound = null; outbound = null; }
