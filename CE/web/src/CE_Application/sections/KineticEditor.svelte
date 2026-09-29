<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import FieldList from '../properties/FieldList.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import Orbit from 'lucide-svelte/icons/orbit';
  import Palette from 'lucide-svelte/icons/palette';
  import LogOut from 'lucide-svelte/icons/log-out';
  import { KINETIC_FIELDS } from '../models/inspectorFieldSets.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let k = $derived(getSection(control, 'Kinetic'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Kinetic.${prop}`, value);
  }
  // Reset the ball to a fresh start (a random-ish throw from mid-box).
  function reset() {
    set('initial', { x: 0.5, y: 0.72, vx: (Math.round(Math.random() * 140) - 70) / 100, vy: Math.round(Math.random() * 60) / 100 });
  }

</script>

{#if k}
  <PropertySection title="Kinetic" icon={Orbit}>
    <!-- The ordinary fields are data (models/inspectorFieldSets.js); these two are the section's own. -->
    {#snippet sync()}
      <TransportSyncCells
        synced={k.syncToTransport === true}
        onchange={(v) => set('syncToTransport', v)}
        span={2}
        hint="Advance the simulation in musical time — tempo scales the motion, a stopped transport freezes the ball."
      />
    {/snippet}
    {#snippet resetBall()}
      <PropertyCell label="Reset" span={2} hint="Drop the ball back to a fresh start.">
        <button type="button" class="action-btn" onclick={reset}>Reset ball</button>
      </PropertyCell>
    {/snippet}
    <FieldList fields={KINETIC_FIELDS} values={k} {set} slots={{ sync, reset: resetBall }} />
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Field background, ball + trail, walls, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: k.fieldColour ?? 'FF0D0D12', target: { type: 'control', controlId: core?.id, path: 'Kinetic.fieldColour' } },
        { key: 'ballColour', label: 'Ball', value: k.ballColour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => { set('ballColour', hex); set('trailColour', hex); } } },
        { key: 'wallColour', label: 'Walls', value: k.wallColour ?? 'FF2A6BA8', target: { type: 'control', controlId: core?.id, path: 'Kinetic.wallColour' } },
        { key: 'labelColour', label: 'Labels', value: k.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Kinetic.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Outputs" icon={LogOut}>
    <PropertyCell label="" span={4} hint="Ports: X, Y, Speed, and a Bounce gate that pulses on each wall hit. Bind them in Device Bindings." compact>
      <div class="ports">
        <span class="chip"><i style="background:#39D98A"></i>X</span>
        <span class="chip"><i style="background:#5B9BD5"></i>Y</span>
        <span class="chip"><i style="background:#F2994A"></i>Speed</span>
        <span class="chip"><i style="background:#F2C94C"></i>Bounce</span>
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .ports { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #C8C8CE; }
  .chip i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 10px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
</style>
