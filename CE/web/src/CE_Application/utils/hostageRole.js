/**
 * What only the HoSTage editor does, as the browser preview's copy of the host's own list
 * (isEditorOnlyCommand in InstrumentHostService.cpp, which is the one that counts in the app).
 * A player — installed as one, or the editor trying its show as one — makes no screens, control
 * pages or controller descriptions, and does not build; everything else it keeps, and Stage Lock
 * restricts as before. docs/design/hostage-creator-editor-player.md has the reasoning;
 * test/hostagePlayerRole.test.js reads the native list and fails when the two drift apart.
 */
export const EDITOR_ONLY_COMMANDS = new Set([
  'addControlPage', 'removeControlPage', 'renameControlPage', 'generateControlPages',
  'setControlPagePreset', 'assignControlSlot', 'assignSurfaceControl', 'clearControlSlot',
  'learnControlSlotParameter', 'quickLearnParameter', 'setFaderLayers', 'setPadLayers',
  'setUserSurface', 'clearUserSurface', 'learnUserSurface', 'finishUserSurfaceLearn',
  'setHostProject', 'buildHostProduct', 'createPlayer',
]);

/** A slot's options a player may not set: what the page shows and how the knob maps. How the
 *  physical control sends MIDI (midiPickup, midiRelative, midiRelativeFormat) it may. */
export const EDITOR_ONLY_SLOT_OPTIONS = ['rangeMin', 'rangeMax', 'inverted', 'bipolar', 'toggle',
  'steps', 'label', 'colour'];

export function editorOnlyCommand(payload) {
  const cmd = String(payload?.cmd ?? '');
  if (EDITOR_ONLY_COMMANDS.has(cmd)) return true;
  return cmd === 'setControlSlotOptions'
    && EDITOR_ONLY_SLOT_OPTIONS.some((field) => payload != null && field in payload);
}

/** The host's refusal, word for word, so the preview reads like the app. */
export function editorOnlyRefusal(cmd) {
  if (cmd === 'setHostProject' || cmd === 'buildHostProduct' || cmd === 'createPlayer') {
    return 'Building belongs to the HoSTage editor; a player cannot build.';
  }
  return `Screens and control pages are made in the HoSTage editor; a player shows them and cannot change them ('${cmd}').`;
}
