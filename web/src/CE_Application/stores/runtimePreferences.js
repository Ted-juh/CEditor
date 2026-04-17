import { writable } from 'svelte/store';

export const DEFAULT_GENERAL_SETTINGS = {
  reopenLastSession: true,
  autosaveEnabled: true,
  autosaveIntervalSeconds: 20,
  restoreUnsavedWork: true,
  defaultSnapToGrid: true,
  defaultGridSize: 10,
  showRulers: true,
  showGuides: true,
  showDistances: true,
  insertOffset: 20,
  duplicateOffset: 20,
  keyboardNudgeSmall: 1,
  keyboardNudgeLarge: 10,
};

export const reopenLastSession = writable(DEFAULT_GENERAL_SETTINGS.reopenLastSession);
export const autosaveEnabled = writable(DEFAULT_GENERAL_SETTINGS.autosaveEnabled);
export const autosaveIntervalSeconds = writable(DEFAULT_GENERAL_SETTINGS.autosaveIntervalSeconds);
export const restoreUnsavedWork = writable(DEFAULT_GENERAL_SETTINGS.restoreUnsavedWork);
export const defaultSnapToGrid = writable(DEFAULT_GENERAL_SETTINGS.defaultSnapToGrid);
export const defaultGridSize = writable(DEFAULT_GENERAL_SETTINGS.defaultGridSize);
export const showRulers = writable(DEFAULT_GENERAL_SETTINGS.showRulers);
export const showGuides = writable(DEFAULT_GENERAL_SETTINGS.showGuides);
export const showDistances = writable(DEFAULT_GENERAL_SETTINGS.showDistances);
export const insertOffset = writable(DEFAULT_GENERAL_SETTINGS.insertOffset);
export const duplicateOffset = writable(DEFAULT_GENERAL_SETTINGS.duplicateOffset);
export const keyboardNudgeSmall = writable(DEFAULT_GENERAL_SETTINGS.keyboardNudgeSmall);
export const keyboardNudgeLarge = writable(DEFAULT_GENERAL_SETTINGS.keyboardNudgeLarge);

export function applyGeneralSettingsToRuntime(settings) {
  reopenLastSession.set(settings.reopenLastSession);
  autosaveEnabled.set(settings.autosaveEnabled);
  autosaveIntervalSeconds.set(settings.autosaveIntervalSeconds);
  restoreUnsavedWork.set(settings.restoreUnsavedWork);
  defaultSnapToGrid.set(settings.defaultSnapToGrid);
  defaultGridSize.set(settings.defaultGridSize);
  showRulers.set(settings.showRulers);
  showGuides.set(settings.showGuides);
  showDistances.set(settings.showDistances);
  insertOffset.set(settings.insertOffset);
  duplicateOffset.set(settings.duplicateOffset);
  keyboardNudgeSmall.set(settings.keyboardNudgeSmall);
  keyboardNudgeLarge.set(settings.keyboardNudgeLarge);
}
