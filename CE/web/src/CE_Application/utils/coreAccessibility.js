// Resolvers for the two Core fields that describe a control in words rather than in pixels:
// the hover tooltip and the screen-reader label.
//
// Both shipped in the model and in the Core tab long before anything read them, and both are the
// kind of field a user tries early: every other editor on the panel has working hints, and an
// accessibility label that does nothing is worse than one that is missing, because it reads as
// done. The Core tab states what each promises, and those sentences are the specification:
//
//   Tooltip   "Hover text shown over the control in preview and in the player."
//   A11y      "Screen-reader label, when the visible text is not descriptive enough."
//
// IN PREVIEW AND IN THE PLAYER, NOT ON THE EDITING CANVAS. A tooltip that appeared while you were
// dragging controls around would cover the thing you were positioning, and the canvas already
// carries the name. The player and the preview are the same surface — `Player.svelte` renders
// `PanelPreviewSurface` — so one gate covers both, which is also why neither needs a second
// implementation to drift from the first.
//
// Nothing here touches the DOM. The surface turns these into a `title` attribute and an
// `aria-label`, exactly as it already does for role, tab index and the aria value attributes.

/** The author's hover text, trimmed. '' means the control has none and no attribute is written. */
export function resolveTooltip(control = null) {
  return String(control?._children?.Core?.tooltip ?? '').trim();
}

/**
 * The accessible name for a control: the author's text when they wrote one, else the caller's.
 *
 * THE AUTHOR'S TEXT WINS, which is the whole point of the field and worth stating because the
 * surfaces already compute a name of their own — `<name> preview` — and that generated string was
 * being emitted over the top of whatever the author had typed. A field whose value is silently
 * discarded by a default is the same defect as one nothing reads; it just takes longer to find.
 *
 * The fallback is passed in rather than built here because it differs by surface and by element:
 * the control root says "<name> preview", a spinner's inner input says "<name> value". Both should
 * defer to the author, and neither should have to know how the other phrases itself.
 */
export function resolveAriaLabel(control = null, fallback = '') {
  const authored = String(control?._children?.Core?.screenReaderText ?? '').trim();
  return authored || fallback;
}

/**
 * Whether this control needs a role of its own to carry an accessible name.
 *
 * A NAME ON A ROLE-LESS ELEMENT IS NOT ANNOUNCED. `aria-label` on a plain `<div>` is ignored by
 * screen readers, because a generic element has no name to give — so on a control the preview does
 * not treat as interactive (a display, a decorative shape) the author's text would be written into
 * the DOM, be visible in the inspector, and reach nobody. That is exactly the shape of failure this
 * field already had, moved one layer down, and it is the reason this function exists rather than
 * the surface simply writing the attribute and hoping.
 *
 * `img` is the role for it: the conventional way to say "this graphic carries this meaning", which
 * is what a meter or an annotated shape is to somebody who cannot see it. It is only ever applied
 * when the author has actually written a label AND the surface has no role of its own to give —
 * so it can never displace a slider's or a button's semantics, and a control with no label is left
 * exactly as it was.
 */
export function needsImageRole(control = null, previewRole = '') {
  return !String(previewRole ?? '').trim()
    && String(control?._children?.Core?.screenReaderText ?? '').trim() !== '';
}
