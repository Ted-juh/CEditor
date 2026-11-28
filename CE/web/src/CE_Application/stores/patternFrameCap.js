/**
 * patternFrameCap.js — how often a moving pattern steps in this page: every frame the browser draws
 * (0, the editor's), or 30 times a second in a plug-in exported with the Export tab's "Moving patterns
 * at 30 frames a second" on (`exportSettings.patternFps`). The player sets it from the panel it loads
 * (Player.svelte); PatternLayers.svelte reads it. Measured at about 40 % less processor time for the
 * same patterns in Chromium and WebKitGTK (tools/scripts/measure-loop-budget.mjs).
 */
import { writable } from 'svelte/store';

export const patternFrameCap = writable(0);

/** The cap a panel's export settings ask for: 30, or 0 for every frame. */
export function frameCapFor(exportSettings) {
  return Number(exportSettings?.patternFps) === 30 ? 30 : 0;
}
