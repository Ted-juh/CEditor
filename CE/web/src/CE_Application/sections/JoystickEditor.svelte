<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

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

  function hexToInput(argb) {
    const s = String(argb ?? '').replace(/^#/, '');
    return /^[0-9a-fA-F]{8}$/.test(s) ? `#${s.slice(2)}` : (/^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : '#000000');
  }
  function inputToArgb(prev, hex) {
    const rgb = String(hex ?? '').replace(/^#/, '').toUpperCase();
    const alpha = /^[0-9a-fA-F]{8}$/.test(String(prev ?? '').replace(/^#/, '')) ? String(prev).replace(/^#/, '').slice(0, 2) : 'FF';
    return `${alpha}${rgb}`;
  }
</script>

{#if j}
  <PropertySection title="Joystick">
    <PropertyCell label="Bipolar" span={2} hint="X/Y ports emit −1..1 (vs 0..1). Corner blends are always 0..1.">
      <PropertyToggle value={j.bipolar !== false} onchange={() => set('bipolar', !(j.bipolar !== false))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={2} hint="Drag the puck in preview.">
      <PropertyToggle value={j.editable !== false} onchange={() => set('editable', !(j.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Rest X" span={2} hint="Resting puck X (0–1).">
      <input class="val" type="number" min="0" max="1" step="0.01" value={j.x ?? 0.5} onchange={(e) => set('x', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
    </PropertyCell>
    <PropertyCell label="Rest Y" span={2} hint="Resting puck Y (0–1, bottom = 0).">
      <input class="val" type="number" min="0" max="1" step="0.01" value={j.y ?? 0.5} onchange={(e) => set('y', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Return to rest">
    <PropertyCell label="Spring back" span={2} hint="Glide the puck back to centre when released (pitch/mod-wheel feel).">
      <PropertyToggle value={j.returnToCenter === true} onchange={() => toggle('returnToCenter')} />
    </PropertyCell>
    {#if j.returnToCenter === true}
      <PropertyCell label="Axes" span={1} hint="Which axes spring back.">
        <select class="val" value={j.returnAxes ?? 'both'} onchange={(e) => set('returnAxes', e.target.value)}>
          <option value="both">Both</option>
          <option value="x">X only</option>
          <option value="y">Y only</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Speed" span={1} hint="Glide speed (units/sec).">
        <input class="val" type="number" min="0.5" step="0.5" value={j.returnRate ?? 4} onchange={(e) => set('returnRate', Math.max(0.1, num(e.target.value, 4)))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Corners">
    <PropertyCell label="Show" span={2} hint="Draw corner markers + labels.">
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

  <PropertySection title="Display">
    <PropertyCell label="Grid" span={1} hint="Background grid.">
      <PropertyToggle value={j.showGrid !== false} onchange={() => set('showGrid', !(j.showGrid !== false))} />
    </PropertyCell>
    <PropertyCell label="Divisions" span={1} hint="Grid divisions per axis.">
      <input class="val" type="number" min="1" max="16" value={j.gridDiv ?? 4} onchange={(e) => set('gridDiv', Math.max(1, Math.round(num(e.target.value, 4))))} />
    </PropertyCell>
    <PropertyCell label="Crosshair" span={1} hint="Lines through the puck.">
      <PropertyToggle value={j.showCrosshair !== false} onchange={() => set('showCrosshair', !(j.showCrosshair !== false))} />
    </PropertyCell>
    <PropertyCell label="Puck size" span={1} hint="Puck radius (px).">
      <input class="val" type="number" min="3" value={j.puckRadius ?? 9} onchange={(e) => set('puckRadius', Math.max(3, num(e.target.value, 9)))} />
    </PropertyCell>
    <PropertyCell label="Trail" span={2} hint="Fading motion trail behind the puck.">
      <PropertyToggle value={j.showTrail === true} onchange={() => toggle('showTrail')} />
    </PropertyCell>
    {#if j.showTrail === true}
      <PropertyCell label="Trail length" span={2} hint="Number of trail points.">
        <input class="val" type="number" min="2" max="200" value={j.trailLength ?? 24} onchange={(e) => set('trailLength', Math.max(2, Math.round(num(e.target.value, 24))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Puck" span={2} hint="Puck colour.">
      <input class="val color" type="color" value={hexToInput(j.puckColour)} onchange={(e) => set('puckColour', inputToArgb(j.puckColour, e.target.value))} />
    </PropertyCell>
    <PropertyCell label="Pad" span={2} hint="Pad background.">
      <input class="val color" type="color" value={hexToInput(j.padColour)} onchange={(e) => set('padColour', inputToArgb(j.padColour, e.target.value))} />
    </PropertyCell>
    <PropertyCell label="Corner mark" span={2} hint="Corner marker colour.">
      <input class="val color" type="color" value={hexToInput(j.cornerColour)} onchange={(e) => set('cornerColour', inputToArgb(j.cornerColour, e.target.value))} />
    </PropertyCell>
    <PropertyCell label="Trail colour" span={2} hint="Motion-trail colour.">
      <input class="val color" type="color" value={hexToInput(j.trailColour)} onchange={(e) => set('trailColour', inputToArgb(j.trailColour, e.target.value))} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val {
    width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333;
    color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none;
  }
  .val:focus { border-color: #5B9BD5; }
  .val.color { padding: 1px 2px; height: 24px; cursor: pointer; }
</style>
