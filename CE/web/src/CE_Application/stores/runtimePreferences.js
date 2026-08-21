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
  showPreviewSelectionRing: true,
  // ON. It shipped off while the fold was new and its correctness rested on an argument rather than
  // on tests: a scripted panel folded nothing at all, and the editor's hover-hoisting had never been
  // driven by anything but a person. Both of those are now pinned — sceneryScripts.test.js for the
  // script case, sceneryFold.test.js for "the folded panel paints what the unfolded one paints", and
  // a browser check that bakes a real ground in a real Chromium.
  //
  // What it buys, measured on the panels in this repo: the AN1x renders 492 items instead of 783,
  // the GAIA 237 instead of 413. Preview has always folded, so leaving this off also meant the
  // editor and the preview were doing different work on the same panel.
  foldSceneryInEditor: true,
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
export const showPreviewSelectionRing = writable(DEFAULT_GENERAL_SETTINGS.showPreviewSelectionRing);
// Off by default. Folding scenery in the EDIT surface means a control you can see is not a control
// that exists, and selection, hover and drag all have to reach it by geometry instead. Preview
// folds unconditionally because nothing there can select anything; this is the half that has to
// earn its place on real panels first.
export const foldSceneryInEditor = writable(DEFAULT_GENERAL_SETTINGS.foldSceneryInEditor);
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
  showPreviewSelectionRing.set(settings.showPreviewSelectionRing);
  foldSceneryInEditor.set(settings.foldSceneryInEditor);
  insertOffset.set(settings.insertOffset);
  duplicateOffset.set(settings.duplicateOffset);
  keyboardNudgeSmall.set(settings.keyboardNudgeSmall);
  keyboardNudgeLarge.set(settings.keyboardNudgeLarge);
}
