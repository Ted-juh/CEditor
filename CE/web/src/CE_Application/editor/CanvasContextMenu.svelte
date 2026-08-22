<script>
  import { selectedComponentIds } from '../stores/panels.js';
  import { removeControl, duplicateControl, updateControlProperty, selectedControl, getSection, groupSelectionIntoContainer, ungroupContainer } from '../stores/controls.js';
  import { findControlById, flatControls, isContainerControl } from '../utils/containment.js';
  import { setFacet } from '../stores/editorFacet.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { requestPropertiesTab } from '../stores/propertiesTab.js';
  import { getBindableComponentPorts } from '../models/componentPorts.js';
  import { cutSelection, copySelection, pasteSelection, selectAll, hasClipboardContent } from '../stores/clipboard.js';
  import { bringToFront, bringForward, sendBackward, sendToBack } from '../stores/alignment.js';
  import { styleClipboard, copyControlStyle, applyStyleToSelection } from '../stores/styleClipboard.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { guides, clearGuides } from '../stores/guides.js';
  import { placeMenu, placeSubmenu } from '../utils/menuPlacement.js';

  // `target` is null when hidden, { screenX, screenY, panelX, panelY } when shown.
  // Parent binds to this so the menu can close itself.
  let { target = $bindable(null), panel = null } = $props();

  let sub = $state(null); // open submenu: 'edit' | 'order' | null

  function close() { target = null; sub = null; }

  // --- Placement (see utils/menuPlacement.js for why) ---
  // The menu used to be pinned straight to the pointer with no measurement at
  // all, so near a window edge it simply hung outside it. Measure first, place
  // second: the size is known only once the items are in the DOM, and it
  // depends on the selection (Ungroup, Edit, Device Bindings all come and go),
  // so this cannot be a constant.
  let menuEl = $state(null);
  let subEl = $state(null);
  let placed = $state(null);
  let subPlaced = $state(null);

  const viewportSize = () => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  });

  $effect(() => {
    // Re-measure whenever the menu opens somewhere new. Reading the rect is
    // untracked, so writing `placed` here cannot loop.
    const at = target;
    if (!at || !menuEl) { placed = null; return; }
    const rect = menuEl.getBoundingClientRect();
    placed = placeMenu(at.screenX, at.screenY, { width: rect.width, height: rect.height }, viewportSize());
  });

  $effect(() => {
    const which = sub;
    if (!which || !subEl) { subPlaced = null; return; }
    const itemRect = subEl.parentElement?.getBoundingClientRect();
    const rect = subEl.getBoundingClientRect();
    subPlaced = placeSubmenu(itemRect, { width: rect.width, height: rect.height }, viewportSize());
  });

  function cut()    { cutSelection(); close(); }
  function copy()   { copySelection(); close(); }
  function paste()  { pasteSelection(target ? { x: target.panelX, y: target.panelY } : null); close(); }
  function del()    { for (const id of [...$selectedComponentIds]) removeControl(id); close(); }
  function selAll() { selectAll(); close(); }
  function dupe()   { duplicateControl($selectedComponentIds); close(); }
  function align()  { displayTabRequest.set({ tab: 'align' }); close(); }
  function order(fn) { fn(); close(); }

  function toggleLock() {
    for (const id of $selectedComponentIds) {
      const ctrl = findControlById(panel?.controls ?? [], id);
      const locked = ctrl?._children?.Core?.locked ?? false;
      updateControlProperty(id, 'Core.locked', !locked);
    }
    close();
  }

  let allLocked = $derived.by(() => {
    if ($selectedComponentIds.size === 0 || !panel) return false;
    return flatControls(panel.controls)
      .filter(c => $selectedComponentIds.has(c._children?.Core?.id))
      .every(c => c._children?.Core?.locked === true);
  });

  // --- Group / Ungroup ---
  let singleContainerSelected = $derived(
    $selectedComponentIds.size === 1 && isContainerControl($selectedControl)
  );

  function group()   { groupSelectionIntoContainer(); close(); }
  function ungroup() {
    const id = $selectedControl?._children?.Core?.id;
    if (id) ungroupContainer(id);
    close();
  }

  // --- Single-selection contextual edit jumps (into the Look bar facets / Colors / Properties) ---
  let single = $derived($selectedComponentIds.size === 1);
  let control = $derived($selectedControl);
  let core = $derived(getSection(control, 'Core'));
  let background = $derived(getSection(control, 'Background'));
  let bgFill = $derived(background?._children?.Fill ?? null);
  let textFill = $derived(getSection(control, 'Text')?._children?.Fill ?? null);
  let hasFillColour = $derived(!!(bgFill || textFill));
  let bindable = $derived(control ? getBindableComponentPorts(control).length > 0 : false);

  let editFacets = $derived([
    getSection(control, 'Text') && { id: 'text', label: 'Text' },
    bgFill && { id: 'fill', label: 'Fill' },
    (background?._children?.Border || background?._children?.Corners) && { id: 'border', label: 'Border' },
    getSection(control, 'Transform') && { id: 'box', label: 'Box' },
    getSection(control, 'Effects') && { id: 'effects', label: 'Effects' },
    getSection(control, 'Icon') && { id: 'icon', label: 'Icon' },
  ].filter(Boolean));

  function editFacet(id) { setFacet(id); close(); }

  function editColour() {
    const target = bgFill
      ? { path: 'Background.Fill.colour', colour: bgFill.colour }
      : (textFill ? { path: 'Text.Fill.colour', colour: textFill.colour } : null);
    if (core?.id && target) {
      activateColorTarget({ type: 'control', controlId: core.id, path: target.path }, String(target.colour ?? 'FFFFFFFF'));
    }
    close();
  }

  function editBindings() { requestPropertiesTab('devicebindings'); close(); }
</script>

{#if target}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ctx-backdrop"
    onmousedown={close}
    oncontextmenu={(e) => { e.preventDefault(); close(); }}
  ></div>
  <!-- Hidden for the one frame between "rendered so it can be measured" and
       "measured, so we know where it goes" — a menu that visibly jumps into
       place reads as a glitch. -->
  <div
    class="ctx-menu"
    bind:this={menuEl}
    style="left:{placed ? placed.left : target.screenX}px; top:{placed ? placed.top : target.screenY}px; {placed?.clipped ? `max-height:${placed.maxHeight}px; overflow-y:auto;` : ''} visibility:{placed ? 'visible' : 'hidden'};"
  >
    <button class="ctx-item" disabled={$selectedComponentIds.size === 0} onclick={cut}>Cut<span class="ctx-shortcut">Ctrl+X</span></button>
    <button class="ctx-item" disabled={$selectedComponentIds.size === 0} onclick={copy}>Copy<span class="ctx-shortcut">Ctrl+C</span></button>
    <button class="ctx-item" disabled={!hasClipboardContent()} onclick={paste}>Paste Here<span class="ctx-shortcut">Ctrl+V</span></button>
    {#if single}
      <div class="ctx-separator"></div>
      {#if hasFillColour}
        <button class="ctx-item" onclick={editColour}>Edit Colour&hellip;</button>
      {/if}
      {#if editFacets.length > 0}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="ctx-sub-wrapper" onmouseenter={() => sub = 'edit'} onmouseleave={() => sub = null}>
          <button class="ctx-item">Edit<span class="ctx-arrow">&#9656;</span></button>
          {#if sub === 'edit'}
            <div
              class="ctx-submenu"
              class:flip-left={subPlaced?.side === 'left'}
              bind:this={subEl}
              style="top:{subPlaced ? subPlaced.top : -4}px;"
            >
              {#each editFacets as facet}
                <button class="ctx-item" onclick={() => editFacet(facet.id)}>{facet.label}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#if bindable}
        <button class="ctx-item" onclick={editBindings}>Device Bindings&hellip;</button>
      {/if}
    {/if}
    {#if $selectedComponentIds.size > 0}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={dupe}>Duplicate<span class="ctx-shortcut">Ctrl+D</span></button>
      <button class="ctx-item" disabled={!single} onclick={() => { copyControlStyle(); close(); }}>Copy Style<span class="ctx-shortcut">Ctrl+Alt+C</span></button>
      <button class="ctx-item" disabled={!$styleClipboard} onclick={() => { applyStyleToSelection(); close(); }}>Paste Style<span class="ctx-shortcut">Ctrl+Alt+V</span></button>
      <button class="ctx-item ctx-danger" onclick={del}>Delete<span class="ctx-shortcut">Del</span></button>
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={group}>Group into Container<span class="ctx-shortcut">Ctrl+G</span></button>
      {#if singleContainerSelected}
        <button class="ctx-item" onclick={ungroup}>Ungroup<span class="ctx-shortcut">Ctrl+Shift+G</span></button>
      {/if}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={align}>Align &amp; Layout&hellip;</button>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ctx-sub-wrapper" onmouseenter={() => sub = 'order'} onmouseleave={() => sub = null}>
        <button class="ctx-item">Order<span class="ctx-arrow">&#9656;</span></button>
        {#if sub === 'order'}
          <div
            class="ctx-submenu"
            class:flip-left={subPlaced?.side === 'left'}
            bind:this={subEl}
            style="top:{subPlaced ? subPlaced.top : -4}px;"
          >
            <button class="ctx-item" onclick={() => order(bringToFront)}>Bring to Front</button>
            <button class="ctx-item" onclick={() => order(bringForward)}>Bring Forward</button>
            <button class="ctx-item" onclick={() => order(sendBackward)}>Send Backward</button>
            <button class="ctx-item" onclick={() => order(sendToBack)}>Send to Back</button>
          </div>
        {/if}
      </div>
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={toggleLock}>{allLocked ? 'Unlock' : 'Lock'}</button>
    {/if}
    {#if panel && panel.controls.length > 0}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={selAll}>Select All<span class="ctx-shortcut">Ctrl+A</span></button>
    {/if}
    {#if $guides.horizontal.length > 0 || $guides.vertical.length > 0}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={() => { clearGuides(); close(); }}>Clear All Guides</button>
    {/if}
  </div>
{/if}

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 170px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    /* No overflow rule here on purpose — a menu taller than the window gets
       max-height + overflow-y written inline, because scrolling also clips the
       submenus that hang outside the box (overflow-x follows overflow-y to
       `auto`), and that trade is only worth making when the alternative is
       items nobody can reach. */
  }

  .ctx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .ctx-item:hover:not(:disabled) {
    background: #094771;
    color: #FFF;
  }

  .ctx-item:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .ctx-item.ctx-danger:hover {
    background: #6B1A1A;
  }

  .ctx-shortcut {
    color: #777;
    font-size: 11px;
    margin-left: 24px;
  }

  .ctx-item:hover .ctx-shortcut {
    color: #AAD;
  }

  .ctx-separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }

  .ctx-arrow {
    color: #777;
    font-size: 10px;
    margin-left: 24px;
  }

  .ctx-item:hover .ctx-arrow {
    color: #AAD;
  }

  .ctx-sub-wrapper {
    position: relative;
  }

  .ctx-submenu {
    position: absolute;
    left: 100%;
    min-width: 150px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 1001;
  }

  /* Rightward was hardcoded, so a menu opened near the right edge grew a
     submenu that started off-screen — worse than the parent menu's version of
     the same bug, because the parent at least had its first column visible. */
  .ctx-submenu.flip-left {
    left: auto;
    right: 100%;
  }
</style>
