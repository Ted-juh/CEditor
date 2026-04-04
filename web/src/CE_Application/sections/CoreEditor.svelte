<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Core.${prop}`, value);
  }

  function handleInput(prop, e) {
    const el = e.target;
    let value = el.type === 'number' ? Number(el.value) : el.value;
    set(prop, value);
  }

  function handleToggle(prop) {
    set(prop, !core?.[prop]);
  }

  function selectAll(e) {
    e.target.select();
  }
</script>

{#if core}
  <div class="prop-card">
    <div class="prop-row">
      <span class="lbl">Name</span>
      <input class="val" type="text" value={core.name}
             onfocus={selectAll} onchange={(e) => handleInput('name', e)} />
    </div>
    <div class="prop-row">
      <span class="lbl">Type</span>
      <span class="val readonly">{core.controlType}</span>
    </div>
    <div class="prop-row">
      <span class="lbl">Visible</span>
      <button class="toggle-val" class:on={core.visible}
              onclick={() => handleToggle('visible')}>
        {core.visible ? 'On' : 'Off'}
      </button>
    </div>
    <div class="prop-row">
      <span class="lbl">Enabled</span>
      <button class="toggle-val" class:on={core.enabled}
              onclick={() => handleToggle('enabled')}>
        {core.enabled ? 'On' : 'Off'}
      </button>
    </div>
    <div class="prop-row">
      <span class="lbl">Locked</span>
      <button class="toggle-val" class:on={core.locked}
              onclick={() => handleToggle('locked')}>
        {core.locked ? 'On' : 'Off'}
      </button>
    </div>
    <div class="prop-row">
      <span class="lbl">Z-Index</span>
      <NumberInput value={core.zIndex} step={1} min={0} onchange={(v) => set('zIndex', v)} />
    </div>
    <div class="prop-row">
      <span class="lbl">Layer</span>
      <input class="val" type="text" value={core.layer}
             onfocus={selectAll} onchange={(e) => handleInput('layer', e)} />
    </div>
  </div>
{/if}

<style>
  .prop-card { display: flex; flex-direction: column; gap: 6px; }
  .prop-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 3px; }
  .prop-row:hover { background: #2A2A2A; }
  .lbl { color: #888; font-size: 11px; min-width: 54px; flex-shrink: 0; }
  .val { color: #DDD; font-size: 11px; background: #1A1A1A; padding: 4px 6px; border-radius: 3px; border: 1px solid #333; flex: 1; min-width: 0; font-family: inherit; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .val.readonly { background: transparent; border-color: transparent; color: #666; }
  .toggle-val { background: #1A1A1A; border: 1px solid #333; color: #888; font-size: 11px; padding: 3px 10px; border-radius: 3px; cursor: pointer; font-family: inherit; min-width: 40px; text-align: center; }
  .toggle-val.on { background: #094771; border-color: #0B6EB5; color: #DDD; }
  .toggle-val:hover { border-color: #5B9BD5; }
</style>
