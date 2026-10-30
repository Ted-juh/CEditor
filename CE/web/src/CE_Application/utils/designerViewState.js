// designerViewState.js — which of a custom component's Designer fields are the designer's view of it.

/**
 * What the Component Designer is SHOWING, as opposed to what the component IS: which layer, hit
 * zone, channel, behaviour, state or kit is selected (`selected…`), which pane or section it was
 * asked to focus (`focus…`), and the stage's `preview` settings — Preview or Edit, bounds and hit
 * zones drawn, the state and test value on show.
 *
 * The designer keeps them on the component (Designer.*), so a component opens where it was left.
 * They are not edits. Clicking a layer, or Preview, used to mark the panel modified and put "Edit
 * designer of …" on the undo stack; undo then stepped through clicks instead of changes. History
 * compares documents without them (stores/history.js) and a write of nothing else leaves the
 * modified flag alone (stores/controls.js). They are still saved with the next real change.
 *
 * Not view state, though they sit beside it: `activeVariant` and `patternEditing` (a copy's own
 * settings), `arpeggiator` (the pattern), the package provenance fields.
 */
export function isDesignerViewKey(key) {
  const name = String(key ?? '');
  return name === 'preview' || name.startsWith('selected') || name.startsWith('focus');
}

/** Is `path` (a dotted control path, as patches use) one of the Designer view fields? */
export function isDesignerViewPath(path) {
  const parts = String(path ?? '').replace(/\._children\./g, '.').split('.');
  return parts[0] === 'Designer' && parts.length > 1 && isDesignerViewKey(parts[1]);
}

/** Does a `{ path: value }` patch write view fields and nothing else? An empty patch does not. */
export function isDesignerViewPatch(patch) {
  const paths = Object.keys(patch ?? {});
  return paths.length > 0 && paths.every(isDesignerViewPath);
}

/**
 * The value jsonEqual should compare in place of `value`: a Designer section without its view
 * fields, anything else as it is. Passed to jsonEqual as its `normalize`, so two documents that
 * differ only in what the designer was showing compare equal.
 */
export function withoutDesignerView(value) {
  if (!value || typeof value !== 'object' || value._type !== 'Designer') return value;
  let stripped = null;
  for (const key of Object.keys(value)) {
    if (!isDesignerViewKey(key)) continue;
    stripped ??= { ...value };
    delete stripped[key];
  }
  return stripped ?? value;
}
