<script>
  /**
   * Status Bar — bottom of the window. Shows context info, selection state, etc.
   *
   * ce.ui.status() writes the left-hand item. A STATUS is a state, so it stays until the script
   * changes or clears it — unlike a notification, which is an event and expires on its own.
   *
   * It carries a `kind` for the same reason a notification does: a state can be a warning, and
   * "Device not responding" rendered in the same colour as "Ready" is a warning nobody sees.
   */
  import { scriptStatus } from '../stores/scriptUi.js';
  import { appVersion } from '../buildInfo.js';
</script>

<div class="status-bar">
  <span class={['status-item', `status-${$scriptStatus.kind}`]}>{$scriptStatus.message || 'Ready'}</span>
  <span class="spacer"></span>
  <span class="status-item dim">No selection</span>
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
