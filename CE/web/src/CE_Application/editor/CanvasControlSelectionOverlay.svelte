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
      style="{guide.type === 'vertical' ? `left:${guide.pos}px;` : `top:${guide.pos}px;`}"
    ></div>
  {/each}
  {#each distanceLabels as label}
    {#if label.axis === 'h'}
      <div class="dist-line dist-h" style="left:{label.x}px; top:{label.y}px; width:{label.length}px;"></div>
      <div class="dist-label" style="left:{label.side === 'left' ? label.x + label.length - 20 : label.x + 20}px; top:{label.y}px;">{label.dist}</div>
    {:else}
      <div class="dist-line dist-v" style="left:{label.x}px; top:{label.y}px; height:{label.length}px;"></div>
      <div class="dist-label" style="left:{label.x}px; top:{label.side === 'top' ? label.y + label.length - 20 : label.y + 20}px;">{label.dist}</div>
    {/if}
  {/each}
{/if}

<style>
  .resize-handle {
    position: absolute;
    background: #5B9BD5;
    border: 1px solid #FFF;
    border-radius: 2px;
    z-index: 10;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    inset: -5px;
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
    width: 16px;
    height: 16px;
    z-index: 9;
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M21 12a9 9 0 1 1-3-6.7'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E") 10 10, crosshair;
  }

  .rotate-zone::after {
    content: '';
    position: absolute;
    inset: -3px;
  }

  .rotate-tl { top: -18px; left: -18px; }
  .rotate-tr { top: -18px; right: -18px; }
  .rotate-bl { bottom: -18px; left: -18px; }
  .rotate-br { bottom: -18px; right: -18px; }

  .snap-guide {
    position: absolute;
    pointer-events: none;
    z-index: 100;
  }

  .snap-guide.vertical {
    top: 0;
    bottom: 0;
    width: 1px;
    border-left: 1px dashed #5B9BD5;
  }

  .snap-guide.horizontal {
    left: 0;
    right: 0;
    height: 1px;
    border-top: 1px dashed #5B9BD5;
  }

  .dist-line {
    position: absolute;
    pointer-events: none;
    z-index: 101;
  }

  .dist-h {
    height: 0;
    border-top: 1px solid #E5A029;
    transform: translateY(-0.5px);
  }

  .dist-v {
    width: 0;
    border-left: 1px solid #E5A029;
    transform: translateX(-0.5px);
  }

  .dist-h::before,
  .dist-h::after {
    content: '';
    position: absolute;
    width: 1px;
    height: 7px;
    background: #E5A029;
    top: -3px;
  }

  .dist-h::before { left: 0; }
  .dist-h::after { right: 0; }

  .dist-v::before,
  .dist-v::after {
    content: '';
    position: absolute;
    height: 1px;
    width: 7px;
    background: #E5A029;
    left: -3px;
  }

  .dist-v::before { top: 0; }
  .dist-v::after { bottom: 0; }

  .dist-label {
    position: absolute;
    pointer-events: none;
    z-index: 102;
    background: #E5A029;
    color: #000;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    font-family: inherit;
    line-height: 1.2;
  }
</style>
