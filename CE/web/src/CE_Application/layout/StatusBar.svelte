<script>
  /**
   * Status Bar — bottom of the window. Live readout of the editing state:
   * selection (name or count + geometry), panel size + dirty flag, grid/snap
   * state, and zoom. All of it was already in stores; the bar previously
   * showed a hardcoded "No selection" next to the version number.
   *
   * ce.ui.status() writes the left-hand item. A STATUS is a state, so it stays until the script
   * changes or clears it — unlike a notification, which is an event and expires on its own.
   *
   * It carries a `kind` for the same reason a notification does: a state can be a warning, and
   * "Device not responding" rendered in the same colour as "Ready" is a warning nobody sees.
   */
  import Maximize from 'lucide-svelte/icons/maximize';
  import Ruler from 'lucide-svelte/icons/ruler';
  import Columns3 from 'lucide-svelte/icons/columns-3';
  import MoveHorizontal from 'lucide-svelte/icons/move-horizontal';
  import { scriptStatus } from '../stores/scriptUi.js';
  import { appVersion } from '../buildInfo.js';
  import { activePanel, activeEditorTab, editorZoom, selectedComponentIds, keyObjectId } from '../stores/panels.js';
  import { requestFitToWindow, requestZoomStep } from '../stores/editorCommands.js';
  import { showRulers, showGuides, showDistances } from '../stores/editorView.js';
  import { flatControls } from '../utils/containment.js';

  let panel = $derived($activePanel);
  // Zoom/view controls only make sense with a panel canvas on screen.
  let canvasActive = $derived(!!panel && ($activeEditorTab?.type ?? 'panel') === 'panel');

  // Zoom % — double-click to type an exact value (moved here from the old ZoomBar).
  let isEditingZoom = $state(false);
  let zoomEditValue = $state('100');

  function startZoomEdit() {
    zoomEditValue = String($editorZoom);
    isEditingZoom = true;
  }

  function commitZoomEdit() {
    isEditingZoom = false;
    const num = parseInt(zoomEditValue, 10);
    if (!isNaN(num)) editorZoom.set(Math.max(10, Math.min(400, num)));
  }

  function handleZoomKeydown(e) {
    if (e.key === 'Enter') commitZoomEdit();
    else if (e.key === 'Escape') isEditingZoom = false;
  }

  let selectionInfo = $derived.by(() => {
    if (!panel) return null;
    const ids = $selectedComponentIds;
    if (ids.size === 0) return null;
    const all = flatControls(panel.controls);
    if (ids.size === 1) {
      const ctrl = all.find((c) => ids.has(c._children?.Core?.id));
      const core = ctrl?._children?.Core;
      const t = ctrl?._children?.Transform;
      if (!core) return null;
      return {
        label: core.name ?? core.controlType ?? '1 selected',
        geometry: t ? `${Math.round(t.x)}, ${Math.round(t.y)} · ${Math.round(t.width)}×${Math.round(t.height)}` : '',
      };
    }
    // Multi-selection: count + the key object's name as the anchor.
    const key = all.find((c) => c._children?.Core?.id === $keyObjectId);
    const keyName = key?._children?.Core?.name;
    return {
      label: `${ids.size} selected${keyName ? ` · key: ${keyName}` : ''}`,
      geometry: '',
    };
  });
</script>

<div class="status-bar">
  <span class={['status-item', `status-${$scriptStatus.kind}`]}>{$scriptStatus.message || 'Ready'}</span>
  <span class="spacer"></span>
  {#if selectionInfo}
    <span class="status-item">{selectionInfo.label}</span>
    {#if selectionInfo.geometry}
      <span class="status-item dim mono">{selectionInfo.geometry}</span>
    {/if}
  {:else if panel}
    <span class="status-item dim">No selection</span>
  {/if}
  {#if panel}
    <span class="status-item dim mono">{panel.width}×{panel.height}{panel.modified ? ' •' : ''}</span>
    <span class="status-item dim">grid {panel.gridEnabled ? 'on' : 'off'} · snap {panel.snapToGrid ? 'on' : 'off'}</span>
  {/if}
  {#if canvasActive}
    <span class="bar-group">
      <button class="bar-btn" class:on={$showRulers} title="Toggle rulers" onclick={() => showRulers.update((v) => !v)}><Ruler size={11} strokeWidth={1.6} /></button>
      <button class="bar-btn" class:on={$showGuides} title="Toggle guide lines" onclick={() => showGuides.update((v) => !v)}><Columns3 size={11} strokeWidth={1.6} /></button>
      <button class="bar-btn" class:on={$showDistances} title="Toggle distance labels" onclick={() => showDistances.update((v) => !v)}><MoveHorizontal size={11} strokeWidth={1.6} /></button>
    </span>
    <span class="bar-group">
      <button class="bar-btn" title="Zoom out" onclick={() => requestZoomStep(-1)}>−</button>
      {#if isEditingZoom}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="zoom-input"
          type="text"
          bind:value={zoomEditValue}
          onblur={commitZoomEdit}
          onkeydown={handleZoomKeydown}
          autofocus
        />
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="status-item mono zoom-value" ondblclick={startZoomEdit} title="Double-click to type a value">{$editorZoom}%</span>
      {/if}
      <button class="bar-btn" title="Zoom in" onclick={() => requestZoomStep(1)}>+</button>
      <button class="bar-btn" title="Reset to 100%" onclick={() => editorZoom.set(100)}>⊡</button>
      <button class="bar-btn" title="Fit to window (Ctrl+0)" onclick={() => requestFitToWindow()}><Maximize size={11} strokeWidth={1.6} /></button>
    </span>
  {/if}
  <span class="status-item dim">CEditor v{appVersion}</span>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 10px;
    gap: 12px;
    background: #007ACC;
    font-size: 11px;
    color: #FFF;
  }

  .status-item {
    white-space: nowrap;
  }

  .status-item.dim {
    opacity: 0.7;
  }

  .status-item.mono {
    font-variant-numeric: tabular-nums;
  }

  /* The status bar's own blue is the "info" background, so a plain status needs no colour of its
     own — only a warning or an error has something to say by looking different. */
  .status-item.status-warn {
    color: #FFE08A;
    font-weight: 600;
  }

  .status-item.status-error {
    color: #FFC7C2;
    font-weight: 600;
  }

  .spacer {
    flex: 1;
  }

  .bar-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .bar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 3px;
    background: rgba(255, 255, 255, 0.12);
    border: none;
    border-radius: 3px;
    color: #FFF;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    font-family: inherit;
    opacity: 0.85;
  }

  .bar-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    opacity: 1;
  }

  .bar-btn.on {
    background: rgba(255, 255, 255, 0.35);
    opacity: 1;
  }

  .zoom-value {
    cursor: text;
    min-width: 34px;
    text-align: center;
  }

  .zoom-input {
    width: 40px;
    height: 16px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 3px;
    color: #FFF;
    font-size: 10px;
    font-family: inherit;
    text-align: center;
    padding: 0 2px;
    outline: none;
  }
</style>
