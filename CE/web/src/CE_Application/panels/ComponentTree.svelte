<script>
  import { Eye, EyeOff, Lock, LockOpen, ChevronDown, ChevronRight } from 'lucide-svelte';
  import { activePanel, selectedComponentIds, selectComponent, keyObjectId } from '../stores/panels.js';
  import { applyControlPatchesById, updateControlProperty, reparentControls } from '../stores/controls.js';
  import { getSection } from '../models/componentTypes.js';
  import { getControlId, getControlLayer, sortControlsForRender } from '../utils/controlOrder.js';
  import {
    controlPanelRect,
    findControlById,
    findParentOfControl,
    flatControls,
    getChildControls,
    isContainerControl,
    isDescendantOfControl,
    panelToLocalPoint,
  } from '../utils/containment.js';

  // Collapsed container ids (expanded by default)
  let collapsedIds = $state(new Set());

  function toggleCollapsed(id) {
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsedIds = next;
  }

  // Flattened display rows: depth-first, siblings front-to-back (top of list =
  // front/highest z), respecting collapsed containers.
  let rows = $derived.by(() => {
    if (!$activePanel) return [];
    const out = [];
    const visit = (controls, depth) => {
      for (const ctrl of [...sortControlsForRender(controls)].reverse()) {
        const id = getControlId(ctrl);
        const container = isContainerControl(ctrl);
        out.push({ ctrl, id, depth, container });
        if (container && !collapsedIds.has(id)) {
          visit(getChildControls(ctrl), depth + 1);
        }
      }
    };
    visit($activePanel.controls, 0);
    return out;
  });

  let totalCount = $derived($activePanel ? flatControls($activePanel.controls).length : 0);

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

  // --- Selection ---
  function handleItemClick(id, e) {
    if (e.ctrlKey || e.metaKey) {
      selectComponent(id, true);
    } else {
      selectComponent(id, false);
    }
  }

  // --- Visibility / Lock toggles ---
  function toggleVisible(id, current) {
    updateControlProperty(id, 'Core.visible', !current);
  }

  function toggleLocked(id, current) {
    updateControlProperty(id, 'Core.locked', !current);
  }

  // --- Drag: reorder z-order (above/below) or nest into a container (onto) ---
  let dragOverId = $state(null);
  let dragOverPos = $state(null); // 'above' | 'below' | 'inside'
  let dragSourceId = $state(null);

  function resetDragState() {
    dragOverId = null;
    dragOverPos = null;
    dragSourceId = null;
  }

  function handleDragStart(id, e) {
    dragSourceId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(id, container, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === dragSourceId) { dragOverId = null; return; }
    // Never allow dropping a container into its own subtree
    if (dragSourceId && $activePanel && isDescendantOfControl($activePanel.controls, dragSourceId, id)) {
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
    if (!$activePanel || !dragSourceId || !dragOverId || dragSourceId === dragOverId) {
      resetDragState();
      return;
    }

    const controls = $activePanel.controls;
    const source = findControlById(controls, dragSourceId);
    const target = findControlById(controls, dragOverId);
    if (!source || !target) { resetDragState(); return; }

    if (dragOverPos === 'inside') {
      // Nest into the target container, keeping the visual position
      const rect = controlPanelRect(controls, dragSourceId);
      if (rect && isContainerControl(target)) {
        const local = panelToLocalPoint(controls, dragOverId, rect.x, rect.y);
        reparentControls([{ id: dragSourceId, x: local.x, y: local.y }], dragOverId);
      }
      resetDragState();
      return;
    }

    // Above/below → z-reorder among the TARGET's siblings. If source lives in
    // a different parent, reparent first (keeping visual position).
    const sourceParent = findParentOfControl(controls, dragSourceId);
    const targetParent = findParentOfControl(controls, dragOverId);
    const sourceParentId = sourceParent ? getControlId(sourceParent) : null;
    const targetParentId = targetParent ? getControlId(targetParent) : null;

    if (sourceParentId !== targetParentId) {
      const rect = controlPanelRect(controls, dragSourceId);
      if (!rect) { resetDragState(); return; }
      const local = panelToLocalPoint(controls, targetParentId, rect.x, rect.y);
      reparentControls([{ id: dragSourceId, x: local.x, y: local.y }], targetParentId);
    }

    // Re-read the (possibly reparented) tree for the sibling reorder
    const nextControls = $activePanel.controls;
    const freshSource = findControlById(nextControls, dragSourceId);
    const freshTarget = findControlById(nextControls, dragOverId);
    if (!freshSource || !freshTarget || getControlLayer(freshSource) !== getControlLayer(freshTarget)) {
      resetDragState();
      return;
    }

    const parent = findParentOfControl(nextControls, dragOverId);
    const siblings = parent ? getChildControls(parent) : nextControls;
    const layer = getControlLayer(freshSource);
    const displayLayer = [...sortControlsForRender(siblings)].reverse().filter(c => getControlLayer(c) === layer);
    const item = displayLayer.find(c => getControlId(c) === dragSourceId);

    if (!item) { resetDragState(); return; }

    const reorderedDisplayLayer = displayLayer.filter(c => getControlId(c) !== dragSourceId);
    let targetIndex = reorderedDisplayLayer.findIndex(c => getControlId(c) === dragOverId);
    if (targetIndex < 0) { resetDragState(); return; }

    if (dragOverPos === 'below') targetIndex += 1;
    reorderedDisplayLayer.splice(targetIndex, 0, item);

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

<div class="tree-panel">
  <div class="tree-header">
    <span class="tree-title">Components</span>
    <span class="tree-count">{totalCount}</span>
  </div>

  <div class="tree-list">
    {#if rows.length === 0}
      <div class="tree-empty">No components</div>
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
          class:hidden-item={core?.visible === false}
          class:drag-above={dragOverId === id && dragOverPos === 'above'}
          class:drag-below={dragOverId === id && dragOverPos === 'below'}
          class:drag-inside={dragOverId === id && dragOverPos === 'inside'}
          style="padding-left: {10 + row.depth * 14}px"
          onclick={(e) => handleItemClick(id, e)}
          ondblclick={() => startRename(id, core?.name ?? '')}
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
              {#if collapsedIds.has(id)}
                <ChevronRight size={11} strokeWidth={1.5} />
              {:else}
                <ChevronDown size={11} strokeWidth={1.5} />
              {/if}
            </button>
          {:else}
            <span class="collapse-spacer"></span>
          {/if}

          <span class="item-type">{core?.controlType ?? '?'}</span>

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
    flex-shrink: 0;
    min-width: 40px;
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
    gap: 2px;
    flex-shrink: 0;
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
</style>
