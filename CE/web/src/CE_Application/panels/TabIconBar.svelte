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
    showStateRail = false,
    stateTargets = [],
    activeStateTarget = '',
    onstatetargetclick = null,
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
    {#if tab.id === 'states' && showStateRail && stateTargets.length > 0}
      <div class="state-rail" aria-label="State editing targets">
        {#each stateTargets as target (target.id)}
          <button
            class="state-target"
            class:active={activeStateTarget === target.id}
            class:has-overrides={target.hasOverrides}
            title={target.tooltip}
            onclick={() => onstatetargetclick?.(target.id)}
          >
            <span>{target.shortLabel}</span>
          </button>
        {/each}
      </div>
    {/if}
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

  .state-rail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 2px 0 6px;
    align-items: center;
  }

  .state-target {
    position: relative;
    width: 24px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #171717;
    border: 1px solid #353535;
    border-radius: 4px;
    color: #999;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-family: inherit;
    padding: 0;
  }

  .state-target:hover {
    border-color: #5B9BD5;
    color: #F5F5F5;
  }

  .state-target.active {
    background: #0C4366;
    border-color: #5B9BD5;
    color: #FFF;
  }

  .state-target.has-overrides::after {
    content: '';
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #F5B83D;
  }

  .state-target.active.has-overrides::after {
    background: #FFF;
  }
</style>
