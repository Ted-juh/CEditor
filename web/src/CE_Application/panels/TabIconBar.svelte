<script>
  /**
   * Vertical icon tab bar for PropertiesPanel. Used three times (normal
   * view + both halves of the split view) with different tab lists.
   *
   *   tabs       — [{ id, icon, label }, ...]
   *   isActive   — (id) => boolean
   *   onclick    — (id, event) => void
   *   titlePrefix — optional prefix prepended to each button's title
   *                 (the split view uses "Panel: " on the panel half)
   */
  let {
    tabs = [],
    isActive = () => false,
    onclick = null,
    titlePrefix = '',
  } = $props();
</script>

<div class="icon-tabs">
  {#each tabs as tab (tab.id)}
    <button
      class="tab-icon"
      class:active={isActive(tab.id)}
      title={titlePrefix + tab.label}
      onclick={(e) => onclick?.(tab.id, e)}
    >
      <tab.icon size={20} strokeWidth={1.5} />
    </button>
  {/each}
  <div class="tab-spacer"></div>
</div>

<style>
  .icon-tabs {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 36px;
    flex-shrink: 0;
    background: #222;
    border-right: 1px solid #1A1A1A;
    padding: 6px 0;
    gap: 2px;
  }

  .tab-icon {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #777;
    cursor: pointer;
    border-radius: 5px;
    transition: all 0.1s;
  }

  .tab-icon:hover {
    background: #333;
    color: #CCC;
  }

  .tab-icon.active {
    background: #094771;
    color: #FFF;
  }

  .tab-spacer {
    flex: 1;
  }
</style>
