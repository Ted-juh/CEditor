/**
 * Track a scrollable viewport element's scroll offset and client size.
 * Mutates the supplied `state` object with `scrollLeft`, `scrollTop`,
 * `width`, and `height` whenever the element scrolls or resizes.
 *
 * Returns a teardown function that removes the listeners — call it from
 * your effect's cleanup.
 *
 *   state        — { scrollLeft, scrollTop, width, height } (mutated)
 *   getViewport  — () => HTMLElement | null
 *
 * Usage:
 *   let metrics = $state({ scrollLeft: 0, scrollTop: 0, width: 0, height: 0 });
 *   $effect(() => trackViewportMetrics(metrics, () => viewportEl));
 */
export function trackViewportMetrics(state, getViewport) {
  const el = getViewport();
  if (!el) return () => {};

  const syncScroll = () => {
    state.scrollLeft = el.scrollLeft;
    state.scrollTop = el.scrollTop;
  };
  const syncSize = () => {
    state.width = el.clientWidth;
    state.height = el.clientHeight;
  };

  const ro = new ResizeObserver(syncSize);
  el.addEventListener('scroll', syncScroll, { passive: true });
  ro.observe(el);

  syncScroll();
  syncSize();

  return () => {
    el.removeEventListener('scroll', syncScroll);
    ro.disconnect();
  };
}
