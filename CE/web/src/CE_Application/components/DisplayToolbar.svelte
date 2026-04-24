<script>
  import { selectedControl, getSection } from '../stores/controls.js';
  import { stateEditScope, setStateEditScopeBase, setStateEditScopeState } from '../stores/stateEditScope.js';
  import {
    segmentEditScope,
    setSegmentEditScopeAll,
    setSegmentEditScopeSegments,
    toggleSegmentEditScopeSegment,
  } from '../stores/segmentEditScope.js';
  import { BASE_STATE_TARGET, buildStateTargetOptions } from '../utils/stateTargets.js';
  import { ALL_SEGMENT_TARGET, buildSegmentTargetOptions, normalizeSegmentTargetIds } from '../utils/segmentTargets.js';

  let control = $derived($selectedControl);
  let activeScope = $derived($stateEditScope);
  let activeSegmentScope = $derived($segmentEditScope);
  let selectedStates = $derived(getSection(control, 'States'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let valueSection = $derived(getSection(control, 'Value'));
  let buttonType = $derived(String(behavior?.buttonType ?? '').trim().toLowerCase());
  let stateTargets = $derived(buildStateTargetOptions(selectedStates));
  let segmentTargets = $derived(buildSegmentTargetOptions(valueSection));
  let activeStateTarget = $derived(
    activeScope?.mode === 'state' && activeScope?.stateName
      ? String(activeScope.stateName)
      : BASE_STATE_TARGET
  );
  let showStatesToolbar = $derived(
    String(behavior?.buttonType ?? '').trim().length > 0 && stateTargets.length > 1
  );
  let selectedSegmentIds = $derived(
    activeSegmentScope?.mode === 'segments'
      ? normalizeSegmentTargetIds(valueSection, activeSegmentScope?.segmentIds ?? [])
      : []
  );
  let showSegmentsToolbar = $derived(buttonType === 'radio' && segmentTargets.length > 1);

  $effect(() => {
    if (!showSegmentsToolbar) {
      setSegmentEditScopeAll();
      return;
    }

    const normalizedIds = normalizeSegmentTargetIds(valueSection, activeSegmentScope?.segmentIds ?? []);
    if (activeSegmentScope?.mode !== 'segments') return;
    if (
      normalizedIds.length === selectedSegmentIds.length
      && normalizedIds.every((id, index) => id === selectedSegmentIds[index])
    ) {
      return;
    }

    if (normalizedIds.length === 0) {
      setSegmentEditScopeAll();
      return;
    }

    setSegmentEditScopeSegments(normalizedIds);
  });

  function handleStateTargetClick(targetId) {
    if (!targetId || targetId === BASE_STATE_TARGET) {
      setStateEditScopeBase();
      return;
    }

    setStateEditScopeState(targetId);
  }
  function handleSegmentTargetClick(targetId) {
    if (!targetId || targetId === ALL_SEGMENT_TARGET) {
      setSegmentEditScopeAll();
      return;
    }

    toggleSegmentEditScopeSegment(targetId);
  }
</script>

{#if showStatesToolbar || showSegmentsToolbar}
  <div class="display-toolbar">
    {#if showStatesToolbar}
      <div class="toolbar-group">
        <span class="toolbar-label">States</span>
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

    {#if showSegmentsToolbar}
      <div class="toolbar-group">
        <span class="toolbar-label">Segments</span>
        <div class="segment-targets">
          {#each segmentTargets as target (target.id)}
            <button
              class="segment-target"
              class:active={target.id === ALL_SEGMENT_TARGET ? selectedSegmentIds.length === 0 : selectedSegmentIds.includes(target.id)}
              title={target.label}
              onclick={() => handleSegmentTargetClick(target.id)}
            >
              <span>{target.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .display-toolbar {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 10px;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
  }

  .toolbar-label {
    flex: 0 0 auto;
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
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

  .state-targets::-webkit-scrollbar,
  .segment-targets::-webkit-scrollbar {
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

  .segment-targets {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 4px;
    padding: 1px;
    scrollbar-width: none;
  }

  .segment-target {
    flex: 0 0 auto;
    min-width: 52px;
    min-height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid #454545;
    background: #232323;
    color: #B6B6B6;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    font-family: inherit;
    line-height: 20px;
    transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    white-space: nowrap;
  }

  .segment-target:hover {
    background: #313131;
    border-color: #5A5A5A;
    color: #F2F2F2;
  }

  .segment-target.active {
    background: #0E3F2A;
    border-color: #2E8B57;
    color: #FFF;
  }
</style>
