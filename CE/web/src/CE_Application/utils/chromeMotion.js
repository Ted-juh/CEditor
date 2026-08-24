/**
 * chromeMotion.js — the bookkeeping behind the workspace-swap transition.
 *
 * Review finding E4, remaining clause: tab-hopping from the panel editor to a
 * script, device profile, screen or component workspace replaces the context
 * bar, the tree, the dock and the properties panel in a single frame. The
 * persistent shell (rail, menubar, tab bar, status bar) landed earlier and is
 * deliberate; what was still missing is any sign that a change happened at all.
 * A frame-perfect swap of four regions reads as a glitch, not as navigation.
 *
 * WHY AN ENTRANCE AND NOT A CROSS-FADE. The regions are `{#if}` blocks, so the
 * outgoing ones are already unmounted by the time any transition could run, and
 * the alternative — keeping them mounted to animate their collapse — means the
 * editor canvas stays alive behind a workspace that has replaced it. So the
 * arriving frame animates and the departing one does not, which is what the eye
 * reads as "the app moved" anyway. It is an animation, never a gate: nothing is
 * disabled and no handler waits on it, so input during the 160ms lands exactly
 * as it would without it.
 *
 * WHY THE PHASE ALTERNATES. A CSS animation restarts when the animation NAME
 * changes, not when a counter attribute does. Two classes carrying two
 * identically-shaped keyframes, flipped on each swap, is what makes a second
 * workspace change in quick succession animate instead of sitting still because
 * the browser thinks it is already running that animation.
 *
 * Reduced motion is honoured in the stylesheet rather than here — a
 * `prefers-reduced-motion: reduce` block that drops the animation is one rule
 * the browser re-evaluates when the setting changes, where a JS snapshot read
 * at mount would not.
 */

/** Kept in step with the keyframes in App.svelte. */
export const WORKSPACE_SWAP_MS = 160;

/**
 * The class suffix for a given swap count. Empty before the first swap, so the
 * app does not animate its own startup — the first paint is not a transition
 * from anywhere.
 */
export function workspaceSwapPhase(swapCount) {
  const count = Number(swapCount);
  if (!Number.isFinite(count) || count <= 0) return '';
  return count % 2 === 1 ? 'a' : 'b';
}

/**
 * Fold one observed workspace kind into the swap counter.
 *
 * `previousKind` of null means "first observation" and never counts as a swap;
 * that is the difference between opening the app on a script tab and switching
 * to one.
 */
export function advanceWorkspaceSwap({ kind = null, previousKind = null, swapCount = 0 } = {}) {
  const count = Number.isFinite(Number(swapCount)) ? Number(swapCount) : 0;
  const changed = previousKind !== null && kind !== previousKind;
  return { swapCount: changed ? count + 1 : count, changed };
}
