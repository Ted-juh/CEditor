<script>
  /**
   * One control, drawn small, by the real renderer.
   *
   * Every preview in the Effects tab goes through here — the big specimen, the four state
   * thumbnails and the per-row thumbnails — for the reason SceneryLayer gives for doing the same
   * thing: anything cheaper would be a second implementation of text layout and effects, free to
   * drift from the first, and a preview that disagrees with the canvas is worse than no preview.
   *
   * The control is cloned with its position zeroed and dropped into a box of its own natural size,
   * which is then CSS-scaled to fit. Scaling the wrapper rather than passing `scale` to
   * CanvasControl keeps every internal measurement in the units the renderer expects.
   */
  import CanvasControl from '../../editor/CanvasControl.svelte';
  import { getSection } from '../../stores/controls.js';
  import { deepClone } from '../../utils/deepClone.js';

  let {
    control = null,
    boxWidth = 30,
    boxHeight = 20,
    padding = 0,
    maxScale = 1,
    fit = 'contain',
    zoom = 1,
    label = '',
    children = null,
  } = $props();

  const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

  let naturalWidth = $derived(Math.max(1, numberOr(getSection(control, 'Transform')?.width, 100)));
  let naturalHeight = $derived(Math.max(1, numberOr(getSection(control, 'Transform')?.height, 40)));

  // A control positioned at (x, y) inside a panel would render off the corner of a preview box,
  // so the clone is moved to the origin. Cheap: previews are small and this only runs when the
  // control actually changes.
  let positioned = $derived.by(() => {
    if (!control) return null;
    const clone = deepClone(control);
    const transform = clone?._children?.Transform;
    if (transform) { transform.x = 0; transform.y = 0; }
    return clone;
  });

  // `contain` for anything you are meant to read whole — the specimen, a state, a look.
  //
  // `cover` for the row thumbnails, and it is not a detail. A 180x64 label shrunk to fit a 32x20
  // box lands at 0.18 scale, which puts the glyphs at about six pixels: every row then shows the
  // same illegible grey smudge and the column that exists to tell you WHICH layer is doing what
  // tells you nothing. Cropping instead of shrinking keeps the letterform big enough to read the
  // difference between an outline and a glow, which is the only job these have.
  let scale = $derived.by(() => {
    const w = (boxWidth - padding * 2) / naturalWidth;
    const h = (boxHeight - padding * 2) / naturalHeight;
    const base = fit === 'cover' ? Math.max(w, h) : Math.min(w, h);
    // `zoom` pushes past an exact cover fit so the crop eats the control's own edges. A row
    // thumbnail cover-fitted exactly shows the top and bottom of the control's border as two grey
    // lines across a 22px box, which is the loudest thing in a picture whose whole job is to show
    // one effect. Overshooting crops them off.
    return Math.min(maxScale, base * zoom);
  });
</script>

<div
  class="effect-preview"
  style="width:{boxWidth}px;height:{boxHeight}px;"
  role={label ? 'img' : 'presentation'}
  aria-label={label || undefined}
>
  {#if positioned}
    <!--
      Two boxes on purpose. `.stage` is the control at its NATURAL size, CSS-scaled from its top
      left; `.stage-box` is that size after scaling, so it is exactly the rectangle the control
      occupies on screen. An overlay goes in the box rather than the stage, which means its
      coordinates are the control's own 0-100% and its handles keep their real pixel size instead of
      shrinking with the preview. Overlaying the whole preview instead would put a path handle
      wherever the padding happened to be.
    -->
    <div class="stage-box" style="width:{naturalWidth * scale}px;height:{naturalHeight * scale}px;">
      <div class="stage" style="width:{naturalWidth}px;height:{naturalHeight}px;transform:scale({scale});">
        <CanvasControl
          control={positioned}
          scale={1}
          panelLocked={false}
          allControls={[positioned]}
          panelWidth={naturalWidth}
          panelHeight={naturalHeight}
          editorInteractionEnabled={false}
        />
      </div>
      {#if children}
        <div class="overlay">{@render children()}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .effect-preview {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    /* The previews are pictures, not controls: nothing in here should take a click away from the
       row it sits in. */
    pointer-events: none;
    user-select: none;
  }

  .stage-box {
    position: relative;
    flex: 0 0 auto;
  }

  .stage {
    position: absolute;
    inset: 0;
    transform-origin: top left;
  }

  /* The preview itself takes no pointer events (it is a picture); an overlay is the exception,
     because it is the one part you are meant to touch. */
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: auto;
  }
</style>
