<script>
  import { selectedControl, getSection } from '../stores/controls.js';
  import { stateEditScope, setStateEditScopeBase, setStateEditScopeState } from '../stores/stateEditScope.js';
  import { BASE_STATE_TARGET, buildStateTargetOptions } from '../utils/stateTargets.js';

  let control = $derived($selectedControl);
  let activeScope = $derived($stateEditScope);
  let selectedStates = $derived(getSection(control, 'States'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let stateTargets = $derived(buildStateTargetOptions(selectedStates));
  let activeStateTarget = $derived(
    activeScope?.mode === 'state' && activeScope?.stateName
      ? String(activeScope.stateName)
      : BASE_STATE_TARGET
  );
  let showStatesToolbar = $derived(
    String(behavior?.buttonType ?? '').trim().length > 0 && stateTargets.length > 1
  );

  function handleStateTargetClick(targetId) {
    if (!targetId || targetId === BASE_STATE_TARGET) {
      setStateEditScopeBase();
      return;
    }

    setStateEditScopeState(targetId);
  }
</script>

{#if showStatesToolbar}
  <div class="display-toolbar">
    <div class="state-targets">
      {#each stateTargets as target (target.id)}
        <button
          class="state-target"
          class:active={activeStateTarget === target.id}
          class:has-overrides={target.hasOverrides}
          title={target.tooltip}
          onclick={() => handleStateTargetClick(target.id)}
        >
          <span>{target.fullLabel}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .display-toolbar {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .state-targets {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 1px;
    padding: 1px;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    background: #1D1D1D;
    scrollbar-width: none;
  }

  .state-targets::-webkit-scrollbar {
    display: none;
  }

  .state-target {
    position: relative;
    flex: 0 0 auto;
    min-width: 58px;
    height: 22px;
    padding: 0 10px;
    border-radius: 0;
    border: 1px solid transparent;
    background: #2A2A2A;
    color: #A9A9A9;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    font-family: inherit;
    line-height: 1;
    transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .state-target:first-child {
    border-radius: 3px 0 0 3px;
  }

  .state-target:last-child {
    border-radius: 0 3px 3px 0;
  }

  .state-target:hover {
    background: #343434;
    border-color: #4A4A4A;
    color: #ECECEC;
  }

  .state-target.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .state-target.has-overrides::after {
    content: '';
    position: absolute;
    right: 5px;
    top: 50%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    transform: translateY(-50%);
    background: #F0B84D;
  }
</style>
