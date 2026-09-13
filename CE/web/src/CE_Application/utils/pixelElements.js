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
 */
export function elementLists(cfg) {
  const out = [{ layout: -1, elements: listAt(cfg?.elements) }];
  listAt(cfg?.layouts).forEach((layout, i) => {
    out.push({ layout: i, elements: listAt(layout?.elements) });
  });
  return out;
}

/** Where every element answering to `name` lives: [{ layout, at }], empty when there is none. */
export function elementSites(cfg, name) {
  const sites = [];
  for (const { layout, elements } of elementLists(cfg)) {
    elements.forEach((el, at) => {
      if (elementAnswersTo(el, name)) sites.push({ layout, at });
    });
  }
  return sites;
}

/** The element at one site, or null. */
export function elementAt(cfg, site) {
  if (!site) return null;
  const lists = elementLists(cfg);
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
export function elementsPatch(cfg, sites, prop, value) {
  const touched = sites.filter((site) => {
    const el = elementAt(cfg, site);
    return el && el[prop] !== value;
  });
  if (!touched.length) return {};

  const patch = {};
  const flat = touched.filter((s) => s.layout === -1).map((s) => s.at);
  if (flat.length) {
    patch.elements = listAt(cfg?.elements)
      .map((el, i) => (flat.includes(i) ? { ...el, [prop]: value } : el));
  }
  const inLayouts = touched.filter((s) => s.layout >= 0);
  if (inLayouts.length) {
    patch.layouts = listAt(cfg?.layouts).map((layout, li) => {
      const here = inLayouts.filter((s) => s.layout === li).map((s) => s.at);
      if (!here.length) return layout;
      return {
        ...layout,
        elements: listAt(layout?.elements)
          .map((el, i) => (here.includes(i) ? { ...el, [prop]: value } : el)),
      };
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
export function elementPropTable(cfg, prop) {
  const out = {};
  for (const { elements } of elementLists(cfg)) {
    for (const el of elements) {
      const label = elementLabel(el);
      if (!label || label in out) continue;
      out[label] = el?.[prop];
    }
  }
  return out;
}
