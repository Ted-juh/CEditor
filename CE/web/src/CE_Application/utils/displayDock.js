/**
 * displayDock.js — how tall the bottom dock is allowed to be, who gets to say so,
 * and which tab an action implies.
 *
 * Review findings B8 and B9. The dock used to answer "how tall?" with a table of
 * per-tab constants that it applied on every tab click: Colors 480, Gradient 580.
 * Three separate things were wrong with that, and they compounded:
 *
 *   1. It overwrote a height the user had just dragged. Drag the dock to 240,
 *      click Gradient, and it jumped back to 580 — the canvas relayouting under
 *      the pointer in the middle of a task.
 *   2. App.svelte then PERSISTED the snapped value, so the user's own height was
 *      gone for good, not merely overridden for the session.
 *   3. The ceiling was 44% of the viewport, and the auto-applied defaults sat
 *      right at it on a 1080p screen — so the most common thing the dock did was
 *      take nearly half the window to show a colour picker.
 *
 * The policy here inverts the priority. A height the user has set wins, always
 * and permanently; the per-tab numbers are a FIRST-RUN suggestion for someone who
 * has never touched the splitter, and they are now sized to the content rather
 * than to a fraction of the screen. The ceiling stops being a statement about how
 * big a colour picker should be and becomes what a ceiling is for: a rail that
 * keeps the canvas from being squeezed out of existence. Drag it as tall as you
 * like — that is your call, not the dock's.
 */

/** Matches the splitter's own lower bound (App.svelte's displayResizeScrub). */
export const DISPLAY_DOCK_MIN_HEIGHT = 80;

/**
 * Pixels of editor that must survive above the dock. The old rule was a
 * percentage, which is the wrong shape: 44% of a 2160px display is 950px of
 * dock nobody asked for, and 44% of a 768px laptop still leaves the canvas
 * unusable. What actually matters is that some canvas is left.
 */
export const DISPLAY_DOCK_CANVAS_RESERVE = 260;

/** Absolute floor for the ceiling, for viewports too short for the reserve. */
export const DISPLAY_DOCK_MIN_CEILING = 140;

/**
 * First-run heights, by tab. Sized to what the tab actually needs to be usable
 * (the colour chooser's bands have a 120px minimum and the sidebar rides
 * alongside), not to a fraction of the window. Only ever applied to a dock the
 * user has never resized.
 */
export const DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS = { colors: 320, gradient: 380 };

/** Tallest the dock may be on this viewport. */
export function maxDisplayDockHeight(viewportHeight) {
  const height = Number(viewportHeight);
  if (!Number.isFinite(height) || height <= 0) return DISPLAY_DOCK_MIN_CEILING;
  return Math.max(DISPLAY_DOCK_MIN_CEILING, Math.floor(height - DISPLAY_DOCK_CANVAS_RESERVE));
}

export function clampDockHeight(height, viewportHeight) {
  const max = maxDisplayDockHeight(viewportHeight);
  const numeric = Number(height);
  const safe = Number.isFinite(numeric) ? Math.round(numeric) : DISPLAY_DOCK_MIN_HEIGHT;
  return Math.min(max, Math.max(DISPLAY_DOCK_MIN_HEIGHT, safe));
}

/**
 * The height the dock should have after switching to `tabId`.
 *
 * `userSized` is the whole point: once the user has dragged the splitter even
 * once, this function stops having opinions and only clamps. Pass the flag
 * through from persistence, not from session state — a preference the app
 * forgets on restart is not a preference.
 */
export function resolveDockHeight({
  tabId = null,
  currentHeight = DISPLAY_DOCK_MIN_HEIGHT,
  userSized = false,
  viewportHeight = 0,
} = {}) {
  if (userSized) return clampDockHeight(currentHeight, viewportHeight);
  const preferred = DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS[tabId];
  if (preferred == null) return clampDockHeight(currentHeight, viewportHeight);
  return clampDockHeight(preferred, viewportHeight);
}

/**
 * Which tab the dock should be showing, given what just happened.
 *
 * B9's last clause: the dock reopened on whatever tab was last active, so
 * clicking a colour chip could land you in the MIDI monitor for a frame — or
 * for good, if the target sync lost a race. An action that opens the dock knows
 * what it wants to show; a bare toggle does not, and only then does the last
 * tab get to decide. An explicit request outranks a target because a request is
 * someone naming the tab out loud (the canvas context menu's "Align…").
 */
export function impliedDockTab({
  tabRequest = null,
  gradientTarget = null,
  colorTarget = null,
  lastTab = 'colors',
} = {}) {
  if (tabRequest?.tab) return tabRequest.tab;
  if (gradientTarget) return 'gradient';
  if (colorTarget) return 'colors';
  return lastTab;
}
