<script>
  import { get } from 'svelte/store';
  import { addPanel, closePanel, activePanelId, saveActivePanel, saveActivePanelAs, openPanelFromFile } from '../stores/panels.js';
  import { addControl } from '../stores/controls.js';
  import { closeApplication } from '../bridge/bridge.js';

  const menus = {
    File: [
      { label: 'New Panel',  shortcut: 'Ctrl+N', action: () => addPanel() },
      { label: 'Open Panel', shortcut: 'Ctrl+O', action: () => openPanelFromFile() },
      { type: 'separator' },
      { label: 'Save',       shortcut: 'Ctrl+S', action: () => saveActivePanel() },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => saveActivePanelAs() },
      { type: 'separator' },
      { label: 'Close Panel', shortcut: 'Ctrl+W', action: () => {
        const id = get(activePanelId);
        if (id != null) closePanel(id);
      }},
      { type: 'separator' },
      { label: 'Close Program', shortcut: 'Alt+F4', action: () => closeApplication() },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => {} },
      { label: 'Redo', shortcut: 'Ctrl+Y', action: () => {} },
      { type: 'separator' },
      { label: 'Cut',   shortcut: 'Ctrl+X', action: () => {} },
      { label: 'Copy',  shortcut: 'Ctrl+C', action: () => {} },
      { label: 'Paste', shortcut: 'Ctrl+V', action: () => {} },
      { type: 'separator' },
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => {} },
    ],
    View: [
      { label: 'Zoom In',  shortcut: 'Ctrl++', action: () => {} },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => {} },
      { label: 'Fit to Window', shortcut: 'Ctrl+0', action: () => {} },
      { type: 'separator' },
      { label: 'Toggle Grid', action: () => {} },
      { label: 'Toggle Snap', action: () => {} },
    ],
    Insert: [
      { label: 'Background', action: () => addControl('Background') },
      { label: 'Label',      action: () => addControl('Label') },
      { label: 'Button',     action: () => addControl('Button') },
      { label: 'Container',  action: () => addControl('Container') },
    ],
    Panel: [
      { label: 'Panel Properties...', action: () => {} },
      { label: 'Export Settings...',   action: () => {} },
    ],
    Build: [
      { label: 'Build VST3',       action: () => {} },
      { label: 'Build Standalone',  action: () => {} },
      { type: 'separator' },
      { label: 'Build Settings...', action: () => {} },
    ],
    Help: [
      { label: 'Documentation', action: () => {} },
      { label: 'About CEditor', action: () => {} },
    ],
  };

  const menuNames = Object.keys(menus);
  let openMenu = $state(null);

  function toggleMenu(name) {
    openMenu = openMenu === name ? null : name;
  }

  function handleItemClick(item) {
    if (item.action) item.action();
    openMenu = null;
  }

  function handleWindowClick(e) {
    if (openMenu && !e.target.closest('.menubar')) {
      openMenu = null;
    }
  }

  function handleMenuHover(name) {
    if (openMenu !== null) {
      openMenu = name;
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<nav class="menubar">
  {#each menuNames as name}
    <div class="menu-wrapper">
      <button
        class="menu-item"
        class:active={openMenu === name}
        onclick={() => toggleMenu(name)}
        onmouseenter={() => handleMenuHover(name)}
      >
        {name}
      </button>

      {#if openMenu === name}
        <div class="dropdown">
          {#each menus[name] as item}
            {#if item.type === 'separator'}
              <div class="dropdown-separator"></div>
            {:else}
              <button class="dropdown-item" onclick={() => handleItemClick(item)}>
                <span class="item-label">{item.label}</span>
                {#if item.shortcut}
                  <span class="item-shortcut">{item.shortcut}</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .menubar {
    display: flex;
    align-items: center;
    height: 100%;
    background: #2D2D2D;
    border-bottom: 1px solid #1A1A1A;
    padding: 0 4px 0 0;
    gap: 1px;
    position: relative;
    z-index: 100;
  }

  .menu-wrapper {
    position: relative;
  }

  .menu-item {
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 3px;
    font-family: inherit;
  }

  .menu-item:hover {
    background: #3D3D3D;
    color: #FFF;
  }

  .menu-item.active {
    background: #094771;
    color: #FFF;
  }

  /* Dropdown */
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 200px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 200;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .dropdown-item:hover {
    background: #094771;
    color: #FFF;
  }

  .item-label {
    flex: 1;
  }

  .item-shortcut {
    color: #777;
    font-size: 11px;
    margin-left: 24px;
    flex-shrink: 0;
  }

  .dropdown-item:hover .item-shortcut {
    color: #AAD;
  }

  .dropdown-separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }
</style>
