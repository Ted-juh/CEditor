<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
  import IterationCcw from 'lucide-svelte/icons/iteration-ccw';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let x = $derived(getSection(control, 'Crossfader'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Crossfader.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(x?.[prop] === true)); }
</script>

{#if x}
  <PropertySection title="Crossfader" icon={ArrowLeftRight}>
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
    <PropertyCell label="Mix" span={1} compact hint="Position: 0 = full A, 1 = full B.">
      <NumberCell label="Mix" min={0} max={1} step={0.01} value={x.mix ?? 0.5} defaultValue={0.5} onchange={(v) => set('mix', Math.max(0, Math.min(1, v)))} />
    </PropertyCell>
    <PropertyCell label="Bipolar" span={1} hint="Mix port emits −1..1.">
      <PropertyToggle value={x.bipolar === true} onchange={() => toggle('bipolar')} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the handle in preview.">
      <PropertyToggle value={x.editable !== false} onchange={() => set('editable', !(x.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Detent" span={1} compact hint="Snap-to-centre threshold (0 = off).">
      <NumberCell label="Detent" min={0} max={0.5} step={0.01} value={x.detent ?? 0.03} defaultValue={0.03} onchange={(v) => set('detent', Math.max(0, Math.min(0.5, v)))} />
    </PropertyCell>
    <PropertyCell label="Gain bars" span={1} hint="Draw per-side gain indicators.">
      <PropertyToggle value={x.showGains === true} onchange={() => toggle('showGains')} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Return to rest" icon={IterationCcw}>
    <PropertyCell label="On release" span={2} hint="Where the handle goes when you let go. Shared with the ribbon and the joystick, so an end is reachable now and not only the centre.">
        <select class="val" value={x.returnMode ?? 'none'} onchange={(e) => set('returnMode', e.target.value)}>
          <option value="none">Latch (stay put)</option>
          <option value="center">Centre</option>
          <option value="min">Minimum</option>
          <option value="max">Maximum</option>
          <option value="rest">A set value</option>
        </select>
    </PropertyCell>
    {#if String(x.returnMode ?? 'none') !== 'none'}
      <NumberCell label="Time (ms)" min={0} max={5000} step={10} value={x.returnTime ?? 250} onchange={(v) => set('returnTime', Math.max(0, v))} />
      <PropertyCell label="Curve" span={2} hint="Linear is the constant-speed walk these controls always had. Exp covers most of the distance early, which is what a real spring does.">
        <select class="val" value={x.returnCurve ?? 'linear'} onchange={(e) => set('returnCurve', e.target.value)}>
          <option value="linear">Linear</option>
          <option value="exp">Spring (exp)</option>
          <option value="ease">Ease</option>
        </select>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Labels & colours" icon={Palette}>
    <PropertyCell label="Labels" span={1} hint="Show the A/B end labels.">
      <PropertyToggle value={x.showLabels !== false} onchange={() => set('showLabels', !(x.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Label A" span={1}>
      <input class="val" type="text" value={x.labelA ?? 'A'} onchange={(e) => set('labelA', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Label B" span={1}>
      <input class="val" type="text" value={x.labelB ?? 'B'} onchange={(e) => set('labelB', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="A-side fill, B-side fill, handle, groove. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fillAColour', label: 'A', value: x.fillAColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.fillAColour' } },
        { key: 'fillBColour', label: 'B', value: x.fillBColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.fillBColour' } },
        { key: 'handleColour', label: 'Handle', value: x.handleColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.handleColour' } },
        { key: 'trackColour', label: 'Track', value: x.trackColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.trackColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
</style>
