<script>
  let { show = false, onclose = () => {} } = $props();

  const sections = [
    { title: 'File', shortcuts: [
      ['Ctrl+N', 'New Panel'],
      ['Ctrl+O', 'Open Panel'],
      ['File menu', 'New/Open Component'],
      ['File menu', 'New/Open Device Profile'],
      ['Ctrl+S', 'Save'],
      ['Ctrl+Shift+S', 'Save As'],
      ['Ctrl+W', 'Close Tab'],
      ['Ctrl+,', 'Settings'],
    ]},
    { title: 'Edit', shortcuts: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Y', 'Redo'],
      ['Ctrl+X', 'Cut'],
      ['Ctrl+C', 'Copy'],
      ['Ctrl+V', 'Paste'],
      ['Ctrl+A', 'Select All'],
      ['Ctrl+D', 'Duplicate'],
      ['Ctrl+G', 'Group into container'],
      ['Ctrl+Shift+G', 'Ungroup container'],
      ['Delete', 'Delete selected'],
    ]},
    { title: 'View', shortcuts: [
      ['Ctrl++', 'Zoom In'],
      ['Ctrl+-', 'Zoom Out'],
      ['Ctrl+0', 'Fit to Window'],
      ['Ctrl+Shift+P', 'Zoom to Selection'],
      ['Ctrl+Scroll', 'Mouse wheel zoom'],
    ]},
    { title: 'Canvas', shortcuts: [
      ['Space+Drag', 'Pan canvas'],
      ['Middle Drag', 'Pan canvas'],
      ['Right Drag', 'Pan canvas'],
      ['Right Click', 'Context menu'],
    ]},
    { title: 'Components', shortcuts: [
      ['Click', 'Select'],
      ['Ctrl+Click', 'Toggle multi-select'],
      ['Drag', 'Move'],
      ['Shift+Arrow', 'Nudge by grid size'],
      ['Arrow keys', 'Nudge 1px'],
      ['Shift+Resize', 'Aspect ratio lock'],
      ['Corner outside', 'Rotate'],
      ['Shift+Rotate', 'Snap to 15\u00B0'],
    ]},
    { title: 'Guides', shortcuts: [
      ['Drag from ruler', 'Create guide'],
      ['Drag guide label', 'Move guide'],
      ['Click guide label', 'Select guide'],
      ['Delete', 'Remove selected guide'],
      ['Right-click guide', 'Remove guide'],
    ]},
  ];

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (show) handleKeyDown(e); }} />

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay-backdrop" onclick={handleBackdropClick}>
    <div class="overlay-panel">
      <div class="overlay-header">
        <span class="overlay-title">Keyboard Shortcuts</span>
        <button class="close-btn" onclick={onclose}>&times;</button>
      </div>
      <div class="overlay-body">
        {#each sections as section}
          <div class="section">
            <h3 class="section-title">{section.title}</h3>
            {#each section.shortcuts as [key, desc]}
              <div class="shortcut-row">
                <kbd class="key">{key}</kbd>
                <span class="desc">{desc}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-panel {
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 800px;
    max-height: 80vh;
    width: 90%;
    min-width: 500px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #444;
    flex-shrink: 0;
  }

  .overlay-title {
    font-size: 14px;
    color: #DDD;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .close-btn:hover { color: #FFF; }

  .overlay-body {
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px 24px;
    align-content: start;
  }

  .overlay-body::-webkit-scrollbar { width: 6px; }
  .overlay-body::-webkit-scrollbar-track { background: transparent; }
  .overlay-body::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

  .section {
    break-inside: avoid;
  }

  .section-title {
    font-size: 11px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 0;
  }

  .key {
    background: #1A1A1A;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 10px;
    color: #CCC;
    font-family: inherit;
    min-width: 50px;
    text-align: center;
  }

  .desc {
    color: #999;
    font-size: 11px;
    text-align: right;
  }
</style>
