<script>
  // Shape — which primitive, and how it is painted.
  //
  // The kind list is read from `shapeGeometry.js` rather than written here: the custom-component
  // designer's draw tools already define twelve polygons, and a second list would be twelve shapes
  // that can drift from the twelve in the palette.
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { SHAPE_KINDS } from '../utils/shapePrimitives.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Pentagon from 'lucide-svelte/icons/pentagon';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let sh = $derived(getSection(control, 'Shape'));
  let kind = $derived(String(sh?.kind ?? 'rectangle').toLowerCase());

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Shape.${prop}`, value);
  }
</script>

{#if sh}
  <PropertySection title="Shape" icon={Pentagon}>
    <PropertyCell label="Kind" span={4} hint="Every shape fills the control's box, so resizing the control is how you draw it — an ellipse in an oblong box is an oblong ellipse, and a line runs corner to corner.">
      <select class="val" value={kind} onchange={(event) => set('kind', event.target.value)}>
        {#each SHAPE_KINDS as name}<option value={name}>{name}</option>{/each}
      </select>
    </PropertyCell>

    {#if kind === 'rectangle'}
      <NumberCell label="Corner radius" min={0} max={400} step={1} value={sh.cornerRadius ?? 0} onchange={(v) => set('cornerRadius', v)} />
    {/if}
    <NumberCell label="Rotation" min={-360} max={360} step={1} value={sh.rotation ?? 0} onchange={(v) => set('rotation', v)} />

    <PropertyCell label="Fill" span={2} hint="A line has no interior, so it is never filled whatever this says.">
      <PropertyToggle value={sh.fillEnabled !== false} onchange={(next) => set('fillEnabled', next)} />
    </PropertyCell>
    <PropertyCell label="Stroke" span={2}>
      <PropertyToggle value={sh.strokeEnabled !== false} onchange={(next) => set('strokeEnabled', next)} />
    </PropertyCell>

    {#if sh.strokeEnabled !== false}
      <NumberCell label="Stroke width" min={0} max={40} step={0.5} value={sh.strokeWidth ?? 1} onchange={(v) => set('strokeWidth', v)} />
      <PropertyCell label="Stroke style" span={2} hint="The path is inset by half the stroke, so a thick outline stays inside the control's box instead of painting over its neighbours.">
        <select class="val" value={sh.strokeStyle ?? 'solid'} onchange={(event) => set('strokeStyle', event.target.value)}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </PropertyCell>
      {#if String(sh.strokeStyle) === 'dashed'}
        <NumberCell label="Dash length" min={1} max={40} step={1} value={sh.strokeDash ?? 6} onchange={(v) => set('strokeDash', v)} />
      {/if}
      {#if kind === 'line'}
        <PropertyCell label="Line ends" span={2}>
          <select class="val" value={sh.lineCap ?? 'butt'} onchange={(event) => set('lineCap', event.target.value)}>
            <option value="butt">Flat</option>
            <option value="round">Round</option>
            <option value="square">Square</option>
          </select>
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Colours" icon={Palette}>
    <PropertyCell label="" span={4} compact>
      <SwatchCluster swatches={[
        { key: 'fillColour', label: 'Fill', value: sh.fillColour ?? 'FF2A2A32', target: { type: 'control', controlId: core?.id, path: 'Shape.fillColour' } },
        { key: 'strokeColour', label: 'Stroke', value: sh.strokeColour ?? 'FF3A3A44', target: { type: 'control', controlId: core?.id, path: 'Shape.strokeColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}
