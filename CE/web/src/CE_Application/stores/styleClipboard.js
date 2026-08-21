import { get, writable } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentIds } from './panels.js';
import { pushSnapshot } from './history.js';
import { deepClone } from '../utils/deepClone.js';
import { findControlById, mapControlsTree } from '../utils/containment.js';

/**
 * Format painter: copy one control's APPEARANCE and apply it to any
 * selection. Style is how a control looks — Background (fill, border,
 * corners), Text styling (minus the words), Icon, Effects. What it does
 * (Behavior/Value/Bindings/Scripts) and where it sits (Transform/Core)
 * are deliberately not style.
 */
const STYLE_SECTIONS = ['Background', 'Text', 'Icon', 'Effects'];

/** { sourceType, sections } | null — reactive so menus can enable on it. */
export const styleClipboard = writable(null);

/**
 * Capture the style of a control (default: the first selected one).
 * @returns {boolean} whether a style was captured
 */
export function copyControlStyle(controlId = null) {
  const panel = get(panels).find((p) => p.id === get(resolvedActivePanelId));
  if (!panel) return false;

  const id = controlId ?? [...get(selectedComponentIds)][0];
  const control = id != null ? findControlById(panel.controls, id) : null;
  if (!control) return false;

  const sections = {};
  for (const name of STYLE_SECTIONS) {
    const section = control._children?.[name];
    if (section) sections[name] = deepClone(section);
  }
  if (Object.keys(sections).length === 0) return false;

  // The text CONTENT is the control's own words, not styling.
  if (sections.Text) sections.Text.content = null;

  styleClipboard.set({
    sourceType: control._children?.Core?.controlType ?? '',
    sections,
  });
  return true;
}

/**
 * Apply the copied style to every selected control. Sections the target
 * type doesn't have are skipped — pasting a knob's style onto a label
 * applies what a label can wear and ignores the rest.
 * @returns {number} how many controls changed
 */
export function applyStyleToSelection() {
  const clip = get(styleClipboard);
  const ids = get(selectedComponentIds);
  const panelId = get(resolvedActivePanelId);
  if (!clip || ids.size === 0 || panelId == null) return 0;

  let applied = 0;

  panels.update((list) =>
    list.map((p) => {
      if (p.id !== panelId) return p;

      const controls = mapControlsTree(p.controls, (ctrl) => {
        if (!ids.has(ctrl._children?.Core?.id)) return ctrl;

        const nextChildren = { ...ctrl._children };
        let changed = false;
        for (const [name, styled] of Object.entries(clip.sections)) {
          if (!nextChildren[name]) continue;
          const replacement = deepClone(styled);
          if (name === 'Text') replacement.content = nextChildren.Text?.content ?? '';
          nextChildren[name] = replacement;
          changed = true;
        }
        if (!changed) return ctrl;
        applied++;
        return { ...ctrl, _children: nextChildren };
      });

      return applied > 0 ? { ...p, controls, modified: true } : p;
    })
  );

  if (applied > 0) pushSnapshot();   // one paste-style, one undo step
  return applied;
}
