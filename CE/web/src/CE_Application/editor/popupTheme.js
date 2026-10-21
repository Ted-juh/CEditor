// popupTheme.js — the colours a code editor popup is drawn in, carried to it when it is moved out of
// the editor (CodeEditor.svelte's portal).
//
// The editor moves its popups (the hover card, the signature hint, the completion list, the rename
// box, Go to symbol) to <body>, so that no ancestor's overflow clips them and no transformed one
// becomes the containing block of their fixed position. Their CSS reads the host's theme (--panel-2,
// --line-2, --txt… are set on the script editor's .bd-app) and the editor's own (--ce-fs, on .ce),
// and at <body> neither reaches them: every popup was drawn with no background and no border, so the
// signature hint read as stray text over the line above, and the completion list over the code under
// it. The values are read where the editor is and set on the popup, so it is drawn as it is styled,
// in whichever host and theme the editor is in.

/** Every custom property the portaled popups' CSS reads. test/popupTheme.test.js holds this list to
 *  CodeEditor.svelte's styles, so one added there and not here fails. */
export const POPUP_VARS = Object.freeze([
  '--accent', '--accent-dim', '--amber', '--bg-2', '--blue', '--ce-fs', '--line', '--line-2', '--mono',
  '--panel-2', '--txt', '--txt-dim', '--txt-faint',
]);

/** Set on `node` the value each of POPUP_VARS has at `from` (the editor), where it has one. */
export function carryPopupTheme(node, from) {
  if (!node || !from || typeof getComputedStyle !== 'function') return;
  const style = getComputedStyle(from);
  for (const name of POPUP_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) node.style.setProperty(name, value);
  }
}
