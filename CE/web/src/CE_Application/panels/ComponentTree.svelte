<script module>
  // Collapse state survives the tree being toggled off/on (which unmounts this
  // component) and is keyed per panel so it doesn't leak across documents.
  const collapsedByPanel = new Map();
</script>

<script>
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Lock from 'lucide-svelte/icons/lock';
  import LockOpen from 'lucide-svelte/icons/lock-open';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Search from 'lucide-svelte/icons/search';
  import { activePanel, selectedComponentIds, selectComponent, keyObjectId } from '../stores/panels.js';
  import { applyControlPatchesById, updateControlProperty, reparentControls, removeControl, duplicateControl, groupSelectionIntoContainer, ungroupContainer } from '../stores/controls.js';
  import { bringToFront, bringForward, sendBackward, sendToBack } from '../stores/alignment.js';
  import { getSection } from '../models/componentTypes.js';
  import { getControlId, getControlLayer, sortControlsForRender } from '../utils/controlOrder.js';
  import { isEditableTarget } from '../utils/globalShortcuts.js';
  import {
    controlPanelRect,
    findControlById,
    findParentOfControl,
    flatControls,
    getAncestorIds,
    getChildControls,
    isContainerControl,
    isDescendantOfControl,
    panelToLocalPoint,
    selectionRoots,
  } from '../utils/containment.js';

  // Collapsed container ids (expanded by default), loaded per panel.
  let collapsedIds = $state(new Set());
  let collapsePanelId = null;
  $effect(() => {
    const pid = $activePanel?.id ?? null;
    if (pid !== collapsePanelId) {
      collapsePanelId = pid;
      collapsedIds = new Set(collapsedByPanel.get(pid) ?? []);
    }
  });

  function setCollapsed(next) {
    collapsedIds = next;
    if (collapsePanelId != null) collapsedByPanel.set(collapsePanelId, next);
  }

  function toggleCollapsed(id) {
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  }

  // --- Filter ---
  let filterText = $state('');
  let filtering = $derived(filterText.trim().length > 0);

  // Flattened display rows: depth-first, siblings front-to-back (top of list =
  // front/highest z), respecting collapsed containers. While filtering,
  // matches and their ancestors are shown and collapse is ignored.
  let rows = $derived.by(() => {
    if (!$activePanel) return [];
    const controls = $activePanel.controls;

    const query = filterText.trim().toLowerCase();
    let visibleSet = null;
    if (query) {
      visibleSet = new Set();
      for (const ctrl of flatControls(controls)) {
        const core = ctrl._children?.Core;
        const name = String(core?.name ?? '').toLowerCase();
        const type = String(core?.controlType ?? '').toLowerCase();
        if (name.includes(query) || type.includes(query)) {
          visibleSet.add(core?.id);
          for (const ancestorId of getAncestorIds(controls, core?.id)) visibleSet.add(ancestorId);
        }
      }
    }

    const out = [];
    const visit = (list, depth, inheritedHidden, inheritedLocked) => {
      for (const ctrl of [...sortControlsForRender(list)].reverse()) {
        const id = getControlId(ctrl);
        if (visibleSet && !visibleSet.has(id)) continue;
        const container = isContainerControl(ctrl);
        const core = ctrl._children?.Core;
        const hidden = core?.visible === false;
        const locked = core?.locked === true;
        out.push({ ctrl, id, depth, container, inheritedHidden, inheritedLocked });
        if (container && (query || !collapsedIds.has(id))) {
          visit(getChildControls(ctrl), depth + 1, inheritedHidden || hidden, inheritedLocked || locked);
        }
      }
    };
    visit(controls, 0, false, false);
    return out;
  });

  let totalCount = $derived($activePanel ? flatControls($activePanel.controls).length : 0);

  // --- Reveal: canvas selection must be findable in the tree ---
  let treeListEl = $state(null);
  let lastRevealedId = null;
  $effect(() => {
    const ids = $selectedComponentIds;
    const panel = $activePanel;
    if (!panel || ids.size === 0) { lastRevealedId = null; return; }
    const first = [...ids][0];
    if (first === lastRevealedId) return;
    lastRevealedId = first;

    // Expand collapsed ancestors so the selected row actually renders.
    const ancestors = getAncestorIds(panel.controls, first);
    if (ancestors.some((a) => collapsedIds.has(a))) {
      const next = new Set(collapsedIds);
      for (const a of ancestors) next.delete(a);
      setCollapsed(next);
    }

    requestAnimationFrame(() => {
      treeListEl
        ?.querySelector(`[data-tree-id="${CSS.escape(String(first))}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

  // --- Rename ---
  let renamingId = $state(null);
  let renameValue = $state('');

  function startRename(id, name) {
    renamingId = id;
    renameValue = name;
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      updateControlProperty(renamingId, 'Core.name', renameValue.trim());
    }
    renamingId = null;
  }

  function handleRenameKeyDown(e) {
    if (e.key === 'Enter') { commitRename(); }
    else if (e.key === 'Escape') { renamingId = null; }
  }

  // F2 renames the selected component — the same convention the code editor
  // and behavior designer already use.
  function handleWindowKeyDown(e) {
    if (e.key !== 'F2' || isEditableTarget(e.target)) return;
    const ids = $selectedComponentIds;
    if (ids.size !== 1) return;
    const id = [...ids][0];
    const core = findControlById($activePanel?.controls ?? [], id)?._children?.Core;
    if (!core) return;
    e.preventDefault();
    startRename(id, core.name ?? '');
  }

  // --- Selection ---
  function handleItemClick(id, e) {
    if (e.shiftKey && $keyObjectId != null) {
      // Range-select between the anchor (key object) and the clicked row,
      // in display order. Ctrl+Shift adds the range to the selection.
      const ids = rows.map((row) => row.id);
      const a = ids.indexOf($keyObjectId);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ids.slice(lo, hi + 1);
        if (e.ctrlKey || e.metaKey) {
          selectedComponentIds.update((s) => new Set([...s, ...range]));
        } else {
          selectedComponentIds.set(new Set(range));
        }
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      selectComponent(id, true);
    } else {
      selectComponent(id, false);
    }
  }

  // --- Visibility / Lock toggles ---
  // Acting on a row that is part of a multi-selection applies to the whole
  // selection; hiding 12 layers should not take 12 clicks.
  function idsForRowAction(id) {
    const sel = $selectedComponentIds;
    return sel.has(id) && sel.size > 1 ? [...sel] : [id];
  }

  function toggleVisible(id, current) {
    for (const targetId of idsForRowAction(id)) updateControlProperty(targetId, 'Core.visible', !current);
  }

  function toggleLocked(id, current) {
    for (const targetId of idsForRowAction(id)) updateControlProperty(targetId, 'Core.locked', !current);
  }

  // --- Context menu ---
  let ctxMenu = $state(null); // { x, y, id } | null

  function openContextMenu(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!$selectedComponentIds.has(id)) selectComponent(id, false);
    // Clamp so the menu never opens off-screen.
    const MENU_W = 200;
    const MENU_H = 330;
    ctxMenu = {
      x: Math.max(0, Math.min(e.clientX, window.innerWidth - MENU_W)),
      y: Math.max(0, Math.min(e.clientY, window.innerHeight - MENU_H)),
      id,
    };
  }

  function closeCtx() { ctxMenu = null; }

  let ctxControl = $derived(ctxMenu ? findControlById($activePanel?.controls ?? [], ctxMenu.id) : null);
  let ctxCore = $derived(ctxControl?._children?.Core ?? null);
  let ctxIsContainer = $derived(ctxControl ? isContainerControl(ctxControl) : false);
  let ctxSingle = $derived($selectedComponentIds.size <= 1);

  function ctxRename() {
    if (ctxMenu && ctxCore) startRename(ctxMenu.id, ctxCore.name ?? '');
    closeCtx();
  }

  function ctxDuplicate() {
    duplicateControl($selectedComponentIds.size > 0 ? $selectedComponentIds : [ctxMenu.id]);
    closeCtx();
  }

  function ctxDelete() {
    const ids = $selectedComponentIds.size > 0 ? [...$selectedComponentIds] : [ctxMenu.id];
    for (const id of ids) removeControl(id);
    closeCtx();
  }

  function ctxGroup() { groupSelectionIntoContainer(); closeCtx(); }
  function ctxUngroup() {
    if (ctxMenu && ctxIsContainer) ungroupContainer(ctxMenu.id);
    closeCtx();
  }

  function ctxOrder(fn) { fn(); closeCtx(); }

  function ctxToggleVisible() {
    if (ctxMenu) toggleVisible(ctxMenu.id, ctxCore?.visible !== false);
    closeCtx();
  }

  function ctxToggleLocked() {
    if (ctxMenu) toggleLocked(ctxMenu.id, ctxCore?.locked ?? false);
    closeCtx();
  }

  // --- Drag: reorder z-order (above/below) or nest into a container (onto) ---
  // Dragging a row that belongs to the selection moves the whole selection
  // (its roots); dragging an unselected row moves just that row.
  let dragOverId = $state(null);
  let dragOverPos = $state(null); // 'above' | 'below' | 'inside'
  let dragSourceIds = $state([]);

  function resetDragState() {
    dragOverId = null;
    dragOverPos = null;
    dragSourceIds = [];
  }

  function handleDragStart(id, e) {
    const sel = $selectedComponentIds;
    dragSourceIds = sel.has(id) && sel.size > 1
      ? selectionRoots($activePanel?.controls ?? [], sel)
      : [id];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(id, container, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSourceIds.length === 0 || dragSourceIds.includes(id)) { dragOverId = null; return; }
    // Never allow dropping a container into its own subtree
    if ($activePanel && dragSourceIds.some((sourceId) => isDescendantOfControl($activePanel.controls, sourceId, id))) {
      dragOverId = null;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    dragOverId = id;
    if (container && relY > 0.3 && relY < 0.7) {
      // Middle band of a container row → nest inside
      dragOverPos = 'inside';
    } else {
      dragOverPos = relY < 0.5 ? 'above' : 'below';
    }
  }

  function handleDragLeave() {
    dragOverId = null;
    dragOverPos = null;
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!$activePanel || dragSourceIds.length === 0 || !dragOverId || dragSourceIds.includes(dragOverId)) {
      resetDragState();
      return;
    }

    const controls = $activePanel.controls;
    const sources = dragSourceIds
      .map((id) => findControlById(controls, id))
      .filter(Boolean);
    const target = findControlById(controls, dragOverId);
    if (sources.length === 0 || !target) { resetDragState(); return; }

    if (dragOverPos === 'inside') {
      // Nest into the target container, keeping each visual position
      if (isContainerControl(target)) {
        const entries = [];
        for (const source of sources) {
          const sourceId = getControlId(source);
          const rect = controlPanelRect(controls, sourceId);
          if (!rect) continue;
          const local = panelToLocalPoint(controls, dragOverId, rect.x, rect.y);
          entries.push({ id: sourceId, x: local.x, y: local.y });
        }
        if (entries.length) reparentControls(entries, dragOverId);
      }
      resetDragState();
      return;
    }

    // Above/below → z-reorder among the TARGET's siblings. Layer compatibility
    // is checked BEFORE any mutation — the old flow reparented first and then
    // aborted the reorder, leaving a half-applied move.
    const targetLayer = getControlLayer(target);
    if (sources.some((source) => getControlLayer(source) !== targetLayer)) {
      resetDragState();
      return;
    }

    // Reparent sources living under a different parent (keeping visual position).
    const targetParent = findParentOfControl(controls, dragOverId);
    const targetParentId = targetParent ? getControlId(targetParent) : null;
    const reparentEntries = [];
    for (const source of sources) {
      const sourceId = getControlId(source);
      const sourceParent = findParentOfControl(controls, sourceId);
      const sourceParentId = sourceParent ? getControlId(sourceParent) : null;
      if (sourceParentId === targetParentId) continue;
      const rect = controlPanelRect(controls, sourceId);
      if (!rect) continue;
      const local = panelToLocalPoint(controls, targetParentId, rect.x, rect.y);
      reparentEntries.push({ id: sourceId, x: local.x, y: local.y });
    }
    if (reparentEntries.length) reparentControls(reparentEntries, targetParentId);

    // Re-read the (possibly reparented) tree for the sibling reorder
    const nextControls = $activePanel.controls;
    const parent = findParentOfControl(nextControls, dragOverId);
    const siblings = parent ? getChildControls(parent) : nextControls;
    const displayLayer = [...sortControlsForRender(siblings)].reverse().filter((c) => getControlLayer(c) === targetLayer);

    const movedSet = new Set(dragSourceIds);
    const movedItems = displayLayer.filter((c) => movedSet.has(getControlId(c)));
    if (movedItems.length === 0) { resetDragState(); return; }

    const reorderedDisplayLayer = displayLayer.filter((c) => !movedSet.has(getControlId(c)));
    let targetIndex = reorderedDisplayLayer.findIndex((c) => getControlId(c) === dragOverId);
    if (targetIndex < 0) { resetDragState(); return; }

    if (dragOverPos === 'below') targetIndex += 1;
    reorderedDisplayLayer.splice(targetIndex, 0, ...movedItems);

    const patches = new Map(
      [...reorderedDisplayLayer].reverse().map((control, index) => [getControlId(control), { 'Core.zIndex': index }])
    );
    applyControlPatchesById(patches);

    resetDragState();
  }

  function handleDragEnd() {
    resetDragState();
  }
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div class="tree-panel">
  <div class="tree-header">
    <span class="tree-title">Components</span>
    <span class="tree-count">{totalCount}</span>
  </div>

  <div class="tree-filter">
    <Search size={11} strokeWidth={1.5} />
    <input
      class="filter-input"
      type="text"
      placeholder="Filter by name or type"
      bind:value={filterText}
    />
    {#if filtering}
      <button class="filter-clear" title="Clear filter" onclick={() => filterText = ''}>×</button>
    {/if}
  </div>

  <div class="tree-list" bind:this={treeListEl}>
    {#if rows.length === 0}
      <div class="tree-empty">{filtering ? 'No matches' : 'No components'}</div>
    {:else}
      {#each rows as row (row.id)}
        {@const core = getSection(row.ctrl, 'Core')}
        {@const id = row.id}
        {@const isSelected = $selectedComponentIds.has(id)}
        {@const isKey = $keyObjectId === id && $selectedComponentIds.size > 1}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="tree-item"
          class:selected={isSelected}
          class:key-object={isKey}
          class:hidden-item={core?.visible === false || row.inheritedHidden}
          class:drag-above={dragOverId === id && dragOverPos === 'above'}
          class:drag-below={dragOverId === id && dragOverPos === 'below'}
          class:drag-inside={dragOverId === id && dragOverPos === 'inside'}
          style="padding-left: {10 + row.depth * 14}px"
          data-tree-id={id}
          onclick={(e) => handleItemClick(id, e)}
          ondblclick={() => startRename(id, core?.name ?? '')}
          oncontextmenu={(e) => openContextMenu(id, e)}
          draggable="true"
          ondragstart={(e) => handleDragStart(id, e)}
          ondragover={(e) => handleDragOver(id, row.container, e)}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
          ondragend={handleDragEnd}
        >
          {#if row.container}
            <button
              class="collapse-toggle"
              title={collapsedIds.has(id) ? 'Expand' : 'Collapse'}
              onclick={(e) => { e.stopPropagation(); toggleCollapsed(id); }}
            >
              {#if collapsedIds.has(id) && !filtering}
                <ChevronRight size={11} strokeWidth={1.5} />
              {:else}
                <ChevronDown size={11} strokeWidth={1.5} />
              {/if}
            </button>
          {:else}
            <span class="collapse-spacer"></span>
          {/if}

          <span class="item-type" title={core?.controlType}>{core?.controlType ?? '?'}</span>

          {#if renamingId === id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="rename-input"
              type="text"
              bind:value={renameValue}
              onblur={commitRename}
              onkeydown={handleRenameKeyDown}
              onfocus={(e) => e.target.select()}
              autofocus
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span class="item-name" title={core?.name}>{core?.name ?? ''}</span>
          {/if}

          <div class="item-actions">
            {#if row.inheritedLocked}
              <span class="inherited-icon" title="Locked by a parent container"><Lock size={10} strokeWidth={1.5} /></span>
            {/if}
            <button
              class="action-icon"
              class:off={core?.visible === false}
              title={core?.visible !== false ? 'Hide' : 'Show'}
              onclick={(e) => { e.stopPropagation(); toggleVisible(id, core?.visible !== false); }}
            >
              {#if core?.visible !== false}
                <Eye size={12} strokeWidth={1.5} />
              {:else}
                <EyeOff size={12} strokeWidth={1.5} />
              {/if}
            </button>
            <button
              class="action-icon"
              class:on={core?.locked}
              title={core?.locked ? 'Unlock' : 'Lock'}
              onclick={(e) => { e.stopPropagation(); toggleLocked(id, core?.locked ?? false); }}
            >
              {#if core?.locked}
                <Lock size={12} strokeWidth={1.5} />
              {:else}
                <LockOpen size={12} strokeWidth={1.5} />
              {/if}
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if ctxMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ctx-backdrop"
    onmousedown={closeCtx}
    oncontextmenu={(e) => { e.preventDefault(); closeCtx(); }}
  ></div>
  <div class="ctx-menu" style="left:{ctxMenu.x}px; top:{ctxMenu.y}px;">
    {#if ctxSingle}
      <button class="ctx-item" onclick={ctxRename}>Rename<span class="ctx-shortcut">F2</span></button>
    {/if}
    <button class="ctx-item" onclick={ctxDuplicate}>Duplicate<span class="ctx-shortcut">Ctrl+D</span></button>
    <button class="ctx-item ctx-danger" onclick={ctxDelete}>Delete<span class="ctx-shortcut">Del</span></button>
    <div class="ctx-separator"></div>
    <button class="ctx-item" onclick={ctxGroup}>Group into Container<span class="ctx-shortcut">Ctrl+G</span></button>
    {#if ctxSingle && ctxIsContainer}
      <button class="ctx-item" onclick={ctxUngroup}>Ungroup<span class="ctx-shortcut">Ctrl+Shift+G</span></button>
    {/if}
    <div class="ctx-separator"></div>
    <button class="ctx-item" onclick={() => ctxOrder(bringToFront)}>Bring to Front</button>
    <button class="ctx-item" onclick={() => ctxOrder(bringForward)}>Bring Forward</button>
    <button class="ctx-item" onclick={() => ctxOrder(sendBackward)}>Send Backward</button>
    <button class="ctx-item" onclick={() => ctxOrder(sendToBack)}>Send to Back</button>
    <div class="ctx-separator"></div>
    <button class="ctx-item" onclick={ctxToggleVisible}>{ctxCore?.visible !== false ? 'Hide' : 'Show'}</button>
    <button class="ctx-item" onclick={ctxToggleLocked}>{ctxCore?.locked ? 'Unlock' : 'Lock'}</button>
  </div>
{/if}

<style>
  .tree-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
    border-left: 1px solid #333;
    overflow: hidden;
  }

  .tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #252525;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .tree-title {
    font-size: 11px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tree-count {
    font-size: 10px;
    color: #555;
    background: #2A2A2A;
    padding: 1px 6px;
    border-radius: 8px;
  }

  .tree-filter {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-bottom: 1px solid #2A2A2A;
    color: #555;
    flex-shrink: 0;
  }

  .filter-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #CCC;
    font-size: 11px;
    font-family: inherit;
    padding: 2px 0;
  }

  .filter-input::placeholder { color: #555; }

  .filter-clear {
    background: none;
    border: none;
    color: #777;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }

  .filter-clear:hover { color: #CCC; }

  .tree-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .tree-list::-webkit-scrollbar { width: 6px; }
  .tree-list::-webkit-scrollbar-track { background: transparent; }
  .tree-list::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

  .tree-empty {
    padding: 20px;
    text-align: center;
    color: #444;
    font-size: 11px;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    cursor: pointer;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
    user-select: none;
  }

  .tree-item:hover {
    background: #2A2A2A;
  }

  .tree-item.selected {
    background: #094771;
  }

  .tree-item.selected.key-object {
    background: #4A3000;
  }

  .tree-item.hidden-item {
    opacity: 0.4;
  }

  .tree-item.drag-above {
    border-top-color: #5B9BD5;
  }

  .tree-item.drag-below {
    border-bottom-color: #5B9BD5;
  }

  .tree-item.drag-inside {
    outline: 1px solid #5B9BD5;
    outline-offset: -1px;
    background: rgba(91, 155, 213, 0.12);
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: none;
    border: none;
    color: #777;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }

  .collapse-toggle:hover { color: #CCC; }

  .collapse-spacer {
    width: 14px;
    flex-shrink: 0;
  }

  .item-type {
    font-size: 9px;
    color: #5B9BD5;
    background: #1A2A3A;
    padding: 1px 4px;
    border-radius: 2px;
    flex-shrink: 1;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .item-name {
    flex: 1;
    font-size: 11px;
    color: #CCC;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-input {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #5B9BD5;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    padding: 1px 4px;
    outline: none;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .inherited-icon {
    display: flex;
    align-items: center;
    color: #7A6A35;
  }

  .action-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }

  /* Always show icons that are in active/non-default state */
  .action-icon.off { opacity: 1; color: #E55; }
  .action-icon.on  { opacity: 1; color: #E5A029; }

  /* Show all icons on hover or selection */
  .tree-item:hover .action-icon,
  .tree-item.selected .action-icon {
    opacity: 1;
  }

  .action-icon:hover { background: #333; color: #CCC; }

  /* Context menu (shares the canvas menu's look) */
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
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

  .ctx-item:hover {
    background: #094771;
    color: #FFF;
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
</style>
