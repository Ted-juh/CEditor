// familyConditions.js — a family patch value that goes with another one.
//
// A family patch applies each of its properties on its own, wherever the control still holds the
// factory value there (controlSetFamilies.js, THE RULE). That is right for nearly everything and
// wrong for a property that only makes sense with another. A plate set's Label design draws a brass
// plate and dark lettering on it. A label whose author made its background transparent keeps that
// background, which is the rule working, and then took the dark lettering anyway, which is the rule
// working too: on a dark wooden panel, at 1.0:1. The lettering belonged to the plate.
//
// So a value can say what it goes with: `onlyWhere('Background.Fill.colour', brass, ink)` is the
// ink, applied only where the control, as the family has drawn it so far, holds the brass at that
// path. Where it does not, `otherwise` applies in its place, if there is one, and nothing if not.
// Either way the rule still decides whether the control takes it at all.
//
// A leaf module, because the designs that write these and the resolver that reads them import each
// other's neighbours (labelDesigns -> controlSets -> controlSetFamilies).

/** `value` where the control holds `is` at `path`; `otherwise` (if given) where it does not. */
export function onlyWhere(path, is, value, otherwise) {
  return { onlyWhere: { path, is }, value, ...(otherwise === undefined ? {} : { otherwise }) };
}

/** The condition a family value carries, or null for an ordinary value. */
export function conditionOf(value) {
  const where = value !== null && typeof value === 'object' && !Array.isArray(value) ? value.onlyWhere : null;
  return where !== null && typeof where === 'object' && typeof where.path === 'string' && Object.hasOwn(value, 'value') ? where : null;
}
