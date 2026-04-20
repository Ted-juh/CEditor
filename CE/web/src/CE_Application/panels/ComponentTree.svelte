<script>
  import { Eye, EyeOff, Lock, LockOpen } from 'lucide-svelte';
  import { activePanel, selectedComponentIds, selectComponent, keyObjectId } from '../stores/panels.js';
  import { updateControlProperty } from '../stores/controls.js';
  import { updatePanel } from '../stores/panels.js';
  import { getSection } from '../models/componentTypes.js';
  import { getControlId, getControlLayer, sortControlsForRender } from '../utils/controlOrder.js';

  // Controls in reverse order (top of list = front/highest z)
  let controls = $derived($activePanel ? [...sortControlsForRender($activePanel.controls)].reverse() : []);

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

  // --- Drag to reorder z-order ---
  let dragOverId = $state(null);
  let dragOverPos = $state(null); // 'above' | 'below'
  let dragSourceId = $state(null);

  function handleDragStart(id, e) {
    dragSourceId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(id, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === dragSourceId) { dragOverId = null; return; }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    dragOverId = id;
    dragOverPos = e.clientY < midY ? 'above' : 'below';
  }

  function handleDragLeave() {
    dragOverId = null;
    dragOverPos = null;
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!$activePanel || !dragSourceId || !dragOverId || dragSourceId === dragOverId) {
      dragOverId = null; dragOverPos = null; dragSourceId = null;
      return;
    }

    const source = $activePanel.controls.find(c => getControlId(c) === dragSourceId);
    const target = $activePanel.controls.find(c => getControlId(c) === dragOverId);

    if (!source || !target || getControlLayer(source) !== getControlLayer(target)) {
      dragOverId = null;
      dragOverPos = null;
      dragSourceId = null;
      return;
    }

    const layer = getControlLayer(source);
    const displayLayer = controls.filter(c => getControlLayer(c) === layer);
    const item = displayLayer.find(c => getControlId(c) === dragSourceId);

    if (!item) {
      dragOverId = null;
      dragOverPos = null;
      dragSourceId = null;
      return;
    }

    const reorderedDisplayLayer = displayLayer.filter(c => getControlId(c) !== dragSourceId);
    let targetIndex = reorderedDisplayLayer.findIndex(c => getControlId(c) === dragOverId);
    if (targetIndex < 0) {
      dragOverId = null;
      dragOverPos = null;
      dragSourceId = null;
      return;
    }

    if (dragOverPos === 'below') targetIndex += 1;
    reorderedDisplayLayer.splice(targetIndex, 0, item);

    const zIndexById = new Map(
      [...reorderedDisplayLayer].reverse().map((control, index) => [getControlId(control), index])
    );

    const updatedControls = $activePanel.controls.map(control => {
      const id = getControlId(control);
      if (getControlLayer(control) !== layer || id == null || !zIndexById.has(id)) return control;

      const clone = JSON.parse(JSON.stringify(control));
      clone._children.Core.zIndex = zIndexById.get(id);
      return clone;
    });

    updatePanel($activePanel.id, { controls: updatedControls });

    dragOverId = null;
    dragOverPos = null;
    dragSourceId = null;
  }

  function handleDragEnd() {
    dragOverId = null;
    dragOverPos = null;
    dragSourceId = null;
  }
</script>

<div class="tree-panel">
  <div class="tree-header">
    <span class="tree-title">Components</span>
    <span class="tree-count">{controls.length}</span>
  </div>

  <div class="tree-list">
    {#if controls.length === 0}
      <div class="tree-empty">No components</div>
    {:else}
      {#each controls as ctrl (ctrl._children?.Core?.id)}
        {@const core = getSection(ctrl, 'Core')}
        {@const id = core?.id}
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
          onclick={(e) => handleItemClick(id, e)}
          ondblclick={() => startRename(id, core?.name ?? '')}
          draggable="true"
          ondragstart={(e) => handleDragStart(id, e)}
          ondragover={(e) => handleDragOver(id, e)}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
          ondragend={handleDragEnd}
        >
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
