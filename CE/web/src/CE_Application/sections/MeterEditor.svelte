<script>
  import { controlSources } from '../utils/controlSources.js';
  import { componentListWithElement } from '../utils/componentElements.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import FieldList from '../properties/FieldList.svelte';
  import {
    METER_ARC_FIELDS, METER_FIELDS, METER_FILL_FIELDS, METER_PEAK_FIELDS, METER_READOUT_FIELDS, METER_VALUE_FIELDS,
  } from '../models/inspectorFieldSets.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import Gauge from 'lucide-svelte/icons/gauge';
  import Hash from 'lucide-svelte/icons/hash';
  import PaintBucket from 'lucide-svelte/icons/paint-bucket';
  import SquareDashed from 'lucide-svelte/icons/square-dashed';
  import Mountain from 'lucide-svelte/icons/mountain';
  import Ruler from 'lucide-svelte/icons/ruler';
  import Radius from 'lucide-svelte/icons/radius';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let m = $derived(getSection(control, 'Meter'));

  // Value-producing controls (slider / knob / range / number) that can drive the meter.
  let valueSources = $derived(
    controlSources($activePanel?.controls, 'range', core?.id)
  );

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Meter.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(m?.[prop] === true)); }

  let zones = $derived(Array.isArray(m?.zones) ? m.zones : []);
  function setZones(next) { set('zones', next); }
  function addZone() {
    setZones(componentListWithElement('Meter', 'zones', zones, m));
  }
  function updateZone(i, key, value) {
    setZones(zones.map((z, idx) => idx === i ? { ...z, [key]: value } : z));
  }
  function removeZone(i) {
    const next = [...zones]; next.splice(i, 1); setZones(next);
  }
  // AARRGGBB <-> #RRGGBB for the colour inputs (alpha preserved).
</script>

{#if m}
  <!-- Ordinary fields are data (models/inspectorFieldSets.js); the cells below are the editor's own. -->
  {#snippet source()}
    <PropertyCell label="Source" span={4} hint="A knob / slider / number whose live value drives the meter in preview (a bound device parameter drives it at runtime).">
      <select class="val" value={m.valueSourceId ?? ''} onchange={(e) => set('valueSourceId', e.target.value)}>
        <option value="">— Static / bound level —</option>
        {#each valueSources as s (s.id)}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
    </PropertyCell>
  {/snippet}
  {#snippet track()}
    <PropertyCell label="Track" span={2} hint="Unlit background colour. Click the swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'trackColour', label: 'Track', value: m.trackColour ?? 'FF1B1B1B', target: { type: 'control', controlId: core?.id, path: 'Meter.trackColour' } },
      ]} />
    </PropertyCell>
  {/snippet}
  {#snippet peakColour()}
    <PropertyCell label="Colour" span={2} hint="Peak marker colour. Click the swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'peakColour', label: 'Peak', value: m.peakColour ?? 'FFF2F2F2', target: { type: 'control', controlId: core?.id, path: 'Meter.peakColour' } },
      ]} />
    </PropertyCell>
  {/snippet}
  {#snippet suffix()}
    <PropertyCell label="Suffix" span={1} hint="Unit after the number (e.g. dB, %).">
      <input class="val" type="text" value={m.valueSuffix ?? ''} onchange={(e) => set('valueSuffix', e.target.value)} />
    </PropertyCell>
  {/snippet}
  {#snippet caption()}
    <PropertyCell label="Caption" span={3} hint="A text label shown with the meter.">
      <input class="val" type="text" value={m.label ?? ''} onchange={(e) => set('label', e.target.value)} />
    </PropertyCell>
  {/snippet}

  <PropertySection title="Meter" icon={Gauge}>
    <FieldList fields={METER_FIELDS} values={m} {set} />
  </PropertySection>

  <PropertySection title="Value" icon={Hash}>
    <FieldList fields={METER_VALUE_FIELDS} values={m} {set} slots={{ source }} />
  </PropertySection>

  <PropertySection title="Fill" icon={PaintBucket}>
    <FieldList fields={METER_FILL_FIELDS} values={m} {set} slots={{ track }} />
  </PropertySection>

  <PropertySection title="Zones" icon={SquareDashed}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add zone" onclick={addZone}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each zone lights the fill from its position (0–1) upward; leave one at 0 for the base colour." compact>
      <div class="zones">
        {#if zones.length === 0}
          <div class="empty">No zones — the fill uses one colour. Add a zone to colour by level.</div>
        {/if}
        {#each zones as z, i (i)}
          <div class="zrow">
            <span class="zfrom nc-wrap" title="From (0–1)">
              <NumberCell min={0} max={1} step={0.05} value={z.from ?? 0} defaultValue={0} onchange={(v) => updateZone(i, 'from', Math.max(0, Math.min(1, v)))} />
            </span>
            <SwatchCluster swatches={[
              { key: `zone-${i}`, label: 'Zone', value: z.colour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => updateZone(i, 'colour', hex) } },
            ]} />
            <button type="button" class="action-btn danger" onclick={() => removeZone(i)}>✕</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Peak hold" icon={Mountain}>
    {#snippet tools()}
      <HeaderPill value={m.peakHold === true}
                  title="Show a marker at the recent maximum that holds then falls."
                  onchange={() => toggle('peakHold')} />
    {/snippet}
    <FieldList fields={METER_PEAK_FIELDS} values={m} {set} slots={{ peakColour }} />
  </PropertySection>

  <PropertySection title="Scale & readout" icon={Ruler}>
    <FieldList fields={METER_READOUT_FIELDS} values={m} {set} slots={{ suffix, caption }} />
  </PropertySection>

  {#if String(m.orientation) === 'arc'}
    <PropertySection title="Arc" icon={Radius}>
      <FieldList fields={METER_ARC_FIELDS} values={m} {set} />
    </PropertySection>
  {/if}
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .zones { display: flex; flex-direction: column; gap: 6px; }
  .zrow { display: flex; align-items: center; gap: 6px; }
  .zrow .zfrom { flex: 0 0 70px; }
  .nc-wrap { display: flex; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
  .hdr-btn {
    height: 16px; font-size: 9px; padding: 0 8px; border-radius: 8px;
    background: #252525; border: 1px solid #333; color: #777;
    font-family: inherit; cursor: pointer; line-height: 1;
  }
  .hdr-btn:hover { border-color: #4A6E8C; color: #CCC; }
</style>
