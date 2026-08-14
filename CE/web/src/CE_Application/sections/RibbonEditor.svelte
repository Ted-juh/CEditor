<script>
  import { getSection, updateControlProperty, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let r = $derived(getSection(control, 'Ribbon'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Ribbon.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(r?.[prop] === true)); }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  // Quick presets — set the handful of fields that make a ribbon / pitch / mod.
  // Patch is a flat map of dot-paths → values.
  function applyPreset(name) {
    if (!core?.id) return;
    const fields = name === 'pitch'
      ? { style: 'wheel3d', orientation: 'vertical', bipolar: true, value: 0.5, returnMode: 'center', returnRate: 12 }
      : name === 'mod'
        ? { style: 'wheel3d', orientation: 'vertical', bipolar: false, value: 0, returnMode: 'none' }
        : { style: 'ribbon', bipolar: false, returnMode: 'none' };
    const patch = {};
    for (const [k, v] of Object.entries(fields)) patch[`Ribbon.${k}`] = v;
    applyControlPatch(core.id, patch);
  }
</script>

{#if r}
  <PropertySection title="Ribbon">
    <PropertyCell label="Preset" span={4} hint="Quick-set for the common hardware controllers.">
      <div class="presets">
        <button type="button" class="action-btn" onclick={() => applyPreset('ribbon')}>Touch ribbon</button>
        <button type="button" class="action-btn" onclick={() => applyPreset('pitch')}>Pitch wheel</button>
        <button type="button" class="action-btn" onclick={() => applyPreset('mod')}>Mod wheel</button>
      </div>
    </PropertyCell>
    <PropertyCell label="Style" span={2} hint="Flat touch strip or a 3-D wheel.">
      <select class="val" value={r.style ?? 'ribbon'} onchange={(e) => set('style', e.target.value)}>
        <option value="ribbon">Ribbon (strip)</option>
        <option value="wheel">Wheel (flat)</option>
        <option value="wheel3d">Wheel (realistic)</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Orientation" span={2} hint="Vertical or horizontal.">
      <select class="val" value={r.orientation ?? 'vertical'} onchange={(e) => set('orientation', e.target.value)}>
        <option value="vertical">Vertical</option>
        <option value="horizontal">Horizontal</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Value" span={2} hint="Current / rest position (0–1).">
      <input class="val" type="number" min="0" max="1" step="0.01" value={r.value ?? 0.5} onchange={(e) => set('value', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
    </PropertyCell>
    <PropertyCell label="Bipolar" span={1} hint="Value port emits −1..1 (pitch bend).">
      <PropertyToggle value={r.bipolar === true} onchange={() => toggle('bipolar')} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Touch/drag in preview.">
      <PropertyToggle value={r.editable !== false} onchange={() => set('editable', !(r.editable !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Return to rest">
    <PropertyCell label="Mode" span={2} hint="What the value does on release. Centre = pitch wheel; None = latch (mod wheel / ribbon).">
      <select class="val" value={r.returnMode ?? 'none'} onchange={(e) => set('returnMode', e.target.value)}>
        <option value="none">None (latch)</option>
        <option value="center">Centre</option>
        <option value="min">Min</option>
        <option value="max">Max</option>
        <option value="rest">Rest value</option>
      </select>
    </PropertyCell>
    {#if r.returnMode === 'rest'}
      <PropertyCell label="Rest" span={1} hint="Rest value (0–1).">
        <input class="val" type="number" min="0" max="1" step="0.01" value={r.returnValue ?? 0.5} onchange={(e) => set('returnValue', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
      </PropertyCell>
    {/if}
    {#if String(r.returnMode ?? 'none') !== 'none'}
      <PropertyCell label="Speed" span={1} hint="Glide speed (units/sec; 0 = instant snap).">
        <input class="val" type="number" min="0" step="0.5" value={r.returnRate ?? 8} onchange={(e) => set('returnRate', Math.max(0, num(e.target.value, 8)))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Snap" span={2} hint="Value snap step (0 = continuous).">
      <input class="val" type="number" min="0" max="1" step="0.01" value={r.snap ?? 0} onchange={(e) => set('snap', Math.max(0, Math.min(1, num(e.target.value, 0))))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Display">
    <PropertyCell label="Touch glow" span={2} hint="Glow while held.">
      <PropertyToggle value={r.showGlow !== false} onchange={() => set('showGlow', !(r.showGlow !== false))} />
    </PropertyCell>
    <PropertyCell label="Readout" span={2} hint="Show the numeric value.">
      <PropertyToggle value={r.showValue === true} onchange={() => toggle('showValue')} />
    </PropertyCell>
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
  .val {
    width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333;
    color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none;
  }
  .val:focus { border-color: #5B9BD5; }
  .presets { display: flex; gap: 6px; flex-wrap: wrap; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer;
  }
  .action-btn:hover { border-color: #5B9BD5; }
</style>
