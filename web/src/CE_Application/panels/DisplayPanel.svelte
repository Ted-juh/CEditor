<script>
  /**
   * Display Panel — bottom dock with mini displays/tools.
   * Tabs for: Colors, Gradient, Notepad, Viewer, Tools, Console.
   */
  import ColorChooser from '../components/ColorChooser.svelte';
  import ColorSettings from '../components/ColorSettings.svelte';
  import { activePanel, updatePanel } from '../stores/panels.js';

  let activeTab = $state('colors');

  // Color the user picked via the chooser (bands/hex input only)
  let userPickedColor = $state($activePanel?.bgColour ?? '333333');
  let userPickedAlpha = $state(1);
  let stepSize = $state(10);

  // Swatches: 2 rows x 12 columns = 24 slots
  let swatches = $state(Array(24).fill(null));

  // Called by the ColorChooser when the user interacts with bands/hex
  // hex is now AARRGGBB format
  function handleColorChange(hex) {
    if (hex.length >= 8) {
      userPickedAlpha = parseInt(hex.slice(0, 2), 16) / 255;
      userPickedColor = hex.slice(2, 8);
    } else {
      userPickedAlpha = 1;
      userPickedColor = hex.slice(0, 6);
    }
    const panel = $activePanel;
    if (panel) {
      updatePanel(panel.id, { bgColour: userPickedColor, modified: true });
    }
  }

  function handleSwatchClick(index) {
    if (swatches[index]) {
      handleColorChange('FF' + swatches[index]);
    } else {
      swatches[index] = userPickedColor;
    }
  }

  function handleSwatchDblClick(index) {
    swatches[index] = null;
  }

  function handleSwatchRightClick(index, e) {
    e.preventDefault();
    swatches[index] = userPickedColor;
  }

  const tabs = [
    { id: 'colors',   label: 'Colors' },
    { id: 'gradient', label: 'Gradient' },
    { id: 'notepad',  label: 'Notepad' },
    { id: 'viewer',   label: 'Viewer' },
    { id: 'tools',    label: 'Tools' },
    { id: 'console',  label: 'Console' },
  ];
</script>

<div class="display-panel">
  <div class="tab-bar">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === 'colors'}
      <div class="colors-layout">
        <div class="colors-preview">
          <ColorChooser
            color={userPickedColor}
            alpha={userPickedAlpha}
            {stepSize}
            onchange={handleColorChange}
          />
        </div>
        <div class="colors-sidebar">
          <div class="sidebar-settings">
            <ColorSettings
              color={userPickedColor}
              alpha={userPickedAlpha}
              bind:stepSize={stepSize}
              onApplyColor={handleColorChange}
            />
          </div>
          <div class="sidebar-swatches">
            <div class="swatches-grid">
              {#each swatches as swatch, i}
                <button
                  class="swatch"
                  class:empty={!swatch}
                  style={swatch ? `background: #${swatch}` : ''}
                  onclick={() => handleSwatchClick(i)}
                  ondblclick={() => handleSwatchDblClick(i)}
                  oncontextmenu={(e) => handleSwatchRightClick(i, e)}
                  title={swatch ? `#${swatch} — right-click to replace, double-click to clear` : 'Click to store current color'}
                ></button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if activeTab === 'gradient'}
      <div class="placeholder">Gradient Editor</div>
    {:else if activeTab === 'notepad'}
      <div class="placeholder">Notepad</div>
    {:else if activeTab === 'viewer'}
      <div class="placeholder">Picture Viewer</div>
    {:else if activeTab === 'tools'}
      <div class="placeholder">Tools</div>
    {:else if activeTab === 'console'}
      <div class="placeholder">Console Output</div>
    {/if}
  </div>
</div>

<style>
  .display-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
  }

  .tab-bar {
    display: flex;
    gap: 1px;
    background: #1A1A1A;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .tab {
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    padding: 4px 10px;
    cursor: pointer;
    border-top: 2px solid transparent;
    font-family: inherit;
    transition: all 0.1s;
  }

  .tab:hover {
    color: #CCC;
    background: #2A2A2A;
  }

  .tab.active {
    color: #DDD;
    background: #2D2D2D;
    border-top-color: #5B9BD5;
  }

  .tab-content {
    flex: 1;
    overflow: auto;
  }

  .colors-layout {
    display: flex;
    height: 100%;
  }

  .colors-preview {
    width: 75%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .colors-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sidebar-settings {
    flex: 3;
    overflow: auto;
  }

  .sidebar-swatches {
    flex: 1;
    border-top: 1px solid #333;
    padding: 4px;
    display: flex;
    align-items: center;
  }

  .swatches-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 2px;
    width: 100%;
  }

  .swatch {
    aspect-ratio: 1;
    border: 1px solid #333;
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    transition: border-color 0.1s;
  }

  .swatch:hover {
    border-color: #5B9BD5;
  }

  .swatch.empty {
    background: #333;
    border-style: dashed;
  }

  .swatch.empty:hover {
    border-color: #5B9BD5;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #444;
    font-size: 12px;
  }
</style>
