/**
 * Every text field selects all of its text when it gets focus, so a click on a name or a value
 * is ready to type over. One action on a container covers every field inside it, including the
 * ones added later, instead of a handler on each input.
 *
 * The catch this handles: a mouse click focuses the field (and selects), then the mouse-up
 * places the caret and throws the selection away. So a focus that came from a pointer swallows
 * that one mouse-up. A second click in an already-focused field places the caret as usual.
 *
 * A field can opt out with data-keep-caret (a code editor, a long text you edit in the middle).
 */

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'number', '']);

/** Whether focus on this element should select its text. */
export function selectsOnFocus(element) {
  if (!element || element.dataset?.keepCaret !== undefined) return false;
  if (element.readOnly || element.disabled) return false;
  if (element.tagName === 'INPUT') return TEXT_TYPES.has((element.getAttribute('type') ?? '').toLowerCase());
  return false;
}

/** Svelte action: `use:selectAllOnFocus` on a container. */
export function selectAllOnFocus(root) {
  let pointerFocus = null;

  const onPointerDown = (event) => {
    const target = event.target;
    // Only a field that is not focused yet: clicking inside a focused field moves the caret.
    pointerFocus = selectsOnFocus(target) && document.activeElement !== target ? target : null;
  };
  const onFocusIn = (event) => {
    const target = event.target;
    if (!selectsOnFocus(target)) return;
    try { target.select(); } catch { /* a type that cannot select: leave the caret */ }
  };
  const onMouseUp = (event) => {
    if (pointerFocus && event.target === pointerFocus) event.preventDefault();
    pointerFocus = null;
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('mouseup', onMouseUp, true);
  return {
    destroy() {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('mouseup', onMouseUp, true);
    },
  };
}
