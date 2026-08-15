<script>
  import { controlSources } from '../utils/controlSources.js';
  import { componentListWithElement } from '../utils/componentElements.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
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
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

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
      <PropertyCell label="dB floor" span={2} hint="Decibels at the bottom of the meter.">
        <input class="val" type="number" value={m.dbFloor ?? -60} onchange={(e) => set('dbFloor', num(e.target.value, -60))} />
      </PropertyCell>
      <PropertyCell label="dB ceil" span={2} hint="Decibels at the top of the meter.">
        <input class="val" type="number" value={m.dbCeil ?? 6} onchange={(e) => set('dbCeil', num(e.target.value, 6))} />
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
      <PropertyCell label="Value" span={2} hint="Static/test value shown when nothing drives the meter.">
        <input class="val" type="number" step="any" value={m.value ?? 0} onchange={(e) => set('value', num(e.target.value, 0))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Min" span={1} hint="Value at empty.">
      <input class="val" type="number" step="any" value={m.valueMin ?? 0} onchange={(e) => set('valueMin', num(e.target.value, 0))} />
    </PropertyCell>
    <PropertyCell label="Max" span={1} hint="Value at full.">
      <input class="val" type="number" step="any" value={m.valueMax ?? 1} onchange={(e) => set('valueMax', num(e.target.value, 1))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Fill" icon={PaintBucket}>
    <PropertyCell label="Segments" span={2} hint="0 = smooth continuous fill; N = N discrete LED segments.">
      <input class="val" type="number" min="0" max="64" value={m.segments ?? 0} onchange={(e) => set('segments', Math.max(0, Math.round(num(e.target.value, 0))))} />
    </PropertyCell>
    <PropertyCell label="Gradient" span={1} hint="Blend zone colours smoothly vs hard steps.">
      <PropertyToggle value={m.gradient !== false} onchange={() => set('gradient', !(m.gradient !== false))} />
    </PropertyCell>
    <PropertyCell label="Rounded" span={1} hint="Fill corner radius (px).">
      <input class="val" type="number" min="0" value={m.rounded ?? 3} onchange={(e) => set('rounded', Math.max(0, num(e.target.value, 3)))} />
    </PropertyCell>
    <PropertyCell label="Thickness" span={2} hint="Bar/arc thickness in px (0 = fill the box).">
      <input class="val" type="number" min="0" value={m.thickness ?? 0} onchange={(e) => set('thickness', Math.max(0, num(e.target.value, 0)))} />
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
            <input class="val zfrom" type="number" min="0" max="1" step="0.05" title="From (0–1)" value={z.from ?? 0} onchange={(e) => updateZone(i, 'from', Math.max(0, Math.min(1, num(e.target.value, 0))))} />
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
      <PropertyCell label="Hold (ms)" span={1} hint="How long the marker holds before falling.">
        <input class="val" type="number" min="0" value={m.peakHoldMs ?? 1200} onchange={(e) => set('peakHoldMs', Math.max(0, num(e.target.value, 1200)))} />
      </PropertyCell>
      <PropertyCell label="Decay/s" span={1} hint="Normalized units per second the marker falls.">
        <input class="val" type="number" min="0" step="0.05" value={m.peakDecayPerSec ?? 0.4} onchange={(e) => set('peakDecayPerSec', Math.max(0, num(e.target.value, 0.4)))} />
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
      <PropertyCell label="Tick count" span={2} hint="Number of divisions (marks = count + 1).">
        <input class="val" type="number" min="1" max="20" value={m.tickCount ?? 4} onchange={(e) => set('tickCount', Math.max(1, Math.round(num(e.target.value, 4))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Readout" span={2} hint="Show the numeric value overlaid on the meter.">
      <PropertyToggle value={m.showValue === true} onchange={() => toggle('showValue')} />
    </PropertyCell>
    {#if m.showValue === true}
      <PropertyCell label="Precision" span={1} hint="Decimal places in the readout.">
        <input class="val" type="number" min="0" max="6" value={m.valuePrecision ?? 0} onchange={(e) => set('valuePrecision', Math.max(0, Math.round(num(e.target.value, 0))))} />
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
      <PropertyCell label="Start°" span={2} hint="Arc start angle (clockwise from 3 o'clock).">
        <input class="val" type="number" value={m.arcStart ?? 135} onchange={(e) => set('arcStart', num(e.target.value, 135))} />
      </PropertyCell>
      <PropertyCell label="Sweep°" span={2} hint="Degrees the arc sweeps.">
        <input class="val" type="number" value={m.arcSweep ?? 270} onchange={(e) => set('arcSweep', num(e.target.value, 270))} />
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val {
    width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333;
    color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none;
  }
  .val:focus { border-color: #5B9BD5; }
  .zones { display: flex; flex-direction: column; gap: 6px; }
  .zrow { display: flex; align-items: center; gap: 6px; }
  .zrow .zfrom { flex: 0 0 70px; }
  .zrow .color { flex: 1 1 auto; }
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
