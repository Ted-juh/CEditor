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
    const rawIds = Array.isArray(activeSegmentScope?.segmentIds)
      ? activeSegmentScope.segmentIds.map((id) => String(id ?? '').trim()).filter(Boolean)
      : [];
    if (normalizedIds.length === rawIds.length
      && normalizedIds.every((id, index) => id === rawIds[index])) {
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
      <!-- One list, not a button per state: a knob has nine with Base, and as buttons they took the bar's
           width and scrolled behind a hidden scrollbar. A dot marks a state with its own changes,
           as the buttons' orange dot did. The States tab picks the same scope. -->
      <label class="toolbar-group" title="The state your edits go to. A dot marks a state that has its own changes.">
        <span class="toolbar-label">State</span>
        <select
          class="state-select"
          value={activeStateTarget}
          onchange={(event) => handleStateTargetClick(event.currentTarget.value)}
        >
          {#each stateTargets as target (target.id)}
            <option value={target.id}>{target.fullLabel}{target.hasOverrides ? ' •' : ''}</option>
          {/each}
        </select>
      </label>
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

  /* As the bar's own X Y W H labels. */
  .toolbar-label {
    flex: 0 0 auto;
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
  }

  .state-select {
    height: 22px;
    width: 110px;
    background: #1E1E1E;
    color: #DDD;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
    padding: 0 4px;
    outline: none;
  }

  .state-select:focus {
    border-color: #5B9BD5;
  }

  /* Wraps rather than scrolling: the scrollbar was hidden, so the segments past the edge were too. */
  .segment-targets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    gap: 4px;
    padding: 1px;
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
