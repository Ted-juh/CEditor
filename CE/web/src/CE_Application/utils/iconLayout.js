// iconLayout.js — the layout a control needs for an icon chosen on it to be drawn.
//
// Buttons and labels start out showing their text only (ContentLayout.mode `text_only`), and in
// that mode the renderer draws no icon (editor/CanvasControl.svelte, `hasIcon`). So choosing an
// icon stored it and drew nothing, and the picker looked broken — the icon only appeared once the
// author found the Content Layout tab. Choosing an icon now also picks a layout that shows it, when
// the control has none; a layout the author already chose is left alone.

export const TEXT_ONLY = 'text_only';

/**
 * The ContentLayout.mode to switch to when an icon is chosen on `control`, or null when it needs no
 * change. Beside the text when there is text, on its own when there is none. `stateName` is the
 * state being edited, whose own layout (a state patch) counts before the base one.
 */
export function layoutModeForIcon(control, stateName = '') {
  const layout = control?._children?.ContentLayout;
  if (!layout || typeof layout !== 'object') return null;
  const patched = stateName
    ? control?._children?.States?._children?.[stateName]?.patches?.component?.['ContentLayout.mode']
    : undefined;
  if (String(patched ?? layout.mode ?? TEXT_ONLY) !== TEXT_ONLY) return null;
  const text = String(control?._children?.Text?.content ?? '').trim();
  return text ? 'icon_left_text_right' : 'icon_only';
}
