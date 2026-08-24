<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import IterationCcw from 'lucide-svelte/icons/iteration-ccw';
  import Gamepad2 from 'lucide-svelte/icons/gamepad-2';
  import SquareDashedBottomCode from 'lucide-svelte/icons/square-dashed-bottom-code';
  import Monitor from 'lucide-svelte/icons/monitor';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let j = $derived(getSection(control, 'Joystick'));
  let labels = $derived(Array.isArray(j?.cornerLabels) ? j.cornerLabels : ['A', 'B', 'C', 'D']);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Joystick.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(j?.[prop] === true)); }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function setCornerLabel(i, value) { set('cornerLabels', labels.map((l, idx) => idx === i ? value : l)); }

</script>

{#if j}
  <PropertySection title="Joystick" icon={Gamepad2}>
    <PropertyCell label="Bipolar" span={1} hint="X/Y ports emit −1..1 (vs 0..1). Corner blends are always 0..1.">
      <PropertyToggle value={j.bipolar !== false} onchange={() => set('bipolar', !(j.bipolar !== false))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the puck in preview.">
      <PropertyToggle value={j.editable !== false} onchange={() => set('editable', !(j.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Rest X" span={1} compact hint="Resting puck X (0–1).">
      <NumberCell label="X" value={j.x ?? 0.5} min={0} max={1} step={0.01} defaultValue={0.5} onchange={(v) => set('x', Math.max(0, Math.min(1, num(v, 0.5))))} />
    </PropertyCell>
    <PropertyCell label="Rest Y" span={1} compact hint="Resting puck Y (0–1, bottom = 0).">
      <NumberCell label="Y" value={j.y ?? 0.5} min={0} max={1} step={0.01} defaultValue={0.5} onchange={(v) => set('y', Math.max(0, Math.min(1, num(v, 0.5))))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Return to rest" icon={IterationCcw}>
    <PropertyCell label="On release" span={2} hint="Where the puck goes when you let go. Shared with the ribbon and the crossfader, so a corner is reachable now and not only the centre.">
        <select class="val" value={j.returnMode ?? 'none'} onchange={(e) => set('returnMode', e.target.value)}>
          <option value="none">Latch (stay put)</option>
          <option value="center">Centre</option>
          <option value="min">Minimum</option>
          <option value="max">Maximum</option>
          <option value="rest">A set value</option>
        </select>
    </PropertyCell>
    {#if String(j.returnMode ?? 'none') !== 'none'}
      <PropertyCell label="Axes" span={2} hint="Which axes spring back. Both travel on ONE progress, so the puck moves in a straight line — per-axis timing would make it curve.">
        <select class="val" value={j.returnAxes ?? 'both'} onchange={(e) => set('returnAxes', e.target.value)}>
          <option value="both">Both</option>
          <option value="x">X only</option>
          <option value="y">Y only</option>
        </select>
      </PropertyCell>
      <NumberCell label="Time (ms)" min={0} max={5000} step={10} value={j.returnTime ?? 250} onchange={(v) => set('returnTime', Math.max(0, num(v, 250)))} />
      <PropertyCell label="Curve" span={2} hint="Linear is the constant-speed walk these controls always had. Exp covers most of the distance early, which is what a real spring does.">
        <select class="val" value={j.returnCurve ?? 'linear'} onchange={(e) => set('returnCurve', e.target.value)}>
          <option value="linear">Linear</option>
          <option value="exp">Spring (exp)</option>
          <option value="ease">Ease</option>
        </select>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Corners" icon={SquareDashedBottomCode}>
    <PropertyCell label="Show" span={1} hint="Draw corner markers + labels.">
      <PropertyToggle value={j.showCorners !== false} onchange={() => set('showCorners', !(j.showCorners !== false))} />
    </PropertyCell>
    <PropertyCell label="↖ Top-left" span={2}>
      <input class="val" type="text" value={labels[0] ?? 'A'} onchange={(e) => setCornerLabel(0, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="↗ Top-right" span={2}>
      <input class="val" type="text" value={labels[1] ?? 'B'} onchange={(e) => setCornerLabel(1, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="↙ Bottom-left" span={2}>
      <input class="val" type="text" value={labels[2] ?? 'C'} onchange={(e) => setCornerLabel(2, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="↘ Bottom-right" span={2}>
      <input class="val" type="text" value={labels[3] ?? 'D'} onchange={(e) => setCornerLabel(3, e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Display" icon={Monitor}>
    <PropertyCell label="Grid" span={1} hint="Background grid.">
      <PropertyToggle value={j.showGrid !== false} onchange={() => set('showGrid', !(j.showGrid !== false))} />
    </PropertyCell>
    <PropertyCell label="Divisions" span={1} compact hint="Grid divisions per axis.">
      <NumberCell label="Div" value={j.gridDiv ?? 4} min={1} max={16} step={1} defaultValue={4} onchange={(v) => set('gridDiv', Math.max(1, Math.round(num(v, 4))))} />
    </PropertyCell>
    <PropertyCell label="Crosshair" span={1} hint="Lines through the puck.">
      <PropertyToggle value={j.showCrosshair !== false} onchange={() => set('showCrosshair', !(j.showCrosshair !== false))} />
    </PropertyCell>
    <PropertyCell label="Puck size" span={1} compact hint="Puck radius (px).">
      <NumberCell label="Puck" value={j.puckRadius ?? 9} min={3} step={1} defaultValue={9} onchange={(v) => set('puckRadius', Math.max(3, num(v, 9)))} />
    </PropertyCell>
    <PropertyCell label="Trail" span={1} hint="Fading motion trail behind the puck.">
      <PropertyToggle value={j.showTrail === true} onchange={() => toggle('showTrail')} />
    </PropertyCell>
    {#if j.showTrail === true}
      <PropertyCell label="Trail length" span={1} compact hint="Number of trail points.">
        <NumberCell label="Len" value={j.trailLength ?? 24} min={2} max={200} step={1} defaultValue={24} onchange={(v) => set('trailLength', Math.max(2, Math.round(num(v, 24))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Colours" span={4} hint="Puck, pad background, corner marks, motion trail. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'puckColour', label: 'Puck', value: j.puckColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'Joystick.puckColour' } },
        { key: 'padColour', label: 'Pad', value: j.padColour ?? 'FF141414', target: { type: 'control', controlId: core?.id, path: 'Joystick.padColour' } },
        { key: 'cornerColour', label: 'Corners', value: j.cornerColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Joystick.cornerColour' } },
        { key: 'trailColour', label: 'Trail', value: j.trailColour ?? '665B9BD5', target: { type: 'control', controlId: core?.id, path: 'Joystick.trailColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
</style>
