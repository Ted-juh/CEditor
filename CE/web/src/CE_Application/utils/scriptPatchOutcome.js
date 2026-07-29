// scriptPatchOutcome.js — telling "already that" apart from "I will not do that".
//
// The component reducers return a patch of section fields, and an EMPTY patch for two situations a
// script badly needs to distinguish:
//
//   · the value asked for is the value already held — the call did its job
//   · the value asked for is one this component does not have — the call did nothing
//
// Both used to be one silent `{}`, and every component verb returned `undefined` on top of it, so
// `arpPattern(a, "converge")` and `arpPattern(a, "up")` on an arp already set to "up" were
// indistinguishable to the script AND to the person reading the console.
//
// This is the marker for the first case. A reducer returns UNCHANGED where it has decided the
// request is fine and there is simply nothing to write; everything else keeps returning `{}` for a
// refusal, so no reducer had to be rewritten to gain the distinction — only the handful of places
// that were already comparing against the current value.

/** "Your request is accepted; the model already holds it." Frozen, and compared by identity. */
export const UNCHANGED = Object.freeze({});

/** The patch a reducer result carries — UNCHANGED and a refusal both carry none. */
export function patchOf(result) {
  return result === UNCHANGED || !result || typeof result !== 'object' ? {} : result;
}

/** Whether a reducer result means "accepted, nothing to write". */
export function isUnchanged(result) {
  return result === UNCHANGED;
}
