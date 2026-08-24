// tabContainerLayout.js — pages, and a strip to switch between them.
//
// Two containers left in the backlog, and they are the same shape of problem: a Container that
// shows some of its children and not others. A tab container hides by PAGE, a scroll area hides by
// position, and both need the answer to be a model rather than a rendering trick — a child that is
// on another page must not be selectable, must not receive the pointer, and must not be exported
// as visible.
//
// `pageIndex` IS A BINDABLE PORT, which the design note called out and which is the whole reason
// this is worth building rather than faking with a Group and some visibility toggles: a footswitch
// changing the page is a real performance gesture, and it needs somewhere to send its value.
//
// PURE. Which children belong to which page is a property of the children; this file decides what
// that means.

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clampInt = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(value, lo))));

export function tabConfig(control) {
  return control?._children?.TabContainer ?? {};
}

/**
 * The pages. Always at least one — a tab container with no pages is a container, and rendering it
 * as nothing at all would make its children unreachable with no way back.
 */
export function tabPages(control) {
  const pages = tabConfig(control).pages;
  if (Array.isArray(pages) && pages.length) return pages;
  return [{ id: 'p0', label: 'Page 1' }];
}

export function activePageIndex(control) {
  return clampInt(tabConfig(control).pageIndex ?? 0, 0, tabPages(control).length - 1);
}

export function activePageId(control) {
  return String(tabPages(control)[activePageIndex(control)]?.id ?? 'p0');
}

/**
 * Which page a child sits on.
 *
 * Read from the CHILD's Core, not from a list on the container. A list would go stale the moment
 * somebody deleted a control, and then a page would claim a child that no longer exists while the
 * child that replaced it belonged to nothing.
 *
 * A child with no page recorded belongs to the FIRST page rather than to none — that is what a
 * control dropped into the container before anybody thought about pages should do, and "invisible
 * on every page" is not a state a user can get out of.
 */
export function childPageId(child, control) {
  const declared = String(child?._children?.Core?.tabPageId ?? '').trim();
  if (!declared) return String(tabPages(control)[0]?.id ?? 'p0');
  return tabPages(control).some((page) => String(page.id) === declared)
    ? declared
    // A page that was deleted leaves its children orphaned. They come back on page one rather than
    // vanishing, because a control you cannot see and cannot reach is indistinguishable from a
    // control that was destroyed.
    : String(tabPages(control)[0]?.id ?? 'p0');
}

export function isChildOnActivePage(child, control) {
  return childPageId(child, control) === activePageId(control);
}

/** Geometry: the tab strip along one edge, the page area filling what is left. */
export function tabGeometry(width, height, control) {
  const config = tabConfig(control);
  const w = Math.max(1, num(width, 0));
  const h = Math.max(1, num(height, 0));
  const stripSize = Math.max(0, num(config.stripSize, 26));
  const edge = String(config.edge ?? 'top');
  const showStrip = config.showStrip !== false;
  const strip = showStrip ? stripSize : 0;

  switch (edge) {
    case 'bottom':
      return { strip: { x: 0, y: h - strip, w, h: strip }, page: { x: 0, y: 0, w, h: h - strip }, edge, vertical: false };
    case 'left':
      return { strip: { x: 0, y: 0, w: strip, h }, page: { x: strip, y: 0, w: w - strip, h }, edge, vertical: true };
    case 'right':
      return { strip: { x: w - strip, y: 0, w: strip, h }, page: { x: 0, y: 0, w: w - strip, h }, edge, vertical: true };
    default:
      return { strip: { x: 0, y: 0, w, h: strip }, page: { x: 0, y: strip, w, h: h - strip }, edge, vertical: false };
  }
}

/** One tab's rectangle in the strip. Equal widths — a tab strip is not a text layout engine. */
export function tabRect(geom, index, count) {
  const total = Math.max(1, count);
  if (geom.vertical) {
    const each = geom.strip.h / total;
    return { x: geom.strip.x, y: geom.strip.y + index * each, w: geom.strip.w, h: each };
  }
  const each = geom.strip.w / total;
  return { x: geom.strip.x + index * each, y: geom.strip.y, w: each, h: geom.strip.h };
}

/** Which tab a point is on, or null. */
export function tabAtPoint(geom, px, py, count) {
  const x = num(px, -1);
  const y = num(py, -1);
  const { strip } = geom;
  if (x < strip.x || y < strip.y || x > strip.x + strip.w || y > strip.y + strip.h) return null;
  const index = geom.vertical
    ? Math.floor(((y - strip.y) / strip.h) * count)
    : Math.floor(((x - strip.x) / strip.w) * count);
  return index >= 0 && index < count ? index : null;
}

/** Move to a page, clamped. Used by the strip, by a script, and by the bindable port. */
export function selectPage(control, index) {
  return clampInt(index, 0, tabPages(control).length - 1);
}

export function tabPorts(control, parameterTypes = null) {
  const types = parameterTypes ?? {};
  return [{
    id: 'pageIndex',
    label: 'Page',
    accepts: [types.INTEGER ?? 'integer', types.CHOICE ?? 'choice'].filter(Boolean),
    defaultBindingMode: 'onCommit',
  }];
}
