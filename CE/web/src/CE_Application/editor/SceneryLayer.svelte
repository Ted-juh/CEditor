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

  let {
    controls = [],
    allControls = [],
    panelControls = [],
    panelWidth = 0,
    panelHeight = 0,
    scale = 1,
  } = $props();
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
  />
{/each}
