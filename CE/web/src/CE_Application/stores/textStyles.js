// textStyles.js — the commands behind the Text dock's Style bar (utils/textStyles.js has the model).
//
// Every command is one undo step, named, however many controls it reaches: changing the headings
// style and undoing it puts all twelve headings back at once, which is the whole point of having
// the style.

import { get } from 'svelte/store';
import { panels, resolvedActivePanelId, updatePanel } from './panels.js';
import { applyControlPatchesById } from './controls.js';
import { beginHistoryTransaction, commitHistoryTransaction } from './history.js';
import { flatControls } from '../utils/containment.js';
import {
  captureTextStyle, newTextStyleId, styleOf, textSectionOf, textStylePatch, unusedTextStyleName,
} from '../utils/textStyles.js';

function currentPanel() {
  const id = get(resolvedActivePanelId);
  return get(panels).find((panel) => panel.id === id) ?? null;
}

const idOf = (control) => String(control?._children?.Core?.id ?? '');

function controlsWithText(panel, ids) {
  const wanted = new Set([...(ids ?? [])].map(String));
  return flatControls(panel?.controls ?? []).filter((control) => wanted.has(idOf(control)) && textSectionOf(control));
}

/** The controls whose text uses `styleId`. */
export function textStyleUsers(panel, styleId) {
  return flatControls(panel?.controls ?? []).filter((control) => String(textSectionOf(control)?.textStyle ?? '') === styleId);
}

function step(label, change) {
  const transaction = beginHistoryTransaction({ label });
  try {
    return change();
  } finally {
    commitHistoryTransaction(transaction);
  }
}

function writeStyles(panel, styles) {
  updatePanel(panel.id, { textStyles: styles });
}

function patchAll(panel, controls, patchFor) {
  const patches = new Map();
  for (const control of controls) {
    const patch = patchFor(control);
    if (patch && Object.keys(patch).length) patches.set(idOf(control), patch);
  }
  // The patches carry their own Core.setOverrides (textStylePatch), so nothing is pinned here.
  if (patches.size) applyControlPatchesById(patches, panel.id);
}

/** A new style from a control's text as it is now, used by that control. Returns the style. */
export function createTextStyleFrom(controlId, name) {
  const panel = currentPanel();
  const [control] = controlsWithText(panel, [controlId]);
  if (!panel || !control) return null;
  const styles = panel.textStyles ?? [];
  const styleName = unusedTextStyleName(name, styles);
  const style = { id: newTextStyleId(styleName, styles), name: styleName, ...captureTextStyle(control) };
  step(`New text style "${style.name}"`, () => {
    writeStyles(panel, [...styles, style]);
    patchAll(panel, [control], () => ({ 'Text.textStyle': style.id }));
  });
  return style;
}

/** Give these controls' text the style: its values, and the link that keeps them following it. */
export function applyTextStyle(styleId, controlIds) {
  const panel = currentPanel();
  const style = (panel?.textStyles ?? []).find((entry) => entry.id === styleId);
  if (!panel || !style) return 0;
  const controls = controlsWithText(panel, controlIds);
  step(`Apply text style "${style.name}"`, () => patchAll(panel, controls, (control) => textStylePatch(style, control, style.id)));
  return controls.length;
}

/**
 * Make the style what this control's text is now, and give it to every other control using it:
 * the "change one, all follow" of it. Returns how many other controls changed.
 */
export function updateTextStyleFrom(controlId) {
  const panel = currentPanel();
  const [control] = controlsWithText(panel, [controlId]);
  const style = styleOf(control, panel?.textStyles);
  if (!panel || !style) return 0;
  const updated = { ...style, ...captureTextStyle(control) };
  const others = textStyleUsers(panel, style.id).filter((user) => idOf(user) !== controlId);
  step(`Update text style "${style.name}"`, () => {
    writeStyles(panel, (panel.textStyles ?? []).map((entry) => (entry.id === style.id ? updated : entry)));
    patchAll(panel, others, (user) => textStylePatch(updated, user));
  });
  return others.length;
}

/** Put these controls' text back to the style they use. */
export function resetToTextStyle(controlIds) {
  const panel = currentPanel();
  if (!panel) return;
  const controls = controlsWithText(panel, controlIds).filter((control) => styleOf(control, panel.textStyles));
  step('Reset text to its style', () => patchAll(panel, controls, (control) => textStylePatch(styleOf(control, panel.textStyles), control)));
}

/** Stop these controls following their style; their text keeps the look it has. */
export function detachTextStyle(controlIds) {
  const panel = currentPanel();
  if (!panel) return;
  const controls = controlsWithText(panel, controlIds).filter((control) => textSectionOf(control)?.textStyle);
  step('Detach text style', () => patchAll(panel, controls, () => ({ 'Text.textStyle': '' })));
}

export function renameTextStyle(styleId, name) {
  const panel = currentPanel();
  const styles = panel?.textStyles ?? [];
  const style = styles.find((entry) => entry.id === styleId);
  const wanted = String(name ?? '').trim();
  if (!panel || !style || !wanted || wanted === style.name) return;
  const others = styles.filter((entry) => entry.id !== styleId);
  step(`Rename text style "${style.name}"`, () => writeStyles(panel, styles.map((entry) => (entry.id === styleId ? { ...entry, name: unusedTextStyleName(wanted, others) } : entry))));
}

/** Delete a style. The controls that used it keep their look and stop following anything. */
export function deleteTextStyle(styleId) {
  const panel = currentPanel();
  const styles = panel?.textStyles ?? [];
  const style = styles.find((entry) => entry.id === styleId);
  if (!panel || !style) return;
  const users = textStyleUsers(panel, styleId);
  step(`Delete text style "${style.name}"`, () => {
    patchAll(panel, users, () => ({ 'Text.textStyle': '' }));
    writeStyles(panel, styles.filter((entry) => entry.id !== styleId));
  });
}
