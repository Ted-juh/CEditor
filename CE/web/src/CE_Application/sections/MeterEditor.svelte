<script>
  import { controlSources } from '../utils/controlSources.js';
  import { componentListWithElement } from '../utils/componentElements.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
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
  <PropertySection title="Meter" icon={Gauge}>
    <PropertyCell label="Orientation" span={2} hint="Horizontal / vertical bar, or a radial arc.">
      <select class="val" value={m.orientation ?? 'horizontal'} onchange={(e) => set('orientation', e.target.value)}>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
        <option value="arc">Arc</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Scale" span={2} hint="Linear, or decibel (0 dB near full scale).">
      <select class="val" value={m.scale ?? 'linear'} onchange={(e) => set('scale', e.target.value)}>
        <option value="linear">Linear</option>
        <option value="db">Decibel</option>
      </select>
    </PropertyCell>
    {#if String(m.scale) === 'db'}
      <PropertyCell label="dB floor" span={2} compact hint="Decibels at the bottom of the meter.">
        <NumberCell label="Floor" value={m.dbFloor ?? -60} defaultValue={-60} onchange={(v) => set('dbFloor', v)} />
      </PropertyCell>
      <PropertyCell label="dB ceil" span={2} compact hint="Decibels at the top of the meter.">
        <NumberCell label="Ceil" value={m.dbCeil ?? 6} defaultValue={6} onchange={(v) => set('dbCeil', v)} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Value" icon={Hash}>
    <PropertyCell label="Source" span={4} hint="A knob / slider / number whose live value drives the meter in preview (a bound device parameter drives it at runtime).">
      <select class="val" value={m.valueSourceId ?? ''} onchange={(e) => set('valueSourceId', e.target.value)}>
        <option value="">— Static / bound level —</option>
        {#each valueSources as s (s.id)}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
    </PropertyCell>
    {#if !m.valueSourceId}
      <PropertyCell label="Value" span={2} compact hint="Static/test value shown when nothing drives the meter.">
        <NumberCell label="Val" value={m.value ?? 0} defaultValue={0} onchange={(v) => set('value', v)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Min" span={1} compact hint="Value at empty.">
      <NumberCell label="Min" value={m.valueMin ?? 0} defaultValue={0} onchange={(v) => set('valueMin', v)} />
    </PropertyCell>
    <PropertyCell label="Max" span={1} compact hint="Value at full.">
      <NumberCell label="Max" value={m.valueMax ?? 1} defaultValue={1} onchange={(v) => set('valueMax', v)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Fill" icon={PaintBucket}>
    <PropertyCell label="Segments" span={2} compact hint="0 = smooth continuous fill; N = N discrete LED segments.">
      <NumberCell label="Seg" min={0} max={64} value={m.segments ?? 0} defaultValue={0} onchange={(v) => set('segments', Math.max(0, Math.round(v)))} />
    </PropertyCell>
    <PropertyCell label="Gradient" span={1} hint="Blend zone colours smoothly vs hard steps.">
      <PropertyToggle value={m.gradient !== false} onchange={() => set('gradient', !(m.gradient !== false))} />
    </PropertyCell>
    <PropertyCell label="Rounded" span={1} compact hint="Fill corner radius (px).">
      <NumberCell label="Rad" min={0} value={m.rounded ?? 3} defaultValue={3} onchange={(v) => set('rounded', Math.max(0, v))} />
    </PropertyCell>
    <PropertyCell label="Thickness" span={2} compact hint="Bar/arc thickness in px (0 = fill the box).">
      <NumberCell label="Thick" min={0} value={m.thickness ?? 0} defaultValue={0} onchange={(v) => set('thickness', Math.max(0, v))} />
    </PropertyCell>
    <PropertyCell label="Track" span={2} hint="Unlit background colour. Click the swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'trackColour', label: 'Track', value: m.trackColour ?? 'FF1B1B1B', target: { type: 'control', controlId: core?.id, path: 'Meter.trackColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Zones" icon={SquareDashed}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add zone" onclick={addZone}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each zone lights the fill from its position (0–1) upward; leave one at 0 for the base colour.">
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
    {#if m.peakHold === true}
      <PropertyCell label="Hold (ms)" span={1} compact hint="How long the marker holds before falling.">
        <NumberCell label="Hold" min={0} value={m.peakHoldMs ?? 1200} defaultValue={1200} onchange={(v) => set('peakHoldMs', Math.max(0, v))} />
      </PropertyCell>
      <PropertyCell label="Decay/s" span={1} compact hint="Normalized units per second the marker falls.">
        <NumberCell label="Decay" min={0} step={0.05} value={m.peakDecayPerSec ?? 0.4} defaultValue={0.4} onchange={(v) => set('peakDecayPerSec', Math.max(0, v))} />
      </PropertyCell>
      <PropertyCell label="Colour" span={2} hint="Peak marker colour. Click the swatch to edit it in the Colors tab.">
        <SwatchCluster swatches={[
          { key: 'peakColour', label: 'Peak', value: m.peakColour ?? 'FFF2F2F2', target: { type: 'control', controlId: core?.id, path: 'Meter.peakColour' } },
        ]} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Scale & readout" icon={Ruler}>
    <PropertyCell label="Ticks" span={2} hint="Draw scale tick marks along the meter.">
      <PropertyToggle value={m.showTicks === true} onchange={() => toggle('showTicks')} />
    </PropertyCell>
    {#if m.showTicks === true}
      <PropertyCell label="Tick count" span={2} compact hint="Number of divisions (marks = count + 1).">
        <NumberCell label="Ticks" min={1} max={20} value={m.tickCount ?? 4} defaultValue={4} onchange={(v) => set('tickCount', Math.max(1, Math.round(v)))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Readout" span={2} hint="Show the numeric value overlaid on the meter.">
      <PropertyToggle value={m.showValue === true} onchange={() => toggle('showValue')} />
    </PropertyCell>
    {#if m.showValue === true}
      <PropertyCell label="Precision" span={1} compact hint="Decimal places in the readout.">
        <NumberCell label="Prec" min={0} max={6} value={m.valuePrecision ?? 0} defaultValue={0} onchange={(v) => set('valuePrecision', Math.max(0, Math.round(v)))} />
      </PropertyCell>
      <PropertyCell label="Suffix" span={1} hint="Unit after the number (e.g. dB, %).">
        <input class="val" type="text" value={m.valueSuffix ?? ''} onchange={(e) => set('valueSuffix', e.target.value)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Caption" span={3} hint="A text label shown with the meter.">
      <input class="val" type="text" value={m.label ?? ''} onchange={(e) => set('label', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Position" span={1} hint="Where the caption sits.">
      <select class="val" value={m.labelPosition ?? 'none'} onchange={(e) => set('labelPosition', e.target.value)}>
        <option value="none">None</option>
        <option value="above">Above</option>
        <option value="below">Below</option>
      </select>
    </PropertyCell>
  </PropertySection>

  {#if String(m.orientation) === 'arc'}
    <PropertySection title="Arc" icon={Radius}>
      <PropertyCell label="Start°" span={2} compact hint="Arc start angle (clockwise from 3 o'clock).">
        <NumberCell label="Start" value={m.arcStart ?? 135} defaultValue={135} onchange={(v) => set('arcStart', v)} />
      </PropertyCell>
      <PropertyCell label="Sweep°" span={2} compact hint="Degrees the arc sweeps.">
        <NumberCell label="Sweep" value={m.arcSweep ?? 270} defaultValue={270} onchange={(v) => set('arcSweep', v)} />
      </PropertyCell>
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
