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
  import { scriptStatus } from '../stores/scriptUi.js';
  import { appVersion } from '../buildInfo.js';
  import { activePanel, editorZoom, selectedComponentIds, keyObjectId } from '../stores/panels.js';
  import { flatControls } from '../utils/containment.js';

  let panel = $derived($activePanel);

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
    <span class="status-item dim mono">{$editorZoom}%</span>
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
</style>
