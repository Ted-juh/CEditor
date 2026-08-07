<script>
  /**
   * The panel's layers — add, rename, reorder, hide, lock, and move the selection onto one.
   *
   * Listed TOP-FIRST, which is the opposite of the stored array. The array is paint order (index 0
   * furthest back) because that is what a renderer wants; a person reading a layer stack expects
   * the front layer at the top, the way every other tool shows it. Reversing here rather than in
   * the model keeps the renderer's job obvious and the reader's expectation intact.
   *
   * `Core.layer` holds the layer NAME, so renaming a layer has to move its controls with it — that
   * is why rename goes through the store action rather than editing the list in place.
   */
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Lock from 'lucide-svelte/icons/lock';
  import LockOpen from 'lucide-svelte/icons/lock-open';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';

  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import {
    addLayer, assignSelectionToLayer, moveLayer, removeLayer, renameLayer,
    setLayerLocked, setLayerVisible,
  } from '../stores/panelLayerActions.js';
  import { layerPopulation, normalizeLayerName, normalizePanelLayers } from '../utils/panelLayers.js';
  import { layerThumbnailUrl } from '../utils/layerThumbnail.js';

  let layers = $derived(normalizePanelLayers($activePanel?.layers, $activePanel?.controls ?? []));
  let population = $derived(layerPopulation(layers, $activePanel?.controls ?? []));
  let selectionCount = $derived($selectedComponentIds?.size ?? 0);

  // Controls grouped once, rather than filtering the whole list inside each row — on a
  // 400-control panel with several layers that is the difference between one pass and N.
  let byLayer = $derived.by(() => {
    const map = new Map();
    for (const control of $activePanel?.controls ?? []) {
      const name = normalizeLayerName(control?._children?.Core?.layer);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(control);
    }
    return map;
  });

  // Front-to-back for display; `index` stays the model index so the actions need no translation.
  let rows = $derived(layers.map((layer, index) => ({
    layer,
    index,
    // A locator, not a preview — see utils/layerThumbnail.js. Null for an empty layer, so the row
    // can say so rather than showing a blank box that reads as a broken image.
    thumb: layerThumbnailUrl(byLayer.get(layer.name) ?? [], $activePanel?.width ?? 0, $activePanel?.height ?? 0, 34),
    big: layerThumbnailUrl(byLayer.get(layer.name) ?? [], $activePanel?.width ?? 0, $activePanel?.height ?? 0, 150),
  })).reverse());

  let editingName = $state(null);
  let draftName = $state('');

  function beginRename(name) {
    editingName = name;
    draftName = name;
  }

  function commitRename() {
    if (editingName != null && draftName.trim() && draftName.trim() !== editingName) {
      renameLayer(editingName, draftName);
    }
    editingName = null;
  }
</script>

<div class="layers-tab">
  <div class="toolbar">
    <button class="tool" onclick={() => addLayer()} title="Add a layer">
      <Plus size={13} strokeWidth={1.8} /><span>Add layer</span>
    </button>
    <span class="hint">
      {#if selectionCount}
        {selectionCount} selected — click a layer's name badge to move {selectionCount === 1 ? 'it' : 'them'} there
      {:else}
        Front layer at the top
      {/if}
    </span>
  </div>

  <ul class="layer-list">
    {#each rows as { layer, index, thumb, big } (layer.name)}
      <li class="layer-row" class:hidden={layer.visible === false} class:locked={layer.locked}>
        <span class="thumb-slot">
          {#if thumb}
            <img class="thumb" src={thumb.url} width={thumb.width} height={thumb.height} alt="" />
            {#if big}
              <span class="thumb-pop"><img src={big.url} width={big.width} height={big.height} alt="" /></span>
            {/if}
          {:else}
            <span class="thumb-empty" title="Nothing on this layer yet">empty</span>
          {/if}
        </span>
        <button
          class="icon"
          title={layer.visible === false ? 'Show layer' : 'Hide layer'}
          onclick={() => setLayerVisible(layer.name, layer.visible === false)}
        >
          {#if layer.visible === false}<EyeOff size={13} strokeWidth={1.7} />{:else}<Eye size={13} strokeWidth={1.7} />{/if}
        </button>

        <button
          class="icon"
          title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          onclick={() => setLayerLocked(layer.name, !layer.locked)}
        >
          {#if layer.locked}<Lock size={13} strokeWidth={1.7} />{:else}<LockOpen size={13} strokeWidth={1.7} />{/if}
        </button>

        {#if editingName === layer.name}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="name-input"
            autofocus
            bind:value={draftName}
            onblur={commitRename}
            onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') editingName = null; }}
          />
        {:else}
          <button class="name" ondblclick={() => beginRename(layer.name)} onclick={() => assignSelectionToLayer(layer.name)}
                  title={selectionCount ? `Move ${selectionCount} selected here (double-click to rename)` : 'Double-click to rename'}>
            {layer.name}
          </button>
        {/if}

        <span class="count" title="Controls on this layer">{population.get(layer.name) ?? 0}</span>

        <button class="icon" title="Bring layer forward" disabled={index === layers.length - 1}
                onclick={() => moveLayer(layer.name, index + 1)}>
          <ChevronUp size={13} strokeWidth={1.7} />
        </button>
        <button class="icon" title="Send layer backward" disabled={index === 0}
                onclick={() => moveLayer(layer.name, index - 1)}>
          <ChevronDown size={13} strokeWidth={1.7} />
        </button>
        <button class="icon danger" title="Delete layer (its controls move to the next one down)"
                disabled={layers.length <= 1} onclick={() => removeLayer(layer.name)}>
          <Trash2 size={13} strokeWidth={1.7} />
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .layers-tab { display: flex; flex-direction: column; gap: 8px; padding: 10px; height: 100%; box-sizing: border-box; }
  .toolbar { display: flex; align-items: center; gap: 10px; }
  .tool { display: inline-flex; align-items: center; gap: 5px; background: #232323; color: #DDD; border: 1px solid #383838;
          border-radius: 3px; padding: 4px 8px; font-size: 11px; cursor: pointer; }
  .tool:hover { background: #2C2C2C; border-color: #4A4A4A; }
  .hint { color: #777; font-size: 11px; }

  .layer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
  .layer-row { position: relative; display: flex; align-items: center; gap: 3px; padding: 4px 5px; border-radius: 3px;
               background: #1E1E1E; border: 1px solid #2C2C2C; }

  /* Fixed box, letterboxed content: a portrait panel and a landscape one both sit in the same
     row height without either being stretched into a lie about its shape. */
  /* Deliberately NOT position:relative. The blow-up lives inside this element in the markup, so a
     relative slot becomes its offset parent and "right: 8px" means 8px from the right of a 36px
     box at the far left — which put the pop straight back over the thumbnails it came from. The
     ROW is the offset parent; the slot only groups the markup. */
  .thumb-slot { width: 36px; height: 36px; flex-shrink: 0; display: flex;
                align-items: center; justify-content: center; background: #141414; border: 1px solid #2A2A2A;
                border-radius: 2px; margin-right: 4px; }
  .thumb { display: block; image-rendering: auto; }
  .thumb-empty { color: #555; font-size: 8px; letter-spacing: 0.3px; }

  /* The blow-up. Anchored to the ROW's right edge, not to the thumbnail: growing rightward from a
     36px slot at the far left put it straight over the eye, lock and name of two rows. It could
     still be clicked through (pointer-events: none) but you cannot read what you are pointing at,
     which is most of the reason to look. The right side of a layer row is empty, so it goes there.
     Absolute, so it never resizes a row and never pushes the list around. */
  .thumb-pop { display: none; position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
               z-index: 40; padding: 6px; background: #101010; border: 1px solid #3A3A3A; border-radius: 4px;
               box-shadow: 0 6px 20px rgba(0,0,0,0.6); pointer-events: none; }
  .thumb-slot:hover .thumb-pop { display: block; }
  .thumb-pop img { display: block; }

  .layer-row.hidden .thumb { opacity: 0.3; }
  .layer-row:hover { background: #242424; }
  .layer-row.hidden .name { color: #666; text-decoration: line-through; }
  .layer-row.locked { border-color: #3A3226; }

  .icon { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0;
          background: transparent; color: #999; border: none; border-radius: 3px; cursor: pointer; }
  .icon:hover:not(:disabled) { background: #303030; color: #DDD; }
  .icon:disabled { opacity: 0.25; cursor: default; }
  .icon.danger:hover:not(:disabled) { background: #3A2020; color: #E88; }

  .name { flex: 1; min-width: 0; text-align: left; background: transparent; border: none; color: #DDD; font-size: 11px;
          font-family: inherit; padding: 3px 4px; border-radius: 3px; cursor: pointer; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap; }
  .name:hover { background: #2E2E2E; }
  .name-input { flex: 1; min-width: 0; background: #141414; color: #DDD; border: 1px solid #5B9BD5; border-radius: 3px;
                font-size: 11px; font-family: inherit; padding: 2px 4px; outline: none; }

  .count { color: #666; font-size: 10px; min-width: 22px; text-align: right; flex-shrink: 0; }
</style>
