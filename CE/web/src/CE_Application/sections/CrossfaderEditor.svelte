<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let x = $derived(getSection(control, 'Crossfader'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Crossfader.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(x?.[prop] === true)); }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

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

{#if x}
  <PropertySection title="Crossfader">
    <PropertyCell label="Law" span={2} hint="Equal-power = constant loudness. Linear = −6 dB dip at centre. Sharp = both full through the middle.">
      <select class="val" value={x.law ?? 'equalPower'} onchange={(e) => set('law', e.target.value)}>
        <option value="equalPower">Equal power (−3 dB)</option>
        <option value="linear">Linear (−6 dB)</option>
        <option value="sharp">Sharp</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Orientation" span={2} hint="Horizontal or vertical fader.">
      <select class="val" value={x.orientation ?? 'horizontal'} onchange={(e) => set('orientation', e.target.value)}>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Mix" span={2} hint="Position: 0 = full A, 1 = full B.">
      <input class="val" type="number" min="0" max="1" step="0.01" value={x.mix ?? 0.5} onchange={(e) => set('mix', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
    </PropertyCell>
    <PropertyCell label="Bipolar" span={1} hint="Mix port emits −1..1.">
      <PropertyToggle value={x.bipolar === true} onchange={() => toggle('bipolar')} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the handle in preview.">
      <PropertyToggle value={x.editable !== false} onchange={() => set('editable', !(x.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Detent" span={2} hint="Snap-to-centre threshold (0 = off).">
      <input class="val" type="number" min="0" max="0.5" step="0.01" value={x.detent ?? 0.03} onchange={(e) => set('detent', Math.max(0, Math.min(0.5, num(e.target.value, 0.03))))} />
    </PropertyCell>
    <PropertyCell label="Gain bars" span={2} hint="Draw per-side gain indicators.">
      <PropertyToggle value={x.showGains === true} onchange={() => toggle('showGains')} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Return to centre">
    <PropertyCell label="Spring back" span={2} hint="Glide the handle back to centre when released.">
      <PropertyToggle value={x.returnToCenter === true} onchange={() => toggle('returnToCenter')} />
    </PropertyCell>
    {#if x.returnToCenter === true}
      <PropertyCell label="Speed" span={2} hint="Glide speed (units/sec).">
        <input class="val" type="number" min="0.5" step="0.5" value={x.returnRate ?? 4} onchange={(e) => set('returnRate', Math.max(0.1, num(e.target.value, 4)))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Labels & colours">
    <PropertyCell label="Labels" span={2} hint="Show the A/B end labels.">
      <PropertyToggle value={x.showLabels !== false} onchange={() => set('showLabels', !(x.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Label A" span={1}>
      <input class="val" type="text" value={x.labelA ?? 'A'} onchange={(e) => set('labelA', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Label B" span={1}>
      <input class="val" type="text" value={x.labelB ?? 'B'} onchange={(e) => set('labelB', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="A colour" span={2} hint="A-side fill.">
      <input class="val color" type="color" value={hexToInput(x.fillAColour)} onchange={(e) => set('fillAColour', inputToArgb(x.fillAColour, e.target.value))} />
    </PropertyCell>
    <PropertyCell label="B colour" span={2} hint="B-side fill.">
      <input class="val color" type="color" value={hexToInput(x.fillBColour)} onchange={(e) => set('fillBColour', inputToArgb(x.fillBColour, e.target.value))} />
    </PropertyCell>
    <PropertyCell label="Handle" span={2} hint="Handle colour.">
      <input class="val color" type="color" value={hexToInput(x.handleColour)} onchange={(e) => set('handleColour', inputToArgb(x.handleColour, e.target.value))} />
    </PropertyCell>
    <PropertyCell label="Track" span={2} hint="Groove colour.">
      <input class="val color" type="color" value={hexToInput(x.trackColour)} onchange={(e) => set('trackColour', inputToArgb(x.trackColour, e.target.value))} />
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
