<script>
  let {
    showHandles = false,
    handles = [],
    handleStyle = () => '',
    onResizeStart = () => {},
    onRotateStart = () => {},
    showMeasurements = false,
    snapGuides = [],
    distanceLabels = [],
    isKeyObject = false,
    overlayOffsetX = 0,
    overlayOffsetY = 0,
  } = $props();
</script>

{#if showHandles}
  {#each handles as handle (handle.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="resize-handle"
      class:key-object={isKeyObject}
      style="{handleStyle(handle.id)} cursor:{handle.cursor};"
      onmousedown={(event) => onResizeStart(handle.id, event)}
    ></div>
  {/each}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rotate-zone rotate-tl" onmousedown={onRotateStart}></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rotate-zone rotate-tr" onmousedown={onRotateStart}></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rotate-zone rotate-bl" onmousedown={onRotateStart}></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rotate-zone rotate-br" onmousedown={onRotateStart}></div>
{/if}

{#if showMeasurements}
  {#each snapGuides as guide}
    <div
      class="snap-guide"
      class:vertical={guide.type === 'vertical'}
      class:horizontal={guide.type === 'horizontal'}
      class:center={guide.center === true}
      style="{guide.type === 'vertical'
        ? `left:${guide.pos - overlayOffsetX}px;`
        : `top:${guide.pos - overlayOffsetY}px;`}"
    ></div>
  {/each}
  {#each distanceLabels as label}
    {#if label.axis === 'h'}
      <div
        class="dist-line dist-h"
        style="left:{label.x - overlayOffsetX}px; top:{label.y - overlayOffsetY}px; width:{label.length}px;"
      ></div>
      <div
        class="dist-label"
        style="left:{(label.side === 'left' ? label.x + label.length - 20 : label.x + 20) - overlayOffsetX}px; top:{label.y - overlayOffsetY}px;"
      >{label.dist}</div>
    {:else}
      <div
        class="dist-line dist-v"
        style="left:{label.x - overlayOffsetX}px; top:{label.y - overlayOffsetY}px; height:{label.length}px;"
      ></div>
      <div
        class="dist-label"
        style="left:{label.x - overlayOffsetX}px; top:{(label.side === 'top' ? label.y + label.length - 20 : label.y + 20) - overlayOffsetY}px;"
      >{label.dist}</div>
    {/if}
  {/each}
{/if}

<style>
  /* Every fixed length in this overlay is multiplied by --inv-scale (1/zoom,
     set by CanvasControl on the control root): the overlay renders inside the
     CSS-scaled panel surface, and these are screen-space UI, not panel
     content. Without it, handles and outlines shrink to invisibility zoomed
     out and swallow the control zoomed in. */
  .resize-handle {
    position: absolute;
    background: #5B9BD5;
    border: solid #FFF;
    z-index: 10;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    inset: calc(-5px * var(--inv-scale, 1));
  }

  .resize-handle:hover {
    background: #FFF;
    border-color: #5B9BD5;
  }

  .resize-handle.key-object {
    background: #E5A029;
  }

  .resize-handle.key-object:hover {
    background: #FFF;
    border-color: #E5A029;
  }

  .rotate-zone {
    position: absolute;
    width: calc(16px * var(--inv-scale, 1));
    height: calc(16px * var(--inv-scale, 1));
    z-index: 9;
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M21 12a9 9 0 1 1-3-6.7'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E") 10 10, crosshair;
  }

  .rotate-zone::after {
    content: '';
    position: absolute;
    inset: calc(-3px * var(--inv-scale, 1));
  }

  .rotate-tl { top: calc(-18px * var(--inv-scale, 1)); left: calc(-18px * var(--inv-scale, 1)); }
  .rotate-tr { top: calc(-18px * var(--inv-scale, 1)); right: calc(-18px * var(--inv-scale, 1)); }
  .rotate-bl { bottom: calc(-18px * var(--inv-scale, 1)); left: calc(-18px * var(--inv-scale, 1)); }
  .rotate-br { bottom: calc(-18px * var(--inv-scale, 1)); right: calc(-18px * var(--inv-scale, 1)); }

  .snap-guide {
    position: absolute;
    pointer-events: none;
    z-index: 100;
  }

  .snap-guide.vertical {
    top: 0;
    bottom: 0;
    width: calc(1px * var(--inv-scale, 1));
    border-left: calc(1px * var(--inv-scale, 1)) dashed #5B9BD5;
  }

  .snap-guide.horizontal {
    left: 0;
    right: 0;
    height: calc(1px * var(--inv-scale, 1));
    border-top: calc(1px * var(--inv-scale, 1)) dashed #5B9BD5;
  }

  /* Panel-centre alignment reads distinct (amber, solid) — matches the
     component editor's centre guide. */
  .snap-guide.center.vertical {
    border-left: calc(2px * var(--inv-scale, 1)) solid #FACC15;
  }

  .snap-guide.center.horizontal {
    border-top: calc(2px * var(--inv-scale, 1)) solid #FACC15;
  }

  .dist-line {
    position: absolute;
    pointer-events: none;
    z-index: 101;
  }

  .dist-h {
    height: 0;
    border-top: calc(1px * var(--inv-scale, 1)) solid #E5A029;
    transform: translateY(calc(-0.5px * var(--inv-scale, 1)));
  }

  .dist-v {
    width: 0;
    border-left: calc(1px * var(--inv-scale, 1)) solid #E5A029;
    transform: translateX(calc(-0.5px * var(--inv-scale, 1)));
  }

  .dist-h::before,
  .dist-h::after {
    content: '';
    position: absolute;
    width: calc(1px * var(--inv-scale, 1));
    height: calc(7px * var(--inv-scale, 1));
    background: #E5A029;
    top: calc(-3px * var(--inv-scale, 1));
  }

  .dist-h::before { left: 0; }
  .dist-h::after { right: 0; }

  .dist-v::before,
  .dist-v::after {
    content: '';
    position: absolute;
    height: calc(1px * var(--inv-scale, 1));
    width: calc(7px * var(--inv-scale, 1));
    background: #E5A029;
    left: calc(-3px * var(--inv-scale, 1));
  }

  .dist-v::before { top: 0; }
  .dist-v::after { bottom: 0; }

  .dist-label {
    position: absolute;
    pointer-events: none;
    z-index: 102;
    background: #E5A029;
    color: #000;
    font-size: calc(9px * var(--inv-scale, 1));
    font-weight: 600;
    padding: calc(1px * var(--inv-scale, 1)) calc(4px * var(--inv-scale, 1));
    border-radius: calc(3px * var(--inv-scale, 1));
    white-space: nowrap;
    transform: translate(-50%, -50%);
    font-family: inherit;
    line-height: 1.2;
  }
</style>
