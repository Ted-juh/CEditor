// scriptTouchedControls.js — controls a script has written to, which therefore stop being folded.
//
// WHY THIS EXISTS, given that folding a scripted panel is already correct.
//
// The scenery ground is baked from the control document and re-baked whenever that document
// changes (see sceneryFingerprint). Every script write to a control that COULD be folded lands in
// the document: setValue's other two doors are the player host and the live-value/channel path, and
// the live path needs a `Value` or `ValueChannels` section — which is a dynamic section, which
// means the control was never scenery in the first place. So a script setting a folded label's
// text, colour or visibility re-bakes the ground and the change appears. That is pinned by
// sceneryScripts.test.js rather than argued from here.
//
// What is NOT fine is the RATE. A bake mounts every control in the ground into a detached node and
// reads its markup back; an animation driving one folded label writes the document sixty times a
// second, and each of those writes would re-bake the other two hundred. Correct, and unusable.
//
// So a control a script has written to leaves the ground and stays out of it. The first write pays
// one bake; every write after it is an ordinary reactive update to an ordinary live control.
//
// WHY OBSERVED AND NOT PREDICTED. The obvious alternative is to read the scripts and fold whatever
// they demonstrably never name. That cannot be made sound. `ce.panel.restore(snapshot)` takes its
// control ids as the KEYS of a runtime object — commonly one loaded from storage — so the ids need
// never appear in the source at all. `ce.panel.each`, `ce.panel.find()`, `ce.panel.snapshot()` and
// `on("*", …)` all reach every control on the panel without naming one. A source scan would have to
// give up on any script using those, which is most real scripts, and would be quietly wrong on the
// rest the first time somebody built an id by concatenation. Watching what the runtime actually
// does needs none of that, and is right for Lua and Python too, where there is no parser to reach
// for.
//
// SESSION-LIVED, deliberately. Nothing here is written to the panel — it is a fact about what has
// happened so far, not about the document, and persisting it would be persisting a guess. The cost
// of forgetting is one bake the next time the script runs.

import { writable } from 'svelte/store';

/** Ids of controls the script runtime has written to since the panel was opened. */
export const scriptTouchedControlIds = writable(new Set());

/**
 * Remember that a script wrote to this control.
 *
 * A no-op for an id already in the set, which is the hot path: an animation calls this on every
 * frame, and a store write per frame would be the churn this exists to prevent.
 */
export function noteScriptTouchedControl(id) {
  if (id == null) return;
  const key = String(id);
  if (key === '') return;
  scriptTouchedControlIds.update((current) => {
    if (current.has(key)) return current;          // same Set object: no subscriber runs
    const next = new Set(current);
    next.add(key);
    return next;
  });
}

/** Called when the panel changes, and by tests. */
export function clearScriptTouchedControls() {
  scriptTouchedControlIds.set(new Set());
}
