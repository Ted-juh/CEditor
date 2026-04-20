<script>
  /**
   * EffectsEditor — compact summary view for the PropertiesPanel.
   * Full editing happens in the DisplayPanel Effects tab.
   */
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { displayTabRequest } from '../stores/displayTab.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let effects = $derived(getSection(control, 'Effects'));
  let shadows = $derived(effects?._children?.Shadows);
  let bevel = $derived(effects?._children?.Bevel);
  let filters = $derived(effects?._children?.Filters);
  let blend = $derived(effects?._children?.Blend);

  // Count enabled shadows
  let enabledShadowCount = $derived(
    shadows?.items?.filter(s => s.enabled).length ?? 0
  );

  // Check if any filter is non-default
  let hasActiveFilters = $derived.by(() => {
    if (!filters) return false;
    return filters.blur !== 0 || filters.brightness !== 100 || filters.contrast !== 100 ||
      filters.saturation !== 100 || filters.hueRotate !== 0 || filters.grayscale !== 0 ||
      filters.sepia !== 0 || filters.invert !== 0;
  });

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function openEffectsTab() {
    displayTabRequest.set({ tab: 'effects' });
  }

  const blendModes = [
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
    'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  ];
</script>

{#if effects}
  <div class="effects-summary">

    <!-- Shadows -->
    <div class="summary-row">
      <span class="lbl">Shadows</span>
      <span class="summary-value">
        {enabledShadowCount} active
      </span>
      <button class="edit-btn" onclick={openEffectsTab} title="Edit shadows">Edit</button>
    </div>

    <!-- Bevel -->
    <div class="summary-row">
      <span class="lbl">Bevel</span>
      <button class="toggle-btn" class:on={bevel?.enabled} onclick={() => set('Effects.Bevel.enabled', !bevel?.enabled)}>
        {bevel?.enabled ? 'On' : 'Off'}
      </button>
      {#if bevel?.enabled}
        <span class="summary-value">{bevel.style}</span>
      {/if}
      <button class="edit-btn" onclick={openEffectsTab} title="Edit bevel">Edit</button>
    </div>

    <!-- Filters -->
    <div class="summary-row">
      <span class="lbl">Filters</span>
      <span class="summary-value">
        {hasActiveFilters ? 'Active' : 'Default'}
      </span>
      <button class="edit-btn" onclick={openEffectsTab} title="Edit filters">Edit</button>
    </div>

    <!-- Blend -->
    <div class="summary-row">
      <span class="lbl">Blend</span>
      <select class="blend-select" value={blend?.mode ?? 'normal'} onchange={(e) => set('Effects.Blend.mode', e.target.value)}>
        {#each blendModes as mode}
          <option value={mode}>{mode}</option>
        {/each}
      </select>
    </div>

  </div>
{/if}

<style>
  .effects-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
  }

  .lbl {
    color: #888;
    font-size: 11px;
    min-width: 50px;
    flex-shrink: 0;
  }

  .summary-value {
    color: #666;
    font-size: 10px;
    flex: 1;
    min-width: 0;
  }

  .toggle-btn {
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    height: 22px;
  }

  .toggle-btn.on {
    background: #094771;
    border-color: #0B6EB5;
    color: #DDD;
  }

  .toggle-btn:hover { border-color: #5B9BD5; }

  .edit-btn {
    background: #252525;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    height: 22px;
    flex-shrink: 0;
  }

  .edit-btn:hover {
    border-color: #5B9BD5;
    color: #DDD;
  }

  .blend-select {
    flex: 1;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: inherit;
    cursor: pointer;
    height: 22px;
    outline: none;
  }

  .blend-select:focus { border-color: #5B9BD5; }
</style>
