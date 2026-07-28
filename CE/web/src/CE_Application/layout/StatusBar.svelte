<script>
  /**
   * Status Bar — bottom of the window. Shows context info, selection state, etc.
   *
   * ce.ui.status() writes the left-hand item. A STATUS is a state, so it stays until the script
   * changes or clears it — unlike a notification, which is an event and expires on its own.
   */
  import { scriptStatus } from '../stores/scriptUi.js';
</script>

<div class="status-bar">
  <span class="status-item">{$scriptStatus || 'Ready'}</span>
  <span class="spacer"></span>
  <span class="status-item dim">No selection</span>
  <span class="status-item dim">CEditor v0.1.0</span>
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

  .spacer {
    flex: 1;
  }
</style>
