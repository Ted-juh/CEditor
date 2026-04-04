<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Transform.${prop}`, value);
  }
</script>

{#if transform}
  <div class="prop-card">
    <div class="prop-row-pair">
      <div class="prop-row half">
        <span class="lbl">X</span>
        <NumberInput value={transform.x} step={1} onchange={(v) => set('x', v)} />
      </div>
      <div class="prop-row half">
        <span class="lbl">Y</span>
        <NumberInput value={transform.y} step={1} onchange={(v) => set('y', v)} />
      </div>
    </div>
    <div class="prop-row-pair">
      <div class="prop-row half">
        <span class="lbl">W</span>
        <NumberInput value={transform.width} step={1} min={10} onchange={(v) => set('width', v)} />
      </div>
      <div class="prop-row half">
        <span class="lbl">H</span>
        <NumberInput value={transform.height} step={1} min={10} onchange={(v) => set('height', v)} />
      </div>
    </div>
    <div class="prop-row-pair">
      <div class="prop-row half">
        <span class="lbl">Opacity</span>
        <NumberInput value={transform.opacity} step={0.05} min={0} max={1} onchange={(v) => set('opacity', v)} />
      </div>
      <div class="prop-row half">
        <span class="lbl">Rot</span>
        <NumberInput value={transform.rotation} step={1} onchange={(v) => set('rotation', v)} />
      </div>
    </div>
  </div>
{/if}

<style>
  .prop-card { display: flex; flex-direction: column; gap: 6px; }
  .prop-row-pair { display: flex; gap: 4px; }
  .prop-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 3px; }
  .prop-row:hover { background: #2A2A2A; }
  .prop-row.half { flex: 1; }
  .lbl { color: #888; font-size: 11px; min-width: 20px; flex-shrink: 0; }
</style>
