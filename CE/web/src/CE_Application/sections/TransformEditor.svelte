<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let designer = $derived(getSection(control, 'Designer'));
  let isCustomComponent = $derived(String(core?.controlType ?? '') === 'CustomComponent');
  let designWidth = $derived(Number(designer?.designWidth) || 0);
  let designHeight = $derived(Number(designer?.designHeight) || 0);

  function set(prop, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(`Transform.${prop}`, value);
    } else {
      updateControlProperty(core.id, `Transform.${prop}`, value);
    }
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
    <div class="prop-row-pair">
      <div class="prop-row half">
        <span class="lbl">MinW</span>
        <NumberInput value={transform.minWidth ?? 0} step={1} min={0} onchange={(v) => set('minWidth', v)} />
      </div>
      <div class="prop-row half">
        <span class="lbl">MinH</span>
        <NumberInput value={transform.minHeight ?? 0} step={1} min={0} onchange={(v) => set('minHeight', v)} />
      </div>
    </div>
    <div class="prop-row-pair">
      <div class="prop-row half">
        <span class="lbl">MaxW</span>
        <NumberInput value={transform.maxWidth ?? 0} step={1} min={0} onchange={(v) => set('maxWidth', v)} />
      </div>
      <div class="prop-row half">
        <span class="lbl">MaxH</span>
        <NumberInput value={transform.maxHeight ?? 0} step={1} min={0} onchange={(v) => set('maxHeight', v)} />
      </div>
    </div>
    <div class="prop-row">
      <span class="lbl">Aspect Lock</span>
      <button class="toggle-val" class:on={transform.aspectLock} onclick={() => set('aspectLock', !transform.aspectLock)}>
        {transform.aspectLock ? 'On' : 'Off'}
      </button>
    </div>
    {#if isCustomComponent}
      <div class="prop-row" title={designWidth > 0 ? `Design size ${Math.round(designWidth)}×${Math.round(designHeight)}. Stretch keeps px-sized internals at their authored size; Scale internals scales them with the instance.` : 'Scale internals needs a design size — open the component in the designer and re-save/instantiate to stamp it.'}>
        <span class="lbl">Resize</span>
        <button
          class="toggle-val"
          class:on={transform.contentScaleMode === 'scaleInternals'}
          disabled={designWidth <= 0 || designHeight <= 0}
          onclick={() => set('contentScaleMode', transform.contentScaleMode === 'scaleInternals' ? 'stretch' : 'scaleInternals')}
        >
          {transform.contentScaleMode === 'scaleInternals' ? 'Scale internals' : 'Stretch'}
        </button>
        {#if designWidth > 0}
          <span class="design-hint">base {Math.round(designWidth)}×{Math.round(designHeight)}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .prop-card { display: flex; flex-direction: column; gap: 6px; }
  .prop-row-pair { display: flex; gap: 4px; }
  .prop-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 3px; }
  .prop-row:hover { background: #2A2A2A; }
  .prop-row.half { flex: 1; }
  .lbl { color: #888; font-size: 11px; min-width: 20px; flex-shrink: 0; }
  .toggle-val {
    background: #252525; border: none; color: #888; font-size: 11px;
    padding: 2px 8px; border-radius: 3px; cursor: pointer; font-family: inherit;
  }
  .toggle-val:hover { background: #333; color: #CCC; }
  .toggle-val.on { background: #094771; color: #5B9BD5; }
  .toggle-val:disabled { opacity: 0.45; cursor: default; }
  .design-hint { color: #666; font-size: 10px; margin-left: auto; }
</style>
