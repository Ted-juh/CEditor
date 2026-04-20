<script>
  /**
   * Shared 24-swatch grid used by the Colors, Gradient, and Notepad tabs
   * in DisplayPanel. Owns only layout and rendering — all click semantics
   * come from the parent via callbacks.
   */
  let {
    swatches = [],
    label = 'Colors',
    onclick = null,
    ondblclick = null,
    oncontextmenu = null,
    getTitle = null, // (swatch, i) => string — optional title override
  } = $props();

  function defaultTitle(swatch) {
    return swatch
      ? `#${swatch} — right-click to replace, double-click to clear`
      : 'Click to store current color';
  }
</script>

<div class="sidebar-swatches">
  <div class="swatches-label">{label}</div>
  <div class="swatches-grid">
    {#each swatches as swatch, i}
      <button
        class="swatch"
        class:empty={!swatch}
        style={swatch ? `background: #${swatch}` : ''}
        onclick={() => onclick?.(i)}
        ondblclick={() => ondblclick?.(i)}
        oncontextmenu={(e) => oncontextmenu?.(i, e)}
        title={getTitle?.(swatch, i) ?? defaultTitle(swatch)}
      ></button>
    {/each}
  </div>
</div>

<style>
  .sidebar-swatches {
    flex: 1;
    border-top: 1px solid #333;
    padding: 4px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  .swatches-label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .swatches-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 2px;
    width: 100%;
  }

  .swatch {
    aspect-ratio: 1;
    border: 1px solid #333;
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    transition: border-color 0.1s;
  }

  .swatch:hover { border-color: #5B9BD5; }

  .swatch.empty {
    background: #333;
    border-style: dashed;
  }
  .swatch.empty:hover { border-color: #5B9BD5; }
</style>
