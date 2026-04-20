<script>
  /**
   * Top toolbar for PropertiesPanel — undo/redo, save/lock, grid/snap,
   * pin/multi-view. Pure dispatch markup, owns its own scoped CSS.
   *
   * The parent still owns the `pinPanelProps` and `viewMode` state since
   * both are consumed elsewhere in PropertiesPanel.
   */
  import {
    Undo2, Redo2, Save, Lock, LockOpen,
    Grid3x3 as GridIcon, Magnet, Pin, PinOff, Layers, SquareStack,
  } from 'lucide-svelte';
  import { undo, redo, undoAvailable, redoAvailable } from '../stores/history.js';
  import { updatePanel, saveActivePanel } from '../stores/panels.js';

  let {
    panel,
    pinPanelProps = false,
    viewMode = 'single',
    ontogglepin = null,
    ontoggleview = null,
  } = $props();
</script>

<div class="props-toolbar">
  <button class="toolbar-btn" class:active={$undoAvailable} disabled={!$undoAvailable} title="Undo" onclick={undo}>
    <Undo2 size={18} strokeWidth={1.5} />
  </button>
  <button class="toolbar-btn" class:active={$redoAvailable} disabled={!$redoAvailable} title="Redo" onclick={redo}>
    <Redo2 size={18} strokeWidth={1.5} />
  </button>

  <div class="toolbar-divider"></div>

  <button class="toolbar-btn" class:active={panel.modified} title="Save panel"
    onclick={() => saveActivePanel()}>
    <Save size={18} strokeWidth={1.5} />
  </button>
  <button class="toolbar-btn" class:active={panel.locked}
    title={panel.locked ? 'Unlock panel' : 'Lock panel'}
    onclick={() => updatePanel(panel.id, { locked: !panel.locked })}>
    {#if panel.locked}
      <Lock size={18} strokeWidth={1.5} />
    {:else}
      <LockOpen size={18} strokeWidth={1.5} />
    {/if}
  </button>

  <div class="toolbar-divider"></div>

  <button class="toolbar-btn" class:active={panel.gridEnabled}
    title={panel.gridEnabled ? 'Hide grid' : 'Show grid'}
    onclick={() => updatePanel(panel.id, { gridEnabled: !panel.gridEnabled })}>
    <GridIcon size={18} strokeWidth={1.5} />
  </button>
  <button class="toolbar-btn" class:active={panel.snapToGrid}
    title={panel.snapToGrid ? 'Disable snap' : 'Enable snap'}
    onclick={() => updatePanel(panel.id, { snapToGrid: !panel.snapToGrid })}>
    <Magnet size={18} strokeWidth={1.5} />
  </button>

  <div class="toolbar-spacer"></div>

  <button class="toolbar-btn" class:active={pinPanelProps}
    title={pinPanelProps ? 'Unpin panel properties' : 'Pin panel properties'}
    onclick={() => ontogglepin?.()}>
    {#if pinPanelProps}
      <Pin size={16} strokeWidth={1.5} />
    {:else}
      <PinOff size={16} strokeWidth={1.5} />
    {/if}
  </button>
  <button class="toolbar-btn" class:active={viewMode === 'multi'}
    title={viewMode === 'single' ? 'Switch to multi view' : 'Switch to single view'}
    onclick={() => ontoggleview?.()}>
    {#if viewMode === 'single'}
      <Layers size={16} strokeWidth={1.5} />
    {:else}
      <SquareStack size={16} strokeWidth={1.5} />
    {/if}
  </button>
</div>

<style>
  .props-toolbar {
    display: flex;
    align-items: center;
    height: 34px;
    flex-shrink: 0;
    padding: 0 8px;
    border-bottom: 1px solid #2A2A2A;
    background: #222;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.1s;
  }

  .toolbar-btn:hover {
    background: #333;
    color: #CCC;
  }

  .toolbar-btn.active {
    color: #5B9BD5;
  }

  .toolbar-btn:disabled {
    color: #444;
    cursor: default;
    pointer-events: none;
  }

  .toolbar-divider {
    width: 1px;
    height: 16px;
    background: #333;
    flex-shrink: 0;
  }

  .toolbar-spacer {
    flex: 1;
  }
</style>
