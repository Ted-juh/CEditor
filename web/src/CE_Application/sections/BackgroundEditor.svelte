<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { activateColorTarget } from '../stores/colorTarget.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let background = $derived(getSection(control, 'Background'));
  let fill = $derived(background?._children?.Fill);

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function handleSwatchClick() {
    if (!core?.id || !fill?.colour) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: 'Background.Fill.colour' },
      fill.colour
    );
  }

  function setMode(e) {
    set('Background.mode', e.target.value);
  }

  function setColour(e) {
    let val = e.target.value.replace(/^#/, '').toUpperCase();
    if (val.length === 6) val = 'FF' + val;
    set('Background.Fill.colour', val);
  }

  function selectAll(e) {
    e.target.select();
  }

  // Display colour without alpha prefix for the swatch
  let displayColour = $derived(fill?.colour ? fill.colour.slice(-6) : '3A3A3A');
</script>

{#if background}
  <div class="prop-card">
    <div class="prop-row">
      <span class="lbl">Mode</span>
      <select class="val" value={background.mode} onchange={setMode}>
        <option value="solid">Solid</option>
        <option value="gradient">Gradient</option>
        <option value="image">Image</option>
      </select>
    </div>
    <div class="prop-row">
      <span class="lbl">Colour</span>
      <div class="color-input">
        <button class="mini-swatch" title="Pick colour" style="background:#{displayColour}" onclick={handleSwatchClick}></button>
        <input class="val" type="text" value={displayColour}
               onfocus={selectAll} onchange={setColour} />
      </div>
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
  select.val { cursor: pointer; appearance: none; -webkit-appearance: none; padding-right: 20px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 6px center; }
  .color-input { display: flex; align-items: center; gap: 6px; flex: 1; }
  .mini-swatch { width: 18px; height: 18px; border-radius: 3px; border: 1px solid #555; flex-shrink: 0; cursor: pointer; padding: 0; }
  .mini-swatch:hover { border-color: #5B9BD5; }
</style>
