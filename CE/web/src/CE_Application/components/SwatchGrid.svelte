<script>
  /**
   * The shared 24-cell swatch grid (Colors, Gradient and Notepad tabs), now
   * with named palettes, one gesture per meaning, and an undo.
   *
   * WHAT IT USED TO DO, AND WHY THAT WAS WRONG. Three gestures were stacked on
   * a 14px target: click stored-or-applied, right-click overwrote, and
   * double-click cleared the cell permanently with no undo anywhere in the
   * app. Two of those are destructive, both were silent, and the double-click
   * is the one a shaky click produces by accident. The target was also smaller
   * than the pointer that had to hit it.
   *
   * Now: LEFT CLICK is the only thing a stray click can do, and it is the
   * harmless one. Everything destructive lives in the cell's context menu (or
   * the Delete key), goes through `rememberUndo`, and can be taken back from
   * the Undo button that appears next to the palette name. Cells are a third
   * of a row instead of a twelfth, so they are big enough to aim at.
   *
   * The `onclick` / `ondblclick` / `oncontextmenu` prop names are the contract
   * with three parent tabs, so they are unchanged — but `ondblclick` is now
   * "clear this cell" invoked from the menu, and `oncontextmenu` is "replace
   * with the current colour", also from the menu. Double-click itself no
   * longer destroys anything.
   */
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import { paletteLibrary, selectPalette, newPalette, renameActivePalette, removePalette, saveActiveColors } from '../stores/palettes.js';
  import { activePalette, PALETTE_SIZE } from '../utils/paletteLibrary.js';
  import { swatchAction, swatchMenuItems, swatchTitle, undoFor, applyUndo } from '../utils/swatchGestures.js';

  let {
    swatches = [],
    label = 'Colors',
    onclick = null,
    ondblclick = null,      // (index) => void — clear the cell
    oncontextmenu = null,   // (index, event) => void — replace with current colour
    getTitle = null,        // (swatch, i) => string — optional title override
  } = $props();

  // --- Palette library ---------------------------------------------------
  // The `swatches` array stays the live working copy the parent tabs read and
  // write; this component keeps it in step with whichever named palette is
  // active. Loading is guarded by a plain variable, not $state: it must not be
  // a dependency of the effect that sets it.
  let loadedPaletteId = null;
  let renaming = $state(false);
  let renameDraft = $state('');

  let current = $derived(activePalette($paletteLibrary));

  $effect(() => {
    const palette = activePalette($paletteLibrary);
    if (!palette || palette.id === loadedPaletteId) return;
    loadedPaletteId = palette.id;
    for (let i = 0; i < PALETTE_SIZE; i++) swatches[i] = palette.colors[i] ?? null;
  });

  $effect(() => {
    // Reading every cell is what subscribes this effect to swatch edits made
    // anywhere — including the parent tabs, which write the array directly.
    const snapshot = Array.from({ length: PALETTE_SIZE }, (_, i) => swatches[i] ?? null);
    if (loadedPaletteId == null) return;
    saveActiveColors(snapshot);
  });

  function handlePaletteSelect(event) {
    selectPalette(event.target.value);
    closeMenu();
  }

  function startRename() {
    renameDraft = current?.name ?? '';
    renaming = true;
  }

  function commitRename() {
    if (!renaming) return;
    renaming = false;
    renameActivePalette(renameDraft);
  }

  function handleRenameKeydown(event) {
    if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
    else if (event.key === 'Escape') { event.preventDefault(); renaming = false; }
  }

  function handleNewPalette() {
    // A new palette starts empty, not as a copy — "New" that silently
    // duplicated 24 colours would make the two impossible to tell apart.
    newPalette('Palette');
    closeMenu();
  }

  function handleDeletePalette() {
    const doomed = current;
    if (!doomed || $paletteLibrary.palettes.length <= 1) return;
    undo = { kind: 'palette', name: doomed.name, colors: [...doomed.colors] };
    removePalette(doomed.id);
    closeMenu();
  }

  // --- Undo --------------------------------------------------------------
  // One step is enough for the mistake this guards against (a cell cleared or
  // overwritten by accident); anything deeper belongs in the document's own
  // history, and swatches are not part of the document.
  let undo = $state(null);

  function rememberUndo(index) {
    undo = undoFor(swatches, index);
  }

  function handleUndo() {
    if (!undo) return;
    if (undo.kind === 'cell') {
      // Writes straight into the parent's array — the same direct mutation
      // GradientTab uses to store a stop colour. There is no "restore" callback
      // in the prop contract, and inventing one would mean editing three tabs.
      applyUndo(swatches, undo);
    } else if (undo.kind === 'palette') {
      newPalette(undo.name, undo.colors);
    }
    undo = null;
  }

  // --- Cell menu ---------------------------------------------------------
  let menuIndex = $state(null);
  let menuX = $state(0);
  let menuY = $state(0);
  let gridEl = $state(null);

  function openMenu(index, event) {
    event.preventDefault();
    const host = gridEl?.getBoundingClientRect();
    const cell = event.currentTarget?.getBoundingClientRect?.();
    menuX = cell && host ? Math.max(0, cell.left - host.left) : 0;
    menuY = cell && host ? cell.bottom - host.top + 2 : 0;
    menuIndex = index;
  }

  function closeMenu() {
    menuIndex = null;
  }

  // A menu that only closes when the pointer happens to leave it is a menu
  // that gets left open. Escape and a click anywhere else both dismiss it.
  $effect(() => {
    if (menuIndex === null) return;
    const onDown = (event) => { if (!gridEl?.contains(event.target)) closeMenu(); };
    const onKey = (event) => { if (event.key === 'Escape') closeMenu(); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  });

  function handleCellKeydown(index, event) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      dispatch('delete', index, event);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      dispatch('contextmenu', index, event);
    } else if (event.key === 'Escape') {
      closeMenu();
    }
  }

  /**
   * Every gesture goes through the shared table in `utils/swatchGestures.js`
   * rather than deciding for itself — that table is the only place the meaning
   * of a click is written down, and it is what stops a second job attaching
   * itself to a gesture again.
   */
  function dispatch(gesture, index, event) {
    switch (swatchAction(gesture, { hasColour: !!swatches[index] })) {
      case 'use':
      case 'store': useCell(index); break;
      case 'menu':  openMenu(index, event); break;
      case 'clear': clearCell(index); break;
      default: break;
    }
  }

  function clearCell(index) {
    if (!swatches[index]) return;
    rememberUndo(index);
    ondblclick?.(index);
    closeMenu();
  }

  function replaceCell(index, event) {
    rememberUndo(index);
    oncontextmenu?.(index, event);
    closeMenu();
  }

  function useCell(index) {
    onclick?.(index);
    closeMenu();
  }

  function runMenuItem(id, index, event) {
    if (id === 'use') useCell(index);
    else if (id === 'replace') replaceCell(index, event);
    else if (id === 'clear') clearCell(index);
  }

  const defaultTitle = swatchTitle;
</script>

<div class="sidebar-swatches" bind:this={gridEl}>
  <div class="palette-bar">
    {#if renaming}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="palette-name-input"
        value={renameDraft}
        oninput={(e) => renameDraft = e.target.value}
        onkeydown={handleRenameKeydown}
        onblur={commitRename}
        aria-label="Palette name"
        autofocus
      />
    {:else}
      <select class="palette-select" value={current?.id} onchange={handlePaletteSelect} aria-label="{label} palette" title="Palette">
        {#each $paletteLibrary.palettes as palette (palette.id)}
          <option value={palette.id}>{palette.name}</option>
        {/each}
      </select>
      <button class="palette-btn" onclick={startRename} title="Rename palette" aria-label="Rename palette">
        <Pencil size={11} strokeWidth={1.8} />
      </button>
      <button class="palette-btn" onclick={handleNewPalette} title="New palette" aria-label="New palette">
        <Plus size={12} strokeWidth={1.8} />
      </button>
      <button
        class="palette-btn"
        onclick={handleDeletePalette}
        disabled={$paletteLibrary.palettes.length <= 1}
        title={$paletteLibrary.palettes.length <= 1 ? 'The last palette cannot be deleted' : 'Delete palette'}
        aria-label="Delete palette"
      >
        <Trash2 size={11} strokeWidth={1.8} />
      </button>
    {/if}
    {#if undo}
      <button class="palette-btn undo" onclick={handleUndo} title="Undo the last swatch change" aria-label="Undo the last swatch change">
        <Undo2 size={11} strokeWidth={1.8} />
      </button>
    {/if}
  </div>

  <div class="swatches-grid">
    {#each swatches as swatch, i}
      <button
        class="swatch"
        class:empty={!swatch}
        class:menu-open={menuIndex === i}
        style={swatch ? `background: #${swatch}` : ''}
        onclick={(e) => dispatch('click', i, e)}
        ondblclick={(e) => dispatch('dblclick', i, e)}
        oncontextmenu={(e) => dispatch('contextmenu', i, e)}
        onkeydown={(e) => handleCellKeydown(i, e)}
        title={getTitle?.(swatch, i) ?? defaultTitle(swatch)}
        aria-label={swatch ? `Swatch ${i + 1}, #${swatch}` : `Swatch ${i + 1}, empty`}
      ></button>
    {/each}
  </div>

  {#if menuIndex !== null}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="cell-menu" style="left: {menuX}px; top: {menuY}px" role="menu" tabindex="-1" onmouseleave={closeMenu}>
      {#each swatchMenuItems(!!swatches[menuIndex]) as item (item.id)}
        <button
          class="cell-menu-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onclick={(e) => runMenuItem(item.id, menuIndex, e)}
        >{item.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sidebar-swatches {
    position: relative;
    flex: 1;
    border-top: 1px solid #333;
    padding: 4px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
  }

  .palette-bar {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .palette-select,
  .palette-name-input {
    flex: 1;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    font-family: inherit;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 4px;
    border-radius: 3px;
    outline: none;
  }

  .palette-select:focus,
  .palette-name-input:focus {
    border-color: #5B9BD5;
  }

  .palette-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    padding: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    color: #777;
    cursor: pointer;
  }

  .palette-btn:hover:not(:disabled) {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .palette-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .palette-btn.undo {
    color: #F2B04A;
    border-color: #5A4620;
  }

  /* Eight across, not twelve: a cell is a target, and a 14px one is smaller
     than the finger or the cursor hotspot aiming at it. */
  .swatches-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 3px;
    width: 100%;
  }

  .swatch {
    aspect-ratio: 1;
    min-height: 20px;
    border: 1px solid #333;
    border-radius: 3px;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    transition: border-color 0.1s;
  }

  .swatch:hover { border-color: #5B9BD5; }
  .swatch:focus-visible { outline: 2px solid #5B9BD5; outline-offset: 1px; }
  .swatch.menu-open { border-color: #5B9BD5; }

  .swatch.empty {
    background: #333;
    border-style: dashed;
  }
  .swatch.empty:hover { border-color: #5B9BD5; }

  .cell-menu {
    position: absolute;
    z-index: 20;
    min-width: 150px;
    background: #1E1E1E;
    border: 1px solid #444;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    padding: 2px;
    display: flex;
    flex-direction: column;
  }

  .cell-menu-item {
    background: none;
    border: none;
    color: #DDD;
    font-family: inherit;
    font-size: 11px;
    text-align: left;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
  }

  .cell-menu-item:hover:not(:disabled) { background: #094771; }
  .cell-menu-item:disabled { color: #666; cursor: default; }
  .cell-menu-item.danger:hover:not(:disabled) { background: #6B2020; }
</style>
