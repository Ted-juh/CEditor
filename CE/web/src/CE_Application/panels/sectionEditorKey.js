/**
 * The `{#key}` value for the section editor SectionRenderer mounts.
 *
 * A key is an IDENTITY: which control, in which context, on which tab, for which state target.
 * When it changes, Svelte destroys the component and builds a new one. That is the right thing
 * when the editor is now editing a different control, and the wrong thing for every other reason.
 *
 * The Text tab used to key on the text CONTENT and the font family as well as the identity. The
 * consequence was that every external change to a caption — an undo, a script write, the inline
 * canvas text edit added in the same round — tore down and remounted TextEditor.svelte: 2,455
 * lines of section editor, nine collapsible sections snapping back to their default state, all
 * to change one string. Undo felt like the panel had been reloaded, because it had been.
 *
 * Content does not need a remount. TextEditor already reconciles it: `textDraft` is re-seeded
 * from `Text.content` by its own effect whenever the document value moves away from the last one
 * it committed (TextEditor.svelte:149-155), which is exactly the "external change" case, and the
 * only `$state` in the file. Font family does not need one either — TextEditor re-keys its own
 * Font Settings section on family/weight/style (`fontEditorRenderKey`, TextEditor.svelte:95-97),
 * which is what the family in the outer key was standing in for, one nesting level too high.
 *
 * So: identity only. If a future editor needs to be rebuilt when a value changes, give it its own
 * inner `{#key}` over the part that needs it — do not put a document value in this one, because
 * a value in a key is a remount on every keystroke.
 */

/**
 * Tabs whose editor is rebuilt when the state target changes. The state target IS part of the
 * identity for these: `segments` takes `stateTargetKey` as a prop and rebuilds its model from it,
 * and the text editor's draft belongs to one state's text, not to the control as a whole.
 * Every other state-scopable tab receives an already-scoped control and re-derives from the prop.
 */
const STATE_KEYED_TABS = new Set(['text', 'segments']);

export function sectionEditorInstanceKey({ contextMode = 'panel', tabId = '', controlId = null, stateTargetKey = 'base' } = {}) {
  const identity = controlId ?? 'none';
  const state = STATE_KEYED_TABS.has(tabId) ? stateTargetKey : '';
  return `${contextMode}:${tabId}:${identity}:${state}`;
}
