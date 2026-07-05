<script>
  // State filmstrip strip for the custom-component design surface.
  // Extracted verbatim from CustomDesignSurfaceEditor.svelte: renders the
  // state preview cards computed by the parent and forwards every mutation
  // (select / edit / when-flag / duplicate / remove / add) via callback props.
  import InteractivePartRenderer from '../editor/InteractivePartRenderer.svelte';
  import {
    stateCardStyle,
    stateDescription,
    stateLabel,
    statePatchCount,
    statePreviewStageStyle as statePreviewStageStyleBase,
    stateTriggerLabel,
  } from '../utils/customDesignSurfaceHelpers.js';

  let {
    statePreviewCards = [],
    activeStateName = 'base',
    artboardWidth = 220,
    artboardHeight = 120,
    filmstripCollapsed = false,
    onToggleCollapsed = () => {},
    selectStateCard = () => {},
    onEditState = () => {},
    setFilmstripStateWhen = () => {},
    duplicateStateCard = () => {},
    removeStateCard = () => {},
    addQuickState = () => {},
  } = $props();

  function statePreviewStageStyle(entry) {
    return statePreviewStageStyleBase(entry, artboardWidth, artboardHeight);
  }
</script>

<div class="state-filmstrip" class:collapsed={filmstripCollapsed} aria-label="Component states">
  <div class="state-title">
    <button type="button" class="filmstrip-collapse-btn" onclick={onToggleCollapsed} title={filmstripCollapsed ? 'Expand states' : 'Collapse states'}>
      <strong>States</strong>
      <span>{Math.max(1, statePreviewCards.length)}</span>
    </button>
  </div>
  <div class="state-chip-row">
    {#each statePreviewCards as entry (entry.name)}
      <div
        class="state-card"
        class:active={activeStateName === entry.name}
        class:base={entry.base}
        style={stateCardStyle(entry.name, entry.index)}
        title={stateDescription(entry.name, entry.state, entry.base)}
      >
        <button
          type="button"
          class="state-main"
          onclick={() => selectStateCard(entry.name)}
        >
          <span class="state-thumb" aria-hidden="true">
            <span class="state-preview-stage" style={statePreviewStageStyle(entry)}>
              {#each entry.previewParts as [partName, part] (partName)}
                <InteractivePartRenderer
                  part={part}
                  parentWidth={entry.previewWidth}
                  parentHeight={entry.previewHeight}
                />
              {/each}
            </span>
          </span>
          <span class="state-copy">
            <strong>{stateLabel(entry.name, entry.state, entry.base)}</strong>
            <em>{stateDescription(entry.name, entry.state, entry.base)}</em>
          </span>
          <div class="state-count-trigger">
            <span class="state-count">{entry.base ? 'BASE' : `${statePatchCount(entry.state)} patch${statePatchCount(entry.state) === 1 ? '' : 'es'}`}</span>
            {#if !entry.base}
              <span class="state-trigger-badge" class:no-trigger={!Object.values(entry.state?.when ?? {}).some(Boolean) && !String(entry.state?.rule ?? '').trim()}>{stateTriggerLabel(entry.state, entry.base)}</span>
            {/if}
          </div>
        </button>
        <div class="state-actions" aria-label={`${entry.name} state actions`}>
          {#if !entry.base}
            <div class="when-toggles">
              {#each [['hover','H'],['pressed','P'],['disabled','D']] as [flag, label] (flag)}
                <button type="button"
                  class:active={entry.state?.when?.[flag] === true}
                  onclick={(e) => { e.stopPropagation(); setFilmstripStateWhen(entry.name, flag, !(entry.state?.when?.[flag] === true)); }}
                  title={flag}
                >{label}</button>
              {/each}
            </div>
          {/if}
          <button type="button" onclick={(event) => { event.stopPropagation(); onEditState(entry.name); }} title="Edit state">
            Edit
          </button>
          <button type="button" onclick={(event) => duplicateStateCard(entry.name, entry.state, event)} title={entry.base ? 'Create state from base' : 'Duplicate state'}>
            Copy
          </button>
          {#if !entry.base}
            <button type="button" class="danger" onclick={(event) => removeStateCard(entry.name, event)} title="Delete state">
              Del
            </button>
          {/if}
        </div>
      </div>
    {/each}
    <button type="button" class="add-state" title="Add state" onclick={addQuickState}>
      +
    </button>
  </div>
</div>

<style>
  .state-filmstrip {
    grid-area: states;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: stretch;
    min-height: 86px;
    border-top: 1px solid #2A3741;
    background: linear-gradient(180deg, #151E25, #10171D);
  }

  .state-filmstrip.collapsed .state-chip-row {
    display: none;
  }

  .state-filmstrip.collapsed {
    min-height: 0;
  }

  .filmstrip-collapse-btn {
    display: grid;
    gap: 4px;
    align-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    padding: 0 14px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .state-count-trigger {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-size: 9px;
  }

  .state-trigger-badge {
    padding: 1px 5px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px;
    background: rgba(255,255,255,0.06);
    color: #8FEDE3;
    font-size: 9px;
    white-space: nowrap;
  }

  .state-trigger-badge.no-trigger {
    color: #6B7A86;
    border-color: rgba(255,255,255,0.06);
  }

  .when-toggles {
    display: flex;
    gap: 2px;
  }

  .when-toggles button {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid #2E3B45;
    border-radius: 3px;
    background: #1A242D;
    color: #6B7A86;
    font-size: 9px;
    font-weight: 800;
    cursor: pointer;
    line-height: 1;
  }

  .when-toggles button.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.22);
    color: #8FEDE3;
  }

  .state-title {
    display: grid;
    align-content: stretch;
    gap: 0;
    align-items: stretch;
    padding: 0;
    border-right: 1px solid #2A3741;
    color: #D8E6EE;
    font-size: 11px;
    font-weight: 900;
  }

  .state-title strong,
  .state-title span {
    display: block;
  }

  .state-title span {
    width: max-content;
    min-width: 24px;
    padding: 2px 6px;
    border: 1px solid #31404A;
    border-radius: 999px;
    background: #10181E;
    color: #8FEDE3;
    font-size: 10px;
    text-align: center;
  }

  .state-chip-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow-x: auto;
    padding: 9px 12px;
  }

  .state-card {
    display: grid;
    grid-template-rows: minmax(0, 1fr) 22px;
    flex: 0 0 160px;
    height: 68px;
    overflow: hidden;
    border: 1px solid #2E3B45;
    border-radius: 6px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--state-accent) 12%, #1A252D), #141D24 62%),
      #1A252D;
    color: #C9D6DF;
    box-shadow: inset 3px 0 0 color-mix(in srgb, var(--state-accent) 82%, #FFFFFF);
  }

  .state-card.active {
    border-color: var(--state-accent);
    box-shadow:
      inset 3px 0 0 var(--state-accent),
      inset 0 0 0 1px color-mix(in srgb, var(--state-accent) 34%, transparent),
      0 0 18px color-mix(in srgb, var(--state-accent) 16%, transparent);
  }

  .state-main {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 8px 5px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .state-thumb {
    position: relative;
    width: 46px;
    height: 32px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--state-accent) 46%, #31404A);
    border-radius: 4px;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      #0B1116;
    background-size: 7px 7px;
  }

  .state-preview-stage {
    position: absolute;
    left: 0;
    top: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .state-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .state-count {
    align-self: start;
    padding: 2px 5px;
    border: 1px solid color-mix(in srgb, var(--state-accent) 34%, #2E3B45);
    border-radius: 999px;
    background: rgba(8, 13, 17, 0.48);
    color: color-mix(in srgb, var(--state-accent) 72%, #FFFFFF);
    font-size: 8px;
    font-weight: 900;
    white-space: nowrap;
  }

  .state-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 7px 6px 57px;
  }

  .state-actions button {
    height: 18px;
    padding: 0 6px;
    border: 1px solid #33434E;
    border-radius: 3px;
    background: rgba(11, 17, 22, 0.62);
    color: #9FB2BF;
    cursor: pointer;
    font: inherit;
    font-size: 9px;
    font-weight: 800;
  }

  .state-actions button:hover {
    border-color: var(--state-accent);
    color: #F0FFFC;
  }

  .state-actions button.danger:hover {
    border-color: #E26D6D;
    color: #FFD2D2;
  }

  .state-chip-row button.add-state {
    flex: 0 0 44px;
    min-width: 44px;
    height: 68px;
    place-items: center;
    border: 1px solid #2E3B45;
    border-radius: 6px;
    background: #172129;
    color: #8FEDE3;
    cursor: pointer;
    font-size: 20px;
    font-weight: 300;
  }

  .state-copy strong,
  .state-copy em {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state-copy strong {
    color: #F2F8FB;
    font-size: 11px;
    font-weight: 800;
  }

  .state-copy em {
    color: #8FA4B0;
    font-size: 10px;
    font-style: normal;
  }
</style>
