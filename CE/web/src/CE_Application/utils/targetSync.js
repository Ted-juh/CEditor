/**
 * Sync-from-external-target effect helper used by DisplayPanel.
 *
 * Both color and gradient "targets" (swatches bound to remote properties)
 * share a pattern: when a target becomes active, switch to the relevant tab
 * and copy the target's initial value into local editing state — but only
 * the FIRST time we see that target, not on every reactive re-run.
 *
 * A plain { current: null } ref is used for guard state instead of $state
 * so it doesn't become a reactive dependency of the effect.
 *
 * Call signature:
 *   syncExternalTarget(target, guardRef, hasInitial, apply)
 *
 *   target       — the current target value (may be null)
 *   guardRef     — { current: ... }  — mutated to remember last-handled
 *   hasInitial   — (target) => boolean  — does target carry an initial value?
 *   apply        — (target) => void  — called once when a new target arrives
 */
export function syncExternalTarget(target, guardRef, hasInitial, apply) {
  if (target && hasInitial(target) && target !== guardRef.current) {
    guardRef.current = target;
    apply(target);
  }
  if (!target) guardRef.current = null;
}
