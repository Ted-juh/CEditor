<script>
  /**
   * The saved components, drawn by the renderer that draws them on the canvas.
   *
   * The library entry carries `envelope.component` — the whole control — and the panel draws a
   * separate simplified picture of it instead: up to 18 coloured rectangles in the envelope, of
   * which the card draws 14. Measured on a 22-part component that is parts 4 to 17: the background
   * gone from the bottom, the top four layers gone from the top. `EffectPreview` already argues the
   * case for not doing that — anything cheaper than the real renderer is a second implementation,
   * free to drift, and a preview that disagrees with the canvas is worse than no preview.
   *
   * Cards are draggable with the payload `EditorCanvas` already reads
   * (`application/x-ceditor-insert`, `{kind:'package', id}`), so drag-to-place works here for the
   * same reason it works from the Insert panel — no new drop path.
   */
  import Pin from 'lucide-svelte/icons/pin';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import EffectPreview from '../effects/EffectPreview.svelte';
  import { thumbnailLoss, relativeTime } from '../../utils/componentLibraryModel.js';

  let {
    rows = [],
    selectedId = '',
    canPlace = true,
    onselect = () => {},
    onplace = () => {},
    onpin = () => {},
  } = $props();

  function dragStart(row, event) {
    if (!canPlace || !row?.id) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ceditor-insert', JSON.stringify({ kind: 'package', id: row.id }));
  }
</script>

<div class="grid" role="listbox" tabindex="-1" aria-label="Saved components">
  {#each rows as row (row.id)}
    {@const loss = thumbnailLoss(row)}
    <div
      class="card"
      class:sel={row.id === selectedId}
      class:invalid={!row.valid}
      role="option"
      tabindex="0"
      aria-selected={row.id === selectedId}
      draggable={canPlace}
      title={canPlace ? `${row.name} — double-click to place, or drag it onto the panel` : row.name}
      ondragstart={(event) => dragStart(row, event)}
      onclick={() => onselect(row.id)}
      ondblclick={() => onplace(row)}
      onkeydown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); onplace(row); }
        else if (event.key === ' ') { event.preventDefault(); onselect(row.id); }
      }}
    >
      <span class="shot">
        {#if row.component}
          <EffectPreview control={row.component} boxWidth={148} boxHeight={78} padding={6} maxScale={2} label={row.name} />
        {:else}
          <i class="nocomp">no component</i>
        {/if}
      </span>

      <span class="cname">
        {row.name}
        {#if !row.valid}<TriangleAlert size={10} class="warnicon" aria-label={`${row.issues.length} issues`} />{/if}
      </span>
      <span class="cmeta">
        {row.parts} parts · {row.publicInputs + row.publicOutputs} api
        {#if row.useCount}· used {row.useCount}×{/if}
        {#if relativeTime(row.savedAt)}· {relativeTime(row.savedAt)}{/if}
      </span>

      {#if loss}
        <span class="loss" title={`The panel's own thumbnail draws ${loss.message} — ${loss.lostFromBottom} from the bottom of the stack and ${loss.lostFromTop} from the top. This one is the real renderer.`}>
          panel shows {loss.message}
        </span>
      {/if}

      <button
        type="button"
        class="pin"
        class:on={row.pinned}
        title={row.pinned ? 'Unpin' : 'Pin to the top'}
        aria-label={`${row.name} ${row.pinned ? 'pinned' : 'not pinned'}`}
        onclick={(event) => { event.stopPropagation(); onpin(row); }}
      ><Pin size={10} /></button>
    </div>
  {/each}

  {#if !rows.length}
    <p class="none">Nothing here. Save a custom component from the Publish tab, or clear the search.</p>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
    align-content: start;
    max-height: 320px;
    overflow-y: auto;
    padding: 1px;
    outline: none;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px;
    border: 1px solid #2E3540;
    border-radius: 5px;
    background: #12171A;
    cursor: grab;
    min-width: 0;
    outline: none;
  }
  .card:hover { border-color: #4A555E; }
  .card:active { cursor: grabbing; }
  .card:focus-visible { box-shadow: 0 0 0 1px #5B9BD5; }
  .card.sel { border-color: #5B9BD5; background: #173449; }
  .card.invalid { border-color: #5C3A3A; }
  .card.invalid.sel { border-color: #5B9BD5; }

  .shot {
    height: 78px;
    border: 1px solid #223038;
    border-radius: 3px;
    background: #0C0F12;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .nocomp { font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace; font-style: normal; color: #4B545C; }

  .cname {
    display: flex;
    align-items: center;
    gap: 4px;
    font: 500 10px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    color: #C3D0DA;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card.sel .cname { color: #EAF5FF; }
  .cname :global(.warnicon) { color: #D98C8C; flex: 0 0 auto; }

  .cmeta {
    font: 400 8px/1.3 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Says what the panel's own picture of this component leaves out. Not a warning about the
     component — a note about the other surface. */
  .loss {
    font: 400 7.5px/1.3 'IBM Plex Mono', ui-monospace, monospace;
    color: #8A7340;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pin {
    position: absolute;
    top: 7px;
    right: 7px;
    width: 17px;
    height: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid #333B42;
    border-radius: 3px;
    background: rgba(10, 14, 18, 0.78);
    color: #69737B;
    cursor: pointer;
  }
  .pin:hover { border-color: #4A555E; color: #E8EEF5; }
  .pin.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }

  .none {
    grid-column: 1 / -1;
    margin: 0;
    padding: 20px 12px;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
