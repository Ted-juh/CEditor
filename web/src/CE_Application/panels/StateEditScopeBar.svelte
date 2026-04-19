<script>
  import { getSection } from '../stores/controls.js';
  import { stateEditScope, setStateEditScopeBase, setStateEditScopeState } from '../stores/stateEditScope.js';

  let { control = null, visibleTabIds = [] } = $props();

  const SCOPABLE_TABS = new Set(['background', 'border', 'text', 'icon', 'effects', 'transform']);

  let core = $derived(getSection(control, 'Core'));
  let states = $derived(getSection(control, 'States'));
  let stateNames = $derived(Object.keys(states?._children ?? {}));
  let scope = $derived($stateEditScope);
  let canUseScope = $derived(
    stateNames.length > 0
    && visibleTabIds.some((tabId) => SCOPABLE_TABS.has(tabId))
  );
  let selectedScopeValue = $derived(scope?.mode === 'state' && scope?.stateName ? scope.stateName : '__base__');

  $effect(() => {
    if (!stateNames.length) {
      if (scope?.mode !== 'base' || scope?.stateName) {
        setStateEditScopeBase();
      }
      return;
    }

    if (scope?.mode === 'state' && scope?.stateName && !stateNames.includes(scope.stateName)) {
      setStateEditScopeBase();
    }
  });

  function handleScopeChange(event) {
    const value = event?.currentTarget?.value ?? '__base__';
    if (value === '__base__') {
      setStateEditScopeBase();
    } else {
      setStateEditScopeState(value);
    }
  }
</script>

{#if canUseScope}
  <div class="state-scope-bar">
    <div class="scope-label">Editing Look</div>
    <button
      class="scope-chip"
      class:active={selectedScopeValue === '__base__'}
      onclick={setStateEditScopeBase}
    >
      Base
    </button>
    <select class="scope-select" value={selectedScopeValue} onchange={handleScopeChange}>
      <option value="__base__">Base</option>
      {#each stateNames as stateName}
        <option value={stateName}>{stateName}</option>
      {/each}
    </select>
    <div class="scope-help">
      Changes in `Background`, `Border`, `Text`, `Icon`, `Effects`, and visual transform props are stored in the selected state.
    </div>
  </div>
{/if}

<style>
  .state-scope-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid #2E2E2E;
    background: #232323;
    color: #D5D5D5;
    min-height: 38px;
    box-sizing: border-box;
  }

  .scope-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    color: #8B8B8B;
    white-space: nowrap;
  }

  .scope-chip,
  .scope-select {
    height: 26px;
    border-radius: 5px;
    border: 1px solid #3A3A3A;
    background: #1A1A1A;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
  }

  .scope-chip {
    padding: 0 10px;
    cursor: pointer;
  }

  .scope-chip.active {
    border-color: #5B9BD5;
    background: #094771;
    color: #FFF;
  }

  .scope-select {
    min-width: 140px;
    padding: 0 8px;
    outline: none;
  }

  .scope-select:focus,
  .scope-chip:hover {
    border-color: #5B9BD5;
  }

  .scope-help {
    min-width: 0;
    color: #7C7C7C;
    font-size: 10px;
    line-height: 1.3;
  }
</style>
