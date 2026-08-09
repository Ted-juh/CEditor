import { observeElementMetrics, scheduleElementMetrics } from './batchedElementMetrics.js';

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

  // Reads only — see utils/batchedElementMetrics.js. This used to run straight off the
  // ResizeObserver, which fires on every size change while a panel mounts: opening the GAIA panel
  // resized the content hundreds of times, and each delivery did two getBoundingClientRect calls
  // interleaved with the mounting DOM writes. 135 ms of a 1.8 s panel load, for a measurement whose
  // answer only has to be right once per frame.
  const measure = () => {
    const next = {
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      width: el.clientWidth,
      height: el.clientHeight,
      contentLeft: state.contentLeft,
      contentTop: state.contentTop,
    };
    const c = getContent?.();
    if (c) {
      // Measure the content's real rendered offset from the viewport, then
      // convert to content space by adding the current scroll (the ruler
      // subtracts scrollLeft/scrollTop back out). offsetLeft/offsetTop can't be
      // used here: the content is centred with margins, and vertical margins
      // COLLAPSE through the non-BFC stage wrapper, so offsetTop reads 0 even
      // when the panel sits far down the viewport — which parked the vertical
      // ruler's 0 at the viewport top instead of the panel's top edge, while
      // the horizontal ruler was fine (horizontal margins never collapse).
      // getBoundingClientRect reflects the true position and is collapse-immune.
      const cr = c.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      next.contentLeft = cr.left - er.left + el.scrollLeft;
      next.contentTop = cr.top - er.top + el.scrollTop;
    }
    return next;
  };

  // Writes only.
  const commit = (next) => {
    state.scrollLeft = next.scrollLeft;
    state.scrollTop = next.scrollTop;
    state.width = next.width;
    state.height = next.height;
    state.contentLeft = next.contentLeft;
    state.contentTop = next.contentTop;
  };

  const content = getContent?.();
  const stop = observeElementMetrics({
    targets: content ? [el, content] : [el],
    measure,
    commit,
  });

  // Scrolling is frame-paced anyway, so joining the same batch costs nothing visible and keeps a
  // fast scroll from measuring more often than it can be drawn.
  const onScroll = () => scheduleElementMetrics(el);
  el.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    el.removeEventListener('scroll', onScroll);
    stop();
  };
}
