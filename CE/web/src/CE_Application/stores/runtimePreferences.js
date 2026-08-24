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
  // OFF, and this one is a default rather than a preference in the usual sense. Checking for
  // updates sends this machine's IP address to GitHub — unremarkable, and still not something a
  // program should do on its own the first time somebody starts it. Help → Check for Updates works
  // whatever this says, because choosing it IS the consent. See utils/updateCheck.js.
  checkForUpdatesOnStartup: false,

  // --- Export defaults (export plan E5) -----------------------------------------------------
  // A global default each panel inherits and may override in its own Export tab. Empty strings
  // rather than invented values: a plausible-looking vendor name baked into somebody's plugin is
  // worse than a blank field they have to fill, because they never notice the first one.
  //
  // `exportManufacturerCode` is FOUR CHARACTERS because that is what VST/AU take, and the export
  // identity derives from the GUID rather than from this — so a wrong code is cosmetic, not a
  // collision. It is still validated on the way in, because a three-character code silently
  // padded is a plugin that identifies as something else.
  exportVendor: '',
  exportManufacturerCode: '',
  exportOutputDir: '',
  exportDefaultFormat: 'vst3',      // vst3 | standalone | both
  exportBackend: 'auto',            // auto | fast | recompile
};

/** What a manufacturer code may be: exactly four printable ASCII characters, first one upper. */
export function normalizeManufacturerCode(value) {
  const text = String(value ?? '').replace(/[^\x20-\x7E]/g, '').slice(0, 4);
  if (text.length === 0) return '';
  // Padded rather than refused — a partially typed code is the normal state of a text field — but
  // never silently: the editor shows the padded form back, so what is stored is what is seen.
  return (text[0].toUpperCase() + text.slice(1)).padEnd(4, ' ');
}

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
export const exportVendor = writable(DEFAULT_GENERAL_SETTINGS.exportVendor);
export const exportManufacturerCode = writable(DEFAULT_GENERAL_SETTINGS.exportManufacturerCode);
export const exportOutputDir = writable(DEFAULT_GENERAL_SETTINGS.exportOutputDir);
export const exportDefaultFormat = writable(DEFAULT_GENERAL_SETTINGS.exportDefaultFormat);
export const exportBackend = writable(DEFAULT_GENERAL_SETTINGS.exportBackend);

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
  exportVendor.set(settings.exportVendor ?? '');
  exportManufacturerCode.set(normalizeManufacturerCode(settings.exportManufacturerCode));
  exportOutputDir.set(settings.exportOutputDir ?? '');
  exportDefaultFormat.set(settings.exportDefaultFormat ?? 'vst3');
  exportBackend.set(settings.exportBackend ?? 'auto');
}
