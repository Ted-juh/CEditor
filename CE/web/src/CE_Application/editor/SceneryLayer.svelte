<script>
  /**
   * The scenery, drawn as real controls.
   *
   * This is the honest rendering of a folded set and the thing SceneryGround bakes from, so it must
   * paint EXACTLY what the surface would have painted — same component, same props, just with the
   * editor's interaction switched off. Anything cheaper here (a purpose-built label renderer, say)
   * would be a second implementation of text layout, icons, content padding and effects, free to
   * drift from the first, and the drift would show up as scenery that looks subtly unlike the
   * control it replaced.
   */
  import CanvasControl from './CanvasControl.svelte';
  import { setContext, getContext } from 'svelte';
  import { activeControlSet, CONTROL_SET_CONTEXT_KEY } from '../stores/controlSets.js';
  import { needsImageRole, resolveAriaLabel, resolveTooltip } from '../utils/coreAccessibility.js';

  let {
    controls = [],
    allControls = [],
    panelControls = [],
    panelWidth = 0,
    panelHeight = 0,
    scale = 1,
    controlSet = null,
    /**
     * Whether these controls should carry their Core tooltip and screen-reader label.
     *
     * Off on the editing canvas and on for the panel being used, because that is what the Core tab
     * promises — "in preview and in the player" — and a tooltip popping up over the control you are
     * dragging is exactly the thing that promise is avoiding. Scenery is the one kind of control
     * that cannot read the answer from its own render: the ground is BAKED, and the same bake is
     * used by both surfaces, so the flag has to travel with the request and go into the cache key.
     */
    annotate = false,
  } = $props();
  const inheritedSet = getContext(CONTROL_SET_CONTEXT_KEY);
  setContext(CONTROL_SET_CONTEXT_KEY, () => controlSet ?? (typeof inheritedSet === 'function' ? inheritedSet() : $activeControlSet));
</script>

{#each controls as control (control._children?.Core?.id)}
  <CanvasControl
    {control}
    {scale}
    panelLocked={false}
    {allControls}
    {panelControls}
    {panelWidth}
    {panelHeight}
    editorInteractionEnabled={false}
    previewTooltip={annotate ? resolveTooltip(control) : ''}
    previewAriaLabel={annotate ? resolveAriaLabel(control, '') : ''}
    previewImageRole={annotate ? needsImageRole(control, '') : false}
  />
{/each}
