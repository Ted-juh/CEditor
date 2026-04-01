<script>
  import { panels, activePanelId, updatePanel } from '../stores/panels.js';

  let { tabId = '' } = $props();

  let panel = $derived($panels.find(p => p.id === $activePanelId) ?? null);

  function handlePropChange(prop, e) {
    if (!panel) return;
    let value = e.target.value;
    const num = Number(value);
    if (!isNaN(num) && value !== '') value = num;
    updatePanel(panel.id, { [prop]: value });
  }

  function handleToggle(prop) {
    if (!panel) return;
    updatePanel(panel.id, { [prop]: !panel[prop] });
  }
</script>

{#if panel}
  {#if tabId === 'identity'}
    <div class="prop-card">
      <div class="prop-row">
        <span class="lbl">Name</span>
        <input class="val" type="text" value={panel.name}
               onchange={(e) => handlePropChange('name', e)} />
      </div>
      <div class="prop-row-pair">
        <div class="prop-row half">
          <span class="lbl">Width</span>
          <input class="val" type="number" value={panel.width}
                 onchange={(e) => handlePropChange('width', e)} />
        </div>
        <div class="prop-row half">
          <span class="lbl">Height</span>
          <input class="val" type="number" value={panel.height}
                 onchange={(e) => handlePropChange('height', e)} />
        </div>
      </div>
    </div>
  {:else if tabId === 'background'}
    <div class="prop-card">
      <div class="prop-row">
        <span class="lbl">Mode</span>
        <select class="val" value={panel.bgMode}
                onchange={(e) => handlePropChange('bgMode', e)}>
          <option value="solid">Solid</option>
          <option value="gradient">Gradient</option>
          <option value="image">Image</option>
        </select>
      </div>
      <div class="prop-row">
        <span class="lbl">Colour</span>
        <div class="color-input">
          <div class="mini-swatch" style="background:#{panel.bgColour}"></div>
          <input class="val" type="text" value={panel.bgColour}
                 onchange={(e) => handlePropChange('bgColour', e)} />
        </div>
      </div>
    </div>
  {:else if tabId === 'grid'}
    <div class="prop-card">
      <div class="prop-row">
        <span class="lbl">Show Grid</span>
        <button class="toggle-val" class:on={panel.gridEnabled}
                onclick={() => handleToggle('gridEnabled')}>
          {panel.gridEnabled ? 'On' : 'Off'}
        </button>
      </div>
      <div class="prop-row">
        <span class="lbl">Grid Size</span>
        <input class="val" type="number" value={panel.gridSize}
               onchange={(e) => handlePropChange('gridSize', e)} />
      </div>
      <div class="prop-row">
        <span class="lbl">Snap</span>
        <button class="toggle-val" class:on={panel.snapToGrid}
                onclick={() => handleToggle('snapToGrid')}>
          {panel.snapToGrid ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  {:else if tabId === 'export'}
    <div class="placeholder">Export settings (VST3, Standalone, etc.)</div>
  {:else}
    <div class="placeholder">Panel: {tabId}</div>
  {/if}
{/if}

<style>
  .prop-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 3px;
  }

  .prop-row:hover {
    background: #2A2A2A;
  }

  .prop-row-pair {
    display: flex;
    gap: 4px;
  }

  .prop-row.half {
    flex: 1;
  }

  .lbl {
    color: #888;
    font-size: 11px;
    min-width: 54px;
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
  }

  .val:focus {
    border-color: #5B9BD5;
  }

  select.val {
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    padding-right: 20px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }

  .color-input {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .mini-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #555;
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle-val {
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    min-width: 40px;
    text-align: center;
  }

  .toggle-val.on {
    background: #094771;
    border-color: #0B6EB5;
    color: #DDD;
  }

  .toggle-val:hover {
    border-color: #5B9BD5;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #444;
    font-size: 12px;
  }
</style>
