<script>
  import { getSection, updateControlProperty, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import FieldList from '../properties/FieldList.svelte';
  import { RIBBON_DISPLAY_FIELDS, RIBBON_FIELDS, RIBBON_RETURN_FIELDS } from '../models/inspectorFieldSets.js';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Ribbon from 'lucide-svelte/icons/ribbon';
  import IterationCcw from 'lucide-svelte/icons/iteration-ccw';
  import Monitor from 'lucide-svelte/icons/monitor';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let r = $derived(getSection(control, 'Ribbon'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Ribbon.${prop}`, value);
  }

  // Quick presets — set the handful of fields that make a ribbon / pitch / mod.
  // Patch is a flat map of dot-paths → values.
  function applyPreset(name) {
    if (!core?.id) return;
    const fields = name === 'pitch'
      ? { style: 'wheel3d', orientation: 'vertical', bipolar: true, value: 0.5, returnMode: 'center', returnTime: 85 }
      : name === 'mod'
        ? { style: 'wheel3d', orientation: 'vertical', bipolar: false, value: 0, returnMode: 'none' }
        : { style: 'ribbon', bipolar: false, returnMode: 'none' };
    const patch = {};
    for (const [k, v] of Object.entries(fields)) patch[`Ribbon.${k}`] = v;
    applyControlPatch(core.id, patch);
  }
</script>

{#if r}
  <!-- Ordinary fields are data (models/inspectorFieldSets.js); the presets, Label and Colours are the editor's own. -->
  {#snippet presets()}
    <PropertyCell label="Preset" span={4} hint="Quick-set for the common hardware controllers.">
      <div class="presets">
        <button type="button" class="action-btn" onclick={() => applyPreset('ribbon')}>Touch ribbon</button>
        <button type="button" class="action-btn" onclick={() => applyPreset('pitch')}>Pitch wheel</button>
        <button type="button" class="action-btn" onclick={() => applyPreset('mod')}>Mod wheel</button>
      </div>
    </PropertyCell>
  {/snippet}

  <PropertySection title="Ribbon" icon={Ribbon}>
    <FieldList fields={RIBBON_FIELDS} values={r} {set} slots={{ presets }} />
  </PropertySection>

  <PropertySection title="Return to rest" icon={IterationCcw}>
    <FieldList fields={RIBBON_RETURN_FIELDS} values={r} {set} />
  </PropertySection>

  <PropertySection title="Display" icon={Monitor}>
    <FieldList fields={RIBBON_DISPLAY_FIELDS} values={r} {set} />
    <PropertyCell label="Label" span={4} hint="Caption under the strip/wheel.">
      <input class="val" type="text" value={r.label ?? ''} onchange={(e) => set('label', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Strip fill / notch accent, position indicator, strip groove, wheel body. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fillColour', label: 'Fill', value: r.fillColour, target: { type: 'control', controlId: core?.id, path: 'Ribbon.fillColour' } },
        { key: 'indicatorColour', label: 'Indic', value: r.indicatorColour, target: { type: 'control', controlId: core?.id, path: 'Ribbon.indicatorColour' } },
        { key: 'trackColour', label: 'Track', value: r.trackColour, target: { type: 'control', controlId: core?.id, path: 'Ribbon.trackColour' } },
        { key: 'wheelColour', label: 'Wheel', value: r.wheelColour, target: { type: 'control', controlId: core?.id, path: 'Ribbon.wheelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .presets { display: flex; gap: 6px; flex-wrap: wrap; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer;
  }
  .action-btn:hover { border-color: #5B9BD5; }
</style>
