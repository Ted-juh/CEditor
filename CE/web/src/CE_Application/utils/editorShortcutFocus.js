import { isTextEntryTarget } from './textEntry.js';

// Canvas selection shortcuts must not steal keys from controls in the editor chrome. In
// particular, Tab, Delete and arrows have native meanings on dock tabs, lists and buttons.
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a[href], summary, '
  + '[contenteditable="true"], [role="button"], [role="tab"], [role="radio"], '
  + '[role="switch"], [role="option"], [role="listbox"], [role="combobox"], '
  + '[role="menuitem"], [role="slider"]';

export function isEditorShortcutFocus(target, { allowPageBody = false, allowTree = false } = {}) {
  if (!target || isTextEntryTarget(target)) return false;
  if (target.closest?.(INTERACTIVE_SELECTOR)) return false;

  const tag = String(target.tagName ?? '').toUpperCase();
  if (allowPageBody && (tag === 'BODY' || tag === 'HTML')) return true;
  if (target.classList?.contains('editor-wrapper')) return true;
  if (target.closest?.('.canvas-viewport')) return true;
  if (allowTree && target.closest?.('.tree-list')) return true;
  return false;
}

const SURFACE_ACTIVATION_SELECTOR = 'button, a[href], summary, [role="button"], '
  + '[role="checkbox"], [role="switch"]';
const SURFACE_NAVIGATION_SELECTOR = '[role="tab"], [role="radio"], [role="option"], '
  + '[role="listbox"], [role="combobox"], [role="menuitem"], [role="slider"], [role="spinbutton"]';

/**
 * Keep only the keys an interactive target itself owns. A focused layer button still needs the
 * surface's Delete, Escape, nudge and tool-letter shortcuts; Space/Enter/Tab remain native UI.
 */
export function isSurfaceEditorShortcutAllowed(event) {
  const target = event?.target;
  if (!target || isTextEntryTarget(target)) return false;

  const key = String(event?.key ?? '');
  const activationKey = key === 'Enter' || key === ' ' || event?.code === 'Space';
  if ((activationKey || key === 'Tab') && target.closest?.(SURFACE_ACTIVATION_SELECTOR)) return false;

  if (target.closest?.(SURFACE_NAVIGATION_SELECTOR)) {
    if (activationKey || key === 'Tab' || key === 'Home' || key === 'End' || key.startsWith('Arrow')) {
      return false;
    }
  }
  return true;
}
