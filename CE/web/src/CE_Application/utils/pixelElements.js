// pixelElements.js — addressing a pixel display's elements BY NAME.
//
// A PixelDisplay is the richest display in the product and, until this, the one a script could not
// write a word to. The obvious mechanism was the `item` verb kind — one property of element N of an
// array — and it does not fit, twice over.
//
// THE FIRST MISFIT IS THE ONE THE TEST FOUND. Every other `item` list in componentVerbs.js has a
// non-empty default, so element 1 is always there to write to. `Pixel.elements` defaults to EMPTY,
// because a pixel display starts blank by design, and an index-addressed verb is therefore a silent
// no-op on every display whose elements have not already been drawn in the inspector.
//
// THE SECOND ONLY SHOWS UP WHEN YOU TRY TO WRITE THE SCRIPT. An index is not stable: the inspector
// has ▲/▼ buttons, and the paint order they set is the same order the index counts, so reordering
// two elements silently retargets every script that touched them. The design record's answer was
// "address them by id" — and building it showed that is not enough either. The ids are `el_9f3a`,
// minted by `genId`, and the inspector never shows one: the element row is headed `#1`, `#2`. They
// are exactly as unreachable as a control's `ctl_…`, which is the stated reason the LINK verb kind
// takes a NAME and stores an id.
//
// So an element gets a `name`, typed in the inspector beside its group, and that is what a verb
// addresses. The id still resolves, because a name is optional and `read` can hand one back.
//
// TWO PLACES, NOT ONE. A Pixel holds a flat `elements` list AND a `layouts[].elements` per page,
// and when there are layouts the flat list is not drawn at all. A verb that only knew about
// `elements` would work perfectly on a simple screen and do nothing, silently, on any screen with
// pages — which is the same failure in a new place. So a name is resolved across both.
//
// A NAME ADDRESSES EVERY ELEMENT CARRYING IT. Not the first: duplicating a layout re-mints the
// element ids and keeps the names, so a three-page screen has three elements called `title` by
// construction, and they are the same title. Writing one and leaving the others is not a behaviour
// anybody wants, and choosing between them by position would put the index back.

// THE KINDS an element can be, in the inspector's order: the ones that draw text, the bars and
// sliders, then the rest. The inspector's kind list and ce.components.pixel.kind both read these,
// so a script is offered what the inspector is (item 4 of the owner's review of the pixel).
export const PIXEL_TEXT_KINDS = ['static', 'name', 'value', 'pct', 'midiValue', 'note', 'text', 'state', 'edit', 'icon', 'clock'];
export const PIXEL_BAR_KINDS = ['hbar', 'vbar', 'hslider', 'vslider', 'needle'];
export const PIXEL_ELEMENT_KINDS = [...PIXEL_TEXT_KINDS, ...PIXEL_BAR_KINDS, 'wave', 'scope', 'adsr', 'anim', 'bitmap'];

/** Case-insensitive and trimmed, the way a control name is matched. */
const key = (value) => String(value ?? '').trim().toLowerCase();

/** Does this element answer to `name`? Its own name, or failing that its id. */
export function elementAnswersTo(el, name) {
  const wanted = key(name);
  if (!wanted || !el || typeof el !== 'object') return false;
  return key(el.name) === wanted || key(el.id) === wanted;
}

/** The name an element is addressed by — its own, or its id when it has not been given one. */
export function elementLabel(el) {
  const named = String(el?.name ?? '').trim();
  return named || String(el?.id ?? '');
}

const listAt = (value) => (Array.isArray(value) ? value : []);

/**
 * Every list of elements this display holds, in the order a name is resolved against them.
 *
 * `layout` is -1 for the flat list and the layout's index otherwise, which is all the patch builder
 * needs to know to write the right field back.
 *
 * `key` is what a layout calls its list: a Pixel Display's `elements`, which it also keeps flat
 * beside its layouts, or an LCD's `zones`, which live in its layouts only. The LCD's zones are
 * addressed by name the same way (componentVerbs.js, `list: 'zones'`), so one set of rules decides
 * what a name reaches on both displays.
 */
export function elementLists(cfg, key = 'elements') {
  const out = key === 'elements' ? [{ layout: -1, elements: listAt(cfg?.elements) }] : [];
  listAt(cfg?.layouts).forEach((layout, i) => {
    out.push({ layout: i, elements: listAt(layout?.[key]) });
  });
  return out;
}

/** Where every element answering to `name` lives: [{ layout, at }], empty when there is none. */
export function elementSites(cfg, name, key = 'elements') {
  const sites = [];
  for (const { layout, elements } of elementLists(cfg, key)) {
    elements.forEach((el, at) => {
      if (elementAnswersTo(el, name)) sites.push({ layout, at });
    });
  }
  return sites;
}

/** The element at one site, or null. */
export function elementAt(cfg, site, key = 'elements') {
  if (!site) return null;
  const lists = elementLists(cfg, key);
  const found = lists.find((x) => x.layout === site.layout);
  const el = found?.elements[site.at];
  return el && typeof el === 'object' ? el : null;
}

/**
 * Set one property on every element answering to `name`.
 *
 * Returns a patch of Pixel fields — `elements`, `layouts`, or both — or `{}` when nothing would
 * change. The arrays are copied rather than mutated, like every other reducer here: the caller
 * writes the whole field back and an in-place edit would look like a no-op to the change detection
 * between here and the store.
 */
export function elementsPatch(cfg, sites, prop, value, key = 'elements') {
  return elementsUpdate(cfg, sites, (el) => (el[prop] === value ? el : { ...el, [prop]: value }), key);
}

/**
 * The same, for a change that is more than one property or depends on the element: `update(el)`
 * gives the element as it should be, or the same object when it already is. An LCD zone moved by
 * zoneAt keeps its own width, so each zone's new columns follow from its own.
 */
export function elementsUpdate(cfg, sites, update, key = 'elements') {
  const changed = new Map();
  for (const site of sites) {
    const el = elementAt(cfg, site, key);
    if (!el) continue;
    const next = update(el);
    if (next && next !== el && Object.keys(next).some((k) => next[k] !== el[k])) changed.set(`${site.layout}:${site.at}`, next);
  }
  if (!changed.size) return {};
  const at = (layout, i, el) => changed.get(`${layout}:${i}`) ?? el;

  const patch = {};
  if (sites.some((s) => s.layout === -1 && changed.has(`-1:${s.at}`))) {
    patch.elements = listAt(cfg?.elements).map((el, i) => at(-1, i, el));
  }
  if (sites.some((s) => s.layout >= 0 && changed.has(`${s.layout}:${s.at}`))) {
    patch.layouts = listAt(cfg?.layouts).map((layout, li) => {
      const list = listAt(layout?.[key]);
      if (!list.some((_, i) => changed.has(`${li}:${i}`))) return layout;
      return { ...layout, [key]: list.map((el, i) => at(li, i, el)) };
    });
  }
  return patch;
}

/**
 * What one property currently reads as, across the whole display: { name: value }.
 *
 * Keyed by the name an element ANSWERS TO, so an unnamed element appears under its id rather than
 * vanishing — a script that has one from the document can still use it, and a reader can see that
 * the element exists and has not been named.
 */
export function elementPropTable(cfg, prop, key = 'elements', readAs = null) {
  const out = {};
  const seen = new Set();
  for (const { elements } of elementLists(cfg, key)) {
    for (const el of elements) {
      const label = elementLabel(el);
      // "Cutoff" and "cutoff" are one name, as a name matches in any case: the first spelling.
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      out[label] = readAs ? readAs(el) : el?.[prop];
    }
  }
  return out;
}

/** Every name the display's elements answer to, once each in any case, the first spelling kept. */
export function elementNames(cfg, key = 'elements') {
  return Object.keys(elementPropTable(cfg, 'id', key));
}
