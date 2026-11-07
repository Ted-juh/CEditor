<script>
  /**
   * One control at one value, for a filmstrip frame (stores/pictureExport.js).
   *
   * Drawn by CanvasControl and nothing else, for the reason EffectPreview gives: a second renderer
   * would be free to disagree with the canvas. The control is moved to the frame's corner, inside
   * its margin, and drawn as Preview draws it — its value from the session, resolved through its
   * bindings the way PanelPreviewSurface resolves a custom component's (browser-checks/
   * PanelShotHarness.svelte does the same, for the same reason) — so a frame is what the player
   * shows at that value.
   */
  import CanvasControl from './CanvasControl.svelte';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import { deepClone } from '../utils/deepClone.js';

  // `margin` is room around the control for what it draws outside its box: ticks, a shadow, a glow.
  let { control = null, session = null, width = 1, height = 1, margin = 0 } = $props();

  let positioned = $derived.by(() => {
    if (!control) return null;
    const clone = deepClone(control);
    const transform = clone?._children?.Transform;
    if (transform) { transform.x = margin; transform.y = margin; }
    return clone;
  });
  let resolved = $derived(positioned ? resolveInteractiveControl(positioned, session ?? {}) : null);
</script>

<div class="picture-frame" style="width:{width}px;height:{height}px;">
  {#if positioned}
    <CanvasControl
      control={positioned}
      scale={1}
      panelLocked={false}
      allControls={[positioned]}
      panelControls={[positioned]}
      panelWidth={width}
      panelHeight={height}
      editorInteractionEnabled={false}
      previewSessionOverride={session ?? {}}
      resolvedControlOverride={resolved?.control ?? positioned}
      interactionRuntimeOverride={resolved?.runtime ?? null}
    />
  {/if}
</div>

<style>
  .picture-frame {
    position: relative;
    overflow: hidden;
    pointer-events: none;
  }
</style>
