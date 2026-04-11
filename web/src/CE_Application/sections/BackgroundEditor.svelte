<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import ButtonGroup from '../properties/ButtonGroup.svelte';
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

  // --- Fill ---
  function handleSwatchClick() {
    if (!core?.id || !fill?.colour) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: 'Background.Fill.colour' },
      fill.colour
    );
  }

  function setColour(e) {
    let val = e.target.value.replace(/^#/, '').toUpperCase();
    if (val.length === 6) val = 'FF' + val;
    set('Background.Fill.colour', val);
  }

  function selectAll(e) {
    e.target.select();
  }

  let displayColour = $derived(fill?.colour ? fill.colour.slice(-6) : '3A3A3A');

  // Fill mode options
  const fillModes = [
    { value: 'solid', label: 'Solid' },
    { value: 'gradient', label: 'Grad' },
    { value: 'image', label: 'Image' },
    { value: 'none', label: 'None' },
  ];
</script>

{#if background}
  <div class="bg-editor">

    <div class="prop-row full-span">
      <span class="lbl">Mode</span>
      <ButtonGroup options={fillModes} value={background.mode} onchange={(v) => set('Background.mode', v)} />
    </div>
    {#if background.mode === 'solid'}
      <div class="prop-row full-span">
        <span class="lbl">Colour</span>
        <div class="color-input">
          <button class="mini-swatch" title="Pick colour" style="background:#{displayColour}" onclick={handleSwatchClick}></button>
          <input class="val" type="text" value={displayColour} onfocus={selectAll} onchange={setColour} />
        </div>
      </div>
    {:else if background.mode === 'gradient'}
      <div class="prop-row full-span">
        <span class="lbl">Gradient</span>
        <span class="hint-text">Edit in Display Panel → Gradient</span>
      </div>
    {:else if background.mode === 'image'}
      <div class="prop-row full-span">
        <span class="lbl">Image</span>
        <span class="hint-text">Image source — coming soon</span>
      </div>
    {/if}

  </div>
{/if}

<style>
  .bg-editor { display: flex; flex-direction: column; }

  .bg-editor :global(.property-grid) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .full-span { width: 100%; }

  .prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .lbl {
    color: #888;
    font-size: 11px;
    min-width: 44px;
    flex-shrink: 0;
  }

  .val {
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid #333;
    flex: 1;
    min-width: 0;
    font-family: inherit;
    outline: none;
    height: 26px;
  }

  .val:focus { border-color: #5B9BD5; }

  .color-input {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .mini-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #555;
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
  }

  .mini-swatch:hover { border-color: #5B9BD5; }

  .hint-text {
    color: #555;
    font-size: 10px;
    font-style: italic;
  }
</style>
