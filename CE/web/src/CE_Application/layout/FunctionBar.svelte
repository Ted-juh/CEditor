<script>
  /**
   * Function bar — below the editor canvas (two rows).
   *
   * Counterpart to the top "Look" bar: this is about how a control *works*.
   *   Row 1 — what it is:   name + type, behavior type + subtype
   *   Row 2 — how it behaves: state selector, input modes, value rows
   *
   * Unlike the Look bar it uses fixed groups (not facet tabs) — you want name,
   * behavior, and state visible together, not one at a time. Device/MIDI wiring
   * lives in the top bar's Device zone, so it isn't repeated here.
   */
  import { getSection, updateControlProperty, updateSelectedProperty, selectedControl } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { componentWorkspaceMode } from '../stores/componentWorkspace.js';
  import DisplayToolbar from '../components/DisplayToolbar.svelte';

  const SUBTYPE_OPTIONS = {
    momentary: ['action', 'repeating', 'press_to_talk'],
    toggle: ['toggle', 'sticky'],
    cyclic: ['cycle', 'tri_state'],
    timed: ['hold_to_confirm', 'double_click'],
    one_shot: ['single_use'],
  };

  let control = $derived($selectedControl);
  let core = $derived(getSection(control, 'Core'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let valueSection = $derived(getSection(control, 'Value'));
  let selectedStates = $derived(getSection(control, 'States'));

  let hasSelection = $derived($selectedComponentIds.size > 0);
  let multiSelect = $derived($selectedComponentIds.size > 1);
  let controlType = $derived(String(core?.controlType ?? ''));
  let buttonType = $derived(String(behavior?.buttonType ?? inferButtonType(controlType)));
  let subtypeOptions = $derived(SUBTYPE_OPTIONS[buttonType] ?? null);
  let showSubtypeSelector = $derived(!!behavior && !!subtypeOptions);

  let rowCount = $derived(Array.isArray(valueSection?.rows) ? valueSection.rows.length : 0);

  let showStateToolbar = $derived(
    String(behavior?.buttonType ?? '').trim().length > 0
    && Object.keys(selectedStates?._children ?? {}).length > 0
  );
  let showSegmentToolbar = $derived(buttonType === 'radio' && Array.isArray(valueSection?.rows) && valueSection.rows.length > 0);
  let showStateGroup = $derived(showStateToolbar || showSegmentToolbar);
  let showInputGroup = $derived(
    !!behavior && (hasBehaviorPath('wheelEnabled') || hasBehaviorPath('reverseMouseDirection') || hasBehaviorPath('keyboardEnabled'))
  );

  let componentDesignerActive = $derived(
    $componentWorkspaceMode === 'surface'
    && controlType === 'CustomComponent'
  );

  function inferButtonType(type = '') {
    switch (String(type ?? '')) {
      case 'ToggleButton': return 'toggle';
      case 'RadioButtonGroup': return 'radio';
      case 'CyclicButton': return 'cyclic';
      case 'Combobox': return 'combobox';
      case 'TimedButton': return 'timed';
      case 'OneShotButton': return 'one_shot';
      default: return 'momentary';
    }
  }

  function set(path, value) {
    if (!core?.id || !path) return;
    if (multiSelect) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function hasBehaviorPath(path) {
    return Object.prototype.hasOwnProperty.call(behavior ?? {}, path);
  }
</script>

<div class="function-bar">
  {#if componentDesignerActive}
    <div class="func-row"><span class="empty-state designer-state">Designer controls are active in the component workspace</span></div>
  {:else if hasSelection}
    <!-- Row 1 — what it is -->
    <div class="func-row">
      <div class="section-chip">Name</div>
      <div class="prop-group">
        <input
          class="name-field"
          type="text"
          value={core?.name ?? ''}
          placeholder="Name"
          disabled={multiSelect}
          title={multiSelect ? 'Name editing is single-selection only' : 'Component name'}
          onfocus={(event) => event.target.select()}
          onchange={(event) => set('Core.name', event.target.value)}
        />
        {#if controlType}
          <span class="type-badge" title="Control type">{controlType}</span>
        {/if}
      </div>

      {#if showSubtypeSelector}
        <div class="divider"></div>
        <div class="section-chip">Behavior</div>
        <div class="prop-group">
          <span class="type-badge ghost" title="Button type">{buttonType}</span>
          <select class="val-select" value={behavior?.subtype ?? subtypeOptions[0]} title="Behavior subtype" onchange={(event) => set('Behavior.subtype', event.target.value)}>
            {#each subtypeOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Row 2 — how it behaves -->
    <div class="func-row">
      {#if showStateGroup}
        <div class="section-chip">State</div>
        <div class="toolbar-slot">
          <DisplayToolbar />
        </div>
      {/if}

      {#if showInputGroup}
        {#if showStateGroup}<div class="divider"></div>{/if}
        <div class="section-chip">Input</div>
        <div class="prop-group toggle-group">
          {#if hasBehaviorPath('wheelEnabled')}
            <button class="text-toggle" class:active={behavior?.wheelEnabled === true} title="Mouse wheel input" onclick={() => set('Behavior.wheelEnabled', !(behavior?.wheelEnabled === true))}>Wheel</button>
          {/if}
          {#if hasBehaviorPath('reverseMouseDirection')}
            <button class="text-toggle" class:active={behavior?.reverseMouseDirection === true} title="Reverse mouse direction" onclick={() => set('Behavior.reverseMouseDirection', !(behavior?.reverseMouseDirection === true))}>Reverse</button>
          {/if}
          {#if hasBehaviorPath('keyboardEnabled')}
            <button class="text-toggle" class:active={behavior?.keyboardEnabled !== false} title="Keyboard input" onclick={() => set('Behavior.keyboardEnabled', !(behavior?.keyboardEnabled !== false))}>Keys</button>
          {/if}
        </div>
      {/if}

      {#if rowCount > 0}
        {#if showStateGroup || showInputGroup}<div class="divider"></div>{/if}
        <span class="readout" title="Value rows defined on this control">Rows <strong>{rowCount}</strong></span>
      {/if}

      {#if !showStateGroup && !showInputGroup && rowCount === 0}
        <span class="row-hint">No behavior options for this control</span>
      {/if}
    </div>
  {:else}
    <div class="func-row"><span class="empty-state">No selection</span></div>
  {/if}
</div>

<style>
  .function-bar {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    padding: 4px 10px;
    gap: 4px;
    background: #272727;
    font-size: 11px;
  }

  .func-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 22px;
  }

  .designer-state {
    color: #8DBFE5;
    font-weight: 700;
  }

  .section-chip {
    flex: 0 0 auto;
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .prop-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .name-field {
    height: 22px;
    width: 150px;
    background: #1E1E1E;
    color: #DDD;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
    padding: 0 6px;
    outline: none;
  }

  .name-field:focus {
    border-color: #5B9BD5;
  }

  .name-field:disabled {
    opacity: 0.5;
  }

  .val-select {
    height: 22px;
    background: #1E1E1E;
    color: #DDD;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
    padding: 0 6px;
    outline: none;
  }

  .type-badge {
    height: 18px;
    display: inline-flex;
    align-items: center;
    padding: 0 6px;
    border-radius: 3px;
    border: 1px solid #3A3A3A;
    background: #1A1A1A;
    color: #9FB6C9;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .type-badge.ghost {
    color: #8F8F8F;
  }

  .readout {
    color: #8A8A8A;
    font-size: 10px;
    font-weight: 600;
  }

  .readout strong {
    color: #CFCFCF;
    margin-left: 2px;
  }

  .row-hint {
    color: #666;
    font-size: 10px;
    font-style: italic;
  }

  .divider {
    width: 1px;
    height: 16px;
    background: #3A3A3A;
  }

  .toggle-group {
    gap: 1px;
  }

  .text-toggle {
    height: 22px;
    min-width: 36px;
    padding: 0 8px;
    background: #333;
    border: 1px solid #444;
    color: #999;
    border-radius: 3px;
    font-size: 10px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .text-toggle:hover {
    background: #444;
    color: #DDD;
  }

  .text-toggle.active {
    background: #094771;
    color: #FFF;
    border-color: #0B6EB5;
  }

  .empty-state {
    color: #777;
    font-size: 11px;
  }

  .toolbar-slot {
    min-width: 0;
    display: flex;
    align-items: center;
  }
</style>
