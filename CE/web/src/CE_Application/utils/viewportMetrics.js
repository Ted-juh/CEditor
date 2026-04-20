/**
 * Track a scrollable viewport element's scroll offset, client size, and the
 * offset of an inner content element (panel surface) within that viewport.
 * Mutates the supplied `state` object with `scrollLeft`, `scrollTop`,
 * `width`, `height`, `contentLeft`, and `contentTop` whenever the element
 * scrolls or any tracked element resizes.
 *
 * `contentLeft`/`contentTop` are the panel surface's offsetLeft/offsetTop
 * relative to the viewport's content box — this changes as the panel is
 * re-centered (e.g. zoom changes the panel size, or the viewport resizes).
 *
 * Returns a teardown function that removes the listeners — call it from
 * your effect's cleanup.
 *
 *   state        — { scrollLeft, scrollTop, width, height, contentLeft, contentTop } (mutated)
 *   getViewport  — () => HTMLElement | null
 *   getContent   — () => HTMLElement | null   (optional — panel surface)
 *
 * Usage:
 *   let metrics = $state({ scrollLeft: 0, scrollTop: 0, width: 0, height: 0, contentLeft: 40, contentTop: 40 });
 *   $effect(() => trackViewportMetrics(metrics, () => viewportEl, () => panelSurfaceEl));
 */
export function trackViewportMetrics(state, getViewport, getContent) {
  const el = getViewport();
  if (!el) return () => {};

  const sync = () => {
    state.scrollLeft = el.scrollLeft;
    state.scrollTop = el.scrollTop;
    state.width = el.clientWidth;
    state.height = el.clientHeight;
    const c = getContent?.();
    if (c) {
      state.contentLeft = c.offsetLeft;
      state.contentTop = c.offsetTop;
    }
  };

  const ro = new ResizeObserver(sync);
  el.addEventListener('scroll', sync, { passive: true });
  ro.observe(el);
  const c = getContent?.();
  if (c) ro.observe(c);

  sync();

  return () => {
    el.removeEventListener('scroll', sync);
    ro.disconnect();
  };
}
