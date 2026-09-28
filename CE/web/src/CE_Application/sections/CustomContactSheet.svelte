<script>
  // Contact sheet for the custom-component design surface: every state, at five sizes, drawn by the
  // same part renderer the canvas uses, with the layout breaks at each size listed under its cell.
  // The cells and the checks are utils/componentContactSheet.js; this only lays them out.
  import InteractivePartRenderer from '../editor/InteractivePartRenderer.svelte';
  import { buildContactSheet, contactSheetScale } from '../utils/componentContactSheet.js';
  import { previewSignals } from '../utils/customDesignSurfaceHelpers.js';

  let {
    control = null,
    preview = {},
    onPickState = () => {},
    onClose = () => {},
  } = $props();

  let stateNames = $derived(Object.keys(control?._children?.States?._children ?? {}));
  let sheet = $derived(buildContactSheet(control, stateNames, previewSignals(preview)));
  let scale = $derived(contactSheetScale(sheet.sizes));

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sheet-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="States at every size" data-testid="contact-sheet">
    <header>
      <strong>States × sizes</strong>
      <span class="summary" class:clean={sheet.issueCount === 0}>
        {sheet.issueCount === 0 ? 'No layout breaks' : `${sheet.issueCount} layout break${sheet.issueCount === 1 ? '' : 's'}`}
      </span>
      <em>Drawn as the panel draws them, at the preview's test value. Click a cell to edit that state.</em>
      <button type="button" class="close" onclick={onClose} title="Close (Esc)">×</button>
    </header>

    <div class="grid" style={`grid-template-columns: 88px repeat(${sheet.sizes.length}, max-content)`}>
      <span></span>
      {#each sheet.sizes as size (size.key)}
        <span class="col-head">{size.label}<small>{size.width} × {size.height}</small></span>
      {/each}

      {#each sheet.rows as row (row.state)}
        <span class="row-head">{row.state}</span>
        {#each row.cells as cell (cell.key)}
          <button
            type="button"
            class="cell"
            class:broken={cell.issues.length > 0}
            data-cell={cell.key}
            data-issues={cell.issues.length}
            title={cell.issues.length ? cell.issues.map((issue) => issue.message).join('\n') : `${row.state} at ${cell.size.width} × ${cell.size.height}`}
            onclick={() => onPickState(row.state)}
          >
            <span class="frame" style={`width:${cell.size.width * scale}px;height:${cell.size.height * scale}px`}>
              <span class="stage" style={`width:${cell.size.width}px;height:${cell.size.height}px;transform:scale(${scale})`}>
                {#each cell.parts as [partName, part] (partName)}
                  <InteractivePartRenderer {part} {partName} parentWidth={cell.size.width} parentHeight={cell.size.height} />
                {/each}
              </span>
            </span>
            {#if cell.issues.length}
              <ul class="issues">
                {#each cell.issues.slice(0, 3) as issue (issue.message)}
                  <li>{issue.message}</li>
                {/each}
                {#if cell.issues.length > 3}<li>+{cell.issues.length - 3} more</li>{/if}
              </ul>
            {/if}
          </button>
        {/each}
      {/each}
    </div>
  </div>
</div>

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(4, 8, 11, 0.72);
  }

  .sheet {
    width: max-content;
    max-width: 100%;
    max-height: 100%;
    overflow: auto;
    border: 1px solid #2A3741;
    border-radius: 6px;
    background: #10171D;
    color: #D8E6EE;
    font-size: 11px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  }

  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #2A3741;
    background: #151E25;
  }

  header em {
    flex: 1;
    color: #7F95A3;
    font-style: normal;
  }

  .summary {
    padding: 1px 8px;
    border-radius: 999px;
    background: #3A1F22;
    color: #F2A7A7;
    font-weight: 700;
  }

  .summary.clean {
    background: #12302D;
    color: #8FEDE3;
  }

  .close {
    border: none;
    background: transparent;
    color: #9FB3C0;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .grid {
    display: grid;
    gap: 12px 16px;
    align-items: start;
    padding: 14px;
  }

  .col-head {
    display: grid;
    color: #9FB3C0;
    font-weight: 700;
  }

  .col-head small {
    color: #6B808D;
    font-weight: 400;
  }

  .row-head {
    align-self: center;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .cell {
    display: grid;
    gap: 6px;
    justify-items: start;
    padding: 8px;
    border: 1px solid #22303A;
    border-radius: 4px;
    background: repeating-conic-gradient(#161F26 0% 25%, #121A20 0% 50%) 0 0 / 12px 12px;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .cell:hover {
    border-color: #14B8A6;
  }

  .cell.broken {
    border-color: #8A3A3F;
  }

  /* The dashed line is the component's bounds; anything drawn past it is shown, not clipped, so a
     part that spills is visible rather than silently cut off. */
  .frame {
    position: relative;
    display: block;
    outline: 1px dashed rgba(143, 237, 227, 0.35);
  }

  .stage {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: top left;
  }

  .issues {
    margin: 0;
    padding: 0;
    list-style: none;
    max-width: 180px;
    color: #F2A7A7;
    font-size: 10px;
  }
</style>
